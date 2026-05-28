"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AiModelRouterPrisma } from "@/lib/ai/model-router";
import { requireUserWorkspace } from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";
import { createImageRouter } from "@/lib/image/image-router";
import { buildVisualAssetCreateData } from "@/lib/visual-generation/persistence";
import type { ImageAspectRatio } from "@/types/ai";

function redirectTo(url: string): never {
  redirect(url as never);
}

async function getWorkspaceContextOrRedirect() {
  return requireUserWorkspace("/app/visual-studio");
}

export async function generateVisualAsset(formData: FormData) {
  const prompt = stringField(formData, "prompt").trim();
  const aspectRatio = aspectRatioField(formData, "aspectRatio");
  const { user, workspaceId } = await getWorkspaceContextOrRedirect();
  const prisma = getPrismaClient();
  const imageRouter = createImageRouter({ prisma: prisma as unknown as AiModelRouterPrisma });

  let result;
  try {
    result = await imageRouter.generateImage({
      workspaceId,
      userId: user.id,
      prompt,
      aspectRatio,
      referenceType: "VisualAsset",
      metadata: { source: "visual_studio" },
    });
  } catch {
    redirectTo("/app/visual-studio?error=image_generation_failed");
  }

  await prisma.visualAsset.create({
    data: buildVisualAssetCreateData({
      workspaceId,
      aspectRatio,
      prompt,
      result,
    }),
  });

  revalidatePath("/app/visual-studio");
  revalidatePath("/app/billing");
  redirectTo("/app/visual-studio?generated=image");
}

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function aspectRatioField(formData: FormData, key: string): ImageAspectRatio {
  const value = stringField(formData, key);
  if (value !== "1:1" && value !== "4:5" && value !== "16:9") {
    throw new Error(`${key} must be a supported aspect ratio.`);
  }
  return value;
}
