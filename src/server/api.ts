import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import fastifyStatic from "@fastify/static";
import cors from "cors";
import fastifyPlugin from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type { CodexAppServerClient } from "./codex/appServerClient.js";
import type { ConfigStore } from "./configStore.js";
import type { GatewayEventBus } from "./events.js";
import type { FeishuBotManager } from "./feishu/feishuBotManager.js";
import type { Logger } from "./logger.js";
import type { TaskQueue } from "./taskQueue.js";
import type { ProviderRegistry } from "./providers/providerRegistry.js";
import { ATTACHMENT_DIR } from "./paths.js";
import { ensureDir } from "./utils/files.js";
import type {
  AttachmentInput,
  CreateBotInput,
  CreateEnvironmentInput,
  CreateThreadInput,
  GatewayEvent,
  SendMessageInput,
  UpdateConfigInput,
  UpdateEnvironmentInput,
  UpdateBotInput,
  UpdateThreadBindingInput
} from "../shared/types.js";

export type ApiDeps = {
  configStore: ConfigStore;
  providers: ProviderRegistry;
  taskQueue: TaskQueue;
  feishuBotManager: FeishuBotManager;
  events: GatewayEventBus;
  logger: Logger;
  appServer: CodexAppServerClient;
};

export async function registerApi(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  await app.register(
    fastifyPlugin(async (instance) => {
      instance.addHook("onRequest", async (request, reply) => {
        await new Promise<void>((resolve) => {
          cors({ origin: true })(request.raw, reply.raw, resolve);
        });
      });
    })
  );

  app.get("/api/state", async () => {
    const config = deps.configStore.get();
    const sessions = await deps.providers.listSessions(config.environments, config.bots);
    return {
      config,
      environments: config.environments,
      sessions,
      threads: sessions,
      tasks: deps.taskQueue.list(),
      logs: deps.logger.list()
    };
  });

  app.patch<{ Body: UpdateConfigInput }>("/api/config", async (request) => {
    const before = deps.configStore.get().codex;
    const config = await deps.configStore.update(request.body);
    if (request.body.codex && JSON.stringify(before) !== JSON.stringify(config.codex)) {
      await deps.appServer.stop();
    }
    await deps.feishuBotManager.syncAll();
    return config;
  });

  app.post<{ Body: CreateEnvironmentInput }>("/api/environments", async (request) => {
    const environment = await deps.configStore.addEnvironment(request.body);
    return environment;
  });

  app.patch<{ Params: { environmentId: string }; Body: UpdateEnvironmentInput }>(
    "/api/environments/:environmentId",
    async (request) => {
      const environment = await deps.configStore.updateEnvironment(
        request.params.environmentId,
        request.body
      );
      return environment;
    }
  );

  app.delete<{ Params: { environmentId: string } }>("/api/environments/:environmentId", async (request) => {
    const config = await deps.configStore.deleteEnvironment(request.params.environmentId);
    await deps.feishuBotManager.syncAll();
    return config;
  });

  app.post<{ Body: CreateBotInput }>("/api/bots", async (request) => {
    const bot = await deps.configStore.addBot(request.body);
    await deps.feishuBotManager.syncAll();
    return bot;
  });

  app.patch<{ Params: { botId: string }; Body: UpdateBotInput }>(
    "/api/bots/:botId",
    async (request) => {
      const bot = await deps.configStore.updateBot(request.params.botId, request.body);
      await deps.feishuBotManager.syncAll();
      return bot;
    }
  );

  app.delete<{ Params: { botId: string } }>("/api/bots/:botId", async (request) => {
    await deps.configStore.deleteBot(request.params.botId);
    await deps.feishuBotManager.syncAll();
    return { ok: true };
  });

  app.post<{ Params: { botId: string } }>("/api/bots/:botId/test", async (request) => {
    const bot = deps.configStore.get().bots.find((item) => item.id === request.params.botId);
    if (!bot) {
      throw new Error(`Bot not found: ${request.params.botId}`);
    }
    if (!bot.appId || !bot.appSecret) {
      throw new Error("App ID and App Secret are required.");
    }
    if (bot.channelType !== "lark") {
      throw new Error("Connection testing is only available for Lark bots.");
    }
    const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        app_id: bot.appId,
        app_secret: bot.appSecret
      })
    });
    const data = (await response.json()) as { code?: number; msg?: string };
    if (!response.ok || data.code !== 0) {
      throw new Error(data.msg || `Feishu returned HTTP ${response.status}`);
    }
    return { ok: true };
  });

  async function createSession(request: { body: CreateThreadInput; environmentId?: string }) {
    const environment = deps.configStore.getEnvironment(
      request.body.environmentId ?? request.environmentId
    );
    const session = await deps.providers.createSession({
      environment,
      environmentId: environment.id,
      title: request.body.title,
      cwd: request.body.cwd
    });
    if (request.body.bindBotId) {
      await deps.configStore.bindSessionToBot(session.sessionKey, request.body.bindBotId, environment.id);
      await deps.feishuBotManager.syncAll();
    }
    return session;
  }

  app.post<{ Body: CreateThreadInput }>("/api/threads", createSession);
  app.post<{ Body: CreateThreadInput }>("/api/sessions", createSession);
  app.post<{ Params: { environmentId: string }; Body: CreateThreadInput }>(
    "/api/environments/:environmentId/sessions",
    async (request) => createSession({ body: request.body, environmentId: request.params.environmentId })
  );

  app.post("/api/threads/refresh", async () =>
    deps.providers.listSessions(deps.configStore.get().environments)
  );
  app.post("/api/sessions/refresh", async () =>
    deps.providers.listSessions(deps.configStore.get().environments)
  );
  app.post<{ Params: { environmentId: string } }>(
    "/api/environments/:environmentId/sessions/refresh",
    async (request) => deps.providers.listEnvironmentSessions(deps.configStore.getEnvironment(request.params.environmentId))
  );

  app.patch<{ Params: { threadId: string }; Body: UpdateThreadBindingInput }>(
    "/api/threads/:threadId/binding",
    async (request) => {
      const environment = deps.configStore.getEnvironment(request.body.environmentId);
      const sessionKey = deps.providers.resolveSession(request.params.threadId, environment).sessionKey;
      const config = await deps.configStore.bindSessionToBot(
        sessionKey,
        request.body.botId || undefined,
        environment.id
      );
      await deps.feishuBotManager.syncAll();
      return config;
    }
  );

  app.patch<{ Params: { sessionKey: string }; Body: UpdateThreadBindingInput }>(
    "/api/sessions/:sessionKey/binding",
    async (request) => {
      const environment = deps.configStore.getEnvironment(request.body.environmentId);
      const sessionKey = deps.providers.resolveSession(request.params.sessionKey, environment).sessionKey;
      const config = await deps.configStore.bindSessionToBot(
        sessionKey,
        request.body.botId || undefined,
        environment.id
      );
      await deps.feishuBotManager.syncAll();
      return config;
    }
  );

  app.patch<{ Params: { environmentId: string; sessionKey: string }; Body: UpdateThreadBindingInput }>(
    "/api/environments/:environmentId/sessions/:sessionKey/binding",
    async (request) => {
      const environment = deps.configStore.getEnvironment(request.params.environmentId);
      const sessionKey = deps.providers.resolveSession(request.params.sessionKey, environment).sessionKey;
      const config = await deps.configStore.bindSessionToBot(
        sessionKey,
        request.body.botId || undefined,
        environment.id
      );
      await deps.feishuBotManager.syncAll();
      return config;
    }
  );

  app.get<{ Params: { threadId: string } }>("/api/threads/:threadId/messages", async (request) =>
    deps.providers.getSessionMessages(
      deps.providers.resolveSession(request.params.threadId, deps.configStore.defaultEnvironment()).sessionKey,
      deps.configStore.defaultEnvironment()
    )
  );

  app.get<{ Params: { sessionKey: string } }>("/api/sessions/:sessionKey/messages", async (request) =>
    deps.providers.getSessionMessages(
      deps.providers.resolveSession(request.params.sessionKey, deps.configStore.defaultEnvironment()).sessionKey,
      deps.configStore.defaultEnvironment()
    )
  );

  app.get<{ Params: { environmentId: string; sessionKey: string } }>(
    "/api/environments/:environmentId/sessions/:sessionKey/messages",
    async (request) => {
      const environment = deps.configStore.getEnvironment(request.params.environmentId);
      return deps.providers.getSessionMessages(
        deps.providers.resolveSession(request.params.sessionKey, environment).sessionKey,
        environment
      );
    }
  );

  app.post<{ Body: SendMessageInput }>("/api/messages", async (request) => {
    const target = request.body.sessionKey ?? request.body.threadId;
    if (!target) {
      throw new Error("sessionKey or threadId is required.");
    }
    const environment = deps.configStore.getEnvironment(request.body.environmentId);
    const resolved = deps.providers.resolveSession(target, environment);
    const message = deps.taskQueue.createWebMessage({
      sessionKey: resolved.sessionKey,
      environment,
      threadId: resolved.nativeSessionId,
      botId: request.body.botId,
      text: request.body.text,
      attachments: request.body.attachments
    });
    const bot = request.body.botId
      ? deps.configStore.get().bots.find((item) => item.id === request.body.botId)
      : undefined;
    return deps.taskQueue.enqueue(message, bot?.runningMessageMode ?? "queue");
  });

  app.post<{
    Body: {
      name: string;
      mimeType?: string;
      dataBase64: string;
    };
  }>("/api/attachments", async (request) => {
    const attachmentId = nanoid();
    const dir = path.join(ATTACHMENT_DIR, "web", attachmentId);
    await ensureDir(dir);
    const filePath = path.join(dir, sanitizeFileName(request.body.name));
    await fs.writeFile(filePath, Buffer.from(request.body.dataBase64, "base64"));
    const attachment: AttachmentInput = {
      id: attachmentId,
      name: path.basename(filePath),
      mimeType: request.body.mimeType,
      size: Buffer.byteLength(request.body.dataBase64, "base64"),
      source: "web",
      localPath: filePath,
      resourceType: request.body.mimeType?.startsWith("image/") ? "image" : "file"
    };
    return attachment;
  });

  app.get<{ Params: { attachmentId: string } }>(
    "/api/attachments/:attachmentId/content",
    async (request, reply) => {
      const sessionAttachment = await deps.providers.getAttachmentContent(
        request.params.attachmentId
      );
      if (sessionAttachment) {
        reply.type(sessionAttachment.mimeType);
        return sessionAttachment.content;
      }
      const dir = path.join(ATTACHMENT_DIR, "web", request.params.attachmentId);
      try {
        const files = await fs.readdir(dir);
        const fileName = files[0];
        if (!fileName) {
          reply.code(404);
          return { error: "Attachment not found" };
        }
        const filePath = path.join(dir, fileName);
        const content = await fs.readFile(filePath);
        reply.type(mimeTypeFromName(fileName));
        return content;
      } catch {
        reply.code(404);
        return { error: "Attachment not found" };
      }
    }
  );

  app.post<{ Params: { taskId: string } }>("/api/tasks/:taskId/cancel", async (request) =>
    deps.taskQueue.cancel(request.params.taskId)
  );

  app.post<{ Params: { taskId: string }; Body: { approved?: boolean } }>(
    "/api/tasks/:taskId/approval",
    async (request) => deps.taskQueue.approve(request.params.taskId, Boolean(request.body.approved))
  );

  app.post<{ Params: { botId: string } }>("/webhook/card/:botId", async (request) =>
    deps.feishuBotManager.handleCardCallback(request.params.botId, request.body)
  );

  app.get<{ Params: { taskId: string } }>("/api/tasks/:taskId/log", async (request, reply) => {
    const task = deps.taskQueue.get(request.params.taskId);
    if (!task?.rawLogPath) {
      reply.code(404);
      return { error: "Log not found" };
    }
    try {
      const content = await fs.readFile(task.rawLogPath, "utf8");
      reply.type("text/plain");
      return content;
    } catch {
      reply.code(404);
      return { error: "Log not found" };
    }
  });

  app.get("/events", async (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    const send = (event: GatewayEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const unsubscribe = deps.events.subscribe(send);
    request.raw.on("close", unsubscribe);
  });

  const webDir = path.resolve("dist/web");
  try {
    await fs.access(webDir);
    await app.register(fastifyStatic, {
      root: webDir,
      prefix: "/"
    });
    app.setNotFoundHandler(async (_request, reply) => reply.sendFile("index.html"));
  } catch {
    deps.logger.debug("Static web build not found; run npm run build for production UI", {
      scope: "server"
    });
  }
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[/:\\]/g, "_").replace(/\0/g, "").trim();
  return cleaned || `attachment-${Date.now()}`;
}

function mimeTypeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    return "text/plain; charset=utf-8";
  }
  return "application/octet-stream";
}
