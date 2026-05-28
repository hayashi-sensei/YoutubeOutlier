import { describe, expect, test, vi } from "vitest";

import {
  deleteFailedWorkspaceResearchReports,
  deleteWorkspaceResearchReport,
} from "../../lib/reports/deletion";

describe("deleteWorkspaceResearchReport", () => {
  test("deletes only the report that belongs to the active workspace", async () => {
    const tx = {
      topicRecommendation: {
        updateMany: vi.fn(async () => ({ count: 2 })),
      },
      exportFile: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      researchReport: {
        deleteMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    };

    const result = await deleteWorkspaceResearchReport(prisma, {
      workspaceId: "workspace-1",
      reportId: "report-1",
    });

    expect(result).toEqual({ deleted: true });
    expect(tx.topicRecommendation.updateMany).toHaveBeenCalledWith({
      where: {
        reportId: "report-1",
        workspaceId: "workspace-1",
      },
      data: { reportId: null },
    });
    expect(tx.exportFile.updateMany).toHaveBeenCalledWith({
      where: {
        reportId: "report-1",
        workspaceId: "workspace-1",
      },
      data: { reportId: null },
    });
    expect(tx.researchReport.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "report-1",
        workspaceId: "workspace-1",
      },
    });
  });

  test("reports when no workspace-owned report was deleted", async () => {
    const tx = {
      topicRecommendation: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      exportFile: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      researchReport: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    };

    const result = await deleteWorkspaceResearchReport(prisma, {
      workspaceId: "workspace-1",
      reportId: "other-workspace-report",
    });

    expect(result).toEqual({ deleted: false });
  });

  test("deletes all failed reports for the active workspace", async () => {
    const tx = {
      researchReport: {
        findMany: vi.fn(async () => [{ id: "failed-1" }, { id: "failed-2" }]),
        deleteMany: vi.fn(async () => ({ count: 2 })),
      },
      topicRecommendation: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      exportFile: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    };

    const result = await deleteFailedWorkspaceResearchReports(prisma, {
      workspaceId: "workspace-1",
    });

    expect(result).toEqual({ deletedCount: 2 });
    expect(tx.researchReport.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        status: "FAILED",
      },
      select: { id: true },
    });
    expect(tx.topicRecommendation.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        reportId: { in: ["failed-1", "failed-2"] },
      },
      data: { reportId: null },
    });
    expect(tx.exportFile.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        reportId: { in: ["failed-1", "failed-2"] },
      },
      data: { reportId: null },
    });
    expect(tx.researchReport.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        id: { in: ["failed-1", "failed-2"] },
      },
    });
  });
});
