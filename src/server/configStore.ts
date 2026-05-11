import process from "node:process";
import { nanoid } from "nanoid";
import { z } from "zod";
import type {
  ChannelType,
  CreateBotInput,
  CreateEnvironmentInput,
  EnvironmentConfig,
  FeishuBotConfig,
  GatewayConfig,
  ProviderConfig,
  UpdateConfigInput,
  UpdateEnvironmentInput,
  UpdateBotInput
} from "../shared/types.js";
import { CONFIG_PATH, DATA_DIR } from "./paths.js";
import { ensureDir, readJsonFile, writeJsonFile } from "./utils/files.js";
import { nowIso } from "./utils/time.js";
import type { GatewayEventBus } from "./events.js";
import { normalizeSessionKeyInput } from "./providers/sessionKeys.js";

const botSchema = z.object({
  id: z.string(),
  channelType: z.enum(["feishu", "lark", "dingtalk", "wechat"]).optional(),
  name: z.string(),
  enabled: z.boolean(),
  appId: z.string(),
  appSecret: z.string(),
  verificationToken: z.string().optional(),
  encryptKey: z.string().optional(),
  allowedOpenIds: z.array(z.string()).default([]),
  allowedChatIds: z.array(z.string()).default([]),
  activeEnvironmentId: z.string().optional(),
  activeSessionKey: z.string().optional(),
  activeThreadId: z.string().optional(),
  runningMessageMode: z.enum(["steer", "queue"]),
  outputMode: z.enum(["structured", "raw", "both"]),
  status: z.enum(["disabled", "disconnected", "connecting", "connected", "error"]),
  statusMessage: z.string().optional(),
  updatedAt: z.string()
});

const environmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean(),
  providerId: z.string(),
  providerType: z.enum(["codex", "claude-code", "openclaw", "hermes"]),
  defaultCwd: z.string(),
  isDefault: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const configSchema = z.object({
  dataDir: z.string(),
  defaultCwd: z.string(),
  server: z.object({
    host: z.string(),
    port: z.number()
  }),
  codex: z.object({
    command: z.string(),
    preferAppServer: z.boolean(),
    appServerListen: z.string()
  }),
  providers: z.array(z.object({
    id: z.string(),
    type: z.enum(["codex", "claude-code", "openclaw", "hermes"]),
    name: z.string(),
    enabled: z.boolean(),
    command: z.string(),
    preferAppServer: z.boolean().optional(),
    appServerListen: z.string().optional()
  })).default([]),
  environments: z.array(environmentSchema).default([]),
  defaultEnvironmentId: z.string().default("default"),
  bots: z.array(botSchema)
});

export class ConfigStore {
  private config!: GatewayConfig;

  constructor(private readonly events: GatewayEventBus) {}

  async init(): Promise<void> {
    await ensureDir(DATA_DIR);
    const existing = await readJsonFile<unknown>(CONFIG_PATH);
    if (existing) {
      const parsed = configSchema.safeParse(existing);
      if (!parsed.success) {
        throw new Error(`Invalid config file at ${CONFIG_PATH}: ${parsed.error.message}`);
      }
      this.config = migrateConfig(parsed.data);
      await this.save();
    } else {
      this.config = defaultConfig();
      await this.save();
    }
  }

  get(): GatewayConfig {
    return structuredClone(this.config);
  }

  async update(partial: UpdateConfigInput): Promise<GatewayConfig> {
    this.config = {
      ...this.config,
      ...partial,
      codex: {
        ...this.config.codex,
        ...(partial.codex ?? {})
      }
    };
    this.config.environments = normalizeEnvironments(
      this.config.environments,
      this.config.providers,
      this.config.defaultCwd,
      this.config.defaultEnvironmentId
    );
    this.config.defaultEnvironmentId = defaultEnvironmentId(this.config.environments);
    await this.save();
    return this.get();
  }

  defaultEnvironment(): EnvironmentConfig {
    const environment = this.config.environments.find((item) => item.id === this.config.defaultEnvironmentId)
      ?? this.config.environments.find((item) => item.isDefault)
      ?? this.config.environments[0];
    if (!environment) {
      throw new Error("No environment is configured.");
    }
    return structuredClone(environment);
  }

  getEnvironment(environmentId?: string): EnvironmentConfig {
    const targetId = environmentId?.trim() || this.config.defaultEnvironmentId;
    const environment = this.config.environments.find((item) => item.id === targetId)
      ?? this.config.environments.find((item) => item.isDefault)
      ?? this.config.environments[0];
    if (!environment) {
      throw new Error(`Environment not found: ${targetId}`);
    }
    return structuredClone(environment);
  }

