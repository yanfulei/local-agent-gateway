import { nanoid } from "nanoid";
import type { GatewayEventBus } from "./events.js";
import type { LogEntry } from "../shared/types.js";
import { nowIso } from "./utils/time.js";

export class Logger {
  private readonly entries: LogEntry[] = [];

  constructor(private readonly events: GatewayEventBus) {}

  list(limit = 200): LogEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  debug(message: string, meta: Partial<LogEntry> = {}): void {
    this.write("debug", message, meta);
  }

  info(message: string, meta: Partial<LogEntry> = {}): void {
    this.write("info", message, meta);
  }

  warn(message: string, meta: Partial<LogEntry> = {}): void {
    this.write("warn", message, meta);
  }

  error(message: string, meta: Partial<LogEntry> = {}): void {
    this.write("error", message, meta);
  }

  private write(level: LogEntry["level"], message: string, meta: Partial<LogEntry>): void {
    const entry: LogEntry = {
      id: nanoid(),
      level,
      message,
      scope: meta.scope,
      taskId: meta.taskId,
      environmentId: meta.environmentId,
      providerId: meta.providerId,
      providerType: meta.providerType,
      channelType: meta.channelType,
      channelBotId: meta.channelBotId,
      botId: meta.botId,
      sessionKey: meta.sessionKey,
      threadId: meta.threadId,
      data: meta.data,
      createdAt: nowIso()
    };
    this.entries.push(entry);
    if (this.entries.length > 1000) {
      this.entries.splice(0, this.entries.length - 1000);
    }
    this.events.publish({ type: "log", entry });
  }
}
