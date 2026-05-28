import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getPrismaClient } from "@/lib/db/prisma";
import { getWorkspaceResearchReportDetail } from "@/lib/reports/queries";
import { getReportSectionThumbnailUrl } from "@/lib/reports/section-media";
import { createClient } from "@/lib/supabase/server";

function redirectTo(url: string): never {
  redirect(url as never);
}

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>;
  searchParams?: Promise<{ export?: string; format?: string; error?: string }>;
}) {
  const { reportId } = await params;
  const query = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirectTo("/sign-in");
  }

  const { workspaceId } = await bootstrapUserWorkspace(user);
  const prisma = getPrismaClient();
  const report = await getWorkspaceResearchReportDetail(prisma, {
    workspaceId,
    reportId,
  });

  if (!report) {
    notFound();
  }

  const executiveSummary = objectValue(report.sections.executiveSummary);
  const keySignals = stringArray(executiveSummary?.keySignals);
  const exportNotice = exportNoticeText(query.export, query.format);

  return (
    <main className="space-y-5 p-5 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-sm font-bold text-[var(--yt-primary)]" href="/app/reports">
            Back to reports
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{displayReportTitle(report.title)}</h1>
          <p className="mt-1 text-sm text-[var(--yt-text-muted)]">
            {report.manualRun ? "Generated on demand" : "Scheduled"} · {report.status} · {formatDate(report.reportDate)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {report.status === "COMPLETED" ? (
            <>
              <ExportRequestButton fileType="pdf" reportId={report.id} />
              <ExportRequestButton fileType="docx" reportId={report.id} />
              <Link
                className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-4 py-2 text-sm font-bold text-[var(--yt-text-secondary)]"
                href={`/api/reports/${report.id}/export/markdown`}
              >
                Export Markdown
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {exportNotice ? (
        <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-primary-soft)] bg-[var(--yt-primary-soft)] p-4 text-sm font-bold text-[var(--yt-primary-hover)]">
          {exportNotice}
        </section>
      ) : null}
      {query.error === "EXPORT_REQUEST_FAILED" ? (
        <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-danger-soft)] bg-[var(--yt-danger-soft)] p-4 text-sm font-bold text-[var(--yt-danger)]">
          Export request failed. Confirm the report is complete and try again.
        </section>
      ) : null}
      {report.errorMessage ? (
        <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-danger-soft)] bg-[var(--yt-danger-soft)] p-4 text-sm font-bold text-[var(--yt-danger)]">
          {report.errorMessage}
        </section>
      ) : null}

      <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
        <div className="border-b border-[var(--yt-border)] p-4">
          <h2 className="text-base font-bold">Executive Summary</h2>
        </div>
        <div className="p-4">
          <p className="text-sm leading-6 text-[var(--yt-text-secondary)]">
            {report.summary ?? stringValue(executiveSummary?.headline) ?? "No summary stored for this report yet."}
          </p>
          {keySignals.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {keySignals.map((signal) => (
                <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] px-2 py-1 text-xs font-bold text-[var(--yt-text-secondary)]" key={signal}>
                  {signal}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5">
          <RecommendationList recommendations={report.recommendations} />
          <SectionList
            showThumbnails
            title="Competitor Uploads"
            items={recordArray(report.sections.competitorUploads)}
          />
          <SectionList
            collapsible
            showThumbnails
            title="Recent Outliers"
            items={recordArray(report.sections.outliers)}
          />
          <SectionList title="Industry News" items={recordArray(report.sections.industryNews)} />
        </div>

        <aside className="space-y-5">
          <TrendList title="Top Competitor Trends" items={recordArray(report.sections.competitorTrends)} />
          <TextList title="Content Gaps" items={stringArray(report.sections.contentGaps)} />
          <TextList title="Recommended Actions" items={stringArray(report.sections.recommendedActions)} />
        </aside>
      </section>

    </main>
  );
}

function ExportRequestButton({ reportId, fileType }: { reportId: string; fileType: "pdf" | "docx" }) {
  return (
    <form action={`/api/reports/${reportId}/exports/request`} method="post">
      <input name="fileType" type="hidden" value={fileType} />
      <button
        className="rounded-[var(--yt-radius-button)] border border-[var(--yt-primary)] bg-white px-4 py-2 text-sm font-bold uppercase text-[var(--yt-primary)]"
        type="submit"
      >
        Export {fileType}
      </button>
    </form>
  );
}

function displayReportTitle(title: string): string {
  return title
    .replace(/^Manual research report/i, "Research report")
    .replace(/^Daily research report/i, "Research report");
}

type ReportRecommendation = NonNullable<Awaited<ReturnType<typeof getWorkspaceResearchReportDetail>>>["recommendations"][number];

function RecommendationList({ recommendations }: { recommendations: ReportRecommendation[] }) {
  if (recommendations.length === 0) {
    return (
      <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
        <div className="border-b border-[var(--yt-border)] p-4">
          <h2 className="text-base font-bold">Recommended Topics</h2>
        </div>
        <p className="p-4 text-sm text-[var(--yt-text-muted)]">No topic recommendations are attached to this report.</p>
      </section>
    );
  }

  return (
    <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--yt-border)] p-4">
        <div>
          <h2 className="text-base font-bold">Recommended Topics</h2>
          <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">
            Evidence-backed ideas generated from this report context.
          </p>
        </div>
        <span className="yt-badge">{recommendations.length} ideas</span>
      </div>
      <div className="divide-y divide-[var(--yt-border)]">
        {recommendations.map((recommendation, index) => {
          const thumbnailUrl = recommendation.evidences.find((evidence) => evidence.video?.thumbnailUrl)?.video?.thumbnailUrl ?? null;

          return (
            <article className="grid gap-3 p-4 text-sm sm:grid-cols-[128px_1fr]" key={recommendation.id}>
              <div className="aspect-video overflow-hidden rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)]">
                {thumbnailUrl ? (
                  <img
                    alt={`${recommendation.topic} thumbnail`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    src={thumbnailUrl}
                  />
                ) : (
                  <div className="flex h-full flex-col justify-between p-3">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">
                      Thumbnail concept
                    </span>
                    <p className="line-clamp-3 text-xs font-bold leading-5 text-[var(--yt-text-secondary)]">
                      {recommendation.thumbnailConcept ?? recommendation.suggestedTitle ?? recommendation.topic}
                    </p>
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-extrabold tabular-nums text-[var(--yt-text-faint)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="yt-score h-8 min-h-8 min-w-8 text-xs">
                    {formatScore(recommendation.opportunityScore)}
                  </span>
                </div>
                <h3 className="mt-2 font-bold text-[var(--yt-text)]">{recommendation.topic}</h3>
                {recommendation.angle ? <p className="mt-1 text-[var(--yt-text-secondary)]">{recommendation.angle}</p> : null}
                {recommendation.whyNow ? (
                  <p className="mt-2 text-xs font-semibold text-[var(--yt-text-muted)]">Why now: {recommendation.whyNow}</p>
                ) : null}
                {recommendation.suggestedTitle ? (
                  <p className="mt-2 text-xs font-bold text-[var(--yt-text)]">Suggested title: {recommendation.suggestedTitle}</p>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SectionList({
  title,
  items,
  collapsible = false,
  showThumbnails = false,
}: {
  title: string;
  items: Array<Record<string, unknown>>;
  collapsible?: boolean;
  showThumbnails?: boolean;
}) {
  const content = <SectionListContent items={items} showThumbnails={showThumbnails} title={title} />;

  if (collapsible) {
    return (
      <details
        className="group rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]"
        open
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-[var(--yt-border)] p-4 [&::-webkit-details-marker]:hidden">
          <h2 className="text-base font-bold">{title}</h2>
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] text-sm font-bold text-[var(--yt-text-secondary)] transition-transform group-open:rotate-90"
          >
            {">"}
          </span>
        </summary>
        {content}
      </details>
    );
  }

  return (
    <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
      <div className="border-b border-[var(--yt-border)] p-4">
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      {content}
    </section>
  );
}

function SectionListContent({
  title,
  items,
  showThumbnails,
}: {
  title: string;
  items: Array<Record<string, unknown>>;
  showThumbnails: boolean;
}) {
  if (items.length === 0) {
    return <p className="p-4 text-sm text-[var(--yt-text-muted)]">No items stored for this section.</p>;
  }

  return (
    <div className="divide-y divide-[var(--yt-border)]">
      {items.map((item, index) => {
        const thumbnailUrl = showThumbnails ? getReportSectionThumbnailUrl(item) : null;

        return (
          <article
            className={`grid gap-3 p-4 text-sm ${thumbnailUrl ? "sm:grid-cols-[128px_1fr]" : ""}`}
            key={`${title}-${index}`}
          >
            {thumbnailUrl ? (
              <a
                className="block aspect-video overflow-hidden rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)]"
                href={stringValue(item.youtubeUrl) ?? stringValue(item.url) ?? "#"}
                rel="noreferrer"
                target="_blank"
              >
                <img
                  alt={stringValue(item.title) ?? "Report section thumbnail"}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  src={thumbnailUrl}
                />
              </a>
            ) : null}
            <div>
              <h3 className="font-bold text-[var(--yt-text)]">
                <ReportSectionTitle item={item} />
              </h3>
              <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">
                {[stringValue(item.channelTitle), stringValue(item.sourceName), stringValue(item.publishedAt)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {stringValue(item.summary) ? (
                <p className="mt-2 text-[var(--yt-text-secondary)]">{stringValue(item.summary)}</p>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ReportSectionTitle({ item }: { item: Record<string, unknown> }) {
  const label = stringValue(item.title) ?? stringValue(item.topic) ?? "Untitled signal";
  const url = stringValue(item.youtubeUrl) ?? stringValue(item.url);

  if (!url) {
    return label;
  }

  return (
    <a className="text-[var(--yt-primary)] hover:text-[var(--yt-primary-hover)]" href={url} rel="noreferrer" target="_blank">
      {label}
    </a>
  );
}

function TextList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
      <div className="border-b border-[var(--yt-border)] p-4">
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="p-4 text-sm text-[var(--yt-text-muted)]">No items stored for this section.</p>
      ) : (
        <ul className="space-y-2 p-4 text-sm leading-6 text-[var(--yt-text-secondary)]">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TrendList({ title, items }: { title: string; items: Array<Record<string, unknown>> }) {
  return (
    <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
      <div className="border-b border-[var(--yt-border)] p-4">
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="p-4 text-sm text-[var(--yt-text-muted)]">No competitor uploads were available for trend analysis.</p>
      ) : (
        <div className="divide-y divide-[var(--yt-border)]">
          {items.slice(0, 5).map((item, index) => {
            const titleLabel = stringValue(item.title) ?? `Trend ${index + 1}`;
            const summary = stringValue(item.summary);
            const videoCount = numberValue(item.videoCount);
            const channelCount = numberValue(item.channelCount);
            const supportingTitles = stringArray(item.supportingTitles);

            return (
              <article className="p-4 text-sm" key={`${titleLabel}-${index}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--yt-radius-pill)] bg-[var(--yt-primary-soft)] text-xs font-bold text-[var(--yt-primary)]">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-bold text-[var(--yt-text)]">{titleLabel}</h3>
                    {summary ? <p className="mt-1 text-[var(--yt-text-secondary)]">{summary}</p> : null}
                    <p className="mt-2 text-xs font-semibold text-[var(--yt-text-muted)]">
                      {[
                        videoCount === null ? null : `${videoCount} video${videoCount === 1 ? "" : "s"}`,
                        channelCount === null ? null : `${channelCount} channel${channelCount === 1 ? "" : "s"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {supportingTitles.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--yt-text-muted)]">
                        {supportingTitles.map((supportingTitle) => (
                          <li key={supportingTitle}>{supportingTitle}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function formatScore(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  return value.toFixed(0);
}

function exportNoticeText(status: string | undefined, fileType: string | undefined): string | null {
  const label = fileType === "pdf" || fileType === "docx" ? fileType.toUpperCase() : "Export";
  if (status === "queued") {
    return `${label} export queued. Try again in a moment to download the finished file.`;
  }
  if (status === "already_queued") {
    return `${label} export is already queued or running. Try again in a moment.`;
  }
  if (status === "ready") {
    return `${label} export is ready. Click Export ${fileType} again to download it.`;
  }
  if (status === "failed") {
    return `${label} export failed. Try again, or check Admin job logs if it keeps failing.`;
  }
  return null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(isRecord)
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
