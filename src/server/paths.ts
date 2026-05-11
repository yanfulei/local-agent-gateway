import os from "node:os";
import path from "node:path";

export const DATA_DIR = path.join(os.homedir(), ".local-agent-gateway");
export const CONFIG_PATH = path.join(DATA_DIR, "config.json");
export const STATE_PATH = path.join(DATA_DIR, "state.json");
export const LOG_DIR = path.join(DATA_DIR, "logs");
export const ATTACHMENT_DIR = path.join(DATA_DIR, "attachments");
export const RUNTIME_DIR = path.join(DATA_DIR, "runtime");

export const CODEX_HOME = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
export const CODEX_SESSION_DIR = path.join(CODEX_HOME, "sessions");
export const CODEX_SESSION_INDEX = path.join(CODEX_HOME, "session_index.jsonl");
