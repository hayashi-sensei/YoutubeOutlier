import { describe, expect, test, vi } from "vitest";

import {
  backfillChannelVideos,
  refreshRecentChannelVideos,
  shouldIncludeBackfillVideo,
  type YoutubeIngestionTx,
} from "../../lib/youtube/ingestion";
import {
  assertYoutubeQuotaAvailable,
  runYoutubeChannelBackfillJob,
  runYoutubeRecentRefreshJob,
  type YoutubeRunnerPrisma,
} from "../../lib/youtube/ingestion-runner";
import type {
  YoutubeChannelMetadata,
  YoutubeProvider,
  YoutubeVideoMetadata,
} from "../../lib/youtube/provider";

const NOW = new Date("2026-05-17T12:00:00Z");

describe("shouldIncludeBackfillVideo", () => {
  test("includes videos while under the 100-video and 12-month cutoffs", () => {
    expect(
      shouldIncludeBackfillVideo({
        publishedAt: new Date("2025-05-17T12:00:00Z"),
        includedCount: 99,
        now: NOW,
      }),
    ).toBe(true);
  });

  test("excludes videos after 100 included videos or older than 12 months", () => {
    expect(
      shouldIncludeBackfillVideo({
        publishedAt: new Date("2026-05-01T00:00:00Z"),
        includedCount: 100,
        now: NOW,
      }),
    ).toBe(false);

    expect(
      shouldIncludeBackfillVideo({
        publishedAt: new Date("2025-05-16T23:59:59Z"),
        includedCount: 0,
        now: NOW,
      }),
    ).toBe(false);
  });
});

