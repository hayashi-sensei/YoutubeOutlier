import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  dismissTopicRecommendation,
  generateExperimentalTopicRecommendations,
  generateTopicRecommendations,
  saveRecommendationToCalendar,
  saveTopicRecommendation,
} from "@/actions/recommendations";
import { openRecommendationWorkspace } from "@/actions/content-workspace";
import { BlueprintSummaryPanel } from "@/components/blueprints/blueprint-summary-panel";
import { AiOperationSubmit } from "@/components/shared/ai-operation-submit";
import { requireUserWorkspace } from "@/lib/auth/session";
import { getWorkspaceBlueprintSummaries } from "@/lib/blueprints/queries";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  countWorkspaceTopicRecommendations,
  getWorkspaceTopicRecommendations,
} from "@/lib/recommendations/queries";
import type { TopicRecommendationSummaryRow } from "@/types/recommendations";

const TOPIC_PAGE_SIZE = 15;

function redirectTo(url: string): never {
  redirect(url as never);
}

function formatDate(value: Date | null) {
  if (!value) {
    return "No publish date";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(value);
}

export default async function TopicIdeasPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspaceId } = await requireUserWorkspace("/app/topic-ideas");
  const prisma = getPrismaClient();
  const params = searchParams ? await searchParams : {};
  const page = positiveIntegerParam(params.page) ?? 1;
  const offset = (page - 1) * TOPIC_PAGE_SIZE;
  const [recommendations, recommendationCount, experimentalRecommendations, sourceItems, blueprints] = await Promise.all([
    getWorkspaceTopicRecommendations(prisma, {
      workspaceId,
      limit: TOPIC_PAGE_SIZE,
      offset,
      kind: "STANDARD",
      includeUsed: true,
      includeExpired: true,
    }),
    countWorkspaceTopicRecommendations(prisma, {
      workspaceId,
      kind: "STANDARD",
      includeUsed: true,
      includeExpired: true,
    }),
    getWorkspaceTopicRecommendations(prisma, {
      workspaceId,
      limit: TOPIC_PAGE_SIZE,
      kind: "EXPERIMENTAL",
      includeUsed: true,
      includeExpired: true,
    }),
    prisma.industrySourceItem.findMany({
      where: {
        source: {
          workspaceId,
          isActive: true,
        },
      },
      orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
      take: 6,
      select: {
        id: true,
        title: true,
        url: true,
        summary: true,
        publishedAt: true,
        source: {
          select: {
            name: true,
            url: true,
          },
        },
      },
    }),
    getWorkspaceBlueprintSummaries(prisma, { workspaceId, limit: 4 }),
  ]);
  const totalPages = Math.max(1, Math.ceil(recommendationCount / TOPIC_PAGE_SIZE));
  if (page > totalPages && recommendationCount > 0) {
    redirectTo(`/app/topic-ideas?page=${totalPages}`);
  }

  return (
    <main className="yt-page">
      <div className="mb-6">
        <div className="yt-page-head mb-0">
          <div>
            <h1 className="yt-page-title">Topic Ideas</h1>
            <p className="yt-page-subtitle">
              Evidence-backed recommendations, opportunity scores, and save-to-calendar actions.
            </p>
          </div>
          <form action={generateTopicRecommendations}>
            <AiOperationSubmit
              className="yt-btn yt-btn-primary"
              label="Generate Recommendations"
              overlayLabel="Generating topic recommendations..."
            />
          </form>
        </div>
      </div>

      <section className="yt-panel mb-5">
        <div className="yt-panel-head">
          <div>
            <h2 className="yt-panel-title">Recommended Topics</h2>
            <p className="yt-panel-note">
              Showing up to {TOPIC_PAGE_SIZE} per page. Topics stay here until dismissed.
            </p>
          </div>
          <p className="yt-badge">
            {recommendationCount} total
          </p>
        </div>
        {recommendations.length === 0 ? (
          <p className="yt-empty-state">
            No topic recommendations yet. Generate recommendations after outliers, sources, or blueprint signals are available.
          </p>
        ) : (
          <div className="divide-y divide-[var(--yt-border)]">
            {recommendations.map((recommendation, index) => (
              <RecommendationRow
                index={index}
                key={recommendation.id}
                recommendation={recommendation}
                rowNumber={offset + index + 1}
              />
            ))}
            <PaginationControls
              currentPage={page}
              totalPages={totalPages}
            />
          </div>
        )}
      </section>

      <section className="yt-panel mb-5">
        <div className="yt-panel-head">
          <div>
            <h2 className="yt-panel-title">Try New Things</h2>
            <p className="yt-panel-note">
              Generate 5 more experimental ideas from the same evidence, biased toward novel formats and less obvious angles.
            </p>
          </div>
          <form action={generateExperimentalTopicRecommendations}>
            <AiOperationSubmit
              className="yt-btn yt-btn-secondary"
              label="Generate Try New Things"
              overlayLabel="Generating experimental ideas..."
            />
          </form>
        </div>
        {experimentalRecommendations.length === 0 ? (
          <p className="yt-empty-state">
            No experimental ideas yet. Use this when standard recommendations feel too safe.
          </p>
        ) : (
          <div className="divide-y divide-[var(--yt-border)]">
            {experimentalRecommendations.map((recommendation, index) => (
              <RecommendationRow
                index={index}
                key={recommendation.id}
                recommendation={recommendation}
                rowNumber={index + 1}
              />
            ))}
          </div>
        )}
      </section>

      <section className="yt-panel">
        <div className="yt-panel-head">
          <h2 className="yt-panel-title">Source Evidence Queue</h2>
        </div>
        {sourceItems.length === 0 ? (
          <p className="yt-empty-state">No source items ready yet. Source monitoring will feed this queue before topic generation runs.</p>
        ) : (
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {sourceItems.map((item) => (
              <a
                className="yt-subpanel text-sm hover:border-[var(--yt-border-strong)]"
                href={item.url}
                key={item.id}
                rel="noreferrer"
                target="_blank"
              >
                <p className="text-xs font-bold text-[var(--yt-text-muted)]">{item.source.name ?? item.source.url}</p>
                <h3 className="mt-1 line-clamp-2 font-bold text-[var(--yt-text)]">{item.title}</h3>
                <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">{formatDate(item.publishedAt)}</p>
                {item.summary ? <p className="mt-2 line-clamp-2 text-[var(--yt-text-secondary)]">{item.summary}</p> : null}
              </a>
            ))}
          </div>
        )}
      </section>

      <div className="mt-5">
        <BlueprintSummaryPanel
          blueprints={blueprints}
          title="Winning Patterns To Consider"
          emptyText="Blueprint signals will appear here after competitor outliers are analyzed."
        />
      </div>
    </main>
  );
}

