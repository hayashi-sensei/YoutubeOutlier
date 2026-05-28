import Link from "next/link";
import type { Route } from "next";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--yt-bg)] px-6 py-10 text-[var(--yt-text)]">
      <section className="mx-auto flex min-h-[calc(100vh-80px)] max-w-5xl flex-col justify-center">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-[var(--yt-primary)]">YTResearch</p>
          <h1 className="mt-4 text-4xl font-bold tracking-normal sm:text-5xl">
            YouTube content intelligence for evidence-led creators.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--yt-text-muted)]">
            Track competitors, find outlier videos, monitor industry sources, and turn proven patterns into topics, reports, scripts, and content plans.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              className="rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-4 py-2.5 text-sm font-bold text-white"
              href={"/sign-up" as Route}
            >
              Register with email
            </Link>
            <Link
              className="rounded-[var(--yt-radius-button)] border border-[var(--yt-primary)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--yt-primary)]"
              href={"/sign-in" as Route}
            >
              Sign in
            </Link>
            <Link
              className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--yt-primary)]"
              href="/api/health"
            >
              Check health
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
