"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

type AppNavProps = {
  items: Array<{ href: Route; label: string }>;
};

export function AppNav({ items }: AppNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 py-3 lg:block lg:space-y-1 lg:overflow-visible">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "block whitespace-nowrap rounded-[var(--yt-radius-button)] border-l-[3px] border-l-[var(--yt-primary)] bg-white/10 px-3 py-2 text-sm font-bold text-white"
                : "block whitespace-nowrap rounded-[var(--yt-radius-button)] border-l-[3px] border-l-transparent px-3 py-2 text-sm font-bold text-gray-300 transition hover:border-l-[var(--yt-primary)] hover:bg-white/10 hover:text-white"
            }
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
