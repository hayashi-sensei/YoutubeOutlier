import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { adaptMigrationSqlForCapabilities } from "../../scripts/migration-sql-compat.mjs";

function capabilities(roles: string[]) {
  return {
    roles: new Set(roles),
    hasAuthUid: false,
  };
}

describe("migration SQL compatibility", () => {
  test("removes Supabase browser role revokes when roles are unavailable", () => {
    const sql = [
      'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;',
      'REVOKE ALL ON TABLE "CompetitorBlueprint" FROM anon;',
      'REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM authenticated;',
      'ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;',
    ].join("\n");

    const adapted = adaptMigrationSqlForCapabilities(sql, capabilities([]));

    expect(adapted).not.toContain("FROM anon, authenticated");
    expect(adapted).not.toContain("FROM anon;");
    expect(adapted).not.toContain("FROM authenticated");
    expect(adapted).toContain('ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;');
  });

  test("removes postgres default privileges when the postgres role is unavailable", () => {
    const sql = `
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated;

ALTER TABLE public."Workspace" ENABLE ROW LEVEL SECURITY;
`;

    const adapted = adaptMigrationSqlForCapabilities(sql, capabilities(["anon", "authenticated"]));

    expect(adapted).not.toContain("ALTER DEFAULT PRIVILEGES FOR ROLE postgres");
    expect(adapted).toContain('ALTER TABLE public."Workspace" ENABLE ROW LEVEL SECURITY;');
  });

  test("retargets authenticated policies to PUBLIC when the authenticated role is unavailable", () => {
    const sql = `
CREATE POLICY "Workspace_authenticated_select"
  ON public."Workspace"
  FOR SELECT
  TO authenticated
  USING (true);
`;

    const adapted = adaptMigrationSqlForCapabilities(sql, capabilities([]));

    expect(adapted).toContain("TO PUBLIC");
    expect(adapted).not.toContain("TO authenticated");
  });

  test("keeps Supabase role SQL unchanged when all roles are available", () => {
    const sql = `
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
CREATE POLICY "User_self_select" ON public."User" FOR SELECT TO authenticated USING (true);
`;

    const adapted = adaptMigrationSqlForCapabilities(sql, capabilities(["anon", "authenticated", "postgres"]));

    expect(adapted).toBe(sql);
  });

  test("keeps source migration checksums independent from adapted SQL", () => {
    const sourceSql = [
      'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;',
      'ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;',
    ].join("\n");
    const adapted = adaptMigrationSqlForCapabilities(sourceSql, capabilities([]));

    expect(adapted).not.toBe(sourceSql);
    expect(checksum(sourceSql)).not.toBe(checksum(adapted));
  });
});

function checksum(sql: string) {
  return createHash("sha256").update(sql).digest("hex");
}