  async addEnvironment(input: CreateEnvironmentInput): Promise<EnvironmentConfig> {
    const provider = this.providerFor(input.providerId);
    const now = nowIso();
    const environment: EnvironmentConfig = {
      id: slugifyEnvironmentId(input.name || "environment", this.config.environments),
      name: input.name?.trim() || "新环境",
      description: input.description?.trim() || undefined,
      enabled: input.enabled ?? true,
      providerId: provider.id,
      providerType: provider.type,
      defaultCwd: input.defaultCwd?.trim() || this.config.defaultCwd || process.cwd(),
      createdAt: now,
      updatedAt: now
    };
    this.config.environments.push(environment);
    await this.save();
    return structuredClone(environment);
  }

  async updateEnvironment(environmentId: string, input: UpdateEnvironmentInput): Promise<EnvironmentConfig> {
    const index = this.config.environments.findIndex((environment) => environment.id === environmentId);
    if (index === -1) {
      throw new Error(`Environment not found: ${environmentId}`);
    }
    const previous = this.config.environments[index];
    const provider = input.providerId ? this.providerFor(input.providerId) : this.providerFor(previous.providerId);
    const updated: EnvironmentConfig = {
      ...previous,
      ...input,
      name: input.name?.trim() || previous.name,
      description:
        input.description === undefined
          ? previous.description
          : input.description.trim() || undefined,
      enabled: input.enabled ?? previous.enabled,
      providerId: provider.id,
      providerType: provider.type,
      defaultCwd: input.defaultCwd?.trim() || previous.defaultCwd || this.config.defaultCwd,
      isDefault: input.isDefault ?? previous.isDefault,
      updatedAt: nowIso()
    };
    if (input.isDefault) {
      this.config.environments = this.config.environments.map((environment) => ({
        ...environment,
        isDefault: environment.id === environmentId,
        updatedAt: environment.id === environmentId ? updated.updatedAt : environment.updatedAt
      }));
      this.config.defaultEnvironmentId = environmentId;
    }
    this.config.environments[index] = updated;
    this.config.environments = normalizeEnvironments(
      this.config.environments,
      this.config.providers,
      this.config.defaultCwd,
      this.config.defaultEnvironmentId
    );
    this.config.defaultEnvironmentId = defaultEnvironmentId(this.config.environments);
    await this.save();
    return structuredClone(this.config.environments.find((environment) => environment.id === environmentId) ?? updated);
  }

  async addBot(input: CreateBotInput): Promise<FeishuBotConfig> {
    const bot: FeishuBotConfig = {
      ...input,
      channelType: normalizeChannelType(input.channelType),
      allowedOpenIds: input.allowedOpenIds ?? [],
      allowedChatIds: input.allowedChatIds ?? [],
      id: nanoid(),
      status: input.enabled ? "disconnected" : "disabled",
      updatedAt: nowIso()
    };
    bot.activeEnvironmentId = normalizeEnvironmentId(
      bot.activeEnvironmentId,
      this.config.defaultEnvironmentId
    );
    bot.activeSessionKey = normalizeSessionKeyInput(bot.activeSessionKey ?? bot.activeThreadId);
    bot.activeThreadId = bot.activeSessionKey;
    this.config.bots.push(bot);
    await this.save();
    return structuredClone(bot);
  }

  async updateBot(botId: string, input: UpdateBotInput): Promise<FeishuBotConfig> {
    const index = this.config.bots.findIndex((bot) => bot.id === botId);
    if (index === -1) {
      throw new Error(`Bot not found: ${botId}`);
    }
    const previous = this.config.bots[index];
    const bot: FeishuBotConfig = {
      ...previous,
      ...input,
      channelType: normalizeChannelType(input.channelType ?? previous.channelType),
      status:
        input.status ??
        (typeof input.enabled === "boolean"
          ? input.enabled
            ? previous.status === "disabled"
              ? "disconnected"
              : previous.status
            : "disabled"
          : previous.status),
      updatedAt: nowIso()
    };
    bot.activeEnvironmentId = normalizeEnvironmentId(
      bot.activeEnvironmentId,
      this.config.defaultEnvironmentId
    );
    bot.activeSessionKey = normalizeSessionKeyInput(bot.activeSessionKey ?? bot.activeThreadId);
    bot.activeThreadId = bot.activeSessionKey;
    this.config.bots[index] = bot;
    await this.save();
    return structuredClone(bot);
  }

