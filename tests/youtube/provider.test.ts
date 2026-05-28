import { describe, expect, test, vi } from "vitest";

import {
  parseYoutubeDuration,
  YoutubeDataApiProvider,
} from "../../lib/youtube/provider";

describe("parseYoutubeDuration", () => {
  test("parses ISO 8601 YouTube durations into seconds", () => {
    expect(parseYoutubeDuration("PT1H2M3S")).toBe(3723);
    expect(parseYoutubeDuration("PT15M")).toBe(900);
    expect(parseYoutubeDuration("PT45S")).toBe(45);
    expect(parseYoutubeDuration("PT0S")).toBe(0);
  });

  test("returns undefined for unsupported duration values", () => {
    expect(parseYoutubeDuration("P1DT2H")).toBeUndefined();
    expect(parseYoutubeDuration("not-a-duration")).toBeUndefined();
  });
});

describe("YoutubeDataApiProvider", () => {
  test("lists playlist video ids and preserves the next page token", async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            items: [
              { contentDetails: { videoId: "video-1" } },
              { contentDetails: { videoId: "video-2" } },
              { contentDetails: {} },
            ],
            nextPageToken: "next-page",
          }),
          { status: 200 },
        ),
    );
    const provider = new YoutubeDataApiProvider({ apiKey: "key", fetchImpl });

    await expect(
      provider.listPlaylistVideoIds({
        playlistId: "uploads",
        pageToken: "page-1",
        maxResults: 50,
      }),
    ).resolves.toEqual({
      videoIds: ["video-1", "video-2"],
      nextPageToken: "next-page",
    });

    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/youtube/v3/playlistItems");
    expect(requestedUrl.searchParams.get("part")).toBe("contentDetails");
    expect(requestedUrl.searchParams.get("playlistId")).toBe("uploads");
    expect(requestedUrl.searchParams.get("pageToken")).toBe("page-1");
    expect(requestedUrl.searchParams.get("maxResults")).toBe("50");
    expect(requestedUrl.searchParams.get("key")).toBe("key");
  });

  test("fetches channel metadata with contentDetails and statistics parts", async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: "UC123",
                snippet: {
                  title: "Creator",
                  description: "Desc",
                  thumbnails: {
                    default: { url: "small.jpg" },
                    high: { url: "thumb.jpg" },
                  },
                  country: "US",
                  customUrl: "@creator",
                },
                contentDetails: {
                  relatedPlaylists: { uploads: "UU123" },
                },
                statistics: {
                  subscriberCount: "1000",
                  videoCount: "25",
                  viewCount: "9000",
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const provider = new YoutubeDataApiProvider({ apiKey: "key", fetchImpl });

    await expect(provider.getChannel("UC123")).resolves.toEqual({
      youtubeChannelId: "UC123",
      handle: "@creator",
      title: "Creator",
      description: "Desc",
      thumbnailUrl: "thumb.jpg",
      subscriberCount: BigInt(1000),
      videoCount: 25,
      viewCount: BigInt(9000),
      uploadsPlaylistId: "UU123",
      country: "US",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/youtube/v3/channels");
    expect(requestedUrl.searchParams.get("part")).toBe(
      "snippet,contentDetails,statistics",
    );
    expect(requestedUrl.searchParams.get("id")).toBe("UC123");
    expect(requestedUrl.searchParams.get("key")).toBe("key");
  });

  test("resolves stored handle placeholders with channels.list forHandle", async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: "UCResolved",
                snippet: {
                  title: "Resolved Creator",
                  customUrl: "@creator",
                },
                contentDetails: {
                  relatedPlaylists: { uploads: "UUResolved" },
                },
                statistics: {},
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const provider = new YoutubeDataApiProvider({ apiKey: "key", fetchImpl });

    await expect(provider.getChannel("handle:creator")).resolves.toMatchObject({
      youtubeChannelId: "UCResolved",
      handle: "@creator",
      title: "Resolved Creator",
      uploadsPlaylistId: "UUResolved",
    });

    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/youtube/v3/channels");
    expect(requestedUrl.searchParams.get("forHandle")).toBe("@creator");
    expect(requestedUrl.searchParams.has("id")).toBe(false);
    expect(requestedUrl.searchParams.get("key")).toBe("key");
  });

  test("fetches video metadata for up to 50 ids", async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: "video-1",
                snippet: {
                  title: "Video title",
                  description: "Video desc",
                  publishedAt: "2026-05-15T12:30:00Z",
                  thumbnails: {
                    medium: { url: "medium.jpg" },
                    maxres: { url: "max.jpg" },
                  },
                  tags: ["one", "two"],
                  categoryId: "24",
                  defaultLanguage: "en",
                },
                contentDetails: { duration: "PT2M3S" },
                statistics: {
                  viewCount: "1234",
                  likeCount: "56",
                  commentCount: "7",
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const provider = new YoutubeDataApiProvider({ apiKey: "key", fetchImpl });

    await expect(provider.getVideos(["video-1"])).resolves.toEqual([
      {
        youtubeVideoId: "video-1",
        title: "Video title",
        description: "Video desc",
        publishedAt: new Date("2026-05-15T12:30:00Z"),
        durationSeconds: 123,
        thumbnailUrl: "max.jpg",
        tags: ["one", "two"],
        categoryId: "24",
        defaultLanguage: "en",
        viewCount: BigInt(1234),
        likeCount: BigInt(56),
        commentCount: BigInt(7),
      },
    ]);

    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/youtube/v3/videos");
    expect(requestedUrl.searchParams.get("part")).toBe(
      "snippet,contentDetails,statistics",
    );
    expect(requestedUrl.searchParams.get("id")).toBe("video-1");
    expect(requestedUrl.searchParams.get("key")).toBe("key");
  });

  test("searches videos and returns channel candidates", async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: { videoId: "video-1" },
                snippet: {
                  channelId: "UC123",
                  channelTitle: "Creator Lab",
                  title: "AI workflow tutorial",
                  publishedAt: "2026-05-19T10:00:00Z",
                },
              },
              {
                id: {},
                snippet: { title: "Missing video id" },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const provider = new YoutubeDataApiProvider({ apiKey: "key", fetchImpl });

    await expect(provider.searchVideos({ query: "ai workflow", maxResults: 10 })).resolves.toEqual([
      {
        youtubeVideoId: "video-1",
        channelId: "UC123",
        channelTitle: "Creator Lab",
        title: "AI workflow tutorial",
        publishedAt: new Date("2026-05-19T10:00:00Z"),
      },
    ]);

    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/youtube/v3/search");
    expect(requestedUrl.searchParams.get("part")).toBe("snippet");
    expect(requestedUrl.searchParams.get("type")).toBe("video");
    expect(requestedUrl.searchParams.get("order")).toBe("relevance");
    expect(requestedUrl.searchParams.get("q")).toBe("ai workflow");
    expect(requestedUrl.searchParams.get("maxResults")).toBe("10");
    expect(requestedUrl.searchParams.get("key")).toBe("key");
  });

  test("returns no videos and skips fetch when no ids are requested", async () => {
    const fetchImpl = vi.fn();
    const provider = new YoutubeDataApiProvider({ apiKey: "key", fetchImpl });

    await expect(provider.getVideos([])).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("preserves HTTP status when a non-ok response body is not JSON", async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response("service unavailable", { status: 503 }),
    );
    const provider = new YoutubeDataApiProvider({ apiKey: "key", fetchImpl });

    await expect(provider.getChannel("UC123")).rejects.toThrow(
      "YouTube API request failed with 503",
    );
  });

  test("rejects videos with missing publishedAt as a provider parsing error", async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: "video-missing-date",
                snippet: { title: "Missing date" },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const provider = new YoutubeDataApiProvider({ apiKey: "key", fetchImpl });

    await expect(provider.getVideos(["video-missing-date"])).rejects.toThrow(
      "YouTube provider parsing error: video video-missing-date has missing snippet.publishedAt",
    );
  });

  test("rejects videos with malformed publishedAt as a provider parsing error", async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: "video-bad-date",
                snippet: {
                  title: "Bad date",
                  publishedAt: "not-a-date",
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const provider = new YoutubeDataApiProvider({ apiKey: "key", fetchImpl });

    await expect(provider.getVideos(["video-bad-date"])).rejects.toThrow(
      "YouTube provider parsing error: video video-bad-date has malformed snippet.publishedAt",
    );
  });

  test("rejects more than 50 video ids before calling YouTube", async () => {
    const fetchImpl = vi.fn();
    const provider = new YoutubeDataApiProvider({ apiKey: "key", fetchImpl });
    const videoIds = Array.from({ length: 51 }, (_, index) => `video-${index}`);

    await expect(provider.getVideos(videoIds)).rejects.toThrow(
      "YouTube videos.list accepts at most 50 video ids per request; received 51",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
