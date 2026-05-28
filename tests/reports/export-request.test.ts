import { describe, expect, test, vi } from "vitest";

import { requestReportExportDownloadForWorkspace } from "../../lib/reports/export-request";

const NOW = new Date("2026-05-19T00:00:00Z");

describe("requestReportExportDownloadForWorkspace", () => {
  test("returns a download URL when the requested export is processed immediately", async () => {
    const prisma = {
      researchReport: {
        findFirst: vi.fn(async () => ({ id: "report-1", status: "COMPLETED" })),
      },
      jobRun: {
        findUnique: vi.fn(async () => ({
          id: "job-1",
          status: "SUCCEEDED",
          metadata: {
            summary: {
              exportId: "export-1",
              reportId: "report-1",
              fileType: "docx",
            },
          },
          errorMessage: null,
        })),
      },
    };
    const enqueue = vi.fn(async () => ({ id: "job-1", reused: false }));
    const processJobs = vi.fn(async () => ({
      claimed: 1,
      succeeded: 1,
      failed: 0,
      neutral: 0,
    }));

    const result = await requestReportExportDownloadForWorkspace({
      prisma: prisma as never,
      workspaceId: "workspace-1",
      reportId: "report-1",
      fileType: "docx",
      now: NOW,
      enqueue,
      processJobs,
    });

    expect(processJobs).toHaveBeenCalledWith({
      prisma,
      limit: 1,
      now: NOW,
      only: {
        jobType: "export_generate",
        referenceType: "ResearchReport",
        referenceId: "report-1:docx",
      },
    });
    expect(result).toEqual({
      status: "ready",
      fileType: "docx",
      jobId: "job-1",
      downloadUrl: "/api/reports/report-1/exports/export-1/download",
    });
  });

  test("returns queued when an existing export job cannot be claimed yet", async () => {
    const prisma = {
      researchReport: {
        findFirst: vi.fn(async () => ({ id: "report-1", status: "COMPLETED" })),
      },
      jobRun: {
        findUnique: vi.fn(async () => ({
          id: "job-1",
          status: "RUNNING",
          metadata: {},
          errorMessage: null,
        })),
      },
    };

    const result = await requestReportExportDownloadForWorkspace({
      prisma: prisma as never,
      workspaceId: "workspace-1",
      reportId: "report-1",
      fileType: "pdf",
      enqueue: vi.fn(async () => ({ id: "job-1", reused: true })),
      processJobs: vi.fn(async () => ({
        claimed: 0,
        succeeded: 0,
        failed: 0,
        neutral: 0,
      })),
    });

    expect(result).toEqual({
      status: "already_queued",
      fileType: "pdf",
      jobId: "job-1",
      downloadUrl: null,
    });
  });
});
