import { describe, expect, test, vi } from "vitest";

import {
  claimDueJobs,
  enqueueJob,
  markJobFailed,
  markJobSucceeded,
  retryFailedJob,
} from "../../lib/jobs/queue";
import type { JobQueuePrisma } from "../../lib/jobs/queue";

const NOW = new Date("2026-05-18T03:00:00Z");

describe("job queue", () => {
  test("reuses an existing pending job for the same reference", async () => {
    const prisma = createQueuePrisma({
      existingJob: {
        id: "job-existing",
        status: "QUEUED",
        attempts: 0,
        maxAttempts: 3,
        metadata: {},
      },
    });

    const job = await enqueueJob(prisma, {
      workspaceId: "workspace-1",
      jobType: "youtube_recent_refresh",
      provider: "youtube",
      referenceType: "YoutubeChannel",
      referenceId: "channel-1",
      metadata: { reason: "scheduled" },
      now: NOW,
    });

    expect(job).toEqual({ id: "job-existing", reused: true });
    expect(prisma.jobRun.create).not.toHaveBeenCalled();
  });

  test("can reuse a completed job when custom dedupe statuses include success", async () => {
    const prisma = createQueuePrisma({
      existingJob: {
        id: "job-existing",
        status: "SUCCEEDED",
        attempts: 1,
        maxAttempts: 3,
        metadata: {},
      },
    });

    const job = await enqueueJob(prisma, {
      workspaceId: "workspace-1",
      jobType: "daily_report_generate",
      referenceType: "WorkspaceDailyReport",
      referenceId: "workspace-1:2026-05-18",
      dedupeStatuses: ["QUEUED", "RUNNING", "RETRYING", "SUCCEEDED"],
      now: NOW,
    });

    expect(job).toEqual({ id: "job-existing", reused: true });
    expect(prisma.jobRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["QUEUED", "RUNNING", "RETRYING", "SUCCEEDED"] },
        }),
      }),
    );
    expect(prisma.jobRun.create).not.toHaveBeenCalled();
  });

  test("creates a queued job when no pending duplicate exists", async () => {
    const prisma = createQueuePrisma();

    const job = await enqueueJob(prisma, {
      workspaceId: "workspace-1",
      jobType: "industry_source_refresh",
      provider: "source",
      referenceType: "IndustrySource",
      referenceId: "source-1",
      maxAttempts: 5,
      metadata: { mode: "refresh" },
      now: NOW,
    });

    expect(job).toEqual({ id: "job-created", reused: false });
    expect(prisma.jobRun.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        jobType: "industry_source_refresh",
        status: "QUEUED",
        provider: "source",
        referenceType: "IndustrySource",
        referenceId: "source-1",
        attempts: 0,
        maxAttempts: 5,
        scheduledFor: NOW,
        availableAt: NOW,
        metadata: { mode: "refresh", queuedAt: NOW.toISOString() },
      },
      select: { id: true },
    });
  });

  test("claims only due queued or retrying jobs and records queue latency", async () => {
    const prisma = createQueuePrisma({
      dueJobs: [
        {
          id: "job-1",
          status: "QUEUED",
          createdAt: new Date("2026-05-18T02:59:00Z"),
          attempts: 0,
          maxAttempts: 3,
          metadata: { queuedAt: "2026-05-18T02:59:00.000Z" },
        },
      ],
    });

    const jobs = await claimDueJobs(prisma, {
      limit: 2,
      now: NOW,
    });

    expect(jobs).toEqual([
      {
        id: "job-1",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 3,
        metadata: { queuedAt: "2026-05-18T02:59:00.000Z" },
      },
    ]);
    expect(prisma.jobRun.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["QUEUED", "RETRYING"] },
        OR: [{ availableAt: null }, { availableAt: { lte: NOW } }],
      },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
      take: 2,
      select: {
        id: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        createdAt: true,
        metadata: true,
      },
    });
    expect(prisma.jobRun.updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: { in: ["QUEUED", "RETRYING"] } },
      data: {
        status: "RUNNING",
        attempts: { increment: 1 },
        startedAt: NOW,
        claimedAt: NOW,
        lastHeartbeatAt: NOW,
        queueLatencyMs: 60000,
      },
    });
  });

  test("marks success and failure with retry scheduling", async () => {
    const prisma = createQueuePrisma({
      failedJob: {
        id: "job-1",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 3,
        metadata: {},
      },
    });

    await markJobSucceeded(prisma, {
      jobId: "job-success",
      now: NOW,
      metadata: { processed: 2 },
    });
    await markJobFailed(prisma, {
      jobId: "job-1",
      now: NOW,
      error: new Error("temporary outage"),
    });

    expect(prisma.jobRun.update).toHaveBeenCalledWith({
      where: { id: "job-success" },
      data: {
        status: "SUCCEEDED",
        completedAt: NOW,
        lastHeartbeatAt: NOW,
        metadata: { processed: 2 },
      },
    });
    expect(prisma.jobRun.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "RETRYING",
        errorMessage: "temporary outage",
        providerError: undefined,
        availableAt: new Date("2026-05-18T03:05:00Z"),
        completedAt: null,
        lastHeartbeatAt: NOW,
      },
    });
  });

  test("retries a failed job from admin and audits the action", async () => {
    const prisma = createQueuePrisma({
      failedJob: {
        id: "job-1",
        status: "FAILED",
        attempts: 2,
        maxAttempts: 3,
        metadata: { previous: true },
      },
    });

    await retryFailedJob(prisma, {
      jobId: "job-1",
      actorUserId: "admin-1",
      now: NOW,
    });

    expect(prisma.jobRun.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "RETRYING",
        availableAt: NOW,
        completedAt: null,
        errorMessage: null,
        providerError: undefined,
        metadata: {
          previous: true,
          retriedByAdminUserId: "admin-1",
          retriedAt: NOW.toISOString(),
        },
      },
    });
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: "admin-1",
        action: "job.retry",
        targetType: "JobRun",
        targetId: "job-1",
        reason: "Admin retry of failed job",
      },
    });
  });
});

type TestJob = {
  id: string;
  status: "QUEUED" | "RUNNING" | "RETRYING" | "FAILED" | "SUCCEEDED";
  attempts: number;
  maxAttempts: number;
  createdAt?: Date;
    metadata: Record<string, unknown>;
};

function createQueuePrisma(input: {
  existingJob?: TestJob;
  dueJobs?: TestJob[];
  failedJob?: TestJob;
} = {}): JobQueuePrisma & {
  jobRun: JobQueuePrisma["jobRun"] & {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  adminAuditLog: { create: ReturnType<typeof vi.fn> };
} {
  return {
    jobRun: {
      findFirst: vi.fn(async () => input.existingJob ?? null),
      findMany: vi.fn(async () =>
        (input.dueJobs ?? []).map((job) => ({
          ...job,
          createdAt: job.createdAt ?? NOW,
        })),
      ),
      findUnique: vi.fn(async () => input.failedJob ?? null),
      create: vi.fn(async () => ({ id: "job-created" })),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    adminAuditLog: {
      create: vi.fn(async () => ({ id: "audit-1" })),
    },
  };
}
