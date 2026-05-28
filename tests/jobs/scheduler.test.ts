import { describe, expect, test, vi } from "vitest";

import {
  scheduleDueBackgroundJobs,
  type JobSchedulerPrisma,
} from "../../lib/jobs/scheduler";

const NOW = new Date("2026-05-18T03:00:00Z");

describe("scheduleDueBackgroundJobs", () => {
  test("queues active refresh work and daily reports only for enabled workspaces", async () => {
    const prisma = createSchedulerPrisma();

    const summary = await scheduleDueBackgroundJobs(prisma, { now: NOW });

    expect(summary).toEqual({
      youtubeRecentRefresh: 1,
      industrySourceRefresh: 1,
      transcriptFetch: 1,
      dailyReportGenerate: 1,
      competitorBlueprintAnalyze: 1,
      topicRecommendationExpire: 1,
      providerCostSnapshot: 1,
    });
    expect(prisma.jobRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobType: "youtube_recent_refresh",
          referenceType: "YoutubeChannel",
          referenceId: "channel-1",
        }),
      }),
    );
    expect(prisma.jobRun.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobType: "outlier_score_refresh",
        }),
      }),
    );
    expect(prisma.jobRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobType: "topic_recommendation_expire",
          referenceType: "TopicRecommendation",
          referenceId: "expire:2026-05-18",
          metadata: expect.objectContaining({
            scheduledReason: "topic_recommendation_expiry",
            expiryDays: 60,
          }),
        }),
      }),
    );
    expect(prisma.jobRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobType: "provider_cost_snapshot",
          referenceType: "ProviderCostSnapshot",
          referenceId: "provider-cost:2026-05-18",
          metadata: expect.objectContaining({
            scheduledReason: "daily_provider_cost_snapshot",
            snapshotDate: "2026-05-18",
          }),
        }),
      }),
    );
    expect(prisma.jobRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobType: "competitor_blueprint_analyze",
          referenceType: "CompetitorBlueprint",
          referenceId: "workspace-1:channel-1",
          metadata: expect.objectContaining({
            scheduledReason: "tracked_channel_blueprint_analysis",
            workspaceId: "workspace-1",
            youtubeChannelId: "channel-1",
          }),
        }),
      }),
    );
    expect(prisma.jobRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobType: "daily_report_generate",
          referenceType: "WorkspaceDailyReport",
          referenceId: "workspace-enabled:2026-05-18",
          metadata: expect.objectContaining({
            workspaceId: "workspace-enabled",
            reportDate: "2026-05-18",
          }),
        }),
      }),
    );
    expect(prisma.jobRun.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobType: "daily_report_generate",
          referenceId: "workspace-disabled:2026-05-18",
        }),
      }),
    );
  });

  test("does not queue another daily report after one already succeeded for the same local day", async () => {
    const prisma = createSchedulerPrisma({
      existingJobs: [
        {
          jobType: "daily_report_generate",
          referenceType: "WorkspaceDailyReport",
          referenceId: "workspace-enabled:2026-05-18",
          status: "SUCCEEDED",
        },
      ],
    });

    const summary = await scheduleDueBackgroundJobs(prisma, { now: NOW });
    const dailyCreates = prisma.jobRun.create.mock.calls.filter(
      ([input]) => input.data.jobType === "daily_report_generate",
    );

    expect(summary.dailyReportGenerate).toBe(0);
    expect(summary.providerCostSnapshot).toBe(1);
    expect(dailyCreates).toHaveLength(0);
  });

  test("does not schedule separate scoring jobs because refresh handlers score after ingestion", async () => {
    const prisma = createSchedulerPrisma({
      trackedChannels: [
        {
          workspaceId: "workspace-1",
          channel: {
            id: "shared-channel",
            lastFetchedAt: new Date("2026-05-18T00:00:00Z"),
          },
        },
        {
          workspaceId: "workspace-2",
          channel: {
            id: "shared-channel",
            lastFetchedAt: new Date("2026-05-18T00:00:00Z"),
          },
        },
      ],
    });

    const summary = await scheduleDueBackgroundJobs(prisma, { now: NOW });
    const scoringCreateCalls = prisma.jobRun.create.mock.calls.filter(
      ([input]) => input.data.jobType === "outlier_score_refresh",
    );

    expect(summary.youtubeRecentRefresh).toBe(1);
    expect(summary.competitorBlueprintAnalyze).toBe(2);
    expect(summary.topicRecommendationExpire).toBe(1);
    expect(summary.providerCostSnapshot).toBe(1);
    expect(scoringCreateCalls).toHaveLength(0);
  });

  test("does not queue another provider cost snapshot after one already succeeded for the same UTC day", async () => {
    const prisma = createSchedulerPrisma({
      existingJobs: [
        {
          jobType: "provider_cost_snapshot",
          referenceType: "ProviderCostSnapshot",
          referenceId: "provider-cost:2026-05-18",
          status: "SUCCEEDED",
        },
      ],
    });

    const summary = await scheduleDueBackgroundJobs(prisma, { now: NOW });
    const snapshotCreates = prisma.jobRun.create.mock.calls.filter(
      ([input]) => input.data.jobType === "provider_cost_snapshot",
    );

    expect(summary.providerCostSnapshot).toBe(0);
    expect(snapshotCreates).toHaveLength(0);
  });

  test("bounds scheduler discovery for more than 1,000 due workspaces", async () => {
    const trackedChannels = Array.from({ length: 1_200 }, (_, index) => ({
      workspaceId: `workspace-${index}`,
      channel: {
        id: `channel-${index}`,
        lastFetchedAt: new Date("2026-05-17T00:00:00Z"),
      },
    }));
    const dailyReportSettings = Array.from({ length: 1_200 }, (_, index) => ({
      workspaceId: `workspace-${index}`,
      timezone: "UTC",
    }));
    const prisma = createSchedulerPrisma({
      trackedChannels,
      dailyReportSettings,
      industrySources: [],
      transcriptVideos: [],
    });

    const summary = await scheduleDueBackgroundJobs(prisma, {
      now: NOW,
      limits: {
        trackedChannels: 25,
        industrySources: 10,
        transcriptVideos: 10,
        dailyReportWorkspaces: 30,
      },
    });

    expect(prisma.trackedChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25 }),
    );
    expect(prisma.workspaceSettings.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 30 }),
    );
    expect(summary.youtubeRecentRefresh).toBe(25);
    expect(summary.competitorBlueprintAnalyze).toBe(25);
    expect(summary.dailyReportGenerate).toBe(30);
  });

  test("continues daily report discovery when the first bounded page already succeeded", async () => {
    const dailyReportSettings = Array.from({ length: 6 }, (_, index) => ({
      workspaceId: `workspace-${index}`,
      timezone: "UTC",
    }));
    const prisma = createSchedulerPrisma({
      trackedChannels: [],
      industrySources: [],
      transcriptVideos: [],
      dailyReportSettings,
      existingJobs: dailyReportSettings.slice(0, 3).map((settings) => ({
        jobType: "daily_report_generate",
        referenceType: "WorkspaceDailyReport",
        referenceId: `${settings.workspaceId}:2026-05-18`,
        status: "SUCCEEDED" as const,
      })),
    });

    const summary = await scheduleDueBackgroundJobs(prisma, {
      now: NOW,
      limits: {
        trackedChannels: 0,
        industrySources: 0,
        transcriptVideos: 0,
        dailyReportWorkspaces: 3,
      },
    });
    const dailyCreates = prisma.jobRun.create.mock.calls.filter(
      ([input]) => input.data.jobType === "daily_report_generate",
    );

    expect(prisma.workspaceSettings.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ skip: 0, take: 3 }),
    );
    expect(prisma.workspaceSettings.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ skip: 3, take: 3 }),
    );
    expect(summary.dailyReportGenerate).toBe(3);
    expect(dailyCreates.map(([input]) => input.data.referenceId)).toEqual([
      "workspace-3:2026-05-18",
      "workspace-4:2026-05-18",
      "workspace-5:2026-05-18",
    ]);
  });
});

