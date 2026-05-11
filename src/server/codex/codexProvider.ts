import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import type {
  ApprovalRequest,
  AttachmentInput,
  CodexThreadMessage,
  CodexThreadSummary,
  GatewayTask,
  TaskMessage
} from "../../shared/types.js";
import type { ConfigStore } from "../configStore.js";
import type { GatewayEventBus } from "../events.js";
import type { Logger } from "../logger.js";
import type { StateStore } from "../stateStore.js";
import { LOG_DIR } from "../paths.js";
import { ensureDir } from "../utils/files.js";
import { nowIso } from "../utils/time.js";
import {
  CodexAppServerClient,
  type CodexAppServerEvent,
  type CodexAppServerRequest
} from "./appServerClient.js";
import { CodexSessionScanner, type CodexSessionAttachmentContent } from "./sessionScanner.js";
import type { AgentProvider, CreateAgentSessionInput } from "../providers/types.js";
import {
  codexSessionIdentity,
  DEFAULT_CODEX_PROVIDER_ID,
  nativeCodexSessionId,
  normalizeCodexSessionKey
} from "../providers/sessionKeys.js";

type ThreadRecord = CodexThreadSummary & {
  createdByGateway?: boolean;
};

export class CodexProvider implements AgentProvider {
  readonly id = DEFAULT_CODEX_PROVIDER_ID;
  readonly type = "codex" as const;

  private readonly scanner = new CodexSessionScanner();
  private readonly sessionOverlays = new Map<string, ThreadRecord>();
  private readonly knownThreads = new Map<string, ThreadRecord>();
  private readonly activeTurns = new Map<string, { providerThreadId: string; turnId?: string }>();
  private readonly runningTasks = new Map<string, GatewayTask>();
  private readonly approvalWaiters = new Map<
    string,
    {
      resolve: (approved: boolean) => void;
      task: GatewayTask;
      request: CodexAppServerRequest;
      approval: ApprovalRequest;
      timer: NodeJS.Timeout;
    }
  >();

  constructor(
    private readonly configStore: ConfigStore,
    private readonly events: GatewayEventBus,
    private readonly logger: Logger,
    private readonly appServer: CodexAppServerClient,
    private readonly stateStore: StateStore
  ) {}

  async init(): Promise<void> {
    for (const thread of this.stateStore.getSessionOverlays()) {
      const normalized = normalizeThreadRecord(thread);
      this.sessionOverlays.set(normalized.sessionKey, {
        ...normalized,
        createdByGateway: true
      });
    }
    await this.appServer.ensureStarted();
    this.appServer.onRequest((request) => this.handleAppServerRequest(request));
    const refreshedThreads = await this.refreshThreads();
    await this.migrateGatewayAliases(refreshedThreads);
  }

  async refreshThreads(): Promise<CodexThreadSummary[]> {
    const fromAppServer = await this.listAppServerThreads();
    const historical = await this.scanner.scan();
    const codexThreads = mergeThreads(historical);
    const overlays = mergeThreads([...fromAppServer, ...this.sessionOverlays.values()]);
    const merged = applySessionOverlays(codexThreads, overlays);
    this.knownThreads.clear();
    for (const thread of merged) {
      this.knownThreads.set(thread.id, thread);
      this.knownThreads.set(thread.sessionKey, thread);
      this.knownThreads.set(thread.nativeSessionId, thread);
      if (thread.providerThreadId) {
        this.knownThreads.set(thread.providerThreadId, thread);
      }
    }
    this.events.publish({ type: "sessions.updated", sessions: merged });
    this.events.publish({ type: "threads.updated", threads: merged });
    return merged;
  }

  async listSessions(): Promise<CodexThreadSummary[]> {
    return this.refreshThreads();
  }

  async createSession(input: CreateAgentSessionInput): Promise<CodexThreadSummary> {
    return this.createThread(input.title, input.cwd, input.environmentId);
  }

  async createThread(title: string, cwd?: string, environmentId?: string): Promise<CodexThreadSummary> {
    const workingDir = this.resolveCwd(cwd);
    const providerThreadId = await this.createProviderThread(workingDir);
    if (!providerThreadId) {
      throw new Error("Codex did not return a native session id.");
    }
    const thread: ThreadRecord = {
      ...codexSessionIdentity(providerThreadId),
      environmentId: inputEnvironmentId(environmentId),
      title,
      cwd: workingDir,
      source: "gateway-overlay",
      status: "idle",
      providerThreadId,
      provider: "codex-app-server",
      lastActivityAt: nowIso(),
      createdByGateway: true
    };
    this.sessionOverlays.set(thread.sessionKey, thread);
    await this.stateStore.upsertSessionOverlay(thread);
    void this.appServer.request("thread/name/set", {
      threadId: providerThreadId,
      name: title
    }).catch((error) => {
      this.logger.debug("Failed to set Codex app-server thread name", {
        scope: "codex.app-server",
        threadId: providerThreadId,
        sessionKey: thread.sessionKey,
        data: String(error)
      });
    });
    await this.refreshThreads();
    return structuredClone(thread);
  }

  async getSessionMessages(sessionKey: string, limit = 200): Promise<CodexThreadMessage[]> {
    const refreshedThreads = await this.refreshThreads();
    const thread = this.resolveThreadRecord(sessionKey, refreshedThreads);
    if (!thread) {
      return [];
    }
    if (thread.sessionFile || thread.source === "provider-history") {
      return this.scanner.readMessages(thread, limit);
    }
    if (thread.providerThreadId && thread.providerThreadId !== thread.id) {
      const providerThread = findHistoricalProviderThread(
        refreshedThreads,
        thread.providerThreadId,
        thread.id
      );
      if (providerThread?.sessionFile || providerThread?.source === "provider-history") {
        return this.scanner.readMessages(providerThread, limit);
      }
    }
    return [];
  }

  resolveThreadId(threadId: string): string {
    return this.resolveNativeSessionId(threadId);
  }

