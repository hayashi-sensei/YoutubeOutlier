import { describe, expect, test } from "vitest";

import type { AiTextExecutor } from "../../types/ai";
import {
  buildCompetitorTrendInsights,
  generateCompetitorTrendInsights,
} from "../../lib/reports/trends";

describe("report competitor trends", () => {
  test("extracts top trends from same-day competitor video headlines", () => {
    const trends = buildCompetitorTrendInsights([
      {
        title: "Build AI agents for client onboarding",
        channelTitle: "Automation Lab",
      },
      {
        title: "AI agents that automate sales follow up",
        channelTitle: "Growth Systems",
      },
      {
        title: "Client onboarding automation with ChatGPT",
        channelTitle: "Agency Ops",
      },
      {
        title: "YouTube Shorts editing workflow in CapCut",
        channelTitle: "Creator Studio",
      },
      {
        title: "CapCut shorts workflow for faceless channels",
        channelTitle: "Shorts School",
      },
      {
        title: "Notion dashboard tour for solopreneurs",
        channelTitle: "Systems Daily",
      },
    ]);

    expect(trends).toHaveLength(5);
    expect(trends[0]).toEqual(
      expect.objectContaining({
        title: "AI Agents",
        videoCount: 2,
        channelCount: 2,
        supportingTitles: [
          "Build AI agents for client onboarding",
          "AI agents that automate sales follow up",
        ],
      }),
    );
    expect(trends[1]).toEqual(
      expect.objectContaining({
        title: "Client Onboarding",
        videoCount: 2,
      }),
    );
    expect(trends.map((trend) => trend.title)).toContain("Capcut");
  });

  test("returns no trends when there are no competitor uploads", () => {
    expect(buildCompetitorTrendInsights([])).toEqual([]);
  });

  test("uses the AI router so competitor trend analysis is logged and charged", async () => {
    const routerStore = createRouterStore();
    const executor: AiTextExecutor = async <TOutput>() => ({
      text: "",
      output: {
        trends: [
          {
            title: "Agent onboarding anxiety",
            summary: "Competitors are packaging AI agent videos around client onboarding pain.",
            videoCount: 2,
            channelCount: 2,
            supportingTitles: [
              "Build AI agents for client onboarding",
              "Client onboarding automation with ChatGPT",
            ],
          },
        ],
      } as TOutput,
      usage: { inputTokens: 120, outputTokens: 80 },
    });

    const trends = await generateCompetitorTrendInsights({
      prisma: routerStore.store,
      workspaceId: "workspace-1",
      userId: "user-1",
      reportId: "report-1",
      textExecutor: executor,
      now: new Date("2026-05-19T00:00:00Z"),
      videos: [
        {
          title: "Build AI agents for client onboarding",
          channelTitle: "Automation Lab",
        },
        {
          title: "Client onboarding automation with ChatGPT",
          channelTitle: "Agency Ops",
        },
      ],
    });

    expect(trends[0]).toEqual(
      expect.objectContaining({
        title: "Agent onboarding anxiety",
        videoCount: 2,
      }),
    );
    expect(routerStore.generations[0].data).toEqual(
      expect.objectContaining({
        taskType: "report_trend_analysis",
        status: "SUCCEEDED",
        creditsCharged: 1,
      }),
    );
    expect(routerStore.ledger).toContainEqual(
      expect.objectContaining({
        referenceType: "ResearchReport",
        referenceId: "report-1",
        description: "report_trend_analysis",
        amount: -1,
      }),
    );
  });
});

function createRouterStore() {
  const account = { id: "user-1", creditBalance: 10 };
  const generations: Array<{ id: string; data: Record<string, unknown> }> = [];
  const ledger: unknown[] = [];
  const store: any = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(store),
    aiGeneration: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const generation = { id: "generation-1", data };
        generations.push(generation);
        return { id: generation.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const generation = generations.find((item) => item.id === where.id);
        if (generation) {
          generation.data = { ...generation.data, ...data };
        }
        return { id: where.id };
      },
    },
    aiTaskRouteOverride: {
      findUnique: async () => null,
    },
    workspace: {
      findUnique: async () => ({ id: "workspace-1", ownerId: "user-1", owner: { id: "user-1" } }),
      updateMany: async () => ({ count: 1 }),
    },
    user: {
      findUnique: async () => ({ ...account }),
      updateMany: async ({ data }: { data: { creditBalance: { decrement?: number } } }) => {
        account.creditBalance -= data.creditBalance.decrement ?? 0;
        return { count: 1 };
      },
    },
    creditTransaction: {
      create: async ({ data }: { data: unknown }) => {
        ledger.push(data);
        return data;
      },
    },
    planLimit: {
      findMany: async () => [],
    },
  };

  return { store, generations, ledger };
}
