import { redirect } from "next/navigation";
import { refreshCompetitorBlueprints } from "@/actions/blueprints";
import { generateTopicRecommendations } from "@/actions/recommendations";
import { BlueprintSummaryPanel } from "@/components/blueprints/blueprint-summary-panel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Panel } from "@/components/dashboard/panel";
import { AiOperationSubmit } from "@/components/shared/ai-operation-submit";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getWorkspacePlanEntitlement } from "@/lib/billing/plan-limits";
import { getWorkspaceBlueprintSummaries } from "@/lib/blueprints/queries";
import { getPrismaClient } from "@/lib/db/prisma";
import { getTopWorkspaceOutliers } from "@/lib/outliers/queries";
import { getWorkspaceTopicRecommendations } from "@/lib/recommendations/queries";
import { createClient } from "@/lib/supabase/server";

const INGESTION_JOB_TYPES = ["youtube_channel_backfill", "youtube_recent_refresh"];

type TopOutlierPresentation = Awaited<ReturnType<typeof getTopWorkspaceOutliers>>[number] & {
  thumbnailUrl: string | null;
  channelHandle: string | null;
};

function redirectTo(url: string): never {
  redirect(url as never);
}

function formatCompactNumber(value: bigint | number | null | undefined) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return value.toString();
  }

  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(numberValue);
}

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Not run yet";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatShortDate(value: Date | null | undefined) {
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

