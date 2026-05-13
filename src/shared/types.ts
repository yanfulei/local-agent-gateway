export type BotStatus = "disabled" | "disconnected" | "connecting" | "connected" | "error";

export type TaskStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentSessionStatus = "unknown" | "idle" | "running" | "waiting_approval" | "error";
export type CodexThreadStatus = AgentSessionStatus;
export type AgentSessionStatusAlias = AgentSessionStatus;

export type ProviderType = "codex" | "claude-code" | "openclaw" | "hermes";
export type ChannelType = "lark" | "dingtalk" | "wechat";
export type MessageSource = "web" | ChannelType;
export const PROVIDER_CAPABILITIES = [
  "session.list",
  "session.create",
  "session.history",
  "message.send",
  "attachment.input",
  "task.cancel",
  "approval",
  "app-server",
  "exec-fallback"
] as const;
export type ProviderCapability = (typeof PROVIDER_CAPABILITIES)[number];
export const CODEX_PROVIDER_CAPABILITIES = PROVIDER_CAPABILITIES;

export type ProviderConfig = {
  id: string;
  type: ProviderType;
  name: string;
  enabled: boolean;
  command: string;
  capabilities?: ProviderCapability[];
  preferAppServer?: boolean;
  appServerListen?: string;
};

export type EnvironmentConfig = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  providerId: string;
  providerType: ProviderType;
  defaultCwd: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RunningMessageMode = "steer" | "queue";

export type OutputMode = "structured" | "raw" | "both";

export type ChannelBotBase = {
  id: string;
  channelType: ChannelType;
  name: string;
  enabled: boolean;
  allowedOpenIds: string[];
  allowedChatIds: string[];
  activeEnvironmentId?: string;
  activeSessionKey?: string;
  activeThreadId?: string;
  runningMessageMode: RunningMessageMode;
  outputMode: OutputMode;
  status: BotStatus;
  statusMessage?: string;
  updatedAt: string;
};

export type FeishuBotConfig = ChannelBotBase & {
  channelType: "lark";
  appId: string;
  appSecret: string;
  verificationToken?: string;
  encryptKey?: string;
  processingReceiptEnabled: boolean;
  processingReceiptEmoji: string;
};

export type ChannelBotConfig = FeishuBotConfig;

export type GatewayConfig = {
  dataDir: string;
  defaultCwd: string;
  server: {
    host: string;
    port: number;
  };
  codex: {
    command: string;
    preferAppServer: boolean;
    appServerListen: string;
  };
  providers: ProviderConfig[];
  environments: EnvironmentConfig[];
  defaultEnvironmentId: string;
  bots: ChannelBotConfig[];
};

export type AgentSessionSummary = {
  id: string;
  sessionKey: string;
  environmentId: string;
  providerId: string;
  providerType: ProviderType;
  nativeSessionId: string;
  title: string;
  cwd?: string;
  source: "provider-history" | "provider-runtime" | "gateway-overlay";
  status: AgentSessionStatus;
  providerThreadId?: string;
  provider?: "codex-app-server" | "codex-exec";
  lastActivityAt?: string;
  firstMessage?: string;
  lastMessage?: string;
  sessionFile?: string;
};
export type CodexThreadSummary = AgentSessionSummary;
export type LocalAgentSession = AgentSessionSummary;

export type AttachmentResourceType = "image" | "file" | "audio" | "video" | "unknown";

export type CodexThreadMessageAttachment = {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  resourceType: AttachmentResourceType;
  dataUrl?: string;
  url?: string;
  localPath?: string;
};

export type CodexThreadMessagePart =
  | { type: "text"; text: string }
  | { type: "attachment"; attachment: CodexThreadMessageAttachment };

export type AgentSessionMessage = {
  id: string;
  environmentId?: string;
  sessionKey: string;
  threadId: string;
  role: "user" | "assistant";
  text: string;
  parts?: CodexThreadMessagePart[];
  attachments?: CodexThreadMessageAttachment[];
  createdAt: string;
};
export type CodexThreadMessage = AgentSessionMessage;
export type LocalAgentSessionMessage = AgentSessionMessage;

