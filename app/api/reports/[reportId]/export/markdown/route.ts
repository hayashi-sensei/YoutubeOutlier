import { NextResponse } from "next/server";
import { getOptionalUserWorkspace } from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";
import { renderResearchReportMarkdown } from "@/lib/reports/export";
import { getWorkspaceResearchReportDetail } from "@/lib/reports/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  const context = await getOptionalUserWorkspace();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = context;
  const report = await getWorkspaceResearchReportDetail(getPrismaClient(), {
    workspaceId,
    reportId,
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const filename = `${slugify(report.title)}.md`;

  return new NextResponse(renderResearchReportMarkdown(report), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug.length > 0 ? slug : "research-report";
}
