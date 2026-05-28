import { readFile as readFileFromDisk } from "node:fs/promises";
import path from "node:path";
import {
  parseReportExportFileType,
  reportExportContentType,
  reportExportFilename,
  type ReportExportFileType,
} from "./export";

export type ReportExportDownloadPrisma = {
  exportFile: {
    findFirst(input: {
      where: {
        id: string;
        reportId: string;
        workspaceId: string;
      };
      select: {
        id: true;
        reportId: true;
        fileType: true;
        storagePath: true;
        expiresAt: true;
        report: { select: { title: true } };
      };
    }): Promise<{
      id: string;
      reportId: string | null;
      fileType: string;
      storagePath: string;
      expiresAt: Date | null;
      report: { title: string } | null;
    } | null>;
  };
};

export async function getReportExportDownload(input: {
  prisma: ReportExportDownloadPrisma;
  workspaceId: string;
  reportId: string;
  exportId: string;
  now?: Date;
  readFile?: (storagePath: string) => Promise<Buffer>;
}): Promise<{ body: Buffer; contentType: string; filename: string } | null> {
  const exportFile = await input.prisma.exportFile.findFirst({
    where: {
      id: input.exportId,
      reportId: input.reportId,
      workspaceId: input.workspaceId,
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
  if (!exportFile || isExpired(exportFile.expiresAt, input.now ?? new Date())) {
    return null;
  }

  const fileType = parseReportExportFileType(exportFile.fileType);
  if (!fileType || !exportFile.report || !isWorkspaceExportPath(exportFile.storagePath, input.workspaceId, input.reportId)) {
    return null;
  }

  const body = await (input.readFile ?? readLocalExportFile)(exportFile.storagePath);
  return {
    body,
    contentType: reportExportContentType(fileType),
    filename: reportExportFilename(exportFile.report, fileType),
  };
}

async function readLocalExportFile(storagePath: string): Promise<Buffer> {
  return readFileFromDisk(path.join(process.cwd(), "outputs", "report_exports", storagePath));
}

function isExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

function isWorkspaceExportPath(storagePath: string, workspaceId: string, reportId: string): boolean {
  const expectedPrefix = `exports/${workspaceId}/${reportId}/`;
  const normalized = storagePath.replaceAll("\\", "/");
  return (
    normalized.startsWith(expectedPrefix) &&
    !normalized.includes("../") &&
    !path.isAbsolute(normalized)
  );
}
