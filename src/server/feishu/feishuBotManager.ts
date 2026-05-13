import path from "node:path";
import fs from "node:fs/promises";
import { nanoid } from "nanoid";
import type { Client, WSClient } from "@larksuiteoapi/node-sdk";
import * as lark from "@larksuiteoapi/node-sdk";
import type {
  AttachmentInput,
  FeishuBotConfig,
  GatewayTask,
  TaskMessage
} from "../../shared/types.js";
import type { ConfigStore } from "../configStore.js";
import type { Logger } from "../logger.js";
import type { TaskQueue } from "../taskQueue.js";
import type { ProviderRegistry } from "../providers/providerRegistry.js";
import { DEFAULT_CODEX_PROVIDER_ID } from "../providers/sessionKeys.js";
import { ATTACHMENT_DIR, LOG_DIR } from "../paths.js";
import { ensureDir } from "../utils/files.js";
import { nowIso } from "../utils/time.js";
import {
  buildLoadingTaskCard,
  buildTaskCard,
  buildTaskLogCard,
  buildTaskLogMarkdown,
  cardUpdateDelayMs,
  isCancellableTaskStatus,
  isTerminalTaskStatus,
  readTaskLog,
  splitLogForFiles,
  statusLabel
} from "./larkTaskCards.js";

type RuntimeBot = {
  config: FeishuBotConfig;
  client?: Client;
  wsClient?: WSClient;
};

type CardUpdateState = {
  latest?: GatewayTask;
  inFlight: boolean;
  timer?: NodeJS.Timeout;
  terminalRetries: number;
};

export class FeishuBotManager {
  private readonly bots = new Map<string, RuntimeBot>();
  private readonly cardUpdates = new Map<string, CardUpdateState>();
  private readonly reactionCleanups = new Set<string>();

  constructor(
    private readonly configStore: ConfigStore,
    private readonly queue: TaskQueue,
    private readonly logger: Logger,
    private readonly providers: ProviderRegistry
  ) {}

  async startAll(): Promise<void> {
    for (const bot of this.configStore.get().bots) {
      await this.syncBot(bot);
    }
  }

