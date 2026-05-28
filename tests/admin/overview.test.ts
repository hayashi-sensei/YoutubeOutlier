import { describe, expect, test } from "vitest";
import { summarizeProviderFailures, summarizeUserUsage } from "../../lib/admin/overview";

describe("admin overview summaries", () => {
  test("summarizes provider failures by provider and model", () => {
    const rows = [
      { provider: "openai", model: "gpt-5.2", status: "FAILED" as const, costUsd: null, creditsCharged: 0 },
      { provider: "openai", model: "gpt-5.2", status: "FAILED" as const, costUsd: null, creditsCharged: 0 },
      { provider: "gemini", model: "flash", status: "SUCCEEDED" as const, costUsd: "0.0100", creditsCharged: 1 },
    ];

    expect(summarizeProviderFailures(rows)).toEqual([{ provider: "openai", model: "gpt-5.2", failures: 2 }]);
  });

  test("summarizes usage totals", () => {
    const rows = [
      { provider: "openai", model: "gpt-5.2", status: "SUCCEEDED" as const, costUsd: "0.1250", creditsCharged: 5 },
      { provider: "openai", model: "gpt-5.2", status: "FAILED" as const, costUsd: null, creditsCharged: 0 },
    ];

    expect(summarizeUserUsage(rows)).toEqual({
      generations: 2,
      failedGenerations: 1,
      creditsCharged: 5,
      costUsd: 0.125,
    });
  });
});
