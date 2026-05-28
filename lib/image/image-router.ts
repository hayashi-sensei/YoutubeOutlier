import { experimental_generateImage as generateImage } from "ai";

import { createAiModelRouter, type AiModelRouterPrisma } from "@/lib/ai/model-router";
import { resolveImageModel } from "@/lib/ai/provider-registry";
import { generatePiApiImage } from "@/lib/image/piapi-client";
import { AI_TASK_TYPES, type ImageRouterInput, type ImageRouterResult } from "@/types/ai";

export type ImageRouterOptions = {
  prisma: AiModelRouterPrisma;
};

export function createImageRouter(options: ImageRouterOptions) {
  const textRouter = createAiModelRouter({
    prisma: options.prisma,
    textExecutor: async ({ config, prompt, system }) => {
      const aspectRatio = getAspectRatio(prompt) ?? "1:1";
      if (config.provider === "piapi") {
        const result = await generatePiApiImage({
          model: config.model,
          prompt: `${system}\n\n${prompt}`,
          aspectRatio,
        });

        return {
          text: "",
          usage: {
            inputTokens: undefined,
            outputTokens: result.files.length,
          },
          responseJson: {
            providerMetadata: {
              piapi: {
                taskId: result.taskId,
                response: result.responseJson,
              },
            },
            files: result.files,
          },
        };
      }

      const result = await generateImage({
        model: resolveImageModel(config),
        prompt: `${system}\n\n${prompt}`,
        ...imageGenerationDimensions(config.provider, aspectRatio),
      });

      return {
        text: "",
        usage: {
          inputTokens: undefined,
          outputTokens: result.images.length,
        },
        responseJson: {
          providerMetadata: result.providerMetadata,
          files: result.images.map((image) => ({
            mediaType: image.mediaType,
            base64: image.base64,
            bytes: image.uint8Array.byteLength,
          })),
        },
      };
    },
  });

  return {
    async generateImage(input: ImageRouterInput): Promise<ImageRouterResult> {
      const result = await textRouter.runTextTask({
        workspaceId: input.workspaceId,
        userId: input.userId ?? null,
        taskType: AI_TASK_TYPES.imageGeneration,
        qualityTier: input.qualityTier,
        system: "Generate a production-ready visual asset for YTResearch. Return concise notes if text is also emitted.",
        prompt: [
          `Aspect ratio: ${input.aspectRatio}`,
          "Keep text overlays editable where possible; focus the generated image on the visual concept.",
          input.prompt,
        ].join("\n"),
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        metadata: input.metadata,
        onSuccessTransaction: async ({ generationId, provider, model, creditsCharged, costUsd, result, transaction }) => {
          const files = requireGeneratedImageFiles(result.responseJson);
          await input.onSuccessTransaction?.({
            generationId,
            provider,
            model,
            creditsCharged,
            costUsd,
            files,
            transaction,
          });
        },
      });

      const response = result.responseJson;
      const files = requireGeneratedImageFiles(response);

      return {
        generationId: result.generationId,
        provider: result.provider,
        model: result.model,
        creditsCharged: result.creditsCharged,
        costUsd: result.costUsd,
        files,
      };
    },
  };
}

function getAspectRatio(prompt: string) {
  const match = prompt.match(/^Aspect ratio: (1:1|4:5|16:9)$/m);
  return match?.[1] as ImageRouterInput["aspectRatio"] | undefined;
}

export function imageGenerationDimensions(
  provider: string,
  aspectRatio: ImageRouterInput["aspectRatio"],
): { aspectRatio: ImageRouterInput["aspectRatio"] } | { size: `${number}x${number}` } {
  if (provider === "openai") {
    return { size: sizeForAspectRatio(aspectRatio) };
  }

  return { aspectRatio };
}

function sizeForAspectRatio(aspectRatio: ImageRouterInput["aspectRatio"]): `${number}x${number}` {
  switch (aspectRatio) {
    case "1:1":
      return "1024x1024";
    case "4:5":
      return "1024x1536";
    case "16:9":
      return "1536x1024";
  }
}

export function requireGeneratedImageFiles(value: unknown): Array<{ mediaType: string; base64: string }> {
  const files = hasFileResponse(value)
    ? value.files.map((file) => ({
        mediaType: file.mediaType,
        base64: file.base64,
      }))
    : [];

  if (files.length === 0) {
    throw new Error("Image provider returned no generated files.");
  }

  return files;
}

function hasFileResponse(value: unknown): value is { files: Array<{ mediaType: string; base64: string }> } {
  return (
    typeof value === "object" &&
    value !== null &&
    "files" in value &&
    Array.isArray((value as { files?: unknown }).files)
  );
}
