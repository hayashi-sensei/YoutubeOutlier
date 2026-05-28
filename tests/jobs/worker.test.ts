import { describe, expect, test, vi } from "vitest";

import {
  processJobBatch,
  UnsupportedJobError,
  type JobWorkerPrisma,
} from "../../lib/jobs/worker";

const NOW = new Date("2026-05-18T03:00:00Z");

describe("processJobBatch", () => {
  test("runs claimed jobs through handlers and records success or failure", async () => {
    const prisma = createWorkerPrisma();
    const handlers = {
      youtube_recent_refresh: vi.fn(async () => ({ refreshed: 1 })),
      transcript_fetch: vi.fn(async () => {
        throw new Error("transcript provider down");
      }),
    };

    const summary = await processJobBatch({
      prisma,
      handlers,
      limit: 2,
      now: NOW,
    });

    expect(summary).toEqual({
      claimed: 2,
      succeeded: 1,
      failed: 1,
      neutral: 0,
    });
    expect(handlers.youtube_recent_refresh).toHaveBeenCalledWith({
      prisma,
      job: expect.objectContaining({ id: "job-1" }),
      now: NOW,
    });
    expect(prisma.jobRun.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "SUCCEEDED",
        completedAt: NOW,
        lastHeartbeatAt: NOW,
        metadata: { summary: { refreshed: 1 } },
      },
    });
    expect(prisma.jobRun.update).toHaveBeenCalledWith({
      where: { id: "job-2" },
      data: expect.objectContaining({
        status: "FAILED",
        errorMessage: "transcript provider down",
      }),
    });
  });

  test("marks unsupported future jobs as neutral instead of failed", async () => {
    const prisma = createWorkerPrisma([
      {
        id: "job-3",
        jobType: "daily_report_generate",
        status: "QUEUED" as const,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date("2026-05-18T02:57:00Z"),
        metadata: {},
      },
    ]);
    const handlers = {
      daily_report_generate: vi.fn(async () => {
        throw new UnsupportedJobError(
          "daily_report_generate is queued but not implemented in this spec.",
        );
      }),
    };

    const summary = await processJobBatch({
      prisma,
      handlers,
      limit: 1,
      now: NOW,
    });

    expect(summary).toEqual({
      claimed: 1,
      succeeded: 0,
      failed: 0,
      neutral: 1,
    });
    expect(prisma.jobRun.update).toHaveBeenCalledWith({
      where: { id: "job-3" },
      data: {
        status: "CANCELED",
        completedAt: NOW,
        lastHeartbeatAt: NOW,
        errorMessage: null,
        providerError: undefined,
        metadata: {
          neutralReason:
            "daily_report_generate is queued but not implemented in this spec.",
          neutralStatus: "NOT_IMPLEMENTED",
        },
      },
    });
  });

  test("can process only a matching export job without draining unrelated queued work", async () => {
    const prisma = createWorkerPrisma([
      {
        id: "job-export",
        jobType: "export_generate",
        status: "QUEUED" as const,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date("2026-05-18T02:58:00Z"),
        metadata: { fileType: "docx" },
      },
    ]);
    const handlers = {
      export_generate: vi.fn(async () => ({ exportId: "export-1" })),
    };

    const summary = await processJobBatch({
      prisma,
      handlers,
      limit: 1,
      now: NOW,
      only: {
        jobType: "export_generate",
        referenceType: "ResearchReport",
        referenceId: "report-1:docx",
      },
    });

    expect(prisma.jobRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          jobType: "export_generate",
          referenceType: "ResearchReport",
          referenceId: "report-1:docx",
        }),
      }),
    );
    expect(handlers.export_generate).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({
      claimed: 1,
      succeeded: 1,
      failed: 0,
      neutral: 0,
    });
  });

  test("processes claimed jobs with bounded concurrency", async () => {
    const prisma = createWorkerPrisma(
      Array.from({ length: 5 }, (_, index) => ({
        id: `job-${index + 1}`,
        jobType: "transcript_fetch",
        status: "QUEUED" as const,
        attempts: 0,
        maxAttempts: 1,
        createdAt: new Date("2026-05-18T02:58:00Z"),
        metadata: {},
      })),
    );
    let activeHandlers = 0;
    let maxActiveHandlers = 0;
    const handlers = {
      transcript_fetch: vi.fn(async () => {
        activeHandlers += 1;
        maxActiveHandlers = Math.max(maxActiveHandlers, activeHandlers);
        await Promise.resolve();
        activeHandlers -= 1;
        return { ok: true };
      }),
    };

    const summary = await processJobBatch({
      prisma,
      handlers,
      limit: 5,
      concurrency: 2,
      now: NOW,
    });

    expect(summary).toEqual({
      claimed: 5,
      succeeded: 5,
      failed: 0,
      neutral: 0,
    });
    expect(maxActiveHandlers).toBeLessThanOrEqual(2);
    expect(handlers.transcript_fetch).toHaveBeenCalledTimes(5);
  });
});

type WorkerTestJob = {
  id: string;
  jobType: string;
  status: "QUEUED";
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  metadata: Record<string, unknown>;
};

function createWorkerPrisma(customJobs?: WorkerTestJob[]): JobWorkerPrisma & {
  jobRun: JobWorkerPrisma["jobRun"] & {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
} {
  const jobs = customJobs ?? [
    {
      id: "job-1",
      jobType: "youtube_recent_refresh",
      status: "QUEUED" as const,
      attempts: 0,
      maxAttempts: 1,
      createdAt: new Date("2026-05-18T02:59:00Z"),
      metadata: {},
    },
    {
      id: "job-2",
      jobType: "transcript_fetch",
      status: "QUEUED" as const,
      attempts: 0,
      maxAttempts: 1,
      createdAt: new Date("2026-05-18T02:58:00Z"),
      metadata: {},
    },
  ];

  return {
    jobRun: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => jobs),
      create: vi.fn(async () => ({ id: "job-created" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        jobs.find((job) => job.id === where.id) ?? null,
      ),
      update: vi.fn(async () => ({})),
    },
  };
}
