import type { PlanCode, Prisma, UserRole } from "@/generated/prisma/client";
import {
  getAdminPlanEntitlement,
  getEffectivePlanEntitlement,
  mergePlanLimitOverrides,
  type PlanLimitOverride,
  type UserRoleLimitOverride,
} from "@/lib/billing/plans";

export type PlanLimitClient = {
  planLimit: {
    findMany(args?: unknown): Promise<PlanLimitOverride[]>;
  };
  userRoleLimit?: {
    findMany(args?: unknown): Promise<UserRoleLimitOverride[]>;
  };
};

export type WorkspaceEntitlementClient = PlanLimitClient & {
  workspace: {
    findUnique(args: {
      where: { id: string };
      select: {
        planCode: boolean;
        owner: { select: { role: boolean } };
      };
    }): Promise<{ planCode: PlanCode; owner: { role: UserRole } } | null>;
  };
};

export async function getPlanLimitOverrides(client: PlanLimitClient): Promise<PlanLimitOverride[]> {
  return client.planLimit.findMany({
    orderBy: { planCode: "asc" },
    select: {
      planCode: true,
      monthlyCredits: true,
      maxTrackedChannels: true,
      maxWorkspaces: true,
    },
  });
}

export async function getUserRoleLimitOverrides(client: PlanLimitClient): Promise<UserRoleLimitOverride[]> {
  if (!client.userRoleLimit) {
    return [];
  }

  return client.userRoleLimit.findMany({
    orderBy: { role: "asc" },
    select: {
      role: true,
      monthlyCredits: true,
      maxTrackedChannels: true,
      maxWorkspaces: true,
    },
  });
}

export async function getEditablePlanDefinitions(client: PlanLimitClient) {
  return mergePlanLimitOverrides(await getPlanLimitOverrides(client));
}

export async function getEditableAdminEntitlement(client: PlanLimitClient) {
  return getAdminPlanEntitlement(await getUserRoleLimitOverrides(client));
}

export async function getWorkspacePlanEntitlement(client: WorkspaceEntitlementClient, workspaceId: string) {
  const workspace = await client.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      planCode: true,
      owner: { select: { role: true } },
    },
  });

  if (!workspace) {
    return null;
  }

  const [overrides, userRoleOverrides] = await Promise.all([
    getPlanLimitOverrides(client),
    getUserRoleLimitOverrides(client),
  ]);

  return getEffectivePlanEntitlement({
    planCode: workspace.planCode,
    userRole: workspace.owner.role,
    overrides,
    userRoleOverrides,
  });
}

export async function upsertPlanLimits(
  tx: Prisma.TransactionClient,
  limits: Array<{ planCode: PlanCode; monthlyCredits: number; maxTrackedChannels: number; maxWorkspaces: number }>,
) {
  for (const limit of limits) {
    await tx.planLimit.upsert({
      where: { planCode: limit.planCode },
      update: {
        monthlyCredits: limit.monthlyCredits,
        maxTrackedChannels: limit.maxTrackedChannels,
        maxWorkspaces: limit.maxWorkspaces,
      },
      create: {
        planCode: limit.planCode,
        monthlyCredits: limit.monthlyCredits,
        maxTrackedChannels: limit.maxTrackedChannels,
        maxWorkspaces: limit.maxWorkspaces,
      },
    });
  }
}

export async function upsertUserRoleLimits(
  tx: Prisma.TransactionClient,
  limits: Array<{ role: UserRole; monthlyCredits: number; maxTrackedChannels: number; maxWorkspaces: number }>,
) {
  for (const limit of limits) {
    await tx.userRoleLimit.upsert({
      where: { role: limit.role },
      update: {
        monthlyCredits: limit.monthlyCredits,
        maxTrackedChannels: limit.maxTrackedChannels,
        maxWorkspaces: limit.maxWorkspaces,
      },
      create: {
        role: limit.role,
        monthlyCredits: limit.monthlyCredits,
        maxTrackedChannels: limit.maxTrackedChannels,
        maxWorkspaces: limit.maxWorkspaces,
      },
    });
  }
}
