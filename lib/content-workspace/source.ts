import type { ContentWorkspaceEvidenceSnapshot, ContentWorkspaceSourceType } from "@/types/content-workspace";

type RecommendationForWorkspace = {
  id: string;
  workspaceId: string;
  title: string;
  topic: string;
  angle: string | null;
  whyNow: string | null;
  audiencePainPoint: string | null;
  opportunityScore: number | null;
  suggestedTitle: string | null;
  suggestedHook: string | null;
  thumbnailConcept: string | null;
  linkedinAngle: string | null;
  sourceTrackedChannelId: string | null;
  workspace: { id: string; name: string; planCode: string };
  sourceTrackedChannel: {
    id: string;
    nickname: string | null;
    reason: string | null;
    youtubeChannelId: string;
    channel: {
      id: string;
      youtubeChannelId: string;
      title: string;
      handle: string | null;
      competitorBlueprints: Array<{
        id: string;
        summary: string | null;
        videoCount: number;
        averageOutlierScore: number | null;
        generatedAt: Date;
        titlePatterns: unknown;
        hookPatterns: unknown;
        thumbnailPatterns: unknown;
        contentPillars: unknown;
        structurePatterns: unknown;
        ctaPatterns: unknown;
        emotionalAngles: unknown;
        observationsJson: unknown;
        topVideoIds: string[];
      }>;
    };
  } | null;
  evidences: Array<{
    id: string;
    evidenceType: string;
    note: string | null;
    video: {
      id: string;
      youtubeVideoId: string;
      title: string;
      channel: { title: string; handle: string | null };
      outlierScores: Array<{
        outlierScore: number;
        multiplier: number | null;
        calculatedAt: Date;
      }>;
    } | null;
    sourceItem: {
      id: string;
      title: string;
      url: string;
      source: { name: string | null; url: string };
    } | null;
  }>;
};

