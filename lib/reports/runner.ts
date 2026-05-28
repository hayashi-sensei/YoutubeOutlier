import {
  runYoutubeRecentRefreshJob,
  type YoutubeRunnerPrisma,
} from "../youtube/ingestion-runner";
import {
  runIndustrySourceRefreshJob,
  type SourceRunnerPrisma,
} from "../sources/runner";
import type { AiModelRouterPrisma } from "../ai/model-router";
import {
  generateCompetitorTrendInsights,
  type CompetitorTrendInsight,
} from "./trends";

const REPORT_WINDOW_HOURS = 24;
const REPORT_INPUT_REFRESH_CONCURRENCY = 4;

type WorkspaceSettingsRow = {
  primaryNiche: string;
  timezone: string;
};

type ActiveTrackedChannelRow = {
  youtubeChannelId: string;
};

type ActiveIndustrySourceRow = {
  id: string;
};

type FreshVideoRow = {
  id: string;
  youtubeVideoId: string;
  title: string;
  description: string | null;
  publishedAt: Date;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  channel: { title: string; handle: string | null };
  metricSnapshots: Array<{
    viewCount: bigint | number | null;
    likeCount: bigint | number | null;
    commentCount: bigint | number | null;
  }>;
  outlierScores: Array<{
    outlierScore: number;
    multiplier: number | null;
  }>;
  opportunityScores: Array<{
    opportunityScore: number;
  }>;
};

type FreshSourceItemRow = {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  source: { name: string | null; url: string };
};

