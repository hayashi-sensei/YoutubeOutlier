"use server";

import { redirect } from "next/navigation";
import { getAppUrl, getAuthCallbackUrl, getSafeAppRedirectPath } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";
import { getPasswordSignUpErrorMessage, getPasswordSignUpRedirect } from "@/lib/auth/signup-result";

function getRedirectUrl(path: string) {
  return new URL(path, getAppUrl()).toString();
}

function redirectTo(url: string): never {
  redirect(url as never);
}

export async function signInWithGoogle(formData: FormData) {
  const next = getSafeAppRedirectPath(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getAuthCallbackUrl(next),
    },
  });

  if (error) {
    redirectTo(`/sign-in?error=${encodeURIComponent(error.message)}`);
  }

  if (data.url) {
    redirectTo(data.url);
  }

  redirectTo("/sign-in?error=Missing OAuth redirect URL");
}

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = getSafeAppRedirectPath(formData.get("next"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirectTo(`/sign-in?error=${encodeURIComponent(error.message)}`);
  }

  redirectTo(next);
}

export async function signUpWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getRedirectUrl("/auth/callback"),
    },
  });

  if (error) {
    redirectTo(`/sign-up?error=${encodeURIComponent(getPasswordSignUpErrorMessage(error.message))}`);
  }

  redirectTo(getPasswordSignUpRedirect(data));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirectTo("/sign-in");
}