  async bindSessionToBot(sessionKey: string, botId?: string, environmentId?: string): Promise<GatewayConfig> {
    const normalizedSessionKey = normalizeSessionKeyInput(sessionKey);
    if (!normalizedSessionKey) {
      throw new Error("Session key is required.");
    }
    const normalizedEnvironmentId = this.getEnvironment(environmentId).id;
    if (botId && !this.config.bots.some((bot) => bot.id === botId)) {
      throw new Error(`Bot not found: ${botId}`);
    }
    if (!botId) {
      this.config.bots = this.config.bots.map((bot) =>
        (bot.activeSessionKey ?? bot.activeThreadId) === normalizedSessionKey &&
          normalizeEnvironmentId(bot.activeEnvironmentId, this.config.defaultEnvironmentId) === normalizedEnvironmentId
          ? {
              ...bot,
              activeEnvironmentId: undefined,
              activeSessionKey: undefined,
              activeThreadId: undefined,
              updatedAt: nowIso()
            }
          : bot
      );
      await this.save();
      return this.get();
    }
    this.config.bots = this.config.bots.map((bot) => {
      if (bot.id !== botId) {
        return bot;
      }
      return {
        ...bot,
        activeEnvironmentId: normalizedEnvironmentId,
        activeSessionKey: normalizedSessionKey,
        activeThreadId: normalizedSessionKey,
        updatedAt: nowIso()
      };
    });
    await this.save();
    return this.get();
  }

  async replaceSessionBindings(sessionKeyAliases: Map<string, string>): Promise<GatewayConfig> {
    let changed = false;
    this.config.bots = this.config.bots.map((bot) => {
      const currentSessionKey = normalizeSessionKeyInput(bot.activeSessionKey ?? bot.activeThreadId);
      const activeSessionKey = currentSessionKey ? sessionKeyAliases.get(currentSessionKey) : undefined;
      if (!activeSessionKey || activeSessionKey === currentSessionKey) {
        return bot;
      }
      changed = true;
      return {
        ...bot,
        activeEnvironmentId: normalizeEnvironmentId(bot.activeEnvironmentId, this.config.defaultEnvironmentId),
        activeSessionKey: normalizeSessionKeyInput(activeSessionKey),
        activeThreadId: normalizeSessionKeyInput(activeSessionKey),
        updatedAt: nowIso()
      };
    });
    if (changed) {
      await this.save();
    }
    return this.get();
  }

  async deleteBot(botId: string): Promise<void> {
    this.config.bots = this.config.bots.filter((bot) => bot.id !== botId);
    await this.save();
  }

  async deleteEnvironment(environmentId: string): Promise<GatewayConfig> {
    const target = this.config.environments.find((environment) => environment.id === environmentId);
    if (!target) {
      throw new Error(`Environment not found: ${environmentId}`);
    }
    if (this.config.environments.length <= 1) {
      throw new Error("Cannot delete the last environment.");
    }

    const previousDefaultId = this.config.defaultEnvironmentId;
    const now = nowIso();
    this.config.environments = this.config.environments.filter((environment) => environment.id !== environmentId);
    this.config.bots = this.config.bots.map((bot) => {
      const activeEnvironmentId = normalizeEnvironmentId(bot.activeEnvironmentId, previousDefaultId);
      return activeEnvironmentId === environmentId
        ? {
            ...bot,
            activeEnvironmentId: undefined,
            activeSessionKey: undefined,
            activeThreadId: undefined,
            updatedAt: now
          }
        : bot;
    });
    this.config.environments = normalizeEnvironments(
      this.config.environments,
      this.config.providers,
      this.config.defaultCwd,
      this.config.defaultEnvironmentId === environmentId ? undefined : this.config.defaultEnvironmentId
    );
    this.config.defaultEnvironmentId = defaultEnvironmentId(this.config.environments);
    await this.save();
    return this.get();
  }

  async setBotStatus(
    botId: string,
    status: FeishuBotConfig["status"],
    statusMessage?: string
  ): Promise<void> {
    const index = this.config.bots.findIndex((bot) => bot.id === botId);
    if (index === -1) {
      return;
    }
    this.config.bots[index] = {
      ...this.config.bots[index],
      status,
      statusMessage,
      updatedAt: nowIso()
    };
    await this.save();
    this.events.publish({ type: "bot.status", botId, status, statusMessage });
  }

  private async save(): Promise<void> {
    await writeJsonFile(CONFIG_PATH, this.config);
    this.events.publish({ type: "config.updated", config: this.get() });
    this.events.publish({ type: "environments.updated", environments: this.get().environments });
  }

  private providerFor(providerId?: string): ProviderConfig {
    const provider = providerId
      ? this.config.providers.find((item) => item.id === providerId)
      : this.config.providers.find((item) => item.id === "codex") ?? this.config.providers[0];
    if (!provider) {
      throw new Error(`Provider not found: ${providerId ?? "default"}`);
    }
    return provider;
  }
}

function defaultConfig(): GatewayConfig {
  const defaultProvider = defaultCodexProvider();
  return {
    dataDir: DATA_DIR,
    defaultCwd: process.cwd(),
    server: {
      host: "127.0.0.1",
      port: 3030
    },
    codex: {
      command: defaultProvider.command,
      preferAppServer: Boolean(defaultProvider.preferAppServer),
      appServerListen: defaultProvider.appServerListen ?? "stdio://"
    },
    providers: [defaultProvider],
    environments: [defaultEnvironment(defaultProvider, process.cwd())],
    defaultEnvironmentId: "default",
    bots: []
  };
}

