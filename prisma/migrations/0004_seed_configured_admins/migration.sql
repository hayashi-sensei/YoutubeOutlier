UPDATE "User"
SET "role" = 'ADMIN'
WHERE lower("email") IN (
  'neilvinsern@gmail.com',
  'ginkomedia@gmail.com',
  'funnelphilia@gmail.com'
);

UPDATE "WorkspaceMember" AS wm
SET "role" = 'ADMIN'
FROM "User" AS u
WHERE wm."userId" = u."id"
  AND lower(u."email") IN (
    'neilvinsern@gmail.com',
    'ginkomedia@gmail.com',
    'funnelphilia@gmail.com'
  );
