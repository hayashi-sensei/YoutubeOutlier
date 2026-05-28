import { describe, expect, test, vi } from "vitest";

import {
  sendDailyReportEmail,
  sendExportReadyEmail,
  type EmailNotificationPrisma,
} from "../../lib/email/notifications";

describe("email notifications", () => {
  test("sends daily report email only when report preferences are enabled", async () => {
    const prisma = notificationPrismaFixture();
    const sender = vi.fn(async () => ({ providerId: "email-1" }));

    const result = await sendDailyReportEmail({
      prisma,
      workspaceId: "workspace-1",
      reportId: "report-1",
      env: {
        RESEND_API_KEY: "resend-key",
        RESEND_FROM_EMAIL: "reports@ytresearch.app",
        APP_BASE_URL: "https://app.ytresearch.test",
      },
      sender,
    });

    expect(sender).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "reports@example.com",
        subject: "Daily Research Report is ready",
      }),
    );
    expect(prisma.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        toEmail: "reports@example.com",
        template: "daily_report",
        status: "SENT",
        providerId: "email-1",
        metadata: {
          reportId: "report-1",
          workspaceId: "workspace-1",
        },
      }),
    });
    expect(result.status).toBe("SENT");
  });

  test("logs a skipped daily report email when preferences are disabled", async () => {
    const prisma = notificationPrismaFixture({ dailyReportEnabled: false });
    const sender = vi.fn(async () => ({ providerId: "should-not-send" }));

    const result = await sendDailyReportEmail({
      prisma,
      workspaceId: "workspace-1",
      reportId: "report-1",
      env: {
        RESEND_API_KEY: "resend-key",
        RESEND_FROM_EMAIL: "reports@ytresearch.app",
      },
      sender,
    });

    expect(sender).not.toHaveBeenCalled();
    expect(prisma.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        toEmail: "reports@example.com",
        template: "daily_report",
        status: "SKIPPED",
        errorMessage: "Daily report emails are disabled.",
        metadata: {
          reportId: "report-1",
          skippedReason: "daily_reports_disabled",
        },
      }),
    });
    expect(result.status).toBe("SKIPPED");
  });

  test("sends export-ready email with a report page link", async () => {
    const prisma = notificationPrismaFixture();
    const sender = vi.fn(async () => ({ providerId: "email-export" }));

    const result = await sendExportReadyEmail({
      prisma,
      workspaceId: "workspace-1",
      exportId: "export-1",
      env: {
        RESEND_API_KEY: "resend-key",
        RESEND_FROM_EMAIL: "reports@ytresearch.app",
        APP_BASE_URL: "https://app.ytresearch.test",
      },
      sender,
    });

    expect(sender).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "reports@example.com",
        subject: "PDF export ready: Daily Research Report",
        text: expect.stringContaining("Open report: https://app.ytresearch.test/app/reports/report-1"),
      }),
    );
    expect(prisma.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        toEmail: "reports@example.com",
        template: "export_ready",
        status: "SENT",
        metadata: {
          exportId: "export-1",
          reportId: "report-1",
          workspaceId: "workspace-1",
          fileType: "pdf",
        },
      }),
    });
    expect(result.providerId).toBe("email-export");
  });
});

function notificationPrismaFixture(
  overrides: { dailyReportEnabled?: boolean } = {},
): EmailNotificationPrisma {
  const workspace = {
    id: "workspace-1",
    name: "Founder Workspace",
    owner: { email: "owner@example.com" },
    settings: {
      dailyReportEnabled: overrides.dailyReportEnabled ?? true,
      reportDeliveryEmail: "reports@example.com",
    },
  };

  return {
    emailLog: {
      create: vi.fn(async () => undefined),
    },
    workspace: {
      findUnique: vi.fn(async () => workspace),
    },
    researchReport: {
      findFirst: vi.fn(async () => ({
        id: "report-1",
        title: "Daily Research Report",
        summary: "Found 2 competitor uploads.",
        generatedAt: new Date("2026-05-19T00:10:00Z"),
      })),
    },
    exportFile: {
      findFirst: vi.fn(async () => ({
        id: "export-1",
        fileType: "pdf",
        expiresAt: new Date("2026-05-26T00:00:00Z"),
        report: {
          id: "report-1",
          title: "Daily Research Report",
          workspaceId: "workspace-1",
          workspace: {
            name: workspace.name,
            owner: workspace.owner,
            settings: {
              reportDeliveryEmail: workspace.settings.reportDeliveryEmail,
            },
          },
        },
      })),
    },
  };
}
