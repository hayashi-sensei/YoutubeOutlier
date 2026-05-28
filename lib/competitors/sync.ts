import {
  runOutlierScoreRefreshJob,
  type OutlierRunnerPrisma,
  type OutlierScoreRefreshSummary,
} from "@/lib/outliers/runner";
import {
  runYoutubeChannelBackfillJob,
  type YoutubeRunnerPrisma,
} from "@/lib/youtube/ingestion-runner";
import type { YoutubeIngestionSummary } from "@/lib/youtube/ingestion";

export type CompetitorChannelSyncPrisma = YoutubeRunnerPrisma & OutlierRunnerPrisma;

export type CompetitorChannelSyncSummary = {
  youtube: YoutubeIngestionSummary;
  scoring: OutlierScoreRefreshSummary;
};

export async function syncCompetitorChannelVideosAndScores(input: {
  prisma: CompetitorChannelSyncPrisma;
  channelId: string;
  workspaceId: string;
  now?: Date;
}): Promise<CompetitorChannelSyncSummary> {
  const youtube = await runYoutubeChannelBackfillJob({
    prisma: input.prisma,
    channelId: input.channelId,
    now: input.now,
  });
  const scoring = await runOutlierScoreRefreshJob({
    prisma: input.prisma,
    channelId: input.channelId,
    workspaceId: input.workspaceId,
    now: input.now,
  });

  return { youtube, scoring };
}
