# YouTube Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Spec 006 by ingesting YouTube channel metadata, upload playlist videos, video metadata, metric snapshots, freshness fields, quota accounting, and job success/failure logs.

**Architecture:** Keep the YouTube Data API behind a small provider interface so ingestion logic can be tested without network calls. Use existing global `YoutubeChannel`, `YoutubeVideo`, `VideoMetricSnapshot`, and `JobRun` tables, adding only a small quota usage table for provider quota protection. Expose manual server-side runner functions now; leave full queue scheduling and admin monitoring expansion to Spec 009.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 7, Supabase Postgres, YouTube Data API v3 over `fetch`, Vitest with mocked providers, existing `JobRun` logging.

---

## File Structure

- Modify `lib/env.ts`: add optional YouTube API and quota env vars.
- Modify `prisma/schema.prisma`: add `YoutubeQuotaUsage` model and relation-free quota indexes.
- Create `prisma/migrations/0006_youtube_ingestion/migration.sql`: add quota usage table and indexes.
- Modify `docs/schema/schema-notes.md`: document YouTube ingestion freshness and quota accounting.
- Create `lib/youtube/provider.ts`: provider types, ISO 8601 duration parser, official API adapter.
- Create `lib/youtube/ingestion.ts`: pure ingestion orchestration for backfill and recent refresh.
- Create `lib/youtube/ingestion-runner.ts`: Prisma-backed job runner that writes `JobRun` records.
- Create `tests/youtube/provider.test.ts`: duration parsing and provider request shaping.
- Create `tests/youtube/ingestion.test.ts`: backfill cutoff, upserts, snapshots, quota guard, job logging.
- Modify `context/current-feature.md`: record the plan path and verification plan.

## Task 1: Environment And Quota Schema

**Files:**
- Modify: `lib/env.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0006_youtube_ingestion/migration.sql`
- Modify: `docs/schema/schema-notes.md`

- [ ] **Step 1: Extend env validation**

Add these fields to `envSchema` in `lib/env.ts`:

```ts
YOUTUBE_DATA_API_KEY: z.string().min(1).optional(),
YOUTUBE_DAILY_QUOTA_LIMIT: z.coerce.number().int().positive().default(9000),
```

Add these values to the parsed object:

```ts
YOUTUBE_DATA_API_KEY: process.env.YOUTUBE_DATA_API_KEY,
YOUTUBE_DAILY_QUOTA_LIMIT: process.env.YOUTUBE_DAILY_QUOTA_LIMIT,
```

- [ ] **Step 2: Add quota model to Prisma**

Add this model near `JobRun` in `prisma/schema.prisma`:

```prisma
model YoutubeQuotaUsage {
  id           String   @id @default(cuid())
  quotaDate    DateTime
  operation    String
  units        Int
  referenceType String?
  referenceId  String?
  createdAt    DateTime @default(now())

  @@index([quotaDate])
  @@index([operation, quotaDate])
  @@index([referenceType, referenceId])
}
```

- [ ] **Step 3: Add SQL migration**

Create `prisma/migrations/0006_youtube_ingestion/migration.sql`:

```sql
CREATE TABLE IF NOT EXISTS "YoutubeQuotaUsage" (
  "id" TEXT NOT NULL,
  "quotaDate" TIMESTAMP(3) NOT NULL,
  "operation" TEXT NOT NULL,
  "units" INTEGER NOT NULL,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "YoutubeQuotaUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "YoutubeQuotaUsage_quotaDate_idx" ON "YoutubeQuotaUsage"("quotaDate");
CREATE INDEX IF NOT EXISTS "YoutubeQuotaUsage_operation_quotaDate_idx" ON "YoutubeQuotaUsage"("operation", "quotaDate");
CREATE INDEX IF NOT EXISTS "YoutubeQuotaUsage_referenceType_referenceId_idx" ON "YoutubeQuotaUsage"("referenceType", "referenceId");
```

- [ ] **Step 4: Document schema behavior**

Append to `docs/schema/schema-notes.md`:

```md
## YouTube Ingestion

`YoutubeChannel.lastFetchedAt` stores channel metadata freshness. `YoutubeVideo.lastFetchedAt` stores the last metadata refresh for that video, while `VideoMetricSnapshot.capturedAt` records metric history over time.

`YoutubeQuotaUsage` records estimated YouTube Data API quota units by day and operation. Ingestion code should check this table before making provider calls and record usage after successful provider calls.
```

