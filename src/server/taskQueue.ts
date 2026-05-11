import { nanoid } from "nanoid";
import type {
  AttachmentInput,
  EnvironmentConfig,
  GatewayTask,
  RunningMessageMode,
  TaskMessage
} from "../shared/types.js";
import type { GatewayEventBus } from "./events.js";
import type { Logger } from "./logger.js";
import type { ProviderRegistry } from "./providers/providerRegistry.js";
import { nowIso } from "./utils/time.js";

export class TaskQueue {
  private readonly tasks = new Map<string, GatewayTask>();
  private readonly queues = new Map<string, GatewayTask[]>();
  private readonly running = new Set<string>();

  constructor(
    private readonly providers: ProviderRegistry,
    private readonly events: GatewayEventBus,
    private readonly logger: Logger
  ) {
    this.events.subscribe((event) => {
      if (event.type === "task.updated") {
        this.tasks.set(event.task.id, event.task);
      }
    });
  }

  list(): GatewayTask[] {
    return [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(taskId: string): GatewayTask | undefined {
    return this.tasks.get(taskId);
  }

  findPendingApproval(sessionKey?: string, botId?: string): GatewayTask | undefined {
    return this.list().find(
      (task) =>
        task.approval &&
        task.status === "waiting_approval" &&
        (!sessionKey || task.sessionKey === sessionKey || task.threadId === sessionKey) &&
        (!botId || task.botId === botId)
    );
  }

  findPendingApprovalForEnvironment(
    environmentId: string,
    sessionKey?: string,
    botId?: string
  ): GatewayTask | undefined {
    return this.list().find(
      (task) =>
        task.environmentId === environmentId &&
        task.approval &&
        task.status === "waiting_approval" &&
        (!sessionKey || task.sessionKey === sessionKey || task.threadId === sessionKey) &&
        (!botId || task.botId === botId)
    );
  }

  enqueue(message: TaskMessage, mode: RunningMessageMode = "queue"): GatewayTask {
    const environment = environmentFromMessage(message);
    const provider = this.providers.providerForSession(message.sessionKey, environment);
    const task = provider.taskFromMessage(message);
    this.tasks.set(task.id, task);
    this.events.publish({ type: "task.updated", task });
    const queueKey = taskQueueKey(task);
    const threadQueue = this.queues.get(queueKey) ?? [];

    if (mode === "steer" && this.running.has(queueKey)) {
      threadQueue.unshift(task);
    } else {
      threadQueue.push(task);
    }

    this.queues.set(queueKey, threadQueue);
    this.logger.info("Task queued", {
      scope: "queue",
      taskId: task.id,
      environmentId: task.environmentId,
      providerId: task.providerId,
      providerType: task.providerType,
      channelType: task.channelType,
      channelBotId: task.channelBotId,
      botId: task.botId,
      sessionKey: task.sessionKey,
      threadId: task.threadId
    });
    void this.drain(queueKey);
    return task;
  }

  async cancel(taskId: string): Promise<GatewayTask> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    if (task.status === "queued") {
      const queueKey = taskQueueKey(task);
      const queue = this.queues.get(queueKey) ?? [];
      this.queues.set(
        queueKey,
        queue.filter((item) => item.id !== taskId)
      );
      const cancelled = {
        ...task,
        status: "cancelled" as const,
        updatedAt: nowIso(),
        completedAt: nowIso(),
        currentStep: "Cancelled"
      };
      this.tasks.set(taskId, cancelled);
      this.events.publish({ type: "task.updated", task: cancelled });
      return cancelled;
    }
    const cancelled = {
      ...task,
      status: "cancelled" as const,
      updatedAt: nowIso(),
      completedAt: nowIso(),
      currentStep: "Cancel requested"
    };
    this.tasks.set(taskId, cancelled);
    this.events.publish({ type: "task.updated", task: cancelled });
    await this.providers.providerForSession(
      cancelled.sessionKey,
      environmentFromTask(cancelled)
    ).cancelTask(cancelled);
    return cancelled;
  }

  async approve(taskId: string, approved: boolean): Promise<GatewayTask> {
    const existing = this.tasks.get(taskId);
    if (!existing) {
      throw new Error(`Task not found: ${taskId}`);
    }
    const result = await this.providers.providerForSession(
      existing.sessionKey,
      environmentFromTask(existing)
    ).approveTask(taskId, approved);
    this.tasks.set(taskId, result);
    return result;
  }

  createWebMessage(input: {
    sessionKey: string;
    environment: EnvironmentConfig;
    threadId: string;
    text: string;
    botId?: string;
    attachments?: AttachmentInput[];
  }): TaskMessage {
    const resolved = this.providers.resolveSession(input.sessionKey, input.environment);
    return {
      id: nanoid(),
      source: "web",
      environmentId: resolved.environmentId,
      providerId: resolved.providerId,
      providerType: resolved.providerType,
      botId: input.botId,
      sessionKey: resolved.sessionKey,
      threadId: resolved.nativeSessionId,
      text: input.text,
      attachments: input.attachments ?? [],
      createdAt: nowIso()
    };
  }

  private async drain(queueKey: string): Promise<void> {
    if (this.running.has(queueKey)) {
      return;
    }
    const queue = this.queues.get(queueKey);
    const next = queue?.shift();
    if (!next) {
      return;
    }
    this.running.add(queueKey);
    try {
      this.tasks.set(next.id, {
        ...next,
        status: "running",
        updatedAt: nowIso()
      });
      const result = await this.providers.providerForSession(
        next.sessionKey,
        environmentFromTask(next)
      ).runTask(next);
      this.tasks.set(next.id, result);
    } finally {
      this.running.delete(queueKey);
      void this.drain(queueKey);
    }
  }
}

function taskQueueKey(task: Pick<GatewayTask, "environmentId" | "sessionKey">): string {
  return `${task.environmentId}:${task.sessionKey}`;
}

function environmentFromMessage(message: TaskMessage): EnvironmentConfig {
  return {
    id: message.environmentId,
    name: message.environmentId,
    enabled: true,
    providerId: message.providerId,
    providerType: message.providerType,
    defaultCwd: process.cwd(),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  };
}

function environmentFromTask(task: GatewayTask): EnvironmentConfig {
  return {
    id: task.environmentId,
    name: task.environmentId,
    enabled: true,
    providerId: task.providerId,
    providerType: task.providerType,
    defaultCwd: process.cwd(),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  };
}
