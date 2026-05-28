"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--yt-bg)] px-6">
      <div className="max-w-lg rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-6 shadow-[var(--yt-shadow-soft)]">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--yt-text-muted)]">
          The app hit an unexpected error while loading this view.
        </p>
        {error.digest ? <p className="mt-3 text-xs text-[var(--yt-text-faint)]">Error ID: {error.digest}</p> : null}
        <button
          className="mt-5 rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-4 py-2 text-sm font-bold text-white"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
