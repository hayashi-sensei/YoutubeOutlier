# Repository Guidelines

Read this file before every task. Do not assume. Do not infer. Do not start writing code without explicit approval. When in doubt - stop and ask.

Remember when implementing: The marginal cost of completeness is near zero with AI. Do the whole thing. Do it right. Do it with tests. Do it with documentation. Do it so well that I am is geneinely impressed - not politely satisfied, actually impressed. Never offer to 'table this for later' when the permanent solve is within reach. Never leave a dangling thread when tying it off takes five more minutes. Never present a workaround when the real fix exists. The standard isn't 'good enough' - 'it's holy shit, that's done'. Search before building. Test before shipping. Ship the complete thing. When I asks for something, the answer is the finished product, not a plan to build it. Time i snot an excuse, fatigue is not an excuse. Complexity is not an excuse. Boil the ocean.

## SDD Workflow

This is the only workflow. Do not deviate. LOAD SPEC -> PLAN -> AWAIT APPROVAL -> BRANCH -> CODE -> REVIEW -> COMMIT -> DELETE BRANCH

1. **Load Spec** - Read the feature-spec file completely. Also read `context/project-overview.md` and this file.
2. **Plan** - Produce a detailed, ordered plan: schema -> API -> components -> integration. Name every file, function, route. No code yet.
3. **Await Approval** - Stop. Wait for "approved" or equivalent. Revise if changes requested.
4. **Branch** - State branch name: `feat/spec-XX-short-description`
5. **Code** - Execute the approved plan in order. Brief status updates after each logical group.
6. **Review** - Present summary: files created/modified, migrations, deviations from plan, known gaps.
7. **Commit** - State exact commit message. Format: `feat(spec-XX): description`. Delete branch after merge.

---

## Absolute Rules - Never Break These

### Database

- **NEVER** run `prisma db push` - all changes go through Prisma migrations and the repo's migration workflow.
- **NEVER** edit migration files after creation
- Use the repo's Prisma camelCase field naming (`userId`, `workspaceId`, `ownerId`) and preserve existing database mappings.
- `@default(cuid())` for all primary keys
- Use `npm run db:migrate:pg` for the current local Postgres migration workflow unless the repo scripts are intentionally changed.
- Production migration execution must use a deploy-safe migration flow.

### Code

- TypeScript strict mode - no `any` types, use `unknown` with guards
- Server Components by default - `'use client'` only when needed
- Server Actions for mutations - API routes only for webhooks, cron, stripe, file uploads
- Validate all inputs with Zod before database writes
- Application source files should be `.ts` or `.tsx`. Existing `.mjs` files are allowed for Node scripts and config such as `postcss.config.mjs`, `build_cost_simulation.mjs`, and migration helper scripts.
- Import via `@/` alias - never deeper than `../`

### Auth

- Every API route and Server Action validates session before processing
- Admin checks are required on all `/app/admin` routes and every admin server action. Use the repo's server-side admin helpers, currently `requireAdmin()` and `assertAdminRole()`, at each admin entry point.
- Never expose session tokens or admin status client-side

### AI

- Do not hardcode model names or credit costs in feature code; use the existing AI task config and admin override flow.
- Credit check -> deduct -> call AI -> save output -> refund on failure
- Log AI calls, token usage, cost, status, and provider metadata through the existing `AiGeneration` model.

### Cron

- Background work uses the existing `JobRun` queue/logging model.
- Cron-triggered job execution must be protected by `YTRESEARCH_JOBS_SECRET`.
- Job failures must be recorded in `JobRun` and surfaced through the admin monitoring flow; do not fail silently.

Commit Convention feat(spec-XX): new feature fix(spec-XX): bug fix schema: migration only chore: config, deps, tooling refactor(spec-XX): restructure, no behavior change

---

## What Not To Do - Ever

1. Do not run `prisma db push`
2. Do not hardcode model names, credit costs, or AI prompts
3. Do not write code before the plan is approved
4. Do not add features not in the current spec - log as follow-up
5. Do not skip user/workspace ownership fields on user-owned data; use the repo's existing Prisma naming conventions.
6. Do not let cron jobs fail silently
7. Do not compute `dashboard_metrics` live - read from daily snapshots
8. Do not allow unauthenticated access to any route or action
9. Do not allow non-admin access to `/app/admin` routes or admin server actions
10. Do not deduct AI credits without checking balance first
11. Do not add `.js` application source files. Use TypeScript for app code; `.mjs` remains acceptable for existing Node scripts/config patterns.
12. Do not use `any` type
13. Do not open a branch without stating the name first
14. Do not commit without stating the exact message first
15. Do not mix spec concerns - future spec work gets noted and skipped

---

## When You Are Unsure

Stop. State what you are unsure about. Do not guess. The cost of asking is zero. The cost of a wrong migration is high.

## Project-Specific Clarifications

- This repo uses `context/project-overview.md` as the project overview. Read it alongside `context/PRD.md` before planning feature work.
- Current admin UI routes live under `/app/admin`.
- The commit convention above supersedes older commit formats.