function RecommendationRow({
  index,
  recommendation,
  rowNumber,
}: {
  index: number;
  recommendation: TopicRecommendationSummaryRow;
  rowNumber?: number;
}) {
  return (
    <article className="grid gap-3 p-4 text-sm lg:grid-cols-[44px_58px_1fr_auto] lg:items-start">
      <div className="text-xs font-extrabold tabular-nums text-[var(--yt-text-faint)]">
        {String(rowNumber ?? index + 1).padStart(2, "0")}
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-[var(--yt-radius-button)] border border-[var(--yt-success-soft)] bg-[var(--yt-success-soft)] text-sm font-extrabold text-[var(--yt-success)]">
        {formatScore(recommendation.opportunityScore)}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-[var(--yt-text)]">{recommendation.topic}</h3>
          <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--yt-text-secondary)]">
            {recommendation.status}
          </span>
          {recommendation.kind === "EXPERIMENTAL" ? (
            <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-blue-soft)] bg-[var(--yt-blue-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--yt-blue)]">
              Try new things
            </span>
          ) : null}
        </div>
        {recommendation.angle ? (
          <p className="mt-1 text-[var(--yt-text-secondary)]">{recommendation.angle}</p>
        ) : null}
        {recommendation.whyNow ? (
          <p className="mt-2 text-xs font-semibold text-[var(--yt-text-muted)]">
            Why now: {recommendation.whyNow}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {recommendation.evidences.map((evidence) => (
            <EvidenceBadge evidence={evidence} key={evidence.id} />
          ))}
        </div>
        {recommendation.suggestedTitle ? (
          <p className="mt-3 text-xs font-bold text-[var(--yt-text)]">
            Suggested title: {recommendation.suggestedTitle}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 lg:min-w-44 lg:items-end">
        <RecommendationAction
          action={openRecommendationWorkspace}
          id={recommendation.id}
          label="Create Outline"
          primary
        />
        <details className="group w-full lg:w-auto">
          <summary className="yt-btn yt-btn-ghost min-h-0 cursor-pointer list-none px-3 py-2 text-xs marker:hidden group-open:bg-[var(--yt-surface-muted)]">
            More actions
          </summary>
          <div className="mt-2 grid gap-2 rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-2">
            <RecommendationAction
              action={saveRecommendationToCalendar}
              id={recommendation.id}
              label="Save to Calendar"
            />
            <RecommendationAction
              action={saveTopicRecommendation}
              id={recommendation.id}
              label="Save"
            />
            <RecommendationAction
              action={dismissTopicRecommendation}
              id={recommendation.id}
              label="Dismiss"
            />
          </div>
        </details>
      </div>
    </article>
  );
}

function PaginationControls({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number;
}) {
  if (totalPages <= 1) {
    return null;
  }

  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  return (
    <nav
      aria-label="Topic ideas pagination"
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
    >
      <p className="font-semibold text-[var(--yt-text-muted)]">
        Page {currentPage} of {totalPages}
      </p>
      <div className="flex flex-wrap gap-2">
        <PaginationLink disabled={currentPage === 1} href={`/app/topic-ideas?page=${previousPage}`}>
          Previous
        </PaginationLink>
        {paginationPages(currentPage, totalPages).map((page) => (
          <PaginationLink
            active={page === currentPage}
            href={`/app/topic-ideas?page=${page}`}
            key={page}
          >
            {page}
          </PaginationLink>
        ))}
        <PaginationLink disabled={currentPage === totalPages} href={`/app/topic-ideas?page=${nextPage}`}>
          Next
        </PaginationLink>
      </div>
    </nav>
  );
}

function PaginationLink({
  active = false,
  children,
  disabled = false,
  href,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  href: string;
}) {
  if (disabled) {
    return (
      <span className="yt-btn yt-btn-ghost text-[var(--yt-text-faint)]">
        {children}
      </span>
    );
  }

  return (
    <a
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "yt-btn yt-btn-primary"
          : "yt-btn yt-btn-ghost"
      }
      href={href}
    >
      {children}
    </a>
  );
}

function paginationPages(currentPage: number, totalPages: number): number[] {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function EvidenceBadge({
  evidence,
}: {
  evidence: TopicRecommendationSummaryRow["evidences"][number];
}) {
  const label =
    evidence.video?.channel.handle ??
    evidence.video?.channel.title ??
    evidence.sourceItem?.source.name ??
    evidence.sourceItem?.source.url ??
    evidence.evidenceType.replaceAll("_", " ");

  return (
    <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] px-2 py-1 text-[11px] font-bold text-[var(--yt-text-secondary)]">
      {label}
    </span>
  );
}

function RecommendationAction({
  action,
  id,
  label,
  primary = false,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <form action={action}>
      <input name="recommendationId" type="hidden" value={id} />
      <button
        className={
          primary
            ? "yt-btn yt-btn-primary"
            : "yt-btn yt-btn-ghost"
        }
        type="submit"
      >
        {label}
      </button>
    </form>
  );
}

function formatScore(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  return value.toFixed(0);
}

function stringParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return undefined;
}

function positiveIntegerParam(value: string | string[] | undefined): number | undefined {
  const text = stringParam(value);
  if (!text) {
    return undefined;
  }

  const number = Number(text);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}
