import { backfillMissingOutlierScores } from "@/actions/outliers";
import { Panel } from "@/components/dashboard/panel";
import { requireUserWorkspace } from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";
import { getTopWorkspaceOutliers } from "@/lib/outliers/queries";

type TopOutlierPresentation = Awaited<ReturnType<typeof getTopWorkspaceOutliers>>[number] & {
  thumbnailUrl: string | null;
  channelHandle: string | null;
};

function formatCompactNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(value);
}

function formatScore(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  return value.toFixed(0);
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) {
    return "duration n/a";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function youtubeVideoUrl(youtubeVideoId: string) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeVideoId)}`;
}

function backfillMessage(params: {
  backfill?: string;
  channels?: string;
  scores?: string;
  skipped?: string;
  error?: string;
}) {
  if (params.error === "OUTLIER_BACKFILL_FAILED") {
    return {
      tone: "error" as const,
      text: "Missing score backfill failed. Restart the dev server if Prisma was just regenerated, then try again.",
    };
  }

  if (params.backfill === "none") {
    return {
      tone: "info" as const,
      text: "No missing outlier scores found for your tracked channels.",
    };
  }

  if (params.backfill === "completed") {
    const channels = Number(params.channels ?? 0);
    const scores = Number(params.scores ?? 0);
    const skipped = Number(params.skipped ?? 0);

    return {
      tone: "success" as const,
      text: `Backfilled ${scores} missing scores across ${channels} channel${channels === 1 ? "" : "s"}${skipped > 0 ? `; ${skipped} video${skipped === 1 ? "" : "s"} skipped` : ""}.`,
    };
  }

  return null;
}

export default async function OutliersPage({
  searchParams,
}: {
  searchParams: Promise<{
    backfill?: string;
    channels?: string;
    scores?: string;
    skipped?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const { workspaceId } = await requireUserWorkspace("/app/outliers");
  const prisma = getPrismaClient();
  const topOutliers = await getTopWorkspaceOutliers(prisma, { workspaceId, limit: 100 });
  const message = backfillMessage(params);

  return (
    <main className="yt-page">
      <div className="yt-page-head">
        <div>
          <h1 className="yt-page-title">Outliers</h1>
          <p className="yt-page-subtitle">Ranked competitor videos by opportunity score, outlier strength, and recent performance.</p>
        </div>
        <form action={backfillMissingOutlierScores}>
          <button
            className="yt-btn yt-btn-primary"
            type="submit"
          >
            Update
          </button>
        </form>
      </div>

      {message ? (
        <div
          className={`mb-4 rounded-[var(--yt-radius-card)] border p-3 text-sm font-semibold ${
            message.tone === "error"
              ? "border-[var(--yt-danger-soft)] bg-[var(--yt-danger-soft)] text-[var(--yt-danger)]"
              : message.tone === "success"
                ? "border-[var(--yt-success-soft)] bg-[var(--yt-success-soft)] text-[var(--yt-success)]"
                : "border-[var(--yt-border)] bg-[var(--yt-surface-muted)] text-[var(--yt-text-muted)]"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <Panel title="Top Ranked Outliers">
        {topOutliers.length === 0 ? (
          <p className="yt-empty-state">No ranked outliers yet. Run competitor refresh jobs so videos can receive outlier and opportunity scores.</p>
        ) : (
          <div className="divide-y divide-[var(--yt-border)] overflow-hidden rounded-[var(--yt-radius-card)] border border-[var(--yt-border)]">
            {topOutliers.map((outlier) => {
              const row = outlier as TopOutlierPresentation;

              return (
                <article className="grid gap-3 bg-white p-3 text-sm lg:grid-cols-[112px_minmax(0,1fr)_auto]" key={row.videoId}>
                  <a
                    aria-label={`Open ${row.title} on YouTube`}
                    className="block aspect-video overflow-hidden rounded-[var(--yt-radius-button)] bg-[var(--yt-surface-soft)]"
                    href={youtubeVideoUrl(row.youtubeVideoId)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {row.thumbnailUrl ? <img alt="" className="h-full w-full object-cover" src={row.thumbnailUrl} /> : null}
                  </a>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="yt-badge">
                        #{row.rank}
                      </span>
                      <span className="text-xs font-bold text-[var(--yt-text-muted)]">{formatDate(row.publishedAt)}</span>
                    </div>
                    <h2 className="mt-2 line-clamp-2 text-base font-bold text-[var(--yt-text)]">{row.title}</h2>
                    <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">{row.channelHandle ?? row.channelTitle}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-[var(--yt-text-secondary)]">
                      <span>{formatCompactNumber(row.viewCount)} views</span>
                      <span>{formatDuration(row.durationSeconds)}</span>
                      <span>{row.multiplier.toFixed(1)}x multiplier</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 lg:min-w-[220px] lg:grid-cols-3 lg:content-center">
                    <div className="yt-subpanel p-2">
                      <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">Opp.</p>
                      <p className="mt-1 text-lg font-extrabold tabular-nums">{formatScore(row.opportunityScore)}</p>
                    </div>
                    <div className="yt-subpanel p-2">
                      <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">Outlier</p>
                      <p className="mt-1 text-lg font-extrabold tabular-nums">{formatScore(row.outlierScore)}</p>
                    </div>
                    <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-success-soft)] bg-[var(--yt-success-soft)] p-2 text-[var(--yt-success)]">
                      <p className="text-[11px] font-bold uppercase tracking-[0.04em]">Lift</p>
                      <p className="mt-1 text-lg font-extrabold tabular-nums">{row.multiplier.toFixed(1)}x</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </main>
  );
}
