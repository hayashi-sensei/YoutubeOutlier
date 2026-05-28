ALTER TABLE "JobRun"
ADD COLUMN "scheduledFor" TIMESTAMP(3),
ADD COLUMN "availableAt" TIMESTAMP(3),
ADD COLUMN "claimedAt" TIMESTAMP(3),
ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN "queueLatencyMs" INTEGER,
ADD COLUMN "providerError" JSONB;

CREATE INDEX "JobRun_status_availableAt_idx" ON "JobRun"("status", "availableAt");
CREATE INDEX "JobRun_status_lastHeartbeatAt_idx" ON "JobRun"("status", "lastHeartbeatAt");
