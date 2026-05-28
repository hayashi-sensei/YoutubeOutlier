import { describe, expect, test, vi } from "vitest";

import { getWorkspaceBlueprintSummaries } from "../../lib/blueprints/queries";

describe("getWorkspaceBlueprintSummaries", () => {
  test("normalizes JSON fields into string arrays and observation arrays", async () => {
    const prisma = {
      competitorBlueprint: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "blueprint-1",
            workspaceId: "workspace-1",
            youtubeChannelId: "channel-1",
            summary: "AI Automation Lab repeatedly wins with AI agents.",
            titlePatterns: ["I built X"],
            hookPatterns: ["proof first"],
            thumbnailPatterns: ["face plus dashboard"],
            contentPillars: ["AI agents"],
            structurePatterns: ["Proof -> Breakdown"],
            ctaPatterns: ["subscribe for templates"],
            emotionalAngles: ["confidence"],
            observationsJson: [{ videoId: "video-1", titlePattern: "I built X" }],
            videoCount: 2,
            averageOutlierScore: 89,
            generatedAt: new Date("2026-05-18T00:00:00Z"),
            updatedAt: new Date("2026-05-18T00:00:00Z"),
            channel: {
              title: "AI Automation Lab",
              handle: "@ai",
              thumbnailUrl: null,
            },
          },
        ]),
      },
    };

    const rows = await getWorkspaceBlueprintSummaries(prisma, {
      workspaceId: "workspace-1",
      limit: 3,
    });

    expect(rows[0]?.titlePatterns).toEqual(["I built X"]);
    expect(rows[0]?.channelTitle).toBe("AI Automation Lab");
    expect(rows[0]?.channelHandle).toBe("@ai");
    expect(rows[0]?.observations[0]?.videoId).toBe("video-1");
  });
});
