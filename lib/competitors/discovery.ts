import { env } from "@/lib/env";
import {
  YoutubeDataApiProvider,
  type YoutubeChannelMetadata,
  type YoutubeVideoSearchResult,
} from "@/lib/youtube/provider";

const MIN_FRESH_PENDING_RECOMMENDATIONS = 3;
const MAX_RECOMMENDATIONS_TO_CREATE = 5;
const DISCOVERY_STALE_DAYS = 7;
const SEARCH_RESULTS_PER_QUERY = 10;

type DiscoveryWorkspace = {
  id: string;
  settings: {
    primaryNiche: string;
    subNiche: string | null;
    targetAudience: string | null;
    contentGoals: string | null;
  } | null;
  trackedChannels: Array<{
    channel: {
      youtubeChannelId: string;
      handle: string | null;
      title: string;
    };
  }>;
};

type ExistingRecommendation = {
  channelUrl: string;
  title: string;
  status: string;
  youtubeChannelId: string | null;
};

type DiscoveryJob = {
  id: string;
  createdAt: Date;
};

export type CompetitorDiscoveryPrisma = {
  workspace: {
    findUnique(input: {
      where: { id: string };
      select: {
        id: true;
        settings: {
          select: {
            primaryNiche: true;
            subNiche: true;
            targetAudience: true;
            contentGoals: true;
          };
        };
        trackedChannels: {
          where: { isActive: true };
          select: {
            channel: {
              select: {
                youtubeChannelId: true;
                handle: true;
                title: true;
              };
            };
          };
        };
      };
    }): Promise<DiscoveryWorkspace | null>;
  };
  competitorRecommendation: {
    findMany(input: {
      where: { workspaceId: string };
      orderBy?: Array<{ relevanceScore?: "desc" } | { createdAt?: "desc" }>;
      select: {
        channelUrl: true;
        title: true;
        status: true;
        youtubeChannelId: true;
      };
    }): Promise<ExistingRecommendation[]>;
    create(input: {
      data: {
        workspaceId: string;
        youtubeChannelId?: string;
        channelUrl: string;
        title: string;
        reason: string;
        relevanceScore: number;
        status: "NEW";
      };
    }): Promise<unknown>;
  };
  jobRun: {
    findFirst(input: {
      where: {
        workspaceId: string;
        jobType: "competitor_discovery";
        status: { in: Array<"SUCCEEDED" | "FAILED"> };
      };
      orderBy: { createdAt: "desc" };
      select: { id: true; createdAt: true };
    }): Promise<DiscoveryJob | null>;
    create(input: {
      data: {
        workspaceId: string;
        jobType: "competitor_discovery";
        status: "RUNNING";
        provider: string;
        referenceType: "Workspace";
        referenceId: string;
        attempts: 1;
        maxAttempts: 1;
        startedAt: Date;
        metadata: Record<string, unknown>;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
    update(input: {
      where: { id: string };
      data:
        | {
            status: "SUCCEEDED";
            completedAt: Date;
            metadata: Record<string, unknown>;
          }
        | {
            status: "FAILED";
            completedAt: Date;
            errorMessage: string;
          };
    }): Promise<unknown>;
  };
};

export type CompetitorDiscoveryProvider = {
  searchVideos(input: { query: string; maxResults: number }): Promise<YoutubeVideoSearchResult[]>;
  getChannel(channelId: string): Promise<YoutubeChannelMetadata>;
};

type Candidate = {
  channelId: string;
  channelTitle: string;
  query: string;
  videos: YoutubeVideoSearchResult[];
};

type ScoredCandidate = Candidate & {
  channel: YoutubeChannelMetadata | null;
  relevanceScore: number;
  reason: string;
};

export type CompetitorDiscoverySummary = {
  skipped: boolean;
  reason?: string;
  recommendationsCreated: number;
  queries: string[];
};

export async function ensureCompetitorRecommendations(input: {
  prisma: CompetitorDiscoveryPrisma;
  workspaceId: string;
  provider?: CompetitorDiscoveryProvider;
  now?: Date;
}): Promise<CompetitorDiscoverySummary> {
  const now = input.now ?? new Date();
  const [workspace, existingRecommendations, latestDiscovery] = await Promise.all([
    input.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: {
        id: true,
        settings: {
          select: {
            primaryNiche: true,
            subNiche: true,
            targetAudience: true,
            contentGoals: true,
          },
        },
        trackedChannels: {
          where: { isActive: true },
          select: {
            channel: {
              select: {
                youtubeChannelId: true,
                handle: true,
                title: true,
              },
            },
          },
        },
      },
    }),
    input.prisma.competitorRecommendation.findMany({
      where: { workspaceId: input.workspaceId },
      orderBy: [{ relevanceScore: "desc" }, { createdAt: "desc" }],
      select: {
        channelUrl: true,
        title: true,
        status: true,
        youtubeChannelId: true,
      },
    }),
    input.prisma.jobRun.findFirst({
      where: {
        workspaceId: input.workspaceId,
        jobType: "competitor_discovery",
        status: { in: ["SUCCEEDED", "FAILED"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    }),
  ]);

  if (!workspace?.settings) {
    return { skipped: true, reason: "missing_workspace_settings", recommendationsCreated: 0, queries: [] };
  }

  const pendingCount = existingRecommendations.filter((item) => item.status === "NEW").length;
  if (pendingCount >= MIN_FRESH_PENDING_RECOMMENDATIONS) {
    return { skipped: true, reason: "pending_queue_has_recommendations", recommendationsCreated: 0, queries: [] };
  }

  if (latestDiscovery && daysBetween(latestDiscovery.createdAt, now) < DISCOVERY_STALE_DAYS) {
    return { skipped: true, reason: "recently_discovered", recommendationsCreated: 0, queries: [] };
  }

  const provider = input.provider ?? createDefaultDiscoveryProvider();
  if (!provider) {
    return { skipped: true, reason: "youtube_api_key_missing", recommendationsCreated: 0, queries: [] };
  }

  const queries = buildSearchQueries(workspace);
  const job = await input.prisma.jobRun.create({
    data: {
      workspaceId: input.workspaceId,
      jobType: "competitor_discovery",
      status: "RUNNING",
      provider: "youtube",
      referenceType: "Workspace",
      referenceId: input.workspaceId,
      attempts: 1,
      maxAttempts: 1,
      startedAt: now,
      metadata: { queries },
    },
    select: { id: true },
  });

  try {
    const resultsByQuery = await Promise.all(
      queries.map(async (query) => ({
        query,
        videos: await provider.searchVideos({ query, maxResults: SEARCH_RESULTS_PER_QUERY }),
      })),
    );
    const candidates = mergeCandidates(resultsByQuery);
    const blocked = blockedChannelKeys(workspace, existingRecommendations);
    const scored = await scoreCandidates(provider, candidates, workspace, blocked);
    const recommendations = scored
      .sort((left, right) => right.relevanceScore - left.relevanceScore)
      .slice(0, MAX_RECOMMENDATIONS_TO_CREATE);

    for (const recommendation of recommendations) {
      await input.prisma.competitorRecommendation.create({
        data: {
          workspaceId: input.workspaceId,
          channelUrl: channelUrl(recommendation.channel ?? recommendation),
          title: recommendation.channel?.title ?? recommendation.channelTitle,
          reason: recommendation.reason,
          relevanceScore: recommendation.relevanceScore,
          status: "NEW",
        },
      });
    }

    await input.prisma.jobRun.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        completedAt: now,
        metadata: {
          queries,
          candidatesFound: candidates.length,
          recommendationsCreated: recommendations.length,
        },
      },
    });

    return {
      skipped: false,
      recommendationsCreated: recommendations.length,
      queries,
    };
  } catch (error) {
    await input.prisma.jobRun.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        completedAt: now,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });

    return {
      skipped: true,
      reason: "discovery_failed",
      recommendationsCreated: 0,
      queries,
    };
  }
}

