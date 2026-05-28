import { describe, expect, test, vi } from "vitest";
import { chooseActiveWorkspace, getActiveWorkspaceContext } from "../../lib/workspaces/selection";
import type { WorkspaceSwitcherItem } from "../../types/workspaces";

const workspaces: WorkspaceSwitcherItem[] = [
  {
    id: "workspace-1",
    name: "Main",
    planCode: "PRO",
    primaryNiche: "AI",
  },
  {
    id: "workspace-2",
    name: "Client",
    planCode: "PRO",
    primaryNiche: "B2B SaaS",
  },
];

describe("workspace selection", () => {
  test("prefers requested workspace when it belongs to the user", () => {
    expect(
      chooseActiveWorkspace({
        defaultWorkspaceId: "workspace-1",
        requestedWorkspaceId: "workspace-2",
        workspaces,
      }),
    ).toMatchObject({ id: "workspace-2" });
  });

  test("falls back to default workspace then first membership", () => {
    expect(
      chooseActiveWorkspace({
        defaultWorkspaceId: "workspace-1",
        workspaces,
      }),
    ).toMatchObject({ id: "workspace-1" });

    expect(
      chooseActiveWorkspace({
        defaultWorkspaceId: "missing",
        workspaces,
      }),
    ).toMatchObject({ id: "workspace-1" });
  });

  test("returns entitlement and repairs stale default workspace", async () => {
    const update = vi.fn();
    const context = await getActiveWorkspaceContext(
      {
        user: {
          findUnique: async () => ({
            id: "user-1",
            role: "USER",
            creditBalance: 250,
            defaultWorkspaceId: "missing",
            workspaces: workspaces.map((workspace, index) => ({
              workspace: {
                ...workspace,
                createdAt: new Date(2026, 0, index + 1),
                settings: workspace.primaryNiche ? { primaryNiche: workspace.primaryNiche } : null,
              },
            })),
          }),
          update,
        },
        planLimit: {
          findMany: async () => [],
        },
      },
      { userId: "user-1" },
    );

    expect(context?.workspaceId).toBe("workspace-1");
    expect(context?.accountCreditBalance).toBe(250);
    expect(context?.entitlement.maxWorkspaces).toBe(5);
    expect(update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { defaultWorkspaceId: "workspace-1" },
    });
  });

  test("does not run context reads concurrently on a shared transaction client", async () => {
    let queryInFlight = false;
    const enterQuery = async () => {
      if (queryInFlight) {
        throw new Error("concurrent query on shared client");
      }

      queryInFlight = true;
      await Promise.resolve();
      queryInFlight = false;
    };

    await expect(
      getActiveWorkspaceContext(
        {
          user: {
            findUnique: async () => {
              await enterQuery();
              return {
                id: "user-1",
                role: "USER",
                creditBalance: 250,
                defaultWorkspaceId: "workspace-1",
                workspaces: workspaces.map((workspace, index) => ({
                  workspace: {
                    ...workspace,
                    createdAt: new Date(2026, 0, index + 1),
                    settings: workspace.primaryNiche ? { primaryNiche: workspace.primaryNiche } : null,
                  },
                })),
              };
            },
            update: vi.fn(),
          },
          planLimit: {
            findMany: async () => {
              await enterQuery();
              return [];
            },
          },
        },
        { userId: "user-1" },
      ),
    ).resolves.toMatchObject({ workspaceId: "workspace-1" });
  });
});
