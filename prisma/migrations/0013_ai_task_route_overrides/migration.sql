CREATE TABLE IF NOT EXISTS "AiTaskRouteOverride" (
  "id" TEXT NOT NULL,
  "taskType" TEXT NOT NULL,
  "qualityTier" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "credits" INTEGER NOT NULL,
  "estimatedCostUsd" DECIMAL(10,4) NOT NULL,
  "maxOutputTokens" INTEGER NOT NULL,
  "temperature" DECIMAL(4,2) NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiTaskRouteOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiTaskRouteOverride_taskType_qualityTier_key"
  ON "AiTaskRouteOverride"("taskType", "qualityTier");

CREATE INDEX IF NOT EXISTS "AiTaskRouteOverride_provider_idx"
  ON "AiTaskRouteOverride"("provider");