export function buildSearchQueries(workspace: DiscoveryWorkspace): string[] {
  const settings = workspace.settings;
  if (!settings) {
    return [];
  }

  const niche = compactText([settings.subNiche, settings.primaryNiche]);
  const audience = settings.targetAudience ? `for ${settings.targetAudience}` : "";
  const goals = settings.contentGoals ? settings.contentGoals.split(/[\n,]+/u)[0]?.trim() : "";
  const tracked = workspace.trackedChannels
    .map((item) => item.channel.title)
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

  return uniqueStrings([
    `${niche} YouTube channel ${audience}`,
    `${niche} tutorial creator ${audience}`,
    compactText([niche, goals, "YouTube competitor"]),
    compactText([niche, tracked, "similar channel"]),
  ]).slice(0, 3);
}

function mergeCandidates(resultsByQuery: Array<{ query: string; videos: YoutubeVideoSearchResult[] }>): Candidate[] {
  const byChannelId = new Map<string, Candidate>();

  for (const result of resultsByQuery) {
    for (const video of result.videos) {
      const existing = byChannelId.get(video.channelId);
      if (existing) {
        existing.videos.push(video);
        continue;
      }

      byChannelId.set(video.channelId, {
        channelId: video.channelId,
        channelTitle: video.channelTitle,
        query: result.query,
        videos: [video],
      });
    }
  }

  return [...byChannelId.values()];
}

function blockedChannelKeys(workspace: DiscoveryWorkspace, recommendations: ExistingRecommendation[]) {
  const keys = new Set<string>();

  for (const tracked of workspace.trackedChannels) {
    addKey(keys, tracked.channel.youtubeChannelId);
    addKey(keys, tracked.channel.handle);
    addKey(keys, tracked.channel.title);
  }

  for (const recommendation of recommendations) {
    addKey(keys, recommendation.youtubeChannelId);
    addKey(keys, recommendation.channelUrl);
    addKey(keys, recommendation.title);
  }

  return keys;
}