describe("backfillChannelVideos", () => {
  test("does not cache backfill videos shorter than 90 seconds", async () => {
    const tx = createTx();
    const provider = createProvider({
      pages: [{ videoIds: ["short", "minimum", "long"] }],
      videos: new Map([
        ["short", createVideo("short", { durationSeconds: 89 })],
        ["minimum", createVideo("minimum", { durationSeconds: 90 })],
        ["long", createVideo("long", { durationSeconds: 180 })],
      ]),
    });

    const summary = await backfillChannelVideos({
      tx,
      provider,
      channelId: "existing-channel-db-id",
      youtubeChannelId: "UC123",
      now: NOW,
    });

    expect(tx.youtubeVideo.upsert.mock.calls.map((call) => call[0].where)).toEqual([
      { youtubeVideoId: "minimum" },
      { youtubeVideoId: "long" },
    ]);
    expect(tx.videoMetricSnapshot.create).toHaveBeenCalledTimes(2);
    expect(summary.videosFetched).toBe(3);
    expect(summary.videosIncluded).toBe(2);
  });

  test("removes existing cached videos shorter than 90 seconds for the backfilled channel", async () => {
    const tx = createTx();
    const provider = createProvider({
      pages: [{ videoIds: ["long"] }],
      videos: new Map([["long", createVideo("long", { durationSeconds: 180 })]]),
    });

    await backfillChannelVideos({
      tx,
      provider,
      channelId: "existing-channel-db-id",
      youtubeChannelId: "UC123",
      now: NOW,
    });

    expect(tx.youtubeVideo.deleteMany).toHaveBeenCalledWith({
      where: {
        youtubeChannelId: "existing-channel-db-id",
        durationSeconds: { lt: 90 },
      },
    });
  });

  test("updates channel metadata, fetches upload pages, batches video metadata, and snapshots metrics", async () => {
    const tx = createTx();
    const provider = createProvider({
      pages: [
        {
          videoIds: Array.from({ length: 50 }, (_, index) => `video-${index}`),
          nextPageToken: "page-2",
        },
        {
          videoIds: ["video-50", "video-51"],
        },
      ],
      videos: new Map(
        Array.from({ length: 52 }, (_, index) => [
          `video-${index}`,
          createVideo(`video-${index}`, {
            publishedAt: new Date(`2026-04-${String((index % 20) + 1).padStart(2, "0")}T00:00:00Z`),
            viewCount: BigInt(1000 + index),
          }),
        ]),
      ),
    });

    const summary = await backfillChannelVideos({
      tx,
      provider,
      channelId: "existing-channel-db-id",
      youtubeChannelId: "UC123",
      now: NOW,
    });

    expect(provider.getChannel).toHaveBeenCalledWith("UC123");
    expect(provider.listPlaylistVideoIds).toHaveBeenNthCalledWith(1, {
      playlistId: "UU123",
      pageToken: undefined,
      maxResults: 50,
    });
    expect(provider.listPlaylistVideoIds).toHaveBeenNthCalledWith(2, {
      playlistId: "UU123",
      pageToken: "page-2",
      maxResults: 50,
    });
    expect(provider.getVideos).toHaveBeenCalledTimes(2);
    expect(provider.getVideos).toHaveBeenNthCalledWith(
      1,
      Array.from({ length: 50 }, (_, index) => `video-${index}`),
    );
    expect(tx.youtubeChannel.update).toHaveBeenCalledWith({
      where: { id: "existing-channel-db-id" },
      data: expect.objectContaining({
        youtubeChannelId: "UC123",
        title: "Creator Channel",
        uploadsPlaylistId: "UU123",
        lastFetchedAt: NOW,
      }),
    });
    expect(tx.youtubeVideo.upsert).toHaveBeenCalledTimes(52);
    expect(tx.videoMetricSnapshot.create).toHaveBeenCalledTimes(52);
    expect(tx.youtubeVideo.upsert.mock.calls[0]?.[0]).toMatchObject({
      where: { youtubeVideoId: "video-0" },
      create: {
        youtubeVideoId: "video-0",
        youtubeChannelId: "existing-channel-db-id",
        title: "Video video-0",
        publishedAt: expect.any(Date),
        tags: [],
        lastFetchedAt: NOW,
      },
      update: {
        title: "Video video-0",
        publishedAt: expect.any(Date),
        tags: [],
        lastFetchedAt: NOW,
      },
    });
    expect(tx.youtubeVideo.upsert.mock.calls[0]?.[0].update).not.toHaveProperty(
      "youtubeChannelId",
    );
    expect(tx.videoMetricSnapshot.create.mock.calls[0]?.[0]).toEqual({
      data: {
        youtubeVideoId: "video-db-video-0",
        viewCount: BigInt(1000),
        likeCount: BigInt(10),
        commentCount: BigInt(1),
        capturedAt: NOW,
      },
    });
    expect(summary).toEqual({
      channelId: "existing-channel-db-id",
      uploadsPlaylistId: "UU123",
      playlistPagesFetched: 2,
      videosDiscovered: 52,
      videosFetched: 52,
      videosIncluded: 52,
      videosUpserted: 52,
      metricSnapshotsCreated: 52,
      estimatedQuotaUnits: 5,
    });
  });

  test("stops after the first page when older backfill videos are reached", async () => {
    const tx = createTx();
    const provider = createProvider({
      pages: [
        {
          videoIds: ["recent", "old"],
          nextPageToken: "page-2",
        },
        {
          videoIds: ["should-not-fetch"],
        },
      ],
      videos: new Map([
        [
          "recent",
          createVideo("recent", {
            publishedAt: new Date("2026-01-01T00:00:00Z"),
          }),
        ],
        [
          "old",
          createVideo("old", {
            publishedAt: new Date("2025-05-16T00:00:00Z"),
          }),
        ],
      ]),
    });

    const summary = await backfillChannelVideos({
      tx,
      provider,
      channelId: "existing-channel-db-id",
      youtubeChannelId: "UC123",
      now: NOW,
    });

    expect(provider.listPlaylistVideoIds).toHaveBeenCalledTimes(1);
    expect(tx.youtubeVideo.upsert).toHaveBeenCalledTimes(1);
    expect(summary.videosDiscovered).toBe(2);
    expect(summary.videosIncluded).toBe(1);
  });

  test("throws when the channel has no uploads playlist", async () => {
    const tx = createTx();
    const provider = createProvider({
      channel: { uploadsPlaylistId: undefined },
      pages: [],
      videos: new Map(),
    });

    await expect(
      backfillChannelVideos({
        tx,
        provider,
        channelId: "existing-channel-db-id",
        youtubeChannelId: "UC123",
        now: NOW,
      }),
    ).rejects.toThrow("YouTube channel UC123 is missing an uploads playlist.");
    expect(tx.youtubeChannel.update).not.toHaveBeenCalled();
    expect(provider.listPlaylistVideoIds).not.toHaveBeenCalled();
  });
});

