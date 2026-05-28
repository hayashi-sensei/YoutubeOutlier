import { NextResponse } from "next/server";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getPrismaClient } from "@/lib/db/prisma";
import { parseReportExportFileType } from "@/lib/reports/export";
import {
  getReportExportDownload,
  type ReportExportDownloadPrisma,
} from "@/lib/reports/export-download";
import {
  requestReportExportDownloadForWorkspace,
  type ExportRequestPrisma,
} from "@/lib/reports/export-request";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL(`/sign-in?next=/app/reports/${reportId}`, request.url), 303);
  }

  const formData = await request.formData();
  const fileType = parseReportExportFileType(String(formData.get("fileType") ?? ""));
  if (!fileType) {
    return NextResponse.redirect(new URL(`/app/reports/${reportId}?error=EXPORT_REQUEST_FAILED`, request.url), 303);
  }

  const { workspaceId } = await bootstrapUserWorkspace(user);
  const prisma = getPrismaClient();
  let result;
  try {
    result = await requestReportExportDownloadForWorkspace({
      prisma: prisma as unknown as ExportRequestPrisma,
      workspaceId,
      reportId,
      fileType,
    });
  } catch {
    return NextResponse.redirect(new URL(`/app/reports/${reportId}?error=EXPORT_REQUEST_FAILED`, request.url), 303);
  }

  const exportId = result.downloadUrl ? exportIdFromDownloadUrl(result.downloadUrl) : null;
  if (!exportId) {
    return NextResponse.redirect(
      new URL(`/app/reports/${reportId}?export=${result.status}&format=${fileType}`, request.url),
      303,
    );
  }

  let download;
  try {
    download = await getReportExportDownload({
      prisma: prisma as unknown as ReportExportDownloadPrisma,
      workspaceId,
      reportId,
      exportId,
    });
  } catch {
    return NextResponse.redirect(new URL(`/app/reports/${reportId}?error=EXPORT_REQUEST_FAILED`, request.url), 303);
  }
  if (!download) {
    return NextResponse.redirect(new URL(`/app/reports/${reportId}?error=EXPORT_REQUEST_FAILED`, request.url), 303);
  }

  return new NextResponse(new Uint8Array(download.body), {
    headers: {
      "content-type": download.contentType,
      "content-disposition": `attachment; filename="${download.filename}"`,
      "cache-control": "private, no-store",
    },
  });
}

function exportIdFromDownloadUrl(downloadUrl: string): string | null {
  const match = downloadUrl.match(/\/exports\/([^/]+)\/download$/);
  return match?.[1] ?? null;
}
