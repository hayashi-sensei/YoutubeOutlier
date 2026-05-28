import { describe, expect, test, vi } from "vitest";
import { deleteWorkspaceForUser, WorkspaceDeletionError } from "../../lib/workspaces/deletion";

describe("deleteWorkspaceForUser", () => {
  test("rejects deleting the last workspace", async () => {
    const client = createClient({
      workspaces: [{ id: "workspace-1", name: "Main", ownerId: "user-1" }],
    });

    await expect(
      deleteWorkspaceForUser(client, {
        userId: "user-1",
        workspaceId: "workspace-1",
        confirmationName: "Main",
      }),
    ).rejects.toMatchObject({
      code: "LAST_WORKSPACE",
    });

    expect(client.workspace.delete).not.toHaveBeenCalled();
  });

  test("rejects deleting when confirmation name does not match", async () => {
    const client = createClient({
      workspaces: [
        { id: "workspace-1", name: "Main", ownerId: "user-1" },
        { id: "workspace-2", name: "Client", ownerId: "user-1" },
      ],
    });

    await expect(
      deleteWorkspaceForUser(client, {
        userId: "user-1",
        workspaceId: "workspace-2",
        confirmationName: "Wrong",
      }),
    ).rejects.toMatchObject({
      code: "CONFIRMATION_MISMATCH",
    });

    expect(client.workspace.delete).not.toHaveBeenCalled();
  });

  test("deletes a workspace and switches default to another membership", async () => {
    const client = createClient({
      workspaces: [
        { id: "workspace-1", name: "Main", ownerId: "user-1" },
        { id: "workspace-2", name: "Client", ownerId: "user-1" },
      ],
    });

    await expect(
      deleteWorkspaceForUser(client, {
        userId: "user-1",
        workspaceId: "workspace-2",
        confirmationName: "Client",
      }),
    ).resolves.toEqual({ nextWorkspaceId: "workspace-1" });

    expect(client.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { defaultWorkspaceId: "workspace-1" },
    });
    expect(client.workspace.delete).toHaveBeenCalledWith({
      where: { id: "workspace-2" },
    });
  });
});

function createClient(input: {
  workspaces: Array<{ id: string; name: string; ownerId: string }>;
}) {
  return {
    workspaceMember: {
      findMany: vi.fn(async () =>
        input.workspaces.map((workspace) => ({
          role: "ADMIN",
          workspace,
        })),
      ),
    },
    user: {
      update: vi.fn(async () => ({})),
    },
    workspace: {
      delete: vi.fn(async () => ({})),
    },
  };
}

expect(new WorkspaceDeletionError("LAST_WORKSPACE", "x")).toBeInstanceOf(Error);
