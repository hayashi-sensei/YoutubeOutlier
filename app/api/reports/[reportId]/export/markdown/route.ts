import { NextResponse } from "next/server";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getPrismaClient } from "@/lib/db/prisma";
import { renderResearchReportMarkdown } from "@/lib/reports/export";
import { getWorkspaceResearchReportDetail } from "@/lib/reports/queries";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await bootstrapUserWorkspace(user);
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
