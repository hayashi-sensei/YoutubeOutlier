export const JOB_TYPES = {
  youtubeChannelBackfill: "youtube_channel_backfill",
  youtubeRecentRefresh: "youtube_recent_refresh",
  outlierScoreRefresh: "outlier_score_refresh",
  competitorBlueprintAnalyze: "competitor_blueprint_analyze",
  topicRecommendationGenerate: "topic_recommendation_generate",
  transcriptFetch: "transcript_fetch",
  industrySourceRefresh: "industry_source_refresh",
  dailyReportGenerate: "daily_report_generate",
  manualReportGenerate: "manual_report_generate",
  topicRecommendationExpire: "topic_recommendation_expire",
  exportGenerate: "export_generate",
  providerCostSnapshot: "provider_cost_snapshot",
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

export type JobRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED"
  | "RETRYING";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JobMetadata = Record<string, JsonValue>;

export type ClaimedJob = {
  id: string;
  jobType?: string;
  status: "RUNNING";
  attempts: number;
  maxAttempts: number;
  metadata: JobMetadata;
};

export type JobHandlerResult = JobMetadata | undefined;

export type JobHandler = (input: {
  prisma: unknown;
  job: ClaimedJob;
  now: Date;
}) => Promise<JobHandlerResult>;
