import type {
  YoutubeChannelMetadata,
  YoutubeProvider,
  YoutubeVideoMetadata,
} from "./provider";

const BACKFILL_MAX_VIDEOS = 100;
const BACKFILL_MONTHS = 12;
const RECENT_REFRESH_DAYS = 21;
const YOUTUBE_PAGE_SIZE = 50;
const MIN_CACHEABLE_DURATION_SECONDS = 90;

type ChannelRecord = {
  id: string;
};

type VideoRecord = {
  id: string;
};

type YoutubeChannelWrite = {
  update(input: {
    where: { id: string };
    data: YoutubeChannelWriteInput;
  }): Promise<ChannelRecord>;
};

type YoutubeVideoWrite = {
  upsert(input: {
    where: { youtubeVideoId: string };
    create: YoutubeVideoWriteInput;
    update: YoutubeVideoWriteUpdateInput;
  }): Promise<VideoRecord>;
  deleteMany(input: {
    where: {
      youtubeChannelId: string;
      durationSeconds: { lt: number };
    };
  }): Promise<{ count: number }>;
};

type VideoMetricSnapshotWrite = {
  create(input: { data: VideoMetricSnapshotWriteInput }): Promise<unknown>;
};

export type YoutubeIngestionTx = {
  youtubeChannel: YoutubeChannelWrite;
  youtubeVideo: YoutubeVideoWrite;
  videoMetricSnapshot: VideoMetricSnapshotWrite;
};

type YoutubeChannelWriteInput = {
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
  lastFetchedAt: Date;
};

type YoutubeVideoWriteInput = {
  youtubeVideoId: string;
  youtubeChannelId: string;
  title: string;
  description?: string;
  publishedAt: Date;
  durationSeconds?: number;
  thumbnailUrl?: string;
  tags: string[];
  categoryId?: string;
  defaultLanguage?: string;
  lastFetchedAt: Date;
};

type YoutubeVideoWriteUpdateInput = Omit<
  YoutubeVideoWriteInput,
  "youtubeVideoId" | "youtubeChannelId"
>;

type VideoMetricSnapshotWriteInput = {
  youtubeVideoId: string;
  viewCount?: bigint;
  likeCount?: bigint;
  commentCount?: bigint;
  capturedAt: Date;
};

export type YoutubeIngestionSummary = {
  channelId: string;
  uploadsPlaylistId: string;
  playlistPagesFetched: number;
  videosDiscovered: number;
  videosFetched: number;
  videosIncluded: number;
  videosUpserted: number;
  metricSnapshotsCreated: number;
  estimatedQuotaUnits: number;
};

export type BackfillChannelVideosInput = {
  tx: YoutubeIngestionTx;
  provider: YoutubeProvider;
  channelId: string;
  youtubeChannelId: string;
  now?: Date;
};

export type RefreshRecentChannelVideosInput = BackfillChannelVideosInput;

export type ShouldIncludeBackfillVideoInput = {
  publishedAt: Date;
  includedCount: number;
  now?: Date;
};

export function isCacheableYoutubeVideo(
  video: Pick<YoutubeVideoMetadata, "durationSeconds">,
): boolean {
  return (
    typeof video.durationSeconds !== "number" ||
    video.durationSeconds >= MIN_CACHEABLE_DURATION_SECONDS
  );
}

export function shouldIncludeBackfillVideo(
  input: ShouldIncludeBackfillVideoInput,
): boolean {
  if (input.includedCount >= BACKFILL_MAX_VIDEOS) {
    return false;
  }

  return input.publishedAt >= monthsAgo(input.now ?? new Date(), BACKFILL_MONTHS);
}

export async function backfillChannelVideos(
  input: BackfillChannelVideosInput,
): Promise<YoutubeIngestionSummary> {
  return ingestChannelVideos({
    ...input,
    mode: "backfill",
    includeVideo: (video, includedCount, now) =>
      shouldIncludeBackfillVideo({
        publishedAt: video.publishedAt,
        includedCount,
        now,
      }),
    shouldContinueAfterPage: (videos, includedCount, now) =>
      includedCount < BACKFILL_MAX_VIDEOS &&
      videos.every((video) =>
        shouldIncludeBackfillVideo({
          publishedAt: video.publishedAt,
          includedCount,
          now,
        }),
      ),
  });
}

export async function refreshRecentChannelVideos(
  input: RefreshRecentChannelVideosInput,
): Promise<YoutubeIngestionSummary> {
  const now = input.now ?? new Date();
  const recentCutoff = daysAgo(now, RECENT_REFRESH_DAYS);

  return ingestChannelVideos({
    ...input,
    now,
    mode: "recent",
    includeVideo: (video) => video.publishedAt >= recentCutoff,
    shouldContinueAfterPage: (videos) =>
      videos.length > 0 &&
      videos.every((video) => video.publishedAt >= recentCutoff),
  });
}

type IngestChannelVideosInput = BackfillChannelVideosInput & {
  mode: "backfill" | "recent";
  includeVideo: (
    video: YoutubeVideoMetadata,
    includedCount: number,
    now: Date,
  ) => boolean;
  shouldContinueAfterPage: (
    videos: YoutubeVideoMetadata[],
    includedCount: number,
    now: Date,
  ) => boolean;
};