  resolveSessionKey(value: string): string {
    const normalized = normalizeCodexSessionKey(value);
    if (normalized) {
      return normalized;
    }
    const thread = this.resolveThreadRecord(value);
    return thread?.sessionKey ?? value;
  }

  resolveNativeSessionId(value: string): string {
    const nativeId = nativeCodexSessionId(value);
    if (nativeId) {
      return nativeId;
    }
    const thread = this.resolveThreadRecord(value);
    return thread ? canonicalThreadId(thread) : value;
  }

  async getAttachmentContent(attachmentId: string): Promise<CodexSessionAttachmentContent | undefined> {
    return this.scanner.readAttachmentContent(attachmentId);
  }

  async approveTask(taskId: string, approved: boolean): Promise<GatewayTask> {
    const waiter = this.approvalWaiters.get(taskId);
    if (!waiter) {
      throw new Error(`No pending approval for task: ${taskId}`);
    }
    clearTimeout(waiter.timer);
    this.approvalWaiters.delete(taskId);
    waiter.resolve(approved);
    const updated: GatewayTask = {
      ...waiter.task,
      status: approved ? "running" : "failed",
      currentStep: approved ? "Approval accepted" : "Approval rejected",
      updatedAt: nowIso(),
      error: approved ? undefined : "Approval rejected",
      approval: undefined
    };
    this.runningTasks.set(taskId, updated);
    this.events.publish({ type: "task.updated", task: updated });
    return updated;
  }

  async cancelTask(task: GatewayTask): Promise<void> {
    const active = this.activeTurns.get(task.id);
    if (!active?.turnId) {
      return;
    }
    try {
      await this.appServer.request("turn/interrupt", {
        threadId: active.providerThreadId,
        turnId: active.turnId
      });
    } catch (error) {
      this.logger.warn("Failed to interrupt Codex turn", {
        scope: "codex.app-server",
        taskId: task.id,
        environmentId: task.environmentId,
        providerId: this.id,
        providerType: this.type,
        sessionKey: task.sessionKey,
        threadId: task.threadId,
        data: String(error)
      });
    }
  }

  async runTask(task: GatewayTask): Promise<GatewayTask> {
    await ensureDir(LOG_DIR);
    const logPath = path.join(LOG_DIR, `${task.id}.log`);
    const started: GatewayTask = {
      ...task,
      status: "running",
      startedAt: nowIso(),
      updatedAt: nowIso(),
      currentStep: "Starting Codex",
      rawLogPath: logPath
    };
    this.events.publish({ type: "task.updated", task: started });
    this.logger.info("Task started", {
      scope: "codex",
      taskId: task.id,
      environmentId: task.environmentId,
      providerId: this.id,
      providerType: this.type,
      channelType: task.channelType,
      channelBotId: task.channelBotId,
      botId: task.botId,
      sessionKey: task.sessionKey,
      threadId: task.threadId
    });

    try {
      const viaAppServer = await this.runTaskViaAppServer(started, logPath);
      if (viaAppServer) {
        await this.refreshThreads();
        return viaAppServer;
      }
      this.logger.warn("Falling back to codex exec", {
        scope: "codex",
        taskId: task.id,
        environmentId: task.environmentId,
        providerId: this.id,
        providerType: this.type,
        sessionKey: task.sessionKey,
        threadId: task.threadId
      });
      return await this.runTaskViaExec(started, logPath);
    } catch (error) {
      const failed: GatewayTask = {
        ...started,
        status: "failed",
        updatedAt: nowIso(),
        completedAt: nowIso(),
        currentStep: "Task failed",
        error: String(error)
      };
      this.events.publish({ type: "task.updated", task: failed });
      this.logger.error("Task failed", {
        scope: "codex",
        taskId: task.id,
        environmentId: task.environmentId,
        providerId: this.id,
        providerType: this.type,
        sessionKey: task.sessionKey,
        threadId: task.threadId,
        data: String(error)
      });
      return failed;
    } finally {
      await cleanupAttachments(task.attachments);
    }
  }

  taskFromMessage(message: TaskMessage): GatewayTask {
    return {
      id: message.id,
      environmentId: message.environmentId,
      providerId: this.id,
      providerType: this.type,
      channelType: message.channelType,
      channelBotId: message.channelBotId,
      botId: message.botId,
      sessionKey: message.sessionKey,
      threadId: message.threadId,
      source: message.source,
      status: "queued",
      text: message.text,
      attachments: message.attachments,
      createdAt: message.createdAt,
      updatedAt: nowIso(),
      feishu: message.feishu
    };
  }

  private async createProviderThread(cwd: string): Promise<string | undefined> {
    try {
      await this.appServer.ensureStarted();
      const response = (await this.appServer.request("thread/start", {
        cwd,
        ephemeral: false
      })) as { thread?: { id?: string } };
      return response.thread?.id;
    } catch (error) {
      this.logger.warn("Failed to create Codex app-server thread", {
        scope: "codex.app-server",
        providerId: this.id,
        providerType: this.type,
        data: String(error)
      });
      return undefined;
    }
  }

  private async listAppServerThreads(): Promise<CodexThreadSummary[]> {
    if (!this.configStore.get().codex.preferAppServer) {
      return [];
    }
    try {
      await this.appServer.ensureStarted();
      const response = (await this.appServer.request("thread/list", {})) as {
        data?: Array<Record<string, unknown>>;
      };
      return (response.data ?? [])
        .map((thread) => threadSummaryFromAppServer(thread))
        .filter((thread): thread is CodexThreadSummary => Boolean(thread));
    } catch (error) {
      this.logger.warn("Failed to list Codex app-server threads", {
        scope: "codex.app-server",
        providerId: this.id,
        providerType: this.type,
        data: String(error)
      });
      return [];
    }
  }

