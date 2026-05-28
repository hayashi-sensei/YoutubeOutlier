import { enqueueJob, type JobQueuePrisma } from "@/lib/jobs/queue";
import { JOB_TYPES } from "@/types/jobs";
import { parseReportExportFileType, type ReportExportFileType } from "./export";

export type ReportExportQueuePrisma = Partial<JobQueuePrisma> & {
  researchReport: {
    findFirst(input: {
      where: { id: string; workspaceId: string };
      select: { id: true; status: true };
    }): Promise<{ id: string; status: string } | null>;
  };
};

type ReportExportEnqueue = (
  prisma: ReportExportQueuePrisma,
  input: Parameters<typeof enqueueJob>[1],
) => ReturnType<typeof enqueueJob>;

export async function queueReportExportForWorkspace(input: {
  prisma: ReportExportQueuePrisma;
  workspaceId: string;
  reportId: string;
  fileType: ReportExportFileType | string;
  now?: Date;
  enqueue?: ReportExportEnqueue;
}): Promise<{ jobId: string; reused: boolean }> {
  const fileType = parseReportExportFileType(input.fileType);
  if (!fileType) {
    throw new Error("Unsupported report export file type.");
  }

  const report = await input.prisma.researchReport.findFirst({
    where: { id: input.reportId, workspaceId: input.workspaceId },
    select: { id: true, status: true },
  });
  if (!report) {
    throw new Error("Report was not found.");
  }
  if (report.status !== "COMPLETED") {
    throw new Error("Only completed reports can be exported.");
  }

  const queue = input.enqueue ?? ((prisma, jobInput) => enqueueJob(prisma as JobQueuePrisma, jobInput));
  const queued = await queue(input.prisma, {
    workspaceId: input.workspaceId,
    jobType: JOB_TYPES.exportGenerate,
    referenceType: "ResearchReport",
    referenceId: `${input.reportId}:${fileType}`,
    maxAttempts: 3,
    now: input.now,
    metadata: {
      workspaceId: input.workspaceId,
      reportId: input.reportId,
      fileType,
    },
  });

  return {
    jobId: queued.id,
    reused: queued.reused,
  };
}
