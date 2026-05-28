import type { PlanCode } from "@/generated/prisma/client";
import { getEffectivePlanEntitlement, type PlanLimitOverride, type UserRoleLimitOverride } from "@/lib/billing/plans";
import type { ActiveWorkspaceContext, WorkspaceSwitcherItem } from "@/types/workspaces";

type WorkspaceMembershipRow = {
  workspace: {
    id: string;
    name: string;
    planCode: PlanCode;
    createdAt: Date;
    settings: { primaryNiche: string } | null;
  };
};

type WorkspaceSelectionUserRow = {
  id: string;
  role: "USER" | "ADMIN";
  creditBalance: number;
  defaultWorkspaceId: string | null;
  workspaces: WorkspaceMembershipRow[];
};

export type WorkspaceSelectionClient = {
  user: {
    findUnique(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  planLimit: {
    findMany(args?: unknown): Promise<unknown>;
  };
  userRoleLimit?: {
    findMany(args?: unknown): Promise<unknown>;
  };
};

export function chooseActiveWorkspace(input: {
  defaultWorkspaceId: string | null;
  workspaces: WorkspaceSwitcherItem[];
  requestedWorkspaceId?: string | null;
}): WorkspaceSwitcherItem | null {
  const requested = input.requestedWorkspaceId
    ? input.workspaces.find((workspace) => workspace.id === input.requestedWorkspaceId)
    : null;

  if (requested) {
    return requested;
  }

  const currentDefault = input.defaultWorkspaceId
    ? input.workspaces.find((workspace) => workspace.id === input.defaultWorkspaceId)
    : null;

  return currentDefault ?? input.workspaces[0] ?? null;
}

export async function getActiveWorkspaceContext(
  client: WorkspaceSelectionClient,
  input: { userId: string; requestedWorkspaceId?: string | null },
): Promise<ActiveWorkspaceContext | null> {
  const userResult = await client.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      role: true,
      creditBalance: true,
      defaultWorkspaceId: true,
      workspaces: {
        orderBy: { workspace: { createdAt: "asc" } },
        select: {
          workspace: {
            select: {
              id: true,
              name: true,
              planCode: true,
              createdAt: true,
              settings: { select: { primaryNiche: true } },
            },
          },
        },
      },
    },
  });
  const overrideResult = await client.planLimit.findMany({
    orderBy: { planCode: "asc" },
    select: {
      planCode: true,
      monthlyCredits: true,
      maxTrackedChannels: true,
      maxWorkspaces: true,
    },
  });
  const userRoleOverrideResult = client.userRoleLimit
    ? await client.userRoleLimit.findMany({
        orderBy: { role: "asc" },
        select: {
          role: true,
          monthlyCredits: true,
          maxTrackedChannels: true,
          maxWorkspaces: true,
        },
      })
    : [];
  const user = userResult as WorkspaceSelectionUserRow | null;
  const overrides = overrideResult as PlanLimitOverride[];
  const userRoleOverrides = userRoleOverrideResult as UserRoleLimitOverride[];

  if (!user) {
    return null;
  }

  const workspaces = user.workspaces.map(({ workspace }) => ({
    id: workspace.id,
    name: workspace.name,
    planCode: workspace.planCode,
    primaryNiche: workspace.settings?.primaryNiche ?? null,
  }));
  const activeWorkspace = chooseActiveWorkspace({
    defaultWorkspaceId: user.defaultWorkspaceId,
    requestedWorkspaceId: input.requestedWorkspaceId,
    workspaces,
  });

  if (!activeWorkspace) {
    return null;
  }

  if (user.defaultWorkspaceId !== activeWorkspace.id) {
    await client.user.update({
      where: { id: user.id },
      data: { defaultWorkspaceId: activeWorkspace.id },
    });
  }

  return {
    userId: user.id,
    workspaceId: activeWorkspace.id,
    accountCreditBalance: user.creditBalance,
    activeWorkspace,
    workspaces,
    entitlement: getEffectivePlanEntitlement({
      planCode: activeWorkspace.planCode,
      userRole: user.role,
      overrides,
      userRoleOverrides,
    }),
  };
}
