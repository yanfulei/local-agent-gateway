import type {
  AgentSessionMessage,
  AgentSessionSummary,
  ChannelBotConfig,
  EnvironmentConfig,
  ProviderType
} from "../../shared/types.js";
import type { AgentAttachmentContent, AgentProvider, CreateAgentSessionInput } from "./types.js";
import {
  DEFAULT_CODEX_PROVIDER_ID,
  normalizeSessionKeyInput,
  parseSessionKey
} from "./sessionKeys.js";

export type ResolvedSession = {
  provider: AgentProvider;
  environment: EnvironmentConfig;
  environmentId: string;
  sessionKey: string;
  nativeSessionId: string;
  providerId: string;
  providerType: ProviderType;
};

export class ProviderRegistry {
  private readonly providers = new Map<string, AgentProvider>();
  private readonly initialized = new Set<string>();
  private readonly initializing = new Map<string, Promise<void>>();

  register(provider: AgentProvider): void {
    this.providers.set(provider.id, provider);
  }

  listProviders(): AgentProvider[] {
    return [...this.providers.values()];
  }

  get(providerId: string): AgentProvider | undefined {
    return this.providers.get(providerId);
  }

  defaultProvider(): AgentProvider {
    const provider =
      this.providers.get(DEFAULT_CODEX_PROVIDER_ID) ?? this.providers.values().next().value;
    if (!provider) {
      throw new Error("No local agent provider is registered.");
    }
    return provider;
  }

  async initAll(): Promise<void> {
    for (const provider of this.providers.values()) {
      await this.initProvider(provider);
    }
  }

  async listSessions(
    environments?: EnvironmentConfig[],
    bindings: ChannelBotConfig[] = []
  ): Promise<AgentSessionSummary[]> {
    const environmentList = environments?.length
      ? environments
      : [...this.providers.values()].map((provider) => providerEnvironment(provider));
    const ownerBySessionKey = sessionOwnersByBinding(bindings);
    const environmentsByProvider = new Map<string, EnvironmentConfig[]>();
    for (const environment of environmentList) {
      const provider = this.providerForEnvironment(environment);
      const current = environmentsByProvider.get(provider.id) ?? [];
      current.push(environment);
      environmentsByProvider.set(provider.id, current);
    }
    const groups = await Promise.all(
      [...environmentsByProvider.entries()].map(async ([providerId, providerEnvironments]) => {
        const provider = this.get(providerId);
        if (!provider) {
          throw new Error(`Provider not found: ${providerId}`);
        }
        await this.initProvider(provider);
        const sessions = await provider.listSessions();
        return sessions.map((session) => {
          const environment =
            environmentForProviderSession(session, providerEnvironments, ownerBySessionKey) ??
            providerEnvironments[0];
          return stampEnvironment(session, environment);
        });
      })
    );
    return dedupeSessions(groups.flat()).sort((a, b) => {
      const left = a.lastActivityAt ?? "";
      const right = b.lastActivityAt ?? "";
      return right.localeCompare(left);
    });
  }

  async listEnvironmentSessions(environment: EnvironmentConfig): Promise<AgentSessionSummary[]> {
    return this.listSessions([environment]);
  }

  async createSession(input: CreateAgentSessionInput & { environment: EnvironmentConfig }): Promise<AgentSessionSummary> {
    const provider = this.providerForEnvironment(input.environment);
    await this.initProvider(provider);
    const session = await provider.createSession({
      ...input,
      cwd: input.cwd ?? input.environment.defaultCwd
    });
    return stampEnvironment(session, input.environment);
  }

  resolveSession(value: string, environment?: EnvironmentConfig): ResolvedSession {
    const parsed = parseSessionKey(normalizeSessionKeyInput(value));
    const provider = environment ? this.providerForEnvironment(environment) : parsed ? this.get(parsed.providerId) : this.defaultProvider();
    if (!provider) {
      throw new Error(`Provider not found for session: ${value}`);
    }
    const sessionKey = provider.resolveSessionKey(value);
    const resolvedEnvironment = environment ?? providerEnvironment(provider);
    return {
      provider,
      environment: resolvedEnvironment,
      environmentId: resolvedEnvironment.id,
      sessionKey,
      nativeSessionId: provider.resolveNativeSessionId(sessionKey),
      providerId: provider.id,
      providerType: provider.type
    };
  }

