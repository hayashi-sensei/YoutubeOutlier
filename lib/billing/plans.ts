import type { PlanCode, UserRole } from "@/generated/prisma/client";

export type PaidPlanCode = Exclude<PlanCode, "FREE">;

export type PlanDefinition = {
  code: PlanCode;
  name: string;
  monthlyPriceUsd: number;
  monthlyCredits: number;
  maxTrackedChannels: number;
  maxWorkspaces: number;
};

export type PlanLimitOverride = {
  planCode: PlanCode;
  monthlyCredits: number;
  maxTrackedChannels: number;
  maxWorkspaces: number;
};

export type UserRoleLimitOverride = {
  role: UserRole;
  monthlyCredits: number;
  maxTrackedChannels: number;
  maxWorkspaces: number;
};

export type CreditPackCode = "small" | "medium" | "large";

export type CreditPack = {
  code: CreditPackCode;
  name: string;
  credits: number;
  priceUsd: number;
};

export const PLAN_DEFINITIONS = {
  FREE: {
    code: "FREE",
    name: "Free",
    monthlyPriceUsd: 0,
    monthlyCredits: 0,
    maxTrackedChannels: 0,
    maxWorkspaces: 0,
  },
  STARTER: {
    code: "STARTER",
    name: "Starter",
    monthlyPriceUsd: 49,
    monthlyCredits: 100,
    maxTrackedChannels: 5,
    maxWorkspaces: 1,
  },
  PRO: {
    code: "PRO",
    name: "Pro",
    monthlyPriceUsd: 99,
    monthlyCredits: 250,
    maxTrackedChannels: 15,
    maxWorkspaces: 5,
  },
  PREMIUM: {
    code: "PREMIUM",
    name: "Premium",
    monthlyPriceUsd: 199,
    monthlyCredits: 700,
    maxTrackedChannels: 25,
    maxWorkspaces: 10,
  },
} satisfies Record<PlanCode, PlanDefinition>;

export const ADMIN_PLAN_ENTITLEMENT = {
  monthlyCredits: 800,
  maxTrackedChannels: 25,
  maxWorkspaces: 10,
} as const;

export const CREDIT_PACKS = {
  small: {
    code: "small",
    name: "100 credits",
    credits: 100,
    priceUsd: 19,
  },
  medium: {
    code: "medium",
    name: "300 credits",
    credits: 300,
    priceUsd: 49,
  },
  large: {
    code: "large",
    name: "800 credits",
    credits: 800,
    priceUsd: 119,
  },
} satisfies Record<CreditPackCode, CreditPack>;

export function getPlanEntitlement(planCode: PlanCode) {
  return PLAN_DEFINITIONS[planCode];
}

export function mergePlanLimitOverrides(overrides: PlanLimitOverride[] = []) {
  const definitions: Record<PlanCode, PlanDefinition> = { ...PLAN_DEFINITIONS };

  for (const override of overrides) {
    definitions[override.planCode] = {
      ...definitions[override.planCode],
      monthlyCredits: override.monthlyCredits,
      maxTrackedChannels: override.maxTrackedChannels,
      maxWorkspaces: override.maxWorkspaces,
    };
  }

  return definitions;
}

export function getAdminPlanEntitlement(overrides: UserRoleLimitOverride[] = []) {
  const override = overrides.find((limit) => limit.role === "ADMIN");

  return override
    ? {
        monthlyCredits: override.monthlyCredits,
        maxTrackedChannels: override.maxTrackedChannels,
        maxWorkspaces: override.maxWorkspaces,
      }
    : ADMIN_PLAN_ENTITLEMENT;
}

export function getEffectivePlanEntitlement(input: {
  planCode: PlanCode;
  userRole?: UserRole | null;
  overrides?: PlanLimitOverride[];
  userRoleOverrides?: UserRoleLimitOverride[];
}) {
  const definition = mergePlanLimitOverrides(input.overrides)[input.planCode];

  if (input.userRole === "ADMIN") {
    const adminEntitlement = getAdminPlanEntitlement(input.userRoleOverrides);

    return {
      ...definition,
      monthlyCredits: Math.max(definition.monthlyCredits, adminEntitlement.monthlyCredits),
      maxTrackedChannels: Math.max(definition.maxTrackedChannels, adminEntitlement.maxTrackedChannels),
      maxWorkspaces: Math.max(definition.maxWorkspaces, adminEntitlement.maxWorkspaces),
    };
  }

  return definition;
}