  async syncAll(): Promise<void> {
    const configs = this.configStore.get().bots;
    const existing = new Set(this.bots.keys());
    for (const bot of configs) {
      existing.delete(bot.id);
      await this.syncBot(bot);
    }
    for (const staleBotId of existing) {
      await this.stopBot(staleBotId);
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.bots.keys()].map((botId) => this.stopBot(botId)));
  }

  async updateTaskCard(task: GatewayTask): Promise<void> {
    if (isTerminalTaskStatus(task.status)) {
      void this.removeProcessingReaction(task);
    }
    if (!task.botId || !task.feishu?.chatId) {
      return;
    }
    const state = this.cardUpdates.get(task.id) ?? {
      inFlight: false,
      terminalRetries: 0
    };
    state.latest = task;
    this.cardUpdates.set(task.id, state);

    this.scheduleTaskCardUpdate(task.id, cardUpdateDelayMs(task));
  }

  async handleCardCallback(botId: string, body: unknown): Promise<Record<string, unknown>> {
    const bot = this.configStore.get().bots.find((item) => item.id === botId);
    if (!bot) {
      return toast("error", "Bot not found.");
    }
    const cardHandler = new lark.CardActionHandler(
      {
        encryptKey: bot.encryptKey,
        verificationToken: bot.verificationToken
      },
      async (data: lark.InteractiveCardActionEvent) => this.handleCardAction(botId, data)
    );
    return cardHandler.invoke(body);
  }

  private scheduleTaskCardUpdate(taskId: string, delayMs: number): void {
    const state = this.cardUpdates.get(taskId);
    if (!state) {
      return;
    }
    if (state.timer) {
      clearTimeout(state.timer);
    }
    state.timer = setTimeout(() => {
      state.timer = undefined;
      void this.flushTaskCardUpdate(taskId);
    }, delayMs);
  }

  private async flushTaskCardUpdate(taskId: string): Promise<void> {
    const state = this.cardUpdates.get(taskId);
    if (!state || state.inFlight) {
      return;
    }
    const task = state.latest;
    if (!task) {
      this.cardUpdates.delete(taskId);
      return;
    }
    state.latest = undefined;
    state.inFlight = true;
    const ok = await this.performTaskCardUpdate(task);
    state.inFlight = false;

    const isTerminal = isTerminalTaskStatus(task.status);
    if (!ok && isTerminal && state.terminalRetries < 5) {
      state.terminalRetries += 1;
      state.latest = task;
      this.scheduleTaskCardUpdate(taskId, 1000 * state.terminalRetries);
      return;
    }

    if (state.latest) {
      this.scheduleTaskCardUpdate(taskId, cardUpdateDelayMs(state.latest));
      return;
    }

    if (isTerminal || !ok) {
      this.cardUpdates.delete(taskId);
    }
  }

  private async performTaskCardUpdate(task: GatewayTask): Promise<boolean> {
    const botId = task.botId;
    const feishu = task.feishu;
    if (!botId || !feishu?.chatId) {
      return false;
    }
    const runtime = this.bots.get(botId);
    if (!runtime?.client) {
      return false;
    }
    if (!feishu.cardMessageId && !feishu.messageId) {
      return false;
    }
    try {
      const botConfig = this.configStore.get().bots.find((bot) => bot.id === botId);
      const card = buildTaskCard(task, botConfig?.outputMode ?? "both");
      if (feishu.cardMessageId) {
        await runtime.client.im.v1.message.patch({
          path: {
            message_id: feishu.cardMessageId
          },
          data: {
            content: JSON.stringify(card)
          }
        });
      } else {
        await this.replyTaskCard(runtime.client, task, card);
      }
      return true;
    } catch (error) {
      this.logger.warn("Failed to update Feishu task card", {
        scope: "feishu",
        taskId: task.id,
        environmentId: task.environmentId,
        botId,
        data: larkErrorDetail(error)
      });
      return false;
    }
  }

  private async syncBot(config: FeishuBotConfig): Promise<void> {
    const existing = this.bots.get(config.id);
    if (!config.enabled) {
      await this.stopBot(config.id);
      await this.configStore.setBotStatus(config.id, "disabled");
      return;
    }
    if (existing && existing.config.updatedAt === config.updatedAt) {
      return;
    }
    await this.stopBot(config.id);
    await this.startBot(config);
  }

  private async startBot(config: FeishuBotConfig): Promise<void> {
    await this.configStore.setBotStatus(config.id, "connecting");
    try {
      const client = new lark.Client({
        appId: config.appId,
        appSecret: config.appSecret,
        appType: lark.AppType.SelfBuild,
        domain: lark.Domain.Feishu
      });

      const eventDispatcher = new lark.EventDispatcher({
        encryptKey: config.encryptKey,
        verificationToken: config.verificationToken
      }).register({
        "im.message.receive_v1": async (data: unknown) => {
          await this.handleMessage(config.id, data);
        },
        "card.action.trigger": async (data: unknown) => {
          return this.handleCardAction(config.id, data);
        },
        "card.action.trigger_v1": async (data: unknown) => {
          return this.handleCardAction(config.id, data);
        }
      });

      const wsClient = new lark.WSClient({
        appId: config.appId,
        appSecret: config.appSecret,
        loggerLevel: lark.LoggerLevel.info
      });
      wsClient.start({ eventDispatcher });

      this.bots.set(config.id, {
        config,
        client,
        wsClient
      });
      await this.configStore.setBotStatus(config.id, "connected");
      this.logger.info(`Feishu bot connected: ${config.name}`, {
        scope: "feishu",
        botId: config.id
      });
    } catch (error) {
      await this.configStore.setBotStatus(config.id, "error", String(error));
      this.logger.error("Failed to start Feishu bot", {
        scope: "feishu",
        botId: config.id,
        data: String(error)
      });
    }
  }

  private async stopBot(botId: string): Promise<void> {
    const runtime = this.bots.get(botId);
    if (!runtime) {
      return;
    }
    try {
      runtime.wsClient?.close({ force: true });
    } catch (error) {
      this.logger.warn("Failed to stop Feishu WS client", {
        scope: "feishu",
        botId,
        data: String(error)
      });
    }
    this.bots.delete(botId);
    await this.configStore.setBotStatus(botId, "disconnected");
  }

  private async handleMessage(botId: string, data: unknown): Promise<void> {
    const bot = this.configStore.get().bots.find((item) => item.id === botId);
    const activeSessionKey = bot?.activeSessionKey ?? bot?.activeThreadId;
    if (!bot || !activeSessionKey) {
      this.logger.warn("Feishu message ignored because bot has no active session", {
        scope: "feishu",
        botId
      });
      return;
    }
    const environment = this.configStore.getEnvironment(bot.activeEnvironmentId);
    const parsed = parseFeishuMessage(data);
    if (!isAllowedSender(bot, parsed)) {
      this.logger.warn("Feishu message ignored by allowlist", {
        scope: "feishu",
        botId,
        data: { chatId: parsed.chatId, openId: parsed.openId }
      });
      return;
    }
    if (!parsed.text && parsed.attachments.length === 0) {
      return;
    }
    const approvalIntent = parseApprovalIntent(parsed.text);
    if (approvalIntent !== undefined && parsed.attachments.length === 0) {
      const { sessionKey } = this.providers.resolveSession(activeSessionKey, environment);
      const approvalTask = this.queue.findPendingApprovalForEnvironment(environment.id, sessionKey, botId);
      if (approvalTask) {
        await this.queue.approve(approvalTask.id, approvalIntent);
        this.logger.info("Task approval handled from Feishu text reply", {
          scope: "feishu",
          botId,
          environmentId: environment.id,
          taskId: approvalTask.id
        });
        return;
      }
    }
    const resolved = this.providers.resolveSession(activeSessionKey, environment);
    const attachments = await this.persistAttachments(botId, parsed.attachments);
    const message: TaskMessage = {
      id: nanoid(),
      source: "lark",
      environmentId: resolved.environmentId,
      providerId: resolved.providerId,
      providerType: resolved.providerType,
      channelType: "lark",
      channelBotId: botId,
      botId,
      sessionKey: resolved.sessionKey,
      threadId: resolved.nativeSessionId,
      text: parsed.text || "Please inspect the attached file(s).",
      attachments,
      createdAt: nowIso(),
      feishu: {
        chatId: parsed.chatId,
        openId: parsed.openId,
        messageId: parsed.messageId,
        processingReactionEmoji: bot.processingReceiptEmoji
      }
    };
    const [processingReactionId, loadingCardMessageId] = await Promise.all([
      this.addProcessingReaction(bot, parsed.messageId).catch((error: unknown) => {
        this.logger.warn("Failed to add Feishu processing receipt", {
          scope: "feishu",
          botId,
          environmentId: resolved.environmentId,
          data: larkErrorDetail(error)
        });
        return undefined;
      }),
      this.replyLoadingTaskCard(botId, message).catch((error: unknown) => {
        this.logger.warn("Failed to send Feishu loading card", {
          scope: "feishu",
          botId,
          environmentId: resolved.environmentId,
          data: larkErrorDetail(error)
        });
        return undefined;
      })
    ]);
    if (processingReactionId) {
      message.feishu = {
        ...message.feishu,
        processingReactionId
      };
    }
    if (loadingCardMessageId) {
      message.feishu = {
        ...message.feishu,
        cardMessageId: loadingCardMessageId
      };
    }
    this.queue.enqueue(message, bot.runningMessageMode);
  }

  private async handleCardAction(botId: string, data: unknown): Promise<Record<string, unknown>> {
    const value = extractCardActionValue(data);
    if (!value?.taskId) {
      return toast("info", "No task id found in card action.");
    }
    const replyMessageId = extractCardMessageId(data);
    if (value.action === "cancel_task") {
      const task = this.queue.get(value.taskId);
      if (!task) {
        return toast("warning", "Task not found.");
      }
      if (!isCancellableTaskStatus(task.status)) {
        return toast("info", `Task is already ${statusLabel(task.status)}.`);
      }
      await this.queue.cancel(value.taskId);
      this.logger.info("Task cancellation requested from Feishu card", {
        scope: "feishu",
        botId,
        environmentId: task.environmentId,
        taskId: value.taskId
      });
      return toast("success", "Cancel requested.");
    }
    if (value.action === "approve_task" || value.action === "reject_task") {
      const approved = value.action === "approve_task";
      const task = this.queue.get(value.taskId);
      if (!task?.approval || task.status !== "waiting_approval") {
        return toast("warning", "No pending approval found for this task.");
      }
      await this.queue.approve(value.taskId, approved);
      return toast("success", approved ? "Approved." : "Rejected.");
    }
    if (value.action === "view_log") {
      const task = this.queue.get(value.taskId) ?? (await this.taskFromLocalLog(value.taskId));
      if (!task) {
        return toast("warning", "Task log not found.");
      }
      try {
        await this.sendTaskLog(botId, task, {
          chatId: value.chatId ?? task.feishu?.chatId,
          replyMessageId
        });
        return toast("success", "Task log sent.");
      } catch (error) {
        this.logger.warn("Failed to send Feishu task log", {
          scope: "feishu",
          botId,
          environmentId: task.environmentId,
          taskId: value.taskId,
          data: larkErrorDetail(error)
        });
        return toast("error", "Failed to send task log.");
      }
    }
    if (value.action === "retry_task") {
      if (value.disabled === true || value.disabled === "true") {
        return toast("info", "Task is still running.");
      }
      const task = this.queue.get(value.taskId) ?? (await this.taskFromLocalLog(value.taskId));
      if (!task) {
        return toast("warning", "Task not found.");
      }
      const bot = this.configStore.get().bots.find((item) => item.id === botId);
      const runtime = this.bots.get(botId);
      const retryMessage: TaskMessage = {
        id: nanoid(),
        source: "lark",
        environmentId: task.environmentId,
        providerId: task.providerId,
        providerType: task.providerType,
        channelType: "lark",
        channelBotId: botId,
        botId,
        sessionKey: task.sessionKey,
        threadId: task.threadId,
        text: task.text,
        attachments: [],
        createdAt: nowIso(),
        feishu: {
          chatId: value.chatId ?? task.feishu?.chatId,
          messageId: task.feishu?.messageId
        }
      };
      if (runtime?.client && retryMessage.feishu?.messageId) {
        const loadingCardMessageId = await this.replyLoadingTaskCard(botId, retryMessage).catch(() => undefined);
        retryMessage.feishu.cardMessageId = loadingCardMessageId;
      }
      this.queue.enqueue(retryMessage, bot?.runningMessageMode ?? "queue");
      return toast("success", "Retried.");
    }
    return toast("info", "Action received.");
  }

  private async replyLoadingTaskCard(botId: string, message: TaskMessage): Promise<string | undefined> {
    const runtime = this.bots.get(botId);
    if (!runtime?.client) {
      return undefined;
    }
    const card = buildLoadingTaskCard(message);
    const response = await replyFeishuMessage(runtime.client, {
      replyMessageId: message.feishu?.messageId,
      msgType: "interactive",
      content: card,
      uuid: `${message.id}-loading`
    });
    return response?.message_id;
  }

  private async addProcessingReaction(
    bot: FeishuBotConfig,
    messageId?: string
  ): Promise<string | undefined> {
    if (!bot.processingReceiptEnabled || !messageId) {
      return undefined;
    }
    const runtime = this.bots.get(bot.id);
    if (!runtime?.client) {
      return undefined;
    }
    const response = await runtime.client.im.v1.messageReaction.create({
      path: {
        message_id: messageId
      },
      data: {
        reaction_type: {
          emoji_type: bot.processingReceiptEmoji || "THINKING"
        }
      }
    });
    const reactionId = normalizeFeishuReactionResponse(response)?.reaction_id;
    if (!reactionId) {
      throw new Error("Feishu reaction create response did not include reaction_id.");
    }
    return reactionId;
  }

  private async removeProcessingReaction(task: GatewayTask): Promise<void> {
    const botId = task.botId;
    const messageId = task.feishu?.messageId;
    const reactionId = task.feishu?.processingReactionId;
    if (!botId || !messageId || !reactionId || this.reactionCleanups.has(task.id)) {
      return;
    }
    const runtime = this.bots.get(botId);
    if (!runtime?.client) {
      return;
    }
    this.reactionCleanups.add(task.id);
    try {
      await runtime.client.im.v1.messageReaction.delete({
        path: {
          message_id: messageId,
          reaction_id: reactionId
        }
      });
    } catch (error) {
      this.logger.warn("Failed to remove Feishu processing receipt", {
        scope: "feishu",
        botId,
        taskId: task.id,
        environmentId: task.environmentId,
        data: larkErrorDetail(error)
      });
    }
  }

  private async replyTaskCard(
    client: Client,
    task: GatewayTask,
    card: Record<string, unknown>
  ): Promise<void> {
    const response = await replyFeishuMessage(client, {
      replyMessageId: task.feishu?.messageId,
      msgType: "interactive",
      content: card,
      uuid: `${task.id}-card`
    });
    const cardMessageId = response?.message_id;
    if (cardMessageId && task.feishu) {
      task.feishu.cardMessageId = cardMessageId;
    }
  }

  private async taskFromLocalLog(taskId: string): Promise<GatewayTask | undefined> {
    const rawLogPath = path.join(LOG_DIR, `${taskId}.log`);
    try {
      await fs.access(rawLogPath);
    } catch {
      return undefined;
    }
    const now = nowIso();
    return {
      id: taskId,
      environmentId: "default",
      providerId: DEFAULT_CODEX_PROVIDER_ID,
      providerType: "codex",
      channelType: "lark",
      sessionKey: "-",
      threadId: "-",
      source: "lark",
      status: "completed",
      text: `历史任务 ${taskId}`,
      attachments: [],
      createdAt: now,
      updatedAt: now,
      currentStep: "本地历史日志",
      rawLogPath
    };
  }

  private async sendTaskLog(
    botId: string,
    task: GatewayTask,
    target: { chatId?: string; replyMessageId?: string } = {}
  ): Promise<void> {
    const runtime = this.bots.get(botId);
    const chatId = target.chatId ?? task.feishu?.chatId;
    if (!runtime?.client || (!chatId && !target.replyMessageId)) {
      throw new Error("Feishu runtime and target missing.");
    }

    const logContent = await readTaskLog(task);
    const fileChunks = splitLogForFiles(logContent);
    const card = buildTaskLogCard(task, logContent, fileChunks.length);
    await sendFeishuMessage(runtime.client, {
      chatId,
      replyMessageId: target.replyMessageId,
      msgType: "interactive",
      content: card,
      uuid: `${task.id}-log-card-${Date.now()}`
    });

    for (let index = 0; index < fileChunks.length; index += 1) {
      const suffix = fileChunks.length > 1 ? `.part-${String(index + 1).padStart(2, "0")}` : "";
      const fileName = `local-agent-gateway-${task.id}${suffix}.md`;
      const markdownLog = buildTaskLogMarkdown(task, fileChunks[index] || "日志为空。\n", index + 1, fileChunks.length);
      const upload = await runtime.client.im.v1.file.create({
        data: {
          file_type: "stream",
          file_name: fileName,
          file: Buffer.from(markdownLog)
        }
      });
      const fileKey = upload?.file_key;
      if (!fileKey) {
        throw new Error("Feishu file upload did not return file_key.");
      }
      await sendFeishuMessage(runtime.client, {
        chatId,
        replyMessageId: target.replyMessageId,
        msgType: "file",
        content: { file_key: fileKey },
        uuid: `${task.id}-log-file-${index + 1}-${Date.now()}`
      });
    }
  }

  private async persistAttachments(
    botId: string,
    attachments: AttachmentInput[]
  ): Promise<AttachmentInput[]> {
    if (attachments.length === 0) {
      return [];
    }
    const dir = path.join(ATTACHMENT_DIR, botId, nowIso().replace(/[:.]/g, "-"));
    await ensureDir(dir);
    const persisted: AttachmentInput[] = [];
    const runtime = this.bots.get(botId);
    for (const attachment of attachments) {
      const filePath = path.join(dir, sanitizeFileName(attachment.name));
      if (runtime?.client && attachment.messageId && attachment.fileKey) {
        try {
          await downloadFeishuMessageResource(runtime.client, attachment, filePath);
        } catch (error) {
          await fs.writeFile(
            filePath,
            `Failed to download Feishu attachment ${attachment.fileKey}: ${String(error)}\n`,
            "utf8"
          );
          this.logger.warn("Failed to download Feishu attachment", {
            scope: "feishu",
            botId,
            data: String(error)
          });
        }
      } else {
        await fs.writeFile(filePath, "");
      }
      persisted.push({
        ...attachment,
        channelType: "lark",
        channelBotId: botId,
        localPath: filePath
      });
    }
    return persisted;
  }
}

