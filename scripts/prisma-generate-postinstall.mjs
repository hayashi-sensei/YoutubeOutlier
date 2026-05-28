import { spawnSync } from "node:child_process";

const fallbackDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/ytresearch?schema=public";
const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || fallbackDatabaseUrl,
};

const result = spawnSync("prisma", ["generate"], {
  env,
  shell: true,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
