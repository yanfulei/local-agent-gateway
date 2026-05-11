import process from "node:process";
import fastify from "fastify";
import { CodexAppServerClient } from "./codex/appServerClient.js";
import { CodexProvider } from "./codex/codexProvider.js";
import { ConfigStore } from "./configStore.js";
import { GatewayEventBus } from "./events.js";
import { FeishuBotManager } from "./feishu/feishuBotManager.js";
import { Logger } from "./logger.js";
import { ATTACHMENT_DIR, DATA_DIR, LOG_DIR, RUNTIME_DIR } from "./paths.js";
import { ProviderRegistry } from "./providers/providerRegistry.js";
import { StateStore } from "./stateStore.js";
import { TaskQueue } from "./taskQueue.js";
import { ensureDir } from "./utils/files.js";
import { registerApi } from "./api.js";

async function main(): Promise<void> {
  await Promise.all([ensureDir(DATA_DIR), ensureDir(LOG_DIR), ensureDir(ATTACHMENT_DIR), ensureDir(RUNTIME_DIR)]);

  const events = new GatewayEventBus();
  const logger = new Logger(events);
  const configStore = new ConfigStore(events);
  await configStore.init();
  const stateStore = new StateStore();
  await stateStore.init();

  const appServer = new CodexAppServerClient(configStore, logger);
  const codexProvider = new CodexProvider(configStore, events, logger, appServer, stateStore);
  const providers = new ProviderRegistry();
  providers.register(codexProvider);
  await providers.initAll();

  const taskQueue = new TaskQueue(providers, events, logger);
  const feishuBotManager = new FeishuBotManager(configStore, taskQueue, logger, providers);
  await feishuBotManager.startAll();

  events.subscribe((event) => {
    if (event.type === "task.updated") {
      void feishuBotManager.updateTaskCard(event.task);
    }
  });

  const app = fastify({
    logger: false
  });
  await registerApi(app, {
    configStore,
    providers,
    taskQueue,
    feishuBotManager,
    events,
    logger,
    appServer
  });

  const config = configStore.get();
  await app.listen({
    host: config.server.host,
    port: config.server.port
  });
  logger.info(`Local Agent Gateway listening on http://${config.server.host}:${config.server.port}`, {
    scope: "server"
  });

  const shutdown = async () => {
    logger.info("Shutting down", { scope: "server" });
    await feishuBotManager.stopAll();
    await appServer.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
