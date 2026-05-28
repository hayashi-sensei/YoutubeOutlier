import { describe, expect, test, vi } from "vitest";

import { getReportExportDownload } from "../../lib/reports/export-download";

const NOW = new Date("2026-05-19T00:00:00Z");

describe("getReportExportDownload", () => {
  test("loads an unexpired workspace export and reads its file body", async () => {
    const readFile = vi.fn(async () => Buffer.from("pdf-body"));
    const prisma = {
      exportFile: {
        findFirst: vi.fn(async () => ({
          id: "export-1",
          reportId: "report-1",
          fileType: "pdf",
          storagePath: "exports/workspace-1/report-1/export-1.pdf",
          expiresAt: new Date("2026-05-26T00:00:00Z"),
          report: { title: "Daily Research Report" },
        })),
      },
    };

    const result = await getReportExportDownload({
      prisma,
      workspaceId: "workspace-1",
      reportId: "report-1",
      exportId: "export-1",
      now: NOW,
      readFile,
    });

    expect(prisma.exportFile.findFirst).toHaveBeenCalledWith({
      where: {
        id: "export-1",
        reportId: "report-1",
        workspaceId: "workspace-1",
      },
      select: {
        id: true,
        reportId: true,
        fileType: true,
        storagePath: true,
        expiresAt: true,
        report: { select: { title: true } },
      },
    });
    expect(readFile).toHaveBeenCalledWith("exports/workspace-1/report-1/export-1.pdf");
    expect(result).toEqual({
      body: Buffer.from("pdf-body"),
      contentType: "application/pdf",
      filename: "daily-research-report.pdf",
    });
  });

  test("returns null for expired exports", async () => {
    const readFile = vi.fn();
    const prisma = {
      exportFile: {
        findFirst: vi.fn(async () => ({
          id: "export-1",
          reportId: "report-1",
          fileType: "docx",
          storagePath: "exports/workspace-1/report-1/export-1.docx",
          expiresAt: new Date("2026-05-18T00:00:00Z"),
          report: { title: "Daily Research Report" },
        })),
      },
    };

    const result = await getReportExportDownload({
      prisma,
      workspaceId: "workspace-1",
      reportId: "report-1",
      exportId: "export-1",
      now: NOW,
      readFile,
    });

    expect(result).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  test("rejects stored export paths outside the workspace export prefix", async () => {
    const readFile = vi.fn(async () => Buffer.from("secret"));
    const prisma = {
      exportFile: {
        findFirst: vi.fn(async () => ({
          id: "export-1",
          reportId: "report-1",
          fileType: "pdf",
          storagePath: "../secrets/provider-key.txt",
          expiresAt: new Date("2026-05-26T00:00:00Z"),
          report: { title: "Daily Research Report" },
        })),
      },
    };

    const result = await getReportExportDownload({
      prisma,
      workspaceId: "workspace-1",
      reportId: "report-1",
      exportId: "export-1",
      now: NOW,
      readFile,
    });

    expect(result).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });
});