  private async runTaskViaAppServer(
    task: GatewayTask,
    logPath: string
  ): Promise<GatewayTask | undefined> {
    if (!this.configStore.get().codex.preferAppServer) {
      return undefined;
    }
    const thread = this.resolveThreadRecord(task.sessionKey);
    let providerThreadId = providerId(thread?.providerThreadId) ?? providerId(task.threadId);
    const cwd = this.resolveCwd(thread?.cwd);

    try {
      await this.appServer.ensureStarted();
      if (!providerThreadId) {
        return undefined;
      }
      await this.resumeProviderThread(providerThreadId, cwd);
      if (thread) {
        const updatedThread: ThreadRecord = {
          ...thread,
          providerThreadId,
          provider: "codex-app-server",
          status: "running",
          lastActivityAt: nowIso()
        };
        this.sessionOverlays.set(thread.sessionKey, updatedThread);
        await this.stateStore.upsertSessionOverlay(updatedThread);
      }

      const prompt = buildPrompt(task.text, task.attachments);
      let summary = "";
      let currentTask: GatewayTask = {
        ...task,
        status: "running" as const,
        currentStep: "Codex running",
        updatedAt: nowIso()
      };
      this.events.publish({ type: "task.updated", task: currentTask });

      try {
        this.runningTasks.set(task.id, currentTask);
        let response: { turn?: { id?: string } };
        try {
          response = (await this.appServer.request(
            "turn/start",
            {
              threadId: providerThreadId,
              input: toUserInput(prompt, task.attachments),
              cwd
            },
            30000
          )) as { turn?: { id?: string } };
        } catch (error) {
          if (!isThreadNotFoundError(error)) {
            throw error;
          }
          await this.resumeProviderThread(providerThreadId, cwd, true);
          response = (await this.appServer.request(
            "turn/start",
            {
              threadId: providerThreadId,
              input: toUserInput(prompt, task.attachments),
              cwd
            },
            30000
          )) as { turn?: { id?: string } };
        }
        const turnId = response.turn?.id;
        this.activeTurns.set(task.id, { providerThreadId, turnId });
        const completed = await waitForTurnCompletion(
          this.appServer,
          providerThreadId,
          turnId,
          (event) => {
            void appendLog(logPath, `${JSON.stringify(event)}\n`);
            const delta = extractStreamingDelta(event);
            if (delta) {
              summary = appendSummary(summary, delta);
            }
            const next = taskFromAppServerEvent(currentTask, event, summary);
            if (next) {
              currentTask = next;
              this.runningTasks.set(task.id, currentTask);
              this.events.publish({ type: "task.updated", task: currentTask });
            }
          }
        );
        const finalTask: GatewayTask = {
          ...currentTask,
          status: completed.status,
          summary: summary || currentTask.summary,
          error: completed.error,
          currentStep: completed.status === "completed" ? "Task completed" : "Task failed",
          updatedAt: nowIso(),
          completedAt: nowIso()
        };
        this.runningTasks.set(task.id, finalTask);
        this.events.publish({ type: "task.updated", task: finalTask });
        if (thread) {
          const completedThread: ThreadRecord = {
            ...thread,
            providerThreadId,
            provider: "codex-app-server",
            status: completed.status === "completed" ? "idle" : "error",
            lastActivityAt: nowIso()
          };
          this.sessionOverlays.set(thread.sessionKey, completedThread);
          await this.stateStore.upsertSessionOverlay(completedThread);
        }
        this.logger.info(`Task ${finalTask.status}`, {
          scope: "codex.app-server",
          taskId: task.id,
          environmentId: task.environmentId,
          providerId: this.id,
          providerType: this.type,
          channelType: task.channelType,
          channelBotId: task.channelBotId,
          botId: task.botId,
          sessionKey: task.sessionKey,
          threadId: providerThreadId
        });
        return finalTask;
      } finally {
        this.activeTurns.delete(task.id);
        this.runningTasks.delete(task.id);
      }
    } catch (error) {
      this.logger.warn("Codex app-server task failed", {
        scope: "codex.app-server",
        taskId: task.id,
        environmentId: task.environmentId,
        providerId: this.id,
        providerType: this.type,
        sessionKey: task.sessionKey,
        threadId: task.threadId,
        data: String(error)
      });
      return undefined;
    }
  }

  private async runTaskViaExec(task: GatewayTask, logPath: string): Promise<GatewayTask> {
    try {
      const thread = this.resolveThreadRecord(task.sessionKey);
      const cwd = this.resolveCwd(thread?.cwd);
      const prompt = buildPrompt(task.text, task.attachments);
      const nativeThreadId = this.resolveNativeSessionId(task.sessionKey);
      const args = buildCodexExecArgs(cwd, nativeThreadId, prompt);
      const child = execa(this.configStore.get().codex.command, args, {
        cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        reject: false
      });

      let summary = "";
      child.stdout?.on("data", async (chunk) => {
        const text = chunk.toString();
        summary = parseJsonEvents(text, summary);
        await appendLog(logPath, text);
        this.events.publish({
          type: "task.updated",
          task: {
            ...task,
            status: "running",
            updatedAt: nowIso(),
            currentStep: inferStep(text),
            summary: summary || undefined
          }
        });
      });

      child.stderr?.on("data", async (chunk) => {
        const text = chunk.toString();
        await appendLog(logPath, text);
        this.logger.warn(text, {
          scope: "codex.exec",
          taskId: task.id,
          environmentId: task.environmentId,
          providerId: this.id,
          providerType: this.type,
          sessionKey: task.sessionKey,
          threadId: task.threadId
        });
      });

      const result = await child;
      const completed: GatewayTask = {
        ...task,
        status: result.exitCode === 0 ? "completed" : "failed",
        updatedAt: nowIso(),
        completedAt: nowIso(),
        currentStep: result.exitCode === 0 ? "Task completed" : "Task failed",
        summary: summary || result.stdout?.slice(-2000) || undefined,
        error: result.exitCode === 0 ? undefined : result.stderr?.slice(-2000)
      };
      this.events.publish({ type: "task.updated", task: completed });
      this.logger.info(`Task ${completed.status}`, {
        scope: "codex",
        taskId: task.id,
        environmentId: task.environmentId,
        providerId: this.id,
        providerType: this.type,
        channelType: task.channelType,
        channelBotId: task.channelBotId,
        botId: task.botId,
        sessionKey: task.sessionKey,
        threadId: task.threadId
      });
      await this.refreshThreads();
      return completed;
    } catch (error) {
      const failed: GatewayTask = {
        ...task,
        status: "failed",
        updatedAt: nowIso(),
        completedAt: nowIso(),
        currentStep: "Task failed",
        error: String(error)
      };
      this.events.publish({ type: "task.updated", task: failed });
      this.logger.error("Task failed", {
        scope: "codex",
        taskId: task.id,
        environmentId: task.environmentId,
        providerId: this.id,
        providerType: this.type,
        sessionKey: task.sessionKey,
        threadId: task.threadId,
        data: String(error)
      });
      return failed;
    }
  }

