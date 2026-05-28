ALTER TABLE "ContentItem"
  ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'recommendation',
  ADD COLUMN "manualTopic" TEXT,
  ADD COLUMN "evidenceSnapshot" JSONB;

ALTER TABLE "ContentAsset"
  ADD COLUMN "aiGenerationId" TEXT;

CREATE INDEX "ContentItem_workspaceId_sourceType_updatedAt_idx"
  ON "ContentItem"("workspaceId", "sourceType", "updatedAt");

CREATE INDEX "ContentAsset_aiGenerationId_idx"
  ON "ContentAsset"("aiGenerationId");
