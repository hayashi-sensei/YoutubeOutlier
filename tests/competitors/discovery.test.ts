import { describe, expect, test, vi } from "vitest";

import {
  buildSearchQueries,
  ensureCompetitorRecommendations,
  type CompetitorDiscoveryPrisma,
  type CompetitorDiscoveryProvider,
} from "../../lib/competitors/discovery";

const NOW = new Date("2026-05-20T10:00:00Z");

describe("competitor discovery", () => {
  test("builds search queries from the workspace profile and tracked channels", () => {
    expect(
      buildSearchQueries({
        id: "workspace-1",
        settings: {
          primaryNiche: "AI automation",
          subNiche: "agent workflows",
          targetAudience: "solo founders",
          contentGoals: "tutorials, demos",
        },
        trackedChannels: [
          { channel: { youtubeChannelId: "UC1", handle: "@one", title: "Builder One" } },
        ],
      }),
    ).toEqual([
      "agent workflows AI automation YouTube channel for solo founders",
      "agent workflows AI automation tutorial creator for solo founders",
      "agent workflows AI automation tutorials YouTube competitor",
    ]);
  });

  test("skips discovery when enough pending recommendations already exist", async () => {
    const prisma = createPrisma({
      recommendations: [
        recommendation("UC1", "NEW"),
        recommendation("UC2", "NEW"),
        recommendation("UC3", "NEW"),
      ],
    });
    const provider = createProvider();

    const summary = await ensureCompetitorRecommendations({
      prisma,
      workspaceId: "workspace-1",
      provider,
      now: NOW,
    });

    expect(summary).toMatchObject({
      skipped: true,
      reason: "pending_queue_has_recommendations",
      recommendationsCreated: 0,
    });
    expect(provider.searchVideos).not.toHaveBeenCalled();
  });

  test("discovers, dedupes, enriches, and saves new competitor recommendations", async () => {
    const prisma = createPrisma({
      recommendations: [
        recommendation("UCTracked", "USED"),
        recommendation("UCDismissed", "DISMISSED"),
      ],
    });
    const provider = createProvider({
      searchVideos: vi.fn(async () => [
        {
          youtubeVideoId: "video-1",
          channelId: "UCNew",
          channelTitle: "AI Ops Lab",
          title: "AI automation workflow for solo founders",
          publishedAt: new Date("2026-05-18T00:00:00Z"),
        },
        {
          youtubeVideoId: "video-2",
          channelId: "UCTracked",
          channelTitle: "Already Tracked",
          title: "Tracked channel result",
          publishedAt: new Date("2026-05-18T00:00:00Z"),
        },
        {
          youtubeVideoId: "video-3",
          channelId: "UCDismissed",
          channelTitle: "Dismissed Channel",
          title: "Dismissed channel result",
          publishedAt: new Date("2026-05-18T00:00:00Z"),
        },
      ]),
    });

    const summary = await ensureCompetitorRecommendations({
      prisma,
      workspaceId: "workspace-1",
      provider,
      now: NOW,
    });

    expect(summary).toMatchObject({
      skipped: false,
      recommendationsCreated: 1,
    });
    expect(prisma.competitorRecommendation.create).toHaveBeenCalledTimes(1);
    expect(prisma.competitorRecommendation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        channelUrl: "https://www.youtube.com/@aiopslab",
        title: "AI Ops Lab",
        status: "NEW",
      }),
    });
    expect(prisma.jobRun.update).toHaveBeenLastCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({
        status: "SUCCEEDED",
        metadata: expect.objectContaining({ recommendationsCreated: 1 }),
      }),
    });
  });
});

function recommendation(youtubeChannelId: string, status: string) {
  return {
    channelUrl: `https://www.youtube.com/channel/${youtubeChannelId}`,
    title: youtubeChannelId,
    status,
    youtubeChannelId,
  };
}

function createPrisma(input: {
  recommendations?: Array<{
    channelUrl: string;
    title: string;
    status: string;
    youtubeChannelId: string | null;
  }>;
  latestDiscovery?: { id: string; createdAt: Date } | null;
} = {}): CompetitorDiscoveryPrisma {
  return {
    workspace: {
      findUnique: vi.fn(async () => ({
        id: "workspace-1",
        settings: {
          primaryNiche: "AI automation",
          subNiche: null,
          targetAudience: "solo founders",
          contentGoals: "tutorials",
        },
        trackedChannels: [
          {
            channel: {
              youtubeChannelId: "UCTracked",
              handle: "@tracked",
              title: "Already Tracked",
            },
          },
        ],
      })),
    },
    competitorRecommendation: {
      findMany: vi.fn(async () => input.recommendations ?? []),
      create: vi.fn(async () => ({})),
    },
    jobRun: {
      findFirst: vi.fn(async () => input.latestDiscovery ?? null),
      create: vi.fn(async () => ({ id: "job-1" })),
      update: vi.fn(async () => ({})),
    },
  };
}

function createProvider(overrides: Partial<CompetitorDiscoveryProvider> = {}): CompetitorDiscoveryProvider {
  return {
    searchVideos: vi.fn(async () => []),
    getChannel: vi.fn(async (channelId) => ({
      youtubeChannelId: channelId,
      handle: channelId === "UCNew" ? "@aiopslab" : undefined,
      title: channelId === "UCNew" ? "AI Ops Lab" : channelId,
      description: channelId === "UCNew" ? "AI automation workflows for solo founders." : "",
      subscriberCount: channelId === "UCNew" ? BigInt(42000) : undefined,
    })),
    ...overrides,
  };
}
