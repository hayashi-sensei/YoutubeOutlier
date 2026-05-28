import { describe, expect, test, vi } from "vitest";

import { runResearchReportJob } from "../../lib/reports/runner";

const NOW = new Date("2026-05-19T08:00:00Z");
const WINDOW_START = new Date("2026-05-18T08:00:00Z");

describe("runResearchReportJob", () => {
  test("refreshes every active tracked channel and industry source before querying the report window", async () => {
    const channelRefresher = vi.fn(async () => undefined);
    const sourceRefresher = vi.fn(async () => undefined);
    const prisma = createReportPrisma({
      trackedChannels: [
        { youtubeChannelId: "channel-1" },
        { youtubeChannelId: "channel-2" },
        { youtubeChannelId: "channel-3" },
      ],
      industrySources: [{ id: "source-1" }, { id: "source-2" }],
    });

    const summary = await runResearchReportJob({
      prisma,
      workspaceId: "workspace-1",
      manualRun: false,
      now: NOW,
      channelRefresher,
      sourceRefresher,
      trendAnalyzer: createTrendAnalyzer(),
    });

    expect(prisma.trackedChannel.findMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1", isActive: true },
      select: { youtubeChannelId: true },
      orderBy: { createdAt: "asc" },
    });
    expect(prisma.industrySource.findMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1", isActive: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    expect(channelRefresher).toHaveBeenCalledTimes(3);
    expect(channelRefresher).toHaveBeenNthCalledWith(1, {
      prisma,
      channelId: "channel-1",
      now: NOW,
    });
    expect(channelRefresher).toHaveBeenNthCalledWith(2, {
      prisma,
      channelId: "channel-2",
      now: NOW,
    });
    expect(channelRefresher).toHaveBeenNthCalledWith(3, {
      prisma,
      channelId: "channel-3",
      now: NOW,
    });
    expect(sourceRefresher).toHaveBeenCalledTimes(2);
    expect(sourceRefresher).toHaveBeenNthCalledWith(1, {
      prisma,
      sourceId: "source-1",
      now: NOW,
    });
    expect(sourceRefresher).toHaveBeenNthCalledWith(2, {
      prisma,
      sourceId: "source-2",
      now: NOW,
    });
    expect(channelRefresher.mock.invocationCallOrder.at(-1)).toBeLessThan(
      prisma.youtubeVideo.findMany.mock.invocationCallOrder[0],
    );
    expect(sourceRefresher.mock.invocationCallOrder.at(-1)).toBeLessThan(
      prisma.industrySourceItem.findMany.mock.invocationCallOrder[0],
    );
    expect(summary.channelsRefreshed).toBe(3);
    expect(summary.sourcesRefreshed).toBe(2);
  });

  test("limits concurrent input refreshes so large competitor lists do not overwhelm database transactions", async () => {
    let activeRefreshes = 0;
    let maxActiveRefreshes = 0;
    const channelRefresher = vi.fn(async () => {
      activeRefreshes += 1;
      maxActiveRefreshes = Math.max(maxActiveRefreshes, activeRefreshes);
      await new Promise((resolve) => setTimeout(resolve, 1));
      activeRefreshes -= 1;
    });
    const prisma = createReportPrisma({
      trackedChannels: Array.from({ length: 12 }, (_, index) => ({
        youtubeChannelId: `channel-${index + 1}`,
      })),
    });

    const summary = await runResearchReportJob({
      prisma,
      workspaceId: "workspace-1",
      manualRun: true,
      now: NOW,
      channelRefresher,
      sourceRefresher: vi.fn(async () => undefined),
      trendAnalyzer: createTrendAnalyzer(),
    });

    expect(channelRefresher).toHaveBeenCalledTimes(12);
    expect(maxActiveRefreshes).toBeLessThanOrEqual(4);
    expect(summary.channelsRefreshed).toBe(12);
  });

  test("stores a 24-hour report from fresh competitor uploads and industry source items", async () => {
    const prisma = createReportPrisma();
    const trendAnalyzer = createTrendAnalyzer();

    const summary = await runResearchReportJob({
      prisma,
      workspaceId: "workspace-1",
      manualRun: false,
      now: NOW,
      trendAnalyzer,
    });

    expect(summary).toEqual({
      workspaceId: "workspace-1",
      reportId: "report-1",
      manualRun: false,
      windowStart: WINDOW_START,
      windowEnd: NOW,
      competitorUploadsIncluded: 2,
      industryNewsIncluded: 2,
      channelsRefreshed: 0,
      sourcesRefreshed: 0,
    });
    expect(prisma.youtubeVideo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          publishedAt: { gte: WINDOW_START, lt: NOW },
          channel: {
            trackedBy: {
              some: { workspaceId: "workspace-1", isActive: true },
            },
          },
        },
      }),
    );
    expect(prisma.industrySourceItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          source: { workspaceId: "workspace-1", isActive: true },
          OR: [
            { publishedAt: { gte: WINDOW_START, lt: NOW } },
            { publishedAt: null, fetchedAt: { gte: WINDOW_START, lt: NOW } },
          ],
        },
      }),
    );
    expect(prisma.researchReport.update).toHaveBeenCalledWith({
      where: { id: "report-1" },
      data: expect.objectContaining({
        status: "COMPLETED",
        summary: "Found 2 competitor uploads and 2 industry news items in the last 24 hours.",
        sectionsJson: expect.objectContaining({
          executiveSummary: expect.objectContaining({
            windowStart: WINDOW_START.toISOString(),
            windowEnd: NOW.toISOString(),
            keySignals: [
              "2 competitor uploads in the last 24 hours",
              "2 industry news items in the last 24 hours",
              "0 scored outliers among fresh uploads",
            ],
          }),
          competitorUploads: [
            expect.objectContaining({
              title: "Fresh AI Agent Upload",
              youtubeUrl: "https://www.youtube.com/watch?v=yt-fresh-1",
            }),
            expect.objectContaining({
              title: "Fresh Automation Upload",
              youtubeUrl: "https://www.youtube.com/watch?v=yt-fresh-2",
            }),
          ],
          industryNews: [
            expect.objectContaining({
              title: "Fresh AI News",
              url: "https://example.com/fresh-ai-news",
            }),
            expect.objectContaining({
              title: "Fetched Newsletter Item",
              url: "https://example.com/fetched-newsletter",
            }),
          ],
          competitorTrends: expect.arrayContaining([
            expect.objectContaining({
              title: "AI automation demand",
              videoCount: 2,
            }),
          ]),
          recommendedTopics: [],
        }),
        generatedAt: NOW,
      }),
    });
    expect(trendAnalyzer).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        reportId: "report-1",
        videos: expect.arrayContaining([
          expect.objectContaining({ title: "Fresh AI Agent Upload" }),
        ]),
      }),
    );
  });

  test("stores a completed blank report when no new uploads or articles exist", async () => {
    const prisma = createReportPrisma({ empty: true });

    const summary = await runResearchReportJob({
      prisma,
      workspaceId: "workspace-1",
      manualRun: true,
      now: NOW,
      trendAnalyzer: createTrendAnalyzer(),
    });

    expect(summary.competitorUploadsIncluded).toBe(0);
    expect(summary.industryNewsIncluded).toBe(0);
    expect(prisma.researchReport.update).toHaveBeenCalledWith({
      where: { id: "report-1" },
      data: expect.objectContaining({
        status: "COMPLETED",
        summary: "No new competitor uploads or industry news items were found in the last 24 hours.",
        sectionsJson: expect.objectContaining({
          competitorUploads: [],
          industryNews: [],
          competitorTrends: [],
          recommendedTopics: [],
          recommendedActions: [
            "No action needed from this report window. Check back after new competitor uploads or source items arrive.",
          ],
        }),
      }),
    });
  });
});

