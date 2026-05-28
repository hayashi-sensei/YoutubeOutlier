import { describe, expect, test, vi } from "vitest";

import { getWorkspaceTopicRecommendations } from "../../lib/recommendations/queries";

describe("getWorkspaceTopicRecommendations", () => {
  test("does not write expiry state while reading and scopes recommendation rows to the generated report", async () => {
    const prisma = createQueryPrisma();

    await getWorkspaceTopicRecommendations(prisma, {
      workspaceId: "workspace-1",
      reportId: "report-1",
      limit: 10,
    });

    expect(prisma.topicRecommendation.updateMany).not.toHaveBeenCalled();
    expect(prisma.topicRecommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace-1",
          reportId: "report-1",
          sourceTrackedChannelId: null,
          status: { notIn: ["DISMISSED", "EXPIRED", "USED"] },
        },
        orderBy: [{ createdAt: "desc" }],
      }),
    );
  });

  test("defaults to global recommendations and excludes channel-specific rows", async () => {
    const prisma = createQueryPrisma();

    await getWorkspaceTopicRecommendations(prisma, {
      workspaceId: "workspace-1",
      limit: 5,
      kind: "STANDARD",
    });

    expect(prisma.topicRecommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace-1",
          kind: "STANDARD",
          sourceTrackedChannelId: null,
          status: { notIn: ["DISMISSED", "EXPIRED", "USED"] },
        },
        orderBy: [{ opportunityScore: "desc" }, { createdAt: "desc" }],
      }),
    );
  });

  test("can scope recommendation rows to a competitor channel", async () => {
    const prisma = createQueryPrisma();

    await getWorkspaceTopicRecommendations(prisma, {
      workspaceId: "workspace-1",
      sourceTrackedChannelId: "tracked-1",
      limit: 5,
    });

    expect(prisma.topicRecommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace-1",
          sourceTrackedChannelId: "tracked-1",
          status: { notIn: ["DISMISSED", "EXPIRED", "USED"] },
        },
        orderBy: [{ opportunityScore: "desc" }, { createdAt: "desc" }],
      }),
    );
  });

  test("can explicitly include used recommendations for history views", async () => {
    const prisma = createQueryPrisma();

    await getWorkspaceTopicRecommendations(prisma, {
      workspaceId: "workspace-1",
      includeUsed: true,
      limit: 5,
    });

    expect(prisma.topicRecommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace-1",
          sourceTrackedChannelId: null,
          status: { notIn: ["DISMISSED", "EXPIRED"] },
        },
      }),
    );
  });

  test("can keep all non-dismissed generated recommendations visible for topic pagination", async () => {
    const prisma = createQueryPrisma();

    await getWorkspaceTopicRecommendations(prisma, {
      workspaceId: "workspace-1",
      kind: "STANDARD",
      includeUsed: true,
      includeExpired: true,
      offset: 15,
      limit: 15,
    });

    expect(prisma.topicRecommendation.updateMany).not.toHaveBeenCalled();
    expect(prisma.topicRecommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace-1",
          kind: "STANDARD",
          sourceTrackedChannelId: null,
          status: { notIn: ["DISMISSED"] },
        },
        skip: 15,
        take: 15,
      }),
    );
  });
});

function createQueryPrisma() {
  return {
    topicRecommendation: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    researchReport: {
      findMany: vi.fn(async () => []),
    },
  };
}
