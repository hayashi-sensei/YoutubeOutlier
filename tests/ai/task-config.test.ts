import { describe, expect, test } from "vitest";

import { applyAiTaskRouteOverrides, getAiTaskConfig, getAiTaskRoutingMatrix, isProviderAllowedForTask } from "../../lib/ai/task-config";
import { AI_TASK_TYPES } from "../../types/ai";

describe("AI task routing config", () => {
  test("uses OpenAI for the standard report topic recommendation route", () => {
    expect(getAiTaskConfig(AI_TASK_TYPES.topicRecommendation, "standard")).toEqual(
      expect.objectContaining({
        provider: "openai",
        model: "gpt-5.4",
        maxOutputTokens: 6000,
      }),
    );
  });

  test("exposes all task and tier combinations for admin visibility", () => {
    const matrix = getAiTaskRoutingMatrix();

    expect(matrix).toHaveLength(30);
    expect(matrix).toContainEqual(
      expect.objectContaining({
        taskType: AI_TASK_TYPES.hookGeneration,
        qualityTier: "standard",
        provider: "openai",
      }),
    );
    expect(matrix).toContainEqual(
      expect.objectContaining({
        taskType: AI_TASK_TYPES.descriptionGeneration,
        qualityTier: "premium",
        provider: "anthropic",
      }),
    );
    expect(matrix).toContainEqual(
      expect.objectContaining({
        taskType: AI_TASK_TYPES.repurposingGeneration,
        qualityTier: "standard",
        provider: "openai",
      }),
    );
    expect(matrix).toContainEqual(
      expect.objectContaining({
        taskType: AI_TASK_TYPES.reportTrendAnalysis,
        qualityTier: "standard",
        provider: "openai",
        model: "gpt-5.4-mini",
        credits: 1,
      }),
    );
    expect(matrix).toContainEqual(
      expect.objectContaining({
        taskType: AI_TASK_TYPES.imageGeneration,
        qualityTier: "premium",
        provider: "piapi",
        model: "Qubico/flux1-dev",
      }),
    );
  });

  test("applies persisted route overrides for admin-configured provider, model, and credits", () => {
    const matrix = applyAiTaskRouteOverrides([
      {
        taskType: AI_TASK_TYPES.topicRecommendation,
        qualityTier: "standard",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        credits: 1,
        estimatedCostUsd: "0.0050",
        maxOutputTokens: 1800,
        temperature: "0.25",
        updatedAt: new Date("2026-05-18T00:00:00Z"),
      },
    ]);

    expect(matrix.find((route) => route.taskType === AI_TASK_TYPES.topicRecommendation && route.qualityTier === "standard")).toEqual(
      expect.objectContaining({
        provider: "deepseek",
        model: "deepseek-v4-flash",
        credits: 1,
        estimatedCostUsd: 0.005,
        isOverride: true,
      }),
    );
  });

  test("restricts admin route providers by task capability", () => {
    expect(isProviderAllowedForTask(AI_TASK_TYPES.topicRecommendation, "openai")).toBe(true);
    expect(isProviderAllowedForTask(AI_TASK_TYPES.topicRecommendation, "piapi")).toBe(false);
    expect(isProviderAllowedForTask(AI_TASK_TYPES.imageGeneration, "piapi")).toBe(true);
    expect(isProviderAllowedForTask(AI_TASK_TYPES.imageGeneration, "anthropic")).toBe(false);
  });
});
