import { EventEmitter } from "node:events";
import { execa } from "execa";
import type { ConfigStore } from "../configStore.js";
import type { Logger } from "../logger.js";

type JsonRpcId = number | string;

type JsonRpcResponse = {
  jsonrpc?: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type JsonRpcNotification = {
  jsonrpc?: "2.0";
  method: string;
  params?: unknown;
};

export type CodexAppServerRequest = {
  jsonrpc?: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

type PendingRequest = {
  resolve: (value: JsonRpcResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export type CodexAppServerEvent = JsonRpcNotification;

export class CodexAppServerClient {
  private child?: ReturnType<typeof execa>;
  private nextId = 1;
  private buffer = "";
  private initialized = false;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly emitter = new EventEmitter();
  private requestHandler?: (request: CodexAppServerRequest) => Promise<unknown> | unknown;

  constructor(
    private readonly configStore: ConfigStore,
    private readonly logger: Logger
  ) {}

  onEvent(listener: (event: CodexAppServerEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  onRequest(handler: (request: CodexAppServerRequest) => Promise<unknown> | unknown): () => void {
    this.requestHandler = handler;
    return () => {
      if (this.requestHandler === handler) {
        this.requestHandler = undefined;
      }
    };
  }

  async ensureStarted(): Promise<void> {
    if (this.child && this.initialized) {
      return;
    }
    if (!this.child) {
      const command = this.configStore.get().codex.command;
      this.logger.info("Starting Codex app-server stdio client", { scope: "codex.app-server" });
      this.startProcess(command);
    }

    if (!this.initialized) {
      await this.request("initialize", {
        clientInfo: {
          name: "local-agent-gateway",
          title: "Local Agent Gateway",
          version: "0.1.0"
        },
        capabilities: {
          experimentalApi: true
        }
      });
      this.notify("initialized");
      this.initialized = true;
    }
  }

  async request(method: string, params?: unknown, timeoutMs = 30000): Promise<unknown> {
    await this.ensureProcess();
    const id = this.nextId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };
    const promise = new Promise<JsonRpcResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });
    this.writeJson(payload);
    const response = await promise;
    if (response.error) {
      throw new Error(`${method} failed: ${response.error.message}`);
    }
    return response.result;
  }

  notify(method: string, params?: unknown): void {
    const payload = {
      jsonrpc: "2.0",
      method,
      params
    };
    this.writeJson(payload);
  }

  async stop(): Promise<void> {
    if (!this.child) {
      return;
    }
    const child = this.child;
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }, 3000).unref();
    this.child = undefined;
    this.initialized = false;
  }

  private async ensureProcess(): Promise<void> {
    if (!this.child) {
      const command = this.configStore.get().codex.command;
      this.logger.info("Starting Codex app-server stdio client", { scope: "codex.app-server" });
      this.startProcess(command);
    }
  }

  private startProcess(command: string): void {
    this.child = execa(command, ["app-server", "--listen", "stdio://"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      reject: false
    });
    this.child.stdout?.on("data", (chunk: Buffer) => this.handleStdout(chunk.toString()));
    this.child.stderr?.on("data", (chunk: Buffer) => {
      this.logger.warn(chunk.toString(), { scope: "codex.app-server" });
    });
    this.child.on("exit", (code) => {
      this.logger.warn(`Codex app-server stdio exited with code ${code ?? "unknown"}`, {
        scope: "codex.app-server"
      });
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("Codex app-server exited"));
      }
      this.pending.clear();
      this.child = undefined;
      this.initialized = false;
      this.buffer = "";
    });
  }

  private handleStdout(chunk: string): void {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line) {
        this.handleLine(line);
      }
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    let message: JsonRpcResponse | JsonRpcNotification | CodexAppServerRequest;
    try {
      message = JSON.parse(line) as JsonRpcResponse | JsonRpcNotification;
    } catch (error) {
      this.logger.warn("Failed to parse Codex app-server JSON line", {
        scope: "codex.app-server",
        data: { line, error: String(error) }
      });
      return;
    }

    if ("id" in message && "method" in message && typeof message.method === "string") {
      void this.handleServerRequest(message as CodexAppServerRequest);
      return;
    }

    if ("id" in message) {
      const pending = this.pending.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pending.delete(message.id);
        pending.resolve(message);
      }
      return;
    }

    if ("method" in message) {
      this.emitter.emit("event", message);
    }
  }

  private async handleServerRequest(request: CodexAppServerRequest): Promise<void> {
    try {
      const result = this.requestHandler
        ? await this.requestHandler(request)
        : defaultServerRequestResponse(request.method);
      this.writeJson({
        jsonrpc: "2.0",
        id: request.id,
        result
      });
    } catch (error) {
      this.writeJson({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32000,
          message: String(error)
        }
      });
    }
  }

  private writeJson(payload: unknown): void {
    if (!this.child?.stdin?.writable) {
      throw new Error("Codex app-server stdin is not writable");
    }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }
}

function defaultServerRequestResponse(method: string): unknown {
  if (method === "item/commandExecution/requestApproval") {
    return { decision: "accept" };
  }
  if (method === "item/fileChange/requestApproval") {
    return { decision: "accept" };
  }
  if (method === "execCommandApproval" || method === "applyPatchApproval") {
    return { decision: "approved" };
  }
  if (method === "item/permissions/requestApproval") {
    return { permissions: {}, scope: "turn", strictAutoReview: false };
  }
  if (method === "item/tool/requestUserInput") {
    return { answers: {} };
  }
  if (method === "mcpServer/elicitation/request") {
    return { action: "decline", content: null, _meta: null };
  }
  if (method === "item/tool/call") {
    return {
      contentItems: [{ type: "inputText", text: "Local Agent Gateway does not handle this app tool." }],
      success: false
    };
  }
  throw new Error(`Unsupported Codex app-server request: ${method}`);
}
