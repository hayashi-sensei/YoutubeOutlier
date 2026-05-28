import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { bootstrapUserWorkspace, type AuthenticatedUser } from "@/lib/auth/bootstrap";

export type AppSessionContext = {
  user: Awaited<ReturnType<typeof bootstrapUserWorkspace>>["user"];
  workspaceId: string;
};

export async function getCurrentAuthUser(): Promise<AuthenticatedUser | null> {
  const session = await auth();
  return session?.user?.email ? session.user : null;
}

export async function getOptionalUserWorkspace(): Promise<AppSessionContext | null> {
  const user = await getCurrentAuthUser();

  if (!user) {
    return null;
  }

  return bootstrapUserWorkspace(user);
}

export async function requireUserWorkspace(next = "/app/dashboard"): Promise<AppSessionContext> {
  const context = await getOptionalUserWorkspace();

  if (!context) {
    redirect(`/sign-in?next=${encodeURIComponent(next)}` as never);
  }

  return context;
}
