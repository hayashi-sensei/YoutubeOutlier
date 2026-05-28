import { getConfiguredUserRole } from "@/lib/auth/access";
import { getPrismaClient } from "@/lib/db/prisma";
import { getActiveWorkspaceContext } from "@/lib/workspaces/selection";

const DEFAULT_NICHE = "AI, AI automation, and digital marketing";
const DEFAULT_AUDIENCE = "Creators, agencies, coaches, course sellers, B2B SaaS marketers, and digital marketing consultants";

export type AuthenticatedUser = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

export async function bootstrapUserWorkspace(authUser: AuthenticatedUser) {
  const prisma = getPrismaClient();
  const email = authUser.email?.trim().toLowerCase();

  if (!email) {
    throw new Error("Authenticated user email is required to bootstrap an app user.");
  }

  const configuredRole = getConfiguredUserRole(email);
  const isConfiguredAdmin = configuredRole === "ADMIN";
  const displayName = typeof authUser.name === "string" && authUser.name.trim().length > 0
    ? authUser.name.trim()
    : undefined;
  const image = typeof authUser.image === "string" && authUser.image.trim().length > 0
    ? authUser.image.trim()
    : undefined;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: {
        avatarUrl: image,
        image,
        name: displayName,
        role: isConfiguredAdmin ? configuredRole : undefined,
      },
      create: {
        email,
        avatarUrl: image,
        image,
        name: displayName ?? email.split("@")[0],
        role: configuredRole,
      },
    });

    const existingWorkspace = await tx.workspaceMember.findFirst({
      where: { userId: user.id },
      orderBy: { workspace: { createdAt: "asc" } },
      select: { workspaceId: true },
    });

    if (existingWorkspace) {
      await tx.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: existingWorkspace.workspaceId,
            userId: user.id,
          },
        },
        update: { role: isConfiguredAdmin ? configuredRole : undefined },
        create: {
          userId: user.id,
          workspaceId: existingWorkspace.workspaceId,
          role: "ADMIN",
        },
      });

      const context = await getActiveWorkspaceContext(tx, { userId: user.id });

      if (!context) {
        throw new Error("Workspace context was not found after user bootstrap.");
      }

      return { user, workspaceId: context.workspaceId };
    }

    const workspace = await tx.workspace.create({
      data: {
        name: "Founder Workspace",
        ownerId: user.id,
        slug: `workspace-${user.id}`,
        settings: {
          create: {
            primaryNiche: DEFAULT_NICHE,
            targetAudience: DEFAULT_AUDIENCE,
            brandVoice: "Direct, strategic, practical, evidence-led",
            dailyReportEnabled: false,
            reportDeliveryEmail: email,
          },
        },
      },
      select: { id: true },
    });

    await tx.workspaceMember.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        role: "ADMIN",
      },
    });

    await tx.user.update({
      where: { id: user.id },
      data: { defaultWorkspaceId: workspace.id },
    });

    return { user, workspaceId: workspace.id };
  });
}
