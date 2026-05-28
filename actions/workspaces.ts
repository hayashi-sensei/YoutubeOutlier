"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getWorkspacePlanEntitlement } from "@/lib/billing/plan-limits";
import { getPrismaClient } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";
import { deleteWorkspaceForUser, WorkspaceDeletionError } from "@/lib/workspaces/deletion";
import { workspaceCreateSchema, workspaceDeleteSchema, workspaceSwitchSchema } from "@/schemas/workspaces";

const DEFAULT_BRAND_VOICE = "Direct, strategic, practical, evidence-led";

function redirectTo(url: string): never {
  redirect(url as never);
}

function appRedirectTarget(value: string | undefined) {
  if (!value?.startsWith("/app")) {
    return "/app/dashboard";
  }

  return value;
}

async function getAppUserOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirectTo("/sign-in");
  }

  return bootstrapUserWorkspace(supabaseUser);
}

export async function switchWorkspace(formData: FormData) {
  const { user } = await getAppUserOrRedirect();
  const input = workspaceSwitchSchema.parse({
    workspaceId: String(formData.get("workspaceId") ?? ""),
    redirectTo: String(formData.get("redirectTo") ?? ""),
  });
  const prisma = getPrismaClient();
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: input.workspaceId,
        userId: user.id,
      },
    },
    select: { workspaceId: true },
  });

  if (!membership) {
    redirectTo("/app/settings?error=workspace_not_found");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { defaultWorkspaceId: membership.workspaceId },
  });

  revalidatePath("/app", "layout");
  redirectTo(appRedirectTarget(input.redirectTo));
}

export async function createWorkspace(formData: FormData) {
  const { user, workspaceId } = await getAppUserOrRedirect();
  const input = workspaceCreateSchema.parse({
    name: String(formData.get("name") ?? ""),
    primaryNiche: String(formData.get("primaryNiche") ?? ""),
    targetAudience: String(formData.get("targetAudience") ?? "").trim() || undefined,
  });
  const prisma = getPrismaClient();
  const [currentWorkspace, workspaceCount, entitlement] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { planCode: true },
    }),
    prisma.workspace.count({ where: { members: { some: { userId: user.id } } } }),
    getWorkspacePlanEntitlement(prisma, workspaceId),
  ]);

  if (!currentWorkspace || !entitlement) {
    redirectTo("/app/settings?error=workspace_context_missing");
  }

  if (workspaceCount >= entitlement.maxWorkspaces) {
    redirectTo("/app/settings?error=workspace_limit_reached");
  }

  const created = await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        ownerId: user.id,
        name: input.name,
        slug: `workspace-${user.id}-${Date.now()}`,
        planCode: currentWorkspace.planCode,
        settings: {
          create: {
            primaryNiche: input.primaryNiche,
            targetAudience: input.targetAudience,
            brandVoice: DEFAULT_BRAND_VOICE,
            dailyReportEnabled: false,
            reportDeliveryEmail: user.email,
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

    return workspace;
  });

  revalidatePath("/app", "layout");
  redirectTo(`/app/settings?workspaceCreated=1&workspaceId=${created.id}`);
}

export async function deleteWorkspace(formData: FormData) {
  const { user } = await getAppUserOrRedirect();
  const input = workspaceDeleteSchema.parse({
    workspaceId: String(formData.get("workspaceId") ?? ""),
    confirmationName: String(formData.get("confirmationName") ?? ""),
  });
  const prisma = getPrismaClient();

  try {
    await prisma.$transaction((tx) =>
      deleteWorkspaceForUser(tx, {
        userId: user.id,
        workspaceId: input.workspaceId,
        confirmationName: input.confirmationName,
      }),
    );
  } catch (error) {
    if (error instanceof WorkspaceDeletionError) {
      redirectTo(`/app/settings?error=${error.code.toLowerCase()}`);
    }

    throw error;
  }

  revalidatePath("/app", "layout");
  redirectTo("/app/settings?workspaceDeleted=1");
}
