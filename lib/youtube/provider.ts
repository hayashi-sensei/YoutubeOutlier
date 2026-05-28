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

export type YoutubeVideoSearchResult = {
  youtubeVideoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  publishedAt: Date;
};

export type YoutubePlaylistPage = {
  videoIds: string[];
  nextPageToken?: string;
};

export type YoutubeProvider = {
  getChannel(channelId: string): Promise<YoutubeChannelMetadata>;
  listPlaylistVideoIds(input: {
    playlistId: string;
    pageToken?: string;
    maxResults: number;
  }): Promise<YoutubePlaylistPage>;
  getVideos(videoIds: string[]): Promise<YoutubeVideoMetadata[]>;
};

type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type YoutubeThumbnail = {
  url?: string;
};

type YoutubeThumbnailSet = {
  default?: YoutubeThumbnail;
  medium?: YoutubeThumbnail;
  high?: YoutubeThumbnail;
  standard?: YoutubeThumbnail;
  maxres?: YoutubeThumbnail;
};

type YoutubeChannelApiItem = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    thumbnails?: YoutubeThumbnailSet;
    country?: string;
    customUrl?: string;
  };
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string;
    };
  };
  statistics?: {
    subscriberCount?: string;
    videoCount?: string;
    viewCount?: string;
  };
};

type YoutubeChannelsApiResponse = {
  items?: YoutubeChannelApiItem[];
};

type YoutubePlaylistItemApiItem = {
  contentDetails?: {
    videoId?: string;
  };
};

type YoutubePlaylistItemsApiResponse = {
  items?: YoutubePlaylistItemApiItem[];
  nextPageToken?: string;
};

type YoutubeVideoApiItem = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: YoutubeThumbnailSet;
    tags?: string[];
    categoryId?: string;
    defaultLanguage?: string;
  };
  contentDetails?: {
    duration?: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
};

type YoutubeVideosApiResponse = {
  items?: YoutubeVideoApiItem[];
};

type YoutubeSearchApiItem = {
  id?: {
    videoId?: string;
  };
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    title?: string;
    publishedAt?: string;
  };
};

type YoutubeSearchApiResponse = {
  items?: YoutubeSearchApiItem[];
};

export function parseYoutubeDuration(value: string): number | undefined {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) {
    return undefined;
  }

  const [, hours = "0", minutes = "0", seconds = "0"] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function optionalBigInt(value: string | undefined): bigint | undefined {
  if (!value) {
    return undefined;
  }

  return BigInt(value);
}

function optionalNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  return Number(value);
}

