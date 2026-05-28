import type { CompetitorChannelIntelligence } from "@/types/competitor-intelligence";

type ChannelIntelligenceClient = {
  trackedChannel: {
    findFirst(args: unknown): Promise<unknown>;
  };
  youtubeVideo: {
    count(args: unknown): Promise<number>;
    findMany(args: unknown): Promise<unknown>;
  };
  outlierScore: {
    findMany(args: unknown): Promise<unknown>;
  };
  jobRun: {
    findFirst(args: unknown): Promise<unknown>;
  };
};

type TrackedChannelRow = {
  id: string;
  nickname: string | null;
  reason: string | null;
  isActive: boolean;
  channel: {
    id: string;
    title: string;
    handle: string | null;
    youtubeChannelId: string;
    subscriberCount: bigint | number | null;
    videoCount: number | null;
    viewCount: bigint | number | null;
    lastFetchedAt: Date | null;
    competitorBlueprints: Array<{
      id: string;
      summary: string | null;
      generatedAt: Date;
      averageOutlierScore: number | null;
      videoCount: number;
      contentPillars: unknown;
      titlePatterns: unknown;
      hookPatterns: unknown;
      thumbnailPatterns: unknown;
      structurePatterns: unknown;
      ctaPatterns: unknown;
      emotionalAngles: unknown;
      observationsJson: unknown;
    }>;
    _count: { videos: number };
  };
};

