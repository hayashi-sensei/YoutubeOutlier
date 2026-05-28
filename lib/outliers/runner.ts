import {
  calculateChannelBaseline,
  calculateOpportunityScore,
  calculateOutlierScore,
  calculateRepeatSignalScore,
} from "./scoring";
import type {
  OpportunityWorkspaceInput,
  RepeatSignalVideo,
  VideoMetricSnapshotInput,
} from "../../types/outliers";

const SCORE_LOOKBACK_LIMIT = 100;
const RECENT_VIDEO_DAYS = 21;

type RunnerSnapshot = {
  viewCount: bigint | number | null;
  likeCount: bigint | number | null;
  commentCount: bigint | number | null;
  capturedAt: Date;
};

type RunnerAnalysis = {
  contentPillar: string | null;
  hookType: string | null;
  titlePattern: string | null;
};

type RunnerVideo = {
  id: string;
  title: string;
  description: string | null;
  publishedAt: Date;
  tags: string[];
  metricSnapshots: RunnerSnapshot[];
  analyses: RunnerAnalysis[];
  opportunityScores?: Array<{ id: string }>;
};

type RunnerWorkspaceSettings = {
  primaryNiche: string;
  subNiche: string | null;
  targetAudience: string | null;
  brandVoice: string | null;
  topicsToAvoid: string | string[] | null;
};

type RunnerTrackedWorkspace = {
  workspaceId: string;
  workspace: {
    settings: RunnerWorkspaceSettings | null;
    industrySources: Array<{
      items: Array<{ title: string; summary: string | null }>;
    }>;
    trackedChannels: Array<{
      channel: {
        videos: Array<{ id: string; title: string; tags: string[] }>;
      };
    }>;
  };
};

type RunnerChannel = {
  id: string;
  videos: RunnerVideo[];
  trackedBy: RunnerTrackedWorkspace[];
};

type ChannelFindUniqueInput = {
  where: { id: string };
  select: {
    id: true;
    videos: unknown;
    trackedBy: unknown;
  };
};

export type OutlierScoreRefreshSummary = {
  channelId: string;
  workspaceId?: string;
  videosEvaluated: number;
  outlierScoresCreated: number;
  opportunityScoresCreated: number;
  skippedVideos: number;
};

