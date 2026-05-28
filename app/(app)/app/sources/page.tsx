import {
  addIndustrySource,
  archiveIndustrySource,
  fetchIndustrySourceItems,
} from "@/actions/sources";
import { requireUserWorkspace } from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";
import { recommendIndustrySources } from "@/lib/sources/recommendations";

function formatDate(value: Date | null) {
  if (!value) {
    return "Never fetched";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

type SourceSearchParams = {
  error?: string;
  details?: string;
};

function getStatusMessage(searchParams: SourceSearchParams) {
  const error = searchParams.error;
  if (!error) {
    return undefined;
  }

  if (error === "SOURCE_FETCH_FAILED") {
    return searchParams.details
      ? `Source fetch failed: ${searchParams.details}`
      : "Source fetch failed. The site may block automated requests or may not expose readable items.";
  }

  if (error === "INVALID_SOURCE_INPUT") {
    return "Enter a valid source URL.";
  }

  if (error === "SOURCE_NOT_FOUND") {
    return "Source was not found or is archived.";
  }

  return "Source action failed.";
}

type SourcesPageProps = {
  searchParams: Promise<SourceSearchParams>;
};

export default async function SourcesPage({ searchParams }: SourcesPageProps) {
  const resolvedSearchParams = await searchParams;
  const statusMessage = getStatusMessage(resolvedSearchParams);
  const { workspaceId } = await requireUserWorkspace("/app/sources");
  const prisma = getPrismaClient();
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      settings: {
        select: {
          primaryNiche: true,
        },
      },
      industrySources: {
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          url: true,
          name: true,
          sourceType: true,
          rssUrl: true,
          isActive: true,
          lastFetchedAt: true,
          _count: {
            select: {
              items: true,
            },
          },
          items: {
            orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
            take: 3,
            select: {
              id: true,
              title: true,
              url: true,
              publishedAt: true,
              summary: true,
            },
          },
        },
      },
    },
  });

  if (!workspace?.settings) {
    throw new Error("Workspace settings were not found after user bootstrap.");
  }

  const activeSources = workspace.industrySources.filter((source) => source.isActive);
  const archivedSources = workspace.industrySources.filter((source) => !source.isActive);
  const recommendedSources = recommendIndustrySources({
    primaryNiche: workspace.settings.primaryNiche,
    existingUrls: new Set(workspace.industrySources.map((source) => source.url)),
  });

  return (
    <main className="yt-page">
      <div className="yt-page-head">
        <div>
          <h1 className="yt-page-title">Industry Sources</h1>
          <p className="yt-page-subtitle">
            Track websites and RSS feeds that can become report evidence and future topic recommendations.
          </p>
        </div>
        <div className="yt-kpi min-h-0 px-4 py-3 text-right">
          <p className="yt-kpi-label">Active Sources</p>
          <p className="yt-kpi-value text-2xl">{activeSources.length}</p>
        </div>
      </div>

      {statusMessage ? (
        <div className="mb-5 rounded-[var(--yt-radius-card)] border border-[var(--yt-danger-soft)] bg-[var(--yt-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--yt-danger)]">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="grid gap-5">
          <SourceList sources={activeSources} title="Active Sources" />
          <SourceList sources={archivedSources} title="Archived Sources" />
        </div>

        <aside className="grid content-start gap-5">
          <section className="yt-panel p-4">
            <h2 className="yt-panel-title">Add Source</h2>
            <form action={addIndustrySource} className="mt-4 space-y-3">
              <label className="grid gap-1 text-sm font-semibold">
                Source URL
                <input
                  className="yt-input font-normal"
                  name="url"
                  placeholder="https://example.com/blog"
                  required
                  type="url"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Name
                <input
                  className="yt-input font-normal"
                  name="name"
                  placeholder="Optional display name"
                />
              </label>
              <button
                className="yt-btn yt-btn-primary w-full"
                type="submit"
              >
                Add Source
              </button>
            </form>
          </section>

          <section className="yt-panel">
            <div className="yt-panel-head">
              <h2 className="yt-panel-title">Suggested Sources</h2>
            </div>
            {recommendedSources.length === 0 ? (
              <p className="yt-empty-state">No new source suggestions for this niche yet.</p>
            ) : (
              <div className="divide-y divide-[var(--yt-border)]">
                {recommendedSources.map((source) => (
                  <article className="p-4 text-sm" key={source.url}>
                    <h3 className="font-bold">{source.name}</h3>
                    <p className="mt-1 break-all text-xs font-semibold text-[var(--yt-text-muted)]">{source.url}</p>
                    <p className="mt-2 text-[var(--yt-text-secondary)]">{source.reason}</p>
                    <form action={addIndustrySource} className="mt-3">
                      <input name="url" type="hidden" value={source.url} />
                      <input name="name" type="hidden" value={source.name} />
                      <button
                        className="yt-btn yt-btn-secondary"
                        type="submit"
                      >
                        Track Source
                      </button>
                    </form>
                  </article>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

type SourceListItem = {
  id: string;
  url: string;
  name: string | null;
  sourceType: string;
  rssUrl: string | null;
  isActive: boolean;
  lastFetchedAt: Date | null;
  _count: {
    items: number;
  };
  items: Array<{
    id: string;
    title: string;
    url: string;
    publishedAt: Date | null;
    summary: string | null;
  }>;
};

function SourceList({ sources, title }: { sources: SourceListItem[]; title: string }) {
  return (
    <section className="yt-panel">
      <div className="yt-panel-head">
        <h2 className="yt-panel-title">{title}</h2>
        <span className="yt-badge">{sources.length} total</span>
      </div>
      {sources.length === 0 ? (
        <p className="yt-empty-state">No sources in this list yet.</p>
      ) : (
        <div className="divide-y divide-[var(--yt-border)]">
          {sources.map((source) => (
            <article className="grid gap-4 p-4 text-sm lg:grid-cols-[1fr_auto]" key={source.id}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-[var(--yt-text)]">{source.name ?? source.url}</h3>
                  <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-soft)] px-2 py-0.5 text-xs font-bold text-[var(--yt-text-muted)]">
                    {source.sourceType}
                  </span>
                  {!source.isActive ? (
                    <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-soft)] px-2 py-0.5 text-xs font-bold text-[var(--yt-text-muted)]">
                      Archived
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 break-all text-xs font-semibold text-[var(--yt-text-muted)]">{source.url}</p>
                {source.rssUrl ? <p className="mt-1 break-all text-xs font-semibold text-[var(--yt-primary)]">RSS: {source.rssUrl}</p> : null}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[var(--yt-text-muted)]">
                  <span>{source._count.items} items cached</span>
                  <span>{formatDate(source.lastFetchedAt)}</span>
                </div>
                {source.items.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {source.items.map((item) => (
                      <a
                        className="rounded-[var(--yt-radius-row)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3 hover:border-[var(--yt-border-strong)]"
                        href={item.url}
                        key={item.id}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <p className="font-bold text-[var(--yt-text)]">{item.title}</p>
                        <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">{formatDate(item.publishedAt)}</p>
                        {item.summary ? <p className="mt-2 line-clamp-2 text-[var(--yt-text-secondary)]">{item.summary}</p> : null}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 self-start lg:justify-end">
                {source.isActive ? (
                  <>
                    <form action={fetchIndustrySourceItems}>
                      <input name="sourceId" type="hidden" value={source.id} />
                      <button
                        className="rounded-[var(--yt-radius-button)] border border-[var(--yt-primary)] bg-white px-3 py-2 text-xs font-bold text-[var(--yt-primary)]"
                        type="submit"
                      >
                        Fetch Items
                      </button>
                    </form>
                    <form action={archiveIndustrySource}>
                      <input name="sourceId" type="hidden" value={source.id} />
                      <button
                        className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--yt-text-secondary)]"
                        type="submit"
                      >
                        Archive
                      </button>
                    </form>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
