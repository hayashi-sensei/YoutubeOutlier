"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserWorkspace } from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  backfillMissingWorkspaceOutlierScores,
  type MissingOutlierScoreBackfillPrisma,
} from "@/lib/outliers/backfill";

function redirectTo(url: string): never {
  redirect(url as never);
}

async function getWorkspaceId() {
  const { workspaceId } = await requireUserWorkspace("/app/outliers");
  return workspaceId;
}

export async function backfillMissingOutlierScores() {
  const workspaceId = await getWorkspaceId();
  const prisma = getPrismaClient();
  let summary: Awaited<ReturnType<typeof backfillMissingWorkspaceOutlierScores>>;

  try {
    summary = await backfillMissingWorkspaceOutlierScores({
      prisma: prisma as unknown as MissingOutlierScoreBackfillPrisma,
      workspaceId,
    });
  } catch {
    redirectTo("/app/outliers?error=OUTLIER_BACKFILL_FAILED");
  }

  revalidatePath("/app/dashboard");
  revalidatePath("/app/outliers");

  if (summary.channelsBackfilled === 0) {
    redirectTo("/app/outliers?backfill=none");
  }

  redirectTo(
    `/app/outliers?backfill=completed&channels=${summary.channelsBackfilled}&scores=${summary.opportunityScoresCreated}&skipped=${summary.skippedVideos}`,
  );
}
