import { describe, expect, test } from "vitest";

import {
  buildStoredVisualAssetCreateData,
  persistVisualAssetFile,
} from "../../lib/visual-generation/persistence";
import { createMemoryStorageAdapter } from "../../lib/storage/memory-adapter";

describe("visual asset persistence", () => {
  test("persists generated image bytes through storage and stores a stable object key", async () => {
    const storage = createMemoryStorageAdapter({
      publicBaseUrl: "https://assets.example.com",
    });

    await expect(
      buildStoredVisualAssetCreateData({
        storage,
        workspaceId: "workspace-1",
        generationId: "generation-1",
        prompt: "Create a vertical image",
        aspectRatio: "4:5",
        result: {
          provider: "openai",
          model: "gpt-image-1",
          costUsd: 0.04,
          files: [{ mediaType: "image/png", base64: "abc123" }],
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        workspaceId: "workspace-1",
        assetType: "YOUTUBE_THUMBNAIL",
        aspectRatio: "4:5",
        imageUrl: "https://assets.example.com/visual-assets/workspace-1/standalone/youtube_thumbnail/generation-1.png",
        storagePath: "visual-assets/workspace-1/standalone/youtube_thumbnail/generation-1.png",
      }),
    );

    await expect(
      storage.getObject({ key: "visual-assets/workspace-1/standalone/youtube_thumbnail/generation-1.png" }),
    ).resolves.toEqual(
      expect.objectContaining({
        body: Buffer.from("abc123", "base64"),
        contentType: "image/png",
      }),
    );
  });

  test("builds storage keys for non-thumbnail visual asset types", async () => {
    const storage = createMemoryStorageAdapter();

    await expect(
      persistVisualAssetFile({
        storage,
        workspaceId: "workspace-1",
        contentItemId: "content-1",
        assetType: "LINKEDIN_IMAGE",
        generationId: "generation-1",
        file: { mediaType: "image/webp", base64: "AQID" },
      }),
    ).resolves.toEqual({
      imageUrl: null,
      storagePath: "visual-assets/workspace-1/content-items/content-1/linkedin_image/generation-1.webp",
    });
  });
});