  private async handleAppServerRequest(request: CodexAppServerRequest): Promise<unknown> {
    const params = request.params as Record<string, unknown> | undefined;
    const providerThreadId =
      stringValue(params?.threadId) ?? stringValue(params?.conversationId);
    const activeEntry = providerThreadId
      ? [...this.activeTurns.entries()].find(([, value]) => value.providerThreadId === providerThreadId)
      : undefined;
    const taskId = activeEntry?.[0];
    if (!taskId) {
      return autoResponseForServerRequest(request.method, request.params);
    }
    const runningTask = this.runningTasks.get(taskId);
    const sessionKey =
      runningTask?.sessionKey ?? (providerThreadId ? this.resolveSessionKey(providerThreadId) : taskId);
    const threadId =
      runningTask?.threadId ?? (providerThreadId ? this.resolveNativeSessionId(providerThreadId) : taskId);
    const approval = buildApprovalRequest(
      request,
      taskId,
      sessionKey,
      providerThreadId,
      runningTask?.environmentId
    );
    const waitingTask: GatewayTask = runningTask ?? {
      id: taskId,
      environmentId: approval.environmentId ?? "default",
      providerId: this.id,
      providerType: this.type,
      botId: undefined,
      sessionKey,
      threadId,
      source: "web",
      status: "waiting_approval",
      text: approval.title,
      attachments: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      currentStep: "Waiting approval",
      approval
    };

    const displayTask: GatewayTask = {
      ...waitingTask,
      status: "waiting_approval",
      currentStep: "Waiting approval",
      updatedAt: nowIso(),
      approval
    };
    this.runningTasks.set(taskId, displayTask);
    this.events.publish({ type: "task.updated", task: displayTask });

    const approved = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.approvalWaiters.delete(taskId);
        resolve(true);
      }, 10 * 60 * 1000);
      this.approvalWaiters.set(taskId, {
        resolve,
        task: displayTask,
        request,
        approval,
        timer
      });
    });
    const resumed = this.runningTasks.get(taskId);
    if (resumed) {
      this.runningTasks.set(taskId, {
        ...resumed,
        status: approved ? "running" : "failed",
        currentStep: approved ? "Approval accepted" : "Approval rejected",
        error: approved ? undefined : "Approval rejected",
        updatedAt: nowIso(),
        approval: undefined
      });
    }
    return approvalResponseForServerRequest(request.method, approved, request.params);
  }

  private resolveCwd(cwd?: string): string {
    return path.resolve(cwd?.trim() || this.configStore.get().defaultCwd?.trim() || process.cwd());
  }

  private async resumeProviderThread(
    providerThreadId: string,
    cwd: string,
    required = false
  ): Promise<void> {
    try {
      await this.appServer.request("thread/resume", {
        threadId: providerThreadId,
        cwd
      });
    } catch (error) {
      this.logger.warn("Failed to resume Codex session", {
        scope: "codex.app-server",
        providerId: this.id,
        providerType: this.type,
        sessionKey: normalizeCodexSessionKey(providerThreadId),
        threadId: providerThreadId,
        data: String(error)
      });
      if (required) {
        throw error;
      }
    }
  }

  private resolveThreadRecord(value: string, candidates?: CodexThreadSummary[]): ThreadRecord | undefined {
    const sessionKey = normalizeCodexSessionKey(value);
    const nativeSessionId = nativeCodexSessionId(value);
    const direct = sessionKey ? this.sessionOverlays.get(sessionKey) : this.sessionOverlays.get(value);
    if (direct) {
      return direct;
    }
    const known =
      (sessionKey ? this.knownThreads.get(sessionKey) : undefined) ??
      (nativeSessionId ? this.knownThreads.get(nativeSessionId) : undefined) ??
      this.knownThreads.get(value);
    if (known) {
      return known;
    }
    const list = candidates ?? [];
    const candidate = list.find(
      (thread) =>
        thread.sessionKey === sessionKey ||
        thread.id === nativeSessionId ||
        thread.nativeSessionId === nativeSessionId ||
        thread.providerThreadId === nativeSessionId
    );
    if (candidate) {
      return candidate;
    }
    for (const thread of this.sessionOverlays.values()) {
      if (
        thread.sessionKey === sessionKey ||
        thread.id === nativeSessionId ||
        thread.nativeSessionId === nativeSessionId ||
        thread.providerThreadId === nativeSessionId
      ) {
        return thread;
      }
    }
    if (!nativeSessionId) {
      return undefined;
    }
    return {
      ...codexSessionIdentity(nativeSessionId),
      environmentId: "default",
      title: `Codex ${nativeSessionId.slice(0, 8)}`,
      source: "provider-history",
      status: "unknown",
      provider: "codex-app-server"
    };
  }

  private async migrateGatewayAliases(threads: CodexThreadSummary[]): Promise<void> {
    const aliases = new Map<string, string>();
    const canonicalThreads = new Map<string, ThreadRecord>();
    const originalThreads = [...this.sessionOverlays.values()];
    for (const thread of this.sessionOverlays.values()) {
      const canonicalId = canonicalThreadId(thread);
      const canonicalSessionKey = normalizeCodexSessionKey(canonicalId) ?? codexSessionIdentity(canonicalId).sessionKey;
      if (canonicalSessionKey !== thread.sessionKey) {
        aliases.set(thread.sessionKey, canonicalSessionKey);
        aliases.set(thread.id, canonicalSessionKey);
      }
      const providerThread = threads.find(
        (candidate) =>
          candidate.id === canonicalId ||
          candidate.sessionKey === canonicalSessionKey ||
          candidate.providerThreadId === canonicalId ||
          (thread.providerThreadId && candidate.id === thread.providerThreadId)
      );
      const migrated: ThreadRecord = {
        ...thread,
        ...codexSessionIdentity(canonicalId),
        id: canonicalId,
        title: providerThread?.title ?? thread.title,
        cwd: normalizeCwd(providerThread?.cwd ?? thread.cwd),
        providerThreadId: providerId(canonicalId) ?? providerId(providerThread?.providerThreadId),
        provider: thread.provider ?? providerThread?.provider,
        status: thread.status === "running" ? "idle" : thread.status,
        sessionFile: providerThread?.sessionFile ?? thread.sessionFile,
        firstMessage: providerThread?.firstMessage ?? thread.firstMessage,
        lastMessage: providerThread?.lastMessage ?? thread.lastMessage,
        lastActivityAt: maxIso(thread.lastActivityAt, providerThread?.lastActivityAt),
        createdByGateway: true
      };
      const existing = canonicalThreads.get(migrated.sessionKey);
      canonicalThreads.set(migrated.sessionKey, existing ? mergeThreadPair(existing, migrated) : migrated);
    }
    const changed = aliases.size > 0 || gatewayThreadSnapshotsDiffer(originalThreads, [...canonicalThreads.values()]);
    if (!changed) {
      return;
    }
    this.sessionOverlays.clear();
    for (const thread of canonicalThreads.values()) {
      this.sessionOverlays.set(thread.sessionKey, thread);
    }
    await this.stateStore.replaceSessionOverlays([...canonicalThreads.values()]);
    if (aliases.size > 0) {
      await this.configStore.replaceSessionBindings(aliases);
    }
    this.logger.info("Migrated gateway session aliases to Codex session ids", {
      scope: "codex",
      providerId: this.id,
      providerType: this.type,
      data: Object.fromEntries(aliases)
    });
  }
}

