import type { ImageAspectRatio } from "@/types/ai";

export function buildVisualAssetCreateData(input: {
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
