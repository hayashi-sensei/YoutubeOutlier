import { backgroundJobHandlers } from "@/lib/jobs/handlers";
import { processJobBatch, type JobBatchSummary, type JobWorkerPrisma } from "@/lib/jobs/worker";
import { JOB_TYPES, type JobMetadata } from "@/types/jobs";
import {
  reportExportDownloadUrl,
  type ReportExportFileType,
} from "./export";
import {
  queueReportExportForWorkspace,
  type ReportExportQueuePrisma,
} from "./export-queue";

type ExportRequestStatus = "ready" | "queued" | "already_queued" | "failed";

export type ExportRequestPrisma = ReportExportQueuePrisma & JobWorkerPrisma & {
  jobRun: ReportExportQueuePrisma["jobRun"] & JobWorkerPrisma["jobRun"] & {
    findUnique(input: {
      where: { id: string };
      select: {
        id: true;
        status: true;
        metadata: true;
        errorMessage: true;
      };
    }): Promise<{
      id: string;
      status: string;
      metadata: unknown;
      errorMessage: string | null;
    } | null>;
  };
};

type ExportRequestResult = {
  status: ExportRequestStatus;
  fileType: ReportExportFileType;
  jobId: string;
  downloadUrl: string | null;
};

export async function requestReportExportDownloadForWorkspace(input: {
  prisma: ExportRequestPrisma;
  workspaceId: string;
  reportId: string;
  fileType: ReportExportFileType;
  now?: Date;
  enqueue?: Parameters<typeof queueReportExportForWorkspace>[0]["enqueue"];
  processJobs?: (input: {
    prisma: ExportRequestPrisma;
    limit: number;
    now?: Date;
    only: {
      jobType: string;
      referenceType: string;
      referenceId: string;
    };
  }) => Promise<JobBatchSummary>;
}): Promise<ExportRequestResult> {
  const queued = await queueReportExportForWorkspace({
    prisma: input.prisma,
    workspaceId: input.workspaceId,
    reportId: input.reportId,
    fileType: input.fileType,
    now: input.now,
    enqueue: input.enqueue,
  });
  const only = {
    jobType: JOB_TYPES.exportGenerate,
    referenceType: "ResearchReport",
    referenceId: `${input.reportId}:${input.fileType}`,
  };
  const processJobs = input.processJobs ?? ((workerInput) =>
    processJobBatch({
      prisma: workerInput.prisma,
      handlers: backgroundJobHandlers,
      limit: workerInput.limit,
      now: workerInput.now,
      only: workerInput.only,
    }));
  const processed = await processJobs({
    prisma: input.prisma,
    limit: 1,
    now: input.now,
    only,
  });
  const job = await input.prisma.jobRun.findUnique({
    where: { id: queued.jobId },
    select: {
      id: true,
      status: true,
      metadata: true,
      errorMessage: true,
    },
  });
  const exportId = exportIdFromMetadata(job?.metadata);

  if (processed.succeeded > 0 && exportId) {
    return {
      status: "ready",
      fileType: input.fileType,
      jobId: queued.jobId,
      downloadUrl: reportExportDownloadUrl({ reportId: input.reportId, exportId }),
    };
  }

  if (processed.failed > 0 || job?.status === "FAILED") {
    return {
      status: "failed",
      fileType: input.fileType,
      jobId: queued.jobId,
      downloadUrl: null,
    };
  }

  return {
    status: queued.reused ? "already_queued" : "queued",
    fileType: input.fileType,
    jobId: queued.jobId,
    downloadUrl: null,
  };
}

function exportIdFromMetadata(metadata: unknown): string | null {
  if (!isRecord(metadata) || !isRecord(metadata.summary)) {
    return null;
  }

  return typeof metadata.summary.exportId === "string" ? metadata.summary.exportId : null;
}

function isRecord(value: unknown): value is JobMetadata {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
