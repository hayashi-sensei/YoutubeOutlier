import { NextResponse } from "next/server";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  getReportExportDownload,
  type ReportExportDownloadPrisma,
} from "@/lib/reports/export-download";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string; exportId: string }> },
) {
  const { reportId, exportId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await bootstrapUserWorkspace(user);
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
