import { describe, expect, test, vi } from "vitest";
import { getCompetitorChannelIntelligence } from "../../lib/competitors/channel-intelligence";

describe("getCompetitorChannelIntelligence", () => {
  test("calculates top and average lift from scored channel outliers", async () => {
    const intelligence = await getCompetitorChannelIntelligence(
      {
        trackedChannel: {
          findFirst: vi.fn(async () => ({
            id: "tracked-1",
            nickname: null,
            reason: null,
            isActive: true,
            channel: {
              id: "channel-1",
              title: "AI Lab",
              handle: "@ailab",
              youtubeChannelId: "UC123",
              subscriberCount: 100_000,
              videoCount: 100,
              viewCount: 10_000_000,
              lastFetchedAt: new Date("2026-05-18T00:00:00Z"),
              _count: { videos: 3 },
              videos: [
                video("video-1", 6),
                video("video-2", 3),
                video("video-3", null),
              ],
              competitorBlueprints: [],
            },
          })),
        },
        youtubeVideo: {
          count: vi.fn(async () => 3),
          findMany: vi.fn(async () => [
            video("video-1", 6),
            video("video-2", 3),
            video("video-3", null),
          ]),
        },
        outlierScore: {
          findMany: vi.fn(async () => [
            outlierScore("video-1", 6, 85, 80),
            outlierScore("video-2", 3, 85, 80),
          ]),
        },
        jobRun: {
          findFirst: vi.fn(async () => null),
        },
      },
      { workspaceId: "workspace-1", trackedChannelId: "tracked-1", cachedVideoPageSize: 25 },
    );

    expect(intelligence?.stats.topMultiplier).toBe(6);
    expect(intelligence?.stats.averageMultiplier).toBe(4.5);
    expect(intelligence?.stats.emulationScore).toBe(86);
    expect(intelligence?.topOutliers[0]?.durationSeconds).toBe(720);
    expect(intelligence?.cachedVideos).toHaveLength(3);
    expect(intelligence?.cachedVideos[0]).toMatchObject({
      title: "Video video-1",
      durationSeconds: 720,
      viewCount: 100_000,
    });
    expect(intelligence?.cachedVideoPage).toEqual({
      page: 1,
      pageSize: 25,
      total: 3,
      totalPages: 1,
    });
  });

  test("uses score-ranked candidates when an older high-lift video is outside the latest videos", async () => {
    const latestLowLiftVideos = Array.from({ length: 40 }, (_, index) =>
      video(`recent-${index}`, 2, { publishedAt: new Date(`2026-05-${String(18 - Math.min(index, 17)).padStart(2, "0")}T00:00:00Z`) }),
    );
    const oldBreakout = video("old-breakout", 20, {
      publishedAt: new Date("2025-12-01T00:00:00Z"),
      opportunityScore: 99,
      outlierScore: 100,
    });

    const intelligence = await getCompetitorChannelIntelligence(
      {
        trackedChannel: {
          findFirst: vi.fn(async () => ({
            id: "tracked-1",
            nickname: null,
            reason: null,
            isActive: true,
            channel: {
              id: "channel-1",
              title: "AI Lab",
              handle: "@ailab",
              youtubeChannelId: "UC123",
              subscriberCount: 100_000,
              videoCount: 100,
              viewCount: 10_000_000,
              lastFetchedAt: new Date("2026-05-18T00:00:00Z"),
              _count: { videos: 41 },
              videos: latestLowLiftVideos,
              competitorBlueprints: [],
            },
          })),
        },
        youtubeVideo: {
          count: vi.fn(async () => 41),
          findMany: vi.fn(async () => latestLowLiftVideos.slice(0, 25)),
        },
        outlierScore: {
          findMany: vi.fn(async () => [
            outlierScore("old-breakout", 20, 99, 100, { publishedAt: new Date("2025-12-01T00:00:00Z") }),
            ...latestLowLiftVideos.slice(0, 7).map((row) => outlierScore(row.id, 2, 70, 75, { publishedAt: row.publishedAt })),
          ]),
        },
        jobRun: {
          findFirst: vi.fn(async () => null),
        },
      },
      { workspaceId: "workspace-1", trackedChannelId: "tracked-1", cachedVideoPageSize: 25 },
    );

    expect(intelligence?.topOutliers[0]).toMatchObject({
      videoId: "old-breakout",
      multiplier: 20,
      opportunityScore: 99,
    });
    expect(intelligence?.stats.topMultiplier).toBe(20);
  });

  test("dedupes historical score rows so top outliers have stable video keys", async () => {
    const latestScoreDate = new Date("2026-05-18T00:00:00Z");
    const olderScoreDate = new Date("2026-05-01T00:00:00Z");
    const intelligence = await getCompetitorChannelIntelligence(
      {
        trackedChannel: {
          findFirst: vi.fn(async () => ({
            id: "tracked-1",
            nickname: null,
            reason: null,
            isActive: true,
            channel: {
              id: "channel-1",
              title: "AI Lab",
              handle: "@ailab",
              youtubeChannelId: "UC123",
              subscriberCount: 100_000,
              videoCount: 100,
              viewCount: 10_000_000,
              lastFetchedAt: new Date("2026-05-18T00:00:00Z"),
              _count: { videos: 2 },
              videos: [video("repeat-video", 4), video("other-video", 3)],
              competitorBlueprints: [],
            },
          })),
        },
        youtubeVideo: {
          count: vi.fn(async () => 2),
          findMany: vi.fn(async () => [video("repeat-video", 4), video("other-video", 3)]),
        },
        outlierScore: {
          findMany: vi.fn(async () => [
            outlierScore("repeat-video", 9, 91, 92, { calculatedAt: olderScoreDate }),
            outlierScore("repeat-video", 4, 88, 89, { calculatedAt: latestScoreDate }),
            outlierScore("other-video", 3, 70, 72, { calculatedAt: latestScoreDate }),
          ]),
        },
        jobRun: {
          findFirst: vi.fn(async () => null),
        },
      },
      { workspaceId: "workspace-1", trackedChannelId: "tracked-1" },
    );

    expect(intelligence?.topOutliers.map((outlier) => outlier.videoId)).toEqual([
      "repeat-video",
      "other-video",
    ]);
    expect(intelligence?.topOutliers[0]).toMatchObject({
      videoId: "repeat-video",
      multiplier: 4,
      opportunityScore: 88,
    });
    expect(intelligence?.stats.topMultiplier).toBe(4);
  });

  test("loads recent score rows before deduping current channel outliers", async () => {
    const findManyScores = vi.fn(async () => []);

    await getCompetitorChannelIntelligence(
      {
        trackedChannel: {
          findFirst: vi.fn(async () => ({
            id: "tracked-1",
            nickname: null,
            reason: null,
            isActive: true,
            channel: {
              id: "channel-1",
              title: "AI Lab",
              handle: "@ailab",
              youtubeChannelId: "UC123",
              subscriberCount: 100_000,
              videoCount: 100,
              viewCount: 10_000_000,
              lastFetchedAt: new Date("2026-05-18T00:00:00Z"),
              _count: { videos: 0 },
              videos: [],
              competitorBlueprints: [],
            },
          })),
        },
        youtubeVideo: {
          count: vi.fn(async () => 0),
          findMany: vi.fn(async () => []),
        },
        outlierScore: {
          findMany: findManyScores,
        },
        jobRun: {
          findFirst: vi.fn(async () => null),
        },
      },
      { workspaceId: "workspace-1", trackedChannelId: "tracked-1" },
    );

    expect(findManyScores).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ calculatedAt: "desc" }],
      }),
    );
  });
});

function video(
  id: string,
  multiplier: number | null,
  overrides: { publishedAt?: Date; opportunityScore?: number; outlierScore?: number } = {},
) {
  return {
    id,
    youtubeVideoId: id,
    title: `Video ${id}`,
    thumbnailUrl: null,
    publishedAt: overrides.publishedAt ?? new Date("2026-05-17T00:00:00Z"),
    durationSeconds: 720,
    metricSnapshots: [{ viewCount: 100_000 }],
    outlierScores: [
      {
        channelBaselineViews: 20_000,
        outlierScore: overrides.outlierScore ?? 80,
        multiplier,
      },
    ],
    opportunityScores: [{ opportunityScore: overrides.opportunityScore ?? 85 }],
  };
}

function outlierScore(
  id: string,
  multiplier: number | null,
  opportunityScore: number,
  score: number,
  overrides: { publishedAt?: Date; calculatedAt?: Date } = {},
) {
  return {
    channelBaselineViews: 20_000,
    outlierScore: score,
    multiplier,
    calculatedAt: overrides.calculatedAt ?? new Date("2026-05-18T00:00:00Z"),
    video: video(id, multiplier, {
      publishedAt: overrides.publishedAt,
      opportunityScore,
      outlierScore: score,
    }),
  };
}
