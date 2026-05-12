import type { ChannelBotConfig, ChannelType, GatewayTask } from "../../shared/types.js";
import type { ChannelAdapter } from "./types.js";

export class ChannelRegistry {
  private readonly adapters = new Map<ChannelType, ChannelAdapter>();

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  listAdapters(): ChannelAdapter[] {
    return [...this.adapters.values()];
  }

  get(type: ChannelType): ChannelAdapter | undefined {
    return this.adapters.get(type);
  }

  async startAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.startAll();
    }
  }

  async syncAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.syncAll();
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.adapters.values()].map((adapter) => adapter.stopAll()));
  }

  async updateTaskMessage(task: GatewayTask): Promise<void> {
    if (!task.channelType) {
      return;
    }
    await this.adapters.get(task.channelType)?.updateTaskMessage(task);
  }

  async handleCardCallback(
    channelType: ChannelType,
    bot: ChannelBotConfig,
    body: unknown
  ): Promise<Record<string, unknown>> {
    const adapter = this.adapters.get(channelType);
    if (!adapter?.handleCardCallback) {
      throw new Error(`Channel does not support card callbacks: ${channelType}`);
    }
    return adapter.handleCardCallback(bot, body);
  }
}