export type ResearchReportRunnerPrisma = {
  workspaceSettings: {
    findUnique(input: unknown): Promise<WorkspaceSettingsRow | null>;
  };
  trackedChannel: {
    findMany(input: {
      where: { workspaceId: string; isActive: true };
      select: { youtubeChannelId: true };
      orderBy: { createdAt: "asc" };
    }): Promise<ActiveTrackedChannelRow[]>;
  };
  industrySource: {
    findMany(input: {
      where: { workspaceId: string; isActive: true };
      select: { id: true };
      orderBy: { createdAt: "asc" };
    }): Promise<ActiveIndustrySourceRow[]>;
  };
  researchReport: {
    create(input: {
      data: {
        workspaceId: string;
        title: string;
        status: "GENERATING";
        reportDate: Date;
        manualRun: boolean;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
    update(input: {
      where: { id: string };
      data: {
        status: "COMPLETED" | "FAILED";
        summary?: string;
        sectionsJson?: unknown;
        errorMessage?: string | null;
        generatedAt?: Date;
      };
    }): Promise<{ id: string }>;
  };
  youtubeVideo: {
    findMany(input: unknown): Promise<FreshVideoRow[]>;
  };
  industrySourceItem: {
    findMany(input: unknown): Promise<FreshSourceItemRow[]>;
  };
};

export type ResearchReportRunSummary = {
  workspaceId: string;
  reportId: string;
  manualRun: boolean;
  windowStart: Date;
  windowEnd: Date;
  channelsRefreshed: number;
  sourcesRefreshed: number;
  competitorUploadsIncluded: number;
  industryNewsIncluded: number;
};

type ReportChannelRefresher = (input: {
  prisma: ResearchReportRunnerPrisma;
  channelId: string;
  now: Date;
}) => Promise<unknown>;

type ReportSourceRefresher = (input: {
  prisma: ResearchReportRunnerPrisma;
  sourceId: string;
  now: Date;
}) => Promise<unknown>;

type ReportTrendAnalyzer = (input: {
  prisma: ResearchReportRunnerPrisma;
  workspaceId: string;
  userId?: string | null;
  reportId: string;
  videos: FreshVideoRow[];
  now: Date;
}) => Promise<CompetitorTrendInsight[]>;

export async function runResearchReportJob(input: {
  prisma: ResearchReportRunnerPrisma;
  workspaceId: string;
  userId?: string | null;
  reportId?: string;
  manualRun: boolean;
  now?: Date;
  channelRefresher?: ReportChannelRefresher;
  sourceRefresher?: ReportSourceRefresher;
  trendAnalyzer?: ReportTrendAnalyzer;
}): Promise<ResearchReportRunSummary> {
  const now = input.now ?? new Date();
  const windowStart = new Date(now.getTime() - REPORT_WINDOW_HOURS * 60 * 60 * 1000);
  const settings = await input.prisma.workspaceSettings.findUnique({
    where: { workspaceId: input.workspaceId },
    select: { primaryNiche: true, timezone: true },
  });
  const reportTitle = `Research report for ${dateLabel(now)}`;
  const reportId =
    input.reportId ??
    (
      await input.prisma.researchReport.create({
        data: {
          workspaceId: input.workspaceId,
          title: reportTitle,
          status: "GENERATING",
          reportDate: now,
          manualRun: input.manualRun,
        },
        select: { id: true },
      })
    ).id;

  try {
    const refreshSummary = await refreshReportInputs({
      prisma: input.prisma,
      workspaceId: input.workspaceId,
      now,
      channelRefresher: input.channelRefresher ?? defaultChannelRefresher,
      sourceRefresher: input.sourceRefresher ?? defaultSourceRefresher,
    });
    const [freshVideos, freshSourceItems] = await Promise.all([
      input.prisma.youtubeVideo.findMany({
        where: {
          publishedAt: { gte: windowStart, lt: now },
          channel: {
            trackedBy: {
              some: { workspaceId: input.workspaceId, isActive: true },
            },
          },
        },
        orderBy: [{ publishedAt: "desc" }],
        select: {
          id: true,
          youtubeVideoId: true,
          title: true,
          description: true,
          publishedAt: true,
          durationSeconds: true,
          thumbnailUrl: true,
          channel: { select: { title: true, handle: true } },
          metricSnapshots: {
            orderBy: { capturedAt: "desc" },
            take: 1,
            select: { viewCount: true, likeCount: true, commentCount: true },
          },
          outlierScores: {
            orderBy: { calculatedAt: "desc" },
            take: 1,
            select: { outlierScore: true, multiplier: true },
          },
          opportunityScores: {
            where: { workspaceId: input.workspaceId },
            orderBy: { calculatedAt: "desc" },
            take: 1,
            select: { opportunityScore: true },
          },
        },
      }),
      input.prisma.industrySourceItem.findMany({
        where: {
          source: { workspaceId: input.workspaceId, isActive: true },
          OR: [
            { publishedAt: { gte: windowStart, lt: now } },
            { publishedAt: null, fetchedAt: { gte: windowStart, lt: now } },
          ],
        },
        orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
        select: {
          id: true,
          title: true,
          url: true,
          summary: true,
          publishedAt: true,
          fetchedAt: true,
          source: { select: { name: true, url: true } },
        },
      }),
    ]);
    const competitorTrends = await (input.trendAnalyzer ?? defaultTrendAnalyzer)({
      prisma: input.prisma,
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      reportId,
      videos: freshVideos,
      now,
    });
    const sectionsJson = buildReportSections({
      settings,
      freshVideos,
      freshSourceItems,
      competitorTrends,
      now,
      windowStart,
    });

    await input.prisma.researchReport.update({
      where: { id: reportId },
      data: {
        status: "COMPLETED",
        summary: reportSummary(freshVideos.length, freshSourceItems.length),
        sectionsJson,
        errorMessage: null,
        generatedAt: now,
      },
    });

    return {
      workspaceId: input.workspaceId,
      reportId,
      manualRun: input.manualRun,
      windowStart,
      windowEnd: now,
      channelsRefreshed: refreshSummary.channelsRefreshed,
      sourcesRefreshed: refreshSummary.sourcesRefreshed,
      competitorUploadsIncluded: freshVideos.length,
      industryNewsIncluded: freshSourceItems.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Research report generation failed.";
    await input.prisma.researchReport.update({
      where: { id: reportId },
      data: {
        status: "FAILED",
        errorMessage: message,
      },
    });
    throw error;
  }
}

async function refreshReportInputs(input: {
  prisma: ResearchReportRunnerPrisma;
  workspaceId: string;
  now: Date;
  channelRefresher: ReportChannelRefresher;
  sourceRefresher: ReportSourceRefresher;
}): Promise<{ channelsRefreshed: number; sourcesRefreshed: number }> {
  const [trackedChannels, industrySources] = await Promise.all([
    input.prisma.trackedChannel.findMany({
      where: { workspaceId: input.workspaceId, isActive: true },
      select: { youtubeChannelId: true },
      orderBy: { createdAt: "asc" },
    }),
    input.prisma.industrySource.findMany({
      where: { workspaceId: input.workspaceId, isActive: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const refreshTasks = [
    ...trackedChannels.map((channel) => () =>
      input.channelRefresher({
        prisma: input.prisma,
        channelId: channel.youtubeChannelId,
        now: input.now,
      }),
    ),
    ...industrySources.map((source) => () =>
      input.sourceRefresher({
        prisma: input.prisma,
        sourceId: source.id,
        now: input.now,
      }),
    ),
  ];

  await runWithConcurrency(refreshTasks, REPORT_INPUT_REFRESH_CONCURRENCY);

  return {
    channelsRefreshed: trackedChannels.length,
    sourcesRefreshed: industrySources.length,
  };
}

async function runWithConcurrency(
  tasks: Array<() => Promise<unknown>>,
  concurrency: number,
): Promise<void> {
  for (let index = 0; index < tasks.length; index += concurrency) {
    const batch = tasks.slice(index, index + concurrency);
    await Promise.all(batch.map((task) => task()));
  }
}

async function defaultChannelRefresher(input: {
  prisma: ResearchReportRunnerPrisma;
  channelId: string;
  now: Date;
}): Promise<unknown> {
  return runYoutubeRecentRefreshJob({
    prisma: input.prisma as unknown as YoutubeRunnerPrisma,
    channelId: input.channelId,
    now: input.now,
  });
}

async function defaultSourceRefresher(input: {
  prisma: ResearchReportRunnerPrisma;
  sourceId: string;
  now: Date;
}): Promise<unknown> {
  return runIndustrySourceRefreshJob({
    prisma: input.prisma as unknown as SourceRunnerPrisma,
    sourceId: input.sourceId,
    now: input.now,
  });
}

async function defaultTrendAnalyzer(input: {
  prisma: ResearchReportRunnerPrisma;
  workspaceId: string;
  userId?: string | null;
  reportId: string;
  videos: FreshVideoRow[];
  now: Date;
}): Promise<CompetitorTrendInsight[]> {
  return generateCompetitorTrendInsights({
    prisma: input.prisma as unknown as AiModelRouterPrisma,
    workspaceId: input.workspaceId,
    userId: input.userId ?? null,
    reportId: input.reportId,
    now: input.now,
    videos: input.videos.map((video) => ({
      title: video.title,
      channelTitle: video.channel.title,
      publishedAt: video.publishedAt,
    })),
  });
}

function buildReportSections(input: {
  settings: WorkspaceSettingsRow | null;
  freshVideos: FreshVideoRow[];
  freshSourceItems: FreshSourceItemRow[];
  competitorTrends: CompetitorTrendInsight[];
  now: Date;
  windowStart: Date;
}) {
  const outliers = input.freshVideos.filter((video) => video.outlierScores[0]);
  const competitorUploads = input.freshVideos.map(toCompetitorUploadSection);
  const industryNews = input.freshSourceItems.map(toIndustryNewsSection);

  return {
    executiveSummary: {
      headline: `Daily research window for ${input.settings?.primaryNiche ?? "this workspace"}`,
      windowStart: input.windowStart.toISOString(),
      windowEnd: input.now.toISOString(),
      keySignals: [
        `${competitorUploads.length} competitor uploads in the last 24 hours`,
        `${industryNews.length} industry news items in the last 24 hours`,
        `${outliers.length} scored outliers among fresh uploads`,
      ],
    },
    competitorUploads,
    outliers: outliers.map(toOutlierSection),
    competitorTrends: input.competitorTrends,
    recentTopicClusters: [],
    industryNews,
    contentGaps:
      competitorUploads.length === 0 && industryNews.length === 0
        ? ["No new competitor uploads or industry news items were found in this 24-hour window."]
        : [],
    recommendedTopics: [],
    recommendedActions:
      competitorUploads.length === 0 && industryNews.length === 0
        ? ["No action needed from this report window. Check back after new competitor uploads or source items arrive."]
        : ["Review fresh uploads and source items before generating separate topic ideas."],
  };
}

function toCompetitorUploadSection(video: FreshVideoRow) {
  const metrics = video.metricSnapshots[0] ?? null;

  return {
    youtubeVideoId: video.id,
    publicYoutubeVideoId: video.youtubeVideoId,
    youtubeUrl: youtubeWatchUrl(video.youtubeVideoId),
    title: video.title,
    channelTitle: video.channel.title,
    channelHandle: video.channel.handle,
    publishedAt: video.publishedAt.toISOString(),
    durationSeconds: video.durationSeconds,
    thumbnailUrl: video.thumbnailUrl,
    viewCount: toNumber(metrics?.viewCount ?? null),
    likeCount: toNumber(metrics?.likeCount ?? null),
    commentCount: toNumber(metrics?.commentCount ?? null),
  };
}

function toOutlierSection(video: FreshVideoRow) {
  const outlier = video.outlierScores[0];
  const opportunity = video.opportunityScores[0] ?? null;

  return {
    ...toCompetitorUploadSection(video),
    outlierScore: outlier?.outlierScore ?? null,
    multiplier: outlier?.multiplier ?? null,
    opportunityScore: opportunity?.opportunityScore ?? null,
  };
}

function toIndustryNewsSection(item: FreshSourceItemRow) {
  return {
    sourceItemId: item.id,
    title: item.title,
    url: item.url,
    sourceName: item.source.name ?? item.source.url,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    fetchedAt: item.fetchedAt.toISOString(),
    summary: item.summary,
  };
}

function reportSummary(competitorUploadCount: number, industryNewsCount: number): string {
  if (competitorUploadCount === 0 && industryNewsCount === 0) {
    return "No new competitor uploads or industry news items were found in the last 24 hours.";
  }

  return `Found ${competitorUploadCount} competitor uploads and ${industryNewsCount} industry news items in the last 24 hours.`;
}

function toNumber(value: bigint | number | null): number | null {
  if (typeof value === "bigint") {
    return Number(value);
  }

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

function youtubeWatchUrl(youtubeVideoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeVideoId)}`;
}