- [ ] **Step 5: Validate schema**

Run: `npm run prisma:validate`

Expected: PASS.

## Task 2: YouTube Provider Boundary

**Files:**
- Create: `lib/youtube/provider.ts`
- Create: `tests/youtube/provider.test.ts`

- [ ] **Step 1: Write provider tests**

Create `tests/youtube/provider.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { parseYoutubeDuration, YoutubeDataApiProvider } from "../../lib/youtube/provider";

describe("parseYoutubeDuration", () => {
  test("parses ISO 8601 YouTube durations into seconds", () => {
    expect(parseYoutubeDuration("PT1H2M3S")).toBe(3723);
    expect(parseYoutubeDuration("PT15M")).toBe(900);
    expect(parseYoutubeDuration("PT45S")).toBe(45);
  });
});

describe("YoutubeDataApiProvider", () => {
  test("fetches channel metadata with contentDetails and statistics parts", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "UC123",
            snippet: { title: "Creator", description: "Desc", thumbnails: { high: { url: "thumb.jpg" } }, country: "US", customUrl: "@creator" },
            contentDetails: { relatedPlaylists: { uploads: "UU123" } },
            statistics: { subscriberCount: "1000", videoCount: "25", viewCount: "9000" },
          },
        ],
      }),
    });
    const provider = new YoutubeDataApiProvider({ apiKey: "key", fetchImpl });

    await expect(provider.getChannel("UC123")).resolves.toMatchObject({
      youtubeChannelId: "UC123",
      uploadsPlaylistId: "UU123",
      subscriberCount: BigInt(1000),
    });
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining("part=snippet%2CcontentDetails%2Cstatistics"));
  });
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm run test -- tests/youtube/provider.test.ts`

Expected: FAIL because `lib/youtube/provider.ts` does not exist.

- [ ] **Step 3: Implement provider types and adapter**

Create `lib/youtube/provider.ts` with:

