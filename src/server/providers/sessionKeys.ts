import type { ProviderType } from "../../shared/types.js";

export const DEFAULT_CODEX_PROVIDER_ID = "codex";

export type ParsedSessionKey = {
  providerId: string;
  nativeSessionId: string;
};

export function makeSessionKey(providerId: string, nativeSessionId: string): string {
  return `${providerId}:${nativeSessionId}`;
}

export function parseSessionKey(value: string | undefined): ParsedSessionKey | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    return undefined;
  }
  return {
    providerId: trimmed.slice(0, separatorIndex),
    nativeSessionId: trimmed.slice(separatorIndex + 1)
  };
}

export function normalizeSessionKeyInput(
  value: string | undefined,
  defaultProviderId = DEFAULT_CODEX_PROVIDER_ID
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (parseSessionKey(trimmed)) {
    return trimmed;
  }
  if (isUuid(trimmed)) {
    return makeSessionKey(defaultProviderId, trimmed);
  }
  return trimmed;
}

export function codexSessionIdentity(nativeSessionId: string): {
  id: string;
  sessionKey: string;
  providerId: string;
  providerType: ProviderType;
  nativeSessionId: string;
  providerThreadId: string;
} {
  return {
    id: nativeSessionId,
    sessionKey: makeSessionKey(DEFAULT_CODEX_PROVIDER_ID, nativeSessionId),
    providerId: DEFAULT_CODEX_PROVIDER_ID,
    providerType: "codex",
    nativeSessionId,
    providerThreadId: nativeSessionId
  };
}

export function normalizeCodexSessionKey(value: string | undefined): string | undefined {
  const normalized = normalizeSessionKeyInput(value, DEFAULT_CODEX_PROVIDER_ID);
  if (!normalized) {
    return undefined;
  }
  const parsed = parseSessionKey(normalized);
  if (!parsed) {
    return undefined;
  }
  return parsed.providerId === DEFAULT_CODEX_PROVIDER_ID && isUuid(parsed.nativeSessionId)
    ? normalized
    : undefined;
}

export function nativeCodexSessionId(value: string | undefined): string | undefined {
  const parsed = parseSessionKey(normalizeSessionKeyInput(value, DEFAULT_CODEX_PROVIDER_ID));
  if (parsed?.providerId === DEFAULT_CODEX_PROVIDER_ID && isUuid(parsed.nativeSessionId)) {
    return parsed.nativeSessionId;
  }
  return value && isUuid(value) ? value : undefined;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
