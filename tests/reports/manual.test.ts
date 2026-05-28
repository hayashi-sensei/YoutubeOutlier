import { describe, expect, test, vi } from "vitest";

import { CreditBalanceError } from "../../lib/billing/credits";
import {
  generateManualReportForWorkspace,
  MANUAL_RESEARCH_REPORT_CREDITS,
} from "../../lib/reports/manual";

const NOW = new Date("2026-05-19T09:00:00Z");

describe("generateManualReportForWorkspace", () => {
  test("charges manual report credits before running report generation", async () => {
    const prisma = {};
    const creditDeductor = vi.fn(async () => ({ balanceAfter: 9 }));
    const reportRunner = vi.fn(async () => ({
      workspaceId: "workspace-1",
      reportId: "report-1",
      manualRun: true,
      windowStart: new Date("2026-05-18T09:00:00Z"),
      windowEnd: NOW,
      channelsRefreshed: 2,
      sourcesRefreshed: 1,
      competitorUploadsIncluded: 3,
      industryNewsIncluded: 4,
    }));

    const summary = await generateManualReportForWorkspace({
      prisma,
      workspaceId: "workspace-1",
      userId: "user-1",
      now: NOW,
      creditDeductor,
      reportRunner,
    });

    expect(summary.reportId).toBe("report-1");
    expect(creditDeductor).toHaveBeenCalledWith(prisma, {
      workspaceId: "workspace-1",
      userId: "user-1",
      taskType: "manual_report_generate",
      credits: MANUAL_RESEARCH_REPORT_CREDITS,
      referenceType: "ResearchReport",
      referenceId: null,
    });
    expect(creditDeductor.mock.invocationCallOrder[0]).toBeLessThan(
      reportRunner.mock.invocationCallOrder[0],
    );
    expect(reportRunner).toHaveBeenCalledWith({
      prisma,
      workspaceId: "workspace-1",
      userId: "user-1",
      manualRun: true,
      now: NOW,
    });
  });

  test("does not generate a manual report when credits are insufficient", async () => {
    const creditDeductor = vi.fn(async () => {
      throw new CreditBalanceError();
    });
    const reportRunner = vi.fn();

    await expect(
      generateManualReportForWorkspace({
        prisma: {},
        workspaceId: "workspace-1",
        userId: "user-1",
        creditDeductor,
        reportRunner,
      }),
    ).rejects.toBeInstanceOf(CreditBalanceError);

    expect(reportRunner).not.toHaveBeenCalled();
  });
});
