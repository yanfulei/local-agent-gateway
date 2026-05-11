import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type {
  CodexThreadMessage,
  CodexThreadMessageAttachment,
  CodexThreadMessagePart,
  CodexThreadSummary
} from "../../shared/types.js";
import { CODEX_SESSION_DIR, CODEX_SESSION_INDEX } from "../paths.js";
import { codexSessionIdentity } from "../providers/sessionKeys.js";

type SessionIndexEntry = {
  id?: string;
  session_id?: string;
  title?: string;
  thread_name?: string;
  cwd?: string;
  timestamp?: string;
  updated_at?: string;
  path?: string;
};

type StoredSessionAttachmentSource = {
  kind: "data" | "file";
  value: string;
  name: string;
};

const sessionAttachmentSources = new Map<string, StoredSessionAttachmentSource>();

export type CodexSessionAttachmentContent = {
  content: Buffer;
  mimeType: string;
  name: string;
};

export class CodexSessionScanner {
  private sessionFileCache = new Map<string, string>();

  async scan(limit = 200): Promise<CodexThreadSummary[]> {
    const fromIndex = await this.scanIndex(limit);
    const known = new Set(fromIndex.map((thread) => thread.id));
    const fromFiles = await this.scanSessionFiles(limit);
    const merged = [...fromIndex, ...fromFiles.filter((thread) => !known.has(thread.id))];
    return merged
      .sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""))
      .slice(0, limit);
  }

  async readMessages(thread: CodexThreadSummary, limit = 200): Promise<CodexThreadMessage[]> {
    const sessionFile =
      thread.sessionFile ??
      this.sessionFileCache.get(thread.id) ??
      (thread.providerThreadId ? this.sessionFileCache.get(thread.providerThreadId) : undefined) ??
      (await this.findSessionFile(thread.providerThreadId ?? thread.id)) ??
      (await this.findSessionFile(thread.id));
    if (!sessionFile) {
      return [];
    }
    const content = await fsp.readFile(sessionFile, "utf8");
    const messages: CodexThreadMessage[] = [];
    const seenMessageIndexes = new Map<string, number>();
    let index = 0;
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const message = messageFromSessionRecord(thread, parsed, index);
        if (message) {
          const dedupeKey = messageDedupeKey(message);
          const existingIndex = seenMessageIndexes.get(dedupeKey);
          if (existingIndex !== undefined) {
            if (messageRichness(message) > messageRichness(messages[existingIndex])) {
              messages[existingIndex] = {
                ...message,
                id: messages[existingIndex].id
              };
            }
            continue;
          }
          seenMessageIndexes.set(dedupeKey, messages.length);
          messages.push(message);
          index += 1;
        }
      } catch {
        // Ignore malformed historical records.
      }
    }
    return messages.slice(-limit);
  }

  async readAttachmentContent(attachmentId: string): Promise<CodexSessionAttachmentContent | undefined> {
    const decoded = sessionAttachmentSources.get(attachmentId) ?? decodeSessionAttachmentId(attachmentId);
    if (!decoded) {
      return undefined;
    }
    if (decoded.kind === "data") {
      const [mimePart, dataPart] = decoded.value.split(",", 2);
      if (!mimePart || !dataPart) {
        return undefined;
      }
      const mimeMatch = mimePart.match(/^data:([^;]+);base64$/);
      if (!mimeMatch) {
        return undefined;
      }
      return {
        content: Buffer.from(dataPart, "base64"),
        mimeType: mimeMatch[1] ?? "application/octet-stream",
        name: decoded.name
      };
    }
    try {
      const stat = await fsp.stat(decoded.value);
      if (!stat.isFile()) {
        return undefined;
      }
      return {
        content: await fsp.readFile(decoded.value),
        mimeType: mimeTypeFromName(decoded.value),
        name: decoded.name || path.basename(decoded.value)
      };
    } catch {
      return undefined;
    }
  }

  private async scanIndex(limit: number): Promise<CodexThreadSummary[]> {
    try {
      const content = await fsp.readFile(CODEX_SESSION_INDEX, "utf8");
      const lines = content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-limit * 2);
      const entries: CodexThreadSummary[] = [];
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as SessionIndexEntry;
          const id = parsed.session_id ?? parsed.id ?? extractSessionId(parsed.path ?? "");
          if (!id) {
            continue;
          }
          const sessionFile = parsed.path ?? (await this.findSessionFile(id));
          entries.push({
            ...codexSessionIdentity(id),
            environmentId: "default",
            title: parsed.title || parsed.thread_name || `Codex ${id.slice(0, 8)}`,
            cwd: parsed.cwd,
            source: "provider-history",
            status: "unknown",
            lastActivityAt: parsed.updated_at ?? parsed.timestamp,
            sessionFile
          });
        } catch {
          // Ignore malformed historical index lines.
        }
      }
      return entries;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async scanSessionFiles(limit: number): Promise<CodexThreadSummary[]> {
    if (!fs.existsSync(CODEX_SESSION_DIR)) {
      return [];
    }
    const files = await fg("**/*.jsonl", {
      cwd: CODEX_SESSION_DIR,
      absolute: true,
      onlyFiles: true
    });
    const newest = await Promise.all(
      files.map(async (file) => ({
        file,
        stat: await fsp.stat(file)
      }))
    );
    newest.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    const summaries: CodexThreadSummary[] = [];
    for (const item of newest.slice(0, limit)) {
      const id = extractSessionId(item.file) ?? path.basename(item.file, ".jsonl");
      this.sessionFileCache.set(id, item.file);
      summaries.push(await summarizeSessionFile(item.file, item.stat.mtime));
    }
    return summaries;
  }

  private async findSessionFile(threadId: string): Promise<string | undefined> {
    const cached = this.sessionFileCache.get(threadId);
    if (cached) {
      return cached;
    }
    if (!fs.existsSync(CODEX_SESSION_DIR)) {
      return undefined;
    }
    const files = await fg(`**/*${threadId}*.jsonl`, {
      cwd: CODEX_SESSION_DIR,
      absolute: true,
      onlyFiles: true
    });
    const file = files[0];
    if (file) {
      this.sessionFileCache.set(threadId, file);
    }
    return file;
  }
}

