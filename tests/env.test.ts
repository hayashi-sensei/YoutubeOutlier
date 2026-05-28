import { afterEach, describe, expect, test, vi } from "vitest";

const originalEnv = { ...process.env };

async function importEnvWith(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...originalEnv, ...overrides };
  return import("../lib/env");
}

afterEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

describe("environment contract", () => {
  test("requires Auth.js Google OAuth settings", async () => {
    await expect(
      importEnvWith({
        AUTH_SECRET: undefined,
        AUTH_GOOGLE_ID: undefined,
        AUTH_GOOGLE_SECRET: undefined,
      }),
    ).rejects.toThrow();
  });

  test("rejects Auth.js placeholder values", async () => {
    await expect(
      importEnvWith({
        AUTH_SECRET: "replace-with-a-long-random-auth-secret",
        AUTH_GOOGLE_ID: "your-google-oauth-client-id",
        AUTH_GOOGLE_SECRET: "your-google-oauth-client-secret",
      }),
    ).rejects.toThrow();
  });

  test("accepts configured Auth.js Google OAuth settings", async () => {
    const { env } = await importEnvWith({
      AUTH_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      AUTH_GOOGLE_ID: "google-client-id",
      AUTH_GOOGLE_SECRET: "google-client-secret",
    });

    expect(env.AUTH_SECRET).toBe("abcdefghijklmnopqrstuvwxyz123456");
    expect(env.AUTH_GOOGLE_ID).toBe("google-client-id");
    expect(env.AUTH_GOOGLE_SECRET).toBe("google-client-secret");
  });
});
