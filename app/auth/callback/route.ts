import { type NextRequest, NextResponse } from "next/server";
import { getSafeAppRedirectPath } from "@/lib/auth/redirects";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const next = getSafeAppRedirectPath(requestUrl.searchParams.get("next"));

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
