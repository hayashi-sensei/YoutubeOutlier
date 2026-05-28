import type { JobHandler, JobMetadata } from "@/types/jobs";
import {
  claimDueJobs,
  markJobFailed,
  markJobNeutral,
  markJobSucceeded,
  type JobQueuePrisma,
} from "./queue";

export type JobWorkerPrisma = JobQueuePrisma;

export type JobWorkerHandlers = Record<string, JobHandler>;

export type JobBatchSummary = {
  claimed: number;
  succeeded: number;
  failed: number;
  neutral: number;
};

export class UnsupportedJobError extends Error {
  readonly code = "NOT_IMPLEMENTED";

  constructor(message: string) {
    super(message);
    this.name = "UnsupportedJobError";
  }
}

export async function processJobBatch(input: {
  prisma: JobWorkerPrisma;
  handlers: JobWorkerHandlers;
  limit?: number;
  concurrency?: number;
  now?: Date;
  only?: {
    jobType?: string;
    referenceType?: string;
    referenceId?: string;
  };
}): Promise<JobBatchSummary> {
  const now = input.now ?? new Date();
  const jobs = await claimDueJobs(input.prisma, {
    limit: input.limit ?? 10,
    now,
    includeJobType: true,
    only: input.only,
  });
  const summary: JobBatchSummary = {
    claimed: jobs.length,
    succeeded: 0,
    failed: 0,
    neutral: 0,
  };
  const concurrency = Math.max(1, Math.min(input.concurrency ?? 3, jobs.length || 1));

  await runWithConcurrency(jobs, concurrency, async (job) => {
    try {
      const handler = job.jobType ? input.handlers[job.jobType] : undefined;
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.jobType ?? "unknown"}`);
      }

      const result = await handler({
        prisma: input.prisma,
        job,
        now,
      });
      await markJobSucceeded(input.prisma, {
        jobId: job.id,
        now,
        metadata: wrapSummary(result),
      });
      summary.succeeded += 1;
    } catch (error) {
      if (error instanceof UnsupportedJobError) {
        await markJobNeutral(input.prisma, {
          jobId: job.id,
          now,
          reason: error.message,
          code: error.code,
        });
        summary.neutral += 1;
        return;
      }

      await markJobFailed(input.prisma, {
        jobId: job.id,
        now,
        error,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
      });
      summary.failed += 1;
    }
  });

  return summary;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  });

  await Promise.all(workers);
}

function wrapSummary(result: JobMetadata | undefined): JobMetadata {
  return result ? { summary: result } : {};
}
