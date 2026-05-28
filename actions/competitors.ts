"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import {
  addTrackedChannel,
  archiveTrackedChannel,
  createChannelUpsertInput,
  deleteArchivedTrackedChannel,
  nextRecommendationStatus,
  restoreTrackedChannel,
  type CompetitorActionResult,
} from "@/lib/competitors/tracking";
import {
  syncCompetitorChannelVideosAndScores,
  type CompetitorChannelSyncPrisma,
} from "@/lib/competitors/sync";
import { getPrismaClient } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";
import { parseYoutubeChannelUrl } from "@/lib/youtube/channel-url";
import {
  addCompetitorSchema,
  recommendationActionSchema,
  trackedChannelIdSchema,
} from "@/schemas/competitors";

function redirectTo(url: string): never {
  redirect(url as never);
}

function getOptionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : undefined;
}

function safeParseChannelUrl(channelUrl: string) {
  try {
    return { success: true as const, data: parseYoutubeChannelUrl(channelUrl) };
  } catch {
    return { success: false as const };
  }
}

async function getWorkspaceId() {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirectTo("/sign-in");
  }

  const { workspaceId } = await bootstrapUserWorkspace(supabaseUser);
  return workspaceId;
}

export async function addCompetitorChannel(formData: FormData) {
  const workspaceId = await getWorkspaceId();
  const parsedInput = addCompetitorSchema.safeParse({
    channelUrl: String(formData.get("channelUrl") ?? ""),
    nickname: getOptionalString(formData, "nickname"),
  });

  if (!parsedInput.success) {
    redirectTo("/app/competitors?error=INVALID_CHANNEL_INPUT");
  }

  const input = parsedInput.data;
  const parsedChannelUrl = safeParseChannelUrl(input.channelUrl);

  if (!parsedChannelUrl.success) {
    redirectTo("/app/competitors?error=INVALID_CHANNEL_URL");
  }

  const channel = createChannelUpsertInput(parsedChannelUrl.data);
  const prisma = getPrismaClient();

  const result = await prisma.$transaction(async (tx) => {
    const addResult = await addTrackedChannel({
      tx,
      workspaceId,
      channel,
      nickname: input.nickname,
      reason: "Manually added competitor.",
    });

    if (!addResult.success) {
      return addResult;
    }

    return addResult;
  });

  if (!result.success) {
    redirectTo(`/app/competitors?error=${result.code}`);
  }

  try {
    await syncCompetitorChannelVideosAndScores({
      prisma: prisma as unknown as CompetitorChannelSyncPrisma,
      channelId: result.data.channelId,
      workspaceId,
    });
  } catch {
    revalidatePath("/app/competitors");
    redirectTo("/app/competitors?error=YOUTUBE_BACKFILL_FAILED");
  }

  revalidatePath("/app/competitors");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/outliers");
  redirectTo("/app/competitors?added=1&backfill=completed");
}

export async function archiveCompetitorChannel(formData: FormData) {
  const workspaceId = await getWorkspaceId();
  const parsedInput = trackedChannelIdSchema.safeParse({
    trackedChannelId: String(formData.get("trackedChannelId") ?? ""),
  });

  if (!parsedInput.success) {
    redirectTo("/app/competitors?error=INVALID_TRACKED_CHANNEL");
  }

  const input = parsedInput.data;
  const prisma = getPrismaClient();

  const result = await prisma.$transaction((tx) =>
    archiveTrackedChannel({
      tx,
      workspaceId,
      trackedChannelId: input.trackedChannelId,
    }),
  );

  if (!result.success) {
    redirectTo(`/app/competitors?error=${result.code}`);
  }

  revalidatePath("/app/competitors");
  redirectTo("/app/competitors?archived=1");
}

export async function restoreCompetitorChannel(formData: FormData) {
  const workspaceId = await getWorkspaceId();
  const parsedInput = trackedChannelIdSchema.safeParse({
    trackedChannelId: String(formData.get("trackedChannelId") ?? ""),
  });

  if (!parsedInput.success) {
    redirectTo("/app/competitors?error=INVALID_TRACKED_CHANNEL");
  }

  const input = parsedInput.data;
  const prisma = getPrismaClient();

  const result = await prisma.$transaction((tx) =>
    restoreTrackedChannel({
      tx,
      workspaceId,
      trackedChannelId: input.trackedChannelId,
    }),
  );

  if (!result.success) {
    redirectTo(`/app/competitors?error=${result.code}`);
  }

  revalidatePath("/app/competitors");
  redirectTo("/app/competitors?restored=1");
}

