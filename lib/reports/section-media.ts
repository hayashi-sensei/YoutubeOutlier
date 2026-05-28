export function getReportSectionThumbnailUrl(item: Record<string, unknown>): string | null {
  const thumbnailUrl = item.thumbnailUrl;

  return typeof thumbnailUrl === "string" && thumbnailUrl.length > 0
    ? thumbnailUrl
    : null;
}