function createSchedulerPrisma(input: {
  trackedChannels?: Array<{
    workspaceId: string;
    channel: {
      id: string;
      lastFetchedAt: Date | null;
    };
  }>;
  industrySources?: Array<{
    id: string;
    workspaceId: string;
    lastFetchedAt: Date | null;
  }>;
  transcriptVideos?: Array<{ id: string }>;
  dailyReportSettings?: Array<{ workspaceId: string; timezone: string }>;
  existingJobs?: Array<{
    jobType: string;
    referenceType?: string;
    referenceId?: string;
    status: "QUEUED" | "RUNNING" | "RETRYING" | "SUCCEEDED";
  }>;
} = {}): JobSchedulerPrisma & {
  trackedChannel: { findMany: ReturnType<typeof vi.fn> };
  industrySource: { findMany: ReturnType<typeof vi.fn> };
  youtubeVideo: { findMany: ReturnType<typeof vi.fn> };
  workspaceSettings: { findMany: ReturnType<typeof vi.fn> };
  jobRun: JobSchedulerPrisma["jobRun"] & {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
} {
  const createdJobs: Array<{
    id: string;
    status: "QUEUED" | "RUNNING" | "RETRYING" | "SUCCEEDED";
    attempts: number;
    maxAttempts: number;
    jobType: string;
    referenceType?: string;
    referenceId?: string;
  }> = [];
  for (const job of input.existingJobs ?? []) {
    createdJobs.push({
      id: `job-existing-${createdJobs.length + 1}`,
      status: job.status,
      attempts: 1,
      maxAttempts: 3,
      jobType: job.jobType,
      referenceType: job.referenceType,
      referenceId: job.referenceId,
    });
  }

  return {
    trackedChannel: {
      findMany: vi.fn(async ({ take }) =>
        (input.trackedChannels ?? [
          {
            workspaceId: "workspace-1",
            channel: {
              id: "channel-1",
              lastFetchedAt: new Date("2026-05-18T00:00:00Z"),
            },
          },
        ]).slice(0, take),
      ),
    },
    industrySource: {
      findMany: vi.fn(async ({ take }) =>
        (input.industrySources ?? [
          {
            id: "source-1",
            workspaceId: "workspace-1",
            lastFetchedAt: new Date("2026-05-17T00:00:00Z"),
          },
        ]).slice(0, take),
      ),
    },
    youtubeVideo: {
      findMany: vi.fn(async ({ take }) =>
        (input.transcriptVideos ?? [
          {
            id: "video-1",
          },
        ]).slice(0, take),
      ),
    },
    workspaceSettings: {
      findMany: vi.fn(async ({ skip = 0, take }) =>
        (input.dailyReportSettings ?? [
          {
            workspaceId: "workspace-enabled",
            timezone: "Asia/Singapore",
          },
        ]).slice(skip, skip + take),
      ),
    },
    jobRun: {
      findFirst: vi.fn(async ({ where }) => {
        return (
          createdJobs.find(
            (job) =>
              job.jobType === where.jobType &&
              job.referenceType === where.referenceType &&
              job.referenceId === where.referenceId &&
              where.status.in.includes(job.status),
          ) ?? null
        );
      }),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => {
        const job = {
          id: `job-created-${createdJobs.length + 1}`,
          status: "QUEUED" as const,
          attempts: 0 as const,
          maxAttempts: data.maxAttempts,
          jobType: data.jobType,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
        };
        createdJobs.push(job);
        return { id: job.id };
      }),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}