function buildCodexExecArgs(cwd: string, threadId: string, prompt: string): string[] {
  const args = ["exec", "--json", "--skip-git-repo-check", "-C", cwd];
  args.push("resume", threadId, prompt);
  return args;
}

function buildPrompt(text: string, attachments: AttachmentInput[]): string {
  if (attachments.length === 0) {
    return text;
  }
  const attachmentBlock = attachments
    .map((attachment) => {
      const localPath = attachment.localPath ? ` local_path=${attachment.localPath}` : "";
      return `- ${attachment.name}${localPath}`;
    })
    .join("\n");
  return `${text}\n\nAttached files:\n${attachmentBlock}`;
}

function toUserInput(text: string, attachments: AttachmentInput[]): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = [
    {
      type: "text",
      text,
      text_elements: []
    }
  ];
  for (const attachment of attachments) {
    if (attachment.localPath && attachment.mimeType?.startsWith("image/")) {
      input.push({
        type: "localImage",
        path: attachment.localPath
      });
    }
  }
  return input;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isThreadNotFoundError(error: unknown): boolean {
  return String(error).toLowerCase().includes("thread not found");
}

function parseJsonEvents(chunk: string, previous: string): string {
  let summary = previous;
  for (const line of chunk.split("\n")) {
    if (!line.trim().startsWith("{")) {
      continue;
    }
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const candidate = extractText(event);
      if (candidate) {
        summary = appendSummary(summary, candidate);
      }
    } catch {
      // Ignore partial JSON chunks; raw log still has the source output.
    }
  }
  return summary;
}

function inferStep(text: string): string {
  if (text.includes("command") || text.includes("exec")) {
    return "Running command";
  }
  if (text.includes("patch") || text.includes("diff")) {
    return "Updating diff";
  }
  if (text.includes("approval")) {
    return "Waiting approval";
  }
  if (text.includes("reasoning")) {
    return "Thinking";
  }
  return "Codex running";
}

