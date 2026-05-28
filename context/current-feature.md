# Current Feature

This file tracks the active spec-driven development step for YTResearch.

## Status

- **Workflow State:** Complete
- **Active Phase:** Review
- **Active Spec:** Spec 025: Neon Database Migration
- **Spec File:** docs/specs/025-neon-database-migration.md
- **Implementation Status:** Complete
- **Branch:** feat/spec-025-neon-database-migration
- **Last Updated:** 2026-05-28

## Loaded Spec

Move YTResearch database hosting to Neon Postgres while preserving Prisma ORM, existing migrations, the current application data model, and the repo's migration safety rules.

### Goals

- Use Neon Postgres as the database host.
- Treat `DATABASE_URL` as the Neon pooled runtime connection string.
- Treat `DIRECT_URL` as the Neon direct, non-pooled migration and schema-operation connection string.
- Preserve all existing Prisma models and migrations unless a Neon compatibility issue requires otherwise.
- Keep database URLs server-only and never expose them through `NEXT_PUBLIC_*`.
- Keep application runtime database access on `DATABASE_URL`.
- Keep migration execution on `DIRECT_URL`, falling back to `DATABASE_URL` only for local/dev convenience.
- Update `.env.example`, `AGENTS.md`, `context/project-overview.md`, and schema notes so Neon is the documented database host.
- Preserve `/api/health` database connectivity checks without leaking secrets.

## Plan

Detailed implementation plan pending approval:

1. **Schema**
   - Inspect `prisma/schema.prisma` and confirm `datasource db` remains `provider = "postgresql"`.
   - Do not change Prisma models, enums, relations, indexes, or existing migration SQL unless Neon validation proves a compatibility issue.
   - Do not create a migration unless an actual schema change is required.

2. **Prisma configuration**
   - Update `prisma.config.ts` if needed so Prisma CLI operations continue to use `DATABASE_URL` for config loading while migration execution remains controlled by the repo script.
   - Preserve `schema: "prisma/schema.prisma"` and `migrations.path: "prisma/migrations"`.
   - Avoid adding unsupported Prisma config fields.

3. **Runtime database connection**
   - Review `lib/db/prisma.ts`.
   - Keep `createPrismaClient()` using `env.DATABASE_URL`.
   - Treat `DATABASE_URL` as the Neon pooled runtime URL.
   - Preserve SSL configuration and conservative pool sizing.
   - If needed, extract connection option construction into a named helper such as `createPgPoolOptions()` for focused tests; otherwise leave runtime code unchanged.

4. **Migration execution**
   - Update `scripts/apply-prisma-migrations.mjs`.
   - Keep the connection priority as `DIRECT_URL || DATABASE_URL`.
   - Improve the missing-env error so it explains Neon usage: `DIRECT_URL` is preferred for migrations and `DATABASE_URL` is pooled runtime.
   - Keep migration table handling and per-migration transaction behavior intact.
   - Do not run `prisma db push`.

5. **Health route**
   - Review `app/api/health/route.ts`.
   - Keep `GET()` querying through `getPrismaClient()` and returning only `ok`, `not_configured`, or `unreachable`.
   - Do not expose the connection string or Neon host in responses.
   - Update only if copy or status behavior must reflect Neon.

6. **Environment contract**
   - Update `.env.example`.
   - Replace local Postgres examples with Neon-shaped examples:
     - `DATABASE_URL`: pooled Neon connection string.
     - `DIRECT_URL`: direct Neon connection string.
   - Add concise comments explaining pooled vs direct.
   - Keep both variables server-only and not `NEXT_PUBLIC_*`.

7. **Documentation**
   - Update `AGENTS.md` database guidance from local Postgres language to Neon + Prisma language.
   - Update `context/project-overview.md` only where needed to remove remaining Supabase database ambiguity while preserving future Auth.js/R2 sequencing.
   - Update `docs/schema/schema-notes.md` with Neon pooled/direct policy.
   - Keep `docs/specs/025-neon-database-migration.md`, `026-authjs-google-oauth.md`, `027-cloudflare-r2-storage.md`, and `docs/specs/spec-index.md` as part of this infrastructure roadmap documentation set.

8. **Tests**
   - If a new helper is added in `lib/db/prisma.ts`, add focused coverage under `tests/db/`.
   - If only env/docs/script copy changes are needed, do not add ornamental tests.
   - Existing relevant coverage remains the full verification suite.

9. **Integration verification**
   - Run `npm run prisma:validate`.
   - Run `npm run prisma:generate`.
   - Run `npm run typecheck`.
   - Run `npm run test`.
   - Run `npm run build`.
   - Run `npm run db:migrate:pg` only when valid Neon `DIRECT_URL`/`DATABASE_URL` are configured locally.
   - Optionally verify `/api/health` against the configured Neon database after the app is running.

## Approval

Approved on 2026-05-28. Branch created: `feat/spec-025-neon-database-migration`.

## Implementation Notes

- Branch created and implementation started on 2026-05-28.
- No Prisma model changes are currently expected.
- Neon migration execution exposed a historical Supabase-role compatibility issue: plain Neon does not provide `anon`, `authenticated`, or `auth.uid()`.
- Added a migration runner compatibility layer instead of editing old migration files.
- `npm run db:migrate:pg` completed successfully against the configured database after the compatibility adapter was added.
- Non-goal: do not migrate auth to Auth.js in this spec.
- Non-goal: do not remove Supabase Auth code in this spec.
- Non-goal: do not add R2 storage in this spec.
- Non-goal: do not rewrite Prisma models unless Neon compatibility requires it.
- Never run `prisma db push`.
- Existing migrations remain immutable.

## Verification Plan

- `npm run prisma:validate`
- `npm run prisma:generate`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run db:migrate:pg` against Neon when valid Neon env vars are configured.
- `/api/health` returns database `ok` when Neon env vars are configured.

## Review Summary

Implemented Spec 025 without Prisma model changes or old migration edits. Neon runtime uses pooled `DATABASE_URL`; migrations use direct `DIRECT_URL` through the existing migration command. Historical Supabase-role migrations are adapted at execution time for Neon compatibility.

Verification completed on 2026-05-28:

- `npm run prisma:validate` passed.
- `npm run prisma:generate` passed.
- `npm run typecheck` passed.
- `npm run test` passed: 72 files, 302 tests.
- `npm run build` passed.
- `npm run db:migrate:pg` completed against the configured database.
- Production server `/api/health` returned `{"status":"ok","app":"ok","database":"ok"}`.
- Review fix applied: `_prisma_migrations.checksum` now records the immutable source migration SQL checksum while executing Neon-adapted SQL.

## Commit

Commit message selected: `feat(spec-025): migrate database configuration to Neon`

## History

No active history.
