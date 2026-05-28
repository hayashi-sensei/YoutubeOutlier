import { describe, expect, test, vi } from "vitest";

import { runCompetitorBlueprintAnalysisJob } from "../../lib/blueprints/runner";

describe("runCompetitorBlueprintAnalysisJob", () => {
  test("creates a blueprint for an active tracked channel with analyzed outliers", async () => {
    const prisma = {
      trackedChannel: {
        findMany: vi.fn().mockResolvedValue([
          {
            workspaceId: "workspace-1",
            youtubeChannelId: "channel-1",
            channel: {
              id: "channel-1",
              title: "AI Automation Lab",
              videos: [
                video("video-1", 92, "I built X that does Y"),
                video("video-2", 86, "How to achieve X with Y"),
              ],
            },
          },
        ]),
      },
      competitorBlueprint: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({
          id: "blueprint-1",
          createdAt: new Date("2026-05-18T00:00:00Z"),
        }),
      },
    };

    const summary = await runCompetitorBlueprintAnalysisJob({
      prisma,
      workspaceId: "workspace-1",
      now: new Date("2026-05-18T00:00:00Z"),
    });

    expect(summary).toEqual({
      workspaceId: "workspace-1",
      channelsEvaluated: 1,
      blueprintsCreated: 1,
      blueprintsUpdated: 0,
      channelsSkipped: 0,
    });
    expect(prisma.competitorBlueprint.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_youtubeChannelId: {
            workspaceId: "workspace-1",
            youtubeChannelId: "channel-1",
          },
        },
      }),
    );
    expect(prisma.trackedChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          channel: expect.objectContaining({
            select: expect.objectContaining({
              videos: expect.objectContaining({
                where: {
                  outlierScores: { some: {} },
                },
                orderBy: [{ publishedAt: "desc" }],
                take: 100,
              }),
            }),
          }),
        }),
      }),
    );
  });

  test("updates an existing blueprint for a channel", async () => {
    const prisma = {
      trackedChannel: {
        findMany: vi.fn().mockResolvedValue([
          {
            workspaceId: "workspace-1",
            youtubeChannelId: "channel-1",
            channel: {
              id: "channel-1",
              title: "AI Automation Lab",
              videos: [
                video("video-1", 92, "I built X that does Y"),
                video("video-2", 86, "How to achieve X with Y"),
              ],
            },
          },
        ]),
      },
      competitorBlueprint: {
        findUnique: vi.fn().mockResolvedValue({ id: "existing-blueprint" }),
        upsert: vi.fn().mockResolvedValue({
          id: "existing-blueprint",
          createdAt: new Date("2026-05-01T00:00:00Z"),
        }),
      },
    };

    const summary = await runCompetitorBlueprintAnalysisJob({
      prisma,
      workspaceId: "workspace-1",
      now: new Date("2026-05-18T00:00:00Z"),
    });

    expect(summary.blueprintsCreated).toBe(0);
    expect(summary.blueprintsUpdated).toBe(1);
  });

  test("skips channels without enough analyzed outliers", async () => {
    const prisma = {
      trackedChannel: {
        findMany: vi.fn().mockResolvedValue([
          {
            workspaceId: "workspace-1",
            youtubeChannelId: "channel-1",
            channel: { id: "channel-1", title: "AI Automation Lab", videos: [] },
          },
        ]),
      },
      competitorBlueprint: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    };

    const summary = await runCompetitorBlueprintAnalysisJob({
      prisma,
      workspaceId: "workspace-1",
      now: new Date("2026-05-18T00:00:00Z"),
    });

    expect(summary.channelsSkipped).toBe(1);
    expect(prisma.competitorBlueprint.upsert).not.toHaveBeenCalled();
  });

  test("creates a fallback blueprint from scored outliers without video analyses", async () => {
    const prisma = {
      trackedChannel: {
        findMany: vi.fn().mockResolvedValue([
          {
            workspaceId: "workspace-1",
            youtubeChannelId: "channel-1",
            channel: {
              id: "channel-1",
              title: "AI Automation Lab",
              videos: [
                video("video-1", 92, "I Built 7 AI Agents That Run My Business", { analyses: [] }),
                video("video-2", 86, "How to Build an AI Workflow", { analyses: [] }),
              ],
            },
          },
        ]),
      },
      competitorBlueprint: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({
          id: "blueprint-1",
          createdAt: new Date("2026-05-18T00:00:00Z"),
        }),
      },
    };

    const summary = await runCompetitorBlueprintAnalysisJob({
      prisma,
      workspaceId: "workspace-1",
      now: new Date("2026-05-18T00:00:00Z"),
    });

    expect(summary.blueprintsCreated).toBe(1);
    expect(summary.channelsSkipped).toBe(0);
    expect(prisma.competitorBlueprint.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          videoCount: 2,
          titlePatterns: ["Numbered system or list"],
          hookPatterns: ["metadata-led hook"],
        }),
      }),
    );
  });
});

function video(
  id: string,
  outlierScore: number,
  titlePattern: string,
  overrides: { analyses?: unknown[] } = {},
) {
  return {
    id,
    youtubeVideoId: `yt-${id}`,
    title: `Video ${id}`,
    publishedAt: new Date("2026-05-10T00:00:00Z"),
    outlierScores: [
      {
        outlierScore,
        multiplier: 5.2,
        calculatedAt: new Date("2026-05-18T00:00:00Z"),
      },
    ],
    opportunityScores: [
      {
        opportunityScore: outlierScore - 4,
        calculatedAt: new Date("2026-05-18T00:00:00Z"),
      },
    ],
    analyses: overrides.analyses ?? [
      {
        contentPillar: "AI agents",
        hookType: "proof first",
        titlePattern,
        thumbnailPattern: "face plus dashboard",
        structureJson: { structure: [{ label: "Proof" }, { label: "Breakdown" }] },
        ctaPattern: "subscribe for templates",
        emotionalAngle: "confidence",
        summary: "A strong outlier pattern.",
      },
    ],
  };
}
