import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createCalendarItem, updateCalendarItem } from "@/actions/calendar";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { CALENDAR_STATUSES } from "@/lib/calendar/mutations";
import { getPrismaClient } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";
import type { CalendarStatus } from "@/schemas/calendar";

type CalendarSearchParams = {
  view?: string;
  month?: string;
  workspace?: string;
  saved?: string;
  error?: string;
};

type CalendarItem = {
  id: string;
  title: string;
  contentType: string;
  status: CalendarStatus;
  scheduledFor: Date | null;
  publishedAt: Date | null;
  notes: string | null;
  updatedAt: Date;
  workspace: { id: string; name: string };
  recommendation: { topic: string; opportunityScore: number | null } | null;
  assets: Array<{ id: string; assetType: string; title: string | null; version: number }>;
};

function redirectTo(url: string): never {
  redirect(url as never);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<CalendarSearchParams>;
}) {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirectTo("/sign-in");
  }

  const { user, workspaceId } = await bootstrapUserWorkspace(supabaseUser);
  const prisma = getPrismaClient();
  const params = searchParams ? await searchParams : {};
  const view = params.view === "list" ? "list" : "month";
  const monthKey = validMonthParam(params.month) ?? currentMonthKey();
  const selectedWorkspaceId = params.workspace;
  const workspaces = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    orderBy: { workspace: { createdAt: "asc" } },
    select: {
      workspace: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  const workspaceOptions = workspaces.map(({ workspace }) => workspace);
  const allWorkspaceIds = workspaceOptions.map((workspace) => workspace.id);
  const visibleWorkspaceIds =
    selectedWorkspaceId && allWorkspaceIds.includes(selectedWorkspaceId)
      ? [selectedWorkspaceId]
      : allWorkspaceIds;
  const { start, end } = monthBounds(monthKey);
  const contentItems = await prisma.contentItem.findMany({
    where: {
      workspaceId: { in: visibleWorkspaceIds },
      ...(view === "month"
        ? {
            OR: [
              { scheduledFor: { gte: start, lt: end } },
              { scheduledFor: null, status: { not: "ARCHIVED" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ scheduledFor: "asc" }, { updatedAt: "desc" }],
    take: view === "month" ? 120 : 80,
    select: {
      id: true,
      title: true,
      contentType: true,
      status: true,
      scheduledFor: true,
      publishedAt: true,
      notes: true,
      updatedAt: true,
      workspace: { select: { id: true, name: true } },
      recommendation: {
        select: {
          topic: true,
          opportunityScore: true,
        },
      },
      assets: {
        orderBy: [{ updatedAt: "desc" }],
        take: 5,
        select: { id: true, assetType: true, title: true, version: true },
      },
    },
  });
  const typedItems = contentItems as CalendarItem[];
  const returnTo = buildCalendarUrl({ view, month: monthKey, workspace: selectedWorkspaceId });

  return (
    <main className="yt-page">
      <div className="yt-page-head">
        <div>
          <h1 className="yt-page-title">Calendar</h1>
          <p className="yt-page-subtitle">
            Move content from idea to outline, script, thumbnail, schedule, and publish without leaving the research workflow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CalendarNavLink active={view === "month"} href={buildCalendarUrl({ view: "month", month: monthKey, workspace: selectedWorkspaceId })}>
            Month
          </CalendarNavLink>
          <CalendarNavLink active={view === "list"} href={buildCalendarUrl({ view: "list", month: monthKey, workspace: selectedWorkspaceId })}>
            List
          </CalendarNavLink>
        </div>
      </div>

      <StatusMessage error={params.error} saved={params.saved} />

      <section className="yt-panel mb-5 p-4">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
          <form action={createCalendarItem} className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_0.7fr_0.7fr_0.7fr_auto] md:items-end">
            <label className="grid gap-1 text-sm font-bold">
              Content title
              <input
                className="yt-input font-normal"
                name="title"
                placeholder="AI agent workflow teardown"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Workspace
              <select
                className="yt-input font-normal"
                defaultValue={selectedWorkspaceId && allWorkspaceIds.includes(selectedWorkspaceId) ? selectedWorkspaceId : workspaceId}
                name="workspaceId"
              >
                {workspaceOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Type
              <select
                className="yt-input font-normal"
                defaultValue="youtube_video"
                name="contentType"
              >
                <option value="youtube_video">YouTube video</option>
                <option value="linkedin_post">LinkedIn post</option>
                <option value="x_thread">X thread</option>
                <option value="newsletter">Newsletter</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Due date
              <input
                className="yt-input font-normal"
                name="scheduledFor"
                type="date"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Status
              <select
                className="yt-input font-normal"
                defaultValue="IDEA"
                name="status"
              >
                {CALENDAR_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold md:col-span-5">
              Notes
              <textarea
                className="yt-input min-h-20 font-normal"
                name="notes"
                placeholder="Angle, production notes, or publishing context"
              />
            </label>
            <button
              className="yt-btn yt-btn-primary md:self-end"
              type="submit"
            >
              Add Item
            </button>
          </form>

          <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <input name="view" type="hidden" value={view} />
            <label className="grid gap-1 text-sm font-bold">
              Month
              <input
                className="yt-input font-normal"
                defaultValue={monthKey}
                name="month"
                type="month"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Workspace filter
              <select
                className="yt-input font-normal"
                defaultValue={selectedWorkspaceId && allWorkspaceIds.includes(selectedWorkspaceId) ? selectedWorkspaceId : "all"}
                name="workspace"
              >
                <option value="all">All workspaces</option>
                {workspaceOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="yt-btn yt-btn-secondary"
              type="submit"
            >
              Apply
            </button>
          </form>
        </div>
      </section>

      {view === "month" ? (
        <CalendarMonth items={typedItems} monthKey={monthKey} returnTo={returnTo} />
      ) : (
        <CalendarList items={typedItems} returnTo={returnTo} />
      )}
    </main>
  );
}

function CalendarMonth({
  items,
  monthKey,
  returnTo,
}: {
  items: CalendarItem[];
  monthKey: string;
  returnTo: string;
}) {
  const days = monthDays(monthKey);
  const scheduledItems = items.filter((item) => item.scheduledFor);
  const unscheduledItems = items.filter((item) => !item.scheduledFor);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--yt-border)] px-4 py-3">
          <h2 className="text-base font-bold">{formatMonthHeading(monthKey)}</h2>
          <p className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">
            {scheduledItems.length} dated items
          </p>
        </div>
        <div className="grid grid-cols-1 divide-y divide-[var(--yt-border)] md:grid-cols-7 md:divide-x md:divide-y-0">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div className="hidden bg-[var(--yt-surface-soft)] px-3 py-2 text-xs font-extrabold text-[var(--yt-text-muted)] md:block" key={day}>
              {day}
            </div>
          ))}
        </div>
        <div className="grid gap-0 md:grid-cols-7">
          {days.map((day) => {
            const dayItems = scheduledItems.filter((item) => item.scheduledFor && dateKey(item.scheduledFor) === dateKey(day.date));
            return (
              <div
                className={
                  day.inMonth
                    ? "min-h-36 border-b border-r border-[var(--yt-border)] bg-white p-2"
                    : "hidden min-h-36 border-b border-r border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-2 md:block"
                }
                key={day.date.toISOString()}
              >
                <div className="mb-2 text-xs font-extrabold text-[var(--yt-text-muted)]">{day.date.getUTCDate()}</div>
                <div className="space-y-2">
                  {dayItems.map((item) => (
                    <CompactCalendarCard item={item} key={item.id} returnTo={returnTo} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
        <div className="border-b border-[var(--yt-border)] px-4 py-3">
          <h2 className="text-base font-bold">Unscheduled</h2>
        </div>
        {unscheduledItems.length === 0 ? (
          <p className="p-4 text-sm text-[var(--yt-text-muted)]">Every active item in this view has a due date.</p>
        ) : (
          <div className="divide-y divide-[var(--yt-border)]">
            {unscheduledItems.map((item) => (
              <div className="p-3" key={item.id}>
                <CompactCalendarCard item={item} returnTo={returnTo} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CalendarList({ items, returnTo }: { items: CalendarItem[]; returnTo: string }) {
  return (
    <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--yt-border)] px-4 py-3">
        <h2 className="text-base font-bold">Content Plan</h2>
        <p className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">{items.length} items</p>
      </div>
      {items.length === 0 ? (
        <p className="p-4 text-sm text-[var(--yt-text-muted)]">
          No calendar items yet. Save a recommendation or add a content item above.
        </p>
      ) : (
        <div className="divide-y divide-[var(--yt-border)]">
          {items.map((item) => (
            <article className="grid gap-4 p-4 text-sm xl:grid-cols-[1fr_420px] xl:items-start" key={item.id}>
              <CalendarCardBody item={item} />
              <CalendarUpdateForm item={item} returnTo={returnTo} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CompactCalendarCard({ item, returnTo }: { item: CalendarItem; returnTo: string }) {
  return (
    <article className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-2 text-xs">
      <CalendarCardBody compact item={item} />
      <div className="mt-2">
        <CalendarUpdateForm compact item={item} returnTo={returnTo} />
      </div>
    </article>
  );
}

function CalendarCardBody({ item, compact = false }: { item: CalendarItem; compact?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link className="font-bold text-[var(--yt-primary)]" href={`/app/content-studio/${item.id}`}>
          {item.title}
        </Link>
        <StatusBadge status={item.status} />
      </div>
      <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">
        {formatContentType(item.contentType)} · {item.workspace.name} · {item.scheduledFor ? formatDate(item.scheduledFor) : "No due date"}
      </p>
      {!compact && item.recommendation ? (
        <p className="mt-2 text-xs font-semibold text-[var(--yt-text-muted)]">
          From recommendation: {item.recommendation.topic}
          {typeof item.recommendation.opportunityScore === "number"
            ? ` · score ${item.recommendation.opportunityScore.toFixed(0)}`
            : ""}
        </p>
      ) : null}
      {!compact && item.notes ? <p className="mt-2 text-[var(--yt-text-secondary)]">{item.notes}</p> : null}
      {item.assets.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {item.assets.map((asset) => (
            <span
              className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-white px-2 py-1 text-[11px] font-bold text-[var(--yt-text-secondary)]"
              key={asset.id}
              title={asset.title ?? undefined}
            >
              {asset.assetType} v{asset.version}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CalendarUpdateForm({
  item,
  returnTo,
  compact = false,
}: {
  item: CalendarItem;
  returnTo: string;
  compact?: boolean;
}) {
  return (
    <form action={updateCalendarItem} className={compact ? "grid gap-2" : "grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"}>
      <input name="contentItemId" type="hidden" value={item.id} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <label className="grid gap-1 text-xs font-bold text-[var(--yt-text-secondary)]">
        Status
        <select
          className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-2 py-1.5 font-normal"
          defaultValue={item.status}
          name="status"
        >
          {CALENDAR_STATUSES.map((status) => (
            <option key={status} value={status}>
              {formatStatus(status)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-bold text-[var(--yt-text-secondary)]">
        Due date
        <input
          className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-2 py-1.5 font-normal"
          defaultValue={item.scheduledFor ? dateInputValue(item.scheduledFor) : ""}
          name="scheduledFor"
          type="date"
        />
      </label>
      {compact ? (
        <input name="notes" type="hidden" value={item.notes ?? ""} />
      ) : (
        <label className="grid gap-1 text-xs font-bold text-[var(--yt-text-secondary)] md:col-span-2">
          Notes
          <textarea
            className="min-h-20 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-2 py-1.5 font-normal"
            defaultValue={item.notes ?? ""}
            name="notes"
          />
        </label>
      )}
      <button
        className="rounded-[var(--yt-radius-button)] border border-[var(--yt-primary)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--yt-primary)] md:self-end"
        type="submit"
      >
        Update
      </button>
    </form>
  );
}

function StatusBadge({ status }: { status: CalendarStatus }) {
  const className = {
    IDEA: "border-[var(--yt-border)] bg-[var(--yt-surface-soft)] text-[var(--yt-text-secondary)]",
    OUTLINE: "border-[var(--yt-blue-soft)] bg-[var(--yt-blue-soft)] text-[var(--yt-blue)]",
    SCRIPT: "border-[var(--yt-primary-soft)] bg-[var(--yt-primary-soft)] text-[var(--yt-primary)]",
    THUMBNAIL: "border-[var(--yt-warning-soft)] bg-[var(--yt-warning-soft)] text-[var(--yt-warning)]",
    SCHEDULED: "border-[var(--yt-blue-soft)] bg-[var(--yt-blue-soft)] text-[var(--yt-blue)]",
    PUBLISHED: "border-[var(--yt-success-soft)] bg-[var(--yt-success-soft)] text-[var(--yt-success)]",
    ARCHIVED: "border-[var(--yt-border)] bg-white text-[var(--yt-text-muted)]",
  }[status];

  return (
    <span className={`rounded-[var(--yt-radius-pill)] border px-2 py-0.5 text-[11px] font-bold ${className}`}>
      {formatStatus(status)}
    </span>
  );
}

function CalendarNavLink({ active, href, children }: { active: boolean; href: string; children: ReactNode }) {
  return (
    <Link
      className={
        active
          ? "rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-4 py-2 text-sm font-bold text-white"
          : "rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-4 py-2 text-sm font-bold text-[var(--yt-text-secondary)]"
      }
      href={href}
    >
      {children}
    </Link>
  );
}

function StatusMessage({ saved, error }: { saved?: string; error?: string }) {
  if (error) {
    return (
      <div className="mb-5 rounded-[var(--yt-radius-card)] border border-[var(--yt-danger-soft)] bg-[var(--yt-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--yt-danger)]">
        {error === "calendar_item_not_found"
          ? "Calendar item was not found for your account."
          : "Calendar item could not be saved. Check the title, status, and due date."}
      </div>
    );
  }

  if (!saved) {
    return null;
  }

  return (
    <div className="mb-5 rounded-[var(--yt-radius-card)] border border-[var(--yt-success-soft)] bg-[var(--yt-success-soft)] px-4 py-3 text-sm font-semibold text-[var(--yt-success)]">
      Calendar updated.
    </div>
  );
}

function buildCalendarUrl(input: { view: "month" | "list"; month: string; workspace?: string }) {
  const params = new URLSearchParams({ view: input.view, month: input.month });
  if (input.workspace && input.workspace !== "all") {
    params.set("workspace", input.workspace);
  }
  return `/app/calendar?${params.toString()}`;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function validMonthParam(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : undefined;
}

function monthBounds(monthKey: string): { start: Date; end: Date } {
  const [year, month] = monthKey.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

function monthDays(monthKey: string): Array<{ date: Date; inMonth: boolean }> {
  const { start, end } = monthBounds(monthKey);
  const firstGridDate = new Date(start);
  firstGridDate.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const lastGridDate = new Date(end);
  while (lastGridDate.getUTCDay() !== 0) {
    lastGridDate.setUTCDate(lastGridDate.getUTCDate() + 1);
  }
  const days: Array<{ date: Date; inMonth: boolean }> = [];
  const current = new Date(firstGridDate);

  while (current < lastGridDate) {
    days.push({
      date: new Date(current),
      inMonth: current >= start && current < end,
    });
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return days;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dateInputValue(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(value);
}

function formatMonthHeading(monthKey: string): string {
  const { start } = monthBounds(monthKey);
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(start);
}

function formatStatus(status: CalendarStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatContentType(value: string): string {
  return value.replaceAll("_", " ");
}