async function sendFeishuMessage(
  client: Client,
  input: {
    chatId?: string;
    replyMessageId?: string;
    msgType: string;
    content: Record<string, unknown>;
    uuid: string;
  }
): Promise<{ message_id?: string } | undefined> {
  const data = {
    msg_type: input.msgType,
    content: JSON.stringify(input.content),
    uuid: input.uuid
  };
  if (input.chatId) {
    const response = await client.im.v1.message.create({
      params: {
        receive_id_type: "chat_id"
      },
      data: {
        ...data,
        receive_id: input.chatId
      }
    });
    return normalizeFeishuMessageResponse(response);
  }
  if (input.replyMessageId) {
    const response = await client.im.v1.message.reply({
      path: {
        message_id: input.replyMessageId
      },
      data
    });
    return normalizeFeishuMessageResponse(response);
  }
  throw new Error("No Feishu message target.");
}

function normalizeFeishuMessageResponse(response: unknown): { message_id?: string } | undefined {
  if (!response || typeof response !== "object") {
    return undefined;
  }
  const record = response as Record<string, unknown>;
  if (typeof record.message_id === "string") {
    return { message_id: record.message_id };
  }
  const data = record.data;
  if (data && typeof data === "object" && typeof (data as Record<string, unknown>).message_id === "string") {
    return { message_id: (data as Record<string, string>).message_id };
  }
  return undefined;
}