function messageDedupeKey(message: CodexThreadMessage): string {
  const second = Number.isNaN(Date.parse(message.createdAt))
    ? message.createdAt
    : Math.floor(Date.parse(message.createdAt) / 1000).toString();
  const normalizedText = message.text.replace(/\[image\]|\[[^\]\n]+\]/g, "").replace(/\s+/g, " ").trim();
  return [second, message.role, normalizedText].join("\u001f");
}

function messageRichness(message: CodexThreadMessage): number {
  return (message.attachments?.length ?? 0) * 10 + (message.parts?.length ?? 0);
}

async function summarizeSessionFile(file: string, mtime: Date): Promise<CodexThreadSummary> {
  const id = extractSessionId(file) ?? path.basename(file, ".jsonl");
  const lines = await tailLines(file, 80);
  let cwd: string | undefined;
  let firstMessage: string | undefined;
  let lastMessage: string | undefined;
  let title: string | undefined;

  for (const line of lines) {
    try {
      const value = JSON.parse(line) as Record<string, unknown>;
      const maybeCwd = findString(value, ["cwd", "current_working_directory", "workdir"]);
      cwd ??= maybeCwd;
      const message = messageFromSessionRecord(
        { ...codexSessionIdentity(id), environmentId: "default" },
        value,
        0
      );
      const text = message?.text;
      if (text) {
        firstMessage ??= text;
        lastMessage = text;
        if (!title && message?.role === "user") {
          title = textToTitle(text);
        }
      }
    } catch {
      // Historical files may contain partial records; skip them.
    }
  }

  return {
    ...codexSessionIdentity(id),
    environmentId: "default",
    title: title ?? (firstMessage ? textToTitle(firstMessage) : `Codex ${id.slice(0, 8)}`),
    cwd,
    source: "provider-history",
    status: "unknown",
    firstMessage,
    lastMessage,
    lastActivityAt: mtime.toISOString(),
    sessionFile: file
  };
}

function extractSessionId(value: string): string | undefined {
  const match = value.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  return match?.[1];
}

async function tailLines(file: string, maxLines: number): Promise<string[]> {
  const content = await fsp.readFile(file, "utf8");
  const lines = content.split("\n").filter(Boolean);
  return lines.slice(-maxLines);
}

