export type WorkspaceDeletionCode =
  | "WORKSPACE_NOT_FOUND"
  | "NOT_ALLOWED"
  | "LAST_WORKSPACE"
  | "CONFIRMATION_MISMATCH";

export class WorkspaceDeletionError extends Error {
  constructor(
    readonly code: WorkspaceDeletionCode,
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceDeletionError";
  }
}

type WorkspaceMembership = {
  role: "USER" | "ADMIN";
  workspace: {
    id: string;
    name: string;
    ownerId: string;
  };
};

export type WorkspaceDeletionClient = {
  workspaceMember: {
    findMany(args: unknown): Promise<unknown>;
  };
  user: {
    update(args: unknown): Promise<unknown>;
  };
  workspace: {
    delete(args: unknown): Promise<unknown>;
  };
};

export async function deleteWorkspaceForUser(
  client: WorkspaceDeletionClient,
  input: { userId: string; workspaceId: string; confirmationName: string },
): Promise<{ nextWorkspaceId: string }> {
  const memberships = (await client.workspaceMember.findMany({
    where: { userId: input.userId },
    orderBy: { workspace: { createdAt: "asc" } },
    select: {
      role: true,
      workspace: {
        select: {
          id: true,
          name: true,
          ownerId: true,
        },
      },
    },
  })) as WorkspaceMembership[];
  const target = memberships.find((membership) => membership.workspace.id === input.workspaceId);

  if (!target) {
    throw new WorkspaceDeletionError("WORKSPACE_NOT_FOUND", "Workspace was not found.");
  }

  if (target.role !== "ADMIN" && target.workspace.ownerId !== input.userId) {
    throw new WorkspaceDeletionError("NOT_ALLOWED", "You do not have permission to delete this workspace.");
  }

  if (memberships.length <= 1) {
    throw new WorkspaceDeletionError("LAST_WORKSPACE", "You cannot delete your last workspace.");
  }

  if (target.workspace.name !== input.confirmationName.trim()) {
    throw new WorkspaceDeletionError("CONFIRMATION_MISMATCH", "Workspace name confirmation did not match.");
  }

  const nextWorkspace = memberships.find((membership) => membership.workspace.id !== input.workspaceId);

  if (!nextWorkspace) {
    throw new WorkspaceDeletionError("LAST_WORKSPACE", "You cannot delete your last workspace.");
  }

  await client.user.update({
    where: { id: input.userId },
    data: { defaultWorkspaceId: nextWorkspace.workspace.id },
  });
  await client.workspace.delete({
    where: { id: input.workspaceId },
  });

  return { nextWorkspaceId: nextWorkspace.workspace.id };
}