```ts
export type YoutubeChannelMetadata = {
  youtubeChannelId: string;
  handle?: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  subscriberCount?: bigint;
  videoCount?: number;
  viewCount?: bigint;
  uploadsPlaylistId?: string;
  country?: string;
};

export type YoutubeVideoMetadata = {
  youtubeVideoId: string;
  title: string;
  description?: string;
  publishedAt: Date;
  durationSeconds?: number;
  thumbnailUrl?: string;
  tags: string[];
  categoryId?: string;
  defaultLanguage?: string;
  viewCount?: bigint;
  likeCount?: bigint;
  commentCount?: bigint;
};

export type YoutubePlaylistPage = {
  videoIds: string[];
  nextPageToken?: string;
};

export type YoutubeProvider = {
  getChannel(channelId: string): Promise<YoutubeChannelMetadata>;
  listPlaylistVideoIds(input: { playlistId: string; pageToken?: string; maxResults: number }): Promise<YoutubePlaylistPage>;
  getVideos(videoIds: string[]): Promise<YoutubeVideoMetadata[]>;
};

type FetchImpl = typeof fetch;

export function parseYoutubeDuration(value: string) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) return undefined;
  const [, hours = "0", minutes = "0", seconds = "0"] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function optionalBigInt(value: unknown) {
  return typeof value === "string" && value.length > 0 ? BigInt(value) : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "string" && value.length > 0 ? Number(value) : undefined;
}

export class YoutubeDataApiProvider implements YoutubeProvider {
  private apiKey: string;
  private fetchImpl: FetchImpl;
  private baseUrl = "https://www.googleapis.com/youtube/v3";

  constructor(input: { apiKey: string; fetchImpl?: FetchImpl }) {
    this.apiKey = input.apiKey;
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  async getChannel(channelId: string) {
    const url = new URL(`${this.baseUrl}/channels`);
    url.searchParams.set("part", "snippet,contentDetails,statistics");
    url.searchParams.set("id", channelId);
    url.searchParams.set("key", this.apiKey);
    const json = await this.getJson(url);
    const item = json.items?.[0];
    if (!item) throw new Error(`YouTube channel not found: ${channelId}`);

    return {
      youtubeChannelId: item.id,
      handle: item.snippet?.customUrl,
      title: item.snippet?.title ?? item.id,
      description: item.snippet?.description,
      thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url,
      subscriberCount: optionalBigInt(item.statistics?.subscriberCount),
      videoCount: optionalNumber(item.statistics?.videoCount),
      viewCount: optionalBigInt(item.statistics?.viewCount),
      uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads,
      country: item.snippet?.country,
    };
  }

  async listPlaylistVideoIds(input: { playlistId: string; pageToken?: string; maxResults: number }) {
    const url = new URL(`${this.baseUrl}/playlistItems`);
    url.searchParams.set("part", "contentDetails");
    url.searchParams.set("playlistId", input.playlistId);
    url.searchParams.set("maxResults", String(input.maxResults));
    url.searchParams.set("key", this.apiKey);
    if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
    const json = await this.getJson(url);

    return {
      videoIds: (json.items ?? []).map((item: { contentDetails?: { videoId?: string } }) => item.contentDetails?.videoId).filter(Boolean),
      nextPageToken: json.nextPageToken,
    };
  }

  async getVideos(videoIds: string[]) {
    if (videoIds.length === 0) return [];
    const url = new URL(`${this.baseUrl}/videos`);
    url.searchParams.set("part", "snippet,contentDetails,statistics");
    url.searchParams.set("id", videoIds.join(","));
    url.searchParams.set("key", this.apiKey);
    const json = await this.getJson(url);

    return (json.items ?? []).map((item: any) => ({
      youtubeVideoId: item.id,
      title: item.snippet?.title ?? item.id,
      description: item.snippet?.description,
      publishedAt: new Date(item.snippet?.publishedAt),
      durationSeconds: parseYoutubeDuration(item.contentDetails?.duration ?? ""),
      thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url,
      tags: item.snippet?.tags ?? [],
      categoryId: item.snippet?.categoryId,
      defaultLanguage: item.snippet?.defaultLanguage,
      viewCount: optionalBigInt(item.statistics?.viewCount),
      likeCount: optionalBigInt(item.statistics?.likeCount),
      commentCount: optionalBigInt(item.statistics?.commentCount),
    }));
  }

  private async getJson(url: URL) {
    const response = await this.fetchImpl(url.toString());
    if (!response.ok) throw new Error(`YouTube API request failed with ${response.status}`);
    return response.json();
  }
}
```

- [ ] **Step 4: Run focused tests and verify pass**

Run: `npm run test -- tests/youtube/provider.test.ts`

Expected: PASS.

## Task 3: Pure Ingestion Logic

**Files:**
- Create: `lib/youtube/ingestion.ts`
- Create: `tests/youtube/ingestion.test.ts`

- [ ] **Step 1: Write ingestion behavior tests**

Create `tests/youtube/ingestion.test.ts` with mocked transaction/provider tests for:

```ts
import { describe, expect, test, vi } from "vitest";
import { backfillChannelVideos, shouldIncludeBackfillVideo } from "../../lib/youtube/ingestion";

describe("shouldIncludeBackfillVideo", () => {
  test("keeps videos until the 100-video or 12-month limits are reached", () => {
    const now = new Date("2026-05-17T00:00:00Z");
    expect(shouldIncludeBackfillVideo({ publishedAt: new Date("2026-05-01T00:00:00Z"), acceptedCount: 99, now })).toBe(true);
    expect(shouldIncludeBackfillVideo({ publishedAt: new Date("2026-05-01T00:00:00Z"), acceptedCount: 100, now })).toBe(false);
    expect(shouldIncludeBackfillVideo({ publishedAt: new Date("2025-01-01T00:00:00Z"), acceptedCount: 2, now })).toBe(false);
  });
});

describe("backfillChannelVideos", () => {
  test("updates channel metadata, creates videos, snapshots metrics, and freshness timestamps", async () => {
    const tx = {
      youtubeChannel: { update: vi.fn().mockResolvedValue({ id: "channel_1", uploadsPlaylistId: "UU123" }) },
      youtubeVideo: { upsert: vi.fn().mockResolvedValue({ id: "video_1" }) },
      videoMetricSnapshot: { create: vi.fn().mockResolvedValue({ id: "snapshot_1" }) },
    } as any;
    const provider = {
      getChannel: vi.fn().mockResolvedValue({ youtubeChannelId: "UC123", title: "Creator", uploadsPlaylistId: "UU123" }),
      listPlaylistVideoIds: vi.fn().mockResolvedValue({ videoIds: ["v1"] }),
      getVideos: vi.fn().mockResolvedValue([
        { youtubeVideoId: "v1", title: "Video", publishedAt: new Date("2026-05-01T00:00:00Z"), tags: [], viewCount: BigInt(100) },
      ]),
    };

    await expect(backfillChannelVideos({ tx, provider, channelId: "channel_1", youtubeChannelId: "UC123", now: new Date("2026-05-17T00:00:00Z") })).resolves.toMatchObject({
      videosUpserted: 1,
      snapshotsCreated: 1,
    });
    expect(tx.youtubeVideo.upsert).toHaveBeenCalled();
    expect(tx.videoMetricSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ viewCount: BigInt(100) }) }));
  });
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm run test -- tests/youtube/ingestion.test.ts`

