import { describe, expect, test, vi } from "vitest";

vi.mock("../../lib/youtube/ingestion-runner", () => ({
  runYoutubeChannelBackfillJob: vi.fn(async () => ({
    channelId: "channel-1",
    videosFetched: 2,
  })),
}));

vi.mock("../../lib/outliers/runner", () => ({
  runOutlierScoreRefreshJob: vi.fn(async () => ({
    workspaceId: "workspace-1",
    channelId: "channel-1",
    videosEvaluated: 2,
    outlierScoresCreated: 2,
    opportunityScoresCreated: 2,
    skippedVideos: 0,
  })),
}));

import { syncCompetitorChannelVideosAndScores } from "../../lib/competitors/sync";
import { runOutlierScoreRefreshJob } from "../../lib/outliers/runner";
import { runYoutubeChannelBackfillJob } from "../../lib/youtube/ingestion-runner";

const NOW = new Date("2026-05-18T00:00:00Z");

describe("syncCompetitorChannelVideosAndScores", () => {
  test("runs YouTube ingestion before workspace scoring", async () => {
    const prisma = {};

    const summary = await syncCompetitorChannelVideosAndScores({
      prisma: prisma as never,
      channelId: "channel-1",
      workspaceId: "workspace-1",
      now: NOW,
    });

    expect(runYoutubeChannelBackfillJob).toHaveBeenCalledWith({
      prisma,
      channelId: "channel-1",
      now: NOW,
    });
    expect(runOutlierScoreRefreshJob).toHaveBeenCalledWith({
      prisma,
      channelId: "channel-1",
      workspaceId: "workspace-1",
      now: NOW,
    });
    expect(vi.mocked(runYoutubeChannelBackfillJob).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(runOutlierScoreRefreshJob).mock.invocationCallOrder[0] ?? 0,
    );
    expect(summary).toEqual({
      youtube: {
        channelId: "channel-1",
        videosFetched: 2,
      },
      scoring: {
        workspaceId: "workspace-1",
        channelId: "channel-1",
        videosEvaluated: 2,
        outlierScoresCreated: 2,
        opportunityScoresCreated: 2,
        skippedVideos: 0,
      },
    });
  });
});
