ALTER TABLE "VisualAsset"
ADD COLUMN "aiGenerationId" TEXT,
ADD COLUMN "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
ADD COLUMN "visualStrategy" JSONB,
ADD COLUMN "editableOverlays" JSONB;

CREATE INDEX "VisualAsset_aiGenerationId_idx" ON "VisualAsset"("aiGenerationId");
