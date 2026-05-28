import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { refreshCompetitorChannelBlueprint } from "@/actions/blueprints";
import { runCompetitorChannelBackfill } from "@/actions/competitors";
import { openRecommendationWorkspace } from "@/actions/content-workspace";
import { generateChannelTopicRecommendations } from "@/actions/recommendations";
import { AiOperationSubmit } from "@/components/shared/ai-operation-submit";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getCompetitorChannelIntelligence } from "@/lib/competitors/channel-intelligence";
import { getPrismaClient } from "@/lib/db/prisma";
import { getWorkspaceTopicRecommendations } from "@/lib/recommendations/queries";
import { createClient } from "@/lib/supabase/server";
import type { TopicRecommendationSummaryRow } from "@/types/recommendations";

function redirectTo(url: string): never {
  redirect(url as never);
}

function formatCompactNumber(value: bigint | number | null | undefined) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(Number(value));
}

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Not fetched";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatScore(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(0) : "n/a";
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

export default async function CompetitorIntelligencePage({
  params,
  searchParams,
}: {
  params: Promise<{ trackedChannelId: string }>;
  searchParams: Promise<{ cachedPage?: string; report?: string }>;
}) {
  const { trackedChannelId } = await params;
  const query = await searchParams;
  const cachedPage = Math.max(1, Number.parseInt(query.cachedPage ?? "1", 10) || 1);
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirectTo("/sign-in");
  }

  const { workspaceId } = await bootstrapUserWorkspace(supabaseUser);
  const prisma = getPrismaClient();
  const intelligence = await getCompetitorChannelIntelligence(prisma, {
    workspaceId,
    trackedChannelId,
    cachedVideoPage: cachedPage,
    cachedVideoPageSize: 25,
  });

  if (!intelligence) {
    notFound();
  }

  const displayName = intelligence.nickname ?? intelligence.channel.title;
  const channelTopicIdeas = await getWorkspaceTopicRecommendations(prisma, {
    workspaceId,
    limit: 5,
    reportId: typeof query.report === "string" ? query.report : undefined,
    sourceTrackedChannelId: trackedChannelId,
  });

  return (
    <main className="space-y-5 p-5 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-sm font-bold text-[var(--yt-primary)]" href="/app/competitors">
            Back to competitors
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{displayName}</h1>
          <p className="mt-1 text-sm text-[var(--yt-text-muted)]">
            {intelligence.channel.handle ?? intelligence.channel.youtubeChannelId} · {intelligence.channel.title}
          </p>
          {intelligence.reason ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--yt-text-secondary)]">{intelligence.reason}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <form action={generateChannelTopicRecommendations}>
            <input name="trackedChannelId" type="hidden" value={intelligence.trackedChannelId} />
            <AiOperationSubmit
              className="yt-btn yt-btn-primary"
              label="Suggest Channel Topics"
              overlayLabel="Generating channel topic ideas..."
            />
          </form>
          <details className="group">
            <summary className="yt-btn yt-btn-ghost cursor-pointer list-none marker:hidden group-open:bg-[var(--yt-surface-muted)]">
              Refresh data
            </summary>
            <div className="mt-2 grid gap-2 rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-2 shadow-[var(--yt-shadow-soft)]">
              <form action={runCompetitorChannelBackfill}>
                <input name="trackedChannelId" type="hidden" value={intelligence.trackedChannelId} />
                <button className="yt-btn yt-btn-secondary w-full" type="submit">
                  Fetch Videos
                </button>
              </form>
              <form action={refreshCompetitorChannelBlueprint}>
                <input name="trackedChannelId" type="hidden" value={intelligence.trackedChannelId} />
                <button className="yt-btn yt-btn-ghost w-full" type="submit">
                  Regenerate Blueprint
                </button>
              </form>
            </div>
          </details>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Emulation Score" value={formatScore(intelligence.stats.emulationScore)} />
        <StatCard label="Subscribers" value={formatCompactNumber(intelligence.channel.subscriberCount)} />
        <StatCard label="Baseline Views" value={formatCompactNumber(intelligence.stats.baselineViews)} />
        <StatCard label="Cached Videos" value={String(intelligence.stats.cachedVideos)} />
        <StatCard label="Top Lift" value={intelligence.stats.topMultiplier ? `${intelligence.stats.topMultiplier.toFixed(1)}x` : "n/a"} />
        <StatCard label="Average Lift" value={intelligence.stats.averageMultiplier ? `${intelligence.stats.averageMultiplier.toFixed(1)}x` : "n/a"} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
          <div className="border-b border-[var(--yt-border)] p-4">
            <h2 className="text-base font-bold">Channel Outliers</h2>
            <p className="mt-1 text-sm text-[var(--yt-text-muted)]">Top videos for this competitor, ranked by workspace opportunity and outlier strength.</p>
          </div>
          {intelligence.topOutliers.length === 0 ? (
            <p className="p-4 text-sm text-[var(--yt-text-muted)]">No outliers scored for this channel yet. Fetch videos and update outlier scoring first.</p>
          ) : (
            <div className="divide-y divide-[var(--yt-border)]">
              {intelligence.topOutliers.map((outlier) => (
                <a
                  className="grid gap-3 p-4 text-sm hover:bg-[var(--yt-surface-muted)] md:grid-cols-[112px_1fr_auto]"
                  href={youtubeVideoUrl(outlier.youtubeVideoId)}
                  key={outlier.videoId}
                  rel="noreferrer"
                  target="_blank"
                >
                  <div className="aspect-video overflow-hidden rounded-[var(--yt-radius-button)] bg-[var(--yt-surface-soft)]">
                    {outlier.thumbnailUrl ? <img alt="" className="h-full w-full object-cover" src={outlier.thumbnailUrl} /> : null}
                  </div>
                  <div>
                    <h3 className="line-clamp-2 font-bold text-[var(--yt-text)]">{outlier.title}</h3>
                    <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">{formatDate(outlier.publishedAt)}</p>
                    <p className="mt-2 text-xs font-bold text-[var(--yt-text-secondary)]">
                      {formatCompactNumber(outlier.viewCount)} views · {formatDuration(outlier.durationSeconds)} · {outlier.multiplier ? `${outlier.multiplier.toFixed(1)}x lift` : "lift n/a"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:min-w-36">
                    <MiniScore label="Opp." value={formatScore(outlier.opportunityScore)} />
                    <MiniScore label="Outlier" value={formatScore(outlier.outlierScore)} />
                  </div>
                </a>
              ))}
            </div>
          )}
          <details className="border-t border-[var(--yt-border)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[var(--yt-text)] hover:bg-[var(--yt-surface-muted)]">
              Cached Videos - latest 25 ({intelligence.cachedVideoPage.total} total)
            </summary>
            {intelligence.cachedVideos.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-[var(--yt-text-muted)]">No cached videos for this channel yet.</p>
            ) : (
              <>
                <div className="divide-y divide-[var(--yt-border)] border-t border-[var(--yt-border)]">
                  {intelligence.cachedVideos.map((video) => (
                    <a
                      className="grid gap-3 p-4 text-sm hover:bg-[var(--yt-surface-muted)] md:grid-cols-[88px_1fr_auto]"
                      href={youtubeVideoUrl(video.youtubeVideoId)}
                      key={video.videoId}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <div className="aspect-video overflow-hidden rounded-[var(--yt-radius-button)] bg-[var(--yt-surface-soft)]">
                        {video.thumbnailUrl ? <img alt="" className="h-full w-full object-cover" src={video.thumbnailUrl} /> : null}
                      </div>
                      <div>
                        <h3 className="line-clamp-2 font-bold text-[var(--yt-text)]">{video.title}</h3>
                        <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">{formatDate(video.publishedAt)}</p>
                        <p className="mt-2 text-xs font-bold text-[var(--yt-text-secondary)]">
                          {formatCompactNumber(video.viewCount)} views · {formatDuration(video.durationSeconds)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-start gap-2 md:justify-end">
                        {video.multiplier ? (
                          <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-success-soft)] bg-[var(--yt-success-soft)] px-2 py-1 text-xs font-extrabold text-[var(--yt-success)]">
                            {video.multiplier.toFixed(1)}x lift
                          </span>
                        ) : (
                          <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] px-2 py-1 text-xs font-bold text-[var(--yt-text-muted)]">
                            unscored
                          </span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--yt-border)] px-4 py-3 text-sm">
                  <p className="font-semibold text-[var(--yt-text-muted)]">
                    Page {intelligence.cachedVideoPage.page} of {intelligence.cachedVideoPage.totalPages}
                  </p>
                  <div className="flex gap-2">
                    {intelligence.cachedVideoPage.page > 1 ? (
                      <Link
                        className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--yt-text-secondary)]"
                        href={`/app/competitors/${intelligence.trackedChannelId}?cachedPage=${intelligence.cachedVideoPage.page - 1}`}
                      >
                        Previous 25
                      </Link>
                    ) : null}
                    {intelligence.cachedVideoPage.page < intelligence.cachedVideoPage.totalPages ? (
                      <Link
                        className="rounded-[var(--yt-radius-button)] border border-[var(--yt-primary)] bg-white px-3 py-2 text-xs font-bold text-[var(--yt-primary)]"
                        href={`/app/competitors/${intelligence.trackedChannelId}?cachedPage=${intelligence.cachedVideoPage.page + 1}`}
                      >
                        Next 25
                      </Link>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </details>
        </div>

        <aside className="space-y-5">
          <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
            <div className="border-b border-[var(--yt-border)] p-4">
              <h2 className="text-base font-bold">Blueprint</h2>
              <p className="mt-1 text-sm text-[var(--yt-text-muted)]">
                Current channel-specific pattern summary for this workspace.
              </p>
            </div>
            {intelligence.blueprint ? (
              <div className="p-4">
                <div className="flex flex-wrap gap-2 text-xs font-bold text-[var(--yt-text-secondary)]">
                  <span className="rounded-[var(--yt-radius-pill)] bg-[var(--yt-surface-muted)] px-2 py-1">
                    {intelligence.blueprint.videoCount} videos
                  </span>
                  <span className="rounded-[var(--yt-radius-pill)] bg-[var(--yt-surface-muted)] px-2 py-1">
                    Avg {formatScore(intelligence.blueprint.averageOutlierScore)}
                  </span>
                  <span className="rounded-[var(--yt-radius-pill)] bg-[var(--yt-surface-muted)] px-2 py-1">
                    {formatDate(intelligence.blueprint.generatedAt)}
                  </span>
                </div>
                {intelligence.blueprint.summary ? (
                  <p className="mt-3 text-sm leading-6 text-[var(--yt-text-secondary)]">{intelligence.blueprint.summary}</p>
                ) : null}
                <div className="mt-4 grid gap-3">
                  <BlueprintPatternGroup label="Content pillars" values={intelligence.blueprint.contentPillars} />
                  <BlueprintPatternGroup label="Title patterns" values={intelligence.blueprint.titlePatterns} />
                  <BlueprintPatternGroup label="Hook patterns" values={intelligence.blueprint.hookPatterns} />
                  <BlueprintPatternGroup label="Thumbnail patterns" values={intelligence.blueprint.thumbnailPatterns} />
                  <BlueprintPatternGroup label="Structure patterns" values={intelligence.blueprint.structurePatterns} />
                  <BlueprintPatternGroup label="CTA patterns" values={intelligence.blueprint.ctaPatterns} />
                  <BlueprintPatternGroup label="Emotional angles" values={intelligence.blueprint.emotionalAngles} />
                </div>
                {intelligence.blueprint.observations.length > 0 ? (
                  <details className="mt-4 rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)]">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-[var(--yt-text)]">
                      Video-level blueprint notes
                    </summary>
                    <div className="divide-y divide-[var(--yt-border)] border-t border-[var(--yt-border)]">
                      {intelligence.blueprint.observations.slice(0, 5).map((observation, index) => (
                        <article className="p-3 text-sm" key={`${observation.videoTitle ?? "observation"}-${index}`}>
                          <h3 className="font-bold text-[var(--yt-text)]">
                            {observation.videoTitle ?? observation.topic ?? `Observation ${index + 1}`}
                          </h3>
                          <div className="mt-2 grid gap-2 text-xs text-[var(--yt-text-secondary)]">
                            <BlueprintObservationLine label="Topic" value={observation.topic} />
                            <BlueprintObservationLine label="Pillar" value={observation.contentPillar} />
                            <BlueprintObservationLine label="Hook" value={observation.hookType} />
                            <BlueprintObservationLine label="Title" value={observation.titlePattern} />
                            <BlueprintObservationLine label="Thumbnail" value={observation.thumbnailPattern} />
                            <BlueprintObservationLine label="CTA" value={observation.ctaPattern} />
                            <BlueprintObservationLine label="Emotion" value={observation.emotionalAngle} />
                            <BlueprintObservationLine label="Structure" value={observation.structure?.join(" -> ")} />
                            <BlueprintObservationLine label="Production" value={observation.productionNotes?.join("; ")} />
                          </div>
                        </article>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            ) : (
              <p className="p-4 text-sm text-[var(--yt-text-muted)]">No blueprint yet. Regenerate after this channel has analyzed outliers.</p>
            )}
          </section>

          <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]">
            <h2 className="text-base font-bold">Freshness</h2>
            <div className="mt-3 space-y-2 text-sm">
              <p>
                <span className="font-bold">Channel fetched:</span>{" "}
                <span className="text-[var(--yt-text-muted)]">{formatDate(intelligence.channel.lastFetchedAt)}</span>
              </p>
              <p>
                <span className="font-bold">Latest ingestion:</span>{" "}
                <span className="text-[var(--yt-text-muted)]">
                  {intelligence.latestIngestionJob
                    ? `${intelligence.latestIngestionJob.status} · ${formatDate(intelligence.latestIngestionJob.createdAt)}`
                    : "No job yet"}
                </span>
              </p>
              {intelligence.latestIngestionJob?.errorMessage ? (
                <p className="font-bold text-[var(--yt-danger)]">{intelligence.latestIngestionJob.errorMessage}</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
            <div className="border-b border-[var(--yt-border)] p-4">
              <h2 className="text-base font-bold">Channel Topic Ideas</h2>
              <p className="mt-1 text-sm text-[var(--yt-text-muted)]">
                Suggestions generated from this competitor's outliers and blueprint.
              </p>
            </div>
            {channelTopicIdeas.length === 0 ? (
              <p className="p-4 text-sm text-[var(--yt-text-muted)]">
                No channel-specific ideas yet. Use Suggest Channel Topics to generate five ideas for this competitor.
              </p>
            ) : (
              <div className="divide-y divide-[var(--yt-border)]">
                {channelTopicIdeas.map((recommendation) => (
                  <ChannelTopicIdeaCard key={recommendation.id} recommendation={recommendation} />
                ))}
              </div>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]">
      <p className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function MiniScore({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function BlueprintPatternGroup({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">{label}</p>
      {values.length === 0 ? (
        <p className="mt-2 text-xs font-semibold text-[var(--yt-text-muted)]">Not enough signal yet.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.slice(0, 8).map((value) => (
            <span
              className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-white px-2 py-1 text-xs font-bold text-[var(--yt-text-secondary)]"
              key={value}
            >
              {value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BlueprintObservationLine({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }

  return (
    <p>
      <span className="font-bold text-[var(--yt-text)]">{label}:</span> {value}
    </p>
  );
}

function ChannelTopicIdeaCard({ recommendation }: { recommendation: TopicRecommendationSummaryRow }) {
  return (
    <article className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-sm font-extrabold leading-6 text-[var(--yt-text)]">{recommendation.title}</h3>
        {typeof recommendation.opportunityScore === "number" ? (
          <span className="rounded-[var(--yt-radius-pill)] bg-[var(--yt-primary-soft)] px-2 py-1 text-xs font-extrabold text-[var(--yt-primary)]">
            {recommendation.opportunityScore}
          </span>
        ) : null}
      </div>
      {recommendation.angle ? (
        <p className="mt-2 text-sm leading-6 text-[var(--yt-text-secondary)]">{recommendation.angle}</p>
      ) : null}
      {recommendation.suggestedTitle ? (
        <p className="mt-3 text-xs font-bold text-[var(--yt-text-muted)]">
          Suggested title: <span className="text-[var(--yt-text-secondary)]">{recommendation.suggestedTitle}</span>
        </p>
      ) : null}
      {recommendation.evidences.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {recommendation.evidences.slice(0, 2).map((evidence) => (
            <span
              className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] px-2 py-1 text-xs font-semibold text-[var(--yt-text-muted)]"
              key={evidence.id}
            >
              {evidence.video?.title ?? evidence.sourceItem?.title ?? evidence.evidenceType}
            </span>
          ))}
        </div>
      ) : null}
      <form action={openRecommendationWorkspace} className="mt-3">
        <input name="recommendationId" type="hidden" value={recommendation.id} />
        <button
          className="rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-3 py-2 text-xs font-bold text-white"
          type="submit"
        >
          Create Outline
        </button>
      </form>
    </article>
  );
}
