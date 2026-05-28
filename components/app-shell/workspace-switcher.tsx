"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { switchWorkspace } from "@/actions/workspaces";
import type { WorkspaceSwitcherItem } from "@/types/workspaces";

export function WorkspaceSwitcher({
  activeWorkspaceId,
  workspaces,
}: {
  activeWorkspaceId: string;
  workspaces: WorkspaceSwitcherItem[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const redirectTo = query ? `${pathname}?${query}` : pathname;

  return (
    <form action={switchWorkspace} className="flex flex-wrap items-end gap-2">
      <input name="redirectTo" type="hidden" value={redirectTo} />
      <label className="grid gap-1">
        <span className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">Workspace</span>
        <select
          className="min-h-9 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-3 text-sm font-semibold text-[var(--yt-text)]"
          defaultValue={activeWorkspaceId}
          name="workspaceId"
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="min-h-9 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-3 text-xs font-bold text-[var(--yt-text-secondary)] hover:border-[var(--yt-border-strong)]"
        type="submit"
      >
        Switch
      </button>
      <Link
        className="min-h-9 rounded-[var(--yt-radius-button)] border border-[var(--yt-primary)] bg-white px-3 py-2 text-xs font-bold text-[var(--yt-primary)]"
        href="/app/settings#create-workspace"
      >
        New
      </Link>
    </form>
  );
}
