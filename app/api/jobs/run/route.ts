import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getPrismaClient } from "@/lib/db/prisma";
import { backgroundJobHandlers } from "@/lib/jobs/handlers";
import { scheduleDueBackgroundJobs } from "@/lib/jobs/scheduler";
import { processJobBatch } from "@/lib/jobs/worker";

export const dynamic = "force-dynamic";

const DEFAULT_PROCESS_LIMIT = 25;
const MAX_PROCESS_LIMIT = 100;
const DEFAULT_PROCESS_CONCURRENCY = 3;
const MAX_PROCESS_CONCURRENCY = 10;

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = boundedInteger(url.searchParams.get("limit"), DEFAULT_PROCESS_LIMIT, MAX_PROCESS_LIMIT);
  const concurrency = boundedInteger(
    url.searchParams.get("concurrency"),
    DEFAULT_PROCESS_CONCURRENCY,
    MAX_PROCESS_CONCURRENCY,
  );
  const prisma = getPrismaClient();
  const scheduled = await scheduleDueBackgroundJobs(prisma);
  const processed = await processJobBatch({
    prisma,
    handlers: backgroundJobHandlers,
    limit,
    concurrency,
  });

  return NextResponse.json({
    scheduled,
    processed,
  });
}

function isAuthorized(request: Request): boolean {
  if (!env.YTRESEARCH_JOBS_SECRET) {
    return false;
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : request.headers.get("x-ytresearch-jobs-secret");

  return token === env.YTRESEARCH_JOBS_SECRET;
}

function boundedInteger(value: string | null, fallback: number, max: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}
