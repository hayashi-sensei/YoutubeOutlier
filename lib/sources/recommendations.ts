export type IndustrySourceRecommendation = {
  url: string;
  name: string;
  reason: string;
};

const SOURCE_CATALOG: Array<IndustrySourceRecommendation & { keywords: string[] }> = [
  {
    url: "https://news.ycombinator.com/rss",
    name: "Hacker News",
    reason: "Broad early signal for AI, developer tools, and startup narratives.",
    keywords: ["ai", "automation", "software", "startup", "developer", "saas"],
  },
  {
    url: "https://zapier.com/blog/feeds/latest/",
    name: "Zapier Blog",
    reason: "Useful automation workflows and no-code operations topics.",
    keywords: ["automation", "no-code", "nocode", "workflow", "marketing"],
  },
  {
    url: "https://openai.com/news/rss.xml",
    name: "OpenAI News",
    reason: "Primary AI product and research announcements.",
    keywords: ["ai", "agents", "openai", "automation"],
  },
  {
    url: "https://www.marketingbrew.com/feed",
    name: "Marketing Brew",
    reason: "Marketing trend coverage that can become creator/business content angles.",
    keywords: ["marketing", "brand", "creator", "social"],
  },
];

export function recommendIndustrySources(input: {
  primaryNiche: string;
  existingUrls: Set<string>;
  limit?: number;
}): IndustrySourceRecommendation[] {
  const niche = input.primaryNiche.toLowerCase();
  const limit = input.limit ?? 2;
  const normalizedExistingUrls = new Set(
    Array.from(input.existingUrls).map(normalizeSourceUrl),
  );

  return SOURCE_CATALOG.filter((source) => !normalizedExistingUrls.has(normalizeSourceUrl(source.url)))
    .map((source) => ({
      source,
      score: source.keywords.filter((keyword) => niche.includes(keyword)).length,
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ source }) => ({
      url: source.url,
      name: source.name,
      reason: source.reason,
    }));
}

function normalizeSourceUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    const pathname = url.pathname.replace(/\/(rss\.xml|feed\.xml)?$/i, "");
    url.pathname = pathname || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.toLowerCase().replace(/\/$/, "");
  }
}
