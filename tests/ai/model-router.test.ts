import { describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { createAiModelRouter, supportsTemperature } from "../../lib/ai/model-router";
import type { AiTaskRouteOverrideRecord } from "../../lib/ai/task-config";
import { AI_TASK_TYPES, type AiTextExecutor, type AiTextExecutorInput } from "../../types/ai";

type Workspace = {
  id: string;
  ownerId: string;
  planCode: "FREE" | "STARTER" | "PRO" | "PREMIUM";
};

type Account = {
  id: string;
  creditBalance: number;
};

function createRouterStore(workspace: Workspace, account: Account, options: { failRefundLedgerWrite?: boolean } = {}) {
  const generations: Array<{ id: string; data: Record<string, unknown> }> = [];
  const ledger: unknown[] = [];
  let taskRouteOverride: AiTaskRouteOverrideRecord | null = null;
  const store = {
    $transaction: vi.fn(async (callback) => callback(store)),
    aiGeneration: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const generation = { id: "generation-1", data };
        generations.push(generation);
        return { id: generation.id };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const generation = generations.find((item) => item.id === where.id);
        if (generation) {
          generation.data = { ...generation.data, ...data };
        }
        return { id: where.id };
      }),
    },
    aiTaskRouteOverride: {
      findUnique: vi.fn(async () => taskRouteOverride),
    },
    user: {
      findUnique: vi.fn(async () => ({ ...account })),
      updateMany: vi.fn(async ({ where, data }: { where: { id?: string; creditBalance?: { gte?: number } }; data: { creditBalance: { decrement?: number; increment?: number } } }) => {
        const minimum = where.creditBalance?.gte;
        if (where.id !== account.id || (typeof minimum === "number" && account.creditBalance < minimum)) {
          return { count: 0 };
        }
        account.creditBalance -= data.creditBalance.decrement ?? 0;
        account.creditBalance += data.creditBalance.increment ?? 0;
        return { count: 1 };
      }),
      update: vi.fn(async () => ({ ...account })),
    },
    workspace: {
      findUnique: vi.fn(async () => ({ ...workspace, owner: { id: workspace.ownerId, role: "USER" as const } })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({ ...workspace })),
    },
    creditTransaction: {
      create: vi.fn(async ({ data }: { data: unknown }) => {
        if (
          options.failRefundLedgerWrite &&
          typeof data === "object" &&
          data !== null &&
          "type" in data &&
          (data as { type?: unknown }).type === "REFUND"
        ) {
          throw new Error("refund ledger unavailable");
        }
        ledger.push(data);
        return data;
      }),
    },
    planLimit: {
      findMany: vi.fn(async () => []),
    },
  };

  return {
    store,
    generations,
    ledger,
    workspace,
    account,
    setTaskRouteOverride: (override: AiTaskRouteOverrideRecord | null) => {
      taskRouteOverride = override;
    },
  };
}