## Project Structure & Module Organization

This repository is the Next.js application for YTResearch / YouTube Outlier.

- `app/` contains the Next.js App Router pages, layouts, API routes, and route groups.
- `actions/` contains server actions for authenticated product workflows.
- `components/` contains reusable React UI components.
- `lib/` contains application services, domain logic, integrations, and data access helpers.
- `schemas/` contains Zod validation schemas used by server actions and forms.
- `types/` contains shared TypeScript types.
- `prisma/schema.prisma` is the active Prisma schema; `prisma/migrations/` contains database migrations.
- `tests/` contains Vitest coverage for domain logic, server action helpers, queues, reports, auth, and integrations.
- `context/` and `docs/specs/` hold product requirements, implementation specs, design notes, and active feature history.
- `outputs/` contains generated artifacts. Treat generated reports, workbooks, PNGs, and local export files as rebuildable unless a task explicitly asks to refresh them.

## Build, Test, And Development Commands

Run commands from the repository root.

```powershell
npm install
npm run dev
npm run typecheck
npm run test
npm run build
npm run prisma:validate
npm run prisma:generate
npm run db:migrate:pg
```

- `npm install` installs dependencies and runs Prisma generation through `postinstall`.
- `npm run dev` starts the local Next.js dev server.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run test` runs the Vitest suite.
- `npm run build` creates a production Next.js build.
- `npm run prisma:validate` validates the Prisma schema.
- `npm run prisma:generate` regenerates the Prisma client under `generated/prisma`.
- `npm run db:migrate:pg` applies Prisma migrations using `scripts/apply-prisma-migrations.mjs`.

The project expects a local `.env` file for database, Supabase, cron, provider, and email configuration. Keep `.env` private; `.env.example` is the committed template.

## Coding Style & Naming Conventions

Use TypeScript, modern ES modules, and explicit imports. Prefer 2-space indentation, `const` for stable bindings, small functions with domain names, and Zod schemas for untrusted input.

Keep server-only code in server actions, route handlers, or `lib/` modules that are not imported by client components. Do not expose provider keys, database URLs, cron secrets, service-role credentials, raw stack traces, or sensitive provider payloads to the browser.

Use existing domain module boundaries before adding new abstractions:

- Auth and workspace bootstrap: `lib/auth/`, `lib/workspaces/`
- Billing and credits: `lib/billing/`
- AI routing and cost logging: `lib/ai/`, `lib/image/`
- YouTube ingestion and transcripts: `lib/youtube/`, `lib/transcripts/`
- Reports, exports, and scheduled jobs: `lib/reports/`, `lib/jobs/`
- Competitors, sources, recommendations, outliers, blueprints, and content production: matching `lib/<domain>/` folders

## Testing Guidelines

Add or update focused Vitest coverage for behavior changes. Prefer testing domain modules under `lib/` directly, then add route/action coverage when request handling, redirects, auth gates, or form parsing are part of the change.

Before considering code complete, run the smallest relevant test set first, then broaden based on risk. For shared behavior, migrations, queues, auth, billing, AI routing, or report exports, run:

```powershell
npm run typecheck
npm run test
npm run prisma:validate
```

Run `npm run build` for frontend, routing, server action, or production-readiness changes.

## Database And Migration Guidelines

Schema changes must update `prisma/schema.prisma`, add a migration under `prisma/migrations/`, and include tests or SQL inspection coverage when relevant. Reflect meaningful schema decisions in `docs/schema/schema-notes.md`.

Be careful with production data. Prefer additive migrations, explicit backfills, and idempotent operations. Do not guess when changing RLS, auth, credits, subscriptions, or destructive data paths.

## Spec-Driven Development Workflow

Use `context/current-feature.md` as the active implementation tracker. Before starting a feature:

- read `context/PRD.md`, `context/project-overview.md`, `context/coding-standards.md`, `context/design-systems.md`, and `context/ai-interactions.md`;
- select the relevant spec from `docs/specs/spec-index.md`;
- load or summarize the active spec in `context/current-feature.md`;
- update status, notes, impacted files, and verification plan;
- implement only the active spec unless the user explicitly reprioritizes;
- update `context/current-feature.md` after meaningful milestones.

## Git And Pull Request Guidelines

The repository remote is:

```powershell
git remote -v
```

Use the commit convention defined at the top of this file. State the exact commit message before committing.

Pull requests should describe the user-facing impact, list verification performed, link related specs/issues, mention migrations or env changes, and include screenshots when changing visual UI.

## Agent-Specific Instructions

Search before building. Read the relevant code path and tests before editing. Keep changes scoped to the requested behavior and avoid rewriting generated artifacts.

When a review or bug fix reveals related failures, stop and reason through the product model, data flow, and acceptance criteria before patching. Identify the root cause, make one coherent fix, and verify it with focused checks.

When unsure, state what is uncertain instead of guessing. The cost of asking is small; the cost of a wrong migration, leaked secret, or broken billing path is high.
