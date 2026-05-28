import type { Prisma, RecommendationStatus } from "@/generated/prisma/client";
import { getWorkspacePlanEntitlement } from "@/lib/billing/plan-limits";
import type { ParsedYoutubeChannelUrl } from "@/lib/youtube/channel-url";

export type ChannelUpsertInput = {
  youtubeChannelId: string;
  handle?: string;
  title: string;
  sourceUrl: string;
};

export type CompetitorActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };

type TrackingTx = Prisma.TransactionClient;

export function canTrackMoreChannels(input: { activeCount: number; maxTrackedChannels: number }) {
  return input.activeCount < input.maxTrackedChannels;
}

export function createChannelUpsertInput(parsed: ParsedYoutubeChannelUrl): ChannelUpsertInput {
  if (parsed.type === "channelId") {
    return {
      youtubeChannelId: parsed.value,
      handle: undefined,
      title: parsed.value,
      sourceUrl: parsed.canonicalUrl,
    };
  }

  if (parsed.type === "handle") {
    const normalizedHandle = parsed.value.toLowerCase();
    const handleWithoutAt = normalizedHandle.replace(/^@/, "");

    return {
      youtubeChannelId: `handle:${handleWithoutAt}`,
      handle: normalizedHandle,
      title: normalizedHandle,
      sourceUrl: parsed.canonicalUrl,
    };
  }

  return {
    youtubeChannelId: `${parsed.type}:${parsed.value.toLowerCase()}`,
    handle: undefined,
    title: parsed.value,
    sourceUrl: parsed.canonicalUrl,
  };
}

