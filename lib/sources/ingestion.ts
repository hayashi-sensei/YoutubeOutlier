import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type SourceTextResponse = {
  finalUrl: string;
  body: string;
  contentType?: string;
};

export type SourceFetchProvider = {
  fetchText(url: string): Promise<SourceTextResponse>;
};

export type IndustrySourceForIngestion = {
  id: string;
  url: string;
  rssUrl: string | null;
};

export type ParsedSourceItem = {
  url: string;
  title: string;
  author?: string;
  summary?: string;
  contentText?: string;
  publishedAt?: Date;
  contentHash?: string;
  categories?: string[];
};

export type IndustrySourceIngestionSummary = {
  sourceId: string;
  feedUrl: string;
  itemsFetched: number;
  itemsCreated: number;
  itemsSkipped: number;
};

export type IndustrySourceIngestionMode = "initial" | "refresh";

const DEFAULT_INITIAL_MAX_ITEMS = 20;
const DEFAULT_REFRESH_MAX_ITEMS = 25;
const DEFAULT_REFRESH_HOURS = 24;

export type IndustrySourceIngestionTx = {
  industrySource: {
    update(input: {
      where: { id: string };
      data: { rssUrl: string | null; lastFetchedAt: Date };
    }): Promise<unknown>;
  };
  industrySourceItem: {
    findUnique(input: {
      where: { sourceId_url: { sourceId: string; url: string } };
      select?: { id: true };
    }): Promise<{ id: string } | null>;
    create(input: {
      data: {
        sourceId: string;
        url: string;
        title: string;
        author?: string;
        summary?: string;
        contentText?: string;
        publishedAt?: Date;
        fetchedAt: Date;
        contentHash?: string;
      };
    }): Promise<unknown>;
  };
};

export class HttpSourceFetchProvider implements SourceFetchProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly maxResponseBytes: number;
  private readonly timeoutMs: number;
  private readonly maxRedirects: number;
  private readonly resolveDns: boolean;

  constructor(input: { fetchImpl?: typeof fetch; maxResponseBytes?: number; timeoutMs?: number; maxRedirects?: number; resolveDns?: boolean } = {}) {
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.maxResponseBytes = input.maxResponseBytes ?? 2_000_000;
    this.timeoutMs = input.timeoutMs ?? 10_000;
    this.maxRedirects = input.maxRedirects ?? 3;
    this.resolveDns = input.resolveDns ?? !input.fetchImpl;
  }

  async fetchText(url: string): Promise<SourceTextResponse> {
    let currentUrl = await assertSafeSourceUrl(url, this.resolveDns);
    let response: Response | null = null;

    for (let redirectCount = 0; redirectCount <= this.maxRedirects; redirectCount += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        response = await this.fetchImpl(currentUrl.toString(), {
          headers: {
            Accept: "application/rss+xml, application/atom+xml, text/html;q=0.9, */*;q=0.8",
          },
          redirect: "manual",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!isRedirectResponse(response)) {
        break;
      }

      const location = response.headers.get("location");
      if (!location || redirectCount === this.maxRedirects) {
        throw new Error(`Source request exceeded redirect limit: ${url}`);
      }
      currentUrl = await assertSafeSourceUrl(new URL(location, currentUrl).toString(), this.resolveDns);
    }

    if (!response) {
      throw new Error(`Source request failed: ${url}`);
    }
    if (!response.ok) {
      throw new Error(`Source request failed with ${response.status}: ${url}`);
    }

    return {
      finalUrl: response.url || currentUrl.toString(),
      body: await readBoundedResponseText(response, this.maxResponseBytes),
      contentType: response.headers.get("content-type") ?? undefined,
    };
  }
}

async function assertSafeSourceUrl(value: string, resolveDns: boolean): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Industry source URLs must use http or https.");
  }

  assertPublicHostname(url.hostname);
  if (resolveDns && !isIP(url.hostname)) {
    const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
    for (const address of addresses) {
      assertPublicHostname(address.address);
    }
  }

  return url;
}

function assertPublicHostname(hostname: string): void {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized === "::1" ||
    isPrivateOrLocalAddress(normalized)
  ) {
    throw new Error("Industry source URL resolves to a private or local network address.");
  }
}

function isPrivateOrLocalAddress(value: string): boolean {
  if (isIP(value) === 4) {
    const parts = value.split(".").map((part) => Number.parseInt(part, 10));
    const [first = 0, second = 0] = parts;
    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    );
  }

  if (isIP(value) === 6) {
    const mappedIpv4 = ipv4FromMappedIpv6(value);
    return Boolean(mappedIpv4 && isPrivateOrLocalAddress(mappedIpv4)) ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      value.startsWith("fe80:");
  }

  return false;
}

