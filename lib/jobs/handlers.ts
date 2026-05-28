import { JOB_TYPES, type JobHandler, type JobMetadata } from "@/types/jobs";
import {
  runYoutubeChannelBackfillJob,
  runYoutubeRecentRefreshJob,
  type YoutubeRunnerPrisma,
} from "@/lib/youtube/ingestion-runner";
import {
  runTranscriptFetchJob,
  type TranscriptRunnerPrisma,
} from "@/lib/transcripts/runner";
import {
  runIndustrySourceRefreshJob,
  type SourceRunnerPrisma,
} from "@/lib/sources/runner";
import {
  runOutlierScoreRefreshJob,
  type OutlierRunnerPrisma,
} from "@/lib/outliers/runner";
import {
  runCompetitorBlueprintAnalysisJob,
  type BlueprintRunnerPrisma,
} from "@/lib/blueprints/runner";
import {
  runTopicRecommendationJob,
  type TopicRecommendationRunnerPrisma,
} from "@/lib/recommendations/runner";
import {
  runResearchReportJob,
  type ResearchReportRunnerPrisma,
} from "@/lib/reports/runner";
import {
  runReportExportJob,
  type ReportExportRunnerPrisma,
} from "@/lib/reports/export-runner";
import {
  sendDailyReportEmail,
  sendExportReadyEmail,
  type EmailNotificationPrisma,
} from "@/lib/email/notifications";
import {
  expireStaleTopicRecommendations,
  type TopicRecommendationExpiryPrisma,
} from "@/lib/recommendations/expiry";
import {
  runProviderCostSnapshot,
  shouldSkipJobForQuotaPressure,
  type CostControlsPrisma,
} from "@/lib/cost-controls/quotas";
import { UnsupportedJobError } from "./worker";

