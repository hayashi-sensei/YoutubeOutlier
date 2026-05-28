import { describe, expect, test } from "vitest";
import { parseYoutubeChannelUrl } from "../../lib/youtube/channel-url";

describe("parseYoutubeChannelUrl", () => {
  test("parses canonical channel URLs", () => {
    expect(parseYoutubeChannelUrl("https://www.youtube.com/channel/UCabc123XYZ")).toEqual({
      type: "channelId",
      value: "UCabc123XYZ",
      canonicalUrl: "https://www.youtube.com/channel/UCabc123XYZ",
    });
  });

  test("parses handle URLs and normalizes casing", () => {
    expect(parseYoutubeChannelUrl("https://youtube.com/@AIAutomationLab/videos")).toEqual({
      type: "handle",
      value: "@aiautomationlab",
      canonicalUrl: "https://www.youtube.com/@aiautomationlab",
    });
  });

  test("parses legacy custom and user URLs", () => {
    expect(parseYoutubeChannelUrl("https://www.youtube.com/c/CreatorScience")).toMatchObject({
      type: "custom",
      value: "CreatorScience",
    });
    expect(parseYoutubeChannelUrl("https://www.youtube.com/user/oldschoolcreator")).toMatchObject({
      type: "user",
      value: "oldschoolcreator",
    });
  });

  test("rejects non-youtube and video URLs", () => {
    expect(() => parseYoutubeChannelUrl("https://example.com/@AIAutomationLab")).toThrow("Enter a valid YouTube channel URL.");
    expect(() => parseYoutubeChannelUrl("https://www.youtube.com/watch?v=abc")).toThrow("Enter a YouTube channel URL, not a video or playlist URL.");
  });

  test("rejects malformed handles and unsupported protocols", () => {
    expect(() => parseYoutubeChannelUrl("https://www.youtube.com/@")).toThrow("Enter a valid YouTube channel URL.");
    expect(() => parseYoutubeChannelUrl("ftp://www.youtube.com/@creator")).toThrow("Enter a valid YouTube channel URL.");
  });
});
