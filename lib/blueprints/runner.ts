import { buildBlueprintSummary } from "./analyzer";
import type {
  BlueprintRefreshSummary,
  BlueprintVideoAnalysisInput,
  CompetitorBlueprintSummary,
} from "../../types/blueprints";

const TOP_OUTLIER_LIMIT = 5;
const BLUEPRINT_CANDIDATE_LIMIT = 100;
const MIN_BLUEPRINT_VIDEOS = 2;

type RunnerVideo = {
  id: string;
  youtubeVideoId: string;
  title: string;
  publishedAt: Date;
  outlierScores: Array<{
    outlierScore: number;
    multiplier: number | null;
    calculatedAt: Date;
  }>;
  opportunityScores: Array<{ opportunityScore: number; calculatedAt: Date }>;
  analyses: Array<{
    contentPillar: string | null;
    hookType: string | null;
    titlePattern: string | null;
    thumbnailPattern: string | null;
    structureJson: unknown;
    ctaPattern: string | null;
    emotionalAngle: string | null;
    summary: string | null;
  }>;
};

type RunnerTrackedChannel = {
  workspaceId: string;
  youtubeChannelId: string;
  channel: {
    id: string;
    title: string;
    videos: RunnerVideo[];
  };
};

type BlueprintUniqueWhere = {
  workspaceId_youtubeChannelId: {
    workspaceId: string;
    youtubeChannelId: string;
  };
};

type BlueprintWriteData = {
  summary: string;
  titlePatterns: string[];
  hookPatterns: string[];
  thumbnailPatterns: string[];
  contentPillars: string[];
  structurePatterns: string[];
  ctaPatterns: string[];
  emotionalAngles: string[];
  observationsJson: CompetitorBlueprintSummary["observations"];
  topVideoIds: string[];
  videoCount: number;
  averageOutlierScore: number;
  generatedAt: Date;
};

export type BlueprintRunnerPrisma = {
  trackedChannel: {
    findMany(input: unknown): Promise<RunnerTrackedChannel[]>;
  };
  competitorBlueprint: {
    findUnique(input: { where: BlueprintUniqueWhere; select: { id: true } }): Promise<{ id: string } | null>;
    upsert(input: {
      where: BlueprintUniqueWhere;
      update: BlueprintWriteData;
      create: BlueprintWriteData & {
        workspaceId: string;
        youtubeChannelId: string;
      };
    }): Promise<{ id: string; createdAt: Date }>;
  };
};

export async function runCompetitorBlueprintAnalysisJob(input: {
  prisma: BlueprintRunnerPrisma;
  workspaceId: string;
  youtubeChannelId?: string;
  now?: Date;
}): Promise<BlueprintRefreshSummary> {
  const now = input.now ?? new Date();
  const trackedChannels = await input.prisma.trackedChannel.findMany({
    where: {
      workspaceId: input.workspaceId,
      isActive: true,
      ...(input.youtubeChannelId ? { youtubeChannelId: input.youtubeChannelId } : {}),
    },
    select: {
      workspaceId: true,
      youtubeChannelId: true,
      channel: {
        select: {
          id: true,
          title: true,
          videos: {
            where: {
              outlierScores: { some: {} },
            },
            orderBy: [{ publishedAt: "desc" }],
            take: BLUEPRINT_CANDIDATE_LIMIT,
            select: {
              id: true,
              youtubeVideoId: true,
              title: true,
              publishedAt: true,
              outlierScores: {
                orderBy: { calculatedAt: "desc" },
                take: 1,
                select: {
                  outlierScore: true,
                  multiplier: true,
                  calculatedAt: true,
                },
              },
              opportunityScores: {
                where: { workspaceId: input.workspaceId },
                orderBy: { calculatedAt: "desc" },
                take: 1,
                select: { opportunityScore: true, calculatedAt: true },
              },
              analyses: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  contentPillar: true,
                  hookType: true,
                  titlePattern: true,
                  thumbnailPattern: true,
                  structureJson: true,
                  ctaPattern: true,
                  emotionalAngle: true,
                  summary: true,
                },
              },
            },
          },
        },
      },
    },
  });

  let blueprintsCreated = 0;
  let blueprintsUpdated = 0;
  let channelsSkipped = 0;

  for (const tracked of trackedChannels) {
    const videos = selectTopBlueprintVideos(
      tracked.channel.title,
      tracked.channel.videos,
    );
    if (videos.length < MIN_BLUEPRINT_VIDEOS) {
      channelsSkipped += 1;
      continue;
    }

    const where = {
      workspaceId_youtubeChannelId: {
        workspaceId: tracked.workspaceId,
        youtubeChannelId: tracked.youtubeChannelId,
      },
    };
    const existing = await input.prisma.competitorBlueprint.findUnique({
      where,
      select: { id: true },
    });
    const summary = buildBlueprintSummary({
      workspaceId: tracked.workspaceId,
      youtubeChannelId: tracked.youtubeChannelId,
      channelTitle: tracked.channel.title,
      videos,
      now,
    });
    const writeData = blueprintWriteData(summary);

    await input.prisma.competitorBlueprint.upsert({
      where,
      update: writeData,
      create: {
        workspaceId: tracked.workspaceId,
        youtubeChannelId: tracked.youtubeChannelId,
        ...writeData,
      },
    });

    if (existing) {
      blueprintsUpdated += 1;
    } else {
      blueprintsCreated += 1;
    }
  }

  return {
    workspaceId: input.workspaceId,
    channelsEvaluated: trackedChannels.length,
    blueprintsCreated,
    blueprintsUpdated,
    channelsSkipped,
  };
}

function selectTopBlueprintVideos(
  channelTitle: string,
  videos: RunnerVideo[],
): BlueprintVideoAnalysisInput[] {
  return videos
    .filter((video) => video.outlierScores[0])
    .sort(
      (left, right) =>
        (right.outlierScores[0]?.outlierScore ?? 0) -
        (left.outlierScores[0]?.outlierScore ?? 0),
    )
    .slice(0, TOP_OUTLIER_LIMIT)
    .map((video) => ({
      videoId: video.id,
      youtubeVideoId: video.youtubeVideoId,
      title: video.title,
      channelTitle,
      publishedAt: video.publishedAt,
      outlierScore: video.outlierScores[0]?.outlierScore ?? 0,
      opportunityScore: video.opportunityScores[0]?.opportunityScore ?? null,
      multiplier: video.outlierScores[0]?.multiplier ?? null,
      analysis: video.analyses[0] ?? null,
    }));
}

function blueprintWriteData(
  summary: CompetitorBlueprintSummary,
): BlueprintWriteData {
  return {
    summary: readableSummary(summary),
    titlePatterns: summary.titlePatterns,
    hookPatterns: summary.hookPatterns,
    thumbnailPatterns: summary.thumbnailPatterns,
    contentPillars: summary.contentPillars,
    structurePatterns: summary.structurePatterns,
    ctaPatterns: summary.ctaPatterns,
    emotionalAngles: summary.emotionalAngles,
    observationsJson: summary.observations,
    topVideoIds: summary.observations.map((item) => item.videoId),
    videoCount: summary.videoCount,
    averageOutlierScore: summary.averageOutlierScore,
    generatedAt: summary.generatedAt,
  };
}

function readableSummary(summary: CompetitorBlueprintSummary): string {
  const pillars = summary.contentPillars.join(", ") || "mixed pillars";
  const hooks = summary.hookPatterns.join(", ") || "mixed hooks";
  return `${summary.channelTitle} repeatedly wins with ${pillars}, using ${hooks} across ${summary.videoCount} top outliers.`;
}
