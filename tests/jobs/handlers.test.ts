import { describe, expect, test, vi } from "vitest";

vi.mock("../../lib/youtube/ingestion-runner", () => ({
  runYoutubeChannelBackfillJob: vi.fn(async () => ({
    videosUpserted: 3,
  })),
  runYoutubeRecentRefreshJob: vi.fn(async () => ({
    videosUpserted: 1,
  })),
}));

vi.mock("../../lib/outliers/runner", () => ({
  runOutlierScoreRefreshJob: vi.fn(async () => ({
    channelId: "channel-1",
    videosEvaluated: 3,
    outlierScoresCreated: 3,
    opportunityScoresCreated: 1,
    skippedVideos: 0,
  })),
}));

vi.mock("../../lib/blueprints/runner", () => ({
  runCompetitorBlueprintAnalysisJob: vi.fn(async () => ({
    workspaceId: "workspace-1",
    channelsEvaluated: 1,
    blueprintsCreated: 1,
    blueprintsUpdated: 0,
    channelsSkipped: 0,
  })),
}));

vi.mock("../../lib/recommendations/runner", () => ({
  runTopicRecommendationJob: vi.fn(async () => ({
    workspaceId: "workspace-1",
    reportId: "report-1",
    recommendationsCreated: 5,
    evidenceCreated: 7,
  })),
}));

vi.mock("../../lib/reports/runner", () => ({
  runResearchReportJob: vi.fn(async () => ({
    workspaceId: "workspace-1",
    reportId: "report-report",
    manualRun: true,
    windowStart: new Date("2026-05-17T00:00:00Z"),
    windowEnd: new Date("2026-05-18T00:00:00Z"),
    competitorUploadsIncluded: 2,
    industryNewsIncluded: 1,
  })),
}));

vi.mock("../../lib/reports/export-runner", () => ({
  runReportExportJob: vi.fn(async () => ({
    workspaceId: "workspace-1",
    reportId: "report-1",
    exportId: "export-1",
    fileType: "pdf",
    storagePath: "exports/workspace-1/report-1/export-1.pdf",
    expiresAt: "2026-05-26T00:00:00.000Z",
  })),
}));

vi.mock("../../lib/email/notifications", () => ({
  sendDailyReportEmail: vi.fn(async () => ({
    status: "SENT",
    providerId: "email-1",
    errorMessage: null,
  })),
  sendExportReadyEmail: vi.fn(async () => ({
    status: "SENT",
    providerId: "email-2",
    errorMessage: null,
  })),
}));

vi.mock("../../lib/recommendations/expiry", () => ({
  expireStaleTopicRecommendations: vi.fn(async () => ({
    cutoff: new Date("2026-03-19T00:00:00Z"),
    expired: 4,
  })),
}));

vi.mock("../../lib/cost-controls/quotas", () => ({
  runProviderCostSnapshot: vi.fn(async () => ({
    aiSpend: { totalCostUsd: 6, thresholdUsd: 5 },
    youtubeQuota: { usedUnits: 8800, dailyLimit: 9000, pressureRatio: 0.97 },
    alertsCreated: ["cost_control.provider_spend_alert"],
    userTaskCosts: [],
  })),
  shouldSkipJobForQuotaPressure: vi.fn(async () => ({ skip: false })),
}));

import {
  runYoutubeChannelBackfillJob,
  runYoutubeRecentRefreshJob,
} from "../../lib/youtube/ingestion-runner";
import { runOutlierScoreRefreshJob } from "../../lib/outliers/runner";
import { runCompetitorBlueprintAnalysisJob } from "../../lib/blueprints/runner";
import { runTopicRecommendationJob } from "../../lib/recommendations/runner";
import { runResearchReportJob } from "../../lib/reports/runner";
import { runReportExportJob } from "../../lib/reports/export-runner";
import { sendDailyReportEmail, sendExportReadyEmail } from "../../lib/email/notifications";
import { expireStaleTopicRecommendations } from "../../lib/recommendations/expiry";
import {
  runProviderCostSnapshot,
  shouldSkipJobForQuotaPressure,
} from "../../lib/cost-controls/quotas";
import { backgroundJobHandlers } from "../../lib/jobs/handlers";

