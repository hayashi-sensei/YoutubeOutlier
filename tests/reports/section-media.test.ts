import { describe, expect, test } from "vitest";

import { getReportSectionThumbnailUrl } from "../../lib/reports/section-media";

describe("report section media", () => {
  test("returns a thumbnail URL for competitor upload rows", () => {
    expect(
      getReportSectionThumbnailUrl({
        thumbnailUrl: "https://img.youtube.com/vi/video-1/hqdefault.jpg",
      }),
    ).toBe("https://img.youtube.com/vi/video-1/hqdefault.jpg");
  });

  test("ignores missing or non-string thumbnail values", () => {
    expect(getReportSectionThumbnailUrl({})).toBeNull();
    expect(getReportSectionThumbnailUrl({ thumbnailUrl: 123 })).toBeNull();
  });
});
