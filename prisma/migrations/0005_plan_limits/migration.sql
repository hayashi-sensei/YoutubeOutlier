CREATE TABLE IF NOT EXISTS "PlanLimit" (
  "id" TEXT NOT NULL,
  "planCode" "PlanCode" NOT NULL,
  "monthlyCredits" INTEGER NOT NULL,
  "maxTrackedChannels" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlanLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlanLimit_planCode_key" ON "PlanLimit"("planCode");

INSERT INTO "PlanLimit" ("id", "planCode", "monthlyCredits", "maxTrackedChannels", "updatedAt")
VALUES
  ('plan_limit_free', 'FREE', 0, 0, CURRENT_TIMESTAMP),
  ('plan_limit_starter', 'STARTER', 100, 5, CURRENT_TIMESTAMP),
  ('plan_limit_pro', 'PRO', 250, 15, CURRENT_TIMESTAMP),
  ('plan_limit_premium', 'PREMIUM', 700, 25, CURRENT_TIMESTAMP)
ON CONFLICT ("planCode") DO NOTHING;

UPDATE "Workspace" AS w
SET "creditBalance" = 800,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "User" AS u
WHERE w."ownerId" = u."id"
  AND u."role" = 'ADMIN'
  AND w."creditBalance" < 800;
