import { describe, expect, test, vi } from "vitest";

import {
  cleanWorkspaceResearchCache,
  type ResearchCacheCleanupTx,
} from "../../lib/settings/research-cache";

describe("cleanWorkspaceResearchCache", () => {
  test("removes workspace source items and only unshared tracked-channel YouTube cache", async () => {
    const tx = createTx();

    const summary = await cleanWorkspaceResearchCache({
      tx,
      workspaceId: "workspace-1",
    });

    expect(tx.industrySourceItem.deleteMany).toHaveBeenCalledWith({
      where: {
        source: {
          workspaceId: "workspace-1",
        },
      },
    });
    expect(tx.industrySource.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1" },
      data: { lastFetchedAt: null },
    });
    expect(tx.trackedChannel.findMany).toHaveBeenCalledWith({
      where: {
        youtubeChannelId: {
          in: ["channel-1", "channel-2"],
        },
      },
      select: { workspaceId: true, youtubeChannelId: true },
    });
    expect(tx.youtubeVideo.deleteMany).toHaveBeenCalledWith({
      where: {
        youtubeChannelId: {
          in: ["channel-1"],
        },
      },
    });
    expect(tx.youtubeChannel.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["channel-1"],
        },
      },
      data: { lastFetchedAt: null },
    });
    expect(summary).toEqual({
      sourceItemsDeleted: 12,
      youtubeVideosDeleted: 34,
      trackedChannelsReset: 1,
    });
  });
});

function createTx(): ResearchCacheCleanupTx & {
  industrySourceItem: {
    deleteMany: ReturnType<typeof vi.fn>;
  };
  industrySource: {
    updateMany: ReturnType<typeof vi.fn>;
  };
  trackedChannel: {
    findMany: ReturnType<typeof vi.fn>;
  };
  youtubeVideo: {
    deleteMany: ReturnType<typeof vi.fn>;
  };
  youtubeChannel: {
    updateMany: ReturnType<typeof vi.fn>;
  };
} {
  return {
    industrySourceItem: {
      deleteMany: vi.fn(async () => ({ count: 12 })),
    },
    industrySource: {
      updateMany: vi.fn(async () => ({ count: 3 })),
    },
    trackedChannel: {
      findMany: vi.fn(async (input) => {
        if ("workspaceId" in input.where) {
          return [
            { youtubeChannelId: "channel-1" },
            { youtubeChannelId: "channel-2" },
          ];
        }

        return [
          { workspaceId: "workspace-1", youtubeChannelId: "channel-1" },
          { workspaceId: "workspace-1", youtubeChannelId: "channel-2" },
          { workspaceId: "workspace-2", youtubeChannelId: "channel-2" },
        ];
      }),
    },
    youtubeVideo: {
      deleteMany: vi.fn(async () => ({ count: 34 })),
    },
    youtubeChannel: {
      updateMany: vi.fn(async () => ({ count: 2 })),
    },
  };
}
