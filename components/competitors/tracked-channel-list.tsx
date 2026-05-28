import {
  archiveCompetitorChannel,
  deleteArchivedCompetitorChannel,
  restoreCompetitorChannel,
  runCompetitorChannelBackfill,
} from "@/actions/competitors";
import { ActiveChannelSmartSearch, type ActiveChannelSearchItem } from "@/components/competitors/active-channel-smart-search";
import Link from "next/link";

export type TrackedChannelListItem = {
  id: string;
  nickname: string | null;
  isActive: boolean;
  reason: string | null;
  score: number | null;
  channel: {
    title: string;
    handle: string | null;
    youtubeChannelId: string;
    subscriberCount: bigint | number | null;
    lastFetchedAt: Date | null;
    _count: {
      videos: number;
    };
  };
  latestIngestionJob?: {
    status: string;
    createdAt: Date;
    errorMessage: string | null;
  };
};

type TrackedChannelListProps = {
  channels: TrackedChannelListItem[];
  title: string;
  controls?: {
    searchQuery: string;
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    pageParam: string;
    searchParam: string;
    suggestions: ActiveChannelSearchItem[];
  };
};

function formatSubscriberCount(value: bigint | number | null) {
  if (value === null) {
    return "Subscribers unavailable";
  }

  const count = Number(value);

  if (!Number.isFinite(count)) {
    return value.toString();
  }

  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(count);
}

