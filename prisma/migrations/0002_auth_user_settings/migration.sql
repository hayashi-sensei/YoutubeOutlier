-- AlterTable
ALTER TABLE "User" ADD COLUMN "supabaseUserId" TEXT;

-- AlterTable
ALTER TABLE "WorkspaceSettings" ADD COLUMN "recommendationsStaleAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_supabaseUserId_key" ON "User"("supabaseUserId");
