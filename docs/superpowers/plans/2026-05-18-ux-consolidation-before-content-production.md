# UX Consolidation Before Content Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make workspaces first-class research accounts, upgrade competitor UX into per-channel intelligence, and add an experimental topic-idea lane before Spec 014 content production begins.

**Architecture:** Add the entitlement foundation first, then route the app through an explicit selected workspace context. Keep global YouTube data shared, keep research data workspace-scoped, and introduce account-level credit presentation without rewriting every credit mutation in the first slice. Competitor intelligence should be a read-first vertical slice that reuses current outlier, blueprint, and job data.

**Tech Stack:** Next.js App Router, React Server Components, Server Actions, Prisma, Supabase Auth, Tailwind CSS v4, Vitest.

---

## File Structure

- Modify `prisma/schema.prisma`: add `PlanLimit.maxWorkspaces` and add any minimal fields needed for selected workspace support.
- Add migration under `prisma/migrations/0014_ux_workspace_limits/`.
- Modify `lib/billing/plans.ts` and `lib/billing/plan-limits.ts`: include `maxWorkspaces` in definitions, overrides, and effective entitlement.
- Modify `actions/admin.ts` and `app/(admin)/app/admin/page.tsx`: admin can edit workspace limits.
- Add `lib/workspaces/selection.ts`: resolve the active workspace for a user, falling back to default or first membership.
- Add `schemas/workspaces.ts`, `actions/workspaces.ts`, and `types/workspaces.ts`: create/switch workspace actions and validated input.
- Modify `lib/auth/bootstrap.ts`: preserve `defaultWorkspaceId` and do not always return the first owned workspace.
- Modify `components/app-shell/app-shell.tsx`: render workspace switcher, create-workspace entry point, and account-level credit framing.
- Modify `app/(app)/app/settings/page.tsx`: show workspace-specific settings and workspace creation state.
- Modify `app/(app)/app/competitors/page.tsx` and `components/competitors/tracked-channel-list.tsx`: add channel intelligence links and better stats.
- Add `app/(app)/app/competitors/[trackedChannelId]/page.tsx`: per-channel intelligence page.
- Add `lib/competitors/channel-intelligence.ts` and `types/competitor-intelligence.ts`: focused query/model for channel detail data.
- Modify `lib/recommendations/runner.ts`, `types/recommendations.ts`, `schemas/ai-recommendations.ts`, and `actions/recommendations.ts`: support experimental "Try New Things" generation mode.
- Modify `app/(app)/app/topic-ideas/page.tsx`: show standard recommendations and a separate Try New Things panel.
- Add or update tests under `tests/billing/`, `tests/workspaces/`, `tests/competitors/`, and `tests/recommendations/`.

---

### Task 1: Plan Limit Foundation

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0014_ux_workspace_limits/migration.sql`
- Modify: `lib/billing/plans.ts`
- Modify: `lib/billing/plan-limits.ts`
- Modify: `tests/billing/plans.test.ts`
- Modify: `tests/billing/plan-limits.test.ts`

- [ ] **Step 1: Write tests for `maxWorkspaces` defaults**

Add assertions that Starter allows 1 workspace, Pro allows 5, Premium allows 10, and admin effective entitlement is at least 10.

- [ ] **Step 2: Run tests to confirm failure**

Run: `npm run test -- tests/billing/plans.test.ts tests/billing/plan-limits.test.ts`

Expected: tests fail because `maxWorkspaces` does not exist yet.

- [ ] **Step 3: Add schema and migration**

Add `maxWorkspaces Int @default(1)` to `PlanLimit`.

Migration SQL:

```sql
ALTER TABLE "PlanLimit"
ADD COLUMN "maxWorkspaces" INTEGER NOT NULL DEFAULT 1;

