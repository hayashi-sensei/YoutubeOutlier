"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AiModelRouterPrisma } from "@/lib/ai/model-router";
import { requireUserWorkspace } from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";
import { createImageRouter } from "@/lib/image/image-router";
import {
  buildVisualStrategy,
  dataUrlFromImageFile,
  visualAssetDimensions,
  visualAssetStoragePath,
} from "@/lib/visual-generation/strategy";
import { visualAspectRatioSchema, visualStrategyInputSchema, visualStrategySchema } from "@/schemas/visual-generation";
import type { AiQualityTier } from "@/types/ai";
import type { BuildVisualStrategyInput, VisualAssetTypeInput, VisualStrategy } from "@/types/visual-generation";

type VisualAssetTransaction = {
  visualAsset: {
    create(input: {
      data: {
        workspaceId: string;
        contentItemId?: string | null;
        aiGenerationId?: string | null;
        assetType: VisualAssetTypeInput;
        provider: string;
        model?: string | null;
        aspectRatio: string;
        prompt: string;
        visualStrategy: VisualStrategy;
        editableOverlays: VisualStrategy["editableOverlays"];
        imageUrl?: string | null;
        storagePath?: string | null;
        width?: number | null;
        height?: number | null;
        costUsd?: number | null;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
  contentItem: {
    update(input: {
      where: { id: string };
      data: { status?: "THUMBNAIL"; updatedAt?: Date };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
};

function redirectTo(url: string): never {
  redirect(url as never);
}

async function getWorkspaceContextOrRedirect() {
  return requireUserWorkspace("/app/visual-studio");
}

export async function generateVisualStrategy(formData: FormData) {
  const parsed = visualStrategyInputSchema.safeParse({
    contentItemId: optionalStringField(formData, "contentItemId"),
    assetType: formData.get("assetType"),
    aspectRatio: formData.get("aspectRatio"),
    brief: optionalStringField(formData, "brief"),
  });

  if (!parsed.success) {
    redirectTo("/app/visual-studio?error=visual_strategy_invalid");
  }

  const { workspaceId } = await getWorkspaceContextOrRedirect();
  const prisma = getPrismaClient();
  const [settings, contentItem] = await Promise.all([
    prisma.workspaceSettings.findUnique({
      where: { workspaceId },
      select: { brandVoice: true, cta: true },
    }),
    parsed.data.contentItemId
      ? prisma.contentItem.findFirst({
          where: { id: parsed.data.contentItemId, workspaceId },
          select: {
            id: true,
            title: true,
            manualTopic: true,
            notes: true,
            evidenceSnapshot: true,
            recommendation: {
              select: {
                topic: true,
                angle: true,
                suggestedHook: true,
                thumbnailConcept: true,
                linkedinAngle: true,
              },
            },
          },
        })
      : Promise.resolve(null),
  ]);

  if (parsed.data.contentItemId && !contentItem) {
    redirectTo("/app/visual-studio?error=content_item_not_found");
  }

  const strategy = buildVisualStrategy({
    assetType: parsed.data.assetType,
    aspectRatio: parsed.data.aspectRatio,
    brief: parsed.data.brief,
    brandVoice: settings?.brandVoice,
    cta: settings?.cta,
    contentItem,
  } satisfies BuildVisualStrategyInput);
  const dimensions = visualAssetDimensions(parsed.data.aspectRatio);
  const created = await prisma.visualAsset.create({
    data: {
      workspaceId,
      contentItemId: contentItem?.id ?? null,
      assetType: parsed.data.assetType,
      provider: "local",
      model: "visual-strategy-v1",
      aspectRatio: parsed.data.aspectRatio,
      prompt: strategy.imagePrompt,
      visualStrategy: strategy,
      editableOverlays: strategy.editableOverlays,
      width: dimensions.width,
      height: dimensions.height,
      costUsd: 0,
    },
    select: { id: true },
  });

  revalidateVisualPaths(contentItem?.id ?? null);
  redirectTo(`/app/visual-studio?strategy=${created.id}${contentItem ? `&contentItemId=${contentItem.id}` : ""}`);
}

export async function generateVisualImage(formData: FormData) {
  const strategyAssetId = stringField(formData, "strategyAssetId");
  const qualityTier = qualityTierField(formData, "qualityTier");
  const { user, workspaceId } = await getWorkspaceContextOrRedirect();
  const prisma = getPrismaClient();
  const strategyAsset = await prisma.visualAsset.findFirst({
    where: { id: strategyAssetId, workspaceId },
    select: {
      id: true,
      contentItemId: true,
      assetType: true,
      aspectRatio: true,
      prompt: true,
      visualStrategy: true,
      editableOverlays: true,
    },
  });

  if (!strategyAsset) {
    redirectTo("/app/visual-studio?error=visual_strategy_not_found");
  }

  const parsedStrategy = visualStrategySchema.safeParse(strategyAsset.visualStrategy);
  if (!parsedStrategy.success) {
    redirectTo("/app/visual-studio?error=visual_strategy_invalid");
  }

  const parsedAspectRatio = visualAspectRatioSchema.safeParse(strategyAsset.aspectRatio);
  if (!parsedAspectRatio.success) {
    redirectTo("/app/visual-studio?error=visual_strategy_invalid");
  }
  const dimensions = visualAssetDimensions(parsedAspectRatio.data);
  const imageRouter = createImageRouter({ prisma: prisma as unknown as AiModelRouterPrisma });
  const result = await imageRouter.generateImage({
    workspaceId,
    userId: user.id,
    prompt: imagePromptFromStrategy(parsedStrategy.data),
    aspectRatio: parsedAspectRatio.data,
    qualityTier,
    referenceType: "VisualAsset",
    referenceId: strategyAsset.id,
    metadata: {
      source: "visual_studio",
      contentItemId: strategyAsset.contentItemId,
      strategyAssetId: strategyAsset.id,
      assetType: strategyAsset.assetType,
    },
    onSuccessTransaction: async ({ generationId, provider, model, costUsd, files, transaction }) => {
      const firstFile = files[0];
      const tx = transaction as VisualAssetTransaction;
      await tx.visualAsset.create({
        data: {
          workspaceId,
          contentItemId: strategyAsset.contentItemId,
          aiGenerationId: generationId,
          assetType: strategyAsset.assetType,
          provider,
          model,
          aspectRatio: strategyAsset.aspectRatio,
          prompt: strategyAsset.prompt,
          visualStrategy: parsedStrategy.data,
          editableOverlays: parsedStrategy.data.editableOverlays,
          imageUrl: dataUrlFromImageFile(firstFile),
          storagePath: visualAssetStoragePath({
            workspaceId,
            contentItemId: strategyAsset.contentItemId,
            assetType: strategyAsset.assetType,
            generationId,
            mediaType: firstFile?.mediaType,
          }),
          width: dimensions.width,
          height: dimensions.height,
          costUsd,
        },
        select: { id: true },
      });

      if (strategyAsset.contentItemId && strategyAsset.assetType === "YOUTUBE_THUMBNAIL") {
        await tx.contentItem.update({
          where: { id: strategyAsset.contentItemId },
          data: { status: "THUMBNAIL" },
          select: { id: true },
        });
      }
    },
  }).catch(() => null);

  if (!result) {
    redirectTo(`/app/visual-studio?error=image_generation_failed&strategy=${strategyAsset.id}`);
  }

  revalidateVisualPaths(strategyAsset.contentItemId);
  redirectTo(`/app/visual-studio?generated=image&strategy=${strategyAsset.id}${strategyAsset.contentItemId ? `&contentItemId=${strategyAsset.contentItemId}` : ""}`);
}

function imagePromptFromStrategy(strategy: VisualStrategy): string {
  return [
    strategy.imagePrompt,
    `Negative prompt: ${strategy.negativePrompt}.`,
    strategy.providerNotes,
  ].join("\n");
}

function revalidateVisualPaths(contentItemId: string | null) {
  revalidatePath("/app/visual-studio");
  revalidatePath("/app/billing");
  if (contentItemId) {
    revalidatePath(`/app/content-studio/${contentItemId}`);
    revalidatePath("/app/content-studio");
    revalidatePath("/app/calendar");
  }
}

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required.`);
  }
  return value.trim();
}

function optionalStringField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function qualityTierField(formData: FormData, key: string): AiQualityTier {
  const value = stringField(formData, key);
  if (value === "bulk" || value === "standard" || value === "premium") {
    return value;
  }
  throw new Error(`${key} must be a supported AI quality tier.`);
}
