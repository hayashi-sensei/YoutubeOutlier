import Link from "next/link";
import type { Route } from "next";
import { signInWithGoogle, signInWithPassword } from "@/actions/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--yt-bg)] px-6 py-10">
      <section className="w-full max-w-md rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-6 shadow-[var(--yt-shadow-soft)]">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-2 text-sm text-[var(--yt-text-muted)]">Access your YTResearch workspace.</p>
        {params.error ? (
          <p className="mt-4 rounded-[var(--yt-radius-card)] bg-[var(--yt-danger-soft)] p-3 text-sm font-semibold text-[var(--yt-danger)]">
            {params.error}
          </p>
        ) : null}
        <form action={signInWithGoogle} className="mt-6">
          <input name="next" type="hidden" value={params.next ?? "/app/dashboard"} />
          <button className="w-full rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-4 py-2.5 text-sm font-bold text-white" type="submit">
            Continue with Google
          </button>
        </form>
        <form action={signInWithPassword} className="mt-5 space-y-3">
          <input name="next" type="hidden" value={params.next ?? "/app/dashboard"} />
          <input className="w-full rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2 text-sm" name="email" placeholder="Email" type="email" />
          <input className="w-full rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2 text-sm" name="password" placeholder="Password" type="password" />
          <button className="w-full rounded-[var(--yt-radius-button)] border border-[var(--yt-primary)] px-4 py-2.5 text-sm font-bold text-[var(--yt-primary)]" type="submit">
            Sign in with email
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-[var(--yt-text-muted)]">
          Need an account?{" "}
          <Link className="font-bold text-[var(--yt-primary)]" href={"/sign-up" as Route}>
            Register with email
          </Link>
        </p>
      </section>
    </main>
  );
}