Expected: FAIL because `lib/youtube/ingestion.ts` does not exist.

- [ ] **Step 3: Implement ingestion functions**

Create `lib/youtube/ingestion.ts` with these exports:

```ts
import type { Prisma } from "@/generated/prisma/client";
import type { YoutubeProvider, YoutubeVideoMetadata } from "@/lib/youtube/provider";

type IngestionTx = Prisma.TransactionClient;

export type IngestionSummary = {
  videosUpserted: number;
  snapshotsCreated: number;
  quotaUnitsEstimated: number;
};

const VIDEO_BATCH_SIZE = 50;

export function shouldIncludeBackfillVideo(input: { publishedAt: Date; acceptedCount: number; now: Date }) {
  const twelveMonthsAgo = new Date(input.now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  return input.acceptedCount < 100 && input.publishedAt >= twelveMonthsAgo;
}

async function upsertVideoWithSnapshot(tx: IngestionTx, channelId: string, video: YoutubeVideoMetadata, now: Date) {
  const saved = await tx.youtubeVideo.upsert({
    where: { youtubeVideoId: video.youtubeVideoId },
    update: {
      title: video.title,
      description: video.description,
      publishedAt: video.publishedAt,
      durationSeconds: video.durationSeconds,
      thumbnailUrl: video.thumbnailUrl,
      tags: video.tags,
      categoryId: video.categoryId,
      defaultLanguage: video.defaultLanguage,
      lastFetchedAt: now,
    },
    create: {
      youtubeVideoId: video.youtubeVideoId,
      youtubeChannelId: channelId,
      title: video.title,
      description: video.description,
      publishedAt: video.publishedAt,
      durationSeconds: video.durationSeconds,
      thumbnailUrl: video.thumbnailUrl,
      tags: video.tags,
      categoryId: video.categoryId,
      defaultLanguage: video.defaultLanguage,
      lastFetchedAt: now,
    },
    select: { id: true },
  });

  await tx.videoMetricSnapshot.create({
    data: {
      youtubeVideoId: saved.id,
      viewCount: video.viewCount,
      likeCount: video.likeCount,
      commentCount: video.commentCount,
      capturedAt: now,
    },
  });
}

export async function backfillChannelVideos(input: {
  tx: IngestionTx;
  provider: YoutubeProvider;
  channelId: string;
  youtubeChannelId: string;
  now?: Date;
}): Promise<IngestionSummary> {
  const now = input.now ?? new Date();
  const channel = await input.provider.getChannel(input.youtubeChannelId);
  await input.tx.youtubeChannel.update({
    where: { id: input.channelId },
    data: { ...channel, lastFetchedAt: now },
  });

  if (!channel.uploadsPlaylistId) throw new Error("Channel does not expose an uploads playlist.");

  let pageToken: string | undefined;
  let acceptedCount = 0;
  let videosUpserted = 0;
  let snapshotsCreated = 0;
  let quotaUnitsEstimated = 1;

  do {
    const page = await input.provider.listPlaylistVideoIds({ playlistId: channel.uploadsPlaylistId, pageToken, maxResults: VIDEO_BATCH_SIZE });
    quotaUnitsEstimated += 1;
    const videos = await input.provider.getVideos(page.videoIds);
    quotaUnitsEstimated += 1;

    for (const video of videos) {
      if (!shouldIncludeBackfillVideo({ publishedAt: video.publishedAt, acceptedCount, now })) {
        pageToken = undefined;
        break;
      }
      await upsertVideoWithSnapshot(input.tx, input.channelId, video, now);
      acceptedCount += 1;
      videosUpserted += 1;
      snapshotsCreated += 1;
    }

    pageToken = acceptedCount < 100 ? page.nextPageToken : undefined;
  } while (pageToken);

  return { videosUpserted, snapshotsCreated, quotaUnitsEstimated };
}

export async function refreshRecentChannelVideos(input: {
  tx: IngestionTx;
  provider: YoutubeProvider;
  channelId: string;
  youtubeChannelId: string;
  now?: Date;
}): Promise<IngestionSummary> {
  const now = input.now ?? new Date();
  const channel = await input.provider.getChannel(input.youtubeChannelId);
  await input.tx.youtubeChannel.update({ where: { id: input.channelId }, data: { ...channel, lastFetchedAt: now } });

  if (!channel.uploadsPlaylistId) throw new Error("Channel does not expose an uploads playlist.");

  const page = await input.provider.listPlaylistVideoIds({ playlistId: channel.uploadsPlaylistId, maxResults: VIDEO_BATCH_SIZE });
  const videos = await input.provider.getVideos(page.videoIds);
  const twentyOneDaysAgo = new Date(now);
  twentyOneDaysAgo.setDate(twentyOneDaysAgo.getDate() - 21);
  const recentVideos = videos.filter((video) => video.publishedAt >= twentyOneDaysAgo);

  for (const video of recentVideos) {
    await upsertVideoWithSnapshot(input.tx, input.channelId, video, now);
  }

  return { videosUpserted: recentVideos.length, snapshotsCreated: recentVideos.length, quotaUnitsEstimated: 3 };
}
```

