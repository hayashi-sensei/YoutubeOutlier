import type { User as SupabaseUser } from "@supabase/supabase-js";
import { getConfiguredUserRole } from "@/lib/auth/access";
import { getPrismaClient } from "@/lib/db/prisma";
import { getActiveWorkspaceContext } from "@/lib/workspaces/selection";

const DEFAULT_NICHE = "AI, AI automation, and digital marketing";
const DEFAULT_AUDIENCE = "Creators, agencies, coaches, course sellers, B2B SaaS marketers, and digital marketing consultants";

export async function bootstrapUserWorkspace(supabaseUser: SupabaseUser) {
  const prisma = getPrismaClient();
  const email = supabaseUser.email;

  if (!email) {
    throw new Error("Supabase user email is required to bootstrap an app user.");
  }

  const configuredRole = getConfiguredUserRole(email);
  const isConfiguredAdmin = configuredRole === "ADMIN";

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: {
        avatarUrl: typeof supabaseUser.user_metadata.avatar_url === "string" ? supabaseUser.user_metadata.avatar_url : undefined,
        name: typeof supabaseUser.user_metadata.full_name === "string" ? supabaseUser.user_metadata.full_name : undefined,
        role: isConfiguredAdmin ? configuredRole : undefined,
        supabaseUserId: supabaseUser.id,
      },
      create: {
        email,
        avatarUrl: typeof supabaseUser.user_metadata.avatar_url === "string" ? supabaseUser.user_metadata.avatar_url : undefined,
        name: typeof supabaseUser.user_metadata.full_name === "string" ? supabaseUser.user_metadata.full_name : email.split("@")[0],
        role: configuredRole,
        supabaseUserId: supabaseUser.id,
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
