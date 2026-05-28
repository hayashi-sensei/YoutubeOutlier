export type ResearchCacheCleanupSummary = {
  sourceItemsDeleted: number;
  youtubeVideosDeleted: number;
  trackedChannelsReset: number;
};

export type ResearchCacheCleanupTx = {
  industrySourceItem: {
    deleteMany(input: {
      where: {
        source: {
          workspaceId: string;
        };
      };
    }): Promise<{ count: number }>;
  };
  industrySource: {
    updateMany(input: {
      where: { workspaceId: string };
      data: { lastFetchedAt: null };
    }): Promise<{ count: number }>;
  };
  trackedChannel: {
    findMany(input: {
      where:
        | { workspaceId: string }
        | {
            youtubeChannelId: {
              in: string[];
            };
          };
      select:
        | { youtubeChannelId: true }
        | { workspaceId: true; youtubeChannelId: true };
    }): Promise<Array<{ workspaceId?: string; youtubeChannelId: string }>>;
  };
  youtubeVideo: {
    deleteMany(input: {
      where: {
        youtubeChannelId: {
          in: string[];
        };
      };
    }): Promise<{ count: number }>;
  };
  youtubeChannel: {
    updateMany(input: {
      where: {
        id: {
          in: string[];
        };
      };
      data: { lastFetchedAt: null };
    }): Promise<{ count: number }>;
  };
};

export async function cleanWorkspaceResearchCache(input: {
  tx: ResearchCacheCleanupTx;
  workspaceId: string;
}): Promise<ResearchCacheCleanupSummary> {
  const trackedChannels = await input.tx.trackedChannel.findMany({
    where: { workspaceId: input.workspaceId },
    select: { youtubeChannelId: true },
  });
  const youtubeChannelIds = trackedChannels.map((channel) => channel.youtubeChannelId);
  const unsharedYoutubeChannelIds = await findUnsharedYoutubeChannelIds({
    tx: input.tx,
    workspaceId: input.workspaceId,
    youtubeChannelIds,
  });

  const sourceItemsDeleted = await input.tx.industrySourceItem.deleteMany({
    where: {
      source: {
        workspaceId: input.workspaceId,
      },
    },
  });
  await input.tx.industrySource.updateMany({
    where: { workspaceId: input.workspaceId },
    data: { lastFetchedAt: null },
  });

  const youtubeVideosDeleted = unsharedYoutubeChannelIds.length > 0
    ? await input.tx.youtubeVideo.deleteMany({
        where: {
          youtubeChannelId: {
            in: unsharedYoutubeChannelIds,
          },
        },
      })
    : { count: 0 };
  if (unsharedYoutubeChannelIds.length > 0) {
    await input.tx.youtubeChannel.updateMany({
      where: {
        id: {
          in: unsharedYoutubeChannelIds,
        },
      },
      data: { lastFetchedAt: null },
    });
  }

  return {
    sourceItemsDeleted: sourceItemsDeleted.count,
    youtubeVideosDeleted: youtubeVideosDeleted.count,
    trackedChannelsReset: unsharedYoutubeChannelIds.length,
  };
}

async function findUnsharedYoutubeChannelIds(input: {
  tx: ResearchCacheCleanupTx;
  workspaceId: string;
  youtubeChannelIds: string[];
}) {
  if (input.youtubeChannelIds.length === 0) {
    return [];
  }

  const channelTrackers = await input.tx.trackedChannel.findMany({
    where: {
      youtubeChannelId: {
        in: input.youtubeChannelIds,
      },
    },
    select: { workspaceId: true, youtubeChannelId: true },
  });
  const trackerWorkspaceIdsByChannel = new Map<string, Set<string>>();

  for (const tracker of channelTrackers) {
    if (!tracker.workspaceId) {
      continue;
    }

    const workspaceIds = trackerWorkspaceIdsByChannel.get(tracker.youtubeChannelId) ?? new Set<string>();
    workspaceIds.add(tracker.workspaceId);
    trackerWorkspaceIdsByChannel.set(tracker.youtubeChannelId, workspaceIds);
  }

  return input.youtubeChannelIds.filter((youtubeChannelId) => {
    const workspaceIds = trackerWorkspaceIdsByChannel.get(youtubeChannelId);
    return !workspaceIds || (workspaceIds.size === 1 && workspaceIds.has(input.workspaceId));
  });
}
