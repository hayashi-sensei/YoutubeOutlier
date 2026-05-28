import type { JobMetadata, JsonValue } from "@/types/jobs";

const REDACTED = "[REDACTED]";
const MAX_METADATA_JSON_LENGTH = 1500;
const MAX_STRING_LENGTH = 500;
const SENSITIVE_KEYS = new Set([
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
]);

export type SerializedJobError = {
  message: string;
  retryable: boolean;
  metadata?: JobMetadata;
};

export function serializeJobError(error: unknown): SerializedJobError {
  const message = getErrorMessage(error);
  const retryable = getRetryable(error);
  const payload = getProviderPayload(error);
  const metadata = payload ? limitMetadata(sanitizeJson(payload)) : undefined;

  return {
    message,
    retryable,
    metadata,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getRetryable(error: unknown): boolean {
  if (isObject(error) && typeof error.retryable === "boolean") {
    return error.retryable;
  }

  return true;
}

function getProviderPayload(error: unknown): unknown {
  if (isObject(error) && "providerPayload" in error) {
    return error.providerPayload;
  }

  return undefined;
}

function sanitizeJson(value: unknown): JsonValue {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]`
      : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJson(item));
  }

  if (!isObject(value)) {
    return String(value);
  }

  const result: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = SENSITIVE_KEYS.has(normalizeKey(key))
      ? REDACTED
      : sanitizeJson(child);
  }

  return result;
}

function limitMetadata(value: JsonValue): JobMetadata {
  const wrapped: JobMetadata = isPlainMetadata(value) ? value : { payload: value };
  let json = JSON.stringify(wrapped);

  if (json.length <= MAX_METADATA_JSON_LENGTH) {
    return wrapped;
  }

  const limited: JobMetadata = {
    truncated: true,
    preview: json.slice(0, MAX_METADATA_JSON_LENGTH - 80),
  };
  json = JSON.stringify(limited);

  if (json.length <= MAX_METADATA_JSON_LENGTH) {
    return limited;
  }

  return { truncated: true };
}

function isPlainMetadata(value: JsonValue): value is JobMetadata {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-\s]/g, "");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