export type ContentWorkspaceSourcePrisma = {
  topicRecommendation: {
    findFirst(input: unknown): Promise<RecommendationForWorkspace | null>;
    update(input: {
      where: { id: string };
      data: { status: "USED" };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
  contentItem: {
    findFirst(input: {
      where: { workspaceId: string; recommendationId: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(input: {
      data: {
        workspaceId: string;
        recommendationId: string | null;
        title: string;
        contentType: string;
        status: "IDEA";
        sourceType: ContentWorkspaceSourceType;
        manualTopic?: string | null;
        evidenceSnapshot: ContentWorkspaceEvidenceSnapshot;
        notes: string | null;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
};

export type ManualContentWorkspacePrisma = {
  contentItem: {
    create: ContentWorkspaceSourcePrisma["contentItem"]["create"];
  };
};

export async function openRecommendationContentWorkspace(
  prisma: ContentWorkspaceSourcePrisma,
  input: { workspaceId: string; recommendationId: string },
): Promise<{ contentItemId: string; reused: boolean }> {
  const existing = await prisma.contentItem.findFirst({
    where: { workspaceId: input.workspaceId, recommendationId: input.recommendationId },
    select: { id: true },
  });
  if (existing) {
    await markRecommendationUsed(prisma, input.recommendationId);
    return { contentItemId: existing.id, reused: true };
  }

  const recommendation = await prisma.topicRecommendation.findFirst({
    where: {
      id: input.recommendationId,
      workspaceId: input.workspaceId,
      status: { notIn: ["DISMISSED"] },
    },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      topic: true,
      angle: true,
      whyNow: true,
      audiencePainPoint: true,
      opportunityScore: true,
      suggestedTitle: true,
      suggestedHook: true,
      thumbnailConcept: true,
      linkedinAngle: true,
      sourceTrackedChannelId: true,
      workspace: { select: { id: true, name: true, planCode: true } },
      sourceTrackedChannel: {
        select: {
          id: true,
          nickname: true,
          reason: true,
          youtubeChannelId: true,
          channel: {
            select: {
              id: true,
              youtubeChannelId: true,
              title: true,
              handle: true,
              competitorBlueprints: {
                where: { workspaceId: input.workspaceId },
                take: 1,
                select: {
                  id: true,
                  summary: true,
                  videoCount: true,
                  averageOutlierScore: true,
                  generatedAt: true,
                  titlePatterns: true,
                  hookPatterns: true,
                  thumbnailPatterns: true,
                  contentPillars: true,
                  structurePatterns: true,
                  ctaPatterns: true,
                  emotionalAngles: true,
                  observationsJson: true,
                  topVideoIds: true,
                },
              },
            },
          },
        },
      },
      evidences: {
        select: {
          id: true,
          evidenceType: true,
          note: true,
          video: {
            select: {
              id: true,
              youtubeVideoId: true,
              title: true,
              channel: { select: { title: true, handle: true } },
              outlierScores: {
                orderBy: { calculatedAt: "desc" },
                take: 1,
                select: { outlierScore: true, multiplier: true, calculatedAt: true },
              },
            },
          },
          sourceItem: {
            select: {
              id: true,
              title: true,
              url: true,
              source: { select: { name: true, url: true } },
            },
          },
        },
      },
    },
  });
  if (!recommendation) {
    throw new Error("Recommendation was not found for this workspace.");
  }

  const sourceType: ContentWorkspaceSourceType = recommendation.sourceTrackedChannelId
    ? "channel_recommendation"
    : "recommendation";
  const contentItem = await prisma.contentItem.create({
    data: {
      workspaceId: input.workspaceId,
      recommendationId: recommendation.id,
      title: recommendation.suggestedTitle ?? recommendation.title,
      contentType: "youtube_video",
      status: "IDEA",
      sourceType,
      evidenceSnapshot: buildEvidenceSnapshot(input.workspaceId, sourceType, recommendation),
      notes: `Created from topic recommendation: ${recommendation.topic}`,
    },
    select: { id: true },
  });
  await markRecommendationUsed(prisma, recommendation.id);

  return { contentItemId: contentItem.id, reused: false };
}

export async function createManualContentWorkspace(
  prisma: ManualContentWorkspacePrisma,
  input: { workspaceId: string; topic: string; angle?: string | null },
): Promise<{ contentItemId: string }> {
  const contentItem = await prisma.contentItem.create({
    data: {
      workspaceId: input.workspaceId,
      recommendationId: null,
      title: input.topic,
      contentType: "youtube_video",
      status: "IDEA",
      sourceType: "manual_topic",
      manualTopic: input.topic,
      evidenceSnapshot: {
        workspaceId: input.workspaceId,
        sourceType: "manual_topic",
        manualTopic: input.topic,
        angle: input.angle ?? null,
        evidences: [],
      },
      notes: input.angle ?? null,
    },
    select: { id: true },
  });

  return { contentItemId: contentItem.id };
}

function buildEvidenceSnapshot(
  workspaceId: string,
  sourceType: ContentWorkspaceSourceType,
  recommendation: RecommendationForWorkspace,
): ContentWorkspaceEvidenceSnapshot {
  return {
    workspaceId,
    sourceType,
    workspace: {
      id: recommendation.workspace.id,
      name: recommendation.workspace.name,
      planCode: recommendation.workspace.planCode,
    },
    recommendation: {
      id: recommendation.id,
      topic: recommendation.topic,
      title: recommendation.title,
      angle: recommendation.angle,
      whyNow: recommendation.whyNow,
      audiencePainPoint: recommendation.audiencePainPoint,
      opportunityScore: recommendation.opportunityScore,
      suggestedTitle: recommendation.suggestedTitle,
      suggestedHook: recommendation.suggestedHook,
      thumbnailConcept: recommendation.thumbnailConcept,
      linkedinAngle: recommendation.linkedinAngle,
      sourceTrackedChannelId: recommendation.sourceTrackedChannelId,
    },
    channel: recommendation.sourceTrackedChannel
      ? {
          trackedChannelId: recommendation.sourceTrackedChannel.id,
          youtubeChannelId: recommendation.sourceTrackedChannel.channel.youtubeChannelId,
          title: recommendation.sourceTrackedChannel.channel.title,
          handle: recommendation.sourceTrackedChannel.channel.handle,
          nickname: recommendation.sourceTrackedChannel.nickname,
          reason: recommendation.sourceTrackedChannel.reason,
        }
      : null,
    blueprint: blueprintSnapshot(recommendation),
    evidences: recommendation.evidences.map((evidence) => ({
      id: evidence.id,
      evidenceType: evidence.evidenceType,
      note: evidence.note,
      video: evidence.video
        ? {
            id: evidence.video.id,
            youtubeVideoId: evidence.video.youtubeVideoId,
            title: evidence.video.title,
            channelTitle: evidence.video.channel.title,
            channelHandle: evidence.video.channel.handle,
            outlier: evidence.video.outlierScores[0]
              ? {
                  outlierScore: evidence.video.outlierScores[0].outlierScore,
                  multiplier: evidence.video.outlierScores[0].multiplier,
                  calculatedAt: evidence.video.outlierScores[0].calculatedAt.toISOString(),
                }
              : null,
          }
        : null,
      sourceItem: evidence.sourceItem
        ? {
            id: evidence.sourceItem.id,
            title: evidence.sourceItem.title,
            url: evidence.sourceItem.url,
            sourceName: evidence.sourceItem.source.name,
            sourceUrl: evidence.sourceItem.source.url,
          }
        : null,
    })),
  };
}

async function markRecommendationUsed(
  prisma: Pick<ContentWorkspaceSourcePrisma, "topicRecommendation">,
  recommendationId: string,
): Promise<void> {
  await prisma.topicRecommendation.update({
    where: { id: recommendationId },
    data: { status: "USED" },
    select: { id: true },
  });
}

function blueprintSnapshot(recommendation: RecommendationForWorkspace): ContentWorkspaceEvidenceSnapshot["blueprint"] {
  const blueprint = recommendation.sourceTrackedChannel?.channel.competitorBlueprints[0];
  if (!blueprint) {
    return null;
  }

  return {
    id: blueprint.id,
    summary: blueprint.summary,
    videoCount: blueprint.videoCount,
    averageOutlierScore: blueprint.averageOutlierScore,
    generatedAt: blueprint.generatedAt.toISOString(),
    titlePatterns: blueprint.titlePatterns,
    hookPatterns: blueprint.hookPatterns,
    thumbnailPatterns: blueprint.thumbnailPatterns,
    contentPillars: blueprint.contentPillars,
    structurePatterns: blueprint.structurePatterns,
    ctaPatterns: blueprint.ctaPatterns,
    emotionalAngles: blueprint.emotionalAngles,
    observationsJson: blueprint.observationsJson,
    topVideoIds: blueprint.topVideoIds,
  };
}