async function scoreCandidates(
  provider: CompetitorDiscoveryProvider,
  candidates: Candidate[],
  workspace: DiscoveryWorkspace,
  blocked: Set<string>,
): Promise<ScoredCandidate[]> {
  const scored: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    if (isBlocked(candidate, blocked)) {
      continue;
    }

    const channel = await provider.getChannel(candidate.channelId).catch(() => null);
    if (channel && isBlocked({ ...candidate, channelTitle: channel.title }, blocked)) {
      continue;
    }

    const relevanceScore = calculateRelevanceScore(candidate, channel, workspace);
    if (relevanceScore < 0.45) {
      continue;
    }

    scored.push({
      ...candidate,
      channel,
      relevanceScore,
      reason: recommendationReason(candidate, channel, workspace),
    });
  }

  return scored;
}

function calculateRelevanceScore(
  candidate: Candidate,
  channel: YoutubeChannelMetadata | null,
  workspace: DiscoveryWorkspace,
) {
  const settings = workspace.settings;
  const nicheTerms = tokenSet(`${settings?.primaryNiche ?? ""} ${settings?.subNiche ?? ""}`);
  const audienceTerms = tokenSet(settings?.targetAudience ?? "");
  const candidateText = [
    channel?.title ?? candidate.channelTitle,
    channel?.description ?? "",
    candidate.videos.map((video) => video.title).join(" "),
  ].join(" ");
  const tokens = tokenSet(candidateText);
  const nicheOverlap = overlapRatio(tokens, nicheTerms);
  const audienceOverlap = overlapRatio(tokens, audienceTerms);
  const videoSignal = Math.min(candidate.videos.length / 3, 1);
  const subscriberSignal = normalizeNumber(channel?.subscriberCount, 100_000);
  const recentSignal = Math.max(
    ...candidate.videos.map((video) => (daysBetween(video.publishedAt, new Date()) <= 180 ? 1 : 0)),
    0,
  );

  return roundScore(0.35 + nicheOverlap * 0.25 + audienceOverlap * 0.1 + videoSignal * 0.15 + subscriberSignal * 0.1 + recentSignal * 0.05);
}

function recommendationReason(
  candidate: Candidate,
  channel: YoutubeChannelMetadata | null,
  workspace: DiscoveryWorkspace,
) {
  const niche = workspace.settings?.subNiche ?? workspace.settings?.primaryNiche ?? "your niche";
  const title = channel?.title ?? candidate.channelTitle;
  const subscribers = channel?.subscriberCount ? `${compactNumber(channel.subscriberCount)} subscribers` : "subscriber count unavailable";
  const sampleTitles = candidate.videos.slice(0, 2).map((video) => `"${truncate(video.title, 72)}"`).join(" and ");

  return `${title} surfaced from ${candidate.videos.length} recent search result${candidate.videos.length === 1 ? "" : "s"} for ${niche}; ${subscribers}. Recent matching video${candidate.videos.length === 1 ? "" : "s"} include ${sampleTitles}.`;
}

function isBlocked(candidate: { channelId: string; channelTitle: string }, blocked: Set<string>) {
  return blocked.has(normalizeKey(candidate.channelId)) || blocked.has(normalizeKey(candidate.channelTitle));
}

function createDefaultDiscoveryProvider(): CompetitorDiscoveryProvider | null {
  if (!env.YOUTUBE_DATA_API_KEY) {
    return null;
  }

  return new YoutubeDataApiProvider({ apiKey: env.YOUTUBE_DATA_API_KEY });
}

function channelUrl(channel: Pick<YoutubeChannelMetadata, "youtubeChannelId" | "handle"> | Pick<Candidate, "channelId">) {
  if ("handle" in channel && channel.handle) {
    return `https://www.youtube.com/${channel.handle}`;
  }

  const id = "youtubeChannelId" in channel ? channel.youtubeChannelId : channel.channelId;
  return `https://www.youtube.com/channel/${id}`;
}

function addKey(keys: Set<string>, value: string | null | undefined) {
  if (value) {
    keys.add(normalizeKey(value));
  }
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/^https:\/\/www\.youtube\.com\//u, "").replace(/^@/u, "").trim();
}

function compactText(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part?.trim())).join(" ").trim();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function tokenSet(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((term) => term.length >= 3),
  );
}

function overlapRatio(source: Set<string>, target: Set<string>) {
  if (target.size === 0) {
    return 0;
  }

  let matches = 0;
  for (const term of target) {
    if (source.has(term)) {
      matches += 1;
    }
  }

  return matches / target.size;
}

function normalizeNumber(value: bigint | number | undefined, strongValue: number) {
  if (typeof value === "undefined") {
    return 0;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return 0;
  }

  return Math.min(numberValue / strongValue, 1);
}

function compactNumber(value: bigint | number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(Number(value));
}

function daysBetween(earlier: Date, later: Date) {
  return Math.max(0, (later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000));
}

function roundScore(value: number) {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}
