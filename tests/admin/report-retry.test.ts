import { describe, expect, test } from "vitest";
import { assertReportRetryClaimed, assertReportRetryable, getRetriedReportData, ReportRetryError } from "../../lib/admin/report-retry";

describe("admin report retry", () => {
  test("allows failed reports to be retried", () => {
    expect(() => assertReportRetryable({ status: "FAILED" })).not.toThrow();
    expect(getRetriedReportData()).toEqual({
      status: "QUEUED",
      errorMessage: null,
      generatedAt: null,
    });
  });

  test("rejects non-failed reports", () => {
    expect(() => assertReportRetryable({ status: "COMPLETED" })).toThrow(ReportRetryError);
    expect(() => assertReportRetryable(null)).toThrow(ReportRetryError);
  });

  test("requires exactly one failed report to be claimed for retry", () => {
    expect(() => assertReportRetryClaimed(1)).not.toThrow();
    expect(() => assertReportRetryClaimed(0)).toThrow(ReportRetryError);
  });
});
