CREATE TABLE "CompetitorBlueprint" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "youtubeChannelId" TEXT NOT NULL,
  "summary" TEXT,
  "titlePatterns" JSONB NOT NULL,
  "hookPatterns" JSONB NOT NULL,
  "thumbnailPatterns" JSONB NOT NULL,
  "contentPillars" JSONB NOT NULL,
  "structurePatterns" JSONB NOT NULL,
  "ctaPatterns" JSONB NOT NULL,
  "emotionalAngles" JSONB NOT NULL,
  "observationsJson" JSONB NOT NULL,
  "topVideoIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "videoCount" INTEGER NOT NULL DEFAULT 0,
  "averageOutlierScore" DOUBLE PRECISION,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompetitorBlueprint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompetitorBlueprint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompetitorBlueprint_youtubeChannelId_fkey" FOREIGN KEY ("youtubeChannelId") REFERENCES "YoutubeChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CompetitorBlueprint_workspaceId_youtubeChannelId_key" ON "CompetitorBlueprint"("workspaceId", "youtubeChannelId");
CREATE INDEX "CompetitorBlueprint_workspaceId_updatedAt_idx" ON "CompetitorBlueprint"("workspaceId", "updatedAt");
CREATE INDEX "CompetitorBlueprint_youtubeChannelId_idx" ON "CompetitorBlueprint"("youtubeChannelId");

ALTER TABLE "CompetitorBlueprint" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CompetitorBlueprint" FROM anon;
REVOKE ALL ON TABLE "CompetitorBlueprint" FROM authenticated;
