import { mkdir, writeFile as writeFileToDisk } from "node:fs/promises";
import path from "node:path";
import {
  parseReportExportFileType,
  renderResearchReportDocx,
  renderResearchReportPdf,
  reportExportContentType,
  reportExportDownloadUrl,
  reportExportStoragePath,
  type ReportExportBranding,
  type ReportExportFileType,
} from "./export";
import {
  getWorkspaceResearchReportDetail,
  type ResearchReportDetailPrisma,
} from "./queries";

const EXPORT_TTL_DAYS = 7;

export type ReportExportWriterInput = {
  storagePath: string;
  contentType: string;
  body: Buffer;
};

export type ReportExportWriter = (input: ReportExportWriterInput) => Promise<void>;

export type ReportExportRunnerPrisma = ResearchReportDetailPrisma & {
  workspace: {
    findFirst(input: {
      where: { id: string };
      select: {
        id: true;
        name: true;
        logoUrl: true;
        settings: {
          select: {
            primaryNiche: true;
            brandVoice: true;
            cta: true;
          };
        };
      };
    }): Promise<{
      id: string;
      name: string;
      logoUrl: string | null;
      settings: {
        primaryNiche: string;
        brandVoice: string | null;
        cta: string | null;
      } | null;
    } | null>;
  };
  exportFile: {
    create(input: {
      data: {
        id?: string;
        workspaceId: string;
        reportId: string;
        fileType: ReportExportFileType;
        storagePath: string;
        downloadUrl: string;
        expiresAt: Date;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
};

export type ReportExportRunSummary = {
  workspaceId: string;
  reportId: string;
  exportId: string;
  fileType: ReportExportFileType;
  storagePath: string;
  expiresAt: string;
};

export async function runReportExportJob(input: {
  prisma: ReportExportRunnerPrisma;
  workspaceId: string;
  reportId: string;
  fileType: ReportExportFileType | string;
  now?: Date;
  writeFile?: ReportExportWriter;
  createExportId?: () => string;
}): Promise<ReportExportRunSummary> {
  const fileType = parseReportExportFileType(input.fileType);
  if (!fileType) {
    throw new Error("Unsupported report export file type.");
  }

  const report = await getWorkspaceResearchReportDetail(input.prisma, {
    workspaceId: input.workspaceId,
    reportId: input.reportId,
  });
  if (!report) {
    throw new Error("Report was not found.");
  }
  if (report.status !== "COMPLETED") {
    throw new Error("Only completed reports can be exported.");
  }

  const workspace = await input.prisma.workspace.findFirst({
    where: { id: input.workspaceId },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      settings: {
        select: {
          primaryNiche: true,
          brandVoice: true,
          cta: true,
        },
      },
    },
  });
  if (!workspace) {
    throw new Error("Workspace was not found.");
  }

  const now = input.now ?? new Date();
  const exportId = input.createExportId?.() ?? createExportId();
  const storagePath = reportExportStoragePath({
    workspaceId: input.workspaceId,
    reportId: input.reportId,
    exportId,
    fileType,
  });
  const branding: ReportExportBranding = {
    workspaceName: workspace.name,
    primaryNiche: workspace.settings?.primaryNiche ?? null,
    brandVoice: workspace.settings?.brandVoice ?? null,
    cta: workspace.settings?.cta ?? null,
  };
  const body = fileType === "pdf"
    ? renderResearchReportPdf(report, branding)
    : renderResearchReportDocx(report, branding);
  const expiresAt = new Date(now.getTime() + EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000);

  await (input.writeFile ?? writeLocalExportFile)({
    storagePath,
    contentType: reportExportContentType(fileType),
    body,
  });

  const created = await input.prisma.exportFile.create({
    data: {
      id: exportId,
      workspaceId: input.workspaceId,
      reportId: input.reportId,
      fileType,
      storagePath,
      downloadUrl: reportExportDownloadUrl({ reportId: input.reportId, exportId }),
      expiresAt,
    },
    select: { id: true },
  });

  return {
    workspaceId: input.workspaceId,
    reportId: input.reportId,
    exportId: created.id,
    fileType,
    storagePath,
    expiresAt: expiresAt.toISOString(),
  };
}

async function writeLocalExportFile(input: ReportExportWriterInput): Promise<void> {
  const absolutePath = path.join(process.cwd(), "outputs", "report_exports", input.storagePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFileToDisk(absolutePath, input.body);
}

function createExportId(): string {
  return `export_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
