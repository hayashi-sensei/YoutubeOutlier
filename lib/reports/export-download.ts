import {
  parseReportExportFileType,
  reportExportContentType,
  reportExportFilename,
  type ReportExportFileType,
} from "./export";
import { assertObjectKeyHasPrefix, getStorageAdapter, type StorageAdapter } from "@/lib/storage";

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
  storage?: StorageAdapter;
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

  const body = (await (input.storage ?? getStorageAdapter()).getObject({ key: exportFile.storagePath })).body;
  return {
    body,
    contentType: reportExportContentType(fileType),
    filename: reportExportFilename(exportFile.report, fileType),
  };
}

function isExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

function isWorkspaceExportPath(storagePath: string, workspaceId: string, reportId: string): boolean {
  try {
    assertObjectKeyHasPrefix(storagePath, `exports/${workspaceId}/${reportId}/`);
    return true;
  } catch {
    return false;
  }
}