describe("refreshRecentChannelVideos", () => {
  test("does not cache recent videos shorter than 90 seconds", async () => {
    const tx = createTx();
    const provider = createProvider({
      pages: [{ videoIds: ["short", "minimum", "long"] }],
      videos: new Map([
        ["short", createVideo("short", { durationSeconds: 89 })],
        ["minimum", createVideo("minimum", { durationSeconds: 90 })],
        ["long", createVideo("long", { durationSeconds: 180 })],
      ]),
    });

    const summary = await refreshRecentChannelVideos({
      tx,
      provider,
      channelId: "existing-channel-db-id",
      youtubeChannelId: "UC123",
      now: NOW,
    });

    expect(tx.youtubeVideo.upsert.mock.calls.map((call) => call[0].where)).toEqual([
      { youtubeVideoId: "minimum" },
      { youtubeVideoId: "long" },
    ]);
    expect(tx.videoMetricSnapshot.create).toHaveBeenCalledTimes(2);
    expect(summary.videosFetched).toBe(3);
    expect(summary.videosIncluded).toBe(2);
  });

  test("removes existing cached videos shorter than 90 seconds for the refreshed channel", async () => {
    const tx = createTx();
    const provider = createProvider({
      pages: [{ videoIds: ["long"] }],
      videos: new Map([["long", createVideo("long", { durationSeconds: 180 })]]),
    });

    await refreshRecentChannelVideos({
      tx,
      provider,
      channelId: "existing-channel-db-id",
      youtubeChannelId: "UC123",
      now: NOW,
    });

    expect(tx.youtubeVideo.deleteMany).toHaveBeenCalledWith({
      where: {
        youtubeChannelId: "existing-channel-db-id",
        durationSeconds: { lt: 90 },
      },
    });
  });

  test("only upserts and snapshots videos published in the last 21 days", async () => {
    const tx = createTx();
    const provider = createProvider({
      pages: [
        {
          videoIds: ["fresh", "cutoff", "old"],
          nextPageToken: "page-2",
        },
        {
          videoIds: ["should-not-fetch"],
        },
      ],
      videos: new Map([
        [
          "fresh",
          createVideo("fresh", {
            publishedAt: new Date("2026-05-16T00:00:00Z"),
          }),
        ],
        [
          "cutoff",
          createVideo("cutoff", {
            publishedAt: new Date("2026-04-26T12:00:00Z"),
          }),
        ],
        [
          "old",
          createVideo("old", {
            publishedAt: new Date("2026-04-26T11:59:59Z"),
          }),
        ],
      ]),
    });

    const summary = await refreshRecentChannelVideos({
      tx,
      provider,
      channelId: "existing-channel-db-id",
      youtubeChannelId: "UC123",
      now: NOW,
    });

    expect(tx.youtubeChannel.update).toHaveBeenCalledWith({
      where: { id: "existing-channel-db-id" },
      data: expect.objectContaining({
        youtubeChannelId: "UC123",
        uploadsPlaylistId: "UU123",
        lastFetchedAt: NOW,
      }),
    });
    expect(provider.listPlaylistVideoIds).toHaveBeenCalledTimes(1);
    expect(tx.youtubeVideo.upsert).toHaveBeenCalledTimes(2);
    expect(tx.youtubeVideo.upsert.mock.calls[0]?.[0].create.youtubeChannelId).toBe(
      "existing-channel-db-id",
    );
    expect(tx.youtubeVideo.upsert.mock.calls.map((call) => call[0].where)).toEqual([
      { youtubeVideoId: "fresh" },
      { youtubeVideoId: "cutoff" },
    ]);
    expect(tx.videoMetricSnapshot.create).toHaveBeenCalledTimes(2);
    expect(summary.videosFetched).toBe(3);
    expect(summary.videosIncluded).toBe(2);
    expect(summary.estimatedQuotaUnits).toBe(3);
  });
});

