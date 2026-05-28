import { redirect } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getPrismaClient } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";

type RoleRecord = {
  role: UserRole;
};

export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === "ADMIN";
}

export function assertAdminRole(user: RoleRecord | null): void {
  if (!isAdminRole(user?.role)) {
    throw new Error("Admin access is required.");
  }
}

export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirect("/sign-in?next=/app/admin" as never);
  }

  const bootstrap = await bootstrapUserWorkspace(supabaseUser);
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({
    where: { id: bootstrap.user.id },
    select: { id: true, email: true, role: true, defaultWorkspaceId: true },
  });

  if (!user || !isAdminRole(user.role)) {
    redirect("/app/dashboard" as never);
  }

  return { appUser: user, workspaceId: bootstrap.workspaceId };
}
