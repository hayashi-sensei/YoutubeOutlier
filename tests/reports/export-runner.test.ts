import { describe, expect, test, vi } from "vitest";

import { runReportExportJob } from "../../lib/reports/export-runner";
import { createMemoryStorageAdapter } from "../../lib/storage/memory-adapter";

const NOW = new Date("2026-05-19T00:00:00Z");

describe("runReportExportJob", () => {
  test("renders and stores a workspace-scoped PDF export", async () => {
    const storage = createMemoryStorageAdapter();
    const putObject = vi.spyOn(storage, "putObject");
    const prisma = prismaFixture();

    const summary = await runReportExportJob({
      prisma,
      workspaceId: "workspace-1",
      reportId: "report-1",
      fileType: "pdf",
      now: NOW,
      storage,
      createExportId: () => "export-1",
    });

    expect(putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^exports\/workspace-1\/report-1\/export-/),
        contentType: "application/pdf",
      }),
    );
    expect(prisma.exportFile.create).toHaveBeenCalledWith({
      data: {
        id: "export-1",
        workspaceId: "workspace-1",
        reportId: "report-1",
        fileType: "pdf",
        storagePath: expect.stringMatching(/^exports\/workspace-1\/report-1\/export-/),
        downloadUrl: "/api/reports/report-1/exports/export-1/download",
        expiresAt: new Date("2026-05-26T00:00:00.000Z"),
      },
      select: { id: true },
    });
    expect(summary).toEqual({
      workspaceId: "workspace-1",
      reportId: "report-1",
      exportId: "export-1",
      fileType: "pdf",
      storagePath: expect.stringMatching(/^exports\/workspace-1\/report-1\/export-/),
      expiresAt: "2026-05-26T00:00:00.000Z",
    });
  });

  test("rejects exports for incomplete reports", async () => {
    const prisma = prismaFixture({ status: "FAILED" });

    await expect(
      runReportExportJob({
        prisma,
        workspaceId: "workspace-1",
        reportId: "report-1",
        fileType: "docx",
        now: NOW,
        storage: createMemoryStorageAdapter(),
      }),
    ).rejects.toThrow("Only completed reports can be exported.");
  });
});

function prismaFixture(reportOverrides: { status?: string } = {}) {
  return {
    researchReport: {
      findFirst: vi.fn(async () => ({
        id: "report-1",
        workspaceId: "workspace-1",
        title: "Daily Research Report",
        status: reportOverrides.status ?? "COMPLETED",
        reportDate: new Date("2026-05-18T00:00:00Z"),
        manualRun: false,
        summary: "Generated 5 evidence-backed topic recommendations.",
        sectionsJson: {
          executiveSummary: {
            headline: "Research report for AI",
            keySignals: ["3 competitor videos analyzed"],
          },
          recommendedActions: ["Create an outline for AI agents first."],
        },
        errorMessage: null,
        generatedAt: new Date("2026-05-18T00:01:00Z"),
        createdAt: new Date("2026-05-18T00:00:00Z"),
        recommendations: [],
        exports: [],
      })),
    },
    workspace: {
      findFirst: vi.fn(async () => ({
        id: "workspace-1",
        name: "Founder Workspace",
        logoUrl: null,
        settings: {
          primaryNiche: "AI automation",
          brandVoice: "Direct and evidence-led",
          cta: "Subscribe for weekly strategy breakdowns",
        },
      })),
    },
    exportFile: {
      create: vi.fn(async () => ({ id: "export-1" })),
    },
  };
}
