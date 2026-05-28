import {
  backfillChannelVideos,
  refreshRecentChannelVideos,
  type YoutubeIngestionSummary,
  type YoutubeIngestionTx,
} from "./ingestion";
import {
  YoutubeDataApiProvider,
  type YoutubeProvider,
} from "./provider";
import { env } from "../env";
import { createHash } from "node:crypto";

const YOUTUBE_PROVIDER_NAME = "youtube";
const YOUTUBE_QUOTA_TIME_ZONE = "America/Los_Angeles";
const BACKFILL_JOB_TYPE = "youtube_channel_backfill";
const RECENT_REFRESH_JOB_TYPE = "youtube_recent_refresh";
const BACKFILL_QUOTA_RESERVATION_UNITS = 10;
const RECENT_REFRESH_QUOTA_RESERVATION_UNITS = 3;

type YoutubeQuotaUsageRead = {
  aggregate(input: {
    _sum: { units: true };
    where: { quotaDate: { gte: Date; lt: Date } };
  }): Promise<{ _sum: { units: number | null } }>;
};

type YoutubeQuotaUsageWrite = YoutubeQuotaUsageRead & {
  create(input: {
    data: {
      quotaDate: Date;
      operation: string;
      units: number;
      referenceType: string;
      referenceId: string;
    };
  }): Promise<{ id: string }>;
  update(input: {
    where: { id: string };
    data: { units: number };
  }): Promise<unknown>;
};

type AdvisoryLockExecutor = {
  $executeRaw(
    query: TemplateStringsArray,
    ...values: Array<unknown>
  ): Promise<unknown>;
};

type YoutubeChannelRead = {
  findUnique(input: {
    where: { id: string };
    select: {
      id: true;
      youtubeChannelId: true;
      trackedBy: {
        where: { isActive: true };
        take: 1;
        select: { workspaceId: true };
      };
    };
  }): Promise<RunnerChannel | null>;
};

type JobRunWrite = {
  create(input: {
    data: {
      workspaceId?: string;
      jobType: string;
      status: "RUNNING";
      provider: string;
      referenceType: string;
      referenceId: string;
      attempts: number;
      maxAttempts: number;
      startedAt: Date;
      metadata: RunnerJobMetadata;
    };
  }): Promise<{ id: string }>;
  update(input: {
    where: { id: string };
    data:
      | {
          status: "SUCCEEDED";
          completedAt: Date;
          metadata: RunnerJobMetadata & {
            summary: JsonSafeYoutubeIngestionSummary;
          };
        }
      | {
          status: "FAILED";
          completedAt: Date;
          errorMessage: string;
        };
  }): Promise<unknown>;
};

type RunnerChannel = {
  id: string;
  youtubeChannelId: string;
  trackedBy: Array<{ workspaceId: string }>;
};

type RunnerJobMetadata = {
  youtubeChannelId: string;
};

type YoutubeRunnerTx = YoutubeIngestionTx & {
  youtubeQuotaUsage: YoutubeQuotaUsageWrite;
} & AdvisoryLockExecutor;

export type YoutubeRunnerPrisma = YoutubeIngestionTx & {
  youtubeChannel: YoutubeIngestionTx["youtubeChannel"] & YoutubeChannelRead;
  youtubeQuotaUsage: YoutubeQuotaUsageWrite;
  jobRun: JobRunWrite;
  $transaction<T>(callback: (tx: YoutubeRunnerTx) => Promise<T>): Promise<T>;
} & AdvisoryLockExecutor;

export type AssertYoutubeQuotaAvailableInput = {
  requestedUnits: number;
  dailyLimit?: number;
  now?: Date;
};

export type RunYoutubeIngestionJobInput = {
  prisma: YoutubeRunnerPrisma;
  provider?: YoutubeProvider;
  channelId: string;
  jobRunId?: string;
  now?: Date;
  dailyQuotaLimit?: number;
};

type RunYoutubeIngestionJobConfig = {
  jobType: string;
  requestedQuotaUnits: number;
  ingest(input: {
    tx: YoutubeIngestionTx;
    provider: YoutubeProvider;
    channelId: string;
    youtubeChannelId: string;
    now: Date;
  }): Promise<YoutubeIngestionSummary>;
};

type YoutubeQuotaReservation = {
  id: string;
  units: number;
  quotaDate: Date;
};

type JsonSafeYoutubeIngestionSummary = {
  channelId: string;
  uploadsPlaylistId: string;
  playlistPagesFetched: number;
  videosDiscovered: number;
  videosFetched: number;
  videosIncluded: number;
  videosUpserted: number;
  metricSnapshotsCreated: number;
  estimatedQuotaUnits: number;
};