async function lockWorkspaceTracking(tx: TrackingTx, workspaceId: string) {
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${workspaceId}))`;
}

export async function addTrackedChannel(input: {
  tx: TrackingTx;
  workspaceId: string;
  channel: ChannelUpsertInput;
  nickname?: string;
  reason?: string;
  addedByRecommendation?: boolean;
}) {
  await lockWorkspaceTracking(input.tx, input.workspaceId);

  const workspace = await input.tx.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { id: true },
  });

  if (!workspace) {
    return {
      success: false,
      error: "Workspace not found.",
      code: "WORKSPACE_NOT_FOUND",
    } satisfies CompetitorActionResult<never>;
  }

  const activeCount = await input.tx.trackedChannel.count({
    where: { workspaceId: input.workspaceId, isActive: true },
  });
  const entitlement = await getWorkspacePlanEntitlement(input.tx, input.workspaceId);

  if (!entitlement) {
    return {
      success: false,
      error: "Workspace not found.",
      code: "WORKSPACE_NOT_FOUND",
    } satisfies CompetitorActionResult<never>;
  }

  if (!canTrackMoreChannels({ activeCount, maxTrackedChannels: entitlement.maxTrackedChannels })) {
    return {
      success: false,
      error: `Your ${entitlement.name} plan can track ${entitlement.maxTrackedChannels} competitor channels.`,
      code: "TRACKED_CHANNEL_LIMIT_REACHED",
    } satisfies CompetitorActionResult<never>;
  }

  const existingChannel = input.channel.handle
    ? await input.tx.youtubeChannel.findFirst({
        where: {
          OR: [{ youtubeChannelId: input.channel.youtubeChannelId }, { handle: input.channel.handle }],
        },
        select: { id: true, youtubeChannelId: true },
      })
    : await input.tx.youtubeChannel.findUnique({
        where: { youtubeChannelId: input.channel.youtubeChannelId },
        select: { id: true, youtubeChannelId: true },
      });

  const channel = existingChannel
    ? await input.tx.youtubeChannel.update({
        where: { id: existingChannel.id },
        data: {
          handle: input.channel.handle,
          title: input.channel.title,
        },
        select: { id: true },
      })
    : await input.tx.youtubeChannel.create({
        data: {
          youtubeChannelId: input.channel.youtubeChannelId,
          handle: input.channel.handle,
          title: input.channel.title,
          description: `Added from ${input.channel.sourceUrl}`,
        },
        select: { id: true },
      });

  const tracked = await input.tx.trackedChannel.upsert({
    where: {
      workspaceId_youtubeChannelId: {
        workspaceId: input.workspaceId,
        youtubeChannelId: channel.id,
      },
    },
    update: {
      isActive: true,
      nickname: input.nickname,
      reason: input.reason,
      addedByRecommendation: input.addedByRecommendation ?? false,
    },
    create: {
      workspaceId: input.workspaceId,
      youtubeChannelId: channel.id,
      nickname: input.nickname,
      reason: input.reason,
      addedByRecommendation: input.addedByRecommendation ?? false,
    },
    select: { id: true },
  });

  return {
    success: true,
    data: { trackedChannelId: tracked.id, channelId: channel.id },
  } satisfies CompetitorActionResult<{ trackedChannelId: string; channelId: string }>;
}

export async function archiveTrackedChannel(input: { tx: TrackingTx; workspaceId: string; trackedChannelId: string }) {
  const updated = await input.tx.trackedChannel.updateMany({
    where: { id: input.trackedChannelId, workspaceId: input.workspaceId, isActive: true },
    data: { isActive: false },
  });

  if (updated.count === 0) {
    return {
      success: false,
      error: "Tracked channel was not found.",
      code: "TRACKED_CHANNEL_NOT_FOUND",
    } satisfies CompetitorActionResult<never>;
  }

  return {
    success: true,
    data: { trackedChannelId: input.trackedChannelId },
  } satisfies CompetitorActionResult<{ trackedChannelId: string }>;
}

export async function restoreTrackedChannel(input: { tx: TrackingTx; workspaceId: string; trackedChannelId: string }) {
  await lockWorkspaceTracking(input.tx, input.workspaceId);

  const trackedChannel = await input.tx.trackedChannel.findFirst({
    where: { id: input.trackedChannelId, workspaceId: input.workspaceId, isActive: false },
    select: { id: true },
  });

  if (!trackedChannel) {
    return {
      success: false,
      error: "Archived channel was not found.",
      code: "TRACKED_CHANNEL_NOT_FOUND",
    } satisfies CompetitorActionResult<never>;
  }

  const activeCount = await input.tx.trackedChannel.count({
    where: { workspaceId: input.workspaceId, isActive: true },
  });
  const entitlement = await getWorkspacePlanEntitlement(input.tx, input.workspaceId);

  if (!entitlement) {
    return {
      success: false,
      error: "Workspace not found.",
      code: "WORKSPACE_NOT_FOUND",
    } satisfies CompetitorActionResult<never>;
  }

  if (!canTrackMoreChannels({ activeCount, maxTrackedChannels: entitlement.maxTrackedChannels })) {
    return {
      success: false,
      error: `Your ${entitlement.name} plan can track ${entitlement.maxTrackedChannels} competitor channels.`,
      code: "TRACKED_CHANNEL_LIMIT_REACHED",
    } satisfies CompetitorActionResult<never>;
  }

  const updated = await input.tx.trackedChannel.updateMany({
    where: { id: trackedChannel.id, workspaceId: input.workspaceId, isActive: false },
    data: { isActive: true },
  });

  if (updated.count === 0) {
    return {
      success: false,
      error: "Archived channel was not found.",
      code: "TRACKED_CHANNEL_NOT_FOUND",
    } satisfies CompetitorActionResult<never>;
  }

  return {
    success: true,
    data: { trackedChannelId: input.trackedChannelId },
  } satisfies CompetitorActionResult<{ trackedChannelId: string }>;
}

export async function deleteArchivedTrackedChannel(input: { tx: TrackingTx; workspaceId: string; trackedChannelId: string }) {
  const deleted = await input.tx.trackedChannel.deleteMany({
    where: { id: input.trackedChannelId, workspaceId: input.workspaceId, isActive: false },
  });

  if (deleted.count === 0) {
    return {
      success: false,
      error: "Archived channel was not found.",
      code: "ARCHIVED_CHANNEL_NOT_FOUND",
    } satisfies CompetitorActionResult<never>;
  }

  return {
    success: true,
    data: { trackedChannelId: input.trackedChannelId },
  } satisfies CompetitorActionResult<{ trackedChannelId: string }>;
}

export function nextRecommendationStatus(action: "approve" | "dismiss"): RecommendationStatus {
  return action === "approve" ? "USED" : "DISMISSED";
}
