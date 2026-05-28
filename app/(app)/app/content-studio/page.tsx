import Link from "next/link";
import { createManualWorkspace, openRecommendationWorkspace } from "@/actions/content-workspace";
import { BlueprintSummaryPanel } from "@/components/blueprints/blueprint-summary-panel";
import { requireUserWorkspace } from "@/lib/auth/session";
import { getWorkspaceBlueprintSummaries } from "@/lib/blueprints/queries";
import { getPrismaClient } from "@/lib/db/prisma";
import { getWorkspaceTopicRecommendations } from "@/lib/recommendations/queries";

export default async function ContentStudioPage() {
  const { workspaceId } = await requireUserWorkspace("/app/content-studio");
  const prisma = getPrismaClient();
  const [blueprints, recommendations, contentItems] = await Promise.all([
    getWorkspaceBlueprintSummaries(prisma, {
      workspaceId,
      limit: 6,
    }),
    getWorkspaceTopicRecommendations(prisma, {
      workspaceId,
      limit: 5,
    }),
    prisma.contentItem.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        title: true,
        status: true,
        sourceType: true,
        updatedAt: true,
        assets: {
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { id: true, assetType: true, title: true, version: true },
        },
      },
    }),
  ]);

  return (
    <main className="yt-page">
      <div className="mb-6">
        <h1 className="yt-page-title">Content Studio</h1>
        <p className="yt-page-subtitle">
          Turn recommendations, channel-specific ideas, and manual topics into versioned content assets.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5">
          <section className="yt-panel p-4">
            <h2 className="yt-panel-title">Manual Topic</h2>
            <p className="yt-panel-note">
              Start a workspace when the idea did not come from a generated recommendation.
            </p>
            <form action={createManualWorkspace} className="mt-3 grid gap-3">
              <label className="grid gap-1 text-sm font-bold">
                Topic
                <input
                  className="yt-input font-normal"
                  name="topic"
                  required
                />
              </label>
              <label className="grid gap-1 text-sm font-bold">
                Angle
                <textarea
                  className="yt-input min-h-24 font-normal"
                  name="angle"
                />
              </label>
              <button
                className="yt-btn yt-btn-primary w-fit"
                type="submit"
              >
                Open Workspace
              </button>
            </form>
          </section>

          <BlueprintSummaryPanel
            blueprints={blueprints}
            title="Competitor Blueprint Context"
          />
        </div>

        <section className="yt-panel p-4">
          <h2 className="yt-panel-title">Recommendation Queue</h2>
          {recommendations.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--yt-text-muted)]">
              Generate topic ideas first, then return here to open a selected workspace.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-[var(--yt-border)]">
              {recommendations.map((recommendation) => (
                <div className="grid gap-3 py-3 text-sm md:grid-cols-[1fr_auto]" key={recommendation.id}>
                  <div>
                    <p className="font-bold">{recommendation.topic}</p>
                    <p className="mt-1 line-clamp-2 text-[var(--yt-text-muted)]">{recommendation.angle}</p>
                  </div>
                  <form action={openRecommendationWorkspace} className="md:justify-self-end">
                    <input name="recommendationId" type="hidden" value={recommendation.id} />
                    <button
                      className="yt-btn yt-btn-secondary"
                      type="submit"
                    >
                      Open Workspace
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="yt-panel mt-5 p-4">
        <h2 className="yt-panel-title">Recent Workspaces</h2>
        {contentItems.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--yt-text-muted)]">No content workspaces created yet.</p>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {contentItems.map((item) => (
              <article
                className="yt-subpanel text-sm"
                key={item.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link className="font-bold text-[var(--yt-primary)]" href={`/app/content-studio/${item.id}`}>
                      {item.title}
                    </Link>
                    <p className="text-xs text-[var(--yt-text-muted)]">
                      {item.status} · {item.sourceType.replaceAll("_", " ")} · {item.updatedAt.toLocaleString()}
                    </p>
                  </div>
                  {item.assets.some((asset) => asset.assetType === "outline") ? (
                    <Link
                      className="yt-btn yt-btn-primary"
                      href={`/app/content-studio/${item.id}#script-context`}
                    >
                      Script Options
                    </Link>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.assets.map((asset) => (
                    <span
                      className="yt-badge"
                      key={asset.id}
                    >
                      {asset.assetType} v{asset.version}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