function youtubeVideoUrl(youtubeVideoId: string) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeVideoId)}`;
}

function statusClassName(status: string) {
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

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirectTo("/sign-in");
  }

  const { user, workspaceId } = await bootstrapUserWorkspace(supabaseUser);
  const prisma = getPrismaClient();
  const [workspace, account] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        trackedChannels: {
          where: { isActive: true },
          select: {
            youtubeChannelId: true,
          },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { creditBalance: true },
    }),
  ]);

  if (!workspace) {
    throw new Error("Workspace was not found after user bootstrap.");
  }

  const entitlement = await getWorkspacePlanEntitlement(prisma, workspace.id);
  if (!entitlement) {
    throw new Error("Workspace entitlement was not found.");
  }

  const channelIds = workspace.trackedChannels.map((channel) => channel.youtubeChannelId);
  const recentCutoff = new Date();
  recentCutoff.setUTCDate(recentCutoff.getUTCDate() - 21);

  const [recommendations, topOutliers, blueprints, newUploadCount, ingestionJobCounts, latestJobs, recentVideos] = await Promise.all([
    getWorkspaceTopicRecommendations(prisma, { workspaceId: workspace.id, limit: 5 }),
    getTopWorkspaceOutliers(prisma, { workspaceId: workspace.id, limit: 5 }),
    getWorkspaceBlueprintSummaries(prisma, { workspaceId: workspace.id, limit: 4 }),
    prisma.youtubeVideo.count({
      where: {
        youtubeChannelId: {
          in: channelIds,
        },
        publishedAt: {
          gte: recentCutoff,
        },
      },
    }),
    prisma.jobRun.groupBy({
      by: ["status"],
      where: {
        workspaceId: workspace.id,
        jobType: {
          in: INGESTION_JOB_TYPES,
        },
      },
      _count: { _all: true },
    }),
    prisma.jobRun.findMany({
      where: {
        workspaceId: workspace.id,
        jobType: {
          in: INGESTION_JOB_TYPES,
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        jobType: true,
        status: true,
        createdAt: true,
        completedAt: true,
        errorMessage: true,
      },
    }),
    prisma.youtubeVideo.findMany({
      where: {
        youtubeChannelId: {
          in: channelIds,
        },
      },
      orderBy: [{ publishedAt: "desc" }],
      take: 6,
      select: {
        id: true,
        youtubeVideoId: true,
        title: true,
        publishedAt: true,
        thumbnailUrl: true,
        transcriptStatus: true,
        channel: {
          select: {
            title: true,
            handle: true,
          },
        },
        metricSnapshots: {
          orderBy: [{ capturedAt: "desc" }],
          take: 1,
          select: {
            viewCount: true,
            likeCount: true,
            commentCount: true,
          },
        },
      },
    }),
  ]);
  const jobCounts = ingestionJobCounts.reduce(
    (counts, row) => ({
      ...counts,
      [row.status]: row._count._all,
    }),
    {} as Partial<Record<string, number>>,
  );

  return (
    <main className="yt-page">
      <div className="yt-page-head">
        <div>
          <h1 className="yt-page-title">Dashboard</h1>
          <p className="yt-page-subtitle">Live competitor ingestion, cached videos, jobs, and research readiness.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Tracked Channels" note={`${Math.max(entitlement.maxTrackedChannels - workspace.trackedChannels.length, 0)} slots available`} value={`${workspace.trackedChannels.length} / ${entitlement.maxTrackedChannels}`} />
        <KpiCard label="New Uploads" note="Published in the last 21 days" value={String(newUploadCount)} />
        <KpiCard label="Outliers Found" note="Top ranked scored videos" value={String(topOutliers.length)} />
        <KpiCard label="Account Credits" note={`${entitlement.monthlyCredits} monthly plan refill`} value={String(account?.creditBalance ?? 0)} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title="Recommended Topics Today">
          <div className="mb-3 flex justify-end">
            <form action={generateTopicRecommendations}>
              <AiOperationSubmit
                className="yt-btn yt-btn-secondary"
                label="Generate Topics"
                overlayLabel="Generating topic recommendations..."
              />
            </form>
          </div>
          {recommendations.length === 0 ? (
            <p className="yt-empty-state">No topic recommendations yet. Generate a report after outliers, source items, or blueprints are available.</p>
          ) : (
            <div className="divide-y divide-[var(--yt-border)] overflow-hidden rounded-[var(--yt-radius-card)] border border-[var(--yt-border)]">
              {recommendations.map((recommendation, index) => (
                <article className="yt-rec-row bg-white sm:grid-cols-[34px_42px_1fr]" key={recommendation.id}>
                  <div className="text-xs font-extrabold tabular-nums text-[var(--yt-text-faint)]">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="yt-score h-9 min-h-9 w-9 min-w-9 text-xs">
                    {formatScore(recommendation.opportunityScore)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="line-clamp-1 font-bold text-[var(--yt-text)]">{recommendation.topic}</h3>
                    {recommendation.angle ? <p className="mt-1 line-clamp-2 text-xs text-[var(--yt-text-secondary)]">{recommendation.angle}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {recommendation.evidences.slice(0, 2).map((evidence) => (
                        <span className="yt-badge" key={evidence.id}>
                          {evidence.video?.channel.title ?? evidence.sourceItem?.source.name ?? evidence.evidenceType.replaceAll("_", " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="YouTube Ingestion Status">
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            {["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"].map((status) => (
              <div className="yt-subpanel" key={status}>
                <p className="text-xs font-bold text-[var(--yt-text-muted)]">{status}</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums">{jobCounts[status] ?? 0}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 divide-y divide-[var(--yt-border)] overflow-hidden rounded-[var(--yt-radius-card)] border border-[var(--yt-border)]">
            {latestJobs.length === 0 ? (
              <p className="yt-empty-state">No ingestion jobs yet. Add a competitor, then use Fetch Videos on the Competitors page.</p>
            ) : (
              latestJobs.map((job) => (
                <div className="grid gap-2 bg-white p-3 text-sm md:grid-cols-[1fr_auto] md:items-center" key={job.id}>
                  <div>
                    <p className="font-bold text-[var(--yt-text)]">{job.jobType.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">
                      Created {formatDate(job.createdAt)}; completed {formatDate(job.completedAt)}
                    </p>
                    {job.errorMessage ? <p className="mt-1 text-xs font-semibold text-[var(--yt-danger)]">{job.errorMessage}</p> : null}
                  </div>
                  <span className={`w-fit rounded-[var(--yt-radius-pill)] border px-2 py-0.5 text-xs font-bold ${statusClassName(job.status)}`}>
                    {job.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel title="Top Recent Outliers">
          {topOutliers.length === 0 ? (
            <p className="yt-empty-state">No scored outliers yet. Scores appear after competitor refresh jobs calculate opportunity signals.</p>
          ) : (
            <div className="divide-y divide-[var(--yt-border)] overflow-hidden rounded-[var(--yt-radius-card)] border border-[var(--yt-border)]">
              {topOutliers.map((outlier) => {
                const row = outlier as TopOutlierPresentation;

                return (
                  <article className="grid gap-3 bg-white p-3 text-sm sm:grid-cols-[88px_1fr]" key={row.videoId}>
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
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 font-bold text-[var(--yt-text)]">{row.title}</h3>
                          <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">
                            {row.channelHandle ?? row.channelTitle} - {formatShortDate(row.publishedAt)}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-[var(--yt-radius-pill)] border border-[var(--yt-success-soft)] bg-[var(--yt-success-soft)] px-2 py-0.5 text-xs font-bold text-[var(--yt-success)]">
                          {row.multiplier.toFixed(1)}x
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-[var(--yt-text-secondary)]">
                        <span>Opportunity {formatScore(row.opportunityScore)}</span>
                        <span>Outlier {formatScore(row.outlierScore)}</span>
                        <span>{formatCompactNumber(row.viewCount)} views</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-5">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="yt-panel-title">Competitor Blueprint Signals</h2>
          <form action={refreshCompetitorBlueprints}>
            <button
              className="yt-btn yt-btn-secondary"
              type="submit"
            >
              Refresh Blueprints
            </button>
          </form>
        </div>
        <BlueprintSummaryPanel blueprints={blueprints} title="Latest Blueprint Signals" />
      </div>

      <div className="mt-5">
        <Panel title="Latest Cached Competitor Videos">
          {recentVideos.length === 0 ? (
            <p className="yt-empty-state">No competitor videos cached yet. Run Fetch Videos from the Competitors page to test Spec 006 end to end.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {recentVideos.map((video) => {
                const latestSnapshot = video.metricSnapshots[0];

                return (
                  <article className="yt-subpanel grid gap-3 sm:grid-cols-[160px_1fr]" key={video.id}>
                    <a
                      aria-label={`Open ${video.title} on YouTube`}
                      className="block aspect-video overflow-hidden rounded-[var(--yt-radius-button)] bg-[var(--yt-surface-soft)]"
                      href={youtubeVideoUrl(video.youtubeVideoId)}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {video.thumbnailUrl ? (
                        <img alt="" className="h-full w-full object-cover" src={video.thumbnailUrl} />
                      ) : null}
                    </a>
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-sm font-bold text-[var(--yt-text)]">{video.title}</h3>
                      <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">
                        {video.channel.handle ?? video.channel.title} - {formatDate(video.publishedAt)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-[var(--yt-text-secondary)]">
                        <span>{formatCompactNumber(latestSnapshot?.viewCount)} views</span>
                        <span>{formatCompactNumber(latestSnapshot?.likeCount)} likes</span>
                        <span>{video.transcriptStatus} transcript</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}
