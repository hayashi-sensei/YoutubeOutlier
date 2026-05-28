import { describe, expect, test, vi } from "vitest";

import { getAiProviderHealth, parseProviderPingMetadata, pingAiProvider } from "../../lib/admin/ai-provider-health";

describe("AI provider health", () => {
  test("reports missing keys and recent failures", () => {
    const health = getAiProviderHealth(
      [
        {
          provider: "openai",
          model: "gpt-5.4",
          status: "FAILED",
          errorMessage: "bad key",
          createdAt: new Date("2026-05-18T00:00:00Z"),
        },
      ],
      { OPENAI_API_KEY: "configured" },
    );

    expect(health.find((row) => row.id === "openai")).toEqual(
      expect.objectContaining({
        configured: true,
        status: "RECENT_FAILURES",
        recentFailures: 1,
      }),
    );
    expect(health.find((row) => row.id === "anthropic")).toEqual(
      expect.objectContaining({
        configured: false,
        status: "MISSING_KEY",
      }),
    );
  });

  test("uses the latest ping result for immediate provider status", () => {
    const health = getAiProviderHealth(
      [
        {
          provider: "openai",
          model: "gpt-5.4",
          status: "FAILED",
          errorMessage: "old failure",
          createdAt: new Date("2026-05-17T00:00:00Z"),
        },
      ],
      { OPENAI_API_KEY: "configured" },
      [
        {
          provider: "openai",
          ok: true,
          message: "OpenAI responded successfully.",
          checkedAt: new Date("2026-05-18T00:00:00Z"),
        },
      ],
    );

    expect(health.find((row) => row.id === "openai")).toEqual(
      expect.objectContaining({
        status: "CONNECTED",
        lastPing: expect.objectContaining({ ok: true }),
      }),
    );
  });

  test("parses provider ping metadata from audit logs", () => {
    expect(
      parseProviderPingMetadata({
        provider: "openai",
        ok: false,
        message: "Invalid key",
        checkedAt: "2026-05-18T00:00:00.000Z",
      }),
    ).toEqual({
      provider: "openai",
      ok: false,
      message: "Invalid key",
      checkedAt: new Date("2026-05-18T00:00:00.000Z"),
    });
  });

  test("pings text providers through an injected executor", async () => {
    process.env.OPENAI_API_KEY = "configured";
    const executor = vi.fn(async () => undefined);

    const result = await pingAiProvider("openai", executor);

    expect(result).toEqual({
      ok: true,
      provider: "openai",
      message: "OpenAI responded successfully.",
    });
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        model: "gpt-5.4-nano",
        maxOutputTokens: 16,
      }),
    );

    delete process.env.OPENAI_API_KEY;
  });

  test("treats image-only providers as configuration pings", async () => {
    process.env.PIAPI_API_KEY = "configured";

    const result = await pingAiProvider("piapi", vi.fn(async () => undefined));

    expect(result).toEqual({
      ok: true,
      provider: "piapi",
      message: "PiAPI key is configured. Live image pings are skipped to avoid spending image credits.",
    });

    delete process.env.PIAPI_API_KEY;
  });

  test("uses DeepSeek V4 for provider pings", async () => {
    process.env.DEEPSEEK_API_KEY = "configured";
    const executor = vi.fn(async () => undefined);

    await pingAiProvider("deepseek", executor);

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "deepseek",
        model: "deepseek-v4-flash",
      }),
    );

    delete process.env.DEEPSEEK_API_KEY;
  });
});
