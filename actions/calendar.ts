"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserWorkspace } from "@/lib/auth/session";
import {
  createCalendarItem as createCalendarItemMutation,
  updateCalendarItem as updateCalendarItemMutation,
  type CalendarMutationPrisma,
} from "@/lib/calendar/mutations";
import { getPrismaClient } from "@/lib/db/prisma";
import { createCalendarItemSchema, updateCalendarItemSchema } from "@/schemas/calendar";

function redirectTo(url: string): never {
  redirect(url as never);
}

export async function createCalendarItem(formData: FormData) {
  const prisma = getPrismaClient();
  const { user, workspaceId: defaultWorkspaceId } = await getCalendarUserContextOrRedirect();
  const workspaceIds = await getUserWorkspaceIds(prisma, user.id);
  const parsed = createCalendarItemSchema.safeParse({
    workspaceId: formData.get("workspaceId") ?? defaultWorkspaceId,
    title: formData.get("title"),
    contentType: formData.get("contentType") ?? "youtube_video",
    status: formData.get("status") ?? "IDEA",
    scheduledFor: formData.get("scheduledFor") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success || !workspaceIds.includes(parsed.data.workspaceId)) {
    redirectTo("/app/calendar?error=calendar_item_invalid");
  }

  try {
    await createCalendarItemMutation(prisma as unknown as CalendarMutationPrisma, {
      workspaceId: parsed.data.workspaceId,
      title: parsed.data.title,
      contentType: parsed.data.contentType,
      status: parsed.data.status,
      scheduledFor: parseCalendarDate(parsed.data.scheduledFor),
      notes: parsed.data.notes,
    });
  } catch {
    redirectTo("/app/calendar?error=calendar_item_invalid");
  }

  revalidatePath("/app/calendar");
  revalidatePath("/app/content-studio");
  redirectTo("/app/calendar?saved=item");
}

export async function updateCalendarItem(formData: FormData) {
  const prisma = getPrismaClient();
  const { user } = await getCalendarUserContextOrRedirect();
  const workspaceIds = await getUserWorkspaceIds(prisma, user.id);
  const parsed = updateCalendarItemSchema.safeParse({
    contentItemId: formData.get("contentItemId"),
    status: formData.get("status"),
    scheduledFor: formData.get("scheduledFor") ?? "",
    notes: formData.get("notes") ?? "",
    returnTo: formData.get("returnTo") ?? "/app/calendar",
  });
  const returnTo = parsed.success ? safeCalendarReturn(parsed.data.returnTo) : "/app/calendar";

  if (!parsed.success) {
    redirectTo(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=calendar_item_invalid`);
  }

  let result;
  try {
    result = await updateCalendarItemMutation(prisma as unknown as CalendarMutationPrisma, {
      workspaceIds,
      contentItemId: parsed.data.contentItemId,
      status: parsed.data.status,
      scheduledFor: parseCalendarDate(parsed.data.scheduledFor),
      notes: parsed.data.notes,
    });
  } catch {
    redirectTo(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=calendar_item_invalid`);
  }

  if (!result.updated) {
    redirectTo(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=calendar_item_not_found`);
  }

  revalidatePath("/app/calendar");
  revalidatePath("/app/content-studio");
  redirectTo(`${returnTo}${returnTo.includes("?") ? "&" : "?"}saved=calendar`);
}

async function getCalendarUserContextOrRedirect() {
  return requireUserWorkspace("/app/calendar");
}

async function getUserWorkspaceIds(prisma: ReturnType<typeof getPrismaClient>, userId: string): Promise<string[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });

  return memberships.map((membership) => membership.workspaceId);
}

function parseCalendarDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T09:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Calendar date must be valid.");
  }

  return date;
}

function safeCalendarReturn(value: string | undefined): string {
  return value?.startsWith("/app/calendar") ? value : "/app/calendar";
}