function extractText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["message", "text", "content", "summary"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().slice(-2000);
    }
  }
  for (const candidate of Object.values(record)) {
    const nested = extractText(candidate);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function appendSummary(previous: string, delta: string): string {
  const next = `${previous}${delta}`;
  return next.length > 12000 ? next.slice(-12000) : next;
}

async function appendLog(file: string, text: string): Promise<void> {
  await fs.appendFile(file, text, "utf8");
}

async function cleanupAttachments(attachments: AttachmentInput[]): Promise<void> {
  const dirs = new Set(
    attachments
      .map((attachment) => attachment.localPath)
      .filter((localPath): localPath is string => Boolean(localPath))
      .map((localPath) => path.dirname(localPath))
  );
  await Promise.all(
    [...dirs].map((dir) =>
      fs.rm(dir, { recursive: true, force: true }).catch(() => {
        // Attachment cleanup is best-effort after Codex has consumed local files.
      })
    )
  );
}

function eventMatchesThread(event: CodexAppServerEvent, threadId: string): boolean {
  const params = event.params as { threadId?: string } | undefined;
  return params?.threadId === threadId;
}

function extractStreamingDelta(event: CodexAppServerEvent): string {
  if (event.method === "item/agentMessage/delta") {
    const params = event.params as { delta?: string } | undefined;
    return params?.delta ?? "";
  }
  if (event.method === "item/commandExecution/outputDelta") {
    const params = event.params as { delta?: string; output?: string; chunk?: string } | undefined;
    const delta = params?.delta ?? params?.output ?? params?.chunk ?? "";
    return delta ? `\n$ ${delta}` : "";
  }
  if (event.method === "item/fileChange/outputDelta") {
    const params = event.params as { delta?: string; output?: string } | undefined;
    const delta = params?.delta ?? params?.output ?? "";
    return delta ? `\n${delta}` : "";
  }
  return "";
}

function taskFromAppServerEvent(
  task: GatewayTask,
  event: CodexAppServerEvent,
  summary: string
): GatewayTask | undefined {
  if (event.method === "turn/started") {
    return {
      ...task,
      status: "running",
      currentStep: "Thinking",
      updatedAt: nowIso()
    };
  }
  if (event.method === "item/started") {
    const itemType = (event.params as { item?: { type?: string } } | undefined)?.item?.type;
    return {
      ...task,
      status: itemType === "commandExecution" ? "running" : task.status,
      currentStep: stepForItemType(itemType),
      summary: summary || task.summary,
      updatedAt: nowIso()
    };
  }
  if (event.method === "item/agentMessage/delta") {
    return {
      ...task,
      status: "running",
      currentStep: "Writing response",
      summary,
      updatedAt: nowIso()
    };
  }
  if (event.method === "item/commandExecution/outputDelta") {
    return {
      ...task,
      status: "running",
      currentStep: "Running command",
      summary: summary || task.summary,
      updatedAt: nowIso()
    };
  }
  if (event.method === "turn/diff/updated") {
    return {
      ...task,
      status: "running",
      currentStep: "Generating diff",
      summary: summary || extractDiffSummary(event) || task.summary,
      updatedAt: nowIso()
    };
  }
  if (event.method === "turn/plan/updated" || event.method === "item/plan/delta") {
    return {
      ...task,
      status: "running",
      currentStep: "Planning",
      summary: summary || task.summary,
      updatedAt: nowIso()
    };
  }
  if (event.method === "thread/status/changed") {
    const status = extractThreadStatus(event);
    if (status === "waiting_approval") {
      return {
        ...task,
        status: "waiting_approval",
        currentStep: "Waiting approval",
        summary: summary || task.summary,
        updatedAt: nowIso()
      };
    }
    if (status) {
      return {
        ...task,
        status: "running",
        currentStep: status === "running" ? "Codex running" : task.currentStep,
        summary: summary || task.summary,
        updatedAt: nowIso()
      };
    }
  }
  if (event.method === "item/fileChange/outputDelta" || event.method === "item/fileChange/patchUpdated") {
    return {
      ...task,
      status: "running",
      currentStep: "Updating diff",
      summary: summary || task.summary,
      updatedAt: nowIso()
    };
  }
  if (event.method.includes("requestApproval")) {
    return {
      ...task,
      status: "waiting_approval",
      currentStep: "Waiting approval",
      summary: summary || task.summary,
      updatedAt: nowIso()
    };
  }
  return undefined;
}

function stepForItemType(itemType?: string): string {
  if (itemType === "reasoning") {
    return "Thinking";
  }
  if (itemType === "commandExecution") {
    return "Running command";
  }
  if (itemType === "fileChange") {
    return "Generating diff";
  }
  if (itemType === "agentMessage") {
    return "Writing response";
  }
  return "Codex running";
}

function extractDiffSummary(event: CodexAppServerEvent): string | undefined {
  const diff = (event.params as { diff?: string } | undefined)?.diff;
  if (!diff) {
    return undefined;
  }
  return diff.length > 2000 ? diff.slice(-2000) : diff;
}

function extractThreadStatus(event: CodexAppServerEvent): "running" | "waiting_approval" | "idle" | "error" | undefined {
  const status = (event.params as { status?: { type?: string; activeFlags?: string[] } } | undefined)?.status;
  if (!status?.type) {
    return undefined;
  }
  if (status.type === "active") {
    return status.activeFlags?.includes("waitingOnApproval") ? "waiting_approval" : "running";
  }
  if (status.type === "idle") {
    return "idle";
  }
  if (status.type === "systemError") {
    return "error";
  }
  return undefined;
}

async function waitForTurnCompletion(
  client: CodexAppServerClient,
  threadId: string,
  turnId: string | undefined,
  onEvent: (event: CodexAppServerEvent) => void
): Promise<{ status: "completed" | "failed"; error?: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for Codex turn completion"));
    }, 30 * 60 * 1000);
    const unsubscribe = client.onEvent((event) => {
      if (!eventMatchesThread(event, threadId)) {
        return;
      }
      onEvent(event);
      if (event.method === "turn/completed") {
        const params = event.params as { turn?: { id?: string; status?: string; error?: unknown } };
        if (turnId && params.turn?.id !== turnId) {
          return;
        }
        clearTimeout(timeout);
        unsubscribe();
        resolve({
          status: params.turn?.status === "failed" ? "failed" : "completed",
          error: params.turn?.error ? JSON.stringify(params.turn.error) : undefined
        });
      }
    });
  });
}

function mergeThreads(threads: CodexThreadSummary[]): CodexThreadSummary[] {
  const byId = new Map<string, ThreadRecord>();
  for (const thread of threads) {
    const key = canonicalThreadId(thread);
    const canonicalThread: ThreadRecord = normalizeThreadRecord({
      ...thread,
      id: key,
      cwd: normalizeCwd(thread.cwd),
      providerThreadId: providerId(thread.providerThreadId) ?? providerId(key)
    });
    const existing = byId.get(canonicalThread.sessionKey);
    byId.set(canonicalThread.sessionKey, existing ? mergeThreadPair(existing, canonicalThread) : canonicalThread);
  }
  return [...byId.values()].sort((a, b) =>
    (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "")
  );
}

