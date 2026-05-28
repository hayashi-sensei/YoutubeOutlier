import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--yt-bg)] px-6">
      <div className="max-w-md rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-6 shadow-[var(--yt-shadow-soft)]">
        <h1 className="text-xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--yt-text-muted)]">
          The page you requested does not exist or is not available in this workspace.
        </p>
        <Link className="mt-5 inline-block text-sm font-bold text-[var(--yt-primary)]" href="/app/dashboard">
          Return to dashboard
        </Link>
      </div>
    </main>
  );
}