export const backgroundJobHandlers: Record<string, JobHandler> = {
  [JOB_TYPES.youtubeChannelBackfill]: async ({ prisma, job, now }) => {
    const summary = await runYoutubeChannelBackfillJob({
      prisma: prisma as YoutubeRunnerPrisma,
      channelId: requiredReferenceId(job.metadata),
      jobRunId: job.id,
      now,
    });
    const scoringSummary = await runOutlierScoreRefreshJob({
      prisma: prisma as OutlierRunnerPrisma,
      channelId: requiredReferenceId(job.metadata),
      now,
    });
    return {
      youtube: summary as unknown as JobMetadata,
      scoring: scoringSummary as unknown as JobMetadata,
    };
  },
  [JOB_TYPES.youtubeRecentRefresh]: async ({ prisma, job, now }) => {
    const summary = await runYoutubeRecentRefreshJob({
      prisma: prisma as YoutubeRunnerPrisma,
      channelId: requiredReferenceId(job.metadata),
      jobRunId: job.id,
      now,
    });
    const scoringSummary = await runOutlierScoreRefreshJob({
      prisma: prisma as OutlierRunnerPrisma,
      channelId: requiredReferenceId(job.metadata),
      now,
    });
    return {
      youtube: summary as unknown as JobMetadata,
      scoring: scoringSummary as unknown as JobMetadata,
    };
  },
  [JOB_TYPES.outlierScoreRefresh]: async ({ prisma, job, now }) => {
    const pressureSkip = await shouldSkipJobForQuotaPressure(prisma as CostControlsPrisma, {
      jobType: JOB_TYPES.outlierScoreRefresh,
      now,
    });
    if (pressureSkip.skip) {
      return quotaPressureSkipMetadata(pressureSkip);
    }

    const summary = await runOutlierScoreRefreshJob({
      prisma: prisma as OutlierRunnerPrisma,
      channelId: requiredReferenceId(job.metadata),
      workspaceId: optionalWorkspaceId(job.metadata),
      now,
    });
    return summary as unknown as JobMetadata;
  },
  [JOB_TYPES.competitorBlueprintAnalyze]: async ({ prisma, job, now }) => {
    const pressureSkip = await shouldSkipJobForQuotaPressure(prisma as CostControlsPrisma, {
      jobType: JOB_TYPES.competitorBlueprintAnalyze,
      now,
    });
    if (pressureSkip.skip) {
      return quotaPressureSkipMetadata(pressureSkip);
    }

    const workspaceId = optionalWorkspaceId(job.metadata);
    if (!workspaceId) {
      throw new Error("competitor_blueprint_analyze requires metadata.workspaceId.");
    }

    const summary = await runCompetitorBlueprintAnalysisJob({
      prisma: prisma as BlueprintRunnerPrisma,
      workspaceId,
      youtubeChannelId: optionalYoutubeChannelId(job.metadata),
      now,
    });
    return summary as unknown as JobMetadata;
  },
  [JOB_TYPES.topicRecommendationGenerate]: async ({ prisma, job, now }) => {
    const pressureSkip = await shouldSkipJobForQuotaPressure(prisma as CostControlsPrisma, {
      jobType: JOB_TYPES.topicRecommendationGenerate,
      now,
    });
    if (pressureSkip.skip) {
      return quotaPressureSkipMetadata(pressureSkip);
    }

    const workspaceId = optionalWorkspaceId(job.metadata);
    if (!workspaceId) {
      throw new Error("topic_recommendation_generate requires metadata.workspaceId.");
    }

    const summary = await runTopicRecommendationJob({
      prisma: prisma as TopicRecommendationRunnerPrisma,
      workspaceId,
      reportId: optionalReportId(job.metadata),
      manualRun: false,
      now,
    });
    return summary as unknown as JobMetadata;
  },
  [JOB_TYPES.transcriptFetch]: async ({ prisma, job, now }) => {
    const summary = await runTranscriptFetchJob({
      prisma: prisma as TranscriptRunnerPrisma,
      videoId: requiredReferenceId(job.metadata),
      jobRunId: job.id,
      now,
    });
    return summary as unknown as JobMetadata;
  },
  [JOB_TYPES.industrySourceRefresh]: async ({ prisma, job, now }) => {
    const summary = await runIndustrySourceRefreshJob({
      prisma: prisma as SourceRunnerPrisma,
      sourceId: requiredReferenceId(job.metadata),
      jobRunId: job.id,
      now,
    });
    return summary as unknown as JobMetadata;
  },
  [JOB_TYPES.dailyReportGenerate]: async ({ prisma, job, now }) => {
    const pressureSkip = await shouldSkipJobForQuotaPressure(prisma as CostControlsPrisma, {
      jobType: JOB_TYPES.dailyReportGenerate,
      now,
    });
    if (pressureSkip.skip) {
      return quotaPressureSkipMetadata(pressureSkip);
    }

    const workspaceId = optionalWorkspaceId(job.metadata);
    if (!workspaceId) {
      throw new Error("daily_report_generate requires metadata.workspaceId.");
    }

    const settings = await dailyReportSettings(prisma, workspaceId);
    if (!settings?.dailyReportEnabled) {
      return {
        skipped: true,
        reason: "daily_reports_disabled",
        workspaceId,
      };
    }

    const summary = await runResearchReportJob({
      prisma: prisma as ResearchReportRunnerPrisma,
      workspaceId,
      reportId: optionalReportId(job.metadata),
      manualRun: false,
      now,
    });
    const email = await sendDailyReportEmail({
      prisma: prisma as EmailNotificationPrisma,
      workspaceId,
      reportId: summary.reportId,
    });
    return {
      ...(summary as unknown as JobMetadata),
      email: email as unknown as JobMetadata,
    } as unknown as JobMetadata;
  },
  [JOB_TYPES.manualReportGenerate]: async ({ prisma, job, now }) => {
    const workspaceId = optionalWorkspaceId(job.metadata);
    if (!workspaceId) {
      throw new Error("manual_report_generate requires metadata.workspaceId.");
    }

    const summary = await runResearchReportJob({
      prisma: prisma as ResearchReportRunnerPrisma,
      workspaceId,
      reportId: optionalReportId(job.metadata),
      manualRun: true,
      now,
    });
    return summary as unknown as JobMetadata;
  },
  [JOB_TYPES.topicRecommendationExpire]: async ({ prisma, now }) => {
    const summary = await expireStaleTopicRecommendations(
      prisma as TopicRecommendationExpiryPrisma,
      { now },
    );
    return {
      expired: summary.expired,
      cutoff: summary.cutoff.toISOString(),
    };
  },
  [JOB_TYPES.exportGenerate]: async ({ prisma, job, now }) => {
    const workspaceId = optionalWorkspaceId(job.metadata);
    const reportId = optionalReportId(job.metadata);
    const fileType = optionalExportFileType(job.metadata);
    if (!workspaceId || !reportId || !fileType) {
      throw new Error("export_generate requires metadata.workspaceId, metadata.reportId, and metadata.fileType.");
    }

    const summary = await runReportExportJob({
      prisma: prisma as ReportExportRunnerPrisma,
      workspaceId,
      reportId,
      fileType,
      now,
    });
    const email = await sendExportReadyEmail({
      prisma: prisma as EmailNotificationPrisma,
      workspaceId,
      exportId: summary.exportId,
    });
    return {
      ...(summary as unknown as JobMetadata),
      email: email as unknown as JobMetadata,
    } as unknown as JobMetadata;
  },
  [JOB_TYPES.providerCostSnapshot]: async ({ prisma, now }) => {
    return runProviderCostSnapshot(prisma as CostControlsPrisma, { now }) as unknown as JobMetadata;
  },
};

