import { describe, expect, test, vi } from "vitest";

import {
  getTopWorkspaceOutliers,
  type OutlierQueryPrisma,
} from "../../lib/outliers/queries";

describe("getTopWorkspaceOutliers", () => {
  test("queries ranked workspace scores and maps rows for display", async () => {
    const calculatedAt = new Date("2026-05-18T00:00:00Z");
    const prisma: OutlierQueryPrisma = {
      $queryRaw: vi.fn(
        async () =>
          [
            {
              videoId: "video-1",
              youtubeVideoId: "yt-video-1",
              title: "A real outlier",
              thumbnailUrl: "https://example.com/thumb.jpg",
              publishedAt: new Date("2026-05-17T00:00:00Z"),
              durationSeconds: 900,
              channelTitle: "Channel One",
              channelHandle: "@channelone",
              viewCount: 123456n,
              outlierScore: 88.2,
              opportunityScore: 91.5,
              multiplier: 4.4,
              calculatedAt,
            },
            {
              videoId: "video-2",
              youtubeVideoId: "yt-video-2",
              title: "Missing score",
              thumbnailUrl: null,
              publishedAt: new Date("2026-05-16T00:00:00Z"),
              channelTitle: "Channel Two",
              channelHandle: null,
              viewCount: 500n,
              outlierScore: Number.NaN,
              opportunityScore: 81,
              multiplier: null,
              calculatedAt,
            },
          ] as never,
      ),
    };

    const rows = await getTopWorkspaceOutliers(prisma, {
      workspaceId: "workspace-1",
      limit: 5,
    });

    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(vi.mocked(prisma.$queryRaw).mock.calls[0]?.slice(1)).toEqual(["workspace-1", 5]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rank: 1,
      videoId: "video-1",
      youtubeVideoId: "yt-video-1",
      title: "A real outlier",
      channelTitle: "Channel One",
      publishedAt: new Date("2026-05-17T00:00:00Z"),
      durationSeconds: 900,
      viewCount: 123456,
      outlierScore: 88.2,
      opportunityScore: 91.5,
      multiplier: 4.4,
    });
    expect(rows[0] as typeof rows[0] & { thumbnailUrl: string; channelHandle: string }).toMatchObject({
      thumbnailUrl: "https://example.com/thumb.jpg",
      channelHandle: "@channelone",
    });
  });

  test("selects the latest opportunity row per video before ranking dashboard rows", async () => {
    const prisma: OutlierQueryPrisma = {
      $queryRaw: vi.fn(async () => [] as never),
    };

    await getTopWorkspaceOutliers(prisma, {
      workspaceId: "workspace-1",
      limit: 3,
    });

    const query = normalizeSql(vi.mocked(prisma.$queryRaw).mock.calls[0]?.[0]);

    expect(query).toContain(
      'PARTITION BY opportunity."workspaceId", opportunity."youtubeVideoId" ORDER BY opportunity."calculatedAt" DESC',
    );
    expect(query).not.toContain('ORDER BY opportunity."opportunityScore" DESC, opportunity."calculatedAt" DESC');
    expect(query).toContain('WHERE latest."latestRank" = 1');
    expect(query).toContain(
      'ORDER BY latest."opportunityScore" DESC, latest."opportunityCalculatedAt" DESC',
    );
  });

  test("uses the outlier score linked to the selected opportunity row", async () => {
    const prisma: OutlierQueryPrisma = {
      $queryRaw: vi.fn(async () => [] as never),
    };

    await getTopWorkspaceOutliers(prisma, {
      workspaceId: "workspace-1",
      limit: 3,
    });

    const query = normalizeSql(vi.mocked(prisma.$queryRaw).mock.calls[0]?.[0]);

    expect(query).toContain('opportunity."outlierScoreId" AS "outlierScoreId"');
    expect(query).toContain('INNER JOIN "OutlierScore" outlier ON outlier."id" = latest."outlierScoreId"');
    expect(query).not.toContain('WHERE score."youtubeVideoId" = video."id"');
  });

  test("limits ranked rows to active tracked channels in the workspace", async () => {
    const prisma: OutlierQueryPrisma = {
      $queryRaw: vi.fn(async () => [] as never),
    };

    await getTopWorkspaceOutliers(prisma, {
      workspaceId: "workspace-1",
      limit: 3,
    });

    const query = normalizeSql(vi.mocked(prisma.$queryRaw).mock.calls[0]?.[0]);

    expect(query).toContain('INNER JOIN "TrackedChannel" tracked ON tracked."youtubeChannelId" = channel."id"');
    expect(query).toContain('AND tracked."workspaceId" = opportunity."workspaceId"');
    expect(query).toContain('AND tracked."isActive" = true');
  });

  test("returns no rows for a nonpositive limit", async () => {
    const prisma: OutlierQueryPrisma = {
      $queryRaw: vi.fn(),
    };

    await expect(getTopWorkspaceOutliers(prisma, { workspaceId: "workspace-1", limit: 0 })).resolves.toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

function normalizeSql(query: TemplateStringsArray | undefined): string {
  return Array.from(query ?? [])
    .join("?")
    .replace(/\s+/g, " ")
    .trim();
}