describe("youtube ingestion job runner", () => {
  test("uses the Pacific provider quota day boundary", async () => {
    const prisma = createRunnerPrisma({
      quotaUnitsUsed: 8998,
    });
    const pacificLateNight = new Date("2026-05-17T06:59:59.000Z");

    await expect(
      assertYoutubeQuotaAvailable(prisma, {
        requestedUnits: 2,
        dailyLimit: 9000,
        now: pacificLateNight,
      }),
    ).resolves.toBeUndefined();
    expect(prisma.youtubeQuotaUsage.aggregate).toHaveBeenCalledWith({
      _sum: { units: true },
      where: {
        quotaDate: {
          gte: new Date("2026-05-16T07:00:00.000Z"),
          lt: new Date("2026-05-17T07:00:00.000Z"),
        },
      },
    });
  });

  test("quota reservation rejection through backfill job marks the job failed", async () => {
    const prisma = createRunnerPrisma({
      quotaUnitsUsed: 8995,
    });
    const provider = createProvider({
      pages: [{ videoIds: ["video-1"] }],
      videos: new Map([["video-1", createVideo("video-1", {})]]),
    });

    await expect(
      runYoutubeChannelBackfillJob({
        prisma,
        provider,
        channelId: "channel-db-id",
        now: NOW,
        dailyQuotaLimit: 9000,
      }),
    ).rejects.toThrow(
      "YouTube quota limit exceeded: 8995 used + 10 requested exceeds daily limit 9000.",
    );

    expect(prisma.jobRun.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "FAILED",
        completedAt: NOW,
        errorMessage:
          "YouTube quota limit exceeded: 8995 used + 10 requested exceeds daily limit 9000.",
      },
    });
    expect(provider.getChannel).not.toHaveBeenCalled();
    expect(prisma.youtubeQuotaUsage.create).not.toHaveBeenCalled();
  });

  test("runs a successful backfill job and reconciles reserved quota usage", async () => {
    const prisma = createRunnerPrisma();
    const provider = createProvider({
      pages: [{ videoIds: ["video-1"] }],
      videos: new Map([["video-1", createVideo("video-1", {})]]),
      transactionDepth: () => prisma.transactionDepth,
    });

    const summary = await runYoutubeChannelBackfillJob({
      prisma,
      provider,
      channelId: "channel-db-id",
      now: NOW,
      dailyQuotaLimit: 9000,
    });

    expect(summary.videosUpserted).toBe(1);
    expect(prisma.jobRun.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        jobType: "youtube_channel_backfill",
        status: "RUNNING",
        provider: "youtube",
        referenceType: "YoutubeChannel",
        referenceId: "channel-db-id",
        attempts: 1,
        maxAttempts: 1,
        startedAt: NOW,
        metadata: { youtubeChannelId: "UC123" },
      },
    });
    expect(prisma.youtubeQuotaUsage.create).toHaveBeenCalledWith({
      data: {
        quotaDate: new Date("2026-05-17T07:00:00.000Z"),
        operation: "youtube_channel_backfill",
        units: 10,
        referenceType: "JobRun",
        referenceId: "job-1",
      },
    });
    expect(prisma.youtubeQuotaUsage.update).toHaveBeenCalledWith({
      where: { id: "quota-1" },
      data: { units: 3 },
    });
    expect(prisma.jobRun.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "SUCCEEDED",
        completedAt: NOW,
        metadata: {
          youtubeChannelId: "UC123",
          summary,
        },
      },
    });
    expect(provider.getChannel).toHaveBeenCalledTimes(1);
  });

  test("runs a successful recent refresh job", async () => {
    const prisma = createRunnerPrisma();
    const provider = createProvider({
      pages: [{ videoIds: ["fresh", "old"] }],
      videos: new Map([
        [
          "fresh",
          createVideo("fresh", {
            publishedAt: new Date("2026-05-16T00:00:00Z"),
          }),
        ],
        [
          "old",
          createVideo("old", {
            publishedAt: new Date("2026-04-20T00:00:00Z"),
          }),
        ],
      ]),
      transactionDepth: () => prisma.transactionDepth,
    });

    const summary = await runYoutubeRecentRefreshJob({
      prisma,
      provider,
      channelId: "channel-db-id",
      now: NOW,
      dailyQuotaLimit: 9000,
    });

    expect(summary.videosIncluded).toBe(1);
    expect(prisma.youtubeQuotaUsage.create).toHaveBeenCalledWith({
      data: {
        quotaDate: new Date("2026-05-17T07:00:00.000Z"),
        operation: "youtube_recent_refresh",
        units: 3,
        referenceType: "JobRun",
        referenceId: "job-1",
      },
    });
    expect(prisma.youtubeQuotaUsage.update).not.toHaveBeenCalled();
    expect(prisma.jobRun.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "SUCCEEDED",
        completedAt: NOW,
        metadata: {
          youtubeChannelId: "UC123",
          summary,
        },
      },
    });
    expect(provider.getChannel).toHaveBeenCalledTimes(1);
  });

  test("marks the job failed when ingestion throws and keeps reserved quota", async () => {
    const prisma = createRunnerPrisma();
    const provider = createProvider({
      pages: [],
      videos: new Map(),
    });
    provider.getChannel.mockRejectedValueOnce(new Error("provider down"));

    await expect(
      runYoutubeChannelBackfillJob({
        prisma,
        provider,
        channelId: "channel-db-id",
        now: NOW,
        dailyQuotaLimit: 9000,
      }),
    ).rejects.toThrow("provider down");

    expect(prisma.jobRun.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "FAILED",
        completedAt: NOW,
        errorMessage: "provider down",
      },
    });
    expect(prisma.youtubeQuotaUsage.create).toHaveBeenCalledWith({
      data: {
        quotaDate: new Date("2026-05-17T07:00:00.000Z"),
        operation: "youtube_channel_backfill",
        units: 10,
        referenceType: "JobRun",
        referenceId: "job-1",
      },
    });
    expect(prisma.youtubeQuotaUsage.update).not.toHaveBeenCalled();
  });

  test("preserves the original ingestion error when failed job logging throws", async () => {
    const prisma = createRunnerPrisma({
      failJobUpdate: true,
    });
    const provider = createProvider({
      pages: [],
      videos: new Map(),
    });
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    provider.getChannel.mockRejectedValueOnce(new Error("provider down"));

    await expect(
      runYoutubeChannelBackfillJob({
        prisma,
        provider,
        channelId: "channel-db-id",
        now: NOW,
        dailyQuotaLimit: 9000,
      }),
    ).rejects.toThrow("provider down");

    expect(prisma.jobRun.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "FAILED",
        completedAt: NOW,
        errorMessage: "provider down",
      },
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to record YouTube ingestion job failure.",
      expect.objectContaining({
        jobRunId: "job-1",
        originalError: "provider down",
        loggingError: "job update failed",
      }),
    );

    consoleErrorSpy.mockRestore();
  });
});

