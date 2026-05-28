import { describe, expect, test, vi } from "vitest";

import { createCalendarItem, updateCalendarItem } from "../../lib/calendar/mutations";

describe("calendar mutations", () => {
  test("creates a manual calendar item with normalized content type and evidence snapshot", async () => {
    const scheduledFor = new Date("2026-05-22T09:00:00.000Z");
    const prisma = {
      contentItem: {
        create: vi.fn(async () => ({ id: "content-1" })),
        updateMany: vi.fn(),
      },
    };

    await expect(
      createCalendarItem(prisma, {
        workspaceId: "workspace-1",
        title: "AI agent launch plan",
        contentType: "YouTube Video",
        status: "IDEA",
        scheduledFor,
        notes: "Draft the outline first.",
      }),
    ).resolves.toEqual({ contentItemId: "content-1" });

    expect(prisma.contentItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        recommendationId: null,
        title: "AI agent launch plan",
        contentType: "youtube_video",
        status: "IDEA",
        sourceType: "manual_topic",
        manualTopic: "AI agent launch plan",
        evidenceSnapshot: {
          workspaceId: "workspace-1",
          sourceType: "manual_topic",
          manualTopic: "AI agent launch plan",
          evidences: [],
        },
        scheduledFor,
        publishedAt: null,
        notes: "Draft the outline first.",
      }),
      select: { id: true },
    });
  });

  test("requires a due date when status is scheduled", async () => {
    const prisma = {
      contentItem: {
        create: vi.fn(async () => ({ id: "content-1" })),
        updateMany: vi.fn(),
      },
    };

    await expect(
      createCalendarItem(prisma, {
        workspaceId: "workspace-1",
        title: "AI agent launch plan",
        contentType: "youtube_video",
        status: "SCHEDULED",
      }),
    ).rejects.toThrow("require a due date");
    expect(prisma.contentItem.create).not.toHaveBeenCalled();
  });

  test("updates status and date only inside authorized workspaces", async () => {
    const scheduledFor = new Date("2026-05-23T09:00:00.000Z");
    const prisma = {
      contentItem: {
        create: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };

    await expect(
      updateCalendarItem(prisma, {
        workspaceIds: ["workspace-1", "workspace-2"],
        contentItemId: "content-1",
        status: "SCHEDULED",
        scheduledFor,
        notes: "",
      }),
    ).resolves.toEqual({ updated: true });

    expect(prisma.contentItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: "content-1",
        workspaceId: { in: ["workspace-1", "workspace-2"] },
      },
      data: {
        status: "SCHEDULED",
        scheduledFor,
        publishedAt: null,
        notes: null,
      },
    });
  });

  test("sets published timestamp when an item is marked published", async () => {
    const publishedAt = new Date("2026-05-24T09:00:00.000Z");
    const prisma = {
      contentItem: {
        create: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };

    await updateCalendarItem(prisma, {
      workspaceIds: ["workspace-1"],
      contentItemId: "content-1",
      status: "PUBLISHED",
      scheduledFor: publishedAt,
    });

    expect(prisma.contentItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PUBLISHED",
          scheduledFor: publishedAt,
          publishedAt,
        }),
      }),
    );
  });
});
