import { describe, expect, test, vi } from "vitest";

import {
  dismissTopicRecommendation,
  saveRecommendationToCalendar,
  saveTopicRecommendation,
} from "../../lib/recommendations/mutations";

describe("recommendation mutations", () => {
  test("saves a recommendation to the calendar and marks it used", async () => {
    const prisma = {
      topicRecommendation: {
        findFirst: vi.fn(async () => ({
          id: "rec-1",
          workspaceId: "workspace-1",
          suggestedTitle: "I Built a 5-Agent AI Workflow",
          title: "AI agent workflow implementation",
          topic: "AI agent workflow implementation",
        })),
        update: vi.fn(async () => ({ id: "rec-1" })),
      },
      contentItem: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: "content-1" })),
      },
    };

    const result = await saveRecommendationToCalendar(prisma, {
      workspaceId: "workspace-1",
      recommendationId: "rec-1",
    });

    expect(result).toEqual({ contentItemId: "content-1", reused: false });
    expect(prisma.contentItem.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        recommendationId: "rec-1",
        title: "I Built a 5-Agent AI Workflow",
        contentType: "youtube_video",
        status: "IDEA",
        notes: "Created from topic recommendation: AI agent workflow implementation",
      },
      select: { id: true },
    });
    expect(prisma.topicRecommendation.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: { status: "USED" },
    });
  });

  test("does not save dismissed recommendations to the calendar", async () => {
    const prisma = {
      topicRecommendation: {
        findFirst: vi.fn(async () => null),
        update: vi.fn(async () => ({ id: "rec-1" })),
      },
      contentItem: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: "content-1" })),
      },
    };

    await expect(
      saveRecommendationToCalendar(prisma, {
        workspaceId: "workspace-1",
        recommendationId: "rec-1",
      }),
    ).rejects.toThrow("Recommendation was not found");
    expect(prisma.topicRecommendation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: ["DISMISSED"] },
        }),
      }),
    );
    expect(prisma.contentItem.create).not.toHaveBeenCalled();
  });

  test("save updates and dismiss deletes recommendations inside the workspace", async () => {
    const prisma = {
      topicRecommendation: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        deleteMany: vi.fn(async () => ({ count: 1 })),
      },
    };

    await expect(
      saveTopicRecommendation(prisma, {
        workspaceId: "workspace-1",
        recommendationId: "rec-1",
      }),
    ).resolves.toEqual({ updated: true });
    await expect(
      dismissTopicRecommendation(prisma, {
        workspaceId: "workspace-1",
        recommendationId: "rec-1",
      }),
    ).resolves.toEqual({ updated: true });

    expect(prisma.topicRecommendation.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "rec-1",
        workspaceId: "workspace-1",
        status: { notIn: ["DISMISSED"] },
      },
      data: { status: "SAVED" },
    });
    expect(prisma.topicRecommendation.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "rec-1",
        workspaceId: "workspace-1",
      },
    });
  });
});
