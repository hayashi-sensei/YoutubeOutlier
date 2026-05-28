import { describe, expect, test } from "vitest";
import { getEditableAdminEntitlement, getEditablePlanDefinitions, getWorkspacePlanEntitlement } from "../../lib/billing/plan-limits";

describe("editable plan limits", () => {
  test("returns defaults when no overrides exist", async () => {
    const definitions = await getEditablePlanDefinitions({
      planLimit: {
        findMany: async () => [],
      },
      userRoleLimit: {
        findMany: async () => [],
      },
    });

    expect(definitions.STARTER.monthlyCredits).toBe(100);
    expect(definitions.STARTER.maxTrackedChannels).toBe(5);
    expect(definitions.STARTER.maxWorkspaces).toBe(1);
    expect(definitions.PRO.maxWorkspaces).toBe(5);
  });

  test("applies database overrides", async () => {
    const definitions = await getEditablePlanDefinitions({
      planLimit: {
        findMany: async () => [
          {
            planCode: "PRO",
            monthlyCredits: 333,
            maxTrackedChannels: 18,
            maxWorkspaces: 7,
          },
        ],
      },
      userRoleLimit: {
        findMany: async () => [],
      },
    });

    expect(definitions.PRO.monthlyCredits).toBe(333);
    expect(definitions.PRO.maxTrackedChannels).toBe(18);
    expect(definitions.PRO.maxWorkspaces).toBe(7);
  });

  test("elevates admin-owned workspaces to admin defaults", async () => {
    const entitlement = await getWorkspacePlanEntitlement(
      {
        workspace: {
          findUnique: async () => ({
            planCode: "FREE",
            owner: { role: "ADMIN" },
          }),
        },
        planLimit: {
          findMany: async () => [],
        },
        userRoleLimit: {
          findMany: async () => [],
        },
      },
      "workspace_1",
    );

    expect(entitlement).toMatchObject({
      monthlyCredits: 800,
      maxTrackedChannels: 25,
      maxWorkspaces: 10,
    });
  });

  test("returns editable admin user type entitlement overrides", async () => {
    const entitlement = await getEditableAdminEntitlement({
      planLimit: {
        findMany: async () => [],
      },
      userRoleLimit: {
        findMany: async () => [
          {
            role: "ADMIN",
            monthlyCredits: 1100,
            maxTrackedChannels: 35,
            maxWorkspaces: 14,
          },
        ],
      },
    });

    expect(entitlement).toEqual({
      monthlyCredits: 1100,
      maxTrackedChannels: 35,
      maxWorkspaces: 14,
    });
  });

  test("applies admin user type entitlement overrides to admin-owned workspaces", async () => {
    const entitlement = await getWorkspacePlanEntitlement(
      {
        workspace: {
          findUnique: async () => ({
            planCode: "FREE",
            owner: { role: "ADMIN" },
          }),
        },
        planLimit: {
          findMany: async () => [],
        },
        userRoleLimit: {
          findMany: async () => [
            {
              role: "ADMIN",
              monthlyCredits: 1100,
              maxTrackedChannels: 35,
              maxWorkspaces: 14,
            },
          ],
        },
      },
      "workspace_1",
    );

    expect(entitlement).toMatchObject({
      monthlyCredits: 1100,
      maxTrackedChannels: 35,
      maxWorkspaces: 14,
    });
  });
});
