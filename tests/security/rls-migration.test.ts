import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "prisma",
  "migrations",
  "0025_security_rls_and_compliance",
  "migration.sql",
);

const correctiveMigrationPath = path.join(
  process.cwd(),
  "prisma",
  "migrations",
  "0026_lock_down_spec_023_rls_writes",
  "migration.sql",
);

const adminUserTypeLimitMigrationPath = path.join(
  process.cwd(),
  "prisma",
  "migrations",
  "0027_admin_user_type_limits",
  "migration.sql",
);

const workspaceScopedTables = [
  "Workspace",
  "WorkspaceSettings",
  "WritingStyleSample",
  "Subscription",
  "CreditTransaction",
  "TrackedChannel",
  "CompetitorRecommendation",
  "WorkspaceVideoOpportunityScore",
  "CompetitorBlueprint",
  "IndustrySource",
  "IndustrySourceItem",
  "TopicRecommendation",
  "TopicRecommendationEvidence",
  "ResearchReport",
  "ContentItem",
  "ContentAsset",
  "VisualAsset",
  "AiGeneration",
  "JobRun",
  "ExportFile",
  "EmailLog",
];

const adminOnlyTables = ["PlanLimit", "UserRoleLimit", "AiTaskRouteOverride", "AdminAuditLog", "YoutubeQuotaUsage"];

describe("Spec 023 RLS migration", () => {
  test("defines workspace-scoped authenticated policies for user data tables", () => {
    const sql = readFileSync(migrationPath, "utf8");

    for (const tableName of workspaceScopedTables) {
      expect(sql).toContain(`ALTER TABLE public."${tableName}" ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`CREATE POLICY "${tableName}_authenticated_select"`);
    }

    expect(sql).toContain("yt_app.current_app_user_id()");
    expect(sql).toContain("yt_app.is_workspace_member");
  });

  test("does not expose direct authenticated writes for app tables", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).not.toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated");
    expect(sql).not.toMatch(/CREATE POLICY "[^"]+"_authenticated_write"/);
    expect(sql).not.toMatch(/FOR ALL\s+TO authenticated/);
  });

  test("keeps admin and operational tables explicitly admin-readable only", () => {
    const sql = `${readFileSync(migrationPath, "utf8")}\n${readFileSync(adminUserTypeLimitMigrationPath, "utf8")}`;

    for (const tableName of adminOnlyTables) {
      expect(sql).toContain(`CREATE POLICY "${tableName}_admin_select"`);
      expect(sql).not.toContain(`CREATE POLICY "${tableName}_admin_write"`);
    }

    expect(sql).not.toMatch(/raw_user_meta_data|user_metadata|app_metadata/);
  });

  test("defines storage policies that require workspace-prefixed objects", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("CREATE POLICY \"workspace_assets_select\"");
    expect(sql).toContain("CREATE POLICY \"workspace_assets_insert\"");
    expect(sql).toContain("storage.foldername(name)");
    expect(sql).toContain("yt_app.is_workspace_member");
    expect(sql).not.toContain("Skipping storage.objects policy installation");
    expect(sql).not.toContain("WHEN insufficient_privilege");
  });

  test("includes a corrective migration for databases that applied early write policies", () => {
    const sql = readFileSync(correctiveMigrationPath, "utf8");

    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM authenticated");
    expect(sql).toContain('DROP POLICY IF EXISTS "Workspace_authenticated_write"');
    expect(sql).toContain('DROP POLICY IF EXISTS "AdminAuditLog_admin_write"');
    expect(sql).not.toMatch(/CREATE POLICY|GRANT INSERT|GRANT UPDATE|GRANT DELETE/);
  });
});
