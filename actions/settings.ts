"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserWorkspace } from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  cleanWorkspaceResearchCache,
  type ResearchCacheCleanupTx,
} from "@/lib/settings/research-cache";
import { parseWritingSamples, settingsSchema } from "@/schemas/settings";

function redirectTo(url: string): never {
  redirect(url as never);
}

function getOptionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : undefined;
}

export async function updateWorkspaceSettings(formData: FormData) {
  const { user, workspaceId } = await requireUserWorkspace("/app/settings");
  const input = settingsSchema.parse({
    primaryNiche: String(formData.get("primaryNiche") ?? ""),
    subNiche: getOptionalString(formData, "subNiche"),
    targetAudience: getOptionalString(formData, "targetAudience"),
    contentGoals: getOptionalString(formData, "contentGoals"),
    brandVoice: getOptionalString(formData, "brandVoice"),
    cta: getOptionalString(formData, "cta"),
    offers: getOptionalString(formData, "offers"),
    topicsToAvoid: getOptionalString(formData, "topicsToAvoid"),
    defaultAiQualityTier: String(formData.get("defaultAiQualityTier") ?? "standard"),
    dailyReportEnabled: formData.get("dailyReportEnabled") === "on",
    reportDeliveryEmail: String(formData.get("reportDeliveryEmail") ?? "").trim(),
    writingSamples: getOptionalString(formData, "writingSamples"),
  });

  const prisma = getPrismaClient();
  const existingSettings = await prisma.workspaceSettings.findUnique({
    where: { workspaceId },
    select: { id: true, primaryNiche: true, subNiche: true, targetAudience: true },
  });

  const nicheChanged =
    !existingSettings ||
    existingSettings.primaryNiche !== input.primaryNiche ||
    existingSettings.subNiche !== input.subNiche ||
    existingSettings.targetAudience !== input.targetAudience;

  const writingSamples = parseWritingSamples(input.writingSamples);

  await prisma.$transaction(async (tx) => {
    const settings = await tx.workspaceSettings.upsert({
      where: { workspaceId },
      update: {
        primaryNiche: input.primaryNiche,
        subNiche: input.subNiche,
        targetAudience: input.targetAudience,
        contentGoals: input.contentGoals,
        brandVoice: input.brandVoice,
        cta: input.cta,
        offers: input.offers,
        topicsToAvoid: input.topicsToAvoid,
        defaultAiQualityTier: input.defaultAiQualityTier,
        dailyReportEnabled: input.dailyReportEnabled,
        reportDeliveryEmail: input.reportDeliveryEmail || undefined,
        recommendationsStaleAt: nicheChanged ? new Date() : existingSettings ? undefined : new Date(),
      },
      create: {
        workspaceId,
        primaryNiche: input.primaryNiche,
        subNiche: input.subNiche,
        targetAudience: input.targetAudience,
        contentGoals: input.contentGoals,
        brandVoice: input.brandVoice,
        cta: input.cta,
        offers: input.offers,
        topicsToAvoid: input.topicsToAvoid,
        defaultAiQualityTier: input.defaultAiQualityTier,
        dailyReportEnabled: input.dailyReportEnabled,
        reportDeliveryEmail: input.reportDeliveryEmail || user.email,
        recommendationsStaleAt: new Date(),
      },
      select: { id: true },
    });

    await tx.writingStyleSample.deleteMany({
      where: { settingsId: settings.id },
    });

    if (writingSamples.length > 0) {
      await tx.writingStyleSample.createMany({
        data: writingSamples.map((sampleText, index) => ({
          settingsId: settings.id,
          title: `Writing sample ${index + 1}`,
          sampleText,
        })),
      });
    }
  });

  revalidatePath("/app/settings");
  redirectTo("/app/settings?saved=1");
}

export async function cleanResearchCache() {
  const { workspaceId } = await requireUserWorkspace("/app/settings");
  const prisma = getPrismaClient();
  const summary = await prisma.$transaction((tx) =>
    cleanWorkspaceResearchCache({
      tx: tx as unknown as ResearchCacheCleanupTx,
      workspaceId,
    }),
  );

  revalidatePath("/app/settings");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/sources");
  revalidatePath("/app/competitors");
  revalidatePath("/app/reports");
  revalidatePath("/app/topic-ideas");
  redirectTo(
    `/app/settings?cacheCleaned=1&sourceItems=${summary.sourceItemsDeleted}&youtubeVideos=${summary.youtubeVideosDeleted}`,
  );
}
