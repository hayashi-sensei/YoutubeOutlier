import {
  runOutlierScoreRefreshJob,
  type OutlierRunnerPrisma,
  type OutlierScoreRefreshSummary,
} from "./runner";

type MissingScoreTrackedChannel = {
  youtubeChannelId: string;
  channel: {
    title: string;
  };
};

export type MissingOutlierScoreBackfillSummary = {
  workspaceId: string;
  channelsBackfilled: number;
  videosEvaluated: number;
  outlierScoresCreated: number;
  opportunityScoresCreated: number;
  skippedVideos: number;
  channelSummaries: OutlierScoreRefreshSummary[];
};

export type MissingOutlierScoreBackfillPrisma = OutlierRunnerPrisma & {
  trackedChannel: {
    findMany(input: {
      where: {
        workspaceId: string;
        isActive: true;
        channel: {
          videos: {
            some: {
              metricSnapshots: { some: Record<string, never> };
              opportunityScores: { none: { workspaceId: string } };
            };
          };
        };
      };
      orderBy: { createdAt: "asc" };
      select: {
        youtubeChannelId: true;
        channel: { select: { title: true } };
      };
    }): Promise<MissingScoreTrackedChannel[]>;
  };
};

export async function backfillMissingWorkspaceOutlierScores(input: {
  prisma: MissingOutlierScoreBackfillPrisma;
  workspaceId: string;
  now?: Date;
}): Promise<MissingOutlierScoreBackfillSummary> {
  const channels = await input.prisma.trackedChannel.findMany({
    where: {
      workspaceId: input.workspaceId,
      isActive: true,
      channel: {
        videos: {
          some: {
            metricSnapshots: { some: {} },
            opportunityScores: { none: { workspaceId: input.workspaceId } },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      youtubeChannelId: true,
      channel: { select: { title: true } },
    },
  });
  const channelSummaries: OutlierScoreRefreshSummary[] = [];

  for (const channel of channels) {
    const summary = await runOutlierScoreRefreshJob({
      prisma: input.prisma,
      channelId: channel.youtubeChannelId,
      workspaceId: input.workspaceId,
      missingOpportunityScoresOnly: true,
      now: input.now,
    });

    if (summary.opportunityScoresCreated > 0 || summary.skippedVideos > 0) {
      channelSummaries.push(summary);
    }
  }

  const totals = channelSummaries.reduce(
    (total, summary) => ({
      ...total,
      videosEvaluated: total.videosEvaluated + summary.videosEvaluated,
      outlierScoresCreated: total.outlierScoresCreated + summary.outlierScoresCreated,
      opportunityScoresCreated: total.opportunityScoresCreated + summary.opportunityScoresCreated,
      skippedVideos: total.skippedVideos + summary.skippedVideos,
    }),
    {
      workspaceId: input.workspaceId,
      channelsBackfilled: channelSummaries.length,
      videosEvaluated: 0,
      outlierScoresCreated: 0,
      opportunityScoresCreated: 0,
      skippedVideos: 0,
      channelSummaries,
    },
  );

  return {
    ...totals,
    channelsBackfilled: channelSummaries.length,
  };
}
