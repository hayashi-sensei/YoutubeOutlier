import Link from "next/link";
import {
  deleteFailedResearchReports,
  deleteResearchReport,
  generateManualResearchReport,
} from "@/actions/reports";
import { GenerateReportSubmit } from "@/components/reports/generate-report-submit";
import { requireUserWorkspace } from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";
import { getWorkspaceResearchReports } from "@/lib/recommendations/queries";

function formatDate(value: Date | null) {
  if (!value) {
    return "No publish date";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(value);
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "No publish date";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function reportNoticeText(query: { deleted?: string; failedDeleted?: string; error?: string }) {
  if (query.deleted === "1") {
    return { tone: "success", text: "Report deleted." };
  }
  if (typeof query.failedDeleted === "string") {
    const count = Number(query.failedDeleted);
    if (Number.isInteger(count) && count > 0) {
      return { tone: "success", text: `${count} failed report${count === 1 ? "" : "s"} deleted.` };
    }
    return { tone: "success", text: "No failed reports to delete." };
  }
  if (query.error === "REPORT_NOT_FOUND") {
    return { tone: "danger", text: "Report was not found in this workspace." };
  }
  if (query.error === "REPORT_DELETE_FAILED") {
    return { tone: "danger", text: "Report deletion failed. Try again from a refreshed reports page." };
  }
  if (query.error === "REPORT_GENERATION_FAILED") {
    return { tone: "danger", text: "Report generation failed. Check the failed report row for details." };
  }
  return null;
}

function displayReportTitle(title: string): string {
  return title
    .replace(/^Manual research report/i, "Research report")
    .replace(/^Daily research report/i, "Research report");
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ deleted?: string; failedDeleted?: string; error?: string }>;
}) {
  const query = searchParams ? await searchParams : {};
  const { workspaceId } = await requireUserWorkspace("/app/reports");
  const prisma = getPrismaClient();
  const [reports, latestSourceItems, settings] = await Promise.all([
    getWorkspaceResearchReports(prisma, { workspaceId, limit: 8 }),
    prisma.industrySourceItem.findMany({
      where: {
        source: {
          workspaceId,
          isActive: true,
        },
      },
      orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
      take: 8,
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
    prisma.workspaceSettings.findUnique({
      where: { workspaceId },
      select: { dailyReportEnabled: true, reportDeliveryEmail: true, timezone: true },
    }),
  ]);
  const notice = reportNoticeText(query);

  return (
    <main className="yt-page">
      <div className="yt-page-head">
        <div>
          <h1 className="yt-page-title">Reports</h1>
          <p className="yt-page-subtitle">
            Research reports summarize fresh competitor uploads, outliers, industry source items, and saved topic recommendations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {reports.some((report) => report.status === "FAILED") ? (
            <form action={deleteFailedResearchReports}>
              <button
                className="yt-btn yt-btn-danger"
                type="submit"
              >
                Delete Failed Reports
              </button>
            </form>
          ) : null}
          <form action={generateManualResearchReport}>
            <GenerateReportSubmit />
          </form>
        </div>
      </div>

      {notice ? (
        <section
          className={`mb-5 rounded-[var(--yt-radius-card)] border p-4 text-sm font-bold ${
            notice.tone === "success"
              ? "border-[var(--yt-success-soft)] bg-[var(--yt-success-soft)] text-[var(--yt-success)]"
              : "border-[var(--yt-danger-soft)] bg-[var(--yt-danger-soft)] text-[var(--yt-danger)]"
          }`}
        >
          {notice.text}
        </section>
      ) : null}

      <section className="yt-panel mb-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="yt-panel-title">Daily Report Preference</h2>
            <p className="yt-panel-note">
              Daily reports are {settings?.dailyReportEnabled ? "enabled" : "disabled"} for this workspace
              {settings?.timezone ? ` in ${settings.timezone}` : ""}.
            </p>
            {settings?.reportDeliveryEmail ? (
              <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">
                Delivery email: {settings.reportDeliveryEmail}
              </p>
            ) : null}
          </div>
          <Link
            className="yt-btn yt-btn-secondary"
            href="/app/settings"
          >
            Edit Preferences
          </Link>
        </div>
      </section>

      <section className="yt-panel mb-5">
        <div className="yt-panel-head">
          <h2 className="yt-panel-title">Report History</h2>
        </div>
        {reports.length === 0 ? (
          <p className="yt-empty-state">No reports generated yet. Generate a report to inspect the latest 24-hour research window.</p>
        ) : (
          <div className="divide-y divide-[var(--yt-border)]">
            {reports.map((report) => (
              <article className="grid gap-2 p-4 text-sm md:grid-cols-[1fr_auto] md:items-center" key={report.id}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link className="font-bold text-[var(--yt-text)] hover:text-[var(--yt-primary)]" href={`/app/reports/${report.id}`}>
                      {displayReportTitle(report.title)}
                    </Link>
                    <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--yt-text-secondary)]">
                      {report.status}
                    </span>
                    <span className="text-xs font-semibold text-[var(--yt-text-muted)]">
                      {report.manualRun ? "Generated on demand" : "Scheduled"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">
                    {formatDateTime(report.generatedAt ?? report.createdAt)}
                    {report._count.recommendations > 0 ? ` - ${report._count.recommendations} recommendations` : ""}
                  </p>
                  {report.errorMessage ? <p className="mt-1 text-xs font-bold text-[var(--yt-danger)]">{report.errorMessage}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    className="yt-btn yt-btn-ghost"
                    href={`/app/reports/${report.id}`}
                  >
                    Inspect
                  </Link>
                  <form action={deleteResearchReport}>
                    <input name="reportId" type="hidden" value={report.id} />
                    <button
                      className="yt-btn yt-btn-danger"
                      type="submit"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="yt-panel">
        <div className="yt-panel-head">
          <h2 className="yt-panel-title">Latest Source Items For Reports</h2>
        </div>
        {latestSourceItems.length === 0 ? (
          <p className="yt-empty-state">No source items cached yet. Add sources and fetch items to prepare report evidence.</p>
        ) : (
          <div className="divide-y divide-[var(--yt-border)]">
            {latestSourceItems.map((item) => (
              <a className="block p-4 text-sm hover:bg-[var(--yt-surface-muted)]" href={item.url} key={item.id} rel="noreferrer" target="_blank">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-[var(--yt-text)]">{item.title}</h3>
                  <span className="text-xs font-semibold text-[var(--yt-text-muted)]">{item.source.name ?? item.source.url}</span>
                </div>
                <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">{formatDate(item.publishedAt)}</p>
                {item.summary ? <p className="mt-2 line-clamp-2 text-[var(--yt-text-secondary)]">{item.summary}</p> : null}
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
