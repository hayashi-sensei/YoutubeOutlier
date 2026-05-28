import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  generateWorkspaceRepurposing,
  generateWorkspaceScript,
  generateWorkspaceSection,
  regenerateWorkspaceScriptSection,
  saveEditedScriptAsset,
  saveRepurposingToCalendar,
} from "@/actions/content-workspace";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getAiTaskConfig } from "@/lib/ai/task-config";
import {
  REPURPOSING_FORMAT_LABELS,
  REPURPOSING_SOURCE_LABELS,
  isRepurposingAssetType,
  parseRepurposingOutput,
} from "@/lib/content-workspace/repurposing";
import {
  OPTIONAL_SCRIPT_CONTEXT_ASSET_TYPES,
  type OptionalScriptContextAssetType,
  SCRIPT_ASSET_TYPE,
} from "@/lib/content-workspace/scripts";
import { AiOperationSubmit } from "@/components/shared/ai-operation-submit";
import { getPrismaClient } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";
import type { RepurposingFormat, RepurposingSourceType } from "@/schemas/content-generation";
import { AI_TASK_TYPES } from "@/types/ai";
import { CONTENT_WORKSPACE_SECTION_TYPES, type ContentWorkspaceEvidenceSnapshot, type ContentWorkspaceSectionType } from "@/types/content-workspace";

const SECTION_LABELS: Record<ContentWorkspaceSectionType, string> = {
  outline: "Outline",
  hook: "Hooks",
  titles: "Titles",
  caption: "Captions",
  description: "Description",
};

const OPTIONAL_SCRIPT_CONTEXT_LABELS: Record<OptionalScriptContextAssetType, string> = {
  hook: "Hooks",
  titles: "Titles and patterns",
  caption: "Captions and hashtags",
  description: "Description",
};

const REPURPOSING_FORMATS = Object.keys(REPURPOSING_FORMAT_LABELS) as RepurposingFormat[];
const REPURPOSING_SOURCE_TYPES = Object.keys(REPURPOSING_SOURCE_LABELS) as RepurposingSourceType[];

function redirectTo(url: string): never {
  redirect(url as never);
}

