"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  deleteFailedWorkspaceResearchReports,
  deleteWorkspaceResearchReport,
  type ResearchReportDeletionPrisma,
} from "@/lib/reports/deletion";
import { generateManualReportForWorkspace } from "@/lib/reports/manual";
import { createClient } from "@/lib/supabase/server";

function redirectTo(url: string): never {
  redirect(url as never);
}

export async function generateManualResearchReport() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirectTo("/sign-in");
  }

  const { user: appUser, workspaceId } = await bootstrapUserWorkspace(user);
  const prisma = getPrismaClient();

  let summary;
  try {
    summary = await generateManualReportForWorkspace({
      prisma,
      workspaceId,
      userId: appUser.id,
    });
  } catch {
    revalidateReportPaths();
    redirectTo("/app/reports?error=REPORT_GENERATION_FAILED");
  }

  revalidateReportPaths();
  redirectTo(`/app/reports/${summary.reportId}?generated=1&uploads=${summary.competitorUploadsIncluded}&news=${summary.industryNewsIncluded}`);
}

export async function deleteResearchReport(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirectTo("/sign-in");
  }

  const reportId = String(formData.get("reportId") ?? "").trim();

  if (!reportId) {
    redirectTo("/app/reports?error=REPORT_DELETE_FAILED");
  }

  const { workspaceId } = await bootstrapUserWorkspace(user);
  const prisma = getPrismaClient();
  const result = await deleteWorkspaceResearchReport(prisma as unknown as ResearchReportDeletionPrisma, {
    workspaceId,
    reportId,
  });

  revalidateReportPaths();
  redirectTo(result.deleted ? "/app/reports?deleted=1" : "/app/reports?error=REPORT_NOT_FOUND");
}

export async function deleteFailedResearchReports() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirectTo("/sign-in");
  }

  const { workspaceId } = await bootstrapUserWorkspace(user);
  const prisma = getPrismaClient();
  const result = await deleteFailedWorkspaceResearchReports(prisma as unknown as ResearchReportDeletionPrisma, {
    workspaceId,
  });

  revalidateReportPaths();
  redirectTo(`/app/reports?failedDeleted=${result.deletedCount}`);
}

function revalidateReportPaths(): void {
  revalidatePath("/app/dashboard");
  revalidatePath("/app/reports");
  revalidatePath("/app/topic-ideas");
}
