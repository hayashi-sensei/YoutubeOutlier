import type { CalendarStatus } from "@/schemas/calendar";

export const CALENDAR_STATUSES: CalendarStatus[] = [
  "IDEA",
  "OUTLINE",
  "SCRIPT",
  "THUMBNAIL",
  "SCHEDULED",
  "PUBLISHED",
  "ARCHIVED",
];

export type CalendarMutationPrisma = {
  contentItem: {
    create(input: {
      data: {
        workspaceId: string;
        recommendationId: null;
        title: string;
        contentType: string;
        status: CalendarStatus;
        sourceType: "manual_topic";
        manualTopic: string;
        evidenceSnapshot: {
          workspaceId: string;
          sourceType: "manual_topic";
          manualTopic: string;
          evidences: [];
        };
        scheduledFor: Date | null;
        publishedAt?: Date | null;
        notes: string | null;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
    updateMany(input: {
      where: {
        id: string;
        workspaceId: { in: string[] };
      };
      data: {
        status: CalendarStatus;
        scheduledFor: Date | null;
        publishedAt: Date | null;
        notes?: string | null;
      };
    }): Promise<{ count: number }>;
  };
};

export async function createCalendarItem(
  prisma: CalendarMutationPrisma,
  input: {
    workspaceId: string;
    title: string;
    contentType: string;
    status: CalendarStatus;
    scheduledFor?: Date | null;
    notes?: string | null;
  },
): Promise<{ contentItemId: string }> {
  assertCalendarSchedule(input.status, input.scheduledFor ?? null);
  const contentItem = await prisma.contentItem.create({
    data: {
      workspaceId: input.workspaceId,
      recommendationId: null,
      title: input.title,
      contentType: normalizeContentType(input.contentType),
      status: input.status,
      sourceType: "manual_topic",
      manualTopic: input.title,
      evidenceSnapshot: {
        workspaceId: input.workspaceId,
        sourceType: "manual_topic",
        manualTopic: input.title,
        evidences: [],
      },
      scheduledFor: input.scheduledFor ?? null,
      publishedAt: input.status === "PUBLISHED" ? input.scheduledFor ?? new Date() : null,
      notes: normalizeOptionalText(input.notes),
    },
    select: { id: true },
  });

  return { contentItemId: contentItem.id };
}

export async function updateCalendarItem(
  prisma: CalendarMutationPrisma,
  input: {
    workspaceIds: string[];
    contentItemId: string;
    status: CalendarStatus;
    scheduledFor?: Date | null;
    notes?: string | null;
  },
): Promise<{ updated: boolean }> {
  assertCalendarSchedule(input.status, input.scheduledFor ?? null);
  if (input.workspaceIds.length === 0) {
    return { updated: false };
  }

  const result = await prisma.contentItem.updateMany({
    where: {
      id: input.contentItemId,
      workspaceId: { in: input.workspaceIds },
    },
    data: {
      status: input.status,
      scheduledFor: input.scheduledFor ?? null,
      publishedAt: input.status === "PUBLISHED" ? input.scheduledFor ?? new Date() : null,
      notes: normalizeOptionalText(input.notes),
    },
  });

  return { updated: result.count > 0 };
}

function assertCalendarSchedule(status: CalendarStatus, scheduledFor: Date | null): void {
  if (status === "SCHEDULED" && !scheduledFor) {
    throw new Error("Scheduled calendar items require a due date.");
  }
}

function normalizeContentType(value: string): string {
  return value.trim().toLowerCase().replaceAll(" ", "_");
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}