function requiredReferenceId(metadata: JobMetadata): string {
  const referenceId = metadata.referenceId;

  if (typeof referenceId !== "string" || referenceId.length === 0) {
    throw new Error("Queued job is missing metadata.referenceId.");
  }

  return referenceId;
}

function optionalWorkspaceId(metadata: JobMetadata): string | undefined {
  const workspaceId = metadata.workspaceId;

  if (typeof workspaceId === "string" && workspaceId.length > 0) {
    return workspaceId;
  }

  return undefined;
}

function optionalYoutubeChannelId(metadata: JobMetadata): string | undefined {
  const youtubeChannelId = metadata.youtubeChannelId;

  if (typeof youtubeChannelId === "string" && youtubeChannelId.length > 0) {
    return youtubeChannelId;
  }

  const referenceId = metadata.referenceId;
  if (typeof referenceId === "string" && referenceId.length > 0) {
    return referenceId;
  }

  return undefined;
}

function optionalReportId(metadata: JobMetadata): string | undefined {
  const reportId = metadata.reportId;

  if (typeof reportId === "string" && reportId.length > 0) {
    return reportId;
  }

  return undefined;
}

function optionalExportFileType(metadata: JobMetadata): "pdf" | "docx" | undefined {
  const fileType = metadata.fileType;

  if (fileType === "pdf" || fileType === "docx") {
    return fileType;
  }

  return undefined;
}

function quotaPressureSkipMetadata(input: {
  reason: string;
  jobType: string;
  totalCostUsd?: number;
  thresholdUsd?: number;
  usedUnits?: number;
  dailyLimit?: number;
  pressureRatio?: number;
  thresholdRatio?: number;
}): JobMetadata {
  const metadata: JobMetadata = {
    skipped: true,
    reason: input.reason,
    jobType: input.jobType,
  };
  if (typeof input.totalCostUsd === "number") {
    metadata.totalCostUsd = input.totalCostUsd;
  }
  if (typeof input.thresholdUsd === "number") {
    metadata.thresholdUsd = input.thresholdUsd;
  }
  if (typeof input.usedUnits === "number") {
    metadata.usedUnits = input.usedUnits;
  }
  if (typeof input.dailyLimit === "number") {
    metadata.dailyLimit = input.dailyLimit;
  }
  if (typeof input.pressureRatio === "number") {
    metadata.pressureRatio = input.pressureRatio;
  }
  if (typeof input.thresholdRatio === "number") {
    metadata.thresholdRatio = input.thresholdRatio;
  }
  return metadata;
}

async function dailyReportSettings(prisma: unknown, workspaceId: string): Promise<{ dailyReportEnabled: boolean } | null> {
  const client = prisma as {
    workspaceSettings?: {
      findUnique(input: {
        where: { workspaceId: string };
        select: { dailyReportEnabled: true };
      }): Promise<{ dailyReportEnabled: boolean } | null>;
    };
  };

  if (!client.workspaceSettings) {
    throw new Error("daily_report_generate requires workspace settings access.");
  }

  return client.workspaceSettings.findUnique({
    where: { workspaceId },
    select: { dailyReportEnabled: true },
  });
}

function unsupportedJobHandler(jobType: string): JobHandler {
  return async () => {
    throw new UnsupportedJobError(`${jobType} is queued but not implemented in this spec.`);
  };
}
