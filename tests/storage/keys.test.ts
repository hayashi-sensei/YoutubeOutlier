import { describe, expect, test } from "vitest";

import {
  assertObjectKeyHasPrefix,
  assertSafeObjectKey,
  buildReportExportObjectKey,
  buildVisualAssetObjectKey,
} from "../../lib/storage/keys";

describe("storage object keys", () => {
  test("builds workspace-scoped report export keys", () => {
    expect(
      buildReportExportObjectKey({
        workspaceId: "workspace-1",
        reportId: "report-1",
        exportId: "export-1",
        fileType: "pdf",
      }),
    ).toBe("exports/workspace-1/report-1/export-1.pdf");
  });

  test("builds workspace-scoped visual asset keys with media extensions", () => {
    expect(
      buildVisualAssetObjectKey({
        workspaceId: "workspace-1",
        contentItemId: "content-1",
        assetType: "LINKEDIN_IMAGE",
        generationId: "generation-1",
        mediaType: "image/webp",
      }),
    ).toBe("visual-assets/workspace-1/content-items/content-1/linkedin_image/generation-1.webp");
  });

  test("rejects traversal, absolute paths, backslashes, and empty path segments", () => {
    expect(() => assertSafeObjectKey("../secrets/provider-key.txt")).toThrow("Unsafe storage object key");
    expect(() => assertSafeObjectKey("/exports/workspace-1/report-1/export-1.pdf")).toThrow("Unsafe storage object key");
    expect(() => assertSafeObjectKey("exports\\workspace-1\\report-1\\export-1.pdf")).toThrow("Unsafe storage object key");
    expect(() => assertSafeObjectKey("exports/workspace-1//export-1.pdf")).toThrow("Unsafe storage object key");
  });

  test("rejects cross-workspace object key access", () => {
    expect(() =>
      assertObjectKeyHasPrefix(
        "exports/workspace-2/report-1/export-1.pdf",
        "exports/workspace-1/report-1/",
      ),
    ).toThrow("Storage object key is outside the allowed prefix");
  });
});
