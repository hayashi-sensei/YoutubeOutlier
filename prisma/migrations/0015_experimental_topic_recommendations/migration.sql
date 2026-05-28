CREATE TYPE "TopicRecommendationKind" AS ENUM ('STANDARD', 'EXPERIMENTAL');

ALTER TABLE "TopicRecommendation"
ADD COLUMN "kind" "TopicRecommendationKind" NOT NULL DEFAULT 'STANDARD';

CREATE INDEX "TopicRecommendation_workspaceId_kind_createdAt_idx"
ON "TopicRecommendation"("workspaceId", "kind", "createdAt");
