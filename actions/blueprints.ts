"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserWorkspace } from "@/lib/auth/session";
import {
  runCompetitorBlueprintAnalysisJob,
  type BlueprintRunnerPrisma,
} from "@/lib/blueprints/runner";
import { getPrismaClient } from "@/lib/db/prisma";

function redirectTo(url: string): never {
  redirect(url as never);
}

export async function refreshCompetitorBlueprints() {
  const { workspaceId } = await requireUserWorkspace("/app/dashboard");
  const prisma = getPrismaClient();

  let summary;
  try {
    summary = await runCompetitorBlueprintAnalysisJob({
      prisma: prisma as unknown as BlueprintRunnerPrisma,
      workspaceId,
    });
  } catch {
    redirectTo("/app/dashboard?error=BLUEPRINT_REFRESH_FAILED");
  }

  revalidatePath("/app/dashboard");
  revalidatePath("/app/topic-ideas");
  revalidatePath("/app/content-studio");
  redirectTo(
    `/app/dashboard?blueprints=updated&channels=${summary.channelsEvaluated}&created=${summary.blueprintsCreated}&updated=${summary.blueprintsUpdated}&skipped=${summary.channelsSkipped}`,
  );
}

export async function refreshCompetitorChannelBlueprint(formData: FormData) {
  const trackedChannelId = stringField(formData, "trackedChannelId");
  const { workspaceId } = await requireUserWorkspace(`/app/competitors/${trackedChannelId}`);
  const prisma = getPrismaClient();
  const trackedChannel = await prisma.trackedChannel.findFirst({
    where: {
      id: trackedChannelId,
      workspaceId,
      isActive: true,
    },
    select: { youtubeChannelId: true },
  });

  if (!trackedChannel) {
    redirectTo("/app/competitors?error=CHANNEL_NOT_FOUND");
  }

  let summary;
  try {
    summary = await runCompetitorBlueprintAnalysisJob({
      prisma: prisma as unknown as BlueprintRunnerPrisma,
      workspaceId,
      youtubeChannelId: trackedChannel.youtubeChannelId,
    });
  } catch {
    redirectTo(`/app/competitors/${trackedChannelId}?error=BLUEPRINT_REFRESH_FAILED`);
  }

  revalidatePath("/app/dashboard");
  revalidatePath("/app/topic-ideas");
  revalidatePath("/app/content-studio");
  revalidatePath("/app/competitors");
  revalidatePath(`/app/competitors/${trackedChannelId}`);
  redirectTo(
    `/app/competitors/${trackedChannelId}?blueprint=updated&channels=${summary.channelsEvaluated}&created=${summary.blueprintsCreated}&updated=${summary.blueprintsUpdated}&skipped=${summary.channelsSkipped}`,
  );
}

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} is required.`);
  }
  return value;
}
