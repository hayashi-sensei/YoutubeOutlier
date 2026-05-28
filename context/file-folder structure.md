# File-Folder Structure

This proposed structure is based on `context/PRD.md`, `context/project-overview.md`, `context/coding-standards.md`, and `context/design-systems.md`. It assumes a root-level Next.js App Router application with Supabase, Prisma, Stripe, Resend, background jobs, AI providers, and an admin dashboard.

```text
YTResearch/
├─ app/
│  ├─ (public)/
│  ├─ (auth)/
│  │  ├─ sign-in/
│  │  └─ callback/
│  ├─ (app)/
│  │  ├─ dashboard/
│  │  ├─ competitors/
│  │  ├─ outliers/
│  │  ├─ topic-ideas/
│  │  ├─ reports/
│  │  ├─ content-studio/
│  │  ├─ calendar/
│  │  ├─ visual-studio/
│  │  └─ settings/
│  ├─ (admin)/
│  │  └─ admin/
│  │     ├─ users/
│  │     ├─ credits/
│  │     ├─ subscriptions/
│  │     ├─ jobs/
│  │     ├─ ai-usage/
│  │     ├─ providers/
│  │     ├─ reports/
│  │     ├─ youtube-quota/
│  │     ├─ sources/
│  │     ├─ prompt-configs/
│  │     ├─ limits/
│  │     └─ audit-logs/
│  ├─ api/
│  │  ├─ stripe/
│  │  ├─ webhooks/
│  │  ├─ exports/
│  │  └─ health/
│  ├─ globals.css
│  ├─ layout.tsx
│  └─ page.tsx
├─ actions/
│  ├─ competitors.ts
│  ├─ reports.ts
│  ├─ settings.ts
│  └─ billing.ts
├─ components/
│  ├─ ui/
│  ├─ app-shell/
│  ├─ shared/
│  ├─ features/
│  │  ├─ competitors/
│  │  ├─ reports/
│  │  ├─ content-workspace/
│  │  ├─ visual-studio/
│  │  └─ admin/
│  ├─ dashboard/
│  ├─ recommendations/
│  ├─ outliers/
│  ├─ reports/
│  └─ content-workspace/
├─ features/
│  ├─ auth/
│  ├─ workspaces/
│  ├─ settings/
│  ├─ billing/
│  ├─ credits/
│  ├─ competitors/
│  ├─ youtube/
│  ├─ transcripts/
│  ├─ outliers/
│  ├─ blueprints/
│  ├─ sources/
│  ├─ recommendations/
│  ├─ reports/
│  ├─ content-workspace/
│  ├─ scripts/
│  ├─ visual-generation/
│  ├─ repurposing/
│  ├─ calendar/
│  ├─ exports/
│  ├─ notifications/
│  └─ admin/
├─ lib/
│  ├─ ai/
│  │  ├─ model-router.ts
│  │  ├─ tasks/
│  │  ├─ prompts/
│  │  └─ providers/
│  ├─ image/
│  │  ├─ image-router.ts
│  │  └─ providers/
│  ├─ auth/
│  ├─ db/
│  ├─ email/
│  ├─ stripe/
│  ├─ storage/
│  ├─ supabase/
│  ├─ youtube/
│  ├─ scoring/
│  ├─ credits/
│  ├─ monitoring/
│  └─ utils/
├─ hooks/
│  ├─ use-credit-estimate.ts
│  └─ use-report-status.ts
├─ jobs/ or inngest/
│  ├─ youtube-channel-backfill.ts
│  ├─ youtube-recent-refresh.ts
│  ├─ video-metric-snapshot.ts
│  ├─ transcript-fetch.ts
│  ├─ video-analysis.ts
│  ├─ industry-source-refresh.ts
│  ├─ topic-recommendation-generate.ts
│  ├─ daily-report-generate.ts
│  ├─ manual-report-generate.ts
│  ├─ export-generate.ts
│  ├─ monthly-credit-refill.ts
│  └─ provider-cost-snapshot.ts
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ emails/
│  ├─ daily-report.tsx
│  ├─ export-ready.tsx
│  └─ billing-alert.tsx
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
├─ docs/
│  ├─ specs/
│  └─ schema/
├─ context/
│  ├─ PRD.md
│  ├─ project-overview.md
│  ├─ coding-standards.md
│  ├─ design-systems.md
│  ├─ current-feature.md
│  ├─ file-folder structure.md
│  └─ screenshots/
├─ public/
│  ├─ images/
│  └─ icons/
├─ scripts/
│  ├─ backfill.ts
│  ├─ sync-youtube.ts
│  └─ verify-env.ts
├─ config/
│  ├─ plans.ts
│  ├─ credit-costs.ts
│  ├─ providers.ts
│  └─ limits.ts
├─ types/
│  ├─ database.ts
│  ├─ api.ts
│  └─ domain.ts
├─ schemas/
│  ├─ competitors.ts
│  ├─ reports.ts
│  ├─ settings.ts
│  └─ billing.ts
├─ .env.example
├─ middleware.ts
├─ next.config.ts
├─ package.json
└─ tsconfig.json
```

## Folder Responsibilities

### `app/`

Contains Next.js routes, layouts, API endpoints, route groups, and `app/globals.css`. Product pages should mirror the main navigation from the project overview: Dashboard, Competitors, Outliers, Topic Ideas, Reports, Content Studio, Calendar, Visual Studio, Settings, and Admin. Tailwind CSS v4 theme configuration belongs in `app/globals.css` using `@theme`; do not create `tailwind.config.ts` or `tailwind.config.js`.

### `actions/`

Contains Server Actions grouped by feature. Use actions for form submissions and mutations. Validate all inputs with Zod schemas from `schemas/`, check authorization server-side, and return a consistent result shape.

### `components/`

Holds reusable React components. Keep shadcn/ui primitives in `components/ui/`, app shell pieces in `components/app-shell/`, shared non-shadcn components in `components/shared/`, and feature components in `components/features/[feature]/`.

### `features/`

Contains domain modules for core product behavior. Each feature should own queries, domain services, and feature-specific helpers. Server Actions live in `actions/`; validation schemas live in `schemas/`.

### `lib/`

Contains shared infrastructure clients and cross-feature services: Supabase, Prisma, Stripe, Resend, AI model routing, image routing, YouTube ingestion helpers, scoring utilities, credit checks, storage, and monitoring. Provider calls should go through routers or adapters, not directly from components.

### `jobs/`

Contains background jobs listed in the project overview, including YouTube refresh, transcript fetch, video analysis, daily reports, exports, credit refills, and provider cost snapshots. The final folder may be `jobs/` or `inngest/`, depending on the selected job runner.

### `prisma/`

Owns the production Prisma schema, migrations, and seeds. The planning schema in `docs/schema/prisma.schema` should be copied or migrated here when implementation begins.

### `config/`

Stores product rules that admins may later manage in-app: plan limits, credit costs, provider routing defaults, and feature limits.

### `schemas/`

Contains Zod schemas for user input, Server Actions, API routes, provider payloads, and structured AI outputs.

### `types/`

Contains shared TypeScript types. Use `types/[feature].ts` as the project grows; avoid leaking provider-specific response shapes into components.

### `tests/`

Use `unit/` for pure logic such as scoring and credit rules, `integration/` for database and provider boundaries, and `e2e/` for main user flows such as onboarding, competitor tracking, report generation, and billing.

### `context/`

Contains project guidance that must be read before implementation: PRD, project overview, coding standards, design system, active feature tracker, folder structure, and visual references.
