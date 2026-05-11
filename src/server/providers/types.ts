import type {
  AgentSessionMessage,
  AgentSessionSummary,
  AttachmentInput,
  GatewayTask,
  ProviderType,
  TaskMessage
} from "../../shared/types.js";

export type CreateAgentSessionInput = {
  environmentId?: string;
  title: string;
  cwd?: string;
};

export type AgentAttachmentContent = {
  content: Buffer;
  mimeType: string;
  name: string;
};

export interface AgentProvider {
  readonly id: string;
  readonly type: ProviderType;
  init(): Promise<void>;
  listSessions(): Promise<AgentSessionSummary[]>;
  createSession(input: CreateAgentSessionInput): Promise<AgentSessionSummary>;
  getSessionMessages(sessionKey: string, limit?: number): Promise<AgentSessionMessage[]>;
  resolveSessionKey(value: string): string;
  resolveNativeSessionId(value: string): string;
  taskFromMessage(message: TaskMessage): GatewayTask;
  runTask(task: GatewayTask): Promise<GatewayTask>;
  cancelTask(task: GatewayTask): Promise<void>;
  approveTask(taskId: string, approved: boolean): Promise<GatewayTask>;
  getAttachmentContent(attachmentId: string): Promise<AgentAttachmentContent | undefined>;
}
