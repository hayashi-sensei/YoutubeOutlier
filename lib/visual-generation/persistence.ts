import type { ImageAspectRatio } from "@/types/ai";
import {
  buildVisualAssetObjectKey,
  getStorageAdapter,
  type StorageAdapter,
} from "@/lib/storage";
import type { VisualAssetTypeInput } from "@/types/visual-generation";

function buildVisualAssetCreateData(input: {
  workspaceId: string;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  result: {
    provider: string;
    model: string;
    costUsd: number;
    files: Array<{ mediaType: string; base64: string }>;
  };
}) {
  const firstFile = input.result.files[0];

  return {
    workspaceId: input.workspaceId,
    assetType: "YOUTUBE_THUMBNAIL" as const,
    provider: input.result.provider,
    model: input.result.model,
    aspectRatio: input.aspectRatio,
    prompt: input.prompt,
    imageUrl: firstFile ? `data:${firstFile.mediaType};base64,${firstFile.base64}` : null,
    costUsd: input.result.costUsd,
  };
}

export async function buildStoredVisualAssetCreateData(input: {
  storage?: StorageAdapter;
  workspaceId: string;
  contentItemId?: string | null;
  generationId: string;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  result: {
    provider: string;
    model: string;
    costUsd: number;
    files: Array<{ mediaType: string; base64: string }>;
  };
}) {
  const firstFile = input.result.files[0];
  const baseData = buildVisualAssetCreateData(input);

  if (!firstFile) {
    return {
      ...baseData,
      imageUrl: null,
      storagePath: null,
    };
  }

  const persisted = await persistVisualAssetFile({
    storage: input.storage,
    workspaceId: input.workspaceId,
    contentItemId: input.contentItemId,
    assetType: "YOUTUBE_THUMBNAIL",
    generationId: input.generationId,
    file: firstFile,
  });

  return {
    ...baseData,
    ...persisted,
  };
}

export async function persistVisualAssetFile(input: {
  storage?: StorageAdapter;
  workspaceId: string;
  contentItemId?: string | null;
  assetType: VisualAssetTypeInput;
  generationId: string;
  file: { mediaType: string; base64: string };
}): Promise<{ imageUrl: string | null; storagePath: string }> {
  const storagePath = buildVisualAssetObjectKey({
    workspaceId: input.workspaceId,
    contentItemId: input.contentItemId,
    assetType: input.assetType,
    generationId: input.generationId,
    mediaType: input.file.mediaType,
  });
  const uploaded = await (input.storage ?? getStorageAdapter()).putObject({
    key: storagePath,
    contentType: input.file.mediaType,
    body: Buffer.from(input.file.base64, "base64"),
  });

  return {
    imageUrl: uploaded.publicUrl,
    storagePath,
  };
}
