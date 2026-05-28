import Link from "next/link";
import type { Route } from "next";
import { signOut } from "@/actions/auth";
import { AppNav } from "@/components/app-shell/app-nav";
import { WorkspaceSwitcher } from "@/components/app-shell/workspace-switcher";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getPrismaClient } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/selection";

const navItems: Array<{ href: Route; label: string }> = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/competitors", label: "Competitors" },
  { href: "/app/sources", label: "Sources" },
  { href: "/app/outliers", label: "Outliers" },
  { href: "/app/topic-ideas", label: "Topic Ideas" },
  { href: "/app/reports", label: "Reports" },
  { href: "/app/content-studio", label: "Content Studio" },
  { href: "/app/calendar", label: "Calendar" },
  { href: "/app/visual-studio", label: "Visual Studio" },
  { href: "/app/settings", label: "Settings" },
  { href: "/app/admin", label: "Admin" },
];

function getDisplayName(input: { email?: string; name?: unknown }) {
  if (typeof input.name === "string" && input.name.trim().length > 0) {
    return input.name.trim();
  }

  return input.email ?? "Account";
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const bootstrap = user ? await bootstrapUserWorkspace(user) : null;
  const prisma = getPrismaClient();
  const workspaceContext = bootstrap
    ? await getActiveWorkspaceContext(prisma, { userId: bootstrap.user.id })
    : null;
  const displayName = getDisplayName({
    email: user?.email,
    name: user?.user_metadata.name,
  });

  return (
    <div className="min-h-screen bg-[var(--yt-bg)] text-[var(--yt-text)] lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-r border-black/20 bg-[var(--yt-navy)] text-white lg:sticky lg:top-0 lg:h-screen">
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <Link className="text-xl font-extrabold tracking-normal" href="/app/dashboard">
            YTResearch
          </Link>
        </div>
        <AppNav items={navItems} />
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[var(--yt-border)] bg-[var(--yt-surface)] px-5 py-3 shadow-[0_1px_0_rgba(16,24,40,0.02)]">
          {workspaceContext ? (
            <WorkspaceSwitcher activeWorkspaceId={workspaceContext.workspaceId} workspaces={workspaceContext.workspaces} />
          ) : (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">Workspace</p>
              <p className="text-sm font-semibold">AI Automation & Digital Marketing</p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-3 py-2 text-sm text-[var(--yt-text-secondary)]">
              Last 21 days
            </span>
            {workspaceContext ? (
              <span className="yt-badge primary min-h-[38px] rounded-[var(--yt-radius-button)] px-3 py-2 text-sm">
                Account credits: {workspaceContext.accountCreditBalance}
              </span>
            ) : null}
            <div className="flex items-center gap-2 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-2 py-1.5">
              <div className="hidden min-w-0 sm:block">
                <p className="max-w-[180px] truncate text-sm font-bold text-[var(--yt-text)]">{displayName}</p>
                {user?.email ? <p className="max-w-[180px] truncate text-xs font-semibold text-[var(--yt-text-muted)]">{user.email}</p> : null}
              </div>
              <Link
                className="rounded-[var(--yt-radius-button)] px-2 py-1.5 text-xs font-bold text-[var(--yt-primary)] hover:bg-[var(--yt-primary-soft)]"
                href="/app/settings"
              >
                Settings
              </Link>
              <form action={signOut}>
                <button
                  className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-2 py-1.5 text-xs font-bold text-[var(--yt-text-secondary)] hover:border-[var(--yt-border-strong)] hover:bg-[var(--yt-surface-muted)]"
                  type="submit"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
