ALTER TABLE "User" ADD COLUMN "creditBalance" INTEGER NOT NULL DEFAULT 0;

WITH workspace_balances AS (
  SELECT
    "ownerId",
    COALESCE(SUM("creditBalance"), 0)::INTEGER AS "creditBalance"
  FROM "Workspace"
  GROUP BY "ownerId"
)
UPDATE "User" u
SET "creditBalance" = wb."creditBalance"
FROM workspace_balances wb
WHERE u."id" = wb."ownerId";

CREATE INDEX "CreditTransaction_userId_createdAt_idx" ON "CreditTransaction"("userId", "createdAt");
