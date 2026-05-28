import { describe, expect, test, vi } from "vitest";

import {
  runProviderCostSnapshot,
  shouldSkipJobForQuotaPressure,
  summarizeAiCostByUserAndTask,
} from "../../lib/cost-controls/quotas";

const NOW = new Date("2026-05-19T10:00:00Z");

describe("cost control summaries", () => {
  test("summarizes AI cost by user and task", () => {
    const summary = summarizeAiCostByUserAndTask([
      {
        userId: "user-1",
        taskType: "outline_generation",
        costUsd: "0.0300",
        creditsCharged: 2,
      },
      {
        userId: "user-1",
        taskType: "outline_generation",
        costUsd: "0.0200",
        creditsCharged: 1,
      },
      {
        userId: "user-2",
        taskType: "script_generation",
        costUsd: "0.2000",
        creditsCharged: 8,
      },
      {
        userId: null,
        taskType: "topic_recommendation",
        costUsd: null,
        creditsCharged: 0,
      },
    ]);

    expect(summary).toEqual([
      {
        userId: "user-2",
        taskType: "script_generation",
        generations: 1,
        creditsCharged: 8,
        costUsd: 0.2,
      },
      {
        userId: "user-1",
        taskType: "outline_generation",
        generations: 2,
        creditsCharged: 3,
        costUsd: 0.05,
      },
      {
        userId: null,
        taskType: "topic_recommendation",
        generations: 1,
        creditsCharged: 0,
        costUsd: 0,
      },
    ]);
  });
});

describe("provider cost snapshots", () => {
  test("creates admin alerts for provider spend, YouTube quota pressure, and abuse pressure", async () => {
    const alerts: unknown[] = [];
    const prisma = {
      aiGeneration: {
        findMany: vi.fn(async () => [
          ...Array.from({ length: 11 }, () => ({
            userId: "user-1",
            taskType: "script_generation",
            provider: "openai",
            model: "gpt-5.4",
            status: "SUCCEEDED",
            costUsd: "0.5000",
            creditsCharged: 8,
            createdAt: NOW,
          })),
          {
            userId: "user-2",
            taskType: "image_generation",
            provider: "openai",
            model: "gpt-image-1",
            status: "SUCCEEDED",
            costUsd: "2.0000",
            creditsCharged: 6,
            createdAt: NOW,
          },
        ]),
      },
      youtubeQuotaUsage: {
        aggregate: vi.fn(async () => ({ _sum: { units: 8800 } })),
      },
      adminAuditLog: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: unknown }) => {
          alerts.push(data);
          return data;
        }),
      },
    };

    const result = await runProviderCostSnapshot(prisma, {
      now: NOW,
      dailyAiSpendAlertUsd: 5,
      dailyYoutubeQuotaLimit: 9000,
      youtubeQuotaPressureRatio: 0.95,
      abuseGenerationThreshold: 10,
      abuseCostThresholdUsd: 5,
    });

    expect(result.aiSpend.totalCostUsd).toBe(7.5);
    expect(result.youtubeQuota.usedUnits).toBe(8800);
    expect(result.alertsCreated).toEqual([
      "cost_control.provider_spend_alert",
      "cost_control.youtube_quota_pressure",
      "cost_control.abuse_pressure",
    ]);
    expect(alerts).toEqual([
      expect.objectContaining({
        action: "cost_control.provider_spend_alert",
        targetType: "AiGeneration",
        targetId: "2026-05-19",
      }),
      expect.objectContaining({
        action: "cost_control.youtube_quota_pressure",
        targetType: "YoutubeQuotaUsage",
        targetId: "2026-05-19",
      }),
      expect.objectContaining({
        action: "cost_control.abuse_pressure",
        targetType: "AiGeneration",
        targetId: "2026-05-19:user-1:script_generation",
      }),
    ]);
  });

  test("skips noncritical AI jobs when the daily provider spend threshold is already reached", async () => {
    const prisma = {
      aiGeneration: {
        findMany: vi.fn(async () => [
          {
            userId: "user-1",
            taskType: "outline_generation",
            provider: "openai",
            model: "gpt-5.4",
            status: "SUCCEEDED",
            costUsd: "5.0000",
            creditsCharged: 2,
            createdAt: NOW,
          },
        ]),
      },
    };

    await expect(
      shouldSkipJobForQuotaPressure(prisma, {
        jobType: "topic_recommendation_generate",
        now: NOW,
        dailyAiSpendAlertUsd: 5,
      }),
    ).resolves.toEqual({
      skip: true,
      reason: "daily_ai_spend_threshold_reached",
      jobType: "topic_recommendation_generate",
      totalCostUsd: 5,
      thresholdUsd: 5,
    });
  });

  test("skips noncritical jobs when YouTube quota pressure is high", async () => {
    const prisma = {
      aiGeneration: {
        findMany: vi.fn(async () => []),
      },
      youtubeQuotaUsage: {
        aggregate: vi.fn(async () => ({ _sum: { units: 8500 } })),
      },
    };

    await expect(
      shouldSkipJobForQuotaPressure(prisma, {
        jobType: "outlier_score_refresh",
        now: NOW,
        dailyAiSpendAlertUsd: 50,
        dailyYoutubeQuotaLimit: 9000,
        youtubeQuotaPressureRatio: 0.9,
      }),
    ).resolves.toEqual({
      skip: true,
      reason: "youtube_quota_pressure",
      jobType: "outlier_score_refresh",
      usedUnits: 8500,
      dailyLimit: 9000,
      pressureRatio: 0.94,
      thresholdRatio: 0.9,
    });
  });
});
