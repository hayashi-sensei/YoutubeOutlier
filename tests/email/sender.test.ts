import { describe, expect, test, vi } from "vitest";

import { sendLoggedEmail } from "../../lib/email/sender";

const TEMPLATE = {
  subject: "Subject",
  html: "<p>Hello</p>",
  text: "Hello",
};

describe("sendLoggedEmail", () => {
  test("sends through Resend configuration and logs provider id", async () => {
    const prisma = {
      emailLog: {
        create: vi.fn(async () => undefined),
      },
    };
    const sender = vi.fn(async () => ({ providerId: "resend-email-1" }));

    const result = await sendLoggedEmail({
      prisma,
      workspaceId: "workspace-1",
      toEmail: "creator@example.com",
      templateName: "daily_report",
      template: TEMPLATE,
      metadata: { reportId: "report-1" },
      env: {
        RESEND_API_KEY: "resend-key",
        RESEND_FROM_EMAIL: "YTResearch <reports@ytresearch.app>",
      },
      sender,
    });

    expect(sender).toHaveBeenCalledWith({
      from: "YTResearch <reports@ytresearch.app>",
      to: "creator@example.com",
      subject: "Subject",
      html: "<p>Hello</p>",
      text: "Hello",
      apiKey: "resend-key",
    });
    expect(prisma.emailLog.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        toEmail: "creator@example.com",
        template: "daily_report",
        provider: "resend",
        providerId: "resend-email-1",
        status: "SENT",
        metadata: { reportId: "report-1" },
      },
    });
    expect(result).toEqual({
      status: "SENT",
      providerId: "resend-email-1",
      errorMessage: null,
    });
  });

  test("logs skipped delivery when Resend is not configured", async () => {
    const prisma = {
      emailLog: {
        create: vi.fn(async () => undefined),
      },
    };
    const sender = vi.fn(async () => ({ providerId: "should-not-send" }));

    const result = await sendLoggedEmail({
      prisma,
      workspaceId: "workspace-1",
      toEmail: "creator@example.com",
      templateName: "export_ready",
      template: TEMPLATE,
      env: {},
      sender,
    });

    expect(sender).not.toHaveBeenCalled();
    expect(prisma.emailLog.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        toEmail: "creator@example.com",
        template: "export_ready",
        provider: "resend",
        status: "SKIPPED",
        errorMessage: "Resend email delivery is not configured.",
        metadata: undefined,
      },
    });
    expect(result.status).toBe("SKIPPED");
  });

  test("logs failed delivery without throwing into the job", async () => {
    const prisma = {
      emailLog: {
        create: vi.fn(async () => undefined),
      },
    };

    const result = await sendLoggedEmail({
      prisma,
      toEmail: "creator@example.com",
      templateName: "daily_report",
      template: TEMPLATE,
      env: {
        RESEND_API_KEY: "resend-key",
        RESEND_FROM_EMAIL: "reports@ytresearch.app",
      },
      sender: vi.fn(async () => {
        throw new Error("Domain is not verified.");
      }),
    });

    expect(prisma.emailLog.create).toHaveBeenCalledWith({
      data: {
        workspaceId: null,
        toEmail: "creator@example.com",
        template: "daily_report",
        provider: "resend",
        status: "FAILED",
        errorMessage: "Domain is not verified.",
        metadata: undefined,
      },
    });
    expect(result).toEqual({
      status: "FAILED",
      providerId: null,
      errorMessage: "Domain is not verified.",
    });
  });
});
