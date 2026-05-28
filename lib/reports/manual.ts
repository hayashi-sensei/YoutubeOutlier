import {
  deductCreditsForTask,
  type CreditTransactionClient,
} from "@/lib/billing/credits";
import {
  runResearchReportJob,
  type ResearchReportRunSummary,
  type ResearchReportRunnerPrisma,
} from "@/lib/reports/runner";

export const MANUAL_RESEARCH_REPORT_CREDITS = 1;

type ManualReportCreditDeductor = (
  prisma: unknown,
  input: {
    workspaceId: string;
    userId: string;
    taskType: string;
    credits: number;
    referenceType: string;
    referenceId: string | null;
  },
) => Promise<unknown>;

type ManualReportRunner = (input: {
  prisma: unknown;
  workspaceId: string;
  userId: string;
  manualRun: true;
  now?: Date;
}) => Promise<ResearchReportRunSummary>;

export async function generateManualReportForWorkspace(input: {
  prisma: unknown;
  workspaceId: string;
  userId: string;
  now?: Date;
  creditDeductor?: ManualReportCreditDeductor;
  reportRunner?: ManualReportRunner;
}): Promise<ResearchReportRunSummary> {
  const creditDeductor = input.creditDeductor ?? defaultCreditDeductor;
  const reportRunner = input.reportRunner ?? defaultReportRunner;

  await creditDeductor(input.prisma, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    taskType: "manual_report_generate",
    credits: MANUAL_RESEARCH_REPORT_CREDITS,
    referenceType: "ResearchReport",
    referenceId: null,
  });

  return reportRunner({
    prisma: input.prisma,
    workspaceId: input.workspaceId,
    userId: input.userId,
    manualRun: true,
    now: input.now,
  });
}

async function defaultCreditDeductor(
  prisma: unknown,
  input: Parameters<ManualReportCreditDeductor>[1],
): Promise<unknown> {
  return deductCreditsForTask(prisma as CreditTransactionClient, input);
}

async function defaultReportRunner(input: Parameters<ManualReportRunner>[0]) {
  return runResearchReportJob({
    prisma: input.prisma as ResearchReportRunnerPrisma,
    workspaceId: input.workspaceId,
    userId: input.userId,
    manualRun: true,
    now: input.now,
  });
}