- [ ] **Step 4: Run focused tests and verify pass**

Run: `npm run test -- tests/youtube/ingestion.test.ts`

Expected: PASS.

## Task 4: Job Runner And Quota Guard

**Files:**
- Create: `lib/youtube/ingestion-runner.ts`
- Extend: `tests/youtube/ingestion.test.ts`

- [ ] **Step 1: Add runner tests**

Extend `tests/youtube/ingestion.test.ts` with tests that assert:

```ts
import { assertYoutubeQuotaAvailable, runYoutubeChannelBackfillJob } from "../../lib/youtube/ingestion-runner";

test("assertYoutubeQuotaAvailable rejects jobs beyond the daily limit", async () => {
  const tx = { youtubeQuotaUsage: { aggregate: vi.fn().mockResolvedValue({ _sum: { units: 8999 } }) } } as any;
  await expect(assertYoutubeQuotaAvailable(tx, { requestedUnits: 3, dailyLimit: 9000, now: new Date("2026-05-17T12:00:00Z") })).rejects.toThrow(
    "YouTube quota budget exceeded.",
  );
});

test("runYoutubeChannelBackfillJob logs failed jobs", async () => {
  const prisma = {
    jobRun: { create: vi.fn().mockResolvedValue({ id: "job_1" }), update: vi.fn() },
    youtubeChannel: { findUnique: vi.fn().mockResolvedValue({ id: "channel_1", youtubeChannelId: "UC123" }) },
    $transaction: vi.fn(async (callback) =>
      callback({
        youtubeQuotaUsage: { aggregate: vi.fn().mockResolvedValue({ _sum: { units: 0 } }) },
        youtubeChannel: { update: vi.fn() },
      }),
    ),
  } as any;
  const provider = { getChannel: vi.fn().mockRejectedValue(new Error("provider down")) } as any;

  await expect(runYoutubeChannelBackfillJob({ prisma, provider, channelId: "channel_1" })).rejects.toThrow("provider down");
  expect(prisma.jobRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
});
```

- [ ] **Step 2: Implement runner**

Create `lib/youtube/ingestion-runner.ts`:

