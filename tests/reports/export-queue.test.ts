import { describe, expect, test, vi } from "vitest";

import { queueReportExportForWorkspace } from "../../lib/reports/export-queue";

const NOW = new Date("2026-05-19T00:00:00Z");

describe("queueReportExportForWorkspace", () => {
  test("queues a background export job for a completed workspace report", async () => {
    const enqueue = vi.fn(async () => ({ id: "job-1", reused: false }));
    const prisma = {
      researchReport: {
        findFirst: vi.fn(async () => ({ id: "report-1", status: "COMPLETED" })),
      },
    };

    const result = await queueReportExportForWorkspace({
      prisma,
      workspaceId: "workspace-1",
      reportId: "report-1",
      fileType: "docx",
      now: NOW,
      enqueue,
    });

    expect(prisma.researchReport.findFirst).toHaveBeenCalledWith({
      where: { id: "report-1", workspaceId: "workspace-1" },
      select: { id: true, status: true },
    });
    expect(enqueue).toHaveBeenCalledWith(prisma, {
      workspaceId: "workspace-1",
      jobType: "export_generate",
      referenceType: "ResearchReport",
      referenceId: "report-1:docx",
      maxAttempts: 3,
      now: NOW,
      metadata: {
        workspaceId: "workspace-1",
        reportId: "report-1",
        fileType: "docx",
      },
    });
    expect(result).toEqual({ jobId: "job-1", reused: false });
  });

  test("rejects export jobs for reports outside the workspace", async () => {
    const enqueue = vi.fn();
    const prisma = {
      researchReport: {
        findFirst: vi.fn(async () => null),
      },
    };

    await expect(
      queueReportExportForWorkspace({
        prisma,
        workspaceId: "workspace-1",
        reportId: "report-2",
        fileType: "pdf",
        enqueue,
      }),
    ).rejects.toThrow("Report was not found.");

    expect(enqueue).not.toHaveBeenCalled();
  });
});
