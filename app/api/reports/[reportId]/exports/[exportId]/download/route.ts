import { NextResponse } from "next/server";
import { getOptionalUserWorkspace } from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  getReportExportDownload,
  type ReportExportDownloadPrisma,
} from "@/lib/reports/export-download";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string; exportId: string }> },
) {
  const { reportId, exportId } = await params;
  const context = await getOptionalUserWorkspace();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = context;
  const download = await getReportExportDownload({
    prisma: getPrismaClient() as unknown as ReportExportDownloadPrisma,
    workspaceId,
    reportId,
    exportId,
  });

  if (!download) {
    return NextResponse.json({ error: "Export not found or expired" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(download.body), {
    headers: {
      "content-type": download.contentType,
      "content-disposition": `attachment; filename="${download.filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