function applySessionOverlays(
  codexThreads: CodexThreadSummary[],
  sessionOverlays: ThreadRecord[]
): CodexThreadSummary[] {
  const overlays = new Map(sessionOverlays.map((thread) => [thread.sessionKey, thread]));
  const result = codexThreads.map((thread) => {
    const overlay = overlays.get(thread.sessionKey);
    if (!overlay) {
      return thread;
    }
    return {
      ...thread,
      title: thread.title || overlay.title,
      cwd: normalizeCwd(thread.cwd ?? overlay.cwd),
      status: overlay.status === "unknown" ? thread.status : overlay.status,
      provider: thread.provider ?? overlay.provider,
      lastActivityAt: maxIso(thread.lastActivityAt, overlay.lastActivityAt),
      firstMessage: thread.firstMessage ?? overlay.firstMessage,
      lastMessage: thread.lastMessage ?? overlay.lastMessage,
      sessionFile: thread.sessionFile ?? overlay.sessionFile
    };
  });
  return result.sort((a, b) =>
    (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "")
  );
}

function mergeThreadPair(primary: ThreadRecord, secondary: ThreadRecord): ThreadRecord {
  const preferred = preferThreadBase(primary, secondary);
  const fallback = preferred === primary ? secondary : primary;
  const merged = normalizeThreadRecord({
    ...fallback,
    ...preferred,
    id: canonicalThreadId(preferred),
    title: preferredTitle(primary, secondary),
    cwd: normalizeCwd(primary.cwd ?? secondary.cwd),
    source: preferred.source,
    status: preferredStatus(primary.status, secondary.status),
    providerThreadId: providerId(primary.providerThreadId) ?? providerId(secondary.providerThreadId),
    provider: primary.provider ?? secondary.provider,
    lastActivityAt: maxIso(primary.lastActivityAt, secondary.lastActivityAt),
    firstMessage: primary.firstMessage ?? secondary.firstMessage,
    lastMessage: primary.lastMessage ?? secondary.lastMessage,
    sessionFile: primary.sessionFile ?? secondary.sessionFile
  });
  merged.createdByGateway = primary.createdByGateway || secondary.createdByGateway;
  return merged;
}

function preferThreadBase(a: ThreadRecord, b: ThreadRecord): ThreadRecord {
  if (a.source === "gateway-overlay" && b.source !== "gateway-overlay") {
    return a;
  }
  if (b.source === "gateway-overlay" && a.source !== "gateway-overlay") {
    return b;
  }
  if (a.provider === "codex-app-server" && b.provider !== "codex-app-server") {
    return a;
  }
  if (b.provider === "codex-app-server" && a.provider !== "codex-app-server") {
    return b;
  }
  return (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "") > 0 ? b : a;
}

function preferredTitle(a: ThreadRecord, b: ThreadRecord): string {
  const gateway =
    a.source === "gateway-overlay" ? a : b.source === "gateway-overlay" ? b : undefined;
  if (gateway?.title && !defaultThreadTitle(gateway.title)) {
    return gateway.title;
  }
  const named = [a.title, b.title].find((title) => title && !defaultThreadTitle(title));
  return named ?? gateway?.title ?? a.title ?? b.title;
}

function defaultThreadTitle(title: string): boolean {
  return ["New remote task", "新的远程任务"].includes(title.trim());
}

function preferredStatus(
  a: CodexThreadSummary["status"],
  b: CodexThreadSummary["status"]
): CodexThreadSummary["status"] {
  const priority: Record<CodexThreadSummary["status"], number> = {
    waiting_approval: 5,
    running: 4,
    error: 3,
    idle: 2,
    unknown: 1
  };
  return priority[b] > priority[a] ? b : a;
}

function canonicalThreadId(thread: CodexThreadSummary): string {
  return providerId(thread.nativeSessionId) ?? providerId(thread.id) ?? providerId(thread.providerThreadId) ?? thread.id;
}

function providerId(id?: string): string | undefined {
  return id && isProviderThreadId(id) ? id : undefined;
}

function isProviderThreadId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function normalizeCwd(cwd?: string): string | undefined {
  return cwd?.trim() ? path.resolve(cwd.trim()) : undefined;
}

function normalizeThreadRecord(thread: CodexThreadSummary | ThreadRecord): ThreadRecord {
  const nativeSessionId = canonicalThreadId(thread);
  return {
    ...thread,
    ...codexSessionIdentity(nativeSessionId),
    id: nativeSessionId,
    environmentId: thread.environmentId ?? "default",
    cwd: normalizeCwd(thread.cwd),
    providerThreadId: providerId(thread.providerThreadId) ?? nativeSessionId
  };
}

function gatewayThreadSnapshotsDiffer(before: ThreadRecord[], after: ThreadRecord[]): boolean {
  return JSON.stringify(threadSnapshot(before, false)) !== JSON.stringify(threadSnapshot(after, true));
}