const NOW = new Date("2026-05-18T00:00:00Z");

describe("backgroundJobHandlers", () => {
  test("scores outliers after YouTube backfill succeeds", async () => {
    const prisma = {};

    const result = await backgroundJobHandlers.youtube_channel_backfill?.({
      prisma,
      now: NOW,
      job: {
        id: "job-1",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 3,
        metadata: {
          referenceId: "channel-1",
        },
      },
    });

    expect(runYoutubeChannelBackfillJob).toHaveBeenCalledWith({
      prisma,
      channelId: "channel-1",
      jobRunId: "job-1",
      now: NOW,
    });
    expect(runOutlierScoreRefreshJob).toHaveBeenCalledWith({
      prisma,
      channelId: "channel-1",
      now: NOW,
    });
    expect(result).toEqual({
      youtube: { videosUpserted: 3 },
      scoring: {
        channelId: "channel-1",
        videosEvaluated: 3,
        outlierScoresCreated: 3,
        opportunityScoresCreated: 1,
        skippedVideos: 0,
      },
    });
  });

  test("scores outliers after YouTube recent refresh succeeds", async () => {
    const prisma = {};

    await backgroundJobHandlers.youtube_recent_refresh?.({
      prisma,
      now: NOW,
      job: {
        id: "job-2",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 3,
        metadata: {
          referenceId: "channel-1",
        },
      },
    });

    expect(runYoutubeRecentRefreshJob).toHaveBeenCalledWith({
      prisma,
      channelId: "channel-1",
      jobRunId: "job-2",
      now: NOW,
    });
    expect(runOutlierScoreRefreshJob).toHaveBeenCalledWith({
      prisma,
      channelId: "channel-1",
      now: NOW,
    });
  });

  test("analyzes competitor blueprints for a workspace and channel", async () => {
    const prisma = {};

    const result = await backgroundJobHandlers.competitor_blueprint_analyze?.({
      prisma,
      now: NOW,
      job: {
        id: "job-3",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 3,
        metadata: {
          workspaceId: "workspace-1",
          youtubeChannelId: "channel-1",
        },
      },
    });

    expect(runCompetitorBlueprintAnalysisJob).toHaveBeenCalledWith({
      prisma,
      workspaceId: "workspace-1",
      youtubeChannelId: "channel-1",
      now: NOW,
    });
    expect(result).toEqual({
      workspaceId: "workspace-1",
      channelsEvaluated: 1,
      blueprintsCreated: 1,
      blueprintsUpdated: 0,
      channelsSkipped: 0,
    });
  });

  test("keeps topic recommendation jobs separate from daily and manual reports", async () => {
    const prisma = {
      workspaceSettings: {
        findUnique: vi.fn(async () => ({ dailyReportEnabled: true })),
      },
    };

    const topicResult = await backgroundJobHandlers.topic_recommendation_generate?.({
      prisma,
      now: NOW,
      job: {
        id: "job-topic",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 3,
        metadata: {
          workspaceId: "workspace-1",
          reportId: "report-1",
        },
      },
    });
    const manualResult = await backgroundJobHandlers.manual_report_generate?.({
      prisma,
      now: NOW,
      job: {
        id: "job-manual",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 3,
        metadata: {
          workspaceId: "workspace-1",
          reportId: "report-2",
        },
      },
    });
    const dailyResult = await backgroundJobHandlers.daily_report_generate?.({
      prisma,
      now: NOW,
      job: {
        id: "job-daily",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 3,
        metadata: {
          workspaceId: "workspace-1",
        },
      },
    });

    expect(runTopicRecommendationJob).toHaveBeenCalledTimes(1);
    expect(runTopicRecommendationJob).toHaveBeenCalledWith({
      prisma,
      workspaceId: "workspace-1",
      reportId: "report-1",
      manualRun: false,
      now: NOW,
    });
    expect(runResearchReportJob).toHaveBeenNthCalledWith(1, {
      prisma,
      workspaceId: "workspace-1",
      reportId: "report-2",
      manualRun: true,
      now: NOW,
    });
    expect(runResearchReportJob).toHaveBeenNthCalledWith(2, {
      prisma,
      workspaceId: "workspace-1",
      manualRun: false,
      now: NOW,
    });
    expect(sendDailyReportEmail).toHaveBeenCalledWith({
      prisma,
      workspaceId: "workspace-1",
      reportId: "report-report",
    });
    expect(topicResult).toEqual({
      workspaceId: "workspace-1",
      reportId: "report-1",
      recommendationsCreated: 5,
      evidenceCreated: 7,
    });
    expect(manualResult).toEqual({
      workspaceId: "workspace-1",
      reportId: "report-report",
      manualRun: true,
      windowStart: new Date("2026-05-17T00:00:00Z"),
      windowEnd: new Date("2026-05-18T00:00:00Z"),
      competitorUploadsIncluded: 2,
      industryNewsIncluded: 1,
    });
    expect(dailyResult).toEqual({
      workspaceId: "workspace-1",
      reportId: "report-report",
      manualRun: true,
      windowStart: new Date("2026-05-17T00:00:00Z"),
      windowEnd: new Date("2026-05-18T00:00:00Z"),
      competitorUploadsIncluded: 2,
      industryNewsIncluded: 1,
      email: {
        status: "SENT",
        providerId: "email-1",
        errorMessage: null,
      },
    });
  });

  test("does not run a daily report job after daily reports are disabled", async () => {
    vi.clearAllMocks();
    const prisma = {
      workspaceSettings: {
        findUnique: vi.fn(async () => ({ dailyReportEnabled: false })),
      },
    };

    const result = await backgroundJobHandlers.daily_report_generate?.({
      prisma,
      now: NOW,
      job: {
        id: "job-daily-disabled",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 3,
        metadata: {
          workspaceId: "workspace-1",
        },
      },
    });

    expect(prisma.workspaceSettings.findUnique).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1" },
      select: { dailyReportEnabled: true },
    });
    expect(runResearchReportJob).not.toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        manualRun: false,
      }),
    );
    expect(sendDailyReportEmail).not.toHaveBeenCalled();
    expect(result).toEqual({
      skipped: true,
      reason: "daily_reports_disabled",
      workspaceId: "workspace-1",
    });
  });

  test("degrades standalone outlier scoring under quota pressure", async () => {
    vi.clearAllMocks();
    vi.mocked(shouldSkipJobForQuotaPressure).mockResolvedValueOnce({
      skip: true,
      reason: "youtube_quota_pressure",
      jobType: "outlier_score_refresh",
      usedUnits: 8500,
      dailyLimit: 9000,
      pressureRatio: 0.94,
      thresholdRatio: 0.9,
    });
    const prisma = {};

    const result = await backgroundJobHandlers.outlier_score_refresh?.({
      prisma,
      now: NOW,
      job: {
        id: "job-outlier-pressure",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 3,
        metadata: {
          referenceId: "channel-1",
          workspaceId: "workspace-1",
        },
      },
    });

    expect(shouldSkipJobForQuotaPressure).toHaveBeenCalledWith(prisma, {
      jobType: "outlier_score_refresh",
      now: NOW,
    });
    expect(runOutlierScoreRefreshJob).not.toHaveBeenCalled();
    expect(result).toEqual({
      skipped: true,
      reason: "youtube_quota_pressure",
      jobType: "outlier_score_refresh",
      usedUnits: 8500,
      dailyLimit: 9000,
      pressureRatio: 0.94,
      thresholdRatio: 0.9,
    });
  });

  test("degrades noncritical daily report jobs under quota pressure", async () => {
    vi.clearAllMocks();
    vi.mocked(shouldSkipJobForQuotaPressure).mockResolvedValueOnce({
      skip: true,
      reason: "daily_ai_spend_threshold_reached",
      jobType: "daily_report_generate",
      totalCostUsd: 5,
      thresholdUsd: 5,
    });
    const prisma = {
      workspaceSettings: {
        findUnique: vi.fn(async () => ({ dailyReportEnabled: true })),
      },
    };

    const result = await backgroundJobHandlers.daily_report_generate?.({
      prisma,
      now: NOW,
      job: {
        id: "job-daily-pressure",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 3,
        metadata: {
          workspaceId: "workspace-1",
        },
      },
    });

    expect(shouldSkipJobForQuotaPressure).toHaveBeenCalledWith(prisma, {
      jobType: "daily_report_generate",
      now: NOW,
    });
    expect(prisma.workspaceSettings.findUnique).not.toHaveBeenCalled();
    expect(runResearchReportJob).not.toHaveBeenCalled();
    expect(sendDailyReportEmail).not.toHaveBeenCalled();
    expect(result).toEqual({
      skipped: true,
      reason: "daily_ai_spend_threshold_reached",
      jobType: "daily_report_generate",
      totalCostUsd: 5,
      thresholdUsd: 5,
    });
  });

  test("expires stale untouched topic recommendations", async () => {
    const prisma = {};

    const result = await backgroundJobHandlers.topic_recommendation_expire?.({
      prisma,
      now: NOW,
      job: {
        id: "job-expire",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 3,
        metadata: {},
      },
    });

    expect(expireStaleTopicRecommendations).toHaveBeenCalledWith(prisma, { now: NOW });
    expect(result).toEqual({
      expired: 4,
      cutoff: "2026-03-19T00:00:00.000Z",
    });
  });

  test("generates report exports through the export runner", async () => {
    const prisma = {};

    const result = await backgroundJobHandlers.export_generate?.({
      prisma,
      now: NOW,
      job: {
        id: "job-export",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 3,
        metadata: {
          workspaceId: "workspace-1",
          reportId: "report-1",
          fileType: "pdf",
        },
      },
    });

    expect(runReportExportJob).toHaveBeenCalledWith({
      prisma,
      workspaceId: "workspace-1",
      reportId: "report-1",
      fileType: "pdf",
      now: NOW,
    });
    expect(sendExportReadyEmail).toHaveBeenCalledWith({
      prisma,
      workspaceId: "workspace-1",
      exportId: "export-1",
    });
    expect(result).toEqual({
      workspaceId: "workspace-1",
      reportId: "report-1",
      exportId: "export-1",
      fileType: "pdf",
      storagePath: "exports/workspace-1/report-1/export-1.pdf",
      expiresAt: "2026-05-26T00:00:00.000Z",
      email: {
        status: "SENT",
        providerId: "email-2",
        errorMessage: null,
      },
    });
  });

  test("runs provider cost snapshots and returns alert metadata", async () => {
    const prisma = {};

    const result = await backgroundJobHandlers.provider_cost_snapshot?.({
      prisma,
      now: NOW,
      job: {
        id: "job-cost-snapshot",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 3,
        metadata: {},
      },
    });

    expect(runProviderCostSnapshot).toHaveBeenCalledWith(prisma, { now: NOW });
    expect(result).toEqual({
      aiSpend: { totalCostUsd: 6, thresholdUsd: 5 },
      youtubeQuota: { usedUnits: 8800, dailyLimit: 9000, pressureRatio: 0.97 },
      alertsCreated: ["cost_control.provider_spend_alert"],
      userTaskCosts: [],
    });
  });
});