```ts
import type { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { backfillChannelVideos, refreshRecentChannelVideos } from "@/lib/youtube/ingestion";
import { YoutubeDataApiProvider, type YoutubeProvider } from "@/lib/youtube/provider";

type RunnerPrisma = PrismaClient;

export async function assertYoutubeQuotaAvailable(
  tx: { youtubeQuotaUsage: { aggregate: Function } },
  input: { requestedUnits: number; dailyLimit: number; now: Date },
) {
  const start = new Date(input.now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const usage = await tx.youtubeQuotaUsage.aggregate({
    where: { quotaDate: { gte: start, lt: end } },
    _sum: { units: true },
  });
  const used = usage._sum.units ?? 0;
  if (used + input.requestedUnits > input.dailyLimit) {
    throw new Error("YouTube quota budget exceeded.");
  }
}

function createDefaultProvider() {
  if (!env.YOUTUBE_DATA_API_KEY) throw new Error("YOUTUBE_DATA_API_KEY is required for YouTube ingestion.");
  return new YoutubeDataApiProvider({ apiKey: env.YOUTUBE_DATA_API_KEY });
}

export async function runYoutubeChannelBackfillJob(input: {
  prisma: RunnerPrisma;
  channelId: string;
  provider?: YoutubeProvider;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const provider = input.provider ?? createDefaultProvider();
  const channel = await input.prisma.youtubeChannel.findUnique({
    where: { id: input.channelId },
    select: { id: true, youtubeChannelId: true, trackedBy: { take: 1, select: { workspaceId: true } } },
  });
  if (!channel) throw new Error("YouTube channel not found.");

  const job = await input.prisma.jobRun.create({
    data: {
      workspaceId: channel.trackedBy[0]?.workspaceId,
      jobType: "youtube_channel_backfill",
      status: "RUNNING",
      provider: "youtube",
      referenceType: "YoutubeChannel",
      referenceId: channel.id,
      attempts: 1,
      startedAt: now,
    },
  });

  try {
    const summary = await input.prisma.$transaction(async (tx) => {
      await assertYoutubeQuotaAvailable(tx, { requestedUnits: 10, dailyLimit: env.YOUTUBE_DAILY_QUOTA_LIMIT, now });
      const result = await backfillChannelVideos({ tx, provider, channelId: channel.id, youtubeChannelId: channel.youtubeChannelId, now });
      await tx.youtubeQuotaUsage.create({
        data: { quotaDate: now, operation: "youtube_channel_backfill", units: result.quotaUnitsEstimated, referenceType: "YoutubeChannel", referenceId: channel.id },
      });
      return result;
    });
    await input.prisma.jobRun.update({
      where: { id: job.id },
      data: { status: "SUCCEEDED", completedAt: new Date(), metadata: summary },
    });
    return summary;
  } catch (error) {
    await input.prisma.jobRun.update({
      where: { id: job.id },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: error instanceof Error ? error.message : "Unknown error" },
    });
    throw error;
  }
}

export async function runYoutubeRecentRefreshJob(input: {
  prisma: RunnerPrisma;
  channelId: string;
  provider?: YoutubeProvider;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const provider = input.provider ?? createDefaultProvider();
  const channel = await input.prisma.youtubeChannel.findUnique({
    where: { id: input.channelId },
    select: { id: true, youtubeChannelId: true, trackedBy: { take: 1, select: { workspaceId: true } } },
  });
  if (!channel) throw new Error("YouTube channel not found.");

  const job = await input.prisma.jobRun.create({
    data: {
      workspaceId: channel.trackedBy[0]?.workspaceId,
      jobType: "youtube_recent_refresh",
      status: "RUNNING",
      provider: "youtube",
      referenceType: "YoutubeChannel",
      referenceId: channel.id,
      attempts: 1,
      startedAt: now,
    },
  });

  try {
    const summary = await input.prisma.$transaction(async (tx) => {
      await assertYoutubeQuotaAvailable(tx, { requestedUnits: 3, dailyLimit: env.YOUTUBE_DAILY_QUOTA_LIMIT, now });
      const result = await refreshRecentChannelVideos({ tx, provider, channelId: channel.id, youtubeChannelId: channel.youtubeChannelId, now });
      await tx.youtubeQuotaUsage.create({
        data: { quotaDate: now, operation: "youtube_recent_refresh", units: result.quotaUnitsEstimated, referenceType: "YoutubeChannel", referenceId: channel.id },
      });
      return result;
    });
    await input.prisma.jobRun.update({ where: { id: job.id }, data: { status: "SUCCEEDED", completedAt: new Date(), metadata: summary } });
    return summary;
  } catch (error) {
    await input.prisma.jobRun.update({
      where: { id: job.id },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: error instanceof Error ? error.message : "Unknown error" },
    });
    throw error;
  }
}
```

