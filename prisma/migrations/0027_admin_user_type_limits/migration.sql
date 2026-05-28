CREATE TABLE IF NOT EXISTS "UserRoleLimit" (
  "id" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "monthlyCredits" INTEGER NOT NULL,
  "maxTrackedChannels" INTEGER NOT NULL,
  "maxWorkspaces" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserRoleLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserRoleLimit_role_key" ON "UserRoleLimit"("role");

INSERT INTO "UserRoleLimit" ("id", "role", "monthlyCredits", "maxTrackedChannels", "maxWorkspaces", "updatedAt")
VALUES ('admin-user-type-limit', 'ADMIN', 800, 25, 10, CURRENT_TIMESTAMP)
ON CONFLICT ("role") DO NOTHING;

ALTER TABLE public."UserRoleLimit" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "UserRoleLimit_admin_select" ON public."UserRoleLimit";
CREATE POLICY "UserRoleLimit_admin_select"
  ON public."UserRoleLimit"
  FOR SELECT
  TO authenticated
  USING (yt_app.is_admin());
