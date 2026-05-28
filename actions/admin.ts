"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pingAiProvider } from "@/lib/admin/ai-provider-health";
import { requireAdmin } from "@/lib/admin/auth";
import { assertReportRetryClaimed, assertReportRetryable, getRetriedReportData, ReportRetryError } from "@/lib/admin/report-retry";
import { upsertPlanLimits, upsertUserRoleLimits } from "@/lib/billing/plan-limits";
import { PLAN_DEFINITIONS } from "@/lib/billing/plans";
import { applyAdminCreditAdjustment, CreditBalanceError, CreditInputError } from "@/lib/billing/credits";
import { getPrismaClient } from "@/lib/db/prisma";
import { retryFailedJob as retryJobRun } from "@/lib/jobs/queue";
import { AI_PROVIDER_MODEL_PRESETS, getAiTaskConfig, isAiQualityTier, isAiTaskType, isProviderAllowedForTask } from "@/lib/ai/task-config";
import { AI_PROVIDER_CATALOG } from "@/lib/admin/ai-provider-health";

function redirectTo(url: string): never {
  redirect(url as never);
}

function getCreditAdjustmentErrorCode(error: unknown): string | null {
  if (error instanceof CreditBalanceError) {
    return "credit_balance_error";
  }

  if (error instanceof CreditInputError) {
    return "invalid_adjustment";
  }

  return null;
}

export async function adjustWorkspaceCredits(formData: FormData) {
  const { appUser } = await requireAdmin();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const amount = Number.parseInt(String(formData.get("amount") ?? ""), 10);
  const reason = String(formData.get("reason") ?? "").trim();

  if (!workspaceId || !Number.isInteger(amount) || amount === 0 || !reason) {
    redirectTo("/app/admin?error=invalid_adjustment");
  }

  const prisma = getPrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      await applyAdminCreditAdjustment(tx, {
        workspaceId,
        actorUserId: appUser.id,
        amount,
        reason,
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId: appUser.id,
          action: "credit.adjust",
          targetType: "Workspace",
          targetId: workspaceId,
          reason,
          metadata: { amount },
        },
      });
    });
  } catch (error) {
    const errorCode = getCreditAdjustmentErrorCode(error);

    if (errorCode) {
      redirectTo(`/app/admin?error=${errorCode}`);
    }

    throw error;
  }

  revalidatePath("/app/admin");
  redirectTo("/app/admin?adjusted=1");
}

export async function updatePlanLimits(formData: FormData) {
  const { appUser } = await requireAdmin();
  const adminMonthlyCredits = Number.parseInt(String(formData.get("ADMIN_monthlyCredits") ?? ""), 10);
  const adminMaxTrackedChannels = Number.parseInt(String(formData.get("ADMIN_maxTrackedChannels") ?? ""), 10);
  const adminMaxWorkspaces = Number.parseInt(String(formData.get("ADMIN_maxWorkspaces") ?? ""), 10);
  const limits = Object.values(PLAN_DEFINITIONS).map((plan) => {
    const monthlyCredits = Number.parseInt(String(formData.get(`${plan.code}_monthlyCredits`) ?? ""), 10);
    const maxTrackedChannels = Number.parseInt(String(formData.get(`${plan.code}_maxTrackedChannels`) ?? ""), 10);
    const maxWorkspaces = Number.parseInt(String(formData.get(`${plan.code}_maxWorkspaces`) ?? ""), 10);

    if (
      !Number.isInteger(monthlyCredits) ||
      monthlyCredits < 0 ||
      !Number.isInteger(maxTrackedChannels) ||
      maxTrackedChannels < 0 ||
      !Number.isInteger(maxWorkspaces) ||
      maxWorkspaces < 0
    ) {
      redirectTo("/app/admin?error=invalid_plan_limits#plan-limits");
    }

    return {
      planCode: plan.code,
      monthlyCredits,
      maxTrackedChannels,
      maxWorkspaces,
    };
  });
  const roleLimits = [
    {
      role: "ADMIN" as const,
      monthlyCredits: adminMonthlyCredits,
      maxTrackedChannels: adminMaxTrackedChannels,
      maxWorkspaces: adminMaxWorkspaces,
    },
  ];

  if (
    !Number.isInteger(adminMonthlyCredits) ||
    adminMonthlyCredits < 0 ||
    !Number.isInteger(adminMaxTrackedChannels) ||
    adminMaxTrackedChannels < 0 ||
    !Number.isInteger(adminMaxWorkspaces) ||
    adminMaxWorkspaces < 0
  ) {
    redirectTo("/app/admin?error=invalid_plan_limits#plan-limits");
  }

  const prisma = getPrismaClient();

  await prisma.$transaction(async (tx) => {
    await upsertPlanLimits(tx, limits);
    await upsertUserRoleLimits(tx, roleLimits);

    await tx.adminAuditLog.create({
      data: {
        actorUserId: appUser.id,
        action: "plan_limits.update",
        targetType: "PlanLimit",
        reason: "Admin updated subscription plan limits",
        metadata: { limits, roleLimits },
      },
    });
  });

  revalidatePath("/app/admin");
  redirectTo("/app/admin?planLimitsUpdated=1#plan-limits");
}

