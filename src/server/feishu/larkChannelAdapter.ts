import type { ChannelBotConfig, GatewayTask } from "../../shared/types.js";
import type { FeishuBotManager } from "./feishuBotManager.js";
import type { ChannelAdapter } from "../channels/types.js";

export class LarkChannelAdapter implements ChannelAdapter {
  readonly type = "lark" as const;

  constructor(private readonly manager: FeishuBotManager) {}

  startAll(): Promise<void> {
    return this.manager.startAll();
  }

  syncAll(): Promise<void> {
    return this.manager.syncAll();
  }

  stopAll(): Promise<void> {
    return this.manager.stopAll();
  }

  updateTaskMessage(task: GatewayTask): Promise<void> {
    return this.manager.updateTaskCard(task);
  }

  handleCardCallback(bot: ChannelBotConfig, body: unknown): Promise<Record<string, unknown>> {
    if (bot.channelType !== "lark") {
      throw new Error(`Invalid Lark bot channel: ${bot.channelType}`);
    }
    return this.manager.handleCardCallback(bot.id, body);
  }
}