export async function getCompetitorChannelIntelligence(
  client: ChannelIntelligenceClient,
  input: { workspaceId: string; trackedChannelId: string; cachedVideoPage?: number; cachedVideoPageSize?: number },
): Promise<CompetitorChannelIntelligence | null> {
  const cachedVideoPageSize = input.cachedVideoPageSize ?? 25;
  const cachedVideoPage = Math.max(1, Math.floor(input.cachedVideoPage ?? 1));
  const trackedChannel = (await client.trackedChannel.findFirst({
    where: {
      id: input.trackedChannelId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      nickname: true,
      reason: true,
      isActive: true,
      channel: {
        select: {
          id: true,
          title: true,
          handle: true,
          youtubeChannelId: true,
          subscriberCount: true,
          videoCount: true,
          viewCount: true,
          lastFetchedAt: true,
          _count: { select: { videos: true } },
          competitorBlueprints: {
            where: { workspaceId: input.workspaceId },
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: {
              id: true,
              summary: true,
              generatedAt: true,
              averageOutlierScore: true,
              videoCount: true,
              contentPillars: true,
              titlePatterns: true,
              hookPatterns: true,
              thumbnailPatterns: true,
              structurePatterns: true,
              ctaPatterns: true,
              emotionalAngles: true,
              observationsJson: true,
            },
          },
        },
      },
    },
  })) as TrackedChannelRow | null;

  if (!trackedChannel) {
    return null;
  }

  const latestIngestionJob = (await client.jobRun.findFirst({
    where: {
      referenceType: "YoutubeChannel",
      referenceId: trackedChannel.channel.id,
      jobType: { in: ["youtube_channel_backfill", "youtube_recent_refresh"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      status: true,
      createdAt: true,
      errorMessage: true,
    },
  })) as CompetitorChannelIntelligence["latestIngestionJob"];
  const [cachedVideoTotal, cachedVideoRows, scoreRankedRows] = await Promise.all([
    client.youtubeVideo.count({
      where: { youtubeChannelId: trackedChannel.channel.id },
    }),
    client.youtubeVideo.findMany({
      where: { youtubeChannelId: trackedChannel.channel.id },
      orderBy: { publishedAt: "desc" },
      skip: (cachedVideoPage - 1) * cachedVideoPageSize,
      take: cachedVideoPageSize,
      select: {
        id: true,
        youtubeVideoId: true,
        title: true,
        thumbnailUrl: true,
        publishedAt: true,
        durationSeconds: true,
        metricSnapshots: {
          orderBy: { capturedAt: "desc" },
          take: 1,
          select: { viewCount: true },
        },
        outlierScores: {
          orderBy: { calculatedAt: "desc" },
          take: 1,
          select: {
            outlierScore: true,
            multiplier: true,
          },
        },
      },
    }),
    client.outlierScore.findMany({
      where: {
        video: { youtubeChannelId: trackedChannel.channel.id },
      },
      orderBy: [{ calculatedAt: "desc" }],
      take: 200,
      select: {
        channelBaselineViews: true,
        outlierScore: true,
        multiplier: true,
        calculatedAt: true,
        video: {
          select: {
            id: true,
            youtubeVideoId: true,
            title: true,
            thumbnailUrl: true,
            publishedAt: true,
            durationSeconds: true,
            metricSnapshots: {
              orderBy: { capturedAt: "desc" },
              take: 1,
              select: { viewCount: true },
            },
            opportunityScores: {
              where: { workspaceId: input.workspaceId },
              orderBy: { calculatedAt: "desc" },
              take: 1,
              select: { opportunityScore: true },
            },
          },
        },
      },
    }),
  ]);
  const scoreRankedOutliers = dedupeLatestScoreRows(scoreRankedRows as ScoreRankedOutlierRow[]);
  const topOutliers = scoreRankedOutliers
    .sort(
      (left, right) =>
        (right.opportunityScore ?? right.outlierScore ?? 0) -
        (left.opportunityScore ?? left.outlierScore ?? 0),
    )
    .slice(0, 8);
  const cachedVideos = (cachedVideoRows as CachedVideoRow[]).map((video) => ({
    videoId: video.id,
    youtubeVideoId: video.youtubeVideoId,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    publishedAt: video.publishedAt,
    durationSeconds: video.durationSeconds,
    viewCount: toNumber(video.metricSnapshots[0]?.viewCount ?? null),
    outlierScore: video.outlierScores[0]?.outlierScore ?? null,
    multiplier: video.outlierScores[0]?.multiplier ?? null,
  }));
  const latestBlueprint = trackedChannel.channel.competitorBlueprints[0] ?? null;

  const baselineViews = median(
    scoreRankedOutliers
      .map((outlier) => outlier.channelBaselineViews)
      .filter((value): value is number => typeof value === "number"),
  );
  const topMultiplier = maxNumber(topOutliers.map((outlier) => outlier.multiplier));
  const averageMultiplier = averageNumber(topOutliers.map((outlier) => outlier.multiplier));
  const scoredOutlierCount = scoreRankedOutliers.length;

  return {
    trackedChannelId: trackedChannel.id,
    nickname: trackedChannel.nickname,
    reason: trackedChannel.reason,
    isActive: trackedChannel.isActive,
    channel: {
      id: trackedChannel.channel.id,
      title: trackedChannel.channel.title,
      handle: trackedChannel.channel.handle,
      youtubeChannelId: trackedChannel.channel.youtubeChannelId,
      subscriberCount: trackedChannel.channel.subscriberCount,
      videoCount: trackedChannel.channel.videoCount,
      viewCount: trackedChannel.channel.viewCount,
      lastFetchedAt: trackedChannel.channel.lastFetchedAt,
    },
    stats: {
      cachedVideos: trackedChannel.channel._count.videos,
      baselineViews,
      topMultiplier,
      averageMultiplier,
      emulationScore: calculateEmulationScore({
        averageMultiplier,
        topMultiplier,
        baselineViews,
        subscriberCount: toNumber(trackedChannel.channel.subscriberCount),
        cachedVideos: trackedChannel.channel._count.videos,
        scoredOutlierCount,
      }),
      averageOutlierScore: averageNumber(topOutliers.map((outlier) => outlier.outlierScore)),
    },
    latestIngestionJob,
    blueprint: latestBlueprint
      ? {
          id: latestBlueprint.id,
          summary: latestBlueprint.summary,
          generatedAt: latestBlueprint.generatedAt,
          averageOutlierScore: latestBlueprint.averageOutlierScore,
          videoCount: latestBlueprint.videoCount,
          titlePatterns: stringArray(latestBlueprint.titlePatterns),
          hookPatterns: stringArray(latestBlueprint.hookPatterns),
          thumbnailPatterns: stringArray(latestBlueprint.thumbnailPatterns),
          contentPillars: stringArray(latestBlueprint.contentPillars),
          structurePatterns: stringArray(latestBlueprint.structurePatterns),
          ctaPatterns: stringArray(latestBlueprint.ctaPatterns),
          emotionalAngles: stringArray(latestBlueprint.emotionalAngles),
          observations: observationArray(latestBlueprint.observationsJson),
          signals: [
            ...stringArray(latestBlueprint.contentPillars),
            ...stringArray(latestBlueprint.titlePatterns),
            ...stringArray(latestBlueprint.hookPatterns),
            ...stringArray(latestBlueprint.thumbnailPatterns),
            ...stringArray(latestBlueprint.structurePatterns),
            ...stringArray(latestBlueprint.ctaPatterns),
            ...stringArray(latestBlueprint.emotionalAngles),
          ].slice(0, 12),
        }
      : null,
    topOutliers,
    cachedVideos,
    cachedVideoPage: {
      page: cachedVideoPage,
      pageSize: cachedVideoPageSize,
      total: cachedVideoTotal,
      totalPages: Math.max(1, Math.ceil(cachedVideoTotal / cachedVideoPageSize)),
    },
  };
}

type CachedVideoRow = {
  id: string;
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  durationSeconds: number | null;
  metricSnapshots: Array<{ viewCount: bigint | number | null }>;
  outlierScores: Array<{
    outlierScore: number;
    multiplier: number | null;
  }>;
};

type ScoreRankedOutlierRow = {
  channelBaselineViews: number | null;
  outlierScore: number;
  multiplier: number | null;
  calculatedAt: Date;
  video: {
    id: string;
    youtubeVideoId: string;
    title: string;
    thumbnailUrl: string | null;
    publishedAt: Date | null;
    durationSeconds: number | null;
    metricSnapshots: Array<{ viewCount: bigint | number | null }>;
    opportunityScores: Array<{ opportunityScore: number }>;
  };
};

type ScoreRankedOutlier = ReturnType<typeof toScoreRankedOutlier>;

function dedupeLatestScoreRows(rows: ScoreRankedOutlierRow[]): ScoreRankedOutlier[] {
  const latestByVideo = new Map<string, ScoreRankedOutlierRow>();

  for (const row of rows) {
    const existing = latestByVideo.get(row.video.id);

    if (!existing || row.calculatedAt.getTime() > existing.calculatedAt.getTime()) {
      latestByVideo.set(row.video.id, row);
    }
  }

  return [...latestByVideo.values()].map(toScoreRankedOutlier);
}

function toScoreRankedOutlier(row: ScoreRankedOutlierRow) {
  return {
    videoId: row.video.id,
    youtubeVideoId: row.video.youtubeVideoId,
    title: row.video.title,
    thumbnailUrl: row.video.thumbnailUrl,
    publishedAt: row.video.publishedAt,
    durationSeconds: row.video.durationSeconds,
    viewCount: toNumber(row.video.metricSnapshots[0]?.viewCount ?? null),
    outlierScore: row.outlierScore,
    opportunityScore: row.video.opportunityScores[0]?.opportunityScore ?? null,
    multiplier: row.multiplier,
    channelBaselineViews: row.channelBaselineViews,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function observationArray(value: unknown): CompetitorChannelIntelligence["blueprint"] extends infer TBlueprint
  ? TBlueprint extends { observations: infer TObservations }
    ? TObservations
    : never
  : never {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      videoTitle: stringValue(item.videoTitle),
      topic: stringValue(item.topic),
      contentPillar: stringValue(item.contentPillar),
      hookType: stringValue(item.hookType),
      titlePattern: stringValue(item.titlePattern),
      thumbnailPattern: stringValue(item.thumbnailPattern),
      structure: stringArray(item.structure),
      ctaPattern: stringValue(item.ctaPattern),
      emotionalAngle: stringValue(item.emotionalAngle),
      productionNotes: stringArray(item.productionNotes),
    }));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toNumber(value: bigint | number | null): number | null {
  if (typeof value === "bigint") {
    return Number(value);
  }

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function averageNumber(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => typeof value === "number");

  if (numbers.length === 0) {
    return null;
  }

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function maxNumber(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => typeof value === "number");
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function calculateEmulationScore(input: {
  averageMultiplier: number | null;
  topMultiplier: number | null;
  baselineViews: number | null;
  subscriberCount: number | null;
  cachedVideos: number;
  scoredOutlierCount: number;
}): number | null {
  if (!input.averageMultiplier && !input.topMultiplier) {
    return null;
  }

  const averageLiftScore = normalize(input.averageMultiplier, 5);
  const topLiftScore = normalize(input.topMultiplier, 10);
  const baselineHealthScore =
    input.baselineViews && input.subscriberCount && input.subscriberCount > 0
      ? normalize((input.baselineViews / input.subscriberCount) * 100, 10)
      : 0;
  const outlierFrequencyScore =
    input.cachedVideos > 0
      ? normalize((input.scoredOutlierCount / input.cachedVideos) * 100, 20)
      : 0;

  return Math.round(
    averageLiftScore * 0.4 +
      topLiftScore * 0.25 +
      baselineHealthScore * 0.2 +
      outlierFrequencyScore * 0.15,
  );
}

function normalize(value: number | null, strongValue: number): number {
  if (!value || value <= 0) {
    return 0;
  }

  return Math.min(100, (value / strongValue) * 100);
}
