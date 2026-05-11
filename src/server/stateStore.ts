import { z } from "zod";
import type { AgentSessionSummary } from "../shared/types.js";
import { STATE_PATH } from "./paths.js";
import { codexSessionIdentity, isUuid } from "./providers/sessionKeys.js";
import { readJsonFile, writeJsonFile } from "./utils/files.js";

const threadSchema = z.object({
  id: z.string(),
  sessionKey: z.string().optional(),
  environmentId: z.string().optional(),
  providerId: z.string().optional(),
  providerType: z.enum(["codex", "claude-code", "openclaw", "hermes"]).optional(),
  nativeSessionId: z.string().optional(),
  title: z.string(),
  cwd: z.string().optional(),
  source: z.enum(["provider-history", "provider-runtime", "gateway-overlay", "codex-history", "gateway"]),
  status: z.enum(["unknown", "idle", "running", "waiting_approval", "error"]),
  providerThreadId: z.string().optional(),
  provider: z.enum(["codex-app-server", "codex-exec"]).optional(),
  lastActivityAt: z.string().optional(),
  firstMessage: z.string().optional(),
  lastMessage: z.string().optional(),
  sessionFile: z.string().optional()
}).passthrough();

const stateSchema = z.object({
  gatewaySessions: z.array(threadSchema).optional(),
  gatewayThreads: z.array(threadSchema).optional()
});

type GatewayState = {
  sessionOverlays: AgentSessionSummary[];
};

export class StateStore {
  private state: GatewayState = {
    sessionOverlays: []
  };

  async init(): Promise<void> {
    const existing = await readJsonFile<unknown>(STATE_PATH);
    if (!existing) {
      await this.save();
      return;
    }
    const parsed = stateSchema.safeParse(existing);
    if (!parsed.success) {
      throw new Error(`Invalid state file at ${STATE_PATH}: ${parsed.error.message}`);
    }
    this.state = {
      sessionOverlays: (parsed.data.gatewaySessions ?? parsed.data.gatewayThreads ?? [])
        .map(normalizeLegacyThread)
        .filter((thread): thread is AgentSessionSummary => Boolean(thread))
    };
  }

  getSessionOverlays(): AgentSessionSummary[] {
    return structuredClone(this.state.sessionOverlays);
  }

  async upsertSessionOverlay(thread: AgentSessionSummary): Promise<void> {
    const index = this.state.sessionOverlays.findIndex((item) => item.sessionKey === thread.sessionKey);
    if (index === -1) {
      this.state.sessionOverlays.push(thread);
    } else {
      this.state.sessionOverlays[index] = thread;
    }
    await this.save();
  }

  async replaceSessionOverlays(threads: AgentSessionSummary[]): Promise<void> {
    this.state.sessionOverlays = structuredClone(threads);
    await this.save();
  }

  private async save(): Promise<void> {
    await writeJsonFile(STATE_PATH, {
      gatewaySessions: this.state.sessionOverlays
    });
  }
}

function normalizeLegacyThread(thread: z.infer<typeof threadSchema>): AgentSessionSummary | undefined {
  const nativeSessionId = [thread.nativeSessionId, thread.id, thread.providerThreadId].find(
    (value): value is string => Boolean(value && isUuid(value))
  );
  if (!nativeSessionId) {
    return undefined;
  }
  return {
    ...thread,
    ...codexSessionIdentity(nativeSessionId),
    id: nativeSessionId,
    environmentId: thread.environmentId ?? "default",
    source:
      thread.source === "gateway" || thread.source === "gateway-overlay"
        ? "gateway-overlay"
        : thread.source === "codex-history" || thread.source === "provider-history"
          ? "provider-history"
          : "provider-runtime",
    status: thread.status,
    title: thread.title,
    cwd: thread.cwd,
    providerThreadId: nativeSessionId,
    provider: thread.provider,
    lastActivityAt: thread.lastActivityAt,
    firstMessage: thread.firstMessage,
    lastMessage: thread.lastMessage,
    sessionFile: thread.sessionFile
  };
}
