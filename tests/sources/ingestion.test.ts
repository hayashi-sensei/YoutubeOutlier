import { describe, expect, test, vi } from "vitest";

import {
  detectRssFeedUrl,
  HttpSourceFetchProvider,
  ingestIndustrySource,
  parseHtmlSourceItems,
  parseRssItems,
  type IndustrySourceIngestionTx,
  type SourceFetchProvider,
} from "../../lib/sources/ingestion";

const NOW = new Date("2026-05-17T12:00:00.000Z");

describe("HttpSourceFetchProvider", () => {
  test("rejects localhost and private network URLs before fetching", async () => {
    const fetchImpl = vi.fn();
    const provider = new HttpSourceFetchProvider({ fetchImpl });

    await expect(provider.fetchText("http://127.0.0.1:3000/internal")).rejects.toThrow("private or local network");
    await expect(provider.fetchText("http://localhost:3000/internal")).rejects.toThrow("private or local network");
    await expect(provider.fetchText("http://169.254.169.254/latest/meta-data")).rejects.toThrow("private or local network");
    await expect(provider.fetchText("http://[::ffff:127.0.0.1]/internal")).rejects.toThrow("private or local network");
    await expect(provider.fetchText("http://[::ffff:10.0.0.1]/internal")).rejects.toThrow("private or local network");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("rejects unsupported protocols and oversized responses", async () => {
    const provider = new HttpSourceFetchProvider({
      maxResponseBytes: 8,
      fetchImpl: vi.fn(async () => new Response("0123456789", { status: 200 })),
    });

    await expect(provider.fetchText("file:///etc/passwd")).rejects.toThrow("http or https");
    await expect(provider.fetchText("https://example.com/feed.xml")).rejects.toThrow("exceeded");
  });
});

describe("detectRssFeedUrl", () => {
  test("resolves relative RSS alternate links from an HTML page", () => {
    expect(
      detectRssFeedUrl({
        pageUrl: "https://example.com/blog",
        html: '<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head></html>',
      }),
    ).toBe("https://example.com/feed.xml");
  });

  test("returns the page URL when the response is already RSS", () => {
    expect(
      detectRssFeedUrl({
        pageUrl: "https://example.com/rss.xml",
        contentType: "application/rss+xml; charset=utf-8",
        html: "<rss></rss>",
      }),
    ).toBe("https://example.com/rss.xml");
  });
});

describe("parseRssItems", () => {
  test("parses RSS item title, link, author, summary, and publish date", () => {
    const items = parseRssItems({
      feedUrl: "https://example.com/feed.xml",
      xml: `
        <rss>
          <channel>
            <item>
              <title>AI workflow launch</title>
              <link>https://example.com/posts/ai-workflow</link>
              <author>editor@example.com</author>
              <description><![CDATA[New agent workflow patterns.]]></description>
              <pubDate>Sun, 17 May 2026 10:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>
      `,
    });

    expect(items).toEqual([
      {
        url: "https://example.com/posts/ai-workflow",
        title: "AI workflow launch",
        author: "editor@example.com",
        summary: "New agent workflow patterns.",
        contentText: undefined,
        publishedAt: new Date("2026-05-17T10:00:00.000Z"),
        contentHash: expect.any(String),
      },
    ]);
  });
});

describe("parseHtmlSourceItems", () => {
  test("extracts article links from a news landing page when RSS is unavailable", () => {
    const items = parseHtmlSourceItems({
      pageUrl: "https://example.com/news",
      html: `
        <main>
          <a href="/news/agent-launch">Agent launch</a>
          <a href="https://example.com/research/model-update">Model update</a>
          <a href="/about">About</a>
        </main>
      `,
    });

    expect(items).toEqual([
      expect.objectContaining({
        url: "https://example.com/news/agent-launch",
        title: "Agent launch",
      }),
      expect.objectContaining({
        url: "https://example.com/research/model-update",
        title: "Model update",
      }),
    ]);
  });

  test("skips page anchors and generic navigation links", () => {
    const items = parseHtmlSourceItems({
      pageUrl: "https://example.com/blog/",
      html: `
        <a href="#page-content">Skip to main content</a>
        <a href="/research/">Explore research</a>
        <a href="/blog/agent-launch/">Agent launch</a>
      `,
    });

    expect(items).toEqual([
      expect.objectContaining({
        url: "https://example.com/blog/agent-launch/",
        title: "Agent launch",
      }),
    ]);
  });
});

describe("ingestIndustrySource", () => {
  test("detects RSS from a page, stores new items, skips duplicates, and updates freshness", async () => {
    const tx = createTx({
      existingUrls: new Set(["https://example.com/posts/existing"]),
    });
    const provider = createProvider({
      "https://example.com/blog": {
        contentType: "text/html",
        body: '<link rel="alternate" type="application/rss+xml" href="/feed.xml">',
      },
      "https://example.com/feed.xml": {
        contentType: "application/rss+xml",
        body: `
          <rss><channel>
            <item><title>Existing</title><link>https://example.com/posts/existing</link></item>
            <item><title>Fresh</title><link>https://example.com/posts/fresh</link><description>Useful source item.</description></item>
          </channel></rss>
        `,
      },
    });

    const summary = await ingestIndustrySource({
      tx,
      provider,
      source: {
        id: "source-1",
        url: "https://example.com/blog",
        rssUrl: null,
      },
      now: NOW,
    });

    expect(provider.fetchText).toHaveBeenCalledWith("https://example.com/blog");
    expect(provider.fetchText).toHaveBeenCalledWith("https://example.com/feed.xml");
    expect(tx.industrySourceItem.create).toHaveBeenCalledTimes(1);
    expect(tx.industrySourceItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceId: "source-1",
        url: "https://example.com/posts/fresh",
        title: "Fresh",
        summary: "Useful source item.",
      }),
    });
    expect(tx.industrySource.update).toHaveBeenCalledWith({
      where: { id: "source-1" },
      data: {
        rssUrl: "https://example.com/feed.xml",
        lastFetchedAt: NOW,
      },
    });
    expect(summary).toEqual({
      sourceId: "source-1",
      feedUrl: "https://example.com/feed.xml",
      itemsFetched: 2,
      itemsCreated: 1,
      itemsSkipped: 1,
    });
  });

  test("falls back to HTML item extraction when no RSS feed is advertised", async () => {
    const tx = createTx({
      existingUrls: new Set(),
    });
    const provider = createProvider({
      "https://example.com/news": {
        contentType: "text/html",
        body: '<a href="/news/agent-launch">Agent launch</a><a href="/company">Company</a>',
      },
    });

    const summary = await ingestIndustrySource({
      tx,
      provider,
      source: {
        id: "source-1",
        url: "https://example.com/news",
        rssUrl: null,
      },
      now: NOW,
    });

    expect(provider.fetchText).toHaveBeenCalledTimes(1);
    expect(tx.industrySourceItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceId: "source-1",
        url: "https://example.com/news/agent-launch",
        title: "Agent launch",
      }),
    });
    expect(tx.industrySource.update).toHaveBeenCalledWith({
      where: { id: "source-1" },
      data: {
        rssUrl: null,
        lastFetchedAt: NOW,
      },
    });
    expect(summary).toEqual({
      sourceId: "source-1",
      feedUrl: "https://example.com/news",
      itemsFetched: 1,
      itemsCreated: 1,
      itemsSkipped: 0,
    });
  });

  test("tries known RSS candidates when a news page blocks direct fetch", async () => {
    const tx = createTx({
      existingUrls: new Set(),
    });
    const provider = createProvider({
      "https://example.com/news": {
        status: 403,
        body: "blocked",
      },
      "https://example.com/news/rss.xml": {
        contentType: "application/rss+xml",
        body: "<rss><channel><item><title>Recovered</title><link>https://example.com/news/recovered</link></item></channel></rss>",
      },
    });

    const summary = await ingestIndustrySource({
      tx,
      provider,
      source: {
        id: "source-1",
        url: "https://example.com/news",
        rssUrl: null,
      },
      now: NOW,
    });

    expect(provider.fetchText).toHaveBeenCalledWith("https://example.com/news");
    expect(provider.fetchText).toHaveBeenCalledWith("https://example.com/news/rss.xml");
    expect(summary.feedUrl).toBe("https://example.com/news/rss.xml");
    expect(tx.industrySourceItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Recovered",
        url: "https://example.com/news/recovered",
      }),
    });
  });

  test("uses OpenAI news RSS research categories when OpenAI research pages are blocked", async () => {
    const tx = createTx({
      existingUrls: new Set(),
    });
    const provider = createProvider({
      "https://openai.com/research/": {
        status: 403,
        body: "blocked",
      },
      "https://openai.com/news/rss.xml": {
        contentType: "application/rss+xml",
        body: `
          <rss><channel>
            <item><title>Research item</title><link>https://openai.com/index/research-item</link><category><![CDATA[Research]]></category></item>
            <item><title>Publication item</title><link>https://openai.com/index/publication-item</link><category><![CDATA[Publication]]></category></item>
            <item><title>Company item</title><link>https://openai.com/index/company-item</link><category><![CDATA[Company]]></category></item>
          </channel></rss>
        `,
      },
    });

    const summary = await ingestIndustrySource({
      tx,
      provider,
      source: {
        id: "source-1",
        url: "https://openai.com/research/",
        rssUrl: null,
      },
      now: NOW,
    });

    expect(provider.fetchText).toHaveBeenCalledWith("https://openai.com/news/rss.xml");
    expect(tx.industrySourceItem.create).toHaveBeenCalledTimes(2);
    expect(tx.industrySourceItem.create.mock.calls.map((call) => call[0].data.title)).toEqual([
      "Research item",
      "Publication item",
    ]);
    expect(summary.feedUrl).toBe("https://openai.com/news/rss.xml");
    expect(summary.itemsFetched).toBe(2);
  });

  test("caps initial ingestion to the newest configured number of feed items", async () => {
    const tx = createTx({
      existingUrls: new Set(),
    });
    const provider = createProvider({
      "https://example.com/news/rss.xml": {
        contentType: "application/rss+xml",
        body: `<rss><channel>${Array.from(
          { length: 60 },
          (_, index) => `
            <item>
              <title>Item ${index}</title>
              <link>https://example.com/news/${index}</link>
              <pubDate>${new Date(`2026-05-${String(17 - Math.floor(index / 4)).padStart(2, "0")}T12:00:00.000Z`).toUTCString()}</pubDate>
            </item>
          `,
        ).join("")}</channel></rss>`,
      },
    });

    const summary = await ingestIndustrySource({
      tx,
      provider,
      source: {
        id: "source-1",
        url: "https://example.com/news/rss.xml",
        rssUrl: "https://example.com/news/rss.xml",
      },
      now: NOW,
      maxItems: 25,
    });

    expect(tx.industrySourceItem.create).toHaveBeenCalledTimes(25);
    expect(summary.itemsFetched).toBe(25);
  });

  test("uses a 20 item cap for initial ingestion by default", async () => {
    const tx = createTx({
      existingUrls: new Set(),
    });
    const provider = createProvider({
      "https://example.com/news/rss.xml": {
        contentType: "application/rss+xml",
        body: `<rss><channel>${Array.from(
          { length: 30 },
          (_, index) => `
            <item>
              <title>Item ${index}</title>
              <link>https://example.com/news/${index}</link>
            </item>
          `,
        ).join("")}</channel></rss>`,
      },
    });

    const summary = await ingestIndustrySource({
      tx,
      provider,
      source: {
        id: "source-1",
        url: "https://example.com/news/rss.xml",
        rssUrl: "https://example.com/news/rss.xml",
      },
      now: NOW,
    });

    expect(tx.industrySourceItem.create).toHaveBeenCalledTimes(20);
    expect(summary.itemsFetched).toBe(20);
  });

  test("refresh mode stores only items inside the freshness window", async () => {
    const tx = createTx({
      existingUrls: new Set(),
    });
    const provider = createProvider({
      "https://example.com/news/rss.xml": {
        contentType: "application/rss+xml",
        body: `
          <rss><channel>
            <item><title>Fresh</title><link>https://example.com/news/fresh</link><pubDate>Sun, 17 May 2026 11:00:00 GMT</pubDate></item>
            <item><title>Old</title><link>https://example.com/news/old</link><pubDate>Fri, 15 May 2026 11:00:00 GMT</pubDate></item>
          </channel></rss>
        `,
      },
    });

    const summary = await ingestIndustrySource({
      tx,
      provider,
      source: {
        id: "source-1",
        url: "https://example.com/news/rss.xml",
        rssUrl: "https://example.com/news/rss.xml",
      },
      mode: "refresh",
      now: NOW,
      freshnessHours: 24,
    });

    expect(tx.industrySourceItem.create).toHaveBeenCalledTimes(1);
    expect(tx.industrySourceItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Fresh",
      }),
    });
    expect(summary.itemsFetched).toBe(1);
  });
});

function createProvider(responses: Record<string, { body: string; contentType?: string; status?: number }>): SourceFetchProvider & {
  fetchText: ReturnType<typeof vi.fn>;
} {
  return {
    fetchText: vi.fn(async (url: string) => {
      const response = responses[url];
      if (!response) {
        throw new Error(`Missing test response for ${url}`);
      }
      if (response.status && response.status >= 400) {
        throw new Error(`Source request failed with ${response.status}: ${url}`);
      }

      return {
        finalUrl: url,
        body: response.body,
        contentType: response.contentType,
      };
    }),
  };
}

function createTx(input: { existingUrls: Set<string> }): IndustrySourceIngestionTx & {
  industrySource: {
    update: ReturnType<typeof vi.fn>;
  };
  industrySourceItem: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
} {
  return {
    industrySource: {
      update: vi.fn(async () => ({})),
    },
    industrySourceItem: {
      findUnique: vi.fn(async (query: { where: { sourceId_url: { url: string } } }) =>
        input.existingUrls.has(query.where.sourceId_url.url) ? { id: "existing-item" } : null,
      ),
      create: vi.fn(async () => ({ id: "new-item" })),
    },
  };
}