export async function assertYoutubeQuotaAvailable(
  tx: { youtubeQuotaUsage: YoutubeQuotaUsageRead },
  input: AssertYoutubeQuotaAvailableInput,
): Promise<void> {
  const now = input.now ?? new Date();
  const dailyLimit = input.dailyLimit ?? env.YOUTUBE_DAILY_QUOTA_LIMIT;
  const { start, end } = providerQuotaDayRange(now);
  const usage = await tx.youtubeQuotaUsage.aggregate({
    _sum: { units: true },
    where: {
      quotaDate: {
        gte: start,
        lt: end,
      },
    },
  });
  const usedUnits = usage._sum.units ?? 0;

  if (usedUnits + input.requestedUnits > dailyLimit) {
    throw new Error(
      `YouTube quota limit exceeded: ${usedUnits} used + ${input.requestedUnits} requested exceeds daily limit ${dailyLimit}.`,
    );
  }
}

async function reserveYoutubeQuota(
  prisma: YoutubeRunnerPrisma,
  input: {
    requestedUnits: number;
    dailyLimit?: number;
    now: Date;
    operation: string;
    referenceId: string;
  },
): Promise<YoutubeQuotaReservation> {
  const quotaDay = providerQuotaDayRange(input.now);

  return prisma.$transaction(async (tx) => {
    await takeYoutubeQuotaLock(tx, quotaDay.start);
    await assertYoutubeQuotaAvailable(tx, {
      requestedUnits: input.requestedUnits,
      dailyLimit: input.dailyLimit,
      now: input.now,
    });

    const reservation = await tx.youtubeQuotaUsage.create({
      data: {
        quotaDate: quotaDay.start,
        operation: input.operation,
        units: input.requestedUnits,
        referenceType: "JobRun",
        referenceId: input.referenceId,
      },
    });

    return {
      id: reservation.id,
      units: input.requestedUnits,
      quotaDate: quotaDay.start,
    };
  });
}

export async function runYoutubeChannelBackfillJob(
  input: RunYoutubeIngestionJobInput,
): Promise<YoutubeIngestionSummary> {
  return runYoutubeIngestionJob(input, {
    jobType: BACKFILL_JOB_TYPE,
    requestedQuotaUnits: BACKFILL_QUOTA_RESERVATION_UNITS,
    ingest: backfillChannelVideos,
  });
}

export async function runYoutubeRecentRefreshJob(
  input: RunYoutubeIngestionJobInput,
): Promise<YoutubeIngestionSummary> {
  return runYoutubeIngestionJob(input, {
    jobType: RECENT_REFRESH_JOB_TYPE,
    requestedQuotaUnits: RECENT_REFRESH_QUOTA_RESERVATION_UNITS,
    ingest: refreshRecentChannelVideos,
  });
}

async function runYoutubeIngestionJob(
  input: RunYoutubeIngestionJobInput,
  config: RunYoutubeIngestionJobConfig,
): Promise<YoutubeIngestionSummary> {
  const now = input.now ?? new Date();
  const channel = await loadRunnerChannel(input.prisma, input.channelId);
  const metadata = { youtubeChannelId: channel.youtubeChannelId };
  const job = input.jobRunId
    ? { id: input.jobRunId }
    : await input.prisma.jobRun.create({
        data: {
          workspaceId: channel.trackedBy[0]?.workspaceId,
          jobType: config.jobType,
          status: "RUNNING",
          provider: YOUTUBE_PROVIDER_NAME,
          referenceType: "YoutubeChannel",
          referenceId: channel.id,
          attempts: 1,
          maxAttempts: 1,
          startedAt: now,
          metadata,
        },
      });

  try {
    const quotaReservation = await reserveYoutubeQuota(input.prisma, {
      requestedUnits: config.requestedQuotaUnits,
      dailyLimit: input.dailyQuotaLimit,
      now,
      operation: config.jobType,
      referenceId: job.id,
    });
    const summary = await config.ingest({
      tx: input.prisma,
      provider: input.provider ?? createDefaultYoutubeProvider(),
      channelId: channel.id,
      youtubeChannelId: channel.youtubeChannelId,
      now,
    });

    await reconcileYoutubeQuotaReservation(input.prisma, {
      reservation: quotaReservation,
      actualUnits: summary.estimatedQuotaUnits,
      dailyLimit: input.dailyQuotaLimit,
      now,
    });

    await input.prisma.jobRun.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        completedAt: now,
        metadata: {
          ...metadata,
          summary: serializeYoutubeIngestionSummary(summary),
        },
      },
    });

    return summary;
  } catch (error) {
    await recordYoutubeJobFailure(input.prisma, {
      jobRunId: job.id,
      completedAt: now,
      error,
    });
    throw error;
  }
}

