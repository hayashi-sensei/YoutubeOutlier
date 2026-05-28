-- Add indexes for bounded scheduler discovery, job claiming, dashboard job counts,
-- and scheduled recommendation expiry.

CREATE INDEX "WorkspaceSettings_dailyReportEnabled_updatedAt_idx"
ON "WorkspaceSettings"("dailyReportEnabled", "updatedAt");

CREATE INDEX "YoutubeVideo_transcriptStatus_createdAt_idx"
ON "YoutubeVideo"("transcriptStatus", "createdAt");

CREATE INDEX "TrackedChannel_isActive_workspaceId_createdAt_idx"
ON "TrackedChannel"("isActive", "workspaceId", "createdAt");

CREATE INDEX "IndustrySource_isActive_lastFetchedAt_idx"
ON "IndustrySource"("isActive", "lastFetchedAt");

CREATE INDEX "TopicRecommendation_status_createdAt_idx"
ON "TopicRecommendation"("status", "createdAt");

CREATE INDEX "JobRun_jobType_status_availableAt_createdAt_idx"
ON "JobRun"("jobType", "status", "availableAt", "createdAt");

CREATE INDEX "JobRun_workspaceId_jobType_status_createdAt_idx"
ON "JobRun"("workspaceId", "jobType", "status", "createdAt");
