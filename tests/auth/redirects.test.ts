import { describe, expect, test, vi } from "vitest";
import { getAuthCallbackUrl, getSafeAppRedirectPath } from "../../lib/auth/redirects";

describe("auth redirect normalization", () => {
  test("defaults missing or unsafe values to the app dashboard", () => {
    expect(getSafeAppRedirectPath(null)).toBe("/app/dashboard");
    expect(getSafeAppRedirectPath("")).toBe("/app/dashboard");
    expect(getSafeAppRedirectPath("https://example.com/app/dashboard")).toBe("/app/dashboard");
    expect(getSafeAppRedirectPath("//example.com/app/dashboard")).toBe("/app/dashboard");
    expect(getSafeAppRedirectPath("/sign-in")).toBe("/app/dashboard");
  });

  test("keeps safe app paths", () => {
    expect(getSafeAppRedirectPath("/app/reports")).toBe("/app/reports");
    expect(getSafeAppRedirectPath("/app/dashboard?blueprints=updated")).toBe(
      "/app/dashboard?blueprints=updated",
    );
  });

  test("maps the stale root dashboard alias to the real app route", () => {
    expect(getSafeAppRedirectPath("/dashboard")).toBe("/app/dashboard");
    expect(getSafeAppRedirectPath("/dashboard?from=login")).toBe("/app/dashboard?from=login");
    expect(getSafeAppRedirectPath("/dashboard#top")).toBe("/app/dashboard#top");
  });

  test("uses the normalized next path in OAuth callback URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    expect(getAuthCallbackUrl("/dashboard")).toBe(
      "http://localhost:3000/auth/callback?next=%2Fapp%2Fdashboard",
    );

    vi.unstubAllEnvs();
  });

  test("falls back to the shared app URL default", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(getAuthCallbackUrl("/app/reports")).toBe(
      "http://localhost:3000/auth/callback?next=%2Fapp%2Freports",
    );

    vi.unstubAllEnvs();
  });
});
