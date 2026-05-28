# Spec 025: Neon Database Migration

## Goal

Move YTResearch database hosting to Neon Postgres while preserving Prisma ORM, existing migrations, current application data model, and the repo's migration safety rules.

## Scope

- Neon Postgres connection contract
- Prisma datasource and runtime configuration
- Migration execution through direct non-pooled connection
- Runtime application queries through pooled connection
- Documentation for local, preview, and production environments
- Health check verification against the configured database

## Environment Contract

Use Neon connection strings as follows:

- `DATABASE_URL`: Neon pooled connection string for application runtime.
- `DIRECT_URL`: Neon direct, non-pooled connection string for migrations and schema operations.

Both URLs must remain server-only. Do not expose either value through `NEXT_PUBLIC_*`.

## Requirements

- Prisma schema remains PostgreSQL-compatible and does not change application models for this migration.
- Application runtime database access uses `DATABASE_URL`.
- Migration scripts prefer `DIRECT_URL` and fall back to `DATABASE_URL` only for local/dev convenience.
- The project must not use `prisma db push`.
- Existing migrations remain immutable.
- `.env.example` documents Neon pooled and direct URL examples.
- `AGENTS.md`, `context/project-overview.md`, and schema notes reflect Neon as the database host.
- The health endpoint continues to report database connectivity without leaking secrets.
- Historical Supabase role/RLS migrations must run on Neon without editing already-created migration files.

## Non-Goals

- Do not migrate auth to Auth.js in this spec.
- Do not remove Supabase Auth code in this spec.
- Do not add R2 storage in this spec.
- Do not rewrite Prisma models unless a Neon compatibility issue requires it.

## Acceptance Criteria

- `npm run prisma:validate` passes.
- `npm run prisma:generate` passes.
- `npm run typecheck` passes.
- `npm run test` passes.
- `npm run build` passes.
- `npm run db:migrate:pg` can run against Neon using `DIRECT_URL`.
- `/api/health` returns database `ok` when Neon env vars are configured.
- Documentation clearly states `DATABASE_URL` is pooled and `DIRECT_URL` is direct.
- The migration runner can apply historical Supabase-era migrations to Neon by adapting missing browser roles and `auth.uid()` compatibility.
