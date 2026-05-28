import type { PlanCode } from "@/generated/prisma/client";
import type { PlanDefinition } from "@/lib/billing/plans";

export type WorkspaceSwitcherItem = {
  id: string;
  name: string;
  planCode: PlanCode;
  primaryNiche: string | null;
};

export type ActiveWorkspaceContext = {
  userId: string;
  workspaceId: string;
  accountCreditBalance: number;
  activeWorkspace: WorkspaceSwitcherItem;
  workspaces: WorkspaceSwitcherItem[];
  entitlement: PlanDefinition;
};

export type WorkspaceCreateInput = {
  name: string;
  primaryNiche: string;
  targetAudience?: string;
};
