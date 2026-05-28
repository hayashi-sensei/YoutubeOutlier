import type { ReportStatus } from "@/generated/prisma/client";

type ReportRetryRecord = {
  status: ReportStatus;
};

export class ReportRetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportRetryError";
  }
}

export function assertReportRetryable<T extends ReportRetryRecord>(report: T | null): asserts report is T {
  if (!report) {
    throw new ReportRetryError("Report was not found.");
  }

  if (report.status !== "FAILED") {
    throw new ReportRetryError("Only failed reports can be retried.");
  }
}

export function assertReportRetryClaimed(updatedCount: number): void {
  if (updatedCount !== 1) {
    throw new ReportRetryError("Report was not found or is no longer failed.");
  }
}

export function getRetriedReportData() {
  return {
    status: "QUEUED" as const,
    errorMessage: null,
    generatedAt: null,
  };
}