async function reconcileYoutubeQuotaReservation(
  prisma: YoutubeRunnerPrisma,
  input: {
    reservation: YoutubeQuotaReservation;
    actualUnits: number;
    dailyLimit?: number;
    now: Date;
  },
): Promise<void> {
  if (input.actualUnits === input.reservation.units) {
    return;
  }

  if (input.actualUnits < input.reservation.units) {
    await prisma.youtubeQuotaUsage.update({
      where: { id: input.reservation.id },
      data: { units: input.actualUnits },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await takeYoutubeQuotaLock(tx, input.reservation.quotaDate);
    await assertYoutubeQuotaAvailable(tx, {
      requestedUnits: input.actualUnits - input.reservation.units,
      dailyLimit: input.dailyLimit,
      now: input.now,
    });

    await tx.youtubeQuotaUsage.update({
      where: { id: input.reservation.id },
      data: { units: input.actualUnits },
    });
  });
}

async function recordYoutubeJobFailure(
  prisma: YoutubeRunnerPrisma,
  input: {
    jobRunId: string;
    completedAt: Date;
    error: unknown;
  },
): Promise<void> {
  try {
    await prisma.jobRun.update({
      where: { id: input.jobRunId },
      data: {
        status: "FAILED",
        completedAt: input.completedAt,
        errorMessage: getErrorMessage(input.error),
      },
    });
  } catch (loggingError) {
    console.error("Failed to record YouTube ingestion job failure.", {
      jobRunId: input.jobRunId,
      originalError: getErrorMessage(input.error),
      loggingError: getErrorMessage(loggingError),
    });
  }
}

async function takeYoutubeQuotaLock(
  tx: AdvisoryLockExecutor,
  quotaDate: Date,
): Promise<void> {
  const [lockNamespace, lockKey] = advisoryLockKeys(
    YOUTUBE_PROVIDER_NAME,
    quotaDate,
  );

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockNamespace}, ${lockKey})`;
}

function advisoryLockKeys(provider: string, quotaDate: Date): [number, number] {
  const hash = createHash("sha256")
    .update(`${provider}:${quotaDate.toISOString()}`)
    .digest();

  return [hash.readInt32BE(0), hash.readInt32BE(4)];
}

function serializeYoutubeIngestionSummary(
  summary: YoutubeIngestionSummary,
): JsonSafeYoutubeIngestionSummary {
  return {
    channelId: summary.channelId,
    uploadsPlaylistId: summary.uploadsPlaylistId,
    playlistPagesFetched: summary.playlistPagesFetched,
    videosDiscovered: summary.videosDiscovered,
    videosFetched: summary.videosFetched,
    videosIncluded: summary.videosIncluded,
    videosUpserted: summary.videosUpserted,
    metricSnapshotsCreated: summary.metricSnapshotsCreated,
    estimatedQuotaUnits: summary.estimatedQuotaUnits,
  };
}

async function loadRunnerChannel(
  prisma: YoutubeRunnerPrisma,
  channelId: string,
): Promise<RunnerChannel> {
  const channel = await prisma.youtubeChannel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      youtubeChannelId: true,
      trackedBy: {
        where: { isActive: true },
        take: 1,
        select: { workspaceId: true },
      },
    },
  });

  if (!channel) {
    throw new Error(`YouTube channel not found: ${channelId}`);
  }

  return channel;
}

function createDefaultYoutubeProvider(): YoutubeProvider {
  if (!env.YOUTUBE_DATA_API_KEY) {
    throw new Error("YOUTUBE_DATA_API_KEY is required to run YouTube ingestion.");
  }

  return new YoutubeDataApiProvider({
    apiKey: env.YOUTUBE_DATA_API_KEY,
  });
}

function providerQuotaDayRange(date: Date): { start: Date; end: Date } {
  const parts = timeZoneDateParts(date, YOUTUBE_QUOTA_TIME_ZONE);
  const start = zonedDateTimeToUtc(
    parts.year,
    parts.month,
    parts.day,
    YOUTUBE_QUOTA_TIME_ZONE,
  );
  const end = zonedDateTimeToUtc(
    parts.year,
    parts.month,
    parts.day + 1,
    YOUTUBE_QUOTA_TIME_ZONE,
  );

  return { start, end };
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day));
  const offset = timeZoneOffsetMs(utcGuess, timeZone);
  const candidate = new Date(utcGuess.getTime() - offset);
  const candidateOffset = timeZoneOffsetMs(candidate, timeZone);

  if (candidateOffset === offset) {
    return candidate;
  }

  return new Date(utcGuess.getTime() - candidateOffset);
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = timeZoneDateTimeParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}

function timeZoneDateParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = timeZoneDateTimeParts(date, timeZone);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

function timeZoneDateTimeParts(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const entries = formatter.formatToParts(date).flatMap((part) => {
    if (part.type === "literal") {
      return [];
    }

    return [[part.type, Number(part.value)] as const];
  });
  const parts = Object.fromEntries(entries);

  return {
    year: getDatePart(parts, "year"),
    month: getDatePart(parts, "month"),
    day: getDatePart(parts, "day"),
    hour: getDatePart(parts, "hour"),
    minute: getDatePart(parts, "minute"),
    second: getDatePart(parts, "second"),
  };
}

function getDatePart(
  parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>>,
  key: Intl.DateTimeFormatPartTypes,
): number {
  const value = parts[key];

  if (typeof value !== "number") {
    throw new Error(`Missing ${key} in ${YOUTUBE_QUOTA_TIME_ZONE} date.`);
  }

  return value;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
