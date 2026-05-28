import { describe, expect, test, vi } from "vitest";

import {
  runOutlierScoreRefreshJob,
  type OutlierRunnerPrisma,
} from "../../lib/outliers/runner";

const NOW = new Date("2026-05-18T00:00:00Z");

describe("runOutlierScoreRefreshJob", () => {
  test("loads a channel, creates outlier scores, and creates workspace opportunity scores", async () => {
    const prisma = createPrisma();

    const summary = await runOutlierScoreRefreshJob({
      prisma,
      channelId: "channel-1",
      now: NOW,
    });

    expect(prisma.youtubeChannel.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "channel-1" },
        select: expect.objectContaining({
          videos: expect.objectContaining({
            orderBy: { publishedAt: "desc" },
            take: 100,
          }),
          trackedBy: expect.objectContaining({
            where: { isActive: true },
          }),
        }),
      }),
    );
    expect(summary).toEqual({
      channelId: "channel-1",
      videosEvaluated: 5,
      outlierScoresCreated: 4,
      opportunityScoresCreated: 4,
      skippedVideos: 1,
    });
    expect(prisma.outlierScore.create).toHaveBeenCalledTimes(4);
    expect(prisma.workspaceVideoOpportunityScore.create).toHaveBeenCalledTimes(4);
    expect(prisma.outlierScore.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        youtubeVideoId: "target-video",
        channelBaselineViews: 350,
        relativeViewPerformance: 6,
        multiplier: 6,
        calculatedAt: NOW,
      }),
      select: { id: true },
    });
    expect(prisma.workspaceVideoOpportunityScore.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        youtubeVideoId: "target-video",
        outlierScoreId: "outlier-score-target-video",
        nicheRelevanceScore: expect.any(Number),
        topicFreshnessScore: expect.any(Number),
        competitiveSaturationScore: expect.any(Number),
        sourceCorroborationScore: expect.any(Number),
        brandFitScore: expect.any(Number),
        opportunityScore: expect.any(Number),
        calculatedAt: NOW,
      }),
    });
    expect(prisma.workspaceVideoOpportunityScore.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workspaceId: "workspace-without-settings" }),
      }),
    );
  });

  test("filters active tracked workspaces when a workspace id is provided", async () => {
    const prisma = createPrisma();

    await runOutlierScoreRefreshJob({
      prisma,
      channelId: "channel-1",
      workspaceId: "workspace-1",
      now: NOW,
    });

    expect(prisma.youtubeChannel.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          trackedBy: expect.objectContaining({
            where: { isActive: true, workspaceId: "workspace-1" },
          }),
        }),
      }),
    );
  });

  test("backfills only videos missing workspace opportunity scores", async () => {
    const prisma = createPrisma({
      channel: createChannel({
        scoredVideoIds: ["baseline-3", "baseline-2", "baseline-1"],
      }),
    });

    const summary = await runOutlierScoreRefreshJob({
      prisma,
      channelId: "channel-1",
      workspaceId: "workspace-1",
      missingOpportunityScoresOnly: true,
      now: NOW,
    });

    expect(prisma.youtubeChannel.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          videos: expect.objectContaining({
            select: expect.objectContaining({
              opportunityScores: {
                where: { workspaceId: "workspace-1" },
                take: 1,
                select: { id: true },
              },
            }),
          }),
        }),
      }),
    );
    expect(summary).toEqual({
      workspaceId: "workspace-1",
      channelId: "channel-1",
      videosEvaluated: 5,
      outlierScoresCreated: 1,
      opportunityScoresCreated: 1,
      skippedVideos: 1,
    });
    expect(prisma.outlierScore.create).toHaveBeenCalledTimes(1);
    expect(prisma.outlierScore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ youtubeVideoId: "target-video" }),
      }),
    );
  });

  test("requires a workspace id for missing opportunity score backfills", async () => {
    const prisma = createPrisma();

    await expect(
      runOutlierScoreRefreshJob({
        prisma,
        channelId: "channel-1",
        missingOpportunityScoresOnly: true,
        now: NOW,
      }),
    ).rejects.toThrow("workspaceId is required");
    expect(prisma.youtubeChannel.findUnique).not.toHaveBeenCalled();
  });

  test("throws when the channel cannot be found", async () => {
    const prisma = createPrisma({ channel: null });

    await expect(
      runOutlierScoreRefreshJob({
        prisma,
        channelId: "missing-channel",
        now: NOW,
      }),
    ).rejects.toThrow("YouTube channel not found: missing-channel");
    expect(prisma.outlierScore.create).not.toHaveBeenCalled();
    expect(prisma.workspaceVideoOpportunityScore.create).not.toHaveBeenCalled();
  });
});