function findString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  for (const candidate of Object.values(record)) {
    const nested = findString(candidate, keys);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function extractText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.length > 4 ? value : undefined;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["text", "message", "content", "prompt"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim().length > 4) {
      return candidate.trim().slice(0, 500);
    }
  }
  for (const candidate of Object.values(record)) {
    const nested = extractText(candidate);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function textToTitle(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 48 ? `${normalized.slice(0, 48)}...` : normalized;
}

function messageFromSessionRecord(
  thread: Pick<CodexThreadSummary, "id" | "sessionKey" | "environmentId">,
  record: Record<string, unknown>,
  index: number
): CodexThreadMessage | undefined {
  const payload = objectValue(record.payload);
  let role: "user" | "assistant" | undefined;
  let parts: CodexThreadMessagePart[] | undefined;

  if (record.type === "response_item" && payload?.type === "message") {
    role = payload.role === "user" || payload.role === "assistant" ? payload.role : undefined;
    parts = extractMessageParts(payload.content);
  } else if (record.type === "event_msg" && payload?.type === "user_message") {
    role = "user";
    parts = partsFromUserEventPayload(payload);
  }

  if (!role) {
    return undefined;
  }
  const normalizedParts = normalizeMessageParts(parts ?? []);
  if (normalizedParts.length === 0) {
    return undefined;
  }
  const text = textFromMessageParts(normalizedParts);
  if (isInternalMessage(text)) {
    return undefined;
  }
  const timestamp = typeof record.timestamp === "string" ? record.timestamp : new Date(0).toISOString();
  return {
    id: `${thread.id}-${index}`,
    environmentId: thread.environmentId,
    sessionKey: thread.sessionKey,
    threadId: thread.id,
    role,
    text,
    parts: normalizedParts,
    attachments: normalizedParts
      .filter((part): part is Extract<CodexThreadMessagePart, { type: "attachment" }> => part.type === "attachment")
      .map((part) => part.attachment),
    createdAt: timestamp
  };
}

function extractMessageParts(content: unknown): CodexThreadMessagePart[] | undefined {
  if (typeof content === "string") {
    const text = normalizeMessageText(content);
    return text ? [{ type: "text", text }] : undefined;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const parts: CodexThreadMessagePart[] = [];
  for (const item of content) {
    const record = objectValue(item);
    if (!record) {
      continue;
    }
    const itemType = stringValue(record.type);
    const text = stringValue(record.text) ?? stringValue(record.content);
    if (text) {
      parts.push({ type: "text", text });
      continue;
    }
    const imageUrl =
      stringValue(record.image_url) ??
      stringValue(record.imageUrl) ??
      stringValue(record.image) ??
      stringValue(objectValue(record.source)?.url);
    const localPath =
      stringValue(record.path) ??
      stringValue(record.localPath) ??
      stringValue(record.file_path) ??
      stringValue(objectValue(record.source)?.path);
    if (itemType?.includes("image") && (imageUrl || localPath)) {
      parts.push({
        type: "attachment",
        attachment: attachmentFromImageSource(imageUrl ?? localPath ?? "", {
          localPath,
          name: path.basename(localPath ?? "") || "image"
        })
      });
    }
  }
  return parts;
}

function partsFromUserEventPayload(payload: Record<string, unknown>): CodexThreadMessagePart[] {
  const parts: CodexThreadMessagePart[] = [];
  const message = stringValue(payload.message);
  if (message) {
    parts.push({ type: "text", text: message });
  }
  for (const [index, image] of arrayValue(payload.images).entries()) {
    if (typeof image !== "string" || !image.trim()) {
      continue;
    }
    parts.push({
      type: "attachment",
      attachment: attachmentFromImageSource(image, { name: `image-${index + 1}` })
    });
  }
  for (const [index, image] of arrayValue(payload.local_images).entries()) {
    const record = objectValue(image);
    const localPath =
      typeof image === "string"
        ? image
        : stringValue(record?.path) ?? stringValue(record?.file_path) ?? stringValue(record?.localPath);
    if (!localPath) {
      continue;
    }
    parts.push({
      type: "attachment",
      attachment: attachmentFromImageSource(localPath, {
        localPath,
        name: path.basename(localPath) || `image-${index + 1}`
      })
    });
  }
  for (const [index, element] of arrayValue(payload.text_elements).entries()) {
    const record = objectValue(element);
    const text = stringValue(record?.text) ?? stringValue(record?.content);
    if (text) {
      parts.push({ type: "text", text });
      continue;
    }
    const localPath = stringValue(record?.path) ?? stringValue(record?.file_path) ?? stringValue(record?.localPath);
    const imageUrl = stringValue(record?.image_url) ?? stringValue(record?.imageUrl) ?? stringValue(record?.image);
    const itemType = stringValue(record?.type);
    if (itemType?.includes("image") && (imageUrl || localPath)) {
      parts.push({
        type: "attachment",
        attachment: attachmentFromImageSource(imageUrl ?? localPath ?? "", {
          localPath,
          name: stringValue(record?.name) ?? (path.basename(localPath ?? "") || `image-${index + 1}`)
        })
      });
      continue;
    }
    if (localPath) {
      parts.push({
        type: "attachment",
        attachment: attachmentFromFileSource(localPath, {
          name: stringValue(record?.name) ?? path.basename(localPath) ?? `file-${index + 1}`,
          localPath
        })
      });
    }
  }
  return parts;
}

function normalizeMessageParts(parts: CodexThreadMessagePart[]): CodexThreadMessagePart[] {
  const normalized: CodexThreadMessagePart[] = [];
  let skippingImageWrapper = false;

  for (const part of parts) {
    if (part.type === "text") {
      const text = normalizeMessageText(part.text);
      if (!text) {
        continue;
      }
      if (text === "<image>") {
        skippingImageWrapper = true;
        continue;
      }
      if (text === "</image>") {
        skippingImageWrapper = false;
        continue;
      }
      if (skippingImageWrapper && text.trim().length === 0) {
        continue;
      }
      const previous = normalized.at(-1);
      if (previous?.type === "text") {
        previous.text = normalizeMessageText(`${previous.text}\n\n${text}`) ?? previous.text;
      } else {
        normalized.push({ type: "text", text });
      }
      continue;
    }
    normalized.push(part);
  }

  return normalized;
}

function textFromMessageParts(parts: CodexThreadMessagePart[]): string {
  const text = parts
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }
      return part.attachment.resourceType === "image" ? "[image]" : `[${part.attachment.name}]`;
    })
    .join("\n\n")
    .trim();
  return text;
}