export type OutlierRunnerPrisma = {
  youtubeChannel: {
    findUnique(input: ChannelFindUniqueInput): Promise<RunnerChannel | null>;
  };
  outlierScore: {
    create(input: {
      data: {
        youtubeVideoId: string;
        channelBaselineViews: number;
        relativeViewPerformance: number;
        viewVelocityScore: number;
        engagementScore: number;
        recencyScore: number;
        repeatSignalScore: number;
        outlierScore: number;
        multiplier: number;
        calculatedAt: Date;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
  workspaceVideoOpportunityScore: {
    create(input: {
      data: {
        workspaceId: string;
        youtubeVideoId: string;
        outlierScoreId: string;
        nicheRelevanceScore: number;
        topicFreshnessScore: number;
        competitiveSaturationScore: number;
        sourceCorroborationScore: number;
        brandFitScore: number;
        opportunityScore: number;
        calculatedAt: Date;
      };
    }): Promise<unknown>;
  };
};

export async function runOutlierScoreRefreshJob(input: {
  prisma: OutlierRunnerPrisma;
  channelId: string;
  workspaceId?: string;
  missingOpportunityScoresOnly?: boolean;
  now?: Date;
}): Promise<OutlierScoreRefreshSummary> {
  if (input.missingOpportunityScoresOnly && !input.workspaceId) {
    throw new Error("workspaceId is required when backfilling missing opportunity scores.");
  }

  const now = input.now ?? new Date();
  const channel = await input.prisma.youtubeChannel.findUnique({
    where: { id: input.channelId },
    select: {
      id: true,
      videos: {
        orderBy: { publishedAt: "desc" },
        take: SCORE_LOOKBACK_LIMIT,
        select: {
          id: true,
          title: true,
          description: true,
          publishedAt: true,
          tags: true,
          metricSnapshots: {
            orderBy: { capturedAt: "desc" },
            take: 2,
            select: {
              viewCount: true,
              likeCount: true,
              commentCount: true,
              capturedAt: true,
            },
          },
          analyses: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              contentPillar: true,
              hookType: true,
              titlePattern: true,
            },
          },
          ...(input.missingOpportunityScoresOnly && input.workspaceId
            ? {
                opportunityScores: {
                  where: { workspaceId: input.workspaceId },
                  take: 1,
                  select: { id: true },
                },
              }
            : {}),
        },
      },
      trackedBy: {
        where: {
          isActive: true,
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        },
        select: {
          workspaceId: true,
          workspace: {
            select: {
              settings: {
                select: {
                  primaryNiche: true,
                  subNiche: true,
                  targetAudience: true,
                  brandVoice: true,
                  topicsToAvoid: true,
                },
              },
              industrySources: {
                where: { isActive: true },
                select: {
                  items: {
                    orderBy: { fetchedAt: "desc" },
                    take: 25,
                    select: { title: true, summary: true },
                  },
                },
              },
              trackedChannels: {
                where: { isActive: true },
                select: {
                  channel: {
                    select: {
                      videos: {
                        where: { publishedAt: { gte: daysAgo(now, RECENT_VIDEO_DAYS) } },
                        take: 100,
                        select: { id: true, title: true, tags: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!channel) {
    throw new Error(`YouTube channel not found: ${input.channelId}`);
  }

  const baseline = calculateChannelBaseline(
    channel.videos.map((video) => ({
      id: video.id,
      viewCount: toNumber(video.metricSnapshots[0]?.viewCount),
    })),
  );
  let outlierScoresCreated = 0;
  let opportunityScoresCreated = 0;
  let skippedVideos = 0;

  for (const video of channel.videos) {
    if (input.missingOpportunityScoresOnly && (video.opportunityScores?.length ?? 0) > 0) {
      continue;
    }

    const latestSnapshot = snapshotInput(video.metricSnapshots[0]);
    if (!latestSnapshot) {
      skippedVideos += 1;
      continue;
    }

    const outlier = calculateOutlierScore({
      videoId: video.id,
      publishedAt: video.publishedAt,
      latestSnapshot,
      previousSnapshot: snapshotInput(video.metricSnapshots[1]),
      channelBaselineViews: baseline,
      repeatSignalScore: calculateRepeatSignalScore({
        video: repeatVideo(video),
        peers: channel.videos.filter((peer) => peer.id !== video.id).map(repeatVideo),
      }),
      now,
    });

    if (!outlier) {
      skippedVideos += 1;
      continue;
    }

    const created = await input.prisma.outlierScore.create({
      data: {
        youtubeVideoId: video.id,
        channelBaselineViews: outlier.channelBaselineViews,
        relativeViewPerformance: outlier.relativeViewPerformance,
        viewVelocityScore: outlier.viewVelocityScore,
        engagementScore: outlier.engagementScore,
        recencyScore: outlier.recencyScore,
        repeatSignalScore: outlier.repeatSignalScore,
        outlierScore: outlier.outlierScore,
        multiplier: outlier.multiplier,
        calculatedAt: now,
      },
      select: { id: true },
    });
    outlierScoresCreated += 1;

    for (const tracked of channel.trackedBy) {
      const settings = tracked.workspace.settings;
      if (!settings) {
        continue;
      }

      const opportunity = calculateOpportunityScore({
        outlierScore: outlier.outlierScore,
        workspace: workspaceInput(settings),
        topic: `${video.title} ${video.tags.join(" ")}`,
        angle: video.description,
        publishedAt: video.publishedAt,
        competitiveSaturation: scoreCompetitiveSaturation(
          countSimilarTrackedVideos(video, tracked.workspace.trackedChannels),
        ),
        sourceCorroboration: scoreSourceCorroboration(
          countCorroboratingSources(video, tracked.workspace.industrySources),
        ),
        now,
      });

      await input.prisma.workspaceVideoOpportunityScore.create({
        data: {
          workspaceId: tracked.workspaceId,
          youtubeVideoId: video.id,
          outlierScoreId: created.id,
          nicheRelevanceScore: opportunity.userNicheRelevanceScore,
          topicFreshnessScore: opportunity.topicFreshnessScore,
          competitiveSaturationScore: opportunity.competitiveSaturationScore,
          sourceCorroborationScore: opportunity.sourceCorroborationScore,
          brandFitScore: opportunity.brandFitScore,
          opportunityScore: opportunity.opportunityScore,
          calculatedAt: now,
        },
      });
      opportunityScoresCreated += 1;
    }
  }

  return {
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    channelId: channel.id,
    videosEvaluated: channel.videos.length,
    outlierScoresCreated,
    opportunityScoresCreated,
    skippedVideos,
  };
}

function repeatVideo(video: RunnerVideo): RepeatSignalVideo {
  const analysis = video.analyses[0];
  return {
    id: video.id,
    contentPillar: analysis?.contentPillar,
    hookType: analysis?.hookType,
    titlePattern: analysis?.titlePattern,
    tags: video.tags,
  };
}

function snapshotInput(snapshot?: RunnerSnapshot): VideoMetricSnapshotInput | null {
  if (!snapshot) {
    return null;
  }

  return {
    viewCount: toNumber(snapshot.viewCount),
    likeCount: toNumber(snapshot.likeCount),
    commentCount: toNumber(snapshot.commentCount),
    capturedAt: snapshot.capturedAt,
  };
}

function workspaceInput(settings: RunnerWorkspaceSettings): OpportunityWorkspaceInput {
  return {
    primaryNiche: settings.primaryNiche,
    subNiche: settings.subNiche,
    targetAudience: settings.targetAudience,
    brandVoice: settings.brandVoice,
    topicsToAvoid: normalizeTopicsToAvoid(settings.topicsToAvoid),
  };
}

function countSimilarTrackedVideos(
  video: RunnerVideo,
  trackedChannels: Array<{ channel: { videos: Array<{ id: string; title: string; tags: string[] }> } }>,
): number {
  const terms = tokenSet(`${video.title} ${video.tags.join(" ")}`);
  if (terms.size === 0) {
    return 0;
  }

  return trackedChannels
    .flatMap((tracked) => tracked.channel.videos)
    .filter((candidate) => candidate.id !== video.id)
    .filter((candidate) =>
      tokenize(`${candidate.title} ${candidate.tags.join(" ")}`).some((term) => terms.has(term)),
    ).length;
}

function countCorroboratingSources(
  video: RunnerVideo,
  sources: Array<{ items: Array<{ title: string; summary: string | null }> }>,
): number {
  const terms = tokenSet(`${video.title} ${video.description ?? ""} ${video.tags.join(" ")}`);
  if (terms.size === 0) {
    return 0;
  }

  return sources
    .flatMap((source) => source.items)
    .filter((item) =>
      tokenize(`${item.title} ${item.summary ?? ""}`).some((term) => terms.has(term)),
    ).length;
}

function scoreCompetitiveSaturation(similarTrackedVideoCount: number): number {
  return clampScore(90 - similarTrackedVideoCount * 10);
}

function scoreSourceCorroboration(corroboratingSourceItemCount: number): number {
  return clampScore(35 + corroboratingSourceItemCount * 15);
}

function normalizeTopicsToAvoid(value: string | string[] | null): string[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value) {
    return null;
  }

  return value
    .split(/[\n,]+/u)
    .map((topic) => topic.trim())
    .filter((topic) => topic.length > 0);
}

function tokenSet(value: string): Set<string> {
  return new Set(tokenize(value));
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((term) => term.length >= 3);
}

function toNumber(value: bigint | number | null | undefined): number | null {
  if (typeof value === "bigint") {
    if (
      value > BigInt(Number.MAX_SAFE_INTEGER) ||
      value < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      return null;
    }
    return Number(value);
  }

  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return null;
  }

  return value;
}

function daysAgo(now: Date, days: number): Date {
  const result = new Date(now);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(Math.min(Math.max(value, 0), 100) * 10) / 10;
}