function migrateConfig(config: z.infer<typeof configSchema>): GatewayConfig {
  const defaultProvider = config.providers.find((provider) => provider.id === "codex") ?? {
    ...defaultCodexProvider(),
    command: config.codex.command,
    preferAppServer: config.codex.preferAppServer,
    appServerListen: "stdio://"
  };
  const environments = normalizeEnvironments(
    config.environments,
    [
      defaultProvider,
      ...config.providers.filter((provider) => provider.id !== defaultProvider.id)
    ],
    config.defaultCwd,
    config.defaultEnvironmentId
  );
  const defaultEnvId = defaultEnvironmentId(environments);
  return {
    ...config,
    dataDir: DATA_DIR,
    defaultCwd: config.defaultCwd?.trim() || process.cwd(),
    bots: config.bots.map((bot): FeishuBotConfig => ({
      ...bot,
      channelType: normalizeChannelType(bot.channelType),
      activeEnvironmentId: normalizeEnvironmentId(bot.activeEnvironmentId, defaultEnvId),
      activeSessionKey: normalizeSessionKeyInput(bot.activeSessionKey ?? bot.activeThreadId),
      activeThreadId: normalizeSessionKeyInput(bot.activeSessionKey ?? bot.activeThreadId),
      allowedOpenIds: bot.allowedOpenIds ?? [],
      allowedChatIds: bot.allowedChatIds ?? []
    })),
    providers: [
      defaultProvider,
      ...config.providers.filter((provider) => provider.id !== defaultProvider.id)
    ],
    environments,
    defaultEnvironmentId: defaultEnvId,
    codex: {
      command: defaultProvider.command,
      preferAppServer: Boolean(defaultProvider.preferAppServer),
      appServerListen: "stdio://"
    }
  };
}

function normalizeChannelType(channelType?: ChannelType | "feishu"): "lark" {
  return channelType === "lark" || channelType === "feishu" ? "lark" : "lark";
}

function defaultCodexProvider(): ProviderConfig {
  return {
    id: "codex",
    type: "codex",
    name: "Codex",
    enabled: true,
    command: "codex",
    preferAppServer: true,
    appServerListen: "stdio://"
  };
}

function defaultEnvironment(provider: ProviderConfig, cwd: string): EnvironmentConfig {
  const now = nowIso();
  return {
    id: "default",
    name: "默认环境",
    description: "本机默认智能体环境",
    enabled: true,
    providerId: provider.id,
    providerType: provider.type,
    defaultCwd: cwd,
    isDefault: true,
    createdAt: now,
    updatedAt: now
  };
}

function normalizeEnvironments(
  environments: EnvironmentConfig[],
  providers: ProviderConfig[],
  defaultCwd: string,
  configuredDefaultId?: string
): EnvironmentConfig[] {
  const codexProvider = providers.find((provider) => provider.id === "codex") ?? providers[0] ?? defaultCodexProvider();
  const now = nowIso();
  const normalized = environments.length
    ? environments.map((environment) => {
        const provider = providers.find((item) => item.id === environment.providerId) ?? codexProvider;
        return {
          ...environment,
          id: environment.id || "default",
          name: environment.name || "默认环境",
          enabled: environment.enabled ?? true,
          providerId: provider.id,
          providerType: provider.type,
          defaultCwd: environment.defaultCwd?.trim() || defaultCwd?.trim() || process.cwd(),
          createdAt: environment.createdAt || now,
          updatedAt: environment.updatedAt || now
        };
      })
    : [defaultEnvironment(codexProvider, defaultCwd?.trim() || process.cwd())];
  const defaultId =
    normalized.find((environment) => environment.id === configuredDefaultId)?.id ??
    normalized.find((environment) => environment.isDefault)?.id ??
    normalized[0]?.id ??
    "default";
  return normalized.map((environment) => ({
    ...environment,
    isDefault: environment.id === defaultId
  }));
}

function defaultEnvironmentId(environments: EnvironmentConfig[]): string {
  return (
    environments.find((environment) => environment.isDefault)?.id ??
    environments[0]?.id ??
    "default"
  );
}

function normalizeEnvironmentId(environmentId: string | undefined, defaultId: string): string | undefined {
  const trimmed = environmentId?.trim();
  return trimmed || defaultId || "default";
}

function slugifyEnvironmentId(name: string, existing: EnvironmentConfig[]): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "environment";
  const used = new Set(existing.map((environment) => environment.id));
  if (!used.has(base)) {
    return base;
  }
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  return `${base}-${nanoid(6)}`;
}
