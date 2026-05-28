import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { adaptMigrationSqlForCapabilities, ensureAuthUidShim, loadDatabaseCapabilities } from "./migration-sql-compat.mjs";

const migrationsDir = path.resolve("prisma/migrations");
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DIRECT_URL or DATABASE_URL is required. For Neon, set DIRECT_URL to the direct non-pooled connection string for migrations and DATABASE_URL to the pooled runtime connection string.",
  );
}

const pool = new pg.Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

const migrationTableSql = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);
`;

function checksum(sql) {
  return crypto.createHash("sha256").update(sql).digest("hex");
}

const client = await pool.connect();

try {
  const capabilities = await loadDatabaseCapabilities(client);
  await ensureAuthUidShim(client, capabilities);
  await client.query(migrationTableSql);

  const appliedResult = await client.query('SELECT "migration_name" FROM "_prisma_migrations" WHERE "rolled_back_at" IS NULL');
  const applied = new Set(appliedResult.rows.map((row) => row.migration_name));
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const migrationNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migrationName of migrationNames) {
    if (applied.has(migrationName)) {
      console.log(`skip ${migrationName}`);
      continue;
    }

    const sqlPath = path.join(migrationsDir, migrationName, "migration.sql");
    const sourceSql = await fs.readFile(sqlPath, "utf8");
    const sql = adaptMigrationSqlForCapabilities(sourceSql, capabilities);

    console.log(`apply ${migrationName}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
         VALUES ($1, $2, now(), $3, NULL, NULL, now(), 1)`,
        [crypto.randomUUID(), checksum(sourceSql), migrationName],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