function normalizeFeishuReactionResponse(response: unknown): { reaction_id?: string } | undefined {
  if (!response || typeof response !== "object") {
    return undefined;
  }
  const record = response as Record<string, unknown>;
  if (typeof record.reaction_id === "string") {
    return { reaction_id: record.reaction_id };
  }
  const data = record.data;
  if (data && typeof data === "object" && typeof (data as Record<string, unknown>).reaction_id === "string") {
    return { reaction_id: (data as Record<string, string>).reaction_id };
  }
  return undefined;
}

async function replyFeishuMessage(
  client: Client,
  input: {
    replyMessageId?: string;
    msgType: string;
    content: Record<string, unknown>;
    uuid: string;
  }
): Promise<{ message_id?: string } | undefined> {
  if (!input.replyMessageId) {
    throw new Error("No Feishu reply target.");
  }
  return sendFeishuMessage(client, input);
}

function parseApprovalIntent(text: string): boolean | undefined {
  const normalized = text.trim().toLowerCase();
  if (["同意", "批准", "通过", "approve", "approved", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["拒绝", "不同意", "否", "reject", "rejected", "no", "n"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function isAllowedSender(
  bot: FeishuBotConfig,
  parsed: { chatId?: string; openId?: string }
): boolean {
  const userAllowed =
    bot.allowedOpenIds.length === 0 || (parsed.openId ? bot.allowedOpenIds.includes(parsed.openId) : false);
  const chatAllowed =
    bot.allowedChatIds.length === 0 || (parsed.chatId ? bot.allowedChatIds.includes(parsed.chatId) : false);
  return userAllowed && chatAllowed;
}

function parseFeishuMessage(data: unknown): {
  text: string;
  chatId?: string;
  openId?: string;
  messageId?: string;
  attachments: AttachmentInput[];
} {
  const record = data as Record<string, unknown>;
  const event = (record.event ?? record) as Record<string, unknown>;
  const message = (event.message ?? {}) as Record<string, unknown>;
  const sender = (event.sender ?? {}) as Record<string, unknown>;
  const senderId = (sender.sender_id ?? {}) as Record<string, unknown>;
  const content = typeof message.content === "string" ? message.content : "";
  const messageId = stringValue(message.message_id);
  const messageType = stringValue(message.message_type);
  let text = "";
  const attachments: AttachmentInput[] = [];

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    text =
      typeof parsed.text === "string"
        ? parsed.text
        : typeof parsed.content === "string"
          ? parsed.content
          : "";
    attachments.push(...extractFeishuAttachments(parsed, messageId, messageType));
  } catch {
    text = content;
  }

  return {
    text: text.trim(),
    chatId: stringValue(message.chat_id),
    messageId,
    openId: stringValue(senderId.open_id),
    attachments
  };
}

function extractFeishuAttachments(
  content: Record<string, unknown>,
  messageId?: string,
  messageType?: string
): AttachmentInput[] {
  const attachments: AttachmentInput[] = [];
  const imageKey = stringValue(content.image_key);
  if (imageKey) {
    attachments.push({
      id: nanoid(),
      name: `${imageKey}.image`,
      source: "lark",
      channelType: "lark",
      mimeType: "image/*",
      fileKey: imageKey,
      resourceType: "image",
      messageId
    });
  }

  const fileKey = stringValue(content.file_key);
  if (fileKey) {
    attachments.push({
      id: nanoid(),
      name: stringValue(content.file_name) ?? stringValue(content.name) ?? `${fileKey}.file`,
      source: "lark",
      channelType: "lark",
      mimeType: mimeTypeForMessage(messageType),
      size: numberValue(content.size),
      fileKey,
      resourceType: resourceTypeForMessage(messageType),
      messageId
    });
  }

  for (const [key, value] of Object.entries(content)) {
    if (key === "image_key" || key === "file_key") {
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      attachments.push(...extractFeishuAttachments(value as Record<string, unknown>, messageId, messageType));
    }
  }
  return attachments;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function resourceTypeForMessage(messageType?: string): AttachmentInput["resourceType"] {
  if (messageType === "image") {
    return "image";
  }
  if (messageType === "audio") {
    return "audio";
  }
  if (messageType === "media") {
    return "video";
  }
  if (messageType === "file") {
    return "file";
  }
  return "unknown";
}

function mimeTypeForMessage(messageType?: string): string | undefined {
  if (messageType === "image") {
    return "image/*";
  }
  if (messageType === "audio") {
    return "audio/*";
  }
  if (messageType === "media") {
    return "video/*";
  }
  return undefined;
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[/:\\]/g, "_").replace(/\0/g, "").trim();
  return cleaned || `attachment-${Date.now()}`;
}

async function downloadFeishuMessageResource(
  client: Client,
  attachment: AttachmentInput,
  filePath: string
): Promise<void> {
  const response = await client.im.v1.messageResource.get({
    params: {
      type: attachment.resourceType === "unknown" || !attachment.resourceType ? "file" : attachment.resourceType
    },
    path: {
      message_id: attachment.messageId ?? "",
      file_key: attachment.fileKey ?? ""
    }
  });
  await response.writeFile(filePath);
}

function extractCardActionValue(data: unknown): { action?: string; taskId?: string; chatId?: string; disabled?: boolean | string } | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const record = unwrapFeishuEvent(data as Record<string, unknown>);
  const action = record.action as Record<string, unknown> | undefined;
  const value = action?.value;
  if (value && typeof value === "object") {
    return value as { action?: string; taskId?: string; chatId?: string; disabled?: boolean | string };
  }
  return undefined;
}

function extractCardMessageId(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const record = unwrapFeishuEvent(data as Record<string, unknown>);
  for (const key of ["open_message_id", "message_id"]) {
    const value = record[key];
    if (typeof value === "string" && value) {
      return value;
    }
  }
  const context = record.context;
  if (context && typeof context === "object") {
    const openMessageId = (context as Record<string, unknown>).open_message_id;
    if (typeof openMessageId === "string" && openMessageId) {
      return openMessageId;
    }
  }
  return undefined;
}

function unwrapFeishuEvent(record: Record<string, unknown>): Record<string, unknown> {
  const event = record.event;
  if (event && typeof event === "object" && !Array.isArray(event)) {
    return event as Record<string, unknown>;
  }
  return record;
}

function toast(type: "success" | "info" | "warning" | "error", content: string): Record<string, unknown> {
  return {
    toast: {
      type,
      content
    }
  };
}

function larkErrorDetail(error: unknown): unknown {
  if (!error || typeof error !== "object") {
    return String(error);
  }
  const record = error as {
    message?: unknown;
    response?: {
      status?: unknown;
      data?: unknown;
    };
  };
  return {
    message: typeof record.message === "string" ? record.message : String(error),
    status: record.response?.status,
    response: record.response?.data
  };
}
