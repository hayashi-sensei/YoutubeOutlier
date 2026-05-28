UPDATE "CreditTransaction" ct
SET "userId" = w."ownerId"
FROM "Workspace" w
WHERE ct."workspaceId" = w."id"
  AND (ct."userId" IS NULL OR ct."userId" <> w."ownerId");
