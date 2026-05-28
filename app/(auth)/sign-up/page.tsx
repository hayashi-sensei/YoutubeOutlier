import Link from "next/link";
import type { Route } from "next";
import { signUpWithPassword } from "@/actions/auth";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--yt-bg)] px-6 py-10">
      <section className="w-full max-w-md rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-6 shadow-[var(--yt-shadow-soft)]">
        <h1 className="text-2xl font-bold">Create account</h1>
        <p className="mt-2 text-sm text-[var(--yt-text-muted)]">Use email/password signup with Supabase email verification.</p>
        {params.error ? (
          <p className="mt-4 rounded-[var(--yt-radius-card)] bg-[var(--yt-danger-soft)] p-3 text-sm font-semibold text-[var(--yt-danger)]">
            {params.error}
          </p>
        ) : null}
        {params.status === "check_email_or_sign_in" ? (
          <p className="mt-4 rounded-[var(--yt-radius-card)] bg-[var(--yt-primary-soft)] p-3 text-sm font-semibold text-[var(--yt-primary)]">
            If this is a new account, check your inbox for the confirmation link. If you already have an account, sign in instead.
          </p>
        ) : null}
        <form action={signUpWithPassword} className="mt-5 space-y-3">
          <input className="w-full rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2 text-sm" name="email" placeholder="Email" type="email" />
          <input className="w-full rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2 text-sm" name="password" placeholder="Password" type="password" />
          <button className="w-full rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-4 py-2.5 text-sm font-bold text-white" type="submit">
            Create account
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
