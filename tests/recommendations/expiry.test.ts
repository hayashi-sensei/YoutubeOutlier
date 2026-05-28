import { describe, expect, test, vi } from "vitest";

import { expireStaleTopicRecommendations } from "../../lib/recommendations/expiry";

describe("expireStaleTopicRecommendations", () => {
  test("expires untouched new recommendations older than the retention window", async () => {
    const prisma = {
      topicRecommendation: {
        updateMany: vi.fn(async () => ({ count: 3 })),
      },
    };

    const summary = await expireStaleTopicRecommendations(prisma, {
      now: new Date("2026-05-18T00:00:00Z"),
    });

    expect(summary).toEqual({
      cutoff: new Date("2026-03-19T00:00:00Z"),
      expired: 3,
    });
    expect(prisma.topicRecommendation.updateMany).toHaveBeenCalledWith({
      where: {
        status: "NEW",
        createdAt: { lt: new Date("2026-03-19T00:00:00Z") },
      },
      data: { status: "EXPIRED" },
    });
  });
});
