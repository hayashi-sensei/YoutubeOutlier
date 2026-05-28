import {
  billingEmailTemplate,
  dailyReportEmailTemplate,
  exportReadyEmailTemplate,
} from "./templates";
import {
  sendLoggedEmail,
  logSkippedEmail,
  type EmailEnvironment,
  type EmailLogPrisma,
  type EmailSendResult,
  type EmailSender,
} from "./sender";

type WorkspaceEmailRow = {
  id: string;
  name: string;
  owner: { email: string };
  settings: {
    dailyReportEnabled: boolean;
    reportDeliveryEmail: string | null;
  } | null;
};

type ReportEmailRow = {
  id: string;
  title: string;
  summary: string | null;
  generatedAt: Date | null;
};

type ExportEmailRow = {
  id: string;
  fileType: string;
  expiresAt: Date | null;
  report: {
    id: string;
    title: string;
    workspaceId: string;
    workspace: {
      name: string;
      owner: { email: string };
      settings: { reportDeliveryEmail: string | null } | null;
    };
  } | null;
};

export type EmailNotificationPrisma = EmailLogPrisma & {
  workspace: {
    findUnique(input: {
      where: { id: string };
      select: {
        id: true;
        name: true;
        owner: { select: { email: true } };
        settings: {
          select: {
            dailyReportEnabled: true;
            reportDeliveryEmail: true;
          };
        };
      };
    }): Promise<WorkspaceEmailRow | null>;
  };
  researchReport: {
    findFirst(input: {
      where: { id: string; workspaceId: string };
      select: {
        id: true;
        title: true;
        summary: true;
        generatedAt: true;
      };
    }): Promise<ReportEmailRow | null>;
  };
  exportFile: {
    findFirst(input: {
      where: { id: string; workspaceId: string };
      select: {
        id: true;
        fileType: true;
        expiresAt: true;
        report: {
          select: {
            id: true;
            title: true;
            workspaceId: true;
            workspace: {
              select: {
                name: true;
                owner: { select: { email: true } };
                settings: { select: { reportDeliveryEmail: true } };
              };
            };
          };
        };
      };
    }): Promise<ExportEmailRow | null>;
  };
};

export async function sendDailyReportEmail(input: {
  prisma: EmailNotificationPrisma;
  workspaceId: string;
  reportId: string;
  env?: EmailEnvironment;
  sender?: EmailSender;
}): Promise<EmailSendResult> {
  const [workspace, report] = await Promise.all([
    input.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: {
        id: true,
        name: true,
        owner: { select: { email: true } },
        settings: {
          select: {
            dailyReportEnabled: true,
            reportDeliveryEmail: true,
          },
        },
      },
    }),
    input.prisma.researchReport.findFirst({
      where: { id: input.reportId, workspaceId: input.workspaceId },
      select: {
        id: true,
        title: true,
        summary: true,
        generatedAt: true,
      },
    }),
  ]);

  if (!workspace || !report) {
    return logSkippedEmail({
      prisma: input.prisma,
      workspaceId: input.workspaceId,
      templateName: "daily_report",
      errorMessage: "Daily report email skipped because the report or workspace was not found.",
      metadata: {
        reportId: input.reportId,
        skippedReason: "missing_report_or_workspace",
      },
    });
  }

  if (!workspace.settings?.dailyReportEnabled) {
    return logSkippedEmail({
      prisma: input.prisma,
      workspaceId: input.workspaceId,
      toEmail: workspace.settings?.reportDeliveryEmail ?? workspace.owner.email,
      templateName: "daily_report",
      errorMessage: "Daily report emails are disabled.",
      metadata: {
        reportId: report.id,
        skippedReason: "daily_reports_disabled",
      },
    });
  }

  const toEmail = workspace.settings.reportDeliveryEmail ?? workspace.owner.email;

  return sendLoggedEmail({
    prisma: input.prisma,
    workspaceId: input.workspaceId,
    toEmail,
    templateName: "daily_report",
    template: dailyReportEmailTemplate({
      workspaceName: workspace.name,
      reportTitle: report.title,
      reportSummary: report.summary,
      reportUrl: appUrl(`/app/reports/${report.id}`, input.env),
      generatedAt: report.generatedAt,
    }),
    metadata: {
      reportId: report.id,
      workspaceId: input.workspaceId,
    },
    env: input.env,
    sender: input.sender,
  });
}

export async function sendExportReadyEmail(input: {
  prisma: EmailNotificationPrisma;
  workspaceId: string;
  exportId: string;
  env?: EmailEnvironment;
  sender?: EmailSender;
}): Promise<EmailSendResult> {
  const exportFile = await input.prisma.exportFile.findFirst({
    where: { id: input.exportId, workspaceId: input.workspaceId },
    select: {
      id: true,
      fileType: true,
      expiresAt: true,
      report: {
        select: {
          id: true,
          title: true,
          workspaceId: true,
          workspace: {
            select: {
              name: true,
              owner: { select: { email: true } },
              settings: { select: { reportDeliveryEmail: true } },
            },
          },
        },
      },
    },
  });

  if (!exportFile?.report) {
    return logSkippedEmail({
      prisma: input.prisma,
      workspaceId: input.workspaceId,
      templateName: "export_ready",
      errorMessage: "Export-ready email skipped because the export or report was not found.",
      metadata: {
        exportId: input.exportId,
        skippedReason: "missing_export_or_report",
      },
    });
  }

  const report = exportFile.report;
  const toEmail = report.workspace.settings?.reportDeliveryEmail ?? report.workspace.owner.email;
  const reportUrl = appUrl(`/app/reports/${report.id}`, input.env);

  return sendLoggedEmail({
    prisma: input.prisma,
    workspaceId: input.workspaceId,
    toEmail,
    templateName: "export_ready",
    template: exportReadyEmailTemplate({
      workspaceName: report.workspace.name,
      reportTitle: report.title,
      fileType: exportFile.fileType,
      reportUrl,
      expiresAt: exportFile.expiresAt,
    }),
    metadata: {
      exportId: exportFile.id,
      reportId: report.id,
      workspaceId: input.workspaceId,
      fileType: exportFile.fileType,
    },
    env: input.env,
    sender: input.sender,
  });
}

export async function sendBillingNotificationEmail(input: {
  prisma: EmailLogPrisma;
  workspaceId: string;
  toEmail: string;
  workspaceName: string;
  subject: string;
  headline: string;
  body: string;
  env?: EmailEnvironment;
  sender?: EmailSender;
}): Promise<EmailSendResult> {
  return sendLoggedEmail({
    prisma: input.prisma,
    workspaceId: input.workspaceId,
    toEmail: input.toEmail,
    templateName: "billing_notification",
    template: billingEmailTemplate({
      workspaceName: input.workspaceName,
      subject: input.subject,
      headline: input.headline,
      body: input.body,
      actionUrl: appUrl("/app/billing", input.env),
    }),
    metadata: {
      workspaceId: input.workspaceId,
    },
    env: input.env,
    sender: input.sender,
  });
}

function appUrl(path: string, env: EmailEnvironment | undefined): string {
  const baseUrl = env?.NEXT_PUBLIC_APP_URL ?? env?.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_BASE_URL ?? "http://localhost:3000";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  return `${baseUrl.replace(/\/$/, "")}${normalizedPath}`;
}
