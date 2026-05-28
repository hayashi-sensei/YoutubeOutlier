import type { RankedOutlierRow } from "../../types/outliers";

type OpportunityScoreQueryRow = {
  videoId: string;
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: Date;
  durationSeconds: number | null;
  channelTitle: string;
  channelHandle: string | null;
  viewCount: bigint | number | null;
  outlierScore: number;
  opportunityScore: number;
  multiplier: number | null;
  calculatedAt: Date;
};

export type OutlierQueryPrisma = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type RankedOutlierPresentationFields = {
  thumbnailUrl: string | null;
  channelHandle: string | null;
  calculatedAt: Date;
};

export async function getTopWorkspaceOutliers(
  prisma: OutlierQueryPrisma,
  { limit, workspaceId }: { workspaceId: string; limit: number },
): Promise<RankedOutlierRow[]> {
  const take = Math.floor(limit);
  if (take <= 0) {
    return [];
  }

  const rows = await prisma.$queryRaw<OpportunityScoreQueryRow[]>`
    SELECT
      latest."videoId",
      latest."youtubeVideoId",
      latest."title",
      latest."thumbnailUrl",
      latest."publishedAt",
      latest."durationSeconds",
      latest."channelTitle",
      latest."channelHandle",
      latest."viewCount",
      outlier."outlierScore" AS "outlierScore",
      latest."opportunityScore",
      outlier."multiplier" AS "multiplier",
      outlier."calculatedAt" AS "calculatedAt"
    FROM (
      SELECT
        video."id" AS "videoId",
        video."youtubeVideoId" AS "youtubeVideoId",
        video."title" AS "title",
        video."thumbnailUrl" AS "thumbnailUrl",
        video."publishedAt" AS "publishedAt",
        video."durationSeconds" AS "durationSeconds",
        channel."title" AS "channelTitle",
        channel."handle" AS "channelHandle",
        metric."viewCount" AS "viewCount",
        opportunity."outlierScoreId" AS "outlierScoreId",
        opportunity."opportunityScore" AS "opportunityScore",
        opportunity."calculatedAt" AS "opportunityCalculatedAt",
        ROW_NUMBER() OVER (
          PARTITION BY opportunity."workspaceId", opportunity."youtubeVideoId"
          ORDER BY opportunity."calculatedAt" DESC
        ) AS "latestRank"
      FROM "WorkspaceVideoOpportunityScore" opportunity
      INNER JOIN "YoutubeVideo" video
        ON video."id" = opportunity."youtubeVideoId"
      INNER JOIN "YoutubeChannel" channel
        ON channel."id" = video."youtubeChannelId"
      INNER JOIN "TrackedChannel" tracked
        ON tracked."youtubeChannelId" = channel."id"
        AND tracked."workspaceId" = opportunity."workspaceId"
        AND tracked."isActive" = true
      LEFT JOIN LATERAL (
        SELECT snapshot."viewCount"
        FROM "VideoMetricSnapshot" snapshot
        WHERE snapshot."youtubeVideoId" = video."id"
        ORDER BY snapshot."capturedAt" DESC
        LIMIT 1
      ) metric ON TRUE
      WHERE opportunity."workspaceId" = ${workspaceId}
    ) latest
    INNER JOIN "OutlierScore" outlier
      ON outlier."id" = latest."outlierScoreId"
    WHERE latest."latestRank" = 1
    ORDER BY latest."opportunityScore" DESC, latest."opportunityCalculatedAt" DESC
    LIMIT ${take}
  `;

  return rows
    .map((row) => {
      if (typeof row.outlierScore !== "number" || !Number.isFinite(row.outlierScore)) {
        return null;
      }

      return {
        rank: 0,
        videoId: row.videoId,
        youtubeVideoId: row.youtubeVideoId,
        title: row.title,
        channelTitle: row.channelTitle,
        channelHandle: row.channelHandle,
        thumbnailUrl: row.thumbnailUrl,
        publishedAt: row.publishedAt,
        durationSeconds: row.durationSeconds,
        viewCount: toNumber(row.viewCount),
        outlierScore: row.outlierScore,
        opportunityScore: row.opportunityScore,
        multiplier: row.multiplier ?? 0,
        calculatedAt: row.calculatedAt,
      } satisfies RankedOutlierRow & RankedOutlierPresentationFields;
    })
    .filter((row) => row !== null)
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
}

function toNumber(value: bigint | number | null | undefined): number {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return 0;
}
