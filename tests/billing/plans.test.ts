import { describe, expect, test } from "vitest";
import {
  ADMIN_PLAN_ENTITLEMENT,
  CREDIT_PACKS,
  PLAN_DEFINITIONS,
  getAdminPlanEntitlement,
  getEffectivePlanEntitlement,
  getPlanEntitlement,
  mergePlanLimitOverrides,
} from "../../lib/billing/plans";

describe("billing plan definitions", () => {
  test("defines paid monthly plans with prices and monthly credit allowances", () => {
    expect(PLAN_DEFINITIONS.STARTER).toMatchObject({
      code: "STARTER",
      name: "Starter",
      monthlyPriceUsd: 49,
      monthlyCredits: 100,
    });
    expect(PLAN_DEFINITIONS.PRO).toMatchObject({
      code: "PRO",
      name: "Pro",
      monthlyPriceUsd: 99,
      monthlyCredits: 250,
    });
    expect(PLAN_DEFINITIONS.PREMIUM).toMatchObject({
      code: "PREMIUM",
      name: "Premium",
      monthlyPriceUsd: 199,
      monthlyCredits: 700,
    });
    expect(PLAN_DEFINITIONS.FREE.maxTrackedChannels).toBe(0);
    expect(PLAN_DEFINITIONS.STARTER.maxTrackedChannels).toBe(5);
    expect(PLAN_DEFINITIONS.PRO.maxTrackedChannels).toBe(15);
    expect(PLAN_DEFINITIONS.PREMIUM.maxTrackedChannels).toBe(25);
    expect(PLAN_DEFINITIONS.FREE.maxWorkspaces).toBe(0);
    expect(PLAN_DEFINITIONS.STARTER.maxWorkspaces).toBe(1);
    expect(PLAN_DEFINITIONS.PRO.maxWorkspaces).toBe(5);
    expect(PLAN_DEFINITIONS.PREMIUM.maxWorkspaces).toBe(10);
  });

  test("exposes extra credit packs separately from monthly entitlements", () => {
    expect(CREDIT_PACKS.small).toMatchObject({
      code: "small",
      credits: 100,
      priceUsd: 19,
    });
    expect(getPlanEntitlement("FREE").monthlyCredits).toBe(0);
  });

  test("merges editable plan limit overrides", () => {
    const definitions = mergePlanLimitOverrides([
      {
        planCode: "STARTER",
        monthlyCredits: 125,
        maxTrackedChannels: 8,
        maxWorkspaces: 3,
      },
    ]);

    expect(definitions.STARTER).toMatchObject({
      monthlyCredits: 125,
      maxTrackedChannels: 8,
      maxWorkspaces: 3,
    });
    expect(definitions.PRO.monthlyCredits).toBe(250);
  });

  test("admin users receive default elevated credits and channel limits", () => {
    expect(ADMIN_PLAN_ENTITLEMENT).toEqual({
      monthlyCredits: 800,
      maxTrackedChannels: 25,
      maxWorkspaces: 10,
    });
    expect(
      getEffectivePlanEntitlement({
        planCode: "FREE",
        userRole: "ADMIN",
      }),
    ).toMatchObject({
      monthlyCredits: 800,
      maxTrackedChannels: 25,
      maxWorkspaces: 10,
    });
  });

  test("admin user type limits can override default admin entitlement", () => {
    const adminEntitlement = getAdminPlanEntitlement([
      {
        role: "ADMIN",
        monthlyCredits: 1200,
        maxTrackedChannels: 40,
        maxWorkspaces: 20,
      },
    ]);

    expect(adminEntitlement).toEqual({
      monthlyCredits: 1200,
      maxTrackedChannels: 40,
      maxWorkspaces: 20,
    });
    expect(
      getEffectivePlanEntitlement({
        planCode: "FREE",
        userRole: "ADMIN",
        userRoleOverrides: [
          {
            role: "ADMIN",
            monthlyCredits: 1200,
            maxTrackedChannels: 40,
            maxWorkspaces: 20,
          },
        ],
      }),
    ).toMatchObject({
      monthlyCredits: 1200,
      maxTrackedChannels: 40,
      maxWorkspaces: 20,
    });
  });
});
