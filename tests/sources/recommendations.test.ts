import { describe, expect, test } from "vitest";

import { recommendIndustrySources } from "../../lib/sources/recommendations";

describe("recommendIndustrySources", () => {
  test("returns AI and automation source suggestions from niche text", () => {
    expect(
      recommendIndustrySources({
        primaryNiche: "AI automation for creators and digital marketers",
        existingUrls: new Set(["https://openai.com/news/"]),
      }),
    ).toEqual([
      expect.objectContaining({
        url: "https://news.ycombinator.com/rss",
        reason: expect.stringContaining("AI"),
      }),
      expect.objectContaining({
        url: "https://zapier.com/blog/feeds/latest/",
        reason: expect.stringContaining("automation"),
      }),
    ]);
  });

  test("filters out already tracked URLs", () => {
    const recommendations = recommendIndustrySources({
      primaryNiche: "AI",
      existingUrls: new Set(["https://news.ycombinator.com/rss"]),
    });

    expect(recommendations.map((recommendation) => recommendation.url)).not.toContain(
      "https://news.ycombinator.com/rss",
    );
  });
});