function createPrisma(input: { channel?: RunnerChannel | null } = {}): OutlierRunnerPrisma & {
  youtubeChannel: { findUnique: ReturnType<typeof vi.fn> };
  outlierScore: { create: ReturnType<typeof vi.fn> };
  workspaceVideoOpportunityScore: { create: ReturnType<typeof vi.fn> };
} {
  const channel = input.channel === undefined ? createChannel() : input.channel;

  return {
    youtubeChannel: {
      findUnique: vi.fn(async () => channel),
    },
    outlierScore: {
      create: vi.fn(async (createInput: { data: { youtubeVideoId: string } }) => ({
        id: `outlier-score-${createInput.data.youtubeVideoId}`,
      })),
    },
    workspaceVideoOpportunityScore: {
      create: vi.fn(async () => ({})),
    },
  };
}

type RunnerChannel = Awaited<ReturnType<OutlierRunnerPrisma["youtubeChannel"]["findUnique"]>>;

function createChannel(input: { scoredVideoIds?: string[] } = {}): NonNullable<RunnerChannel> {
  const scoredVideoIds = new Set(input.scoredVideoIds ?? []);

  return {
    id: "channel-1",
    videos: [
      withOpportunityScore(scoredVideoIds, video("target-video", 2100, new Date("2026-05-16T00:00:00Z"), {
        title: "AI agents for solo creator automation",
        description: "A practical automation workflow for creators and agencies.",
        tags: ["ai agents", "automation", "workflow"],
        metricSnapshots: [
          snapshot(2100, new Date("2026-05-18T00:00:00Z")),
          snapshot(1200, new Date("2026-05-17T00:00:00Z")),
        ],
        analyses: [
          {
            contentPillar: "AI automation",
            hookType: "Practical build",
            titlePattern: "AI agents for X",
          },
        ],
      })),
      withOpportunityScore(scoredVideoIds, video("baseline-3", 500, new Date("2026-04-03T00:00:00Z"), {
        tags: ["ai agents", "automation"],
        analyses: [
          {
            contentPillar: "AI automation",
            hookType: "Practical build",
            titlePattern: "AI agents for X",
          },
        ],
      })),
      withOpportunityScore(scoredVideoIds, video("baseline-2", 200, new Date("2026-04-02T00:00:00Z"))),
      withOpportunityScore(scoredVideoIds, video("baseline-1", 100, new Date("2026-04-01T00:00:00Z"))),
      withOpportunityScore(scoredVideoIds, video("missing-views", null, new Date("2026-05-15T00:00:00Z"), {
        metricSnapshots: [],
      })),
    ],
    trackedBy: [
      {
        workspaceId: "workspace-1",
        workspace: {
          settings: {
            primaryNiche: "AI automation and digital marketing",
            subNiche: "creator workflows",
            targetAudience: "Creators and agencies",
            brandVoice: "Direct practical evidence-led automation",
            topicsToAvoid: null,
          },
          industrySources: [
            {
              items: [
                {
                  title: "AI agents move into creator automation workflows",
                  summary: "New workflow tools help creators automate daily research.",
                },
              ],
            },
          ],
          trackedChannels: [
            {
              channel: {
                videos: [
                  {
                    id: "peer-video",
                    title: "Creator automation with AI agents",
                    tags: ["automation", "agents"],
                  },
                  {
                    id: "target-video",
                    title: "AI agents for solo creator automation",
                    tags: ["ai agents", "automation", "workflow"],
                  },
                ],
              },
            },
          ],
        },
      },
      {
        workspaceId: "workspace-without-settings",
        workspace: {
          settings: null,
          industrySources: [],
          trackedChannels: [],
        },
      },
    ],
  };
}

function withOpportunityScore(
  scoredVideoIds: Set<string>,
  item: NonNullable<RunnerChannel>["videos"][number],
): NonNullable<RunnerChannel>["videos"][number] {
  if (!scoredVideoIds.has(item.id)) {
    return item;
  }

  return {
    ...item,
    opportunityScores: [{ id: `opportunity-${item.id}` }],
  };
}

function video(
  id: string,
  views: number | null,
  publishedAt: Date,
  overrides: Partial<NonNullable<RunnerChannel>["videos"][number]> = {},
): NonNullable<RunnerChannel>["videos"][number] {
  const metricSnapshots =
    overrides.metricSnapshots ??
    (views === null ? [] : [snapshot(views, NOW)]);

  return {
    id,
    title: overrides.title ?? `Video ${id}`,
    description: overrides.description ?? null,
    publishedAt,
    tags: overrides.tags ?? [],
    metricSnapshots,
    analyses: overrides.analyses ?? [],
    opportunityScores: overrides.opportunityScores ?? [],
  };
}

function snapshot(viewCount: number, capturedAt: Date) {
  return {
    viewCount: BigInt(viewCount),
    likeCount: BigInt(Math.floor(viewCount * 0.08)),
    commentCount: BigInt(Math.floor(viewCount * 0.01)),
    capturedAt,
  };
}