export async function retryFailedReport(formData: FormData) {
  const { appUser } = await requireAdmin();
  const reportId = String(formData.get("reportId") ?? "");

  if (!reportId) {
    redirectTo("/app/admin?error=invalid_report");
  }

  const prisma = getPrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      const report = await tx.researchReport.findUnique({
        where: { id: reportId },
        select: { id: true, status: true, workspaceId: true },
      });

      assertReportRetryable(report);

      const updateResult = await tx.researchReport.updateMany({
        where: { id: report.id, status: "FAILED" },
        data: getRetriedReportData(),
      });

      assertReportRetryClaimed(updateResult.count);

      await tx.jobRun.create({
        data: {
          workspaceId: report.workspaceId,
          jobType: "manual_report_generate",
          status: "QUEUED",
          referenceType: "ResearchReport",
          referenceId: report.id,
          attempts: 0,
          maxAttempts: 3,
          metadata: { retriedByAdminUserId: appUser.id },
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId: appUser.id,
          action: "report.retry",
          targetType: "ResearchReport",
          targetId: report.id,
          reason: "Admin retry of failed report",
        },
      });
    });
  } catch (error) {
    if (error instanceof ReportRetryError) {
      redirectTo("/app/admin?error=report_retry_unavailable");
    }

    throw error;
  }

  revalidatePath("/app/admin");
  redirectTo("/app/admin?reportRetried=1");
}

export async function retryFailedJobRun(formData: FormData) {
  const { appUser } = await requireAdmin();
  const jobId = String(formData.get("jobId") ?? "");

  if (!jobId) {
    redirectTo("/app/admin?error=invalid_job#jobs");
  }

  const prisma = getPrismaClient();
  try {
    await retryJobRun(prisma, {
      jobId,
      actorUserId: appUser.id,
    });
  } catch {
    redirectTo("/app/admin?error=job_retry_unavailable#jobs");
  }

  revalidatePath("/app/admin");
  redirectTo("/app/admin?jobRetried=1#jobs");
}

export async function pingAiProviderAction(formData: FormData) {
  const provider = String(formData.get("provider") ?? "");

  const { appUser } = await requireAdmin();

  const result = await pingAiProvider(provider);
  const prisma = getPrismaClient();
  await prisma.adminAuditLog.create({
    data: {
      actorUserId: appUser.id,
      action: "ai_provider.ping",
      targetType: "AiProvider",
      targetId: result.provider,
      reason: result.message,
      metadata: {
        provider: result.provider,
        ok: result.ok,
        message: result.message,
        checkedAt: new Date().toISOString(),
      },
    },
  });
  const params = new URLSearchParams({
    providerPinged: result.provider,
    providerPingStatus: result.ok ? "success" : "failed",
    providerPingMessage: result.message,
  });

  revalidatePath("/app/admin");
  redirectTo(`/app/admin?${params.toString()}#providers`);
}

export async function updateAiTaskRoute(formData: FormData) {
  const { appUser } = await requireAdmin();
  const taskType = String(formData.get("taskType") ?? "");
  const qualityTier = String(formData.get("qualityTier") ?? "");
  const provider = String(formData.get("provider") ?? "");
  const model = String(formData.get("model") ?? "").trim();
  const credits = Number.parseInt(String(formData.get("credits") ?? ""), 10);
  const estimatedCostUsd = Number.parseFloat(String(formData.get("estimatedCostUsd") ?? ""));
  const maxOutputTokens = Number.parseInt(String(formData.get("maxOutputTokens") ?? ""), 10);
  const temperature = Number.parseFloat(String(formData.get("temperature") ?? ""));

  if (
    !isAiTaskType(taskType) ||
    !isAiQualityTier(qualityTier) ||
    !AI_PROVIDER_CATALOG.some((item) => item.id === provider) ||
    !isProviderAllowedForTask(taskType, provider) ||
    !model ||
    !Number.isInteger(credits) ||
    credits < 1 ||
    !Number.isFinite(estimatedCostUsd) ||
    estimatedCostUsd < 0 ||
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < 16 ||
    !Number.isFinite(temperature) ||
    temperature < 0 ||
    temperature > 2
  ) {
    redirectTo("/app/admin?error=invalid_ai_task_route#task-routes");
  }

  const supportedModels = AI_PROVIDER_MODEL_PRESETS[provider] ?? [];
  const reason = supportedModels.includes(model) ? "Admin updated AI task route" : "Admin updated AI task route with custom model";
  const prisma = getPrismaClient();
  const fallback = getAiTaskConfig(taskType, qualityTier);

  await prisma.$transaction(async (tx) => {
    await tx.aiTaskRouteOverride.upsert({
      where: { taskType_qualityTier: { taskType, qualityTier } },
      create: {
        taskType,
        qualityTier,
        provider,
        model,
        credits,
        estimatedCostUsd,
        maxOutputTokens,
        temperature,
        updatedByUserId: appUser.id,
      },
      update: {
        provider,
        model,
        credits,
        estimatedCostUsd,
        maxOutputTokens,
        temperature,
        updatedByUserId: appUser.id,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        actorUserId: appUser.id,
        action: "ai_task_route.update",
        targetType: "AiTaskRouteOverride",
        targetId: `${taskType}:${qualityTier}`,
        reason,
        metadata: {
          taskType,
          qualityTier,
          previousDefault: fallback,
          override: {
            provider,
            model,
            credits,
            estimatedCostUsd,
            maxOutputTokens,
            temperature,
          },
        },
      },
    });
  });

  revalidatePath("/app/admin");
  redirectTo("/app/admin?aiTaskRouteUpdated=1#task-routes");
}
