import Link from "next/link";
import type { Route } from "next";
import { signInWithGoogle } from "@/actions/auth";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--yt-bg)] px-6 py-10">
      <section className="w-full max-w-md rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-6 shadow-[var(--yt-shadow-soft)]">
        <h1 className="text-2xl font-bold">Create account</h1>
        <p className="mt-2 text-sm text-[var(--yt-text-muted)]">Use Google OAuth to create your YTResearch workspace.</p>
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
        <p className="mt-5 text-center text-sm text-[var(--yt-text-muted)]">
          Already have an account?{" "}
          <Link className="font-bold text-[var(--yt-primary)]" href={"/sign-in" as Route}>
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