function formatDate(value: Date | null) {
  if (!value) {
    return "Never fetched";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatScore(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(0) : "n/a";
}

function shouldShowIngestionJob(status: string | undefined) {
  return status !== undefined && status !== "SUCCEEDED";
}

function statusClassName(status: string | undefined) {
  if (status === "SUCCEEDED") {
    return "border-[var(--yt-success-soft)] bg-[var(--yt-success-soft)] text-[var(--yt-success)]";
  }
  if (status === "FAILED") {
    return "border-[var(--yt-danger-soft)] bg-[var(--yt-danger-soft)] text-[var(--yt-danger)]";
  }
  if (status === "QUEUED" || status === "RUNNING" || status === "RETRYING") {
    return "border-[var(--yt-warning-soft)] bg-[var(--yt-warning-soft)] text-[var(--yt-warning)]";
  }

  return "border-[var(--yt-border)] bg-[var(--yt-surface-soft)] text-[var(--yt-text-muted)]";
}

export function TrackedChannelList({ channels, title, controls }: TrackedChannelListProps) {
  return (
    <section className="yt-panel">
      <div className="yt-panel-head">
        <div>
          <h2 className="yt-panel-title">{title}</h2>
          {controls ? (
            <p className="yt-panel-note">
              Showing {channels.length} of {controls.totalCount} active channels
            </p>
          ) : null}
        </div>
        <span className="yt-badge">
          {controls?.totalCount ?? channels.length} total
        </span>
      </div>

      {controls ? (
        <div className="border-b border-[var(--yt-border)] bg-[var(--yt-surface-muted)] px-4 py-3">
          <ActiveChannelSmartSearch
            initialQuery={controls.searchQuery}
            pageParam={controls.pageParam}
            searchParam={controls.searchParam}
            suggestions={controls.suggestions}
          />
        </div>
      ) : null}

      {channels.length === 0 ? (
        <p className="yt-empty-state">No channels in this list yet.</p>
      ) : (
        <div className="divide-y divide-[var(--yt-border)]">
          {channels.map((trackedChannel) => {
            const subscriberCount = formatSubscriberCount(trackedChannel.channel.subscriberCount);
            const channelIdentifier = trackedChannel.channel.handle ?? trackedChannel.channel.youtubeChannelId;
            const visibleIngestionJob = shouldShowIngestionJob(trackedChannel.latestIngestionJob?.status)
              ? trackedChannel.latestIngestionJob
              : undefined;

            return (
              <article className="grid gap-3 p-4 text-sm md:grid-cols-[1fr_auto]" key={trackedChannel.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-bold text-[var(--yt-text)]">
                      {trackedChannel.nickname ?? trackedChannel.channel.title}
                    </h3>
                    {trackedChannel.nickname ? (
                      <span className="text-xs font-semibold text-[var(--yt-text-muted)]">{trackedChannel.channel.title}</span>
                    ) : null}
                    {trackedChannel.isActive ? (
                      <span className="yt-badge success tabular-nums">
                        Score {formatScore(trackedChannel.score)}
                      </span>
                    ) : null}
                    {!trackedChannel.isActive ? (
                      <span className="yt-badge">
                        Archived
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[var(--yt-text-muted)]">
                    <span>{channelIdentifier}</span>
                    <span>{subscriberCount === "Subscribers unavailable" ? subscriberCount : `${subscriberCount} subscribers`}</span>
                    <span>{trackedChannel.channel._count.videos} videos cached</span>
                    <span>{formatDate(trackedChannel.channel.lastFetchedAt)}</span>
                  </div>
                  {visibleIngestionJob ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold">
                      <span className={`rounded-[var(--yt-radius-pill)] border px-2 py-0.5 ${statusClassName(visibleIngestionJob.status)}`}>
                        {visibleIngestionJob.status}
                      </span>
                      <span className="font-semibold text-[var(--yt-text-muted)]">
                        Latest ingestion job {formatDate(visibleIngestionJob.createdAt)}
                      </span>
                      {visibleIngestionJob.errorMessage ? (
                        <span className="font-semibold text-[var(--yt-danger)]">{visibleIngestionJob.errorMessage}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2 self-start md:justify-end">
                  {trackedChannel.isActive ? (
                    <Link
                      className="yt-btn yt-btn-primary"
                      href={`/app/competitors/${trackedChannel.id}`}
                    >
                      View Intelligence
                    </Link>
                  ) : null}
                  {trackedChannel.isActive ? (
                    <form action={runCompetitorChannelBackfill}>
                      <input name="trackedChannelId" type="hidden" value={trackedChannel.id} />
                      <button
                        className="yt-btn yt-btn-secondary"
                        type="submit"
                      >
                        Fetch Videos
                      </button>
                    </form>
                  ) : null}
                  <form action={trackedChannel.isActive ? archiveCompetitorChannel : restoreCompetitorChannel}>
                    <input name="trackedChannelId" type="hidden" value={trackedChannel.id} />
                    <button
                      className="yt-btn yt-btn-ghost"
                      type="submit"
                    >
                      {trackedChannel.isActive ? "Archive" : "Restore"}
                    </button>
                  </form>
                  {!trackedChannel.isActive ? (
                    <form action={deleteArchivedCompetitorChannel}>
                      <input name="trackedChannelId" type="hidden" value={trackedChannel.id} />
                      <button
                        className="yt-btn yt-btn-danger"
                        type="submit"
                      >
                        Delete
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {controls && controls.totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--yt-border)] px-4 py-3 text-sm">
          <p className="font-semibold text-[var(--yt-text-muted)]">
            Page {controls.page} of {controls.totalPages}
          </p>
          <div className="flex gap-2">
            {controls.page > 1 ? (
              <Link
                className="yt-btn yt-btn-ghost"
                href={competitorsPageHref(controls, controls.page - 1)}
              >
                Previous
              </Link>
            ) : null}
            {controls.page < controls.totalPages ? (
              <Link
                className="yt-btn yt-btn-secondary"
                href={competitorsPageHref(controls, controls.page + 1)}
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function competitorsPageHref(
  controls: NonNullable<TrackedChannelListProps["controls"]>,
  page: number,
) {
  const params = new URLSearchParams();
  if (controls.searchQuery) {
    params.set(controls.searchParam, controls.searchQuery);
  }
  if (page > 1) {
    params.set(controls.pageParam, String(page));
  }

  const query = params.toString();
  return query ? `/app/competitors?${query}` : "/app/competitors";
}