  providerForSession(sessionKey: string, environment?: EnvironmentConfig): AgentProvider {
    return this.resolveSession(sessionKey, environment).provider;
  }

  async getSessionMessages(sessionKey: string, environment?: EnvironmentConfig, limit?: number): Promise<AgentSessionMessage[]> {
    const resolved = this.resolveSession(sessionKey, environment);
    await this.initProvider(resolved.provider);
    const messages = await resolved.provider.getSessionMessages(resolved.sessionKey, limit);
    return messages.map((message) => ({
      ...message,
      environmentId: resolved.environmentId
    }));
  }

  async getAttachmentContent(
    attachmentId: string
  ): Promise<AgentAttachmentContent | undefined> {
    for (const provider of this.providers.values()) {
      const content = await provider.getAttachmentContent(attachmentId);
      if (content) {
        return content;
      }
    }
    return undefined;
  }

  private providerForEnvironment(environment: EnvironmentConfig): AgentProvider {
    const provider = this.get(environment.providerId);
    if (!provider) {
      throw new Error(`Provider not found for environment ${environment.id}: ${environment.providerId}`);
    }
    return provider;
  }

  private async initProvider(provider: AgentProvider): Promise<void> {
    if (this.initialized.has(provider.id)) {
      return;
    }
    const existing = this.initializing.get(provider.id);
    if (existing) {
      await existing;
      return;
    }
    const pending = provider.init().then(
      () => {
        this.initialized.add(provider.id);
      },
      (error) => {
        this.initialized.delete(provider.id);
        throw error;
      }
    ).finally(() => {
      this.initializing.delete(provider.id);
    });
    this.initializing.set(provider.id, pending);
    await pending;
  }
}

function providerEnvironment(provider: AgentProvider): EnvironmentConfig {
  const now = new Date(0).toISOString();
  return {
    id: provider.id,
    name: provider.id,
    enabled: true,
    providerId: provider.id,
    providerType: provider.type,
    defaultCwd: process.cwd(),
    createdAt: now,
    updatedAt: now
  };
}

function stampEnvironment(
  session: AgentSessionSummary,
  environment: EnvironmentConfig
): AgentSessionSummary {
  return {
    ...session,
    environmentId: environment.id,
    providerId: environment.providerId,
    providerType: environment.providerType
  };
}

function dedupeSessions(sessions: AgentSessionSummary[]): AgentSessionSummary[] {
  const byKey = new Map<string, AgentSessionSummary>();
  for (const session of sessions) {
    const key = session.sessionKey;
    const existing = byKey.get(key);
    if (!existing || (session.lastActivityAt ?? "").localeCompare(existing.lastActivityAt ?? "") > 0) {
      byKey.set(key, session);
    }
  }
  return [...byKey.values()];
}

function sessionOwnersByBinding(bindings: ChannelBotConfig[]): Map<string, string> {
  const owners = new Map<string, string>();
  for (const binding of bindings) {
    const activeKey = normalizeSessionKeyInput(binding.activeSessionKey ?? binding.activeThreadId);
    if (activeKey && binding.activeEnvironmentId) {
      owners.set(activeKey, binding.activeEnvironmentId);
    }
  }
  return owners;
}

function environmentForProviderSession(
  session: AgentSessionSummary,
  environments: EnvironmentConfig[],
  ownerBySessionKey: Map<string, string>
): EnvironmentConfig | undefined {
  const ownerEnvironmentId = ownerBySessionKey.get(session.sessionKey);
  if (ownerEnvironmentId) {
    const owned = environments.find((environment) => environment.id === ownerEnvironmentId);
    if (owned) {
      return owned;
    }
  }
  const sessionEnvironment = environments.find((environment) => environment.id === session.environmentId);
  if (sessionEnvironment) {
    return sessionEnvironment;
  }
  return environments.find((environment) => environment.isDefault) ?? environments[0];
}
