import { redirect } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";

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
  const { getOptionalUserWorkspace } = await import("@/lib/auth/session");
  const bootstrap = await getOptionalUserWorkspace();

  if (!bootstrap) {
    redirect("/sign-in?next=/app/admin" as never);
  }

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
