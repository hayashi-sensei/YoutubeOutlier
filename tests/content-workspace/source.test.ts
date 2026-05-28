import { describe, expect, test, vi } from "vitest";

import { createManualContentWorkspace, openRecommendationContentWorkspace } from "../../lib/content-workspace/source";

describe("content workspace sources", () => {
  test("reuses an existing content item for the same recommendation", async () => {
    const prisma = {
      topicRecommendation: {
        findFirst: vi.fn(),
        update: vi.fn(async () => ({ id: "rec-1" })),
      },
      contentItem: {
        findFirst: vi.fn(async () => ({ id: "content-existing" })),
        create: vi.fn(),
      },
    };

    await expect(
      openRecommendationContentWorkspace(prisma, {
        workspaceId: "workspace-1",
        recommendationId: "rec-1",
      }),
    ).resolves.toEqual({ contentItemId: "content-existing", reused: true });
    expect(prisma.topicRecommendation.findFirst).not.toHaveBeenCalled();
    expect(prisma.topicRecommendation.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: { status: "USED" },
      select: { id: true },
    });
    expect(prisma.contentItem.create).not.toHaveBeenCalled();
  });

  test("creates a recommendation-backed content item with evidence snapshot", async () => {
    const prisma = {
      topicRecommendation: {
        findFirst: vi.fn(async () => ({
          id: "rec-1",
          workspaceId: "workspace-1",
          title: "Recommendation",
          topic: "AI workflow",
          angle: "Build the stack",
          whyNow: "Competitors are spiking",
          audiencePainPoint: "Too many demos",
          opportunityScore: 91,
          suggestedTitle: "Build This AI Workflow",
          suggestedHook: "Most demos fail in production.",
          thumbnailConcept: "Five blocks",
          linkedinAngle: "Operational lesson",
          sourceTrackedChannelId: "tracked-1",
          workspace: { id: "workspace-1", name: "Founder Workspace", planCode: "PRO" },
          sourceTrackedChannel: {
            id: "tracked-1",
            nickname: "Competitor",
            reason: "Good overlap",
            youtubeChannelId: "channel-1",
            channel: {
              id: "channel-1",
              youtubeChannelId: "UC123",
              title: "AI Channel",
              handle: "@ai",
              competitorBlueprints: [
                {
                  id: "blueprint-1",
                  summary: "Tutorials win",
                  videoCount: 5,
                  averageOutlierScore: 88,
                  generatedAt: new Date("2026-05-19T00:00:00Z"),
                  titlePatterns: ["I built X"],
                  hookPatterns: ["proof first"],
                  thumbnailPatterns: ["dashboard"],
                  contentPillars: ["AI workflows"],
                  structurePatterns: ["build"],
                  ctaPatterns: ["subscribe"],
                  emotionalAngles: ["clarity"],
                  observationsJson: { signals: ["tutorial"] },
                  topVideoIds: ["video-1"],
                },
              ],
            },
          },
          evidences: [
            {
              id: "evidence-1",
              evidenceType: "competitor_outlier",
              note: "Strong lift",
              video: {
                id: "video-1",
                youtubeVideoId: "yt-1",
                title: "Winning video",
                channel: { title: "AI Channel", handle: "@ai" },
                outlierScores: [
                  {
                    outlierScore: 92,
                    multiplier: 4.2,
                    calculatedAt: new Date("2026-05-18T00:00:00Z"),
                  },
                ],
              },
              sourceItem: null,
            },
            {
              id: "evidence-2",
              evidenceType: "industry_source",
              note: "Source article",
              video: null,
              sourceItem: {
                id: "source-item-1",
                title: "OpenAI launches a workflow feature",
                url: "https://example.com/openai-workflow",
                source: {
                  name: "Example News",
                  url: "https://example.com",
                },
              },
            },
          ],
        })),
        update: vi.fn(async () => ({ id: "rec-1" })),
      },
      contentItem: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: "content-1" })),
      },
    };

    await openRecommendationContentWorkspace(prisma, {
      workspaceId: "workspace-1",
      recommendationId: "rec-1",
    });

    expect(prisma.contentItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        recommendationId: "rec-1",
        title: "Build This AI Workflow",
        contentType: "youtube_video",
        status: "IDEA",
        sourceType: "channel_recommendation",
        evidenceSnapshot: expect.objectContaining({
          workspaceId: "workspace-1",
          sourceType: "channel_recommendation",
          workspace: { id: "workspace-1", name: "Founder Workspace", planCode: "PRO" },
          channel: expect.objectContaining({ trackedChannelId: "tracked-1", title: "AI Channel" }),
          blueprint: expect.objectContaining({ id: "blueprint-1", summary: "Tutorials win" }),
          evidences: [
            expect.objectContaining({
              video: expect.objectContaining({
                title: "Winning video",
                youtubeVideoId: "yt-1",
                outlier: expect.objectContaining({ outlierScore: 92, multiplier: 4.2 }),
              }),
            }),
            expect.objectContaining({
              sourceItem: expect.objectContaining({
                title: "OpenAI launches a workflow feature",
                url: "https://example.com/openai-workflow",
                sourceUrl: "https://example.com",
              }),
            }),
          ],
        }),
      }),
      select: { id: true },
    });
    expect(prisma.topicRecommendation.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: { status: "USED" },
      select: { id: true },
    });
  });

  test("creates a manual topic content item without recommendation", async () => {
    const prisma = {
      contentItem: {
        create: vi.fn(async () => ({ id: "content-manual" })),
      },
    };

    await createManualContentWorkspace(prisma, {
      workspaceId: "workspace-1",
      topic: "Manual AI agent idea",
      angle: "Show a simple build",
    });

    expect(prisma.contentItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        recommendationId: null,
        title: "Manual AI agent idea",
        sourceType: "manual_topic",
        manualTopic: "Manual AI agent idea",
      }),
      select: { id: true },
    });
  });
});
