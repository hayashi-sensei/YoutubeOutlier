import { JOB_TYPES } from "@/types/jobs";
import { enqueueJob, type JobQueuePrisma } from "./queue";

const CHANNEL_REFRESH_HOURS = 6;
const SOURCE_REFRESH_HOURS = 12;
const DAILY_REPORT_DEDUPE_STATUSES = ["QUEUED", "RUNNING", "RETRYING", "SUCCEEDED"] as const;
const DAILY_SNAPSHOT_DEDUPE_STATUSES = ["QUEUED", "RUNNING", "RETRYING", "SUCCEEDED"] as const;
const DEFAULT_SCHEDULE_LIMITS = {
  trackedChannels: 200,
  industrySources: 200,
  transcriptVideos: 100,
  dailyReportWorkspaces: 200,
};
const DAILY_REPORT_DISCOVERY_PAGE_SIZE = 200;

type DueTrackedChannel = {
  workspaceId: string;
  channel: {
    id: string;
    lastFetchedAt: Date | null;
  };
};

type DueIndustrySource = {
  id: string;
  workspaceId: string;
  lastFetchedAt: Date | null;
};

type DueTranscriptVideo = {
  id: string;
};

type DailyReportWorkspace = {
  workspaceId: string;
  timezone: string;
};

export type JobSchedulerPrisma = JobQueuePrisma & {
  trackedChannel: {
    findMany(input: {
      where: {
        isActive: true;
        channel: {
          OR: Array<{ lastFetchedAt: null } | { lastFetchedAt: { lte: Date } }>;
        };
      };
      orderBy: { createdAt: "asc" };
      take: number;
      select: {
        workspaceId: true;
        channel: { select: { id: true; lastFetchedAt: true } };
      };
    }): Promise<DueTrackedChannel[]>;
  };
  industrySource: {
    findMany(input: {
      where: {
        isActive: true;
        OR: Array<{ lastFetchedAt: null } | { lastFetchedAt: { lte: Date } }>;
      };
      orderBy: { updatedAt: "asc" };
      take: number;
      select: { id: true; workspaceId: true; lastFetchedAt: true };
    }): Promise<DueIndustrySource[]>;
  };
  youtubeVideo: {
    findMany(input: {
      where: { transcriptStatus: "QUEUED" };
      select: { id: true };
      take: number;
    }): Promise<DueTranscriptVideo[]>;
  };
  workspaceSettings: {
    findMany(input: {
      where: { dailyReportEnabled: true };
      orderBy: { updatedAt: "asc" };
      skip?: number;
      take: number;
      select: { workspaceId: true; timezone: true };
    }): Promise<DailyReportWorkspace[]>;
  };
};

export type JobScheduleSummary = {
  youtubeRecentRefresh: number;
  industrySourceRefresh: number;
  transcriptFetch: number;
  dailyReportGenerate: number;
  competitorBlueprintAnalyze: number;
  topicRecommendationExpire: number;
  providerCostSnapshot: number;
};

