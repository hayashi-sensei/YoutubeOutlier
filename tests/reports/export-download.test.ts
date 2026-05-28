import { describe, expect, test, vi } from "vitest";

import { getReportExportDownload } from "../../lib/reports/export-download";
import { createMemoryStorageAdapter } from "../../lib/storage/memory-adapter";

const NOW = new Date("2026-05-19T00:00:00Z");

describe("getReportExportDownload", () => {
  test("loads an unexpired workspace export and reads its file body", async () => {
    const storage = createMemoryStorageAdapter();
    await storage.putObject({
      key: "exports/workspace-1/report-1/export-1.pdf",
      contentType: "application/pdf",
      body: Buffer.from("pdf-body"),
    });
    const getObject = vi.spyOn(storage, "getObject");
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
      storage,
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
    expect(getObject).toHaveBeenCalledWith({ key: "exports/workspace-1/report-1/export-1.pdf" });
    expect(result).toEqual({
      body: Buffer.from("pdf-body"),
      contentType: "application/pdf",
      filename: "daily-research-report.pdf",
    });
  });

  test("returns null for expired exports", async () => {
    const storage = createMemoryStorageAdapter();
    const getObject = vi.spyOn(storage, "getObject");
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
      storage,
    });

    expect(result).toBeNull();
    expect(getObject).not.toHaveBeenCalled();
  });

  test("rejects stored export paths outside the workspace export prefix", async () => {
    const storage = createMemoryStorageAdapter();
    const getObject = vi.spyOn(storage, "getObject");
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
      storage,
    });

    expect(result).toBeNull();
    expect(getObject).not.toHaveBeenCalled();
  });
});
