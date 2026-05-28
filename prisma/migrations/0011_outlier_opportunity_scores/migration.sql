CREATE TABLE "WorkspaceVideoOpportunityScore" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "youtubeVideoId" TEXT NOT NULL,
  "outlierScoreId" TEXT,
  "nicheRelevanceScore" DOUBLE PRECISION,
  "topicFreshnessScore" DOUBLE PRECISION,
  "competitiveSaturationScore" DOUBLE PRECISION,
  "sourceCorroborationScore" DOUBLE PRECISION,
  "brandFitScore" DOUBLE PRECISION,
  "opportunityScore" DOUBLE PRECISION NOT NULL,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkspaceVideoOpportunityScore_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceVideoOpportunityScore_workspaceId_opportunityScore_idx" ON "WorkspaceVideoOpportunityScore"("workspaceId", "opportunityScore");
CREATE INDEX "WorkspaceVideoOpportunityScore_workspaceId_calculatedAt_idx" ON "WorkspaceVideoOpportunityScore"("workspaceId", "calculatedAt");
CREATE INDEX "WorkspaceVideoOpportunityScore_workspaceId_youtubeVideoId_calculatedAt_idx" ON "WorkspaceVideoOpportunityScore"("workspaceId", "youtubeVideoId", "calculatedAt");
CREATE INDEX "WorkspaceVideoOpportunityScore_youtubeVideoId_idx" ON "WorkspaceVideoOpportunityScore"("youtubeVideoId");
CREATE INDEX "WorkspaceVideoOpportunityScore_outlierScoreId_idx" ON "WorkspaceVideoOpportunityScore"("outlierScoreId");

ALTER TABLE "WorkspaceVideoOpportunityScore"
ADD CONSTRAINT "WorkspaceVideoOpportunityScore_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceVideoOpportunityScore"
ADD CONSTRAINT "WorkspaceVideoOpportunityScore_youtubeVideoId_fkey"
FOREIGN KEY ("youtubeVideoId") REFERENCES "YoutubeVideo"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceVideoOpportunityScore"
ADD CONSTRAINT "WorkspaceVideoOpportunityScore_outlierScoreId_fkey"
FOREIGN KEY ("outlierScoreId") REFERENCES "OutlierScore"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public."WorkspaceVideoOpportunityScore" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."WorkspaceVideoOpportunityScore" FROM anon, authenticated;