function createTx(): YoutubeIngestionTx & {
  youtubeChannel: {
    update: ReturnType<typeof vi.fn>;
  };
  youtubeVideo: {
    upsert: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  videoMetricSnapshot: {
    create: ReturnType<typeof vi.fn>;
  };
} {
  return {
    youtubeChannel: {
      update: vi.fn(async () => ({ id: "existing-channel-db-id" })),
    },
    youtubeVideo: {
      upsert: vi.fn(async (input: { where: { youtubeVideoId: string } }) => ({
        id: `video-db-${input.where.youtubeVideoId}`,
      })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    videoMetricSnapshot: {
      create: vi.fn(async () => ({})),
    },
  };
}

function createRunnerPrisma(
  input: { quotaUnitsUsed?: number; failJobUpdate?: boolean } = {},
): YoutubeRunnerPrisma & {
  youtubeQuotaUsage: YoutubeRunnerPrisma["youtubeQuotaUsage"] & {
    aggregate: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  jobRun: YoutubeRunnerPrisma["jobRun"] & {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  transactionDepth: number;
} {
  const prisma = {
    transactionDepth: 0,
    youtubeChannel: {
      findUnique: vi.fn(async () => ({
        id: "channel-db-id",
        youtubeChannelId: "UC123",
        trackedBy: [{ workspaceId: "workspace-1" }],
      })),
      update: vi.fn(async () => ({ id: "channel-db-id" })),
    },
    youtubeVideo: {
      upsert: vi.fn(async (upsertInput: { where: { youtubeVideoId: string } }) => ({
        id: `video-db-${upsertInput.where.youtubeVideoId}`,
      })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    videoMetricSnapshot: {
      create: vi.fn(async () => ({})),
    },
    youtubeQuotaUsage: {
      aggregate: vi.fn(async () => ({
        _sum: { units: input.quotaUnitsUsed ?? 0 },
      })),
      create: vi.fn(async () => ({ id: "quota-1" })),
      update: vi.fn(async () => ({})),
    },
    jobRun: {
      create: vi.fn(async () => ({ id: "job-1" })),
      update: vi.fn(async () => {
        if (input.failJobUpdate) {
          throw new Error("job update failed");
        }
        return {};
      }),
    },
    $executeRaw: vi.fn(async () => 0),
    async $transaction<T>(callback: (tx: YoutubeRunnerPrisma) => Promise<T>): Promise<T> {
      prisma.transactionDepth += 1;
      try {
        return await callback(prisma);
      } finally {
        prisma.transactionDepth -= 1;
      }
    },
  };

  return prisma;
}

function createProvider(input: {
  channel?: Partial<YoutubeChannelMetadata>;
  pages: Array<{ videoIds: string[]; nextPageToken?: string }>;
  videos: Map<string, YoutubeVideoMetadata>;
  transactionDepth?: () => number;
}): YoutubeProvider & {
  getChannel: ReturnType<typeof vi.fn>;
  listPlaylistVideoIds: ReturnType<typeof vi.fn>;
  getVideos: ReturnType<typeof vi.fn>;
} {
  const channel: YoutubeChannelMetadata = {
    youtubeChannelId: "UC123",
    handle: "@creator",
    title: "Creator Channel",
    description: "Channel description",
    thumbnailUrl: "channel.jpg",
    subscriberCount: BigInt(1000),
    videoCount: 52,
    viewCount: BigInt(100000),
    uploadsPlaylistId: "UU123",
    country: "US",
    ...input.channel,
  };
  let pageIndex = 0;

  return {
    getChannel: vi.fn(async () => {
      const transactionDepth = input.transactionDepth?.() ?? 0;
      if (transactionDepth > 0) {
        throw new Error("provider called inside transaction");
      }
      return channel;
    }),
    listPlaylistVideoIds: vi.fn(async () => {
      const page = input.pages[pageIndex];
      pageIndex += 1;
      if (!page) {
        return { videoIds: [] };
      }
      return page;
    }),
    getVideos: vi.fn(async (videoIds: string[]) =>
      videoIds.map((videoId) => {
        const video = input.videos.get(videoId);
        if (!video) {
          throw new Error(`Missing test video ${videoId}`);
        }
        return video;
      }),
    ),
  };
}

function createVideo(
  youtubeVideoId: string,
  overrides: Partial<YoutubeVideoMetadata>,
): YoutubeVideoMetadata {
  return {
    youtubeVideoId,
    title: `Video ${youtubeVideoId}`,
    description: `Description ${youtubeVideoId}`,
    publishedAt: new Date("2026-05-01T00:00:00Z"),
    durationSeconds: 120,
    thumbnailUrl: `${youtubeVideoId}.jpg`,
    tags: [],
    categoryId: "24",
    defaultLanguage: "en",
    viewCount: BigInt(1000),
    likeCount: BigInt(10),
    commentCount: BigInt(1),
    ...overrides,
  };
}
