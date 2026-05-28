import type { AiGenerationStatus } from "@/generated/prisma/client";
import { getAiProviderHealth, parseProviderPingMetadata } from "@/lib/admin/ai-provider-health";
import { applyAiTaskRouteOverrides } from "@/lib/ai/task-config";
import { getEditableAdminEntitlement, getEditablePlanDefinitions } from "@/lib/billing/plan-limits";
import { summarizeAiCostByUserAndTask } from "@/lib/cost-controls/quotas";
import { getPrismaClient } from "@/lib/db/prisma";

type GenerationSummaryInput = {
  provider: string;
  model: string;
  status: AiGenerationStatus;
  costUsd: string | number | null;
  creditsCharged: number;
};

export function summarizeProviderFailures(rows: GenerationSummaryInput[]) {
  const grouped = new Map<string, { provider: string; model: string; failures: number }>();

  for (const row of rows) {
    if (row.status !== "FAILED") {
      continue;
    }

    const key = `${row.provider}:${row.model}`;
    const current = grouped.get(key) ?? { provider: row.provider, model: row.model, failures: 0 };
    current.failures += 1;
    grouped.set(key, current);
  }

  return [...grouped.values()].sort((a, b) => b.failures - a.failures);
}

export function summarizeUserUsage(rows: GenerationSummaryInput[]) {
  return rows.reduce(
    (summary, row) => ({
      generations: summary.generations + 1,
      failedGenerations: summary.failedGenerations + (row.status === "FAILED" ? 1 : 0),
      creditsCharged: summary.creditsCharged + row.creditsCharged,
      costUsd: summary.costUsd + Number(row.costUsd ?? 0),
    }),
    { generations: 0, failedGenerations: 0, creditsCharged: 0, costUsd: 0 },
  );
}

export function summarizeQueueLatency(rows: Array<{ queueLatencyMs: number | null }>) {
  const latencies = rows
    .map((row) => row.queueLatencyMs)
    .filter((value): value is number => typeof value === "number");

  if (latencies.length === 0) {
    return {
      samples: 0,
      averageMs: 0,
      maxMs: 0,
    };
  }

  return {
    samples: latencies.length,
    averageMs: Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
    maxMs: Math.max(...latencies),
  };
}

export async function getAdminOverview(search: string | null) {
  const prisma = getPrismaClient();
  const normalizedSearch = search?.trim() ?? "";

  const users = await prisma.user.findMany({
    where: normalizedSearch
      ? {
          OR: [
            { email: { contains: normalizedSearch, mode: "insensitive" } },
            { name: { contains: normalizedSearch, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      creditBalance: true,
      createdAt: true,
      defaultWorkspaceId: true,
      creditTransactions: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceAfter: true,
          description: true,
          createdAt: true,
          workspace: { select: { name: true } },
        },
      },
      ownedWorkspaces: {
        take: 3,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          planCode: true,
          subscriptions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              planCode: true,
              status: true,
              currentPeriodEnd: true,
              cancelAtPeriodEnd: true,
            },
          },
        },
      },
      aiGenerations: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          provider: true,
          model: true,
          status: true,
          taskType: true,
          costUsd: true,
          creditsCharged: true,
          inputTokens: true,
          outputTokens: true,
          errorMessage: true,
          createdAt: true,
        },
      },
    },
  });

  const [
    failedJobs,
    recentJobs,
    queuedJobs,
    runningJobs,
    retryingJobs,
    recentAiGenerations,
    failedReports,
    auditLogs,
    providerPingLogs,
    aiTaskRouteOverrides,
    planDefinitions,
    adminEntitlement,
    recentEmailLogs,
  ] = await Promise.all([
    prisma.jobRun.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        workspaceId: true,
        jobType: true,
        provider: true,
        referenceType: true,
        referenceId: true,
        attempts: true,
        maxAttempts: true,
        availableAt: true,
        queueLatencyMs: true,
        errorMessage: true,
        providerError: true,
        updatedAt: true,
      },
    }),
    prisma.jobRun.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        jobType: true,
        status: true,
        provider: true,
        queueLatencyMs: true,
        updatedAt: true,
      },
    }),
    prisma.jobRun.count({ where: { status: "QUEUED" } }),
    prisma.jobRun.count({ where: { status: "RUNNING" } }),
    prisma.jobRun.count({ where: { status: "RETRYING" } }),
    prisma.aiGeneration.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        workspaceId: true,
        userId: true,
        taskType: true,
        provider: true,
        model: true,
        status: true,
        costUsd: true,
        creditsCharged: true,
        inputTokens: true,
        outputTokens: true,
        errorMessage: true,
        createdAt: true,
      },
    }),
    prisma.researchReport.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        workspaceId: true,
        title: true,
        errorMessage: true,
        updatedAt: true,
      },
    }),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        reason: true,
        createdAt: true,
        actor: { select: { email: true } },
      },
    }),
    prisma.adminAuditLog.findMany({
      where: { action: "ai_provider.ping" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        metadata: true,
        createdAt: true,
      },
    }),
    prisma.aiTaskRouteOverride.findMany({
      select: {
        taskType: true,
        qualityTier: true,
        provider: true,
        model: true,
        credits: true,
        estimatedCostUsd: true,
        maxOutputTokens: true,
        temperature: true,
        updatedAt: true,
      },
    }),
    getEditablePlanDefinitions(prisma),
    getEditableAdminEntitlement(prisma),
    prisma.emailLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        workspaceId: true,
        toEmail: true,
        template: true,
        provider: true,
        providerId: true,
        status: true,
        errorMessage: true,
        createdAt: true,
      },
    }),
  ]);
  const providerPings = providerPingLogs
    .map((log) => parseProviderPingMetadata(log.metadata) ?? parseProviderPingMetadata({ checkedAt: log.createdAt.toISOString() }))
    .filter((ping): ping is NonNullable<typeof ping> => ping !== null);

  return {
    users,
    failedJobs,
    queueHealth: {
      queued: queuedJobs,
      running: runningJobs,
      retrying: retryingJobs,
      latency: summarizeQueueLatency(recentJobs),
    },
    failedReports,
    auditLogs,
    recentAiGenerations,
    aiTaskRoutes: applyAiTaskRouteOverrides(
      aiTaskRouteOverrides.map((route) => ({
        ...route,
        estimatedCostUsd: route.estimatedCostUsd.toString(),
        temperature: route.temperature.toString(),
      })),
    ),
    aiProviders: getAiProviderHealth(
      recentAiGenerations.map((row) => ({
        provider: row.provider,
        model: row.model,
        status: row.status,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt,
      })),
      process.env,
      providerPings,
    ),
    planDefinitions: Object.values(planDefinitions),
    adminEntitlement,
    providerFailures: summarizeProviderFailures(
      recentAiGenerations.map((row) => ({
        provider: row.provider,
        model: row.model,
        status: row.status,
        costUsd: row.costUsd?.toString() ?? null,
        creditsCharged: row.creditsCharged,
      })),
    ),
    userTaskCosts: summarizeAiCostByUserAndTask(
      recentAiGenerations.map((row) => ({
        userId: row.userId,
        taskType: row.taskType,
        costUsd: row.costUsd?.toString() ?? null,
        creditsCharged: row.creditsCharged,
      })),
    ),
    recentEmailLogs,
  };
}
