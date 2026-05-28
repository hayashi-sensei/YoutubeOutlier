import { describe, expect, test, vi } from "vitest";

const getOptionalUserWorkspace = vi.fn();
const getPrismaClient = vi.fn();
const requestReportExportDownloadForWorkspace = vi.fn();
const getReportExportDownload = vi.fn();

vi.mock("../../lib/auth/session", () => ({
  getOptionalUserWorkspace,
}));

vi.mock("../../lib/db/prisma", () => ({
  getPrismaClient,
}));

vi.mock("../../lib/reports/export-request", () => ({
  requestReportExportDownloadForWorkspace,
}));

vi.mock("../../lib/reports/export-download", () => ({
  getReportExportDownload,
}));

describe("report export request route", () => {
  test("redirects to a visible error when direct export processing throws", async () => {
    getOptionalUserWorkspace.mockResolvedValue({ workspaceId: "workspace-1" });
    getPrismaClient.mockReturnValue({});
    requestReportExportDownloadForWorkspace.mockRejectedValue(new Error("Only completed reports can be exported."));

    const { POST } = await import("../../app/api/reports/[reportId]/exports/request/route");
    const request = new Request("http://localhost/app/reports/report-1", {
      method: "POST",
      body: new URLSearchParams({ fileType: "docx" }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ reportId: "report-1" }),
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/app/reports/report-1?error=EXPORT_REQUEST_FAILED",
    );
    expect(getReportExportDownload).not.toHaveBeenCalled();
  });
});
