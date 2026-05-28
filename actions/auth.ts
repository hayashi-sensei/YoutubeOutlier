"use server";

import { redirect } from "next/navigation";
import { signIn, signOut as authSignOut } from "@/auth";
import { getSafeAppRedirectPath } from "@/lib/auth/redirects";

function redirectTo(url: string): never {
  redirect(url as never);
}

export async function signInWithGoogle(formData: FormData) {
  const next = getSafeAppRedirectPath(formData.get("next"));
  await signIn("google", { redirectTo: next });
}

export async function signOut() {
  await authSignOut({ redirectTo: "/sign-in" });
}

export async function signInWithPassword() {
  redirectTo("/sign-in?error=Email%20password%20sign-in%20is%20no%20longer%20available");
}

export async function signUpWithPassword() {
  redirectTo("/sign-in?error=Use%20Google%20OAuth%20to%20continue");
}