function bestThumbnailUrl(thumbnails: YoutubeThumbnailSet | undefined) {
  return (
    thumbnails?.maxres?.url ??
    thumbnails?.standard?.url ??
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function getErrorMessage(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    value.error &&
    typeof value.error === "object" &&
    "message" in value.error &&
    typeof value.error.message === "string"
  ) {
    return value.error.message;
  }

  return undefined;
}

function parseVideoPublishedAt(videoId: string, value: string | undefined) {
  if (!value) {
    throw new Error(
      `YouTube provider parsing error: video ${videoId} has missing snippet.publishedAt`,
    );
  }

  const publishedAt = new Date(value);
  if (Number.isNaN(publishedAt.getTime())) {
    throw new Error(
      `YouTube provider parsing error: video ${videoId} has malformed snippet.publishedAt`,
    );
  }

  return publishedAt;
}

export class YoutubeDataApiProvider implements YoutubeProvider {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchImpl;
  private readonly baseUrl: string;

  constructor(input: {
    apiKey: string;
    fetchImpl?: FetchImpl;
    baseUrl?: string;
  }) {
    this.apiKey = input.apiKey;
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.baseUrl = input.baseUrl ?? "https://www.googleapis.com/youtube/v3";
  }

  async getChannel(channelId: string): Promise<YoutubeChannelMetadata> {
    const url = this.channelLookupUrl(channelId);

    const json = await this.getJson<YoutubeChannelsApiResponse>(url);
    const item = json.items?.[0];
    if (!item?.id) {
      throw new Error(`YouTube channel not found: ${channelId}`);
    }

    return {
      youtubeChannelId: item.id,
      handle: item.snippet?.customUrl,
      title: item.snippet?.title ?? item.id,
      description: item.snippet?.description,
      thumbnailUrl: bestThumbnailUrl(item.snippet?.thumbnails),
      subscriberCount: optionalBigInt(item.statistics?.subscriberCount),
      videoCount: optionalNumber(item.statistics?.videoCount),
      viewCount: optionalBigInt(item.statistics?.viewCount),
      uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads,
      country: item.snippet?.country,
    };
  }

  private channelLookupUrl(channelId: string): URL {
    const url = new URL(`${this.baseUrl}/channels`);
    url.searchParams.set("part", "snippet,contentDetails,statistics");
    url.searchParams.set("key", this.apiKey);

    if (channelId.startsWith("handle:")) {
      url.searchParams.set("forHandle", `@${channelId.slice("handle:".length)}`);
      return url;
    }

    if (channelId.startsWith("user:")) {
      url.searchParams.set("forUsername", channelId.slice("user:".length));
      return url;
    }

    url.searchParams.set("id", channelId);
    return url;
  }

  async listPlaylistVideoIds(input: {
    playlistId: string;
    pageToken?: string;
    maxResults: number;
  }): Promise<YoutubePlaylistPage> {
    const url = new URL(`${this.baseUrl}/playlistItems`);
    url.searchParams.set("part", "contentDetails");
    url.searchParams.set("playlistId", input.playlistId);
    url.searchParams.set("maxResults", String(input.maxResults));
    url.searchParams.set("key", this.apiKey);
    if (input.pageToken) {
      url.searchParams.set("pageToken", input.pageToken);
    }

    const json = await this.getJson<YoutubePlaylistItemsApiResponse>(url);

    return {
      videoIds: (json.items ?? [])
        .map((item) => item.contentDetails?.videoId)
        .filter(isString),
      nextPageToken: json.nextPageToken,
    };
  }

  async getVideos(videoIds: string[]): Promise<YoutubeVideoMetadata[]> {
    if (videoIds.length === 0) {
      return [];
    }
    if (videoIds.length > 50) {
      throw new Error(
        `YouTube videos.list accepts at most 50 video ids per request; received ${videoIds.length}`,
      );
    }

    const url = new URL(`${this.baseUrl}/videos`);
    url.searchParams.set("part", "snippet,contentDetails,statistics");
    url.searchParams.set("id", videoIds.join(","));
    url.searchParams.set("key", this.apiKey);

    const json = await this.getJson<YoutubeVideosApiResponse>(url);

    return (json.items ?? [])
      .filter((item): item is YoutubeVideoApiItem & { id: string } =>
        Boolean(item.id),
      )
      .map((item) => ({
        youtubeVideoId: item.id,
        title: item.snippet?.title ?? item.id,
        description: item.snippet?.description,
        publishedAt: parseVideoPublishedAt(
          item.id,
          item.snippet?.publishedAt,
        ),
        durationSeconds: item.contentDetails?.duration
          ? parseYoutubeDuration(item.contentDetails.duration)
          : undefined,
        thumbnailUrl: bestThumbnailUrl(item.snippet?.thumbnails),
        tags: item.snippet?.tags ?? [],
        categoryId: item.snippet?.categoryId,
        defaultLanguage: item.snippet?.defaultLanguage,
        viewCount: optionalBigInt(item.statistics?.viewCount),
        likeCount: optionalBigInt(item.statistics?.likeCount),
        commentCount: optionalBigInt(item.statistics?.commentCount),
      }));
  }

  async searchVideos(input: { query: string; maxResults: number }): Promise<YoutubeVideoSearchResult[]> {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("q", input.query);
    url.searchParams.set("type", "video");
    url.searchParams.set("order", "relevance");
    url.searchParams.set("maxResults", String(input.maxResults));
    url.searchParams.set("key", this.apiKey);

    const json = await this.getJson<YoutubeSearchApiResponse>(url);

    return (json.items ?? [])
      .map((item) => {
        const videoId = item.id?.videoId;
        const channelId = item.snippet?.channelId;
        const publishedAt = item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : null;

        if (!videoId || !channelId || !publishedAt || Number.isNaN(publishedAt.getTime())) {
          return null;
        }

        return {
          youtubeVideoId: videoId,
          channelId,
          channelTitle: item.snippet?.channelTitle ?? channelId,
          title: item.snippet?.title ?? videoId,
          publishedAt,
        };
      })
      .filter((item): item is YoutubeVideoSearchResult => item !== null);
  }

  private async getJson<TResponse>(url: URL): Promise<TResponse> {
    const response = await this.fetchImpl(url.toString());

    if (!response.ok) {
      const json = await response.json().catch(() => undefined);
      const message = getErrorMessage(json);
      throw new Error(
        message
          ? `YouTube API request failed with ${response.status}: ${message}`
          : `YouTube API request failed with ${response.status}`,
      );
    }

    const json = (await response.json()) as unknown;
    return json as TResponse;
  }
}
