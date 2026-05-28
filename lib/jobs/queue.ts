import type { ClaimedJob, JobMetadata, JobRunStatus } from "@/types/jobs";
import { serializeJobError } from "./errors";

const PENDING_STATUSES: JobRunStatus[] = ["QUEUED", "RUNNING", "RETRYING"];
const CLAIMABLE_STATUSES: JobRunStatus[] = ["QUEUED", "RETRYING"];
const BASE_RETRY_DELAY_MS = 5 * 60 * 1000;

type ExistingJob = {
  id: string;
  status: JobRunStatus;
  attempts: number;
  maxAttempts: number;
};

type DueJob = ExistingJob & {
  createdAt: Date;
  jobType?: string;
  referenceId?: string | null;
  metadata: unknown;
};

export type JobQueuePrisma = {
  jobRun: {
    findFirst(input: {
      where: {
        jobType: string;
        referenceType?: string;
        referenceId?: string;
        status: { in: JobRunStatus[] };
      };
      select: { id: true; status: true; attempts: true; maxAttempts: true };
    }): Promise<ExistingJob | null>;
    findMany(input: {
      where: {
        status: { in: JobRunStatus[] };
        OR: Array<{ availableAt: null } | { availableAt: { lte: Date } }>;
      };
      orderBy: Array<{ availableAt: "asc" } | { createdAt: "asc" }>;
      take: number;
      select: {
        id: true;
        status: true;
        attempts: true;
        maxAttempts: true;
        createdAt: true;
        metadata: true;
        jobType?: true;
        referenceId?: true;
      };
    }): Promise<DueJob[]>;
    findUnique(input: {
      where: { id: string };
      select: {
        id: true;
        status: true;
        attempts: true;
        maxAttempts: true;
        metadata: true;
      };
    }): Promise<(ExistingJob & { metadata: unknown }) | null>;
    create(input: {
      data: {
        workspaceId?: string;
        jobType: string;
        status: "QUEUED";
        provider?: string;
        referenceType?: string;
        referenceId?: string;
        attempts: 0;
        maxAttempts: number;
        scheduledFor: Date;
        availableAt: Date;
        metadata: JobMetadata;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
    update(input: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
    updateMany(input: {
      where: { id: string; status: { in: JobRunStatus[] } };
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  adminAuditLog?: {
    create(input: {
      data: {
        actorUserId: string;
        action: string;
        targetType: string;
        targetId: string;
        reason: string;
      };
    }): Promise<unknown>;
  };
};

export async function enqueueJob(
  prisma: JobQueuePrisma,
  input: {
    workspaceId?: string;
    jobType: string;
    provider?: string;
    referenceType?: string;
    referenceId?: string;
    maxAttempts?: number;
    metadata?: JobMetadata;
    dedupeStatuses?: JobRunStatus[];
    scheduledFor?: Date;
    now?: Date;
  },
): Promise<{ id: string; reused: boolean }> {
  if (input.referenceType && input.referenceId) {
    const dedupeStatuses = input.dedupeStatuses ?? PENDING_STATUSES;
    const existing = await prisma.jobRun.findFirst({
      where: {
        jobType: input.jobType,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        status: { in: dedupeStatuses },
      },
      select: { id: true, status: true, attempts: true, maxAttempts: true },
    });

    if (existing) {
      return { id: existing.id, reused: true };
    }
  }

  const now = input.now ?? new Date();
  const scheduledFor = input.scheduledFor ?? now;
  const metadata = {
    ...(input.metadata ?? {}),
    queuedAt: now.toISOString(),
  };
  const created = await prisma.jobRun.create({
    data: {
      workspaceId: input.workspaceId,
      jobType: input.jobType,
      status: "QUEUED",
      provider: input.provider,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      scheduledFor,
      availableAt: scheduledFor,
      metadata,
    },
    select: { id: true },
  });

  return { id: created.id, reused: false };
}

export async function claimDueJobs(
  prisma: JobQueuePrisma,
  input: {
    limit: number;
    now?: Date;
    includeJobType?: boolean;
    only?: {
      jobType?: string;
      referenceType?: string;
      referenceId?: string;
    };
  },
): Promise<ClaimedJob[]> {
  const now = input.now ?? new Date();
  const jobs = await prisma.jobRun.findMany({
    where: {
      status: { in: CLAIMABLE_STATUSES },
      ...(input.only?.jobType ? { jobType: input.only.jobType } : {}),
      ...(input.only?.referenceType ? { referenceType: input.only.referenceType } : {}),
      ...(input.only?.referenceId ? { referenceId: input.only.referenceId } : {}),
      OR: [{ availableAt: null }, { availableAt: { lte: now } }],
    },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    take: input.limit,
    select: {
      id: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      createdAt: true,
      metadata: true,
      ...(input.includeJobType ? { jobType: true as const } : {}),
      ...(input.includeJobType ? { referenceId: true as const } : {}),
    },
  });
  const claimed: ClaimedJob[] = [];

  for (const job of jobs) {
    const queueLatencyMs = Math.max(0, now.getTime() - job.createdAt.getTime());
    const result = await prisma.jobRun.updateMany({
      where: { id: job.id, status: { in: CLAIMABLE_STATUSES } },
      data: {
        status: "RUNNING",
        attempts: { increment: 1 },
        startedAt: now,
        claimedAt: now,
        lastHeartbeatAt: now,
        queueLatencyMs,
      },
    });

    if (result.count !== 1) {
      continue;
    }

    claimed.push({
      id: job.id,
      ...(job.jobType ? { jobType: job.jobType } : {}),
      status: "RUNNING",
      attempts: job.attempts + 1,
      maxAttempts: job.maxAttempts,
      metadata: {
        ...normalizeMetadata(job.metadata),
        ...(job.referenceId ? { referenceId: job.referenceId } : {}),
      },
    });
  }

  return claimed;
}

export async function markJobSucceeded(
  prisma: JobQueuePrisma,
  input: {
    jobId: string;
    now?: Date;
    metadata?: JobMetadata;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  await prisma.jobRun.update({
    where: { id: input.jobId },
    data: {
      status: "SUCCEEDED",
      completedAt: now,
      lastHeartbeatAt: now,
      metadata: input.metadata ?? {},
    },
  });
}

export async function markJobNeutral(
  prisma: JobQueuePrisma,
  input: {
    jobId: string;
    now?: Date;
    reason: string;
    code: string;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  await prisma.jobRun.update({
    where: { id: input.jobId },
    data: {
      status: "CANCELED",
      completedAt: now,
      lastHeartbeatAt: now,
      errorMessage: null,
      providerError: undefined,
      metadata: {
        neutralReason: input.reason,
        neutralStatus: input.code,
      },
    },
  });
}

export async function markJobFailed(
  prisma: JobQueuePrisma,
  input: {
    jobId: string;
    now?: Date;
    error: unknown;
    attempts?: number;
    maxAttempts?: number;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  const job = input.attempts && input.maxAttempts
    ? { attempts: input.attempts, maxAttempts: input.maxAttempts }
    : await prisma.jobRun.findUnique({
        where: { id: input.jobId },
        select: {
          id: true,
          status: true,
          attempts: true,
          maxAttempts: true,
          metadata: true,
        },
      });

  if (!job) {
    throw new Error(`Job not found: ${input.jobId}`);
  }

  const serialized = serializeJobError(input.error);
  const willRetry = serialized.retryable && job.attempts < job.maxAttempts;
  await prisma.jobRun.update({
    where: { id: input.jobId },
    data: {
      status: willRetry ? "RETRYING" : "FAILED",
      errorMessage: serialized.message,
      providerError: serialized.metadata,
      availableAt: willRetry ? retryAvailableAt(now, job.attempts) : undefined,
      completedAt: willRetry ? null : now,
      lastHeartbeatAt: now,
    },
  });
}

export async function retryFailedJob(
  prisma: JobQueuePrisma,
  input: {
    jobId: string;
    actorUserId: string;
    now?: Date;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  const job = await prisma.jobRun.findUnique({
    where: { id: input.jobId },
    select: {
      id: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      metadata: true,
    },
  });

  if (!job) {
    throw new Error("Job was not found.");
  }

  if (job.status !== "FAILED") {
    throw new Error("Only failed jobs can be retried.");
  }

  if (job.attempts >= job.maxAttempts) {
    throw new Error("Job has no retry attempts remaining.");
  }

  await prisma.jobRun.update({
    where: { id: input.jobId },
    data: {
      status: "RETRYING",
      availableAt: now,
      completedAt: null,
      errorMessage: null,
      providerError: undefined,
      metadata: {
        ...normalizeMetadata(job.metadata),
        retriedByAdminUserId: input.actorUserId,
        retriedAt: now.toISOString(),
      },
    },
  });

  await prisma.adminAuditLog?.create({
    data: {
      actorUserId: input.actorUserId,
      action: "job.retry",
      targetType: "JobRun",
      targetId: input.jobId,
      reason: "Admin retry of failed job",
    },
  });
}

function retryAvailableAt(now: Date, attempts: number): Date {
  return new Date(now.getTime() + Math.max(1, attempts) * BASE_RETRY_DELAY_MS);
}

function normalizeMetadata(value: unknown): JobMetadata {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JobMetadata;
  }

  return {};
}