function attachmentFromImageSource(
  source: string,
  options: { localPath?: string; name?: string }
): CodexThreadMessageAttachment {
  const mimeType = source.startsWith("data:") ? mimeTypeFromDataUrl(source) : mimeTypeFromName(source);
  const name = ensureExtension(options.name ?? "image", mimeType);
  const isRemote = isRemoteUrl(source);
  return {
    id: registerSessionAttachment(options.localPath || !source.startsWith("data:") ? "file" : "data", source, name),
    name,
    mimeType,
    size: sizeFromDataUrl(source),
    resourceType: "image",
    url: isRemote ? source : undefined,
    localPath: options.localPath
  };
}

function attachmentFromFileSource(
  source: string,
  options: { localPath?: string; name?: string }
): CodexThreadMessageAttachment {
  const mimeType = mimeTypeFromName(source);
  return {
    id: registerSessionAttachment("file", source, options.name ?? path.basename(source) ?? "file"),
    name: options.name ?? path.basename(source) ?? "file",
    mimeType,
    resourceType: resourceTypeFromMimeType(mimeType),
    localPath: options.localPath
  };
}

function registerSessionAttachment(kind: "data" | "file", value: string, name: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${kind}\0${name}\0${value}`)
    .digest("base64url")
    .slice(0, 32);
  const id = `session-${hash}`;
  sessionAttachmentSources.set(id, { kind, value, name });
  return id;
}

function decodeSessionAttachmentId(
  attachmentId: string
): { kind: "data" | "file"; value: string; name: string } | undefined {
  if (!attachmentId.startsWith("session-")) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(Buffer.from(attachmentId.slice("session-".length), "base64url").toString("utf8")) as {
      kind?: unknown;
      value?: unknown;
      name?: unknown;
    };
    if ((parsed.kind === "data" || parsed.kind === "file") && typeof parsed.value === "string") {
      return {
        kind: parsed.kind,
        value: parsed.value,
        name: typeof parsed.name === "string" && parsed.name ? parsed.name : "attachment"
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function mimeTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] ?? "application/octet-stream";
}

function sizeFromDataUrl(dataUrl: string): number | undefined {
  const encoded = dataUrl.split(",", 2)[1];
  if (!encoded) {
    return undefined;
  }
  return Buffer.byteLength(encoded, "base64");
}

function ensureExtension(name: string, mimeType: string): string {
  if (path.extname(name)) {
    return name;
  }
  if (mimeType === "image/png") {
    return `${name}.png`;
  }
  if (mimeType === "image/jpeg") {
    return `${name}.jpg`;
  }
  if (mimeType === "image/gif") {
    return `${name}.gif`;
  }
  if (mimeType === "image/webp") {
    return `${name}.webp`;
  }
  return name;
}

function mimeTypeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.startsWith("data:")) {
    return mimeTypeFromDataUrl(lower);
  }
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

function resourceTypeFromMimeType(mimeType: string): CodexThreadMessageAttachment["resourceType"] {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  return "file";
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function extractMessageText(content: unknown): string | undefined {
  const parts = extractMessageParts(content);
  if (!parts) {
    return undefined;
  }
  const normalized = normalizeMessageParts(parts);
  if (normalized.length === 0) {
    return undefined;
  }
  return textFromMessageParts(normalized);
}

function normalizeMessageText(text: string): string | undefined {
  const normalized = text.replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized || isInternalMessage(normalized)) {
    return undefined;
  }
  return normalized;
}

function isInternalMessage(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith("<permissions instructions>") ||
    trimmed.startsWith("<skills_instructions>") ||
    trimmed.startsWith("<plugins_instructions>") ||
    trimmed.startsWith("<environment_context>")
  );
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
