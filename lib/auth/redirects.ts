const APP_DASHBOARD_PATH = "/app/dashboard";

export function getSafeAppRedirectPath(input: FormDataEntryValue | string | null | undefined): string {
  if (typeof input !== "string") {
    return APP_DASHBOARD_PATH;
  }

  const path = input.trim();

  if (path === "/dashboard" || path.startsWith("/dashboard?") || path.startsWith("/dashboard#")) {
    return `${APP_DASHBOARD_PATH}${path.slice("/dashboard".length)}`;
  }

  if (path === "/app" || path === "/app/") {
    return APP_DASHBOARD_PATH;
  }

  if (path.startsWith("/app/") && !path.startsWith("//")) {
    return path;
  }

  return APP_DASHBOARD_PATH;
}

export function getAuthCallbackUrl(path: string): string {
  const appUrl = getAppUrl();
  const callbackUrl = new URL("/auth/callback", appUrl);
  callbackUrl.searchParams.set("next", getSafeAppRedirectPath(path));
  return callbackUrl.toString();
}

export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return configured || "http://localhost:3000";
}
