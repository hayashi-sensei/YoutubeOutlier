import { cleanResearchCache, updateWorkspaceSettings } from "@/actions/settings";
import { createWorkspace, deleteWorkspace } from "@/actions/workspaces";
import { requireUserWorkspace } from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";
import { getActiveWorkspaceContext } from "@/lib/workspaces/selection";

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-[var(--yt-text-secondary)]">
      {label}
      {children}
    </label>
  );
}

const inputClass = "yt-input font-normal";
const textareaClass = `${inputClass} min-h-24 resize-y leading-6`;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    cacheCleaned?: string;
    sourceItems?: string;
    youtubeVideos?: string;
    workspaceCreated?: string;
    workspaceDeleted?: string;
    error?: string;
  }>;
}) {
  const { user, workspaceId } = await requireUserWorkspace("/app/settings");
  const prisma = getPrismaClient();
  const [workspace, workspaceContext] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        settings: {
          include: {
            writingSamples: {
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    }),
    getActiveWorkspaceContext(prisma, { userId: user.id }),
  ]);

  if (!workspace?.settings) {
    throw new Error("Workspace settings were not created during user bootstrap.");
  }

  const params = await searchParams;
  const settings = workspace.settings;
  const writingSamples = settings.writingSamples.map((sample) => sample.sampleText).join("\n\n");

  return (
    <main className="yt-page">
      <div className="yt-page-head">
        <div>
          <h1 className="yt-page-title">Settings</h1>
          <p className="yt-page-subtitle">
            Tune the niche, audience, writing style, and report defaults that feed recommendations and AI tasks.
          </p>
        </div>
        {params.saved === "1" ? (
          <p className="rounded-[var(--yt-radius-button)] bg-[var(--yt-primary-soft)] px-3 py-2 text-sm font-bold text-[var(--yt-primary)]">
            Settings saved
          </p>
        ) : null}
        {params.cacheCleaned === "1" ? (
          <p className="rounded-[var(--yt-radius-button)] bg-[var(--yt-warning-soft)] px-3 py-2 text-sm font-bold text-[var(--yt-warning)]">
            Cache cleaned: {params.sourceItems ?? "0"} source items and {params.youtubeVideos ?? "0"} YouTube videos removed
          </p>
        ) : null}
        {params.workspaceCreated === "1" ? (
          <p className="rounded-[var(--yt-radius-button)] bg-[var(--yt-primary-soft)] px-3 py-2 text-sm font-bold text-[var(--yt-primary)]">
            Workspace created
          </p>
        ) : null}
        {params.workspaceDeleted === "1" ? (
          <p className="rounded-[var(--yt-radius-button)] bg-[var(--yt-warning-soft)] px-3 py-2 text-sm font-bold text-[var(--yt-warning)]">
            Workspace deleted
          </p>
        ) : null}
        {params.error ? (
          <p className="rounded-[var(--yt-radius-button)] bg-[var(--yt-danger-soft)] px-3 py-2 text-sm font-bold text-[var(--yt-danger)]">
            {params.error.replaceAll("_", " ")}
          </p>
        ) : null}
      </div>

      {workspaceContext ? (
        <section className="yt-panel mb-5 p-5" id="create-workspace">
          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="yt-panel-title">Research Workspaces</h2>
              <p className="yt-panel-note leading-6">
                Workspaces separate niche, audience, competitors, sources, reports, and topic ideas. Calendar and credits stay shared on this account.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-[var(--yt-text-secondary)]">
                <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] px-2 py-1">
                  {workspaceContext.workspaces.length}/{workspaceContext.entitlement.maxWorkspaces} workspaces
                </span>
                <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] px-2 py-1">
                  Plan {workspaceContext.activeWorkspace.planCode}
                </span>
                <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] px-2 py-1">
                  Account credits {workspaceContext.accountCreditBalance}
                </span>
              </div>
            </div>
            <form action={createWorkspace} className="grid gap-3 md:grid-cols-2">
              <Field label="Workspace name">
                <input className={inputClass} name="name" placeholder="Client channel, niche, or audience" required />
              </Field>
              <Field label="Primary niche">
                <input className={inputClass} name="primaryNiche" placeholder="AI automation for coaches" required />
              </Field>
              <div className="md:col-span-2">
                <Field label="Target audience">
                  <textarea className={textareaClass} name="targetAudience" placeholder="Who this research account is for" />
                </Field>
              </div>
              <div className="md:col-span-2">
                <button
                  className="yt-btn yt-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={workspaceContext.workspaces.length >= workspaceContext.entitlement.maxWorkspaces}
                  type="submit"
                >
                  Create workspace
                </button>
                {workspaceContext.workspaces.length >= workspaceContext.entitlement.maxWorkspaces ? (
                  <p className="mt-2 text-xs font-semibold text-[var(--yt-warning)]">Workspace limit reached for this plan.</p>
                ) : null}
              </div>
            </form>
          </div>
        </section>
      ) : null}

      <form action={updateWorkspaceSettings} className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="yt-panel p-5">
          <h2 className="yt-panel-title">Market Profile</h2>
          <div className="mt-4 grid gap-4">
            <Field label="Primary niche">
              <input className={inputClass} defaultValue={settings.primaryNiche} name="primaryNiche" required />
            </Field>
            <Field label="Sub-niche">
              <input className={inputClass} defaultValue={settings.subNiche ?? ""} name="subNiche" />
            </Field>
            <Field label="Target audience">
              <textarea className={textareaClass} defaultValue={settings.targetAudience ?? ""} name="targetAudience" />
            </Field>
            <Field label="Content goals">
              <textarea className={textareaClass} defaultValue={settings.contentGoals ?? ""} name="contentGoals" />
            </Field>
            <Field label="Topics to avoid">
              <textarea className={textareaClass} defaultValue={settings.topicsToAvoid ?? ""} name="topicsToAvoid" />
            </Field>
          </div>
        </section>

        <section className="yt-panel p-5">
          <h2 className="yt-panel-title">Brand And Reports</h2>
          <div className="mt-4 grid gap-4">
            <Field label="Brand voice">
              <textarea className={textareaClass} defaultValue={settings.brandVoice ?? ""} name="brandVoice" />
            </Field>
            <Field label="Writing style examples">
              <textarea className="yt-input min-h-40 font-normal leading-6" defaultValue={writingSamples} name="writingSamples" />
            </Field>
            <Field label="Default CTA">
              <input className={inputClass} defaultValue={settings.cta ?? ""} name="cta" />
            </Field>
            <Field label="Offers, products, or services">
              <textarea className={textareaClass} defaultValue={settings.offers ?? ""} name="offers" />
            </Field>
            <Field label="Default AI quality">
              <select className={inputClass} defaultValue={settings.defaultAiQualityTier} name="defaultAiQualityTier">
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
              </select>
            </Field>
            <Field label="Report delivery email">
              <input className={inputClass} defaultValue={settings.reportDeliveryEmail ?? ""} name="reportDeliveryEmail" type="email" />
            </Field>
            <label className="flex items-center gap-3 text-sm font-semibold text-[var(--yt-text-secondary)]">
              <input defaultChecked={settings.dailyReportEnabled} name="dailyReportEnabled" type="checkbox" />
              Enable daily report
            </label>
            <button className="yt-btn yt-btn-primary" type="submit">
              Save settings
            </button>
          </div>
        </section>
      </form>

      <section className="yt-panel mt-5 p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <h2 className="yt-panel-title">Research Cache</h2>
            <p className="yt-panel-note leading-6">
              Remove fetched source items and cached YouTube videos for channels only used by this workspace. Shared channel caches, configured sources, and competitor channels stay in place.
            </p>
          </div>
          <form action={cleanResearchCache}>
            <button
              className="yt-btn yt-btn-danger"
              type="submit"
            >
              Clean research cache
            </button>
          </form>
        </div>
      </section>

      {workspaceContext ? (
        <section className="yt-panel mt-5 border-[var(--yt-danger-soft)] p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <h2 className="text-base font-bold text-[var(--yt-danger)]">Delete Workspace</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--yt-text-muted)]">
                Deletes this workspace's settings, competitors, sources, reports, recommendations, content items, jobs, and workspace-scoped assets. Other workspaces remain.
              </p>
              <p className="mt-2 text-xs font-bold text-[var(--yt-text-secondary)]">
                Type <span className="font-mono">{workspace.name}</span> to confirm.
              </p>
            </div>
            <form action={deleteWorkspace} className="grid min-w-72 gap-3">
              <input name="workspaceId" type="hidden" value={workspace.id} />
              <label className="grid gap-1.5 text-sm font-semibold text-[var(--yt-text-secondary)]">
                Workspace name
                <input className={inputClass} name="confirmationName" required />
              </label>
              <button
              className="yt-btn yt-btn-danger disabled:cursor-not-allowed disabled:opacity-50"
                disabled={workspaceContext.workspaces.length <= 1}
                type="submit"
              >
                Delete workspace
              </button>
              {workspaceContext.workspaces.length <= 1 ? (
                <p className="text-xs font-semibold text-[var(--yt-warning)]">You cannot delete your last workspace.</p>
              ) : null}
            </form>
          </div>
        </section>
      ) : null}
    </main>
  );
}