export async function scheduleDueBackgroundJobs(
  prisma: JobSchedulerPrisma,
  input: {
    now?: Date;
    limits?: Partial<typeof DEFAULT_SCHEDULE_LIMITS>;
  } = {},
): Promise<JobScheduleSummary> {
  const now = input.now ?? new Date();
  const limits = {
    ...DEFAULT_SCHEDULE_LIMITS,
    ...(input.limits ?? {}),
  };
  const channelCutoff = hoursBefore(now, CHANNEL_REFRESH_HOURS);
  const sourceCutoff = hoursBefore(now, SOURCE_REFRESH_HOURS);
  const summary: JobScheduleSummary = {
    youtubeRecentRefresh: 0,
    industrySourceRefresh: 0,
    transcriptFetch: 0,
    dailyReportGenerate: 0,
    competitorBlueprintAnalyze: 0,
    topicRecommendationExpire: 0,
    providerCostSnapshot: 0,
  };
  const [channels, sources, videos] = await Promise.all([
    prisma.trackedChannel.findMany({
      where: {
        isActive: true,
        channel: {
          OR: [{ lastFetchedAt: null }, { lastFetchedAt: { lte: channelCutoff } }],
        },
      },
      select: {
        workspaceId: true,
        channel: { select: { id: true, lastFetchedAt: true } },
      },
      orderBy: { createdAt: "asc" },
      take: limits.trackedChannels,
    }),
    prisma.industrySource.findMany({
      where: {
        isActive: true,
        OR: [{ lastFetchedAt: null }, { lastFetchedAt: { lte: sourceCutoff } }],
      },
      select: { id: true, workspaceId: true, lastFetchedAt: true },
      orderBy: { updatedAt: "asc" },
      take: limits.industrySources,
    }),
    prisma.youtubeVideo.findMany({
      where: { transcriptStatus: "QUEUED" },
      select: { id: true },
      take: limits.transcriptVideos,
    }),
  ]);

  for (const trackedChannel of channels) {
    const result = await enqueueJob(prisma, {
      workspaceId: trackedChannel.workspaceId,
      jobType: JOB_TYPES.youtubeRecentRefresh,
      provider: "youtube",
      referenceType: "YoutubeChannel",
      referenceId: trackedChannel.channel.id,
      metadata: { scheduledReason: "tracked_channel_refresh" },
      now,
    });
    summary.youtubeRecentRefresh += result.reused ? 0 : 1;

    const blueprintResult = await enqueueJob(prisma, {
      workspaceId: trackedChannel.workspaceId,
      jobType: JOB_TYPES.competitorBlueprintAnalyze,
      provider: "internal",
      referenceType: "CompetitorBlueprint",
      referenceId: `${trackedChannel.workspaceId}:${trackedChannel.channel.id}`,
      metadata: {
        scheduledReason: "tracked_channel_blueprint_analysis",
        workspaceId: trackedChannel.workspaceId,
        youtubeChannelId: trackedChannel.channel.id,
      },
      now,
    });
    summary.competitorBlueprintAnalyze += blueprintResult.reused ? 0 : 1;
  }

  for (const source of sources) {
    const result = await enqueueJob(prisma, {
      workspaceId: source.workspaceId,
      jobType: JOB_TYPES.industrySourceRefresh,
      provider: "source",
      referenceType: "IndustrySource",
      referenceId: source.id,
      metadata: { mode: "refresh" },
      now,
    });
    summary.industrySourceRefresh += result.reused ? 0 : 1;
  }

  for (const video of videos) {
    const result = await enqueueJob(prisma, {
      jobType: JOB_TYPES.transcriptFetch,
      provider: "transcript",
      referenceType: "YoutubeVideo",
      referenceId: video.id,
      now,
    });
    summary.transcriptFetch += result.reused ? 0 : 1;
  }

  summary.dailyReportGenerate = await scheduleDailyReportJobs(prisma, {
    limit: limits.dailyReportWorkspaces,
    now,
  });

  const expiryResult = await enqueueJob(prisma, {
    jobType: JOB_TYPES.topicRecommendationExpire,
    provider: "internal",
    referenceType: "TopicRecommendation",
    referenceId: `expire:${localDateKey(now, "UTC")}`,
    metadata: {
      scheduledReason: "topic_recommendation_expiry",
      expiryDays: 60,
    },
    now,
  });
  summary.topicRecommendationExpire += expiryResult.reused ? 0 : 1;

  const snapshotDate = localDateKey(now, "UTC");
  const snapshotResult = await enqueueJob(prisma, {
    jobType: JOB_TYPES.providerCostSnapshot,
    provider: "internal",
    referenceType: "ProviderCostSnapshot",
    referenceId: `provider-cost:${snapshotDate}`,
    dedupeStatuses: [...DAILY_SNAPSHOT_DEDUPE_STATUSES],
    metadata: {
      scheduledReason: "daily_provider_cost_snapshot",
      snapshotDate,
    },
    now,
  });
  summary.providerCostSnapshot += snapshotResult.reused ? 0 : 1;

  return summary;
}

async function scheduleDailyReportJobs(
  prisma: JobSchedulerPrisma,
  input: { limit: number; now: Date },
): Promise<number> {
  if (input.limit <= 0) {
    return 0;
  }

  let created = 0;
  let skip = 0;

  while (created < input.limit) {
    const page = await prisma.workspaceSettings.findMany({
      where: { dailyReportEnabled: true },
      select: { workspaceId: true, timezone: true },
      orderBy: { updatedAt: "asc" },
      skip,
      take: Math.min(DAILY_REPORT_DISCOVERY_PAGE_SIZE, input.limit),
    });

    if (page.length === 0) {
      break;
    }

    skip += page.length;

    for (const settings of page) {
      const reportDate = localDateKey(input.now, settings.timezone);
      const result = await enqueueJob(prisma, {
        workspaceId: settings.workspaceId,
        jobType: JOB_TYPES.dailyReportGenerate,
        referenceType: "WorkspaceDailyReport",
        referenceId: `${settings.workspaceId}:${reportDate}`,
        dedupeStatuses: [...DAILY_REPORT_DEDUPE_STATUSES],
        metadata: {
          workspaceId: settings.workspaceId,
          timezone: settings.timezone,
          reportDate,
        },
        now: input.now,
      });

      if (!result.reused) {
        created += 1;
      }

      if (created >= input.limit) {
        break;
      }
    }
  }

  return created;
}

function hoursBefore(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
