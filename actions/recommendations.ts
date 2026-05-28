"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserWorkspace } from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  dismissTopicRecommendation as dismissRecommendation,
  saveRecommendationToCalendar as moveRecommendationToCalendar,
  saveTopicRecommendation as saveRecommendation,
  type CalendarMutationPrisma,
  type RecommendationMutationPrisma,
} from "@/lib/recommendations/mutations";
import {
  runTopicRecommendationJob,
  type TopicRecommendationRunnerPrisma,
} from "@/lib/recommendations/runner";

function redirectTo(url: string): never {
  redirect(url as never);
}

async function getWorkspaceIdOrRedirect(): Promise<string> {
  const { workspaceId } = await requireUserWorkspace("/app/topic-ideas");
  return workspaceId;
}

export async function generateTopicRecommendations() {
  const workspaceId = await getWorkspaceIdOrRedirect();
  const prisma = getPrismaClient();

  let summary;
  try {
    summary = await runTopicRecommendationJob({
      prisma: prisma as unknown as TopicRecommendationRunnerPrisma,
      workspaceId,
      manualRun: true,
    });
  } catch {
    redirectTo("/app/topic-ideas?error=TOPIC_RECOMMENDATION_FAILED");
  }

  revalidateRecommendationPaths();
  redirectTo(
    `/app/topic-ideas?recommendations=generated&report=${summary.reportId}&count=${summary.recommendationsCreated}`,
  );
}

export async function generateExperimentalTopicRecommendations() {
  const workspaceId = await getWorkspaceIdOrRedirect();
  const prisma = getPrismaClient();

  let summary;
  try {
    summary = await runTopicRecommendationJob({
      prisma: prisma as unknown as TopicRecommendationRunnerPrisma,
      workspaceId,
      manualRun: true,
      kind: "EXPERIMENTAL",
    });
  } catch {
    redirectTo("/app/topic-ideas?error=EXPERIMENTAL_RECOMMENDATION_FAILED");
  }

  revalidateRecommendationPaths();
  redirectTo(
    `/app/topic-ideas?experimental=generated&report=${summary.reportId}&count=${summary.recommendationsCreated}`,
  );
}

export async function generateChannelTopicRecommendations(formData: FormData) {
  const workspaceId = await getWorkspaceIdOrRedirect();
  const trackedChannelId = stringField(formData, "trackedChannelId");
  const prisma = getPrismaClient();
  const trackedChannel = await prisma.trackedChannel.findFirst({
    where: {
      id: trackedChannelId,
      workspaceId,
      isActive: true,
    },
    select: {
      youtubeChannelId: true,
      channel: { select: { title: true } },
    },
  });

  if (!trackedChannel) {
    redirectTo("/app/competitors?error=CHANNEL_NOT_FOUND");
  }

  let summary;
  try {
    summary = await runTopicRecommendationJob({
      prisma: prisma as unknown as TopicRecommendationRunnerPrisma,
      workspaceId,
      manualRun: true,
      youtubeChannelId: trackedChannel.youtubeChannelId,
      sourceTrackedChannelId: trackedChannelId,
      sourceLabel: trackedChannel.channel.title,
    });
  } catch {
    redirectTo(`/app/competitors/${trackedChannelId}?error=CHANNEL_RECOMMENDATION_FAILED`);
  }

  revalidateRecommendationPaths();
  revalidatePath(`/app/competitors/${trackedChannelId}`);
  redirectTo(
    `/app/competitors/${trackedChannelId}?channelTopics=generated&report=${summary.reportId}&count=${summary.recommendationsCreated}`,
  );
}

export async function saveTopicRecommendation(formData: FormData) {
  const workspaceId = await getWorkspaceIdOrRedirect();
  const recommendationId = stringField(formData, "recommendationId");
  const prisma = getPrismaClient();

  await saveRecommendation(prisma as unknown as RecommendationMutationPrisma, {
    workspaceId,
    recommendationId,
  });
  revalidateRecommendationPaths();
}

export async function dismissTopicRecommendation(formData: FormData) {
  const workspaceId = await getWorkspaceIdOrRedirect();
  const recommendationId = stringField(formData, "recommendationId");
  const prisma = getPrismaClient();

  await dismissRecommendation(prisma as unknown as RecommendationMutationPrisma, {
    workspaceId,
    recommendationId,
  });
  revalidateRecommendationPaths();
}

export async function saveRecommendationToCalendar(formData: FormData) {
  const workspaceId = await getWorkspaceIdOrRedirect();
  const recommendationId = stringField(formData, "recommendationId");
  const prisma = getPrismaClient();

  await moveRecommendationToCalendar(prisma as unknown as CalendarMutationPrisma, {
    workspaceId,
    recommendationId,
  });
  revalidateRecommendationPaths();
  redirectTo("/app/calendar?saved=recommendation");
}

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function revalidateRecommendationPaths(): void {
  revalidatePath("/app/dashboard");
  revalidatePath("/app/topic-ideas");
  revalidatePath("/app/reports");
  revalidatePath("/app/calendar");
  revalidatePath("/app/content-studio");
}