- [ ] **Step 3: Run focused tests and fix type issues**

Run: `npm run test -- tests/youtube/ingestion.test.ts`

Expected: PASS after replacing the loose runner test doubles with minimal typed mocks if TypeScript complains.

## Task 5: Hook Backfill To Competitor Add

**Files:**
- Modify: `actions/competitors.ts`
- Extend: `tests/competitors/tracking.test.ts` only if helper behavior changes

- [ ] **Step 1: Queue ingestion job on successful manual add**

In `actions/competitors.ts`, after `addTrackedChannel` succeeds in `addCompetitorChannel`, create a queued job inside the same transaction:

```ts
await tx.jobRun.create({
  data: {
    workspaceId,
    jobType: "youtube_channel_backfill",
    status: "QUEUED",
    provider: "youtube",
    referenceType: "YoutubeChannel",
    referenceId: result.data.channelId,
    attempts: 0,
    maxAttempts: 3,
    metadata: { source: "competitor_manual_add" },
  },
});
```

Use the same pattern after recommendation approval, with `metadata: { source: "competitor_recommendation_approval", recommendationId: recommendation.id }`.

- [ ] **Step 2: Keep actual execution manual for this spec**

Do not add cron, Trigger.dev, or Inngest in this task. Spec 009 owns scheduling and queue execution. Spec 006 only needs job rows plus runner functions that can be invoked by a later scheduler.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

## Task 6: Verification And Tracker Update

**Files:**
- Modify: `context/current-feature.md`

- [ ] **Step 1: Run automated verification**

Run:

```powershell
npm run prisma:validate
npm run test
npm run typecheck
npm run build
```

Expected: all commands pass.

- [ ] **Step 2: Apply migration in the local database when ready**

Run:

```powershell
npm run db:migrate:pg
```

Expected: migration output includes `apply 0006_youtube_ingestion` on first run or `skip 0006_youtube_ingestion` after it has already been applied.

- [ ] **Step 3: Manual smoke with a mocked or real provider**

From a local script or console, call `runYoutubeChannelBackfillJob` with a mocked provider against one existing `YoutubeChannel` id. Verify:

- `YoutubeVideo` rows are created or updated.
- `VideoMetricSnapshot` rows are created.
- `YoutubeChannel.lastFetchedAt` and `YoutubeVideo.lastFetchedAt` are updated.
- `YoutubeQuotaUsage` records estimated quota units.
- `JobRun` status becomes `SUCCEEDED`.

Then force the provider to throw and verify a `JobRun` becomes `FAILED` with `errorMessage`.

- [ ] **Step 4: Update current feature tracker**

Update `context/current-feature.md`:

```md
- **Workflow State:** In Progress
- **Active Phase:** Implementation Planned
- **Implementation Status:** Plan saved; ready to start implementation
```

Add a note under `## Implementation Notes`:

```md
- Implementation plan saved at `docs/superpowers/plans/2026-05-17-youtube-ingestion.md`.
- Verification plan: `npm run prisma:validate`, `npm run test`, `npm run typecheck`, `npm run build`, `npm run db:migrate:pg`, plus mocked-provider job smoke checks for success and failure.
```

## Self-Review

- Spec coverage: channel metadata is Task 2 and Task 3; upload playlist discovery is Task 2; video metadata collection is Task 3; metric snapshots are Task 3; recent 21-day monitoring is Task 3; historical backfill is Task 3; quota protection is Task 1 and Task 4; global cache reuse relies on existing global `YoutubeChannel` and `YoutubeVideo` upserts; job success/failure logging is Task 4 and Task 5.
- Placeholder scan: tasks name exact files, commands, expected results, and concrete implementation snippets.
- Type consistency: `YoutubeProvider`, `YoutubeDataApiProvider`, `backfillChannelVideos`, `refreshRecentChannelVideos`, `runYoutubeChannelBackfillJob`, `runYoutubeRecentRefreshJob`, and `YoutubeQuotaUsage` are used consistently across tasks.