export async function deleteArchivedCompetitorChannel(formData: FormData) {
  const workspaceId = await getWorkspaceId();
  const parsedInput = trackedChannelIdSchema.safeParse({
    trackedChannelId: String(formData.get("trackedChannelId") ?? ""),
  });

  if (!parsedInput.success) {
    redirectTo("/app/competitors?error=INVALID_TRACKED_CHANNEL");
  }

  const input = parsedInput.data;
  const prisma = getPrismaClient();

  const result = await prisma.$transaction((tx) =>
    deleteArchivedTrackedChannel({
      tx,
      workspaceId,
      trackedChannelId: input.trackedChannelId,
    }),
  );

  if (!result.success) {
    redirectTo(`/app/competitors?error=${result.code}`);
  }

  revalidatePath("/app/competitors");
  redirectTo("/app/competitors?deleted=1");
}

export async function runCompetitorChannelBackfill(formData: FormData) {
  const workspaceId = await getWorkspaceId();
  const parsedInput = trackedChannelIdSchema.safeParse({
    trackedChannelId: String(formData.get("trackedChannelId") ?? ""),
  });

  if (!parsedInput.success) {
    redirectTo("/app/competitors?error=INVALID_TRACKED_CHANNEL");
  }

  const prisma = getPrismaClient();
  const trackedChannel = await prisma.trackedChannel.findFirst({
    where: {
      id: parsedInput.data.trackedChannelId,
      workspaceId,
      isActive: true,
    },
    select: {
      youtubeChannelId: true,
    },
  });

  if (!trackedChannel) {
    redirectTo("/app/competitors?error=TRACKED_CHANNEL_NOT_FOUND");
  }

  try {
    await syncCompetitorChannelVideosAndScores({
      prisma: prisma as unknown as CompetitorChannelSyncPrisma,
      channelId: trackedChannel.youtubeChannelId,
      workspaceId,
    });
  } catch {
    redirectTo("/app/competitors?error=YOUTUBE_BACKFILL_FAILED");
  }

  revalidatePath("/app/competitors");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/outliers");
  redirectTo("/app/competitors?backfill=completed");
}

export async function updateCompetitorRecommendation(formData: FormData) {
  const workspaceId = await getWorkspaceId();
  const parsedInput = recommendationActionSchema.safeParse({
    recommendationId: String(formData.get("recommendationId") ?? ""),
    action: String(formData.get("action") ?? ""),
  });

  if (!parsedInput.success) {
    redirectTo("/app/competitors?error=INVALID_RECOMMENDATION_ACTION");
  }

  const input = parsedInput.data;
  const prisma = getPrismaClient();
  let approvedChannelId: string | null = null;

  const result = await prisma.$transaction(async (tx): Promise<CompetitorActionResult<{ recommendationId: string }>> => {
    const recommendation = await tx.competitorRecommendation.findFirst({
      where: {
        id: input.recommendationId,
        workspaceId,
        status: "NEW",
      },
      select: {
        id: true,
        channelUrl: true,
        title: true,
        reason: true,
      },
    });

    if (!recommendation) {
      return {
        success: false,
        error: "Recommendation was not found.",
        code: "RECOMMENDATION_NOT_FOUND",
      };
    }

    if (input.action === "approve") {
      const parsedChannelUrl = safeParseChannelUrl(recommendation.channelUrl);

      if (!parsedChannelUrl.success) {
        return {
          success: false,
          error: "Recommendation URL is invalid.",
          code: "INVALID_RECOMMENDATION_URL",
        };
      }

      const addResult = await addTrackedChannel({
        tx,
        workspaceId,
        channel: createChannelUpsertInput(parsedChannelUrl.data),
        nickname: recommendation.title,
        reason: recommendation.reason,
        addedByRecommendation: true,
      });

      if (!addResult.success) {
        return addResult;
      }

      approvedChannelId = addResult.data.channelId;
    }

    const updated = await tx.competitorRecommendation.updateMany({
      where: { id: recommendation.id, workspaceId, status: "NEW" },
      data: { status: nextRecommendationStatus(input.action) },
    });

    if (updated.count === 0) {
      return {
        success: false,
        error: "Recommendation was not found.",
        code: "RECOMMENDATION_NOT_FOUND",
      };
    }

    return {
      success: true,
      data: { recommendationId: recommendation.id },
    };
  });

  if (!result.success) {
    redirectTo(`/app/competitors?error=${result.code}`);
  }

  if (approvedChannelId) {
    try {
      await syncCompetitorChannelVideosAndScores({
        prisma: prisma as unknown as CompetitorChannelSyncPrisma,
        channelId: approvedChannelId,
        workspaceId,
      });
    } catch {
      revalidatePath("/app/competitors");
      redirectTo("/app/competitors?error=YOUTUBE_BACKFILL_FAILED");
    }
  }

  revalidatePath("/app/competitors");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/outliers");
  redirectTo(approvedChannelId ? "/app/competitors?recommendation=updated&backfill=completed" : "/app/competitors?recommendation=updated");
}
