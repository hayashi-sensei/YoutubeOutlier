ALTER TABLE "TopicRecommendation"
ADD COLUMN "sourceTrackedChannelId" TEXT;

UPDATE "TopicRecommendation" recommendation
SET "sourceTrackedChannelId" = tracked."id"
FROM "ResearchReport" report
INNER JOIN "TrackedChannel" tracked
  ON tracked."workspaceId" = report."workspaceId"
INNER JOIN "YoutubeChannel" channel
  ON channel."id" = tracked."youtubeChannelId"
WHERE recommendation."reportId" = report."id"
  AND recommendation."workspaceId" = tracked."workspaceId"
  AND recommendation."sourceTrackedChannelId" IS NULL
  AND report."title" = channel."title" || ' topic ideas for ' || to_char(report."reportDate", 'Mon DD, YYYY');

ALTER TABLE "TopicRecommendation"
ADD CONSTRAINT "TopicRecommendation_sourceTrackedChannelId_fkey"
FOREIGN KEY ("sourceTrackedChannelId") REFERENCES "TrackedChannel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "TopicRecommendation_workspaceId_sourceTrackedChannelId_createdAt_idx"
ON "TopicRecommendation"("workspaceId", "sourceTrackedChannelId", "createdAt");
