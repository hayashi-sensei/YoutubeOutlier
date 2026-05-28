const SUPABASE_BROWSER_ROLES = ["anon", "authenticated"];

export async function loadDatabaseCapabilities(client) {
  const roleResult = await client.query(
    "SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])",
    [["anon", "authenticated", "postgres"]],
  );
  const authUidResult = await client.query("SELECT to_regprocedure('auth.uid()') IS NOT NULL AS exists");

  return {
    roles: new Set(roleResult.rows.map((row) => row.rolname)),
    hasAuthUid: Boolean(authUidResult.rows[0]?.exists),
  };
}

export async function ensureAuthUidShim(client, capabilities) {
  if (capabilities.hasAuthUid) {
    return;
  }

  await client.query("CREATE SCHEMA IF NOT EXISTS auth");
  await client.query(`
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULL::uuid
$$;
`);
}

export function adaptMigrationSqlForCapabilities(sql, capabilities) {
  let adapted = sql;

  if (!capabilities.roles.has("postgres")) {
    adapted = adapted.replace(
      /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+REVOKE[^;]+;\s*/g,
      "",
    );
  }

  if (SUPABASE_BROWSER_ROLES.some((role) => !capabilities.roles.has(role))) {
    adapted = adapted
      .replace(/^\s*REVOKE .* FROM anon, authenticated;\r?\n?/gm, "")
      .replace(/^\s*REVOKE .* FROM anon;\r?\n?/gm, "")
      .replace(/^\s*REVOKE .* FROM authenticated;\r?\n?/gm, "")
      .replace(/^\s*GRANT .* TO authenticated;\r?\n?/gm, "")
      .replace(/\bTO authenticated\b/g, "TO PUBLIC");
  }

  return adapted;
}
