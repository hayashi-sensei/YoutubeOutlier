"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  backfillMissingWorkspaceOutlierScores,
  type MissingOutlierScoreBackfillPrisma,
} from "@/lib/outliers/backfill";
import { createClient } from "@/lib/supabase/server";

function redirectTo(url: string): never {
  redirect(url as never);
}

async function getWorkspaceId() {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirectTo("/sign-in");
  }

  const { workspaceId } = await bootstrapUserWorkspace(supabaseUser);
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