function createTrendAnalyzer() {
  return vi.fn(async (input: { videos: Array<{ title: string }> }) =>
    input.videos.length === 0
      ? []
      : [
          {
            title: "AI automation demand",
            summary: "Fresh competitor uploads point to practical AI automation workflows.",
            videoCount: input.videos.length,
            channelCount: input.videos.length,
            supportingTitles: input.videos.map((video) => video.title).slice(0, 3),
          },
        ],
  );
}

function createReportPrisma(
  input: {
    empty?: boolean;
    trackedChannels?: Array<{ youtubeChannelId: string }>;
    industrySources?: Array<{ id: string }>;
  } = {},
) {
  return {
    workspaceSettings: {
      findUnique: vi.fn(async () => ({
        primaryNiche: "AI automation",
        timezone: "Asia/Singapore",
      })),
    },
    trackedChannel: {
      findMany: vi.fn(async () => input.trackedChannels ?? []),
    },
    industrySource: {
      findMany: vi.fn(async () => input.industrySources ?? []),
    },
    researchReport: {
      create: vi.fn(async () => ({ id: "report-1" })),
      update: vi.fn(async () => ({ id: "report-1" })),
    },
    youtubeVideo: {
      findMany: vi.fn(async () =>
        input.empty
          ? []
          : [
              {
                id: "video-fresh-1",
                youtubeVideoId: "yt-fresh-1",
                title: "Fresh AI Agent Upload",
                description: "New upload in the window.",
                publishedAt: new Date("2026-05-19T01:00:00Z"),
                durationSeconds: 840,
                thumbnailUrl: "https://img.youtube.com/yt-fresh-1.jpg",
                channel: { title: "AI Automation Lab", handle: "@lab" },
                metricSnapshots: [{ viewCount: 1000, likeCount: 90, commentCount: 12 }],
                outlierScores: [],
                opportunityScores: [],
              },
              {
                id: "video-fresh-2",
                youtubeVideoId: "yt-fresh-2",
                title: "Fresh Automation Upload",
                description: "Another new upload.",
                publishedAt: new Date("2026-05-18T12:00:00Z"),
                durationSeconds: 620,
                thumbnailUrl: null,
                channel: { title: "Automation School", handle: null },
                metricSnapshots: [],
                outlierScores: [],
                opportunityScores: [],
              },
            ],
      ),
    },
    industrySourceItem: {
      findMany: vi.fn(async () =>
        input.empty
          ? []
          : [
              {
                id: "source-fresh-1",
                title: "Fresh AI News",
                url: "https://example.com/fresh-ai-news",
                summary: "A fresh article.",
                publishedAt: new Date("2026-05-19T02:00:00Z"),
                fetchedAt: new Date("2026-05-19T02:05:00Z"),
                source: { name: "AI News", url: "https://example.com" },
              },
              {
                id: "source-fresh-2",
                title: "Fetched Newsletter Item",
                url: "https://example.com/fetched-newsletter",
                summary: "Fetched in the window without a publish date.",
                publishedAt: null,
                fetchedAt: new Date("2026-05-18T10:00:00Z"),
                source: { name: "Automation Weekly", url: "https://example.com/newsletter" },
              },
            ],
      ),
    },
  };
}
