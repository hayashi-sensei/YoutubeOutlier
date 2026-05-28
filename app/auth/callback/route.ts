import { type NextRequest, NextResponse } from "next/server";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getSafeAppRedirectPath } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeAppRedirectPath(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(error.message)}`, requestUrl.origin));
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await bootstrapUserWorkspace(user);
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
