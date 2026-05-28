CREATE TABLE IF NOT EXISTS "YoutubeQuotaUsage" (
  "id" TEXT NOT NULL,
  "quotaDate" TIMESTAMP(3) NOT NULL,
  "operation" TEXT NOT NULL,
  "units" INTEGER NOT NULL,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "YoutubeQuotaUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "YoutubeQuotaUsage_quotaDate_idx" ON "YoutubeQuotaUsage"("quotaDate");
CREATE INDEX IF NOT EXISTS "YoutubeQuotaUsage_operation_quotaDate_idx" ON "YoutubeQuotaUsage"("operation", "quotaDate");
CREATE INDEX IF NOT EXISTS "YoutubeQuotaUsage_referenceType_referenceId_idx" ON "YoutubeQuotaUsage"("referenceType", "referenceId");

ALTER TABLE public."YoutubeQuotaUsage" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."YoutubeQuotaUsage" FROM anon, authenticated;
