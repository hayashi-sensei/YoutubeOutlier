"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { applyAdminCreditAdjustment } from "@/lib/billing/credits";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getPrismaClient } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";

function redirectTo(url: string): never {
  redirect(url as never);
}

export async function adjustWorkspaceCredits(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirectTo("/sign-in?next=/app/admin");
  }

  const { user } = await bootstrapUserWorkspace(supabaseUser);
  const prisma = getPrismaClient();
  const actor = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  if (actor?.role !== "ADMIN") {
    redirectTo("/app/dashboard");
  }

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const amount = Number.parseInt(String(formData.get("amount") ?? ""), 10);
  const reason = String(formData.get("reason") ?? "").trim();

  if (!workspaceId || !Number.isInteger(amount) || amount === 0 || !reason) {
    redirectTo("/app/admin?error=invalid_adjustment");
  }

  await prisma.$transaction(async (tx) => {
    await applyAdminCreditAdjustment(tx, {
      workspaceId,
      actorUserId: user.id,
      amount,
      reason,
    });

    await tx.adminAuditLog.create({
      data: {
        actorUserId: user.id,
        action: "credit.adjust",
        targetType: "Workspace",
        targetId: workspaceId,
        reason,
        metadata: { amount },
      },
    });
  });

  revalidatePath("/app/admin");
  redirectTo("/app/admin?adjusted=1");
}