export default async function SelectedContentWorkspacePage({
  params,
}: {
  params: Promise<{ contentItemId: string }>;
}) {
  const { contentItemId } = await params;
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirectTo("/sign-in");
  }

  const { workspaceId } = await bootstrapUserWorkspace(supabaseUser);
  const prisma = getPrismaClient();
  const [contentItem, generations] = await Promise.all([
    prisma.contentItem.findFirst({
      where: { id: contentItemId, workspaceId },
      select: {
        id: true,
        title: true,
        status: true,
        sourceType: true,
        manualTopic: true,
        notes: true,
        evidenceSnapshot: true,
        scheduledFor: true,
        updatedAt: true,
        recommendation: {
          select: {
            id: true,
            topic: true,
            angle: true,
            whyNow: true,
            audiencePainPoint: true,
            opportunityScore: true,
            sourceTrackedChannel: {
              select: {
                id: true,
                nickname: true,
                channel: { select: { title: true, handle: true } },
              },
            },
          },
        },
        assets: {
          orderBy: [{ assetType: "asc" }, { version: "desc" }],
          select: {
            id: true,
            assetType: true,
            title: true,
            body: true,
            jsonBody: true,
            aiGenerationId: true,
            version: true,
            createdAt: true,
          },
        },
        visualAssets: {
          orderBy: { createdAt: "desc" },
          take: 6,
          select: {
            id: true,
            assetType: true,
            provider: true,
            model: true,
            aspectRatio: true,
            imageUrl: true,
            storagePath: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.aiGeneration.findMany({
      where: {
        workspaceId,
        requestJson: {
          path: ["metadata", "contentItemId"],
          equals: contentItemId,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        taskType: true,
        provider: true,
        model: true,
        status: true,
        creditsCharged: true,
        costUsd: true,
        inputTokens: true,
        outputTokens: true,
        errorMessage: true,
        createdAt: true,
        completedAt: true,
      },
    }),
  ]);

  if (!contentItem) {
    notFound();
  }

  const evidence = evidenceFromSnapshot(contentItem.evidenceSnapshot);
  const assetsByType = groupAssetsByType(contentItem.assets);
  const latestScript = assetsByType.get(SCRIPT_ASSET_TYPE)?.[0];
  const scriptBody = latestScript?.body ?? stringifyAsset(latestScript?.jsonBody);
  const scriptSections = objectArray(objectBody(latestScript?.jsonBody).sections);
  const hasOutline = (assetsByType.get("outline") ?? []).length > 0;
  const repurposingAssets = contentItem.assets.filter((asset) => isRepurposingAssetType(asset.assetType));
  const optionalScriptContextAssets = OPTIONAL_SCRIPT_CONTEXT_ASSET_TYPES.flatMap((assetType) => {
    const latest = assetsByType.get(assetType)?.[0];
    return latest ? [{ assetType, latest }] : [];
  });
  const fullScriptCredits = getAiTaskConfig(AI_TASK_TYPES.scriptGeneration, "premium").credits;
  const sectionScriptCredits = getAiTaskConfig(AI_TASK_TYPES.scriptGeneration, "standard").credits;
  const repurposingCredits = getAiTaskConfig(AI_TASK_TYPES.repurposingGeneration, "standard").credits;
  const imageCredits = getAiTaskConfig(AI_TASK_TYPES.imageGeneration, "standard").credits;

  return (
    <main className="yt-workspace grid gap-5 p-5 lg:grid-cols-[0.85fr_1.15fr] lg:p-8">
      <aside className="space-y-5">
        <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]">
          <Link className="text-sm font-bold text-[var(--yt-primary)]" href="/app/content-studio">
            Back to Content Studio
          </Link>
          <h1 className="mt-3 text-2xl font-bold">{contentItem.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-[var(--yt-text-secondary)]">
            <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-soft)] px-2 py-1">
              {contentItem.status}
            </span>
            <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-soft)] px-2 py-1">
              {contentItem.sourceType.replaceAll("_", " ")}
            </span>
            <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-soft)] px-2 py-1">
              {contentItem.scheduledFor ? `Scheduled ${formatDate(contentItem.scheduledFor)}` : "Calendar item"}
            </span>
          </div>
          {contentItem.notes ? (
            <p className="mt-3 text-sm leading-6 text-[var(--yt-text-secondary)]">{contentItem.notes}</p>
          ) : null}
        </section>

        <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]">
          <h2 className="text-base font-bold">Evidence Panel</h2>
          {evidence?.workspace ? (
            <div className="mt-3 rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3 text-sm">
              <EvidenceLine label="Source workspace" value={`${evidence.workspace.name} (${evidence.workspace.planCode})`} />
            </div>
          ) : null}
          {contentItem.recommendation ? (
            <div className="mt-3 space-y-3 text-sm">
              <EvidenceLine label="Topic" value={contentItem.recommendation.topic} />
              <EvidenceLine label="Angle" value={contentItem.recommendation.angle} />
              <EvidenceLine label="Why now" value={contentItem.recommendation.whyNow} />
              <EvidenceLine label="Audience pain" value={contentItem.recommendation.audiencePainPoint} />
              <EvidenceLine
                label="Opportunity"
                value={typeof contentItem.recommendation.opportunityScore === "number" ? contentItem.recommendation.opportunityScore.toFixed(0) : null}
              />
              {contentItem.recommendation.sourceTrackedChannel ? (
                <EvidenceLine
                  label="Channel"
                  value={
                    contentItem.recommendation.sourceTrackedChannel.nickname ??
                    contentItem.recommendation.sourceTrackedChannel.channel.handle ??
                    contentItem.recommendation.sourceTrackedChannel.channel.title
                  }
                />
              ) : null}
            </div>
          ) : (
            <div className="mt-3 space-y-3 text-sm">
              <EvidenceLine label="Manual topic" value={contentItem.manualTopic ?? contentItem.title} />
              <EvidenceLine label="Angle" value={contentItem.notes} />
            </div>
          )}

          {evidence?.channel ? (
            <div className="mt-4 border-t border-[var(--yt-border)] pt-4 text-sm">
              <h3 className="text-sm font-bold">Preserved Channel Context</h3>
              <div className="mt-3 space-y-3">
                <EvidenceLine label="Channel" value={evidence.channel.handle ?? evidence.channel.title} />
                <EvidenceLine label="Tracking reason" value={evidence.channel.reason} />
              </div>
            </div>
          ) : null}

          {evidence?.blueprint ? (
            <div className="mt-4 border-t border-[var(--yt-border)] pt-4 text-sm">
              <h3 className="text-sm font-bold">Preserved Blueprint Context</h3>
              <div className="mt-3 space-y-3">
                <EvidenceLine label="Summary" value={evidence.blueprint.summary} />
                <EvidenceLine label="Videos analyzed" value={String(evidence.blueprint.videoCount)} />
                <EvidenceLine
                  label="Average outlier score"
                  value={typeof evidence.blueprint.averageOutlierScore === "number" ? evidence.blueprint.averageOutlierScore.toFixed(0) : null}
                />
              </div>
            </div>
          ) : null}

          {evidence?.evidences.length ? (
            <div className="mt-4 border-t border-[var(--yt-border)] pt-4">
              <h3 className="text-sm font-bold">Source Context</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {evidence.evidences.map((item) => (
                  <SourceContextLink evidence={item} key={item.id} />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </aside>

      <section className="space-y-5">
        <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">Production Workspace</h2>
              <p className="mt-1 text-sm text-[var(--yt-text-muted)]">
                Generate, review, and version each asset tied to this topic.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex flex-wrap gap-2 text-xs font-bold text-[var(--yt-text-secondary)]">
                <span className="rounded-[var(--yt-radius-pill)] bg-[var(--yt-surface-muted)] px-2 py-1">
                  {contentItem.assets.length} saved versions
                </span>
                <span className="rounded-[var(--yt-radius-pill)] bg-[var(--yt-surface-muted)] px-2 py-1">
                  {generations.length} generation logs
                </span>
              </div>
              <a
                className="rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-3 py-2 text-xs font-bold text-white"
                href="#script-context"
              >
                Script Options
              </a>
            </div>
          </div>
        </section>

        {CONTENT_WORKSPACE_SECTION_TYPES.map((sectionType) => {
          const assets = assetsByType.get(sectionType) ?? [];
          const latest = assets[0];

          return (
            <article
              className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]"
              key={sectionType}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold">{SECTION_LABELS[sectionType]}</h2>
                  {latest ? (
                    <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">
                      Latest version {latest.version} · {formatDateTime(latest.createdAt)}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--yt-text-muted)]">No saved {SECTION_LABELS[sectionType].toLowerCase()} yet.</p>
                  )}
                </div>
                <form action={generateWorkspaceSection}>
                  <input name="contentItemId" type="hidden" value={contentItem.id} />
                  <input name="sectionType" type="hidden" value={sectionType} />
                  <AiOperationSubmit
                    className={sectionGenerationButtonClass(sectionType)}
                    label={`Generate ${SECTION_LABELS[sectionType]}`}
                    overlayLabel={`Generating ${SECTION_LABELS[sectionType].toLowerCase()}...`}
                  />
                </form>
              </div>

              {latest ? <AssetContent asset={latest} sectionType={sectionType} /> : null}

              {assets.length > 1 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {assets.slice(1).map((asset) => (
                    <span
                      className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-soft)] px-2 py-1 text-xs font-bold text-[var(--yt-text-secondary)]"
                      key={asset.id}
                    >
                      v{asset.version}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}

        <article
          className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]"
          id="script-context"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">Script</h2>
              {latestScript ? (
                <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">
                  Latest version {latestScript.version} · {formatDateTime(latestScript.createdAt)}
                </p>
              ) : (
                <p className="mt-1 text-sm text-[var(--yt-text-muted)]">
                  Generate a full script from the selected outline when you are ready to spend {fullScriptCredits} credits.
                </p>
              )}
            </div>
          </div>

          {!hasOutline ? (
            <p className="mt-3 rounded-[var(--yt-radius-card)] border border-[var(--yt-warning-soft)] bg-[var(--yt-warning-soft)] p-3 text-sm font-semibold text-[var(--yt-warning)]">
              Generate an outline first. Scripts use the selected outline, writing style, brand settings, and topic evidence.
            </p>
          ) : null}

          <form action={generateWorkspaceScript} className="mt-4 rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3">
            <input name="contentItemId" type="hidden" value={contentItem.id} />
            <h3 className="text-sm font-bold">Script Context</h3>
            <div className="mt-3 space-y-2 text-sm">
              <label className="flex items-start gap-2 rounded-[var(--yt-radius-card)] bg-white p-2 text-[var(--yt-text-secondary)]">
                <input checked className="mt-1" disabled type="checkbox" />
                <span>
                  <span className="font-bold">Outline</span>
                  <span className="ml-2 text-xs font-semibold text-[var(--yt-text-muted)]">
                    Required for script generation
                  </span>
                </span>
              </label>
              {optionalScriptContextAssets.length > 0 ? (
                optionalScriptContextAssets.map(({ assetType, latest }) => (
                  <label
                    className="flex items-start gap-2 rounded-[var(--yt-radius-card)] bg-white p-2 text-[var(--yt-text-secondary)]"
                    key={assetType}
                  >
                    <input
                      className="mt-1"
                      defaultChecked
                      name="includeAssetTypes"
                      type="checkbox"
                      value={assetType}
                    />
                    <span>
                      <span className="font-bold">{OPTIONAL_SCRIPT_CONTEXT_LABELS[assetType]}</span>
                      <span className="ml-2 text-xs font-semibold text-[var(--yt-text-muted)]">
                        v{latest.version}
                      </span>
                    </span>
                  </label>
                ))
              ) : (
                <p className="rounded-[var(--yt-radius-card)] bg-white p-2 text-sm text-[var(--yt-text-muted)]">
                  No optional generated assets yet. The script will use the outline and evidence context.
                </p>
              )}
            </div>
            <AiOperationSubmit
              className="mt-3 rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!hasOutline}
              label={`Generate Script (${fullScriptCredits} credits)`}
              overlayLabel="Generating full script..."
            />
          </form>

          {latestScript && scriptBody ? (
            <form action={saveEditedScriptAsset} className="mt-4 space-y-3">
              <input name="contentItemId" type="hidden" value={contentItem.id} />
              <label className="grid gap-2 text-sm font-bold">
                Editable Script Draft
                <textarea
                  className="min-h-[420px] rounded-[var(--yt-radius-input)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] px-3 py-2 font-mono text-xs font-normal leading-5 text-[var(--yt-text-secondary)]"
                  name="body"
                  defaultValue={scriptBody}
                />
              </label>
              <button
                className="rounded-[var(--yt-radius-button)] border border-[var(--yt-primary)] px-3 py-2 text-xs font-bold text-[var(--yt-primary)]"
                type="submit"
              >
                Save Edited Script Version
              </button>
            </form>
          ) : null}

          {scriptSections.length > 0 ? (
            <div className="mt-4 space-y-3 border-t border-[var(--yt-border)] pt-4">
              <h3 className="text-sm font-bold">Section Regeneration</h3>
              {scriptSections.map((section, index) => (
                <div
                  className="grid gap-3 rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3 text-sm md:grid-cols-[1fr_auto]"
                  key={`${stringValue(section.heading) ?? "section"}-${index}`}
                >
                  <div>
                    <p className="font-bold text-[var(--yt-text)]">{stringValue(section.heading) ?? `Section ${index + 1}`}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--yt-text-muted)]">{stringValue(section.script)}</p>
                  </div>
                  <form action={regenerateWorkspaceScriptSection} className="md:justify-self-end">
                    <input name="contentItemId" type="hidden" value={contentItem.id} />
                    <input name="sectionIndex" type="hidden" value={index} />
                    <AiOperationSubmit
                      className="rounded-[var(--yt-radius-button)] border border-[var(--yt-primary)] px-3 py-2 text-xs font-bold text-[var(--yt-primary)]"
                      label={`Regenerate (${sectionScriptCredits} credits)`}
                      overlayLabel="Regenerating script section..."
                    />
                  </form>
                </div>
              ))}
            </div>
          ) : null}

          {(assetsByType.get(SCRIPT_ASSET_TYPE)?.length ?? 0) > 1 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {(assetsByType.get(SCRIPT_ASSET_TYPE) ?? []).slice(1).map((asset) => (
                <span
                  className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-soft)] px-2 py-1 text-xs font-bold text-[var(--yt-text-secondary)]"
                  key={asset.id}
                >
                  v{asset.version}
                </span>
              ))}
            </div>
          ) : null}
        </article>

        <article className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">Repurposing Studio</h2>
              <p className="mt-1 text-sm text-[var(--yt-text-muted)]">
                Turn this topic, outline, script, or report context into native LinkedIn, X, and newsletter assets.
              </p>
            </div>
            <span className="rounded-[var(--yt-radius-pill)] bg-[var(--yt-surface-muted)] px-2 py-1 text-xs font-bold text-[var(--yt-text-secondary)]">
              {repurposingCredits} credits
            </span>
          </div>

          <form action={generateWorkspaceRepurposing} className="mt-4 grid gap-3 rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <input name="contentItemId" type="hidden" value={contentItem.id} />
            <label className="grid gap-2 text-sm font-bold">
              Format
              <select className="rounded-[var(--yt-radius-input)] border border-[var(--yt-border)] bg-white px-3 py-2 text-sm font-semibold" name="format" defaultValue="LINKEDIN_THOUGHT_LEADERSHIP">
                {REPURPOSING_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {REPURPOSING_FORMAT_LABELS[format]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Source
              <select className="rounded-[var(--yt-radius-input)] border border-[var(--yt-border)] bg-white px-3 py-2 text-sm font-semibold" name="sourceType" defaultValue={hasOutline ? "outline" : "topic"}>
                {REPURPOSING_SOURCE_TYPES.map((sourceType) => (
                  <option key={sourceType} value={sourceType}>
                    {REPURPOSING_SOURCE_LABELS[sourceType]}
                  </option>
                ))}
              </select>
            </label>
            <AiOperationSubmit
              className="rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-3 py-2 text-xs font-bold text-white"
              label="Generate"
              overlayLabel="Generating repurposed asset..."
            />
          </form>

          {!hasOutline ? (
            <p className="mt-3 rounded-[var(--yt-radius-card)] border border-[var(--yt-warning-soft)] bg-[var(--yt-warning-soft)] p-3 text-sm font-semibold text-[var(--yt-warning)]">
              LinkedIn-from-outline generation unlocks after an outline exists. Topic and report context are available now.
            </p>
          ) : null}

          {repurposingAssets.length > 0 ? (
            <div className="mt-4 space-y-3">
              {repurposingAssets.map((asset) => (
                <RepurposingAssetContent asset={asset} key={asset.id} />
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3 text-sm text-[var(--yt-text-muted)]">
              No repurposed assets saved yet.
            </p>
          )}

          {repurposingAssets.length > 0 ? (
            <form action={saveRepurposingToCalendar} className="mt-4 flex flex-wrap items-end gap-3 border-t border-[var(--yt-border)] pt-4">
              <input name="contentItemId" type="hidden" value={contentItem.id} />
              <label className="grid gap-2 text-sm font-bold">
                Calendar date
                <input
                  className="rounded-[var(--yt-radius-input)] border border-[var(--yt-border)] bg-white px-3 py-2 text-sm font-semibold"
                  name="scheduledFor"
                  type="date"
                  defaultValue={formatDateInput(contentItem.scheduledFor ?? tomorrow())}
                />
              </label>
              <button className="rounded-[var(--yt-radius-button)] border border-[var(--yt-primary)] px-3 py-2 text-xs font-bold text-[var(--yt-primary)]" type="submit">
                Save to Calendar
              </button>
            </form>
          ) : null}
        </article>

        <article className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">Visual Assets</h2>
              <p className="mt-1 text-sm text-[var(--yt-text-muted)]">
                Create thumbnail, LinkedIn, quote, or diagram visuals from this topic context.
              </p>
            </div>
            <a
              className="rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-3 py-2 text-xs font-bold text-white"
              href={`/app/visual-studio?contentItemId=${contentItem.id}`}
            >
              Open Visual Studio ({imageCredits} credits)
            </a>
          </div>

          {contentItem.visualAssets.length === 0 ? (
            <p className="mt-3 rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3 text-sm text-[var(--yt-text-muted)]">
              No visual concepts or image variants saved for this topic yet.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {contentItem.visualAssets.map((asset) => (
                <article className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3 text-sm" key={asset.id}>
                  {asset.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" className="aspect-video w-full rounded-[var(--yt-radius-card)] object-cover" src={asset.imageUrl} />
                  ) : (
                    <div className="grid aspect-video place-items-center rounded-[var(--yt-radius-card)] border border-dashed border-[var(--yt-border)] text-xs font-bold text-[var(--yt-text-muted)]">
                      Strategy saved
                    </div>
                  )}
                  <p className="mt-2 font-bold text-[var(--yt-text)]">{asset.assetType.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">
                    {asset.provider} · {asset.model ?? "default"} · {asset.aspectRatio} · {formatDateTime(asset.createdAt)}
                  </p>
                  {asset.storagePath ? (
                    <p className="mt-1 truncate text-xs text-[var(--yt-text-muted)]">{asset.storagePath}</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </article>

        <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]">
          <h2 className="text-base font-bold">Generation History</h2>
          <p className="mt-1 text-sm text-[var(--yt-text-muted)]">
            These logs are tied to this topic workspace, including failed generations.
          </p>
          {generations.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--yt-text-muted)]">No generation attempts recorded for this topic yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-[var(--yt-border)]">
              {generations.map((generation) => (
                <article className="grid gap-3 py-3 text-sm md:grid-cols-[1fr_auto]" key={generation.id}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-[var(--yt-text)]">{formatTaskType(generation.taskType)}</p>
                      <span className={statusBadgeClass(generation.status)}>{generation.status}</span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">
                      {generation.provider} · {generation.model} · {formatDateTime(generation.createdAt)}
                    </p>
                    {generation.errorMessage ? (
                      <p className="mt-2 rounded-[var(--yt-radius-card)] border border-[var(--yt-danger-soft)] bg-[var(--yt-danger-soft)] p-2 text-xs font-semibold text-[var(--yt-danger)]">
                        {generation.errorMessage}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-xs font-bold text-[var(--yt-text-muted)] md:text-right">
                    <p>{generation.creditsCharged} credits</p>
                    <p>{generation.inputTokens ?? 0} in / {generation.outputTokens ?? 0} out</p>
                    <p>{generation.costUsd ? `$${Number(generation.costUsd).toFixed(4)}` : "$0.0000"}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function EvidenceLine({ label, value }: { label: string; value: string | null }) {
  if (!value) {
    return null;
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">{label}</p>
      <p className="mt-1 leading-6 text-[var(--yt-text-secondary)]">{value}</p>
    </div>
  );
}

function SourceContextLink({
  evidence,
}: {
  evidence: ContentWorkspaceEvidenceSnapshot["evidences"][number];
}) {
  const label = evidence.video?.title ?? evidence.sourceItem?.title ?? evidence.evidenceType;
  const score = evidence.video?.outlier ? ` · ${evidence.video.outlier.outlierScore.toFixed(0)} score` : "";
  const href = sourceContextHref(evidence);
  const className =
    "rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] px-2 py-1 text-xs font-semibold text-[var(--yt-text-muted)] transition hover:border-[var(--yt-border-strong)] hover:text-[var(--yt-primary)]";

  if (!href) {
    return <span className={className}>{label}{score}</span>;
  }

  return (
    <a className={className} href={href} rel="noreferrer" target="_blank">
      {label}
      {score}
    </a>
  );
}

function sourceContextHref(evidence: ContentWorkspaceEvidenceSnapshot["evidences"][number]): string | null {
  if (evidence.video?.youtubeVideoId) {
    return youtubeVideoUrl(evidence.video.youtubeVideoId);
  }

  return evidence.sourceItem?.url ?? null;
}

function youtubeVideoUrl(youtubeVideoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeVideoId)}`;
}

function groupAssetsByType<TAsset extends { assetType: string }>(assets: TAsset[]): Map<string, TAsset[]> {
  const grouped = new Map<string, TAsset[]>();
  for (const asset of assets) {
    const existing = grouped.get(asset.assetType) ?? [];
    existing.push(asset);
    grouped.set(asset.assetType, existing);
  }
  return grouped;
}

function evidenceFromSnapshot(value: unknown): ContentWorkspaceEvidenceSnapshot | null {
  if (!value || typeof value !== "object" || !("evidences" in value)) {
    return null;
  }
  return value as ContentWorkspaceEvidenceSnapshot;
}

function AssetContent({
  asset,
  sectionType,
}: {
  asset: { body: string | null; jsonBody: unknown };
  sectionType: ContentWorkspaceSectionType;
}) {
  const body = objectBody(asset.jsonBody);

  if (sectionType === "outline") {
    return (
      <div className="mt-4 space-y-4">
        <StringList title="Hook Options" values={stringArray(body.hookOptions)} />
        <div className="space-y-3">
          {objectArray(body.sections).map((section, index) => (
            <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3" key={`${stringValue(section.heading) ?? "section"}-${index}`}>
              <h3 className="font-bold text-[var(--yt-text)]">{stringValue(section.heading) ?? `Section ${index + 1}`}</h3>
              <p className="mt-1 text-sm text-[var(--yt-text-secondary)]">{stringValue(section.purpose)}</p>
              <StringList title="Talking Points" values={stringArray(section.talkingPoints)} compact />
            </div>
          ))}
        </div>
        <PlainBlock title="CTA" value={stringValue(body.cta)} />
      </div>
    );
  }

  if (sectionType === "hook") {
    return (
      <div className="mt-4 space-y-4">
        <StringList title="Hooks" values={stringArray(body.hooks)} />
        <PlainBlock title="Rationale" value={stringValue(body.rationale)} />
      </div>
    );
  }

  if (sectionType === "titles") {
    return (
      <div className="mt-4 space-y-4">
        <StringList title="Title Options" values={stringArray(body.titles)} />
        <StringList title="Patterns" values={stringArray(body.titlePatterns)} compact />
      </div>
    );
  }

  if (sectionType === "caption") {
    return (
      <div className="mt-4 space-y-4">
        <StringList title="Captions" values={stringArray(body.captions)} />
        <StringList title="Hashtags" values={stringArray(body.hashtags)} compact />
      </div>
    );
  }

  if (sectionType === "description") {
    return (
      <div className="mt-4 space-y-4">
        <PlainBlock title="Description" value={stringValue(body.description)} />
        <StringList
          title="Chapters"
          values={objectArray(body.chapters).map((chapter) => `${stringValue(chapter.timestamp) ?? "0:00"} - ${stringValue(chapter.label) ?? "Chapter"}`)}
          compact
        />
        <PlainBlock title="Pinned Comment" value={stringValue(body.pinnedComment)} />
      </div>
    );
  }

  return (
    <pre className="mt-4 max-h-96 overflow-auto rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3 text-xs leading-5 text-[var(--yt-text-secondary)]">
      {asset.body ?? JSON.stringify(asset.jsonBody, null, 2)}
    </pre>
  );
}

function PlainBlock({ title, value }: { title: string; value?: string }) {
  if (!value) {
    return null;
  }

  return (
    <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3">
      <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--yt-text-secondary)]">{value}</p>
    </div>
  );
}

function StringList({ title, values, compact = false }: { title: string; values: string[]; compact?: boolean }) {
  if (values.length === 0) {
    return null;
  }

  return (
    <div className={compact ? "mt-3" : "rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3"}>
      <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">{title}</h3>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--yt-text-secondary)]">
        {values.map((value, index) => (
          <li className="grid grid-cols-[20px_1fr] gap-2" key={`${value}-${index}`}>
            <span className="font-bold tabular-nums text-[var(--yt-text-faint)]">{index + 1}.</span>
            <span>{value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RepurposingAssetContent({
  asset,
}: {
  asset: {
    assetType: string;
    title: string | null;
    body: string | null;
    jsonBody: unknown;
    version: number;
    createdAt: Date;
  };
}) {
  const output = parseRepurposingOutput(asset.jsonBody);

  if (!output) {
    return (
      <pre className="max-h-96 overflow-auto rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3 text-xs leading-5 text-[var(--yt-text-secondary)]">
        {asset.body ?? JSON.stringify(asset.jsonBody, null, 2)}
      </pre>
    );
  }

  return (
    <article className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-[var(--yt-text)]">{output.title}</h3>
          <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">
            {REPURPOSING_FORMAT_LABELS[output.format]} · {REPURPOSING_SOURCE_LABELS[output.sourceType]} · v{asset.version} · {formatDateTime(asset.createdAt)}
          </p>
        </div>
      </div>
      <PlainBlock title="Draft" value={output.primaryDraft} />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <PlainBlock title="CTA" value={output.cta} />
        <PlainBlock title="Image Concept" value={`${output.imageConcept.headline}\n\n${output.imageConcept.visualMetaphor}\n\n${output.imageConcept.composition}`} />
      </div>
      <StringList title="Platform Notes" values={output.platformNotes} compact />
      <StringList title="Editable Image Text" values={output.imageConcept.editableTextOverlays} compact />
    </article>
  );
}

function objectBody(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item))
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringifyAsset(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }
  return JSON.stringify(value, null, 2);
}

function formatTaskType(value: string): string {
  return value.replaceAll("_", " ");
}

function statusBadgeClass(status: string): string {
  const base = "rounded-[var(--yt-radius-pill)] border px-2 py-0.5 text-[11px] font-bold";
  if (status === "SUCCEEDED") {
    return `${base} border-[var(--yt-success-soft)] bg-[var(--yt-success-soft)] text-[var(--yt-success)]`;
  }
  if (status === "FAILED") {
    return `${base} border-[var(--yt-danger-soft)] bg-[var(--yt-danger-soft)] text-[var(--yt-danger)]`;
  }
  return `${base} border-[var(--yt-border)] bg-[var(--yt-surface-soft)] text-[var(--yt-text-secondary)]`;
}

function sectionGenerationButtonClass(sectionType: ContentWorkspaceSectionType): string {
  const base = "rounded-[var(--yt-radius-button)] px-3 py-2 text-xs font-bold";
  if (sectionType === "outline") {
    return `${base} bg-[var(--yt-primary)] text-white`;
  }
  return `${base} border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] text-[var(--yt-text-muted)] hover:border-[var(--yt-border-strong)] hover:text-[var(--yt-text-secondary)]`;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(value);
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function tomorrow(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date;
}

function formatDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}