function ipv4FromMappedIpv6(value: string): string | null {
  const dotted = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u)?.[1];
  if (dotted) {
    return dotted;
  }

  const hex = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u);
  if (!hex) {
    return null;
  }

  const high = Number.parseInt(hex[1] ?? "", 16);
  const low = Number.parseInt(hex[2] ?? "", 16);
  if (!Number.isInteger(high) || !Number.isInteger(low)) {
    return null;
  }

  return [
    (high >> 8) & 255,
    high & 255,
    (low >> 8) & 255,
    low & 255,
  ].join(".");
}

function isRedirectResponse(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
    throw new Error(`Source response exceeded ${maxBytes} bytes.`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) {
      throw new Error(`Source response exceeded ${maxBytes} bytes.`);
    }
    return text;
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      throw new Error(`Source response exceeded ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export async function ingestIndustrySource(input: {
  tx: IndustrySourceIngestionTx;
  provider: SourceFetchProvider;
  source: IndustrySourceForIngestion;
  mode?: IndustrySourceIngestionMode;
  maxItems?: number;
  freshnessHours?: number;
  now?: Date;
}): Promise<IndustrySourceIngestionSummary> {
  const now = input.now ?? new Date();
  const mode = input.mode ?? "initial";
  const page = input.source.rssUrl
    ? undefined
    : await fetchPageOrUndefined(input.provider, input.source.url);
  if (!page && !input.source.rssUrl) {
    const feedResult = await fetchFirstCandidateFeed(input.provider, input.source.url);
    if (!feedResult) {
      throw new Error(`Source request failed and no candidate RSS feed worked: ${input.source.url}`);
    }

    return ingestParsedItems({
      tx: input.tx,
      sourceId: input.source.id,
      feedUrl: feedResult.feedUrl,
      rssUrl: feedResult.feedUrl,
      items: selectItemsForIngestion({
        items: filterItemsForSource({
          items: parseRssItems({ feedUrl: feedResult.feedUrl, xml: feedResult.response.body }),
          sourceUrl: input.source.url,
        }),
        mode,
        now,
        maxItems: input.maxItems,
        freshnessHours: input.freshnessHours,
      }),
      now,
    });
  }
  const discoveredFeedUrl = page
    ? detectRssFeedUrl({
        pageUrl: page.finalUrl,
        html: page.body,
        contentType: page.contentType,
      })
    : undefined;
  const feedUrl = input.source.rssUrl ?? discoveredFeedUrl ?? page?.finalUrl ?? input.source.url;
  const isHtmlFallback = page && !input.source.rssUrl && !discoveredFeedUrl;
  const feed = isHtmlFallback || (page && feedUrl === page.finalUrl)
    ? page
    : await input.provider.fetchText(feedUrl);
  const items = isHtmlFallback
    ? parseHtmlSourceItems({ pageUrl: page.finalUrl, html: page.body })
    : parseRssItems({ feedUrl, xml: feed.body });
  return ingestParsedItems({
    tx: input.tx,
    sourceId: input.source.id,
    feedUrl,
    rssUrl: isHtmlFallback ? null : feedUrl,
    items: selectItemsForIngestion({
      items: filterItemsForSource({ items, sourceUrl: input.source.url }),
      mode,
      now,
      maxItems: input.maxItems,
      freshnessHours: input.freshnessHours,
    }),
    now,
  });
}

function selectItemsForIngestion(input: {
  items: ParsedSourceItem[];
  mode: IndustrySourceIngestionMode;
  now: Date;
  maxItems?: number;
  freshnessHours?: number;
}) {
  const maxItems = input.maxItems ?? (input.mode === "refresh" ? DEFAULT_REFRESH_MAX_ITEMS : DEFAULT_INITIAL_MAX_ITEMS);
  const freshnessCutoff = new Date(input.now.getTime() - (input.freshnessHours ?? DEFAULT_REFRESH_HOURS) * 60 * 60 * 1000);
  const sortedItems = [...input.items].sort((left, right) => {
    const leftTime = left.publishedAt?.getTime() ?? 0;
    const rightTime = right.publishedAt?.getTime() ?? 0;
    return rightTime - leftTime;
  });
  const freshItems = input.mode === "refresh"
    ? sortedItems.filter((item) => !item.publishedAt || item.publishedAt >= freshnessCutoff)
    : sortedItems;

  return freshItems.slice(0, maxItems);
}

async function ingestParsedItems(input: {
  tx: IndustrySourceIngestionTx;
  sourceId: string;
  feedUrl: string;
  rssUrl: string | null;
  items: ParsedSourceItem[];
  now: Date;
}): Promise<IndustrySourceIngestionSummary> {
  let itemsCreated = 0;
  let itemsSkipped = 0;

  for (const item of input.items) {
    const existing = await input.tx.industrySourceItem.findUnique({
      where: {
        sourceId_url: {
          sourceId: input.sourceId,
          url: item.url,
        },
      },
      select: { id: true },
    });

    if (existing) {
      itemsSkipped += 1;
      continue;
    }

    await input.tx.industrySourceItem.create({
      data: {
        sourceId: input.sourceId,
        url: item.url,
        title: item.title,
        author: item.author,
        summary: item.summary,
        contentText: item.contentText,
        publishedAt: item.publishedAt,
        fetchedAt: input.now,
        contentHash: item.contentHash,
      },
    });
    itemsCreated += 1;
  }

  await input.tx.industrySource.update({
    where: { id: input.sourceId },
    data: {
      rssUrl: input.rssUrl,
      lastFetchedAt: input.now,
    },
  });

  return {
    sourceId: input.sourceId,
    feedUrl: input.feedUrl,
    itemsFetched: input.items.length,
    itemsCreated,
    itemsSkipped,
  };
}

async function fetchPageOrUndefined(provider: SourceFetchProvider, url: string): Promise<SourceTextResponse | undefined> {
  try {
    return await provider.fetchText(url);
  } catch {
    return undefined;
  }
}

async function fetchFirstCandidateFeed(
  provider: SourceFetchProvider,
  pageUrl: string,
): Promise<{ feedUrl: string; response: SourceTextResponse } | undefined> {
  for (const feedUrl of candidateFeedUrls(pageUrl)) {
    try {
      const response = await provider.fetchText(feedUrl);
      return { feedUrl, response };
    } catch {
      // Try the next likely feed URL.
    }
  }

  return undefined;
}

function candidateFeedUrls(pageUrl: string): string[] {
  const url = new URL(pageUrl);
  const candidates = new Set<string>();
  const normalizedPath = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;

  if (url.pathname.toLowerCase().includes("research")) {
    candidates.add(new URL("/news/rss.xml", url.origin).toString());
    candidates.add(new URL("/news/feed.xml", url.origin).toString());
  }

  candidates.add(new URL("rss.xml", new URL(normalizedPath, url.origin)).toString());
  candidates.add(new URL("feed.xml", new URL(normalizedPath, url.origin)).toString());
  candidates.add(new URL("/rss.xml", url.origin).toString());
  candidates.add(new URL("/feed.xml", url.origin).toString());

  return Array.from(candidates);
}

export function detectRssFeedUrl(input: {
  pageUrl: string;
  html: string;
  contentType?: string;
}): string | undefined {
  if (isFeedContentType(input.contentType) || /^\s*<(rss|feed)\b/i.test(input.html)) {
    return input.pageUrl;
  }

  const linkMatches = input.html.matchAll(/<link\b[^>]*>/gi);
  for (const match of linkMatches) {
    const tag = match[0];
    const rel = getHtmlAttribute(tag, "rel");
    const type = getHtmlAttribute(tag, "type");
    const href = getHtmlAttribute(tag, "href");

    if (!href || !rel?.toLowerCase().includes("alternate")) {
      continue;
    }
    if (!type || !isFeedContentType(type)) {
      continue;
    }

    return new URL(href, input.pageUrl).toString();
  }

  return undefined;
}

export function parseHtmlSourceItems(input: { pageUrl: string; html: string }): ParsedSourceItem[] {
  const seenUrls = new Set<string>();
  const links = Array.from(input.html.matchAll(/<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi));

  return links.flatMap((match) => {
    const href = match[1] ?? match[2] ?? match[3];
    const rawTitle = match[4] ?? "";
    if (!href) {
      return [];
    }

    const url = new URL(decodeXml(href), input.pageUrl).toString();
    const title = decodeXml(stripTags(rawTitle)).replace(/\s+/g, " ").trim();

    if (!title || seenUrls.has(url) || !looksLikeSourceItemUrl(url, input.pageUrl)) {
      return [];
    }

    seenUrls.add(url);
    const contentHash = createHash("sha256").update(`${title}\n${url}`).digest("hex");

    return [
      {
        url,
        title,
        contentHash,
      },
    ];
  });
}

export function parseRssItems(input: { feedUrl: string; xml: string }): ParsedSourceItem[] {
  const rssItems = extractElements(input.xml, "item");
  const atomItems = rssItems.length > 0 ? [] : extractElements(input.xml, "entry");
  const entries = rssItems.length > 0 ? rssItems : atomItems;

  return entries.flatMap((entry) => {
    const title = decodeXml(stripTags(getXmlElementText(entry, "title") ?? "")).trim();
    const link = getEntryLink(entry, input.feedUrl);

    if (!title || !link) {
      return [];
    }

    const summary = decodeXml(
      stripTags(getXmlElementText(entry, "description") ?? getXmlElementText(entry, "summary") ?? ""),
    ).trim();
    const author = decodeXml(stripTags(getXmlElementText(entry, "author") ?? "")).trim();
    const publishedAt = parseOptionalDate(
      getXmlElementText(entry, "pubDate") ?? getXmlElementText(entry, "published") ?? getXmlElementText(entry, "updated"),
    );
    const categories = extractElements(entry, "category")
      .map((category) => decodeXml(stripTags(category)).trim())
      .filter(Boolean);
    const contentText = decodeXml(stripTags(getXmlElementText(entry, "content:encoded") ?? "")).trim();
    const contentForHash = [title, link, summary, contentText].join("\n");

    return [
      {
        url: link,
        title,
        author: author || undefined,
        summary: summary || undefined,
        contentText: contentText || undefined,
        publishedAt,
        contentHash: createHash("sha256").update(contentForHash).digest("hex"),
        categories: categories.length > 0 ? categories : undefined,
      },
    ];
  });
}

function isFeedContentType(value: string | undefined): boolean {
  const normalized = value?.toLowerCase() ?? "";
  return normalized.includes("rss") || normalized.includes("atom") || normalized.includes("xml");
}

function getHtmlAttribute(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = pattern.exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function extractElements(xml: string, name: string): string[] {
  return Array.from(xml.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "gi"))).map(
    (match) => match[1] ?? "",
  );
}

function getXmlElementText(xml: string, name: string): string | undefined {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(xml);
  return match?.[1]?.trim();
}

function getEntryLink(entry: string, feedUrl: string): string | undefined {
  const linkText = getXmlElementText(entry, "link");
  if (linkText) {
    return new URL(decodeXml(stripTags(linkText)).trim(), feedUrl).toString();
  }

  const linkTag = /<link\b[^>]*>/i.exec(entry)?.[0];
  const href = linkTag ? getHtmlAttribute(linkTag, "href") : undefined;
  return href ? new URL(decodeXml(href), feedUrl).toString() : undefined;
}

function parseOptionalDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(decodeXml(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function looksLikeSourceItemUrl(url: string, pageUrl: string): boolean {
  const parsedUrl = new URL(url);
  const parsedPageUrl = new URL(pageUrl);
  const path = parsedUrl.pathname.toLowerCase();
  const pagePath = parsedPageUrl.pathname.toLowerCase().replace(/\/$/, "");

  if (parsedUrl.hostname !== parsedPageUrl.hostname || parsedUrl.hash) {
    return false;
  }

  if (path.replace(/\/$/, "") === pagePath || /^\/(about|company|research|news|blog)?\/?$/.test(path)) {
    return false;
  }

  return ["/news/", "/blog/", "/research/", "/posts/", "/articles/", "/release-notes/"].some((segment) =>
    path.includes(segment),
  );
}

function filterItemsForSource(input: {
  items: ParsedSourceItem[];
  sourceUrl: string;
}): ParsedSourceItem[] {
  const categoryHints = categoryHintsFromUrl(input.sourceUrl);
  if (categoryHints.length === 0 || input.items.every((item) => (item.categories ?? []).length === 0)) {
    return input.items;
  }

  return input.items.filter((item) =>
    (item.categories ?? []).some((category) => categoryHints.includes(category.toLowerCase())),
  );
}

function categoryHintsFromUrl(sourceUrl: string): string[] {
  const path = new URL(sourceUrl).pathname.toLowerCase();
  const hints = new Set<string>();

  for (const segment of ["research", "publication", "product", "safety", "security", "company", "engineering"]) {
    if (path.includes(segment)) {
      hints.add(segment);
    }
  }
  if (hints.has("research")) {
    hints.add("publication");
  }

  return Array.from(hints);
}

function stripTags(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ");
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
