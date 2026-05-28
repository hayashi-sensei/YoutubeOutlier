import { describe, expect, test } from "vitest";

import { buildVisualAssetCreateData } from "../../lib/visual-generation/persistence";

describe("visual asset persistence", () => {
  test("persists the requested aspect ratio with generated visual assets", () => {
    expect(
      buildVisualAssetCreateData({
        workspaceId: "workspace-1",
        prompt: "Create a vertical image",
        aspectRatio: "4:5",
        result: {
          provider: "openai",
          model: "gpt-image-1",
          costUsd: 0.04,
          files: [{ mediaType: "image/png", base64: "abc123" }],
        },
      }),
    ).toEqual(
      expect.objectContaining({
        workspaceId: "workspace-1",
        assetType: "YOUTUBE_THUMBNAIL",
        aspectRatio: "4:5",
        imageUrl: "data:image/png;base64,abc123",
      }),
    );
  });
});