async function ingestChannelVideos(
  input: IngestChannelVideosInput,
): Promise<YoutubeIngestionSummary> {
  const now = input.now ?? new Date();
  const channelMetadata = await input.provider.getChannel(input.youtubeChannelId);
  if (!channelMetadata.uploadsPlaylistId) {
    throw new Error(
      `YouTube channel ${input.youtubeChannelId} is missing an uploads playlist.`,
    );
  }

  await input.tx.youtubeChannel.update({
    where: { id: input.channelId },
    data: channelWriteInput(channelMetadata, now),
  });
  await deleteShortCachedVideos(input.tx, input.channelId);

  let pageToken: string | undefined;
  let playlistPagesFetched = 0;
  let videosDiscovered = 0;
  let videosFetched = 0;
  let videosIncluded = 0;
  let videosUpserted = 0;
  let metricSnapshotsCreated = 0;
  let videoBatchCalls = 0;
  let shouldFetchNextPage = true;

  while (shouldFetchNextPage) {
    const page = await input.provider.listPlaylistVideoIds({
      playlistId: channelMetadata.uploadsPlaylistId,
      pageToken,
      maxResults: YOUTUBE_PAGE_SIZE,
    });

    playlistPagesFetched += 1;
    videosDiscovered += page.videoIds.length;
    const videos = await input.provider.getVideos(page.videoIds);
    if (page.videoIds.length > 0) {
      videoBatchCalls += 1;
    }
    videosFetched += videos.length;

    for (const video of videos) {
      if (!isCacheableYoutubeVideo(video)) {
        continue;
      }

      if (!input.includeVideo(video, videosIncluded, now)) {
        continue;
      }

      await upsertVideoWithSnapshot({
        tx: input.tx,
        channelId: input.channelId,
        video,
        capturedAt: now,
      });
      videosIncluded += 1;
      videosUpserted += 1;
      metricSnapshotsCreated += 1;
    }

    shouldFetchNextPage =
      Boolean(page.nextPageToken) &&
      input.shouldContinueAfterPage(videos, videosIncluded, now);
    pageToken = page.nextPageToken;
  }

  return {
    channelId: input.channelId,
    uploadsPlaylistId: channelMetadata.uploadsPlaylistId,
    playlistPagesFetched,
    videosDiscovered,
    videosFetched,
    videosIncluded,
    videosUpserted,
    metricSnapshotsCreated,
    estimatedQuotaUnits:
      1 + playlistPagesFetched + videoBatchCalls,
  };
}

async function deleteShortCachedVideos(
  tx: YoutubeIngestionTx,
  channelId: string,
): Promise<void> {
  await tx.youtubeVideo.deleteMany({
    where: {
      youtubeChannelId: channelId,
      durationSeconds: { lt: MIN_CACHEABLE_DURATION_SECONDS },
    },
  });
}

async function upsertVideoWithSnapshot(input: {
  tx: YoutubeIngestionTx;
  channelId: string;
  video: YoutubeVideoMetadata;
  capturedAt: Date;
}): Promise<void> {
  const video = await input.tx.youtubeVideo.upsert({
    where: { youtubeVideoId: input.video.youtubeVideoId },
    create: videoCreateInput(input.video, input.channelId, input.capturedAt),
    update: videoUpdateInput(input.video, input.capturedAt),
  });

  await input.tx.videoMetricSnapshot.create({
    data: {
      youtubeVideoId: video.id,
      viewCount: input.video.viewCount,
      likeCount: input.video.likeCount,
      commentCount: input.video.commentCount,
      capturedAt: input.capturedAt,
    },
  });
}

function channelWriteInput(
  metadata: YoutubeChannelMetadata,
  lastFetchedAt: Date,
): YoutubeChannelWriteInput {
  return {
    youtubeChannelId: metadata.youtubeChannelId,
    handle: metadata.handle,
    title: metadata.title,
    description: metadata.description,
    thumbnailUrl: metadata.thumbnailUrl,
    subscriberCount: metadata.subscriberCount,
    videoCount: metadata.videoCount,
    viewCount: metadata.viewCount,
    uploadsPlaylistId: metadata.uploadsPlaylistId,
    country: metadata.country,
    lastFetchedAt,
  };
}

function videoCreateInput(
  metadata: YoutubeVideoMetadata,
  youtubeChannelId: string,
  lastFetchedAt: Date,
): YoutubeVideoWriteInput {
  return {
    youtubeVideoId: metadata.youtubeVideoId,
    youtubeChannelId,
    ...videoUpdateInput(metadata, lastFetchedAt),
  };
}

function videoUpdateInput(
  metadata: YoutubeVideoMetadata,
  lastFetchedAt: Date,
): YoutubeVideoWriteUpdateInput {
  return {
    title: metadata.title,
    description: metadata.description,
    publishedAt: metadata.publishedAt,
    durationSeconds: metadata.durationSeconds,
    thumbnailUrl: metadata.thumbnailUrl,
    tags: metadata.tags,
    categoryId: metadata.categoryId,
    defaultLanguage: metadata.defaultLanguage,
    lastFetchedAt,
  };
}

function daysAgo(now: Date, days: number): Date {
  const result = new Date(now);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

function monthsAgo(now: Date, months: number): Date {
  const result = new Date(now);
  result.setUTCMonth(result.getUTCMonth() - months);
  return result;
}
