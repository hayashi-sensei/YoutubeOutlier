import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../../lib/outliers/runner", () => ({
  runOutlierScoreRefreshJob: vi.fn(async ({ channelId }) => ({
    workspaceId: "workspace-1",
    channelId,
    videosEvaluated: channelId === "channel-1" ? 100 : 50,
    outlierScoresCreated: channelId === "channel-1" ? 20 : 0,
    opportunityScoresCreated: channelId === "channel-1" ? 20 : 0,
    skippedVideos: channelId === "channel-1" ? 1 : 0,
  })),
}));

import {
  backfillMissingWorkspaceOutlierScores,
  type MissingOutlierScoreBackfillPrisma,
} from "../../lib/outliers/backfill";
import { runOutlierScoreRefreshJob } from "../../lib/outliers/runner";

const NOW = new Date("2026-05-18T00:00:00Z");

describe("backfillMissingWorkspaceOutlierScores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("scores active tracked channels with missing workspace opportunity scores", async () => {
    const prisma = createPrisma([
      { youtubeChannelId: "channel-1", channel: { title: "Channel One" } },
      { youtubeChannelId: "channel-2", channel: { title: "Channel Two" } },
    ]);

    const summary = await backfillMissingWorkspaceOutlierScores({
      prisma,
      workspaceId: "workspace-1",
      now: NOW,
    });

    expect(prisma.trackedChannel.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        isActive: true,
        channel: {
          videos: {
            some: {
              metricSnapshots: { some: {} },
              opportunityScores: { none: { workspaceId: "workspace-1" } },
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
    expect(runOutlierScoreRefreshJob).toHaveBeenCalledWith({
      prisma,
      channelId: "channel-1",
      workspaceId: "workspace-1",
      missingOpportunityScoresOnly: true,
      now: NOW,
    });
    expect(runOutlierScoreRefreshJob).toHaveBeenCalledWith({
      prisma,
      channelId: "channel-2",
      workspaceId: "workspace-1",
      missingOpportunityScoresOnly: true,
      now: NOW,
    });
    expect(summary).toEqual({
      workspaceId: "workspace-1",
      channelsBackfilled: 1,
      videosEvaluated: 100,
      outlierScoresCreated: 20,
      opportunityScoresCreated: 20,
      skippedVideos: 1,
      channelSummaries: [
        {
          workspaceId: "workspace-1",
          channelId: "channel-1",
          videosEvaluated: 100,
          outlierScoresCreated: 20,
          opportunityScoresCreated: 20,
          skippedVideos: 1,
        },
      ],
    });
  });

  test("returns an empty summary when no channels need scores", async () => {
    const prisma = createPrisma([]);

    await expect(
      backfillMissingWorkspaceOutlierScores({
        prisma,
        workspaceId: "workspace-1",
        now: NOW,
      }),
    ).resolves.toMatchObject({
      channelsBackfilled: 0,
      opportunityScoresCreated: 0,
    });
    expect(runOutlierScoreRefreshJob).not.toHaveBeenCalled();
  });
});

function createPrisma(
  channels: Array<{ youtubeChannelId: string; channel: { title: string } }>,
): MissingOutlierScoreBackfillPrisma & {
  trackedChannel: { findMany: ReturnType<typeof vi.fn> };
} {
  return {
    trackedChannel: {
      findMany: vi.fn(async () => channels),
    },
    youtubeChannel: {
      findUnique: vi.fn(),
    },
    outlierScore: {
      create: vi.fn(),
    },
    workspaceVideoOpportunityScore: {
      create: vi.fn(),
    },
  };
}