function threadSnapshot(threads: ThreadRecord[], normalized: boolean): Array<Record<string, unknown>> {
  return threads
    .map((thread) => ({
      ...thread,
      cwd: normalized ? normalizeCwd(thread.cwd) : thread.cwd,
      providerThreadId: normalized ? providerId(thread.providerThreadId) : thread.providerThreadId
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function maxIso(a?: string, b?: string): string | undefined {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return b.localeCompare(a) > 0 ? b : a;
}

function findHistoricalProviderThread(
  threads: CodexThreadSummary[],
  providerThreadId: string,
  gatewayThreadId: string
): CodexThreadSummary | undefined {
  return (
    threads.find(
      (thread) =>
        thread.id === providerThreadId &&
        (thread.source === "provider-history" || Boolean(thread.sessionFile))
    ) ??
    threads.find(
      (thread) =>
        thread.id !== gatewayThreadId &&
        thread.providerThreadId === providerThreadId &&
        (thread.source === "provider-history" || Boolean(thread.sessionFile))
    )
  );
}

function threadSummaryFromAppServer(thread: Record<string, unknown>): CodexThreadSummary | undefined {
  const id = stringValue(thread.id);
  if (!id) {
    return undefined;
  }
  const createdAt = numberToIso(thread.createdAt);
  const updatedAt = numberToIso(thread.updatedAt);
  return {
    ...codexSessionIdentity(id),
    environmentId: "default",
    title:
      stringValue(thread.name) ??
      textToTitle(stringValue(thread.preview) ?? "") ??
      `Codex ${id.slice(0, 8)}`,
    cwd: stringValue(thread.cwd),
    source: "provider-runtime",
    status: statusFromAppServerThread(thread.status),
    providerThreadId: id,
    provider: "codex-app-server",
    lastActivityAt: updatedAt ?? createdAt,
    firstMessage: stringValue(thread.preview),
    lastMessage: stringValue(thread.preview),
    sessionFile: stringValue(thread.path)
  };
}

function inputEnvironmentId(environmentId?: string): string {
  return environmentId?.trim() || "default";
}

function statusFromAppServerThread(status: unknown): CodexThreadSummary["status"] {
  if (!status || typeof status !== "object") {
    return "unknown";
  }
  const type = stringValue((status as Record<string, unknown>).type);
  if (type === "idle" || type === "notLoaded") {
    return type === "idle" ? "idle" : "unknown";
  }
  if (type === "systemError") {
    return "error";
  }
  if (type === "active") {
    const activeFlags = (status as { activeFlags?: unknown }).activeFlags;
    return Array.isArray(activeFlags) && activeFlags.includes("waitingOnApproval")
      ? "waiting_approval"
      : "running";
  }
  return "unknown";
}

function numberToIso(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return new Date(value * 1000).toISOString();
}

function textToTitle(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length > 64 ? `${normalized.slice(0, 64)}...` : normalized;
}

function buildApprovalRequest(
  request: CodexAppServerRequest,
  taskId: string,
  sessionKey: string,
  providerThreadId?: string,
  environmentId?: string
): ApprovalRequest {
  const params = (request.params ?? {}) as Record<string, unknown>;
  const command = commandFromParams(params);
  return {
    id: `${request.id}`,
    taskId,
    environmentId,
    sessionKey,
    threadId: findThreadIdInParams(params) ?? providerThreadId ?? "",
    providerThreadId,
    providerTurnId: stringValue(params.turnId),
    providerRequestId: request.id,
    providerMethod: request.method,
    title: approvalTitle(request.method),
    description: stringValue(params.reason) ?? approvalDescription(request.method),
    command,
    diff: diffFromParams(params),
    createdAt: nowIso()
  };
}

function approvalTitle(method: string): string {
  if (method.includes("command") || method === "execCommandApproval") {
    return "Codex wants to run a command";
  }
  if (method.includes("fileChange") || method === "applyPatchApproval") {
    return "Codex wants to edit files";
  }
  if (method.includes("permissions")) {
    return "Codex requests permissions";
  }
  if (method.includes("requestUserInput")) {
    return "Codex requests input";
  }
  return "Codex requests approval";
}

function approvalDescription(method: string): string {
  if (method.includes("permissions")) {
    return "The local Codex process asked for expanded runtime permissions.";
  }
  if (method.includes("requestUserInput")) {
    return "The local Codex process asked for user input. Approving sends an empty answer set in the MVP.";
  }
  return "Review this action from the local Codex process.";
}

function commandFromParams(params: Record<string, unknown>): string | undefined {
  const command = params.command;
  if (typeof command === "string") {
    return command;
  }
  if (Array.isArray(command)) {
    return command.map(String).join(" ");
  }
  return undefined;
}

function diffFromParams(params: Record<string, unknown>): string | undefined {
  const diff = params.diff;
  if (typeof diff === "string") {
    return diff;
  }
  const fileChanges = params.fileChanges;
  if (fileChanges && typeof fileChanges === "object") {
    return JSON.stringify(fileChanges, null, 2).slice(0, 4000);
  }
  return undefined;
}

function findThreadIdInParams(params: Record<string, unknown>): string | undefined {
  return stringValue(params.threadId) ?? stringValue(params.conversationId);
}

function approvalResponseForServerRequest(
  method: string,
  approved: boolean,
  params?: unknown
): unknown {
  if (method === "item/commandExecution/requestApproval") {
    return { decision: approved ? "accept" : "decline" };
  }
  if (method === "item/fileChange/requestApproval") {
    return { decision: approved ? "accept" : "decline" };
  }
  if (method === "execCommandApproval" || method === "applyPatchApproval") {
    return { decision: approved ? "approved" : "denied" };
  }
  if (method === "item/permissions/requestApproval") {
    const requested = (params as { permissions?: unknown } | undefined)?.permissions;
    return {
      permissions: approved && requested && typeof requested === "object" ? requested : {},
      scope: "turn",
      strictAutoReview: false
    };
  }
  if (method === "item/tool/requestUserInput") {
    return { answers: {} };
  }
  if (method === "mcpServer/elicitation/request") {
    return { action: approved ? "accept" : "decline", content: null, _meta: null };
  }
  return autoResponseForServerRequest(method, params);
}

function autoResponseForServerRequest(method: string, params?: unknown): unknown {
  if (method === "item/commandExecution/requestApproval") {
    return { decision: "accept" };
  }
  if (method === "item/fileChange/requestApproval") {
    return { decision: "accept" };
  }
  if (method === "execCommandApproval" || method === "applyPatchApproval") {
    return { decision: "approved" };
  }
  if (method === "item/permissions/requestApproval") {
    const requested = (params as { permissions?: unknown } | undefined)?.permissions;
    return {
      permissions: requested && typeof requested === "object" ? requested : {},
      scope: "turn",
      strictAutoReview: false
    };
  }
  if (method === "item/tool/requestUserInput") {
    return { answers: {} };
  }
  if (method === "mcpServer/elicitation/request") {
    return { action: "decline", content: null, _meta: null };
  }
  if (method === "item/tool/call") {
    return {
      contentItems: [{ type: "inputText", text: "Local Agent Gateway does not handle this app tool." }],
      success: false
    };
  }
  throw new Error(`Unsupported Codex app-server request: ${method}`);
}
