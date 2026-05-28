ALTER TABLE "CreditTransaction" DROP CONSTRAINT "CreditTransaction_workspaceId_fkey";

ALTER TABLE "CreditTransaction" ALTER COLUMN "workspaceId" DROP NOT NULL;

ALTER TABLE "CreditTransaction"
ADD CONSTRAINT "CreditTransaction_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
