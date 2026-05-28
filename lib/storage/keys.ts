import type { ReportExportFileType } from "@/lib/reports/export";
import type { VisualAssetTypeInput } from "@/types/visual-generation";

const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function buildReportExportObjectKey(input: {
  workspaceId: string;
  reportId: string;
  exportId: string;
  fileType: ReportExportFileType;
}): string {
  return objectKey("exports", input.workspaceId, input.reportId, `${input.exportId}.${input.fileType}`);
}

export function buildVisualAssetObjectKey(input: {
  workspaceId: string;
  contentItemId?: string | null;
  assetType: VisualAssetTypeInput;
  generationId: string;
  mediaType?: string | null;
}): string {
  const contentSegments = input.contentItemId ? ["content-items", input.contentItemId] : ["standalone"];
  return objectKey(
    "visual-assets",
    input.workspaceId,
    ...contentSegments,
    input.assetType.toLowerCase(),
    `${input.generationId}.${mediaTypeExtension(input.mediaType)}`,
  );
}

export function objectKey(...segments: string[]): string {
  for (const segment of segments) {
    assertSafeObjectKeySegment(segment);
  }
  return segments.join("/");
}

export function assertSafeObjectKey(key: string): string {
  const normalized = key.trim();
  const segments = normalized.split("/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    normalized.includes("\\") ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error("Unsafe storage object key.");
  }
  return normalized;
}

export function assertObjectKeyHasPrefix(key: string, prefix: string): string {
  const safeKey = assertSafeObjectKey(key);
  const safePrefix = assertSafeObjectKey(prefix.endsWith("/") ? prefix.slice(0, -1) : prefix);
  const normalizedPrefix = `${safePrefix}/`;
  if (!safeKey.startsWith(normalizedPrefix)) {
    throw new Error("Storage object key is outside the allowed prefix.");
  }
  return safeKey;
}

function assertSafeObjectKeySegment(segment: string): void {
  const parts = segment.split(".");
  if (
    segment.includes("/") ||
    segment.includes("\\") ||
    segment.length === 0 ||
    segment === "." ||
    segment === ".." ||
    parts.some((part) => part.length === 0 || !SAFE_SEGMENT_PATTERN.test(part))
  ) {
    throw new Error("Unsafe storage object key segment.");
  }
}

function mediaTypeExtension(mediaType?: string | null): string {
  if (mediaType === "image/jpeg") {
    return "jpg";
  }
  if (mediaType === "image/webp") {
    return "webp";
  }
  return "png";
}
