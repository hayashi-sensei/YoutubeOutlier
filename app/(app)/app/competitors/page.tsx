import { CompetitorChannelForm } from "@/components/competitors/competitor-channel-form";
import {
  RecommendationQueue,
  type CompetitorRecommendationListItem,
} from "@/components/competitors/recommendation-queue";
import {
  TrackedChannelList,
  type TrackedChannelListItem,
} from "@/components/competitors/tracked-channel-list";
import type { ActiveChannelSearchItem } from "@/components/competitors/active-channel-smart-search";
import { requireUserWorkspace } from "@/lib/auth/session";
import { getWorkspacePlanEntitlement } from "@/lib/billing/plan-limits";
import { getCompetitorChannelIntelligence } from "@/lib/competitors/channel-intelligence";
import { getPrismaClient } from "@/lib/db/prisma";

const ACTIVE_CHANNEL_PAGE_SIZE = 25;
const ACTIVE_CHANNEL_PAGE_PARAM = "activePage";
const ACTIVE_CHANNEL_SEARCH_PARAM = "channelSearch";

export default async function CompetitorsPage({
  searchParams,
}: {
  searchParams?: Promise<{ activePage?: string; channelSearch?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const activeSearchQuery = typeof query.channelSearch === "string" ? query.channelSearch.trim() : "";
  const requestedActivePage = Math.max(1, Number.parseInt(query.activePage ?? "1", 10) || 1);
  const { workspaceId } = await requireUserWorkspace("/app/competitors");
  const prisma = getPrismaClient();
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      planCode: true,
      trackedChannels: {
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          youtubeChannelId: true,
          nickname: true,
          isActive: true,
          reason: true,
          channel: {
            select: {
              title: true,
              handle: true,
              youtubeChannelId: true,
              subscriberCount: true,
              lastFetchedAt: true,
              _count: {
                select: {
                  videos: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!workspace) {
    throw new Error("Workspace was not found after user bootstrap.");
  }

  const recommendations: CompetitorRecommendationListItem[] = await prisma.competitorRecommendation.findMany({
    where: {
      workspaceId: workspace.id,
      status: "NEW",
    },
    orderBy: [{ relevanceScore: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      channelUrl: true,
      title: true,
      reason: true,
      relevanceScore: true,
    },
  });
  const entitlement = await getWorkspacePlanEntitlement(prisma, workspace.id);

  if (!entitlement) {
    throw new Error("Workspace entitlement was not found.");
  }

  const channelIds = workspace.trackedChannels.map((trackedChannel) => trackedChannel.youtubeChannelId);
  const latestJobs = await prisma.jobRun.findMany({
    where: {
      referenceType: "YoutubeChannel",
      referenceId: {
        in: channelIds,
      },
      jobType: {
        in: ["youtube_channel_backfill", "youtube_recent_refresh"],
      },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      referenceId: true,
      status: true,
      createdAt: true,
      errorMessage: true,
    },
  });
  const latestJobByChannelId = new Map<string, (typeof latestJobs)[number]>();

  for (const job of latestJobs) {
    if (job.referenceId && !latestJobByChannelId.has(job.referenceId)) {
      latestJobByChannelId.set(job.referenceId, job);
    }
  }

  const activeRawChannels = workspace.trackedChannels.filter((channel) => channel.isActive);
  const archivedRawChannels = workspace.trackedChannels.filter((channel) => !channel.isActive);
  const filteredActiveRawChannels = activeRawChannels.filter((trackedChannel) =>
    matchesActiveChannelSearch(trackedChannel, activeSearchQuery),
  );
  const activeTotalPages = Math.max(1, Math.ceil(filteredActiveRawChannels.length / ACTIVE_CHANNEL_PAGE_SIZE));
  const activePage = Math.min(requestedActivePage, activeTotalPages);
  const visibleActiveRawChannels = filteredActiveRawChannels.slice(
    (activePage - 1) * ACTIVE_CHANNEL_PAGE_SIZE,
    activePage * ACTIVE_CHANNEL_PAGE_SIZE,
  );
  const visibleActiveIds = new Set(visibleActiveRawChannels.map((trackedChannel) => trackedChannel.id));

  const activeChannelScoreEntries = await Promise.all(
    activeRawChannels
      .map(async (trackedChannel) => {
        const intelligence = await getCompetitorChannelIntelligence(prisma, {
          workspaceId: workspace.id,
          trackedChannelId: trackedChannel.id,
          cachedVideoPageSize: 1,
        });

        return [trackedChannel.id, intelligence?.stats.emulationScore ?? null] as const;
      }),
  );
  const scoreByTrackedChannelId = new Map(activeChannelScoreEntries);
  const activeChannelSuggestions: ActiveChannelSearchItem[] = activeRawChannels.map((trackedChannel) => ({
    id: trackedChannel.id,
    name: trackedChannel.nickname ?? trackedChannel.channel.title,
    title: trackedChannel.channel.title,
    handle: trackedChannel.channel.handle,
    youtubeChannelId: trackedChannel.channel.youtubeChannelId,
    subscriberLabel: formatSubscriberCount(trackedChannel.channel.subscriberCount),
    videoCount: trackedChannel.channel._count.videos,
    score: scoreByTrackedChannelId.get(trackedChannel.id) ?? null,
  }));

  const trackedChannels: TrackedChannelListItem[] = [...visibleActiveRawChannels, ...archivedRawChannels].map((trackedChannel) => ({
    ...trackedChannel,
    latestIngestionJob: latestJobByChannelId.get(trackedChannel.youtubeChannelId),
    score: scoreByTrackedChannelId.get(trackedChannel.id) ?? null,
  }));
  const activeChannels = trackedChannels.filter((channel) => channel.isActive && visibleActiveIds.has(channel.id));
  const archivedChannels = trackedChannels.filter((channel) => !channel.isActive);

  return (
    <main className="yt-page">
      <div className="yt-page-head">
        <div>
          <h1 className="yt-page-title">Competitors</h1>
          <p className="yt-page-subtitle">
            Track YouTube channels, archive stale competitors, and approve AI-suggested channels before they affect research.
          </p>
        </div>
        <div className="yt-kpi min-h-0 px-4 py-3 text-right">
          <p className="yt-kpi-label">Tracked Channels</p>
          <p className="yt-kpi-value text-2xl">
            {activeRawChannels.length}/{entitlement.maxTrackedChannels}
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="grid gap-5">
          <TrackedChannelList
            channels={activeChannels}
            controls={{
              searchQuery: activeSearchQuery,
              page: activePage,
              pageSize: ACTIVE_CHANNEL_PAGE_SIZE,
              totalCount: filteredActiveRawChannels.length,
              totalPages: activeTotalPages,
              pageParam: ACTIVE_CHANNEL_PAGE_PARAM,
              searchParam: ACTIVE_CHANNEL_SEARCH_PARAM,
              suggestions: activeChannelSuggestions,
            }}
            title="Active Channels"
          />
          <TrackedChannelList channels={archivedChannels} title="Archived Channels" />
        </div>

        <aside className="grid content-start gap-5">
          <CompetitorChannelForm activeCount={activeRawChannels.length} maxTrackedChannels={entitlement.maxTrackedChannels} />
          <RecommendationQueue recommendations={recommendations} />
        </aside>
      </div>
    </main>
  );
}

function formatSubscriberCount(value: bigint | number | null) {
  if (value === null) {
    return "Subscribers unavailable";
  }

  const count = Number(value);
  if (!Number.isFinite(count)) {
    return value.toString();
  }

  return `${new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(count)} subscribers`;
}

function matchesActiveChannelSearch(
  trackedChannel: {
    nickname: string | null;
    channel: {
      title: string;
      handle: string | null;
      youtubeChannelId: string;
    };
  },
  searchQuery: string,
) {
  if (!searchQuery) {
    return true;
  }

  const normalizedQuery = searchQuery.toLowerCase();
  return [
    trackedChannel.nickname,
    trackedChannel.channel.title,
    trackedChannel.channel.handle,
    trackedChannel.channel.youtubeChannelId,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}