export type AttachmentInput = {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  localPath?: string;
  source: MessageSource;
  channelType?: ChannelType;
  channelBotId?: string;
  fileKey?: string;
  resourceType?: AttachmentResourceType;
  messageId?: string;
};

export type TaskMessage = {
  id: string;
  source: MessageSource;
  environmentId: string;
  providerId: string;
  providerType: ProviderType;
  channelType?: ChannelType;
  channelBotId?: string;
  botId?: string;
  sessionKey: string;
  threadId: string;
  text: string;
  attachments: AttachmentInput[];
  createdAt: string;
  feishu?: {
    chatId?: string;
    openId?: string;
    messageId?: string;
    cardMessageId?: string;
    processingReactionId?: string;
    processingReactionEmoji?: string;
  };
};

export type ApprovalRequest = {
  id: string;
  taskId: string;
  environmentId?: string;
  sessionKey: string;
  threadId: string;
  providerThreadId?: string;
  providerTurnId?: string;
  providerRequestId?: string | number;
  providerMethod?: string;
  title: string;
  description?: string;
  command?: string;
  diff?: string;
  createdAt: string;
};

export type GatewayTask = {
  id: string;
  environmentId: string;
  providerId: string;
  providerType: ProviderType;
  channelType?: ChannelType;
  channelBotId?: string;
  botId?: string;
  sessionKey: string;
  threadId: string;
  source: MessageSource;
  status: TaskStatus;
  text: string;
  attachments: AttachmentInput[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  summary?: string;
  error?: string;
  currentStep?: string;
  rawLogPath?: string;
  approval?: ApprovalRequest;
  feishu?: TaskMessage["feishu"];
};

export type LogEntry = {
  id: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  scope?: string;
  taskId?: string;
  environmentId?: string;
  providerId?: string;
  providerType?: ProviderType;
  channelType?: ChannelType;
  channelBotId?: string;
  botId?: string;
  sessionKey?: string;
  threadId?: string;
  data?: unknown;
  createdAt: string;
};

export type GatewayEvent =
  | { type: "config.updated"; config: GatewayConfig }
  | { type: "bot.status"; botId: string; status: BotStatus; statusMessage?: string }
  | { type: "environments.updated"; environments: EnvironmentConfig[] }
  | { type: "sessions.updated"; sessions: AgentSessionSummary[] }
  | { type: "threads.updated"; threads: CodexThreadSummary[] }
  | { type: "task.updated"; task: GatewayTask }
  | { type: "log"; entry: LogEntry };

export type DashboardState = {
  config: GatewayConfig;
  environments: EnvironmentConfig[];
  sessions: AgentSessionSummary[];
  threads: CodexThreadSummary[];
  tasks: GatewayTask[];
  logs: LogEntry[];
};

export type CreateBotInput = Omit<
  FeishuBotConfig,
  "id" | "status" | "statusMessage" | "updatedAt" | "channelType"
> & {
  channelType?: ChannelType;
};

export type UpdateBotInput = Partial<CreateBotInput> & {
  status?: BotStatus;
  statusMessage?: string;
};

export type UpdateConfigInput = Partial<
  Pick<GatewayConfig, "defaultCwd"> & {
    codex: Partial<GatewayConfig["codex"]>;
    providers: ProviderConfig[];
  }
>;

export type UpdateProviderInput = Partial<
  Pick<ProviderConfig, "name" | "enabled" | "command" | "preferAppServer" | "appServerListen">
>;

export type CreateEnvironmentInput = {
  name: string;
  description?: string;
  providerId?: string;
  defaultCwd?: string;
  enabled?: boolean;
};

export type UpdateEnvironmentInput = Partial<CreateEnvironmentInput> & {
  isDefault?: boolean;
};

export type CreateThreadInput = {
  title: string;
  environmentId?: string;
  cwd?: string;
  bindBotId?: string;
};
export type CreateAgentSessionRequest = CreateThreadInput;

export type UpdateThreadBindingInput = {
  environmentId?: string;
  botId?: string;
};
export type UpdateSessionBindingInput = UpdateThreadBindingInput;

export type SendMessageInput = {
  source: "web";
  environmentId?: string;
  botId?: string;
  sessionKey?: string;
  threadId?: string;
  text: string;
  attachments?: AttachmentInput[];
};
