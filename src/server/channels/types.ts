import type { ChannelBotConfig, ChannelType, GatewayTask } from "../../shared/types.js";

export interface ChannelAdapter {
  readonly type: ChannelType;
  startAll(): Promise<void>;
  syncAll(): Promise<void>;
  stopAll(): Promise<void>;
  updateTaskMessage(task: GatewayTask): Promise<void>;
  handleCardCallback?(bot: ChannelBotConfig, body: unknown): Promise<Record<string, unknown>>;
}
