import { describe, expect, test, vi } from "vitest";

import {
  addTrackedChannel,
  canTrackMoreChannels,
  createChannelUpsertInput,
  deleteArchivedTrackedChannel,
  nextRecommendationStatus,
  restoreTrackedChannel,
} from "../../lib/competitors/tracking";
import { parseYoutubeChannelUrl } from "../../lib/youtube/channel-url";

describe("competitor tracking rules", () => {
  test("allows tracking below the active channel limit", () => {
    expect(canTrackMoreChannels({ activeCount: 4, maxTrackedChannels: 5 })).toBe(true);
    expect(canTrackMoreChannels({ activeCount: 5, maxTrackedChannels: 5 })).toBe(false);
  });

  test("builds stable global channel upsert input for channel IDs", () => {
    const parsed = parseYoutubeChannelUrl("https://www.youtube.com/channel/UCabc123XYZ");
    expect(createChannelUpsertInput(parsed)).toEqual({
      youtubeChannelId: "UCabc123XYZ",
      handle: undefined,
      title: "UCabc123XYZ",
      sourceUrl: "https://www.youtube.com/channel/UCabc123XYZ",
    });
  });

  test("builds deterministic placeholder IDs for handle URLs until provider resolution exists", () => {
    const parsed = parseYoutubeChannelUrl("https://www.youtube.com/@AIAutomationLab");
    expect(createChannelUpsertInput(parsed)).toEqual({
      youtubeChannelId: "handle:aiautomationlab",
      handle: "@aiautomationlab",
      title: "@aiautomationlab",
      sourceUrl: "https://www.youtube.com/@aiautomationlab",
    });
  });

  test("normalizes direct parsed handle input while preserving canonical source URL", () => {
    expect(
      createChannelUpsertInput({
        type: "handle",
        value: "@AIAutomationLab",
        canonicalUrl: "https://www.youtube.com/@AIAutomationLab",
      }),
    ).toEqual({
      youtubeChannelId: "handle:aiautomationlab",
      handle: "@aiautomationlab",
      title: "@aiautomationlab",
      sourceUrl: "https://www.youtube.com/@AIAutomationLab",
    });
  });

  test("builds deterministic placeholder IDs for custom and user URLs", () => {
    expect(createChannelUpsertInput(parseYoutubeChannelUrl("https://www.youtube.com/c/CreatorScience"))).toEqual({
      youtubeChannelId: "custom:creatorscience",
      handle: undefined,
      title: "CreatorScience",
      sourceUrl: "https://www.youtube.com/c/CreatorScience",
    });
    expect(createChannelUpsertInput(parseYoutubeChannelUrl("https://www.youtube.com/user/OldSchoolCreator"))).toEqual({
      youtubeChannelId: "user:oldschoolcreator",
      handle: undefined,
      title: "OldSchoolCreator",
      sourceUrl: "https://www.youtube.com/user/OldSchoolCreator",
    });
  });

  test("maps recommendation actions to terminal statuses", () => {
    expect(nextRecommendationStatus("approve")).toBe("USED");
    expect(nextRecommendationStatus("dismiss")).toBe("DISMISSED");
  });

  test("locks workspace tracking before checking plan limits", async () => {
    const executeRaw = vi.fn().mockResolvedValue(0);
    const workspaceFindUnique = vi.fn().mockResolvedValue({ id: "workspace_1", planCode: "STARTER", owner: { role: "USER" } });
    const tx = {
      $executeRaw: executeRaw,
      workspace: {
        findUnique: workspaceFindUnique,
      },
      planLimit: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      trackedChannel: {
        count: vi.fn().mockResolvedValue(5),
      },
      youtubeChannel: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as Parameters<typeof addTrackedChannel>[0]["tx"];

    const result = await addTrackedChannel({
      tx,
      workspaceId: "workspace_1",
      channel: {
        youtubeChannelId: "handle:aiautomationlab",
        handle: "@aiautomationlab",
        title: "@aiautomationlab",
        sourceUrl: "https://www.youtube.com/@aiautomationlab",
      },
    });

    expect(result).toMatchObject({
      success: false,
      code: "TRACKED_CHANNEL_LIMIT_REACHED",
    });
    expect(executeRaw.mock.invocationCallOrder[0]).toBeLessThan(workspaceFindUnique.mock.invocationCallOrder[0]);
  });

  test("reuses a global channel with a matching known handle", async () => {
    const workspaceFindUnique = vi.fn().mockResolvedValue({ id: "workspace_1", planCode: "STARTER", owner: { role: "USER" } });
    const channelFindFirst = vi.fn().mockResolvedValue({ id: "channel_1", youtubeChannelId: "UCabc123XYZ" });
    const channelCreate = vi.fn();
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      workspace: {
        findUnique: workspaceFindUnique,
      },
      planLimit: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      trackedChannel: {
        count: vi.fn().mockResolvedValue(0),
        upsert: vi.fn().mockResolvedValue({ id: "tracked_1" }),
      },
      youtubeChannel: {
        findFirst: channelFindFirst,
        update: vi.fn().mockResolvedValue({ id: "channel_1" }),
        create: channelCreate,
      },
    } as unknown as Parameters<typeof addTrackedChannel>[0]["tx"];

    const result = await addTrackedChannel({
      tx,
      workspaceId: "workspace_1",
      channel: {
        youtubeChannelId: "handle:aiautomationlab",
        handle: "@aiautomationlab",
        title: "@aiautomationlab",
        sourceUrl: "https://www.youtube.com/@aiautomationlab",
      },
    });

    expect(result).toEqual({
      success: true,
      data: { trackedChannelId: "tracked_1", channelId: "channel_1" },
    });
    expect(channelFindFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ youtubeChannelId: "handle:aiautomationlab" }, { handle: "@aiautomationlab" }],
      },
      select: { id: true, youtubeChannelId: true },
    });
    expect(channelCreate).not.toHaveBeenCalled();
  });

  test("uses elevated channel limit for admin-owned workspaces", async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      workspace: {
        findUnique: vi.fn().mockResolvedValue({ id: "workspace_1", planCode: "FREE", owner: { role: "ADMIN" } }),
      },
      planLimit: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      trackedChannel: {
        count: vi.fn().mockResolvedValue(24),
        upsert: vi.fn().mockResolvedValue({ id: "tracked_1" }),
      },
      youtubeChannel: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "channel_1" }),
      },
    } as unknown as Parameters<typeof addTrackedChannel>[0]["tx"];

    const result = await addTrackedChannel({
      tx,
      workspaceId: "workspace_1",
      channel: {
        youtubeChannelId: "handle:aiautomationlab",
        handle: "@aiautomationlab",
        title: "@aiautomationlab",
        sourceUrl: "https://www.youtube.com/@aiautomationlab",
      },
    });

    expect(result).toEqual({
      success: true,
      data: { trackedChannelId: "tracked_1", channelId: "channel_1" },
    });
  });

  test("restores archived channels when below the active channel limit", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      workspace: {
        findUnique: vi.fn().mockResolvedValue({ planCode: "STARTER", owner: { role: "USER" } }),
      },
      planLimit: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      trackedChannel: {
        findFirst: vi.fn().mockResolvedValue({ id: "tracked_1" }),
        count: vi.fn().mockResolvedValue(4),
        updateMany,
      },
    } as unknown as Parameters<typeof restoreTrackedChannel>[0]["tx"];

    const result = await restoreTrackedChannel({
      tx,
      workspaceId: "workspace_1",
      trackedChannelId: "tracked_1",
    });

    expect(result).toEqual({
      success: true,
      data: { trackedChannelId: "tracked_1" },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "tracked_1", workspaceId: "workspace_1", isActive: false },
      data: { isActive: true },
    });
  });

  test("does not restore archived channels beyond the active channel limit", async () => {
    const updateMany = vi.fn();
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      workspace: {
        findUnique: vi.fn().mockResolvedValue({ planCode: "STARTER", owner: { role: "USER" } }),
      },
      planLimit: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      trackedChannel: {
        findFirst: vi.fn().mockResolvedValue({ id: "tracked_1" }),
        count: vi.fn().mockResolvedValue(5),
        updateMany,
      },
    } as unknown as Parameters<typeof restoreTrackedChannel>[0]["tx"];

    const result = await restoreTrackedChannel({
      tx,
      workspaceId: "workspace_1",
      trackedChannelId: "tracked_1",
    });

    expect(result).toMatchObject({
      success: false,
      code: "TRACKED_CHANNEL_LIMIT_REACHED",
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  test("deletes only archived tracked channels", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      trackedChannel: {
        deleteMany,
      },
    } as unknown as Parameters<typeof deleteArchivedTrackedChannel>[0]["tx"];

    const result = await deleteArchivedTrackedChannel({
      tx,
      workspaceId: "workspace_1",
      trackedChannelId: "tracked_1",
    });

    expect(result).toEqual({
      success: true,
      data: { trackedChannelId: "tracked_1" },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: "tracked_1", workspaceId: "workspace_1", isActive: false },
    });
  });

  test("does not delete active tracked channels", async () => {
    const tx = {
      trackedChannel: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as Parameters<typeof deleteArchivedTrackedChannel>[0]["tx"];

    const result = await deleteArchivedTrackedChannel({
      tx,
      workspaceId: "workspace_1",
      trackedChannelId: "tracked_1",
    });

    expect(result).toMatchObject({
      success: false,
      code: "ARCHIVED_CHANNEL_NOT_FOUND",
    });
  });
});