describe("createAiModelRouter", () => {
  test("runs structured output through an executor, logs success, and deducts credits", async () => {
    const routerStore = createRouterStore({ id: "workspace-1", ownerId: "user-1", planCode: "PRO" }, { id: "user-1", creditBalance: 10 });
    const executorCalls: unknown[] = [];
    const executor: AiTextExecutor = async <TOutput>(input: AiTextExecutorInput<TOutput>) => {
      executorCalls.push(input);
      return {
      text: "",
      output: { title: "AI workflow outline" } as TOutput,
      usage: { inputTokens: 42, outputTokens: 24 },
      };
    };
    const router = createAiModelRouter({
      prisma: routerStore.store,
      textExecutor: executor,
      now: () => new Date("2026-05-18T00:00:00Z"),
    });

    const result = await router.runTextTask({
      workspaceId: "workspace-1",
      userId: "user-1",
      taskType: AI_TASK_TYPES.outlineGeneration,
      system: "system",
      prompt: "prompt",
      schema: z.object({ title: z.string() }),
    });

    expect(result.output).toEqual({ title: "AI workflow outline" });
    expect(executorCalls[0]).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({
          taskType: "outline_generation",
          model: "gpt-5.4",
        }),
      }),
    );
    expect(routerStore.generations[0].data).toEqual(
      expect.objectContaining({
        status: "SUCCEEDED",
        inputTokens: 42,
        outputTokens: 24,
        creditsCharged: 2,
      }),
    );
    expect(routerStore.account.creditBalance).toBe(8);
    expect(routerStore.ledger).toContainEqual(
      expect.objectContaining({
        type: "USAGE",
        amount: -2,
        referenceType: "AiGeneration",
        referenceId: "generation-1",
      }),
    );
  });

  test("runs success side effects in the success and credit transaction", async () => {
    const routerStore = createRouterStore({ id: "workspace-1", ownerId: "user-1", planCode: "PRO" }, { id: "user-1", creditBalance: 10 });
    const sideEffect = vi.fn(async () => undefined);
    const router = createAiModelRouter({
      prisma: routerStore.store,
      textExecutor: async <TOutput>() => ({
        text: "",
        output: { title: "Transactional outline" } as TOutput,
        usage: { inputTokens: 20, outputTokens: 10 },
      }),
      now: () => new Date("2026-05-18T00:00:00Z"),
    });

    await router.runTextTask({
      workspaceId: "workspace-1",
      userId: "user-1",
      taskType: AI_TASK_TYPES.outlineGeneration,
      system: "system",
      prompt: "prompt",
      schema: z.object({ title: z.string() }),
      onSuccessTransaction: sideEffect,
    });

    expect(sideEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: "generation-1",
        provider: "openai",
        model: "gpt-5.4",
        creditsCharged: 2,
        costUsd: 0.03,
        result: expect.objectContaining({ output: { title: "Transactional outline" } }),
        transaction: routerStore.store,
      }),
    );
    expect(routerStore.account.creditBalance).toBe(8);
  });

  test("marks the generation failed and refunds reserved credits when a success side effect fails", async () => {
    const routerStore = createRouterStore({ id: "workspace-1", ownerId: "user-1", planCode: "PRO" }, { id: "user-1", creditBalance: 10 });
    const router = createAiModelRouter({
      prisma: routerStore.store,
      textExecutor: async <TOutput>() => ({
        text: "",
        output: { title: "Unsaved outline" } as TOutput,
        usage: { inputTokens: 20, outputTokens: 10 },
      }),
      now: () => new Date("2026-05-18T00:00:00Z"),
    });

    await expect(
      router.runTextTask({
        workspaceId: "workspace-1",
        userId: "user-1",
        taskType: AI_TASK_TYPES.outlineGeneration,
        system: "system",
        prompt: "prompt",
        schema: z.object({ title: z.string() }),
        onSuccessTransaction: async () => {
          throw new Error("asset save failed");
        },
      }),
    ).rejects.toThrow("asset save failed");

    expect(routerStore.generations[0].data).toEqual(
      expect.objectContaining({
        status: "FAILED",
        creditsCharged: 0,
        errorMessage: "asset save failed",
      }),
    );
    expect(routerStore.account.creditBalance).toBe(10);
    expect(routerStore.ledger).toEqual([
      expect.objectContaining({ type: "USAGE", amount: -2 }),
      expect.objectContaining({ type: "REFUND", amount: 2 }),
    ]);
  });

  test("logs failed generations and refunds reserved credits", async () => {
    const routerStore = createRouterStore({ id: "workspace-1", ownerId: "user-1", planCode: "PRO" }, { id: "user-1", creditBalance: 10 });
    const router = createAiModelRouter({
      prisma: routerStore.store,
      textExecutor: vi.fn(async () => {
        throw new Error("provider unavailable");
      }),
      now: () => new Date("2026-05-18T00:00:00Z"),
    });

    await expect(
      router.runTextTask({
        workspaceId: "workspace-1",
        userId: "user-1",
        taskType: AI_TASK_TYPES.scriptGeneration,
        system: "system",
        prompt: "prompt",
      }),
    ).rejects.toThrow("provider unavailable");

    expect(routerStore.generations[0].data).toEqual(
      expect.objectContaining({
        status: "FAILED",
        creditsCharged: 0,
        errorMessage: "provider unavailable",
      }),
    );
    expect(routerStore.account.creditBalance).toBe(10);
    expect(routerStore.ledger).toEqual([
      expect.objectContaining({ type: "USAGE", amount: -6 }),
      expect.objectContaining({ type: "REFUND", amount: 6 }),
    ]);
  });

  test("retries structured output once with stricter JSON instructions before failing", async () => {
    const routerStore = createRouterStore({ id: "workspace-1", ownerId: "user-1", planCode: "PRO" }, { id: "user-1", creditBalance: 10 });
    const executorCalls: Array<AiTextExecutorInput<unknown>> = [];
    const executor: AiTextExecutor = async <TOutput>(input: AiTextExecutorInput<TOutput>) => {
      executorCalls.push(input as AiTextExecutorInput<unknown>);
      if (executorCalls.length === 1) {
        const error = new Error("No object generated: response did not match schema.");
        error.name = "AI_NoObjectGeneratedError";
        Object.assign(error, { usage: { inputTokens: 30, outputTokens: 18 } });
        throw error;
      }
      return {
        text: "",
        output: { title: "Recovered script" } as TOutput,
        usage: { inputTokens: 20, outputTokens: 12 },
      };
    };
    const router = createAiModelRouter({
      prisma: routerStore.store,
      textExecutor: executor,
      now: () => new Date("2026-05-18T00:00:00Z"),
    });

    const result = await router.runTextTask({
      workspaceId: "workspace-1",
      userId: "user-1",
      taskType: AI_TASK_TYPES.scriptGeneration,
      system: "system",
      prompt: "prompt",
      schema: z.object({ title: z.string() }),
    });

    expect(result.output).toEqual({ title: "Recovered script" });
    expect(executorCalls).toHaveLength(2);
    expect(executorCalls[1]?.system).toContain("valid JSON");
    expect(routerStore.generations[0].data).toEqual(
      expect.objectContaining({
        status: "SUCCEEDED",
        inputTokens: 50,
        outputTokens: 30,
        costUsd: 0.24,
        creditsCharged: 6,
        responseJson: expect.objectContaining({
          retryAttempts: 1,
        }),
      }),
    );
    expect(routerStore.account.creditBalance).toBe(4);
  });

  test("checks credit balance before executing a provider call", async () => {
    const routerStore = createRouterStore({ id: "workspace-1", ownerId: "user-1", planCode: "PRO" }, { id: "user-1", creditBalance: 1 });
    const executorCalls: unknown[] = [];
    const executor: AiTextExecutor = async <TOutput>(input: AiTextExecutorInput<TOutput>) => {
      executorCalls.push(input);
      return {
        text: "",
        output: { title: "Expensive script" } as TOutput,
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    };
    const router = createAiModelRouter({
      prisma: routerStore.store,
      textExecutor: executor,
      now: () => new Date("2026-05-18T00:00:00Z"),
    });

    await expect(
      router.runTextTask({
        workspaceId: "workspace-1",
        userId: "user-1",
        taskType: AI_TASK_TYPES.scriptGeneration,
        system: "system",
        prompt: "prompt",
      }),
    ).rejects.toThrow("Insufficient credits");

    expect(executorCalls).toHaveLength(0);
    expect(routerStore.generations[0].data).toEqual(
      expect.objectContaining({
        status: "FAILED",
        creditsCharged: 0,
      }),
    );
    expect(routerStore.account.creditBalance).toBe(1);
    expect(routerStore.ledger).toHaveLength(0);
  });

  test("reserves credits before executing the provider and refunds provider failures", async () => {
    const routerStore = createRouterStore({ id: "workspace-1", ownerId: "user-1", planCode: "PRO" }, { id: "user-1", creditBalance: 10 });
    const balanceSeenByProvider: number[] = [];
    const router = createAiModelRouter({
      prisma: routerStore.store,
      textExecutor: vi.fn(async () => {
        balanceSeenByProvider.push(routerStore.account.creditBalance);
        throw new Error("provider timeout");
      }),
      now: () => new Date("2026-05-18T00:00:00Z"),
    });

    await expect(
      router.runTextTask({
        workspaceId: "workspace-1",
        userId: "user-1",
        taskType: AI_TASK_TYPES.scriptGeneration,
        system: "system",
        prompt: "prompt",
      }),
    ).rejects.toThrow("provider timeout");

    expect(balanceSeenByProvider).toEqual([4]);
    expect(routerStore.account.creditBalance).toBe(10);
    expect(routerStore.ledger).toEqual([
      expect.objectContaining({ type: "USAGE", amount: -6 }),
      expect.objectContaining({ type: "REFUND", amount: 6 }),
    ]);
    expect(routerStore.generations[0].data).toEqual(
      expect.objectContaining({
        status: "FAILED",
        creditsCharged: 0,
        errorMessage: "provider timeout",
      }),
    );
  });

  test("marks failed generations terminal even when refund logging fails", async () => {
    const routerStore = createRouterStore(
      { id: "workspace-1", ownerId: "user-1", planCode: "PRO" },
      { id: "user-1", creditBalance: 10 },
      { failRefundLedgerWrite: true },
    );
    const router = createAiModelRouter({
      prisma: routerStore.store,
      textExecutor: vi.fn(async () => {
        throw new Error("provider timeout");
      }),
      now: () => new Date("2026-05-18T00:00:00Z"),
    });

    await expect(
      router.runTextTask({
        workspaceId: "workspace-1",
        userId: "user-1",
        taskType: AI_TASK_TYPES.scriptGeneration,
        system: "system",
        prompt: "prompt",
      }),
    ).rejects.toThrow("provider timeout");

    expect(routerStore.generations[0].data).toEqual(
      expect.objectContaining({
        status: "FAILED",
        creditsCharged: 0,
        errorMessage: expect.stringContaining("provider timeout"),
      }),
    );
  });

  test("rejects zero-credit routes before executing a provider call", async () => {
    const routerStore = createRouterStore({ id: "workspace-1", ownerId: "user-1", planCode: "PRO" }, { id: "user-1", creditBalance: 10 });
    routerStore.setTaskRouteOverride({
      taskType: "outline_generation",
      qualityTier: "standard",
      provider: "openai",
      model: "gpt-5.4",
      credits: 0,
      estimatedCostUsd: "0.0000",
      maxOutputTokens: 1600,
      temperature: "0.30",
      updatedAt: new Date("2026-05-18T00:00:00Z"),
    });
    const executorCalls: unknown[] = [];
    const executor: AiTextExecutor = async <TOutput>(input: AiTextExecutorInput<TOutput>) => {
      executorCalls.push(input);
      return {
        text: "",
        output: { title: "Free outline" } as TOutput,
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    };
    const router = createAiModelRouter({
      prisma: routerStore.store,
      textExecutor: executor,
      now: () => new Date("2026-05-18T00:00:00Z"),
    });

    await expect(
      router.runTextTask({
        workspaceId: "workspace-1",
        taskType: AI_TASK_TYPES.outlineGeneration,
        system: "system",
        prompt: "prompt",
      }),
    ).rejects.toThrow("Credits must be a positive integer");

    expect(executorCalls).toHaveLength(0);
    expect(routerStore.account.creditBalance).toBe(10);
    expect(routerStore.ledger).toHaveLength(0);
  });

  test("uses persisted task route overrides before falling back to defaults", async () => {
    const routerStore = createRouterStore({ id: "workspace-1", ownerId: "user-1", planCode: "PRO" }, { id: "user-1", creditBalance: 10 });
    routerStore.setTaskRouteOverride({
      taskType: "outline_generation",
      qualityTier: "standard",
      provider: "google",
      model: "gemini-3.1-flash-lite",
      credits: 1,
      estimatedCostUsd: "0.0100",
      maxOutputTokens: 1600,
      temperature: "0.30",
      updatedAt: new Date("2026-05-18T00:00:00Z"),
    });
    const executorCalls: unknown[] = [];
    const router = createAiModelRouter({
      prisma: routerStore.store,
      textExecutor: async <TOutput>(input: AiTextExecutorInput<TOutput>) => {
        executorCalls.push(input);
        return {
          text: "",
          output: { title: "AI workflow outline" } as TOutput,
          usage: { inputTokens: 12, outputTokens: 8 },
        };
      },
    });

    const result = await router.runTextTask({
      workspaceId: "workspace-1",
      taskType: AI_TASK_TYPES.outlineGeneration,
      system: "system",
      prompt: "prompt",
      schema: z.object({ title: z.string() }),
    });

    expect(result).toEqual(
      expect.objectContaining({
        provider: "google",
        model: "gemini-3.1-flash-lite",
        creditsCharged: 1,
        costUsd: 0.01,
      }),
    );
    expect(executorCalls[0]).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({
          provider: "google",
          model: "gemini-3.1-flash-lite",
          credits: 1,
        }),
      }),
    );
    expect(routerStore.account.creditBalance).toBe(9);
  });

  test("omits temperature for OpenAI GPT-5 reasoning models", () => {
    expect(supportsTemperature({ provider: "openai", model: "gpt-5.4" })).toBe(false);
    expect(supportsTemperature({ provider: "openai", model: "gpt-5.4-mini" })).toBe(false);
    expect(supportsTemperature({ provider: "anthropic", model: "claude-sonnet-4-6" })).toBe(true);
    expect(supportsTemperature({ provider: "openai", model: "gpt-image-1" })).toBe(true);
  });
});