UPDATE "PlanLimit"
SET "maxWorkspaces" = CASE "planCode"
  WHEN 'FREE' THEN 0
  WHEN 'STARTER' THEN 1
  WHEN 'PRO' THEN 5
  WHEN 'PREMIUM' THEN 10
  ELSE 1
END;
```

- [ ] **Step 4: Update billing types and defaults**

Add `maxWorkspaces` to `PlanDefinition`, `PlanLimitOverride`, `PLAN_DEFINITIONS`, `ADMIN_PLAN_ENTITLEMENT`, `mergePlanLimitOverrides`, and `getEffectivePlanEntitlement`.

- [ ] **Step 5: Update plan limit queries**

Select, merge, and upsert `maxWorkspaces` in `lib/billing/plan-limits.ts`.

- [ ] **Step 6: Verify**

Run: `npm run prisma:validate`, `npm run prisma:generate`, and `npm run test -- tests/billing/plans.test.ts tests/billing/plan-limits.test.ts`

Expected: Prisma validates and billing tests pass.

---

### Task 2: Admin Workspace Limit UX

**Files:**
- Modify: `actions/admin.ts`
- Modify: `app/(admin)/app/admin/page.tsx`
- Modify: `tests/admin/overview.test.ts` if plan-definition shape is asserted

- [ ] **Step 1: Validate `maxWorkspaces` input**

In `updatePlanLimits`, parse `${plan.code}_maxWorkspaces`, require a non-negative integer, and include it in each limit row.

- [ ] **Step 2: Add Admin table column**

Add a "Workspaces" column to Plan Limits with an input named `${plan.code}_maxWorkspaces`.

- [ ] **Step 3: Update help copy**

Change the Plan Limits description to mention monthly credits, workspace limits, and competitor channel limits.

- [ ] **Step 4: Verify**

Run: `npm run typecheck` and `npm run test -- tests/billing/plan-limits.test.ts`.

Expected: no type errors; existing admin plan updates still compile.

---

### Task 3: Workspace Selection And Creation

**Files:**
- Create: `types/workspaces.ts`
- Create: `schemas/workspaces.ts`
- Create: `lib/workspaces/selection.ts`
- Create: `actions/workspaces.ts`
- Modify: `lib/auth/bootstrap.ts`
- Modify: `components/app-shell/app-shell.tsx`
- Modify: `app/(app)/app/settings/page.tsx`
- Create: `tests/workspaces/selection.test.ts`
- Create: `tests/workspaces/actions.test.ts`

- [ ] **Step 1: Define workspace view models**

Create types for `WorkspaceSwitcherItem`, `WorkspaceCreateInput`, and `ActiveWorkspaceContext`.

- [ ] **Step 2: Define create workspace schema**

Require `name`, `primaryNiche`, and optional `targetAudience`. Trim values and reject empty names/niches.

- [ ] **Step 3: Implement active workspace resolution**

Resolve in this order: explicit selected workspace ID, user's `defaultWorkspaceId` if membership exists, first workspace membership by creation date. Return workspace list and entitlement.

- [ ] **Step 4: Implement create workspace action**

Use Supabase auth, bootstrap app user, check effective `maxWorkspaces`, create `Workspace`, `WorkspaceSettings`, `WorkspaceMember`, set `User.defaultWorkspaceId`, revalidate app paths, and redirect to Settings with a success flag.

- [ ] **Step 5: Implement switch workspace action**

Validate workspace membership, update `User.defaultWorkspaceId`, revalidate app paths, and redirect back to the current page or dashboard.

- [ ] **Step 6: Update app shell**

Render a workspace selector and a create-workspace control. Keep account/user controls compact and label credits as account-level.

- [ ] **Step 7: Update settings page**

Show a workspace section with current workspace identity, workspace-specific market settings, and a create-workspace form disabled when the limit is reached.

- [ ] **Step 8: Verify**

Run: `npm run test -- tests/workspaces/selection.test.ts tests/workspaces/actions.test.ts`, `npm run typecheck`, and browser smoke check `/app/settings`.

Expected: user can create up to the configured limit and switch active workspace.

---

### Task 4: Competitor Channel Intelligence

**Files:**
- Create: `types/competitor-intelligence.ts`
- Create: `lib/competitors/channel-intelligence.ts`
- Add: `app/(app)/app/competitors/[trackedChannelId]/page.tsx`
- Modify: `components/competitors/tracked-channel-list.tsx`
- Modify: `app/(app)/app/competitors/page.tsx`
- Create: `tests/competitors/channel-intelligence.test.ts`

- [ ] **Step 1: Write query tests**

Assert that channel intelligence is scoped by workspace membership, returns channel metadata, latest ingestion job, baseline stats, top outliers, and current blueprint.

- [ ] **Step 2: Implement query helper**

Create one server-side helper that accepts `workspaceId` and `trackedChannelId`, rejects channels outside the workspace, and returns a compact typed model.

- [ ] **Step 3: Add competitor detail route**

Render channel header, stats, freshness, top outliers, current blueprint, regenerate blueprint button, and suggest topics button. Use existing actions where available and disable future actions with clear copy only if the backing mutation does not exist yet.

- [ ] **Step 4: Link from list**

Add "View Intelligence" to active channel rows and preserve Fetch Videos, Archive, and Restore actions.

- [ ] **Step 5: Verify**

Run: `npm run test -- tests/competitors/channel-intelligence.test.ts`, `npm run typecheck`, and browser smoke check `/app/competitors`.

Expected: tracked channels link to a useful per-channel intelligence page.

---

### Task 5: Try New Things Topic Ideas

**Files:**
- Modify: `types/recommendations.ts`
- Modify: `schemas/ai-recommendations.ts`
- Modify: `lib/recommendations/runner.ts`
- Modify: `actions/recommendations.ts`
- Modify: `app/(app)/app/topic-ideas/page.tsx`
- Modify: `tests/recommendations/runner.test.ts`
- Modify: `tests/recommendations/generator.test.ts`

- [ ] **Step 1: Add generation mode**

Add a mode value such as `"standard" | "experimental"` to the runner input and prompt metadata.

- [ ] **Step 2: Add experimental prompt instruction**

For experimental mode, request exactly 5 ideas that are evidence-backed but more novel, contrarian, format-driven, or emerging-pattern focused.

- [ ] **Step 3: Persist distinguishable recommendations**

Use evidence type or metadata currently available in the schema. If schema support is insufficient, add a minimal field through migration only if needed.

- [ ] **Step 4: Add action**

Add a `generateExperimentalTopicRecommendations` action that calls the runner in experimental mode and redirects to `/app/topic-ideas`.

- [ ] **Step 5: Update UI**

Add a "Try New Things" section with its own generate button and a separate list of the latest experimental recommendations.

- [ ] **Step 6: Verify**

Run: `npm run test -- tests/recommendations/runner.test.ts tests/recommendations/generator.test.ts`, `npm run typecheck`, and browser smoke check `/app/topic-ideas`.

Expected: standard and experimental recommendations are visually distinct.

---

### Task 6: Full Verification

**Files:**
- Review: `context/current-feature.md`
- Review: `docs/specs/013a-ux-consolidation-before-content-production.md`

- [ ] **Step 1: Run core verification**

Run: `npm run prisma:validate`, `npm run prisma:generate`, `npm run test`, `npm run typecheck`, and `npm run build`.

- [ ] **Step 2: Run browser smoke checks**

Open `http://127.0.0.1:3001/app/settings`, `/app/competitors`, `/app/topic-ideas`, and at least one competitor intelligence detail page.

- [ ] **Step 3: Update tracker**

Update `context/current-feature.md` History with completed implementation notes and verification results.

- [ ] **Step 4: Final diff review**

Run: `git diff --stat` and `git diff --check`.

Expected: no whitespace errors and changes are scoped to Spec 013A.
