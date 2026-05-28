# Coding Standards — YTResearch

> These standards are mandatory for all YTResearch implementation work. Read this file before writing code.
>
> The product is a serious SaaS with billing, credits, background jobs, AI generation, reports, and user-owned data. Code should favor correctness, auditability, provider abstraction, and cost control over clever shortcuts.

---

## 1. TypeScript

- Strict mode enabled. Non-negotiable.
- No `any`. Use precise types or `unknown` with safe narrowing.
- Define types for all props, server action inputs, API responses, provider payloads, and database-derived view models.
- Use inference where obvious; add explicit return types for exported functions, server actions, provider adapters, and job handlers.
- Prefer discriminated unions for statuses and provider results.
- Avoid broad `Record<string, unknown>` except at integration boundaries.
- All shared types live in `types/[feature].ts`.
- Zod schemas live near the boundary that validates them, usually `schemas/[feature].ts`.
- Derived UI types should not leak provider-specific API response shapes into components.

Example:

```ts
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };
```

---

## 2. React

- Functional components only.
- Server Components by default.
- Keep components focused: one component, one job.
- Extract reusable stateful logic into `hooks/`.
- Keep presentational components free of direct database/provider calls.
- Prefer composition over prop drilling through many layers.
- Use stable dimensions for dashboards, cards, tables, image previews, and score widgets to avoid layout shift.
- AI-generated markdown must be rendered through a markdown-safe component, not raw text.
- Use accessible labels for all icon-only buttons.

Client components are allowed only when needed for:

- User interaction
- Local state
- Browser APIs
- Streaming UI
- Forms requiring client-side behavior
- Charts that cannot render server-side

---

## 3. Next.js

- Use Next.js App Router.
- Server Components by default.
- Add `'use client'` only where required.
- Use route groups for public, app, admin, and auth areas.
- Fetch data directly in Server Components when possible.
- Use Server Actions for form submissions and mutations.
- Use API routes only for:
  - Stripe webhooks
  - Resend webhooks, if needed
  - Cron/job triggers
  - File uploads requiring special handling
  - Long-running operations that cannot be Server Actions
  - Third-party integrations needing custom HTTP behavior
  - Streaming AI endpoints
- Dynamic routes should be used for item/collection pages.
- Never put service-role database access in client components.

Recommended route structure:

```text
app/
  (public)/
  (auth)/
  (app)/dashboard/
  (app)/competitors/
  (app)/outliers/
  (app)/topic-ideas/
  (app)/reports/
  (app)/content-studio/
  (app)/calendar/
  (app)/visual-studio/
  (app)/settings/
  (admin)/admin/
```

---

## 4. Tailwind CSS v4 And Styling

YTResearch uses Tailwind CSS v4 with CSS-first configuration.

- Do not create `tailwind.config.ts`.
- Do not create `tailwind.config.js`.
- Theme configuration belongs in `app/globals.css` with `@theme`.
- Use CSS variables from `context/design-systems.md`.
- Do not scatter raw hex colors through components.
- No inline styles except for safe dynamic values such as chart widths, progress widths, or generated coordinates.
- Use shadcn/ui components where applicable.
- Do not edit shadcn-generated primitives directly unless the project intentionally owns that component.
- New UI must follow `context/design-systems.md`.

Example:

```css
@import "tailwindcss";

@theme {
  --color-yt-bg: var(--yt-bg);
  --color-yt-primary: var(--yt-primary);
  --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
}
```

Styling rules:

- Light mode first.
- Dark mode can be added later.
- Cards use 8px radius unless the design system says otherwise.
- Avoid decorative gradient blobs/orbs.
- Dashboards should be dense, calm, and operational.

---

## 5. File Organization

No `src/` directory unless deliberately chosen before project bootstrap. Use root-level structure.

```text
actions/[feature].ts
app/[route]/page.tsx
components/app-shell/
components/dashboard/
components/features/[feature]/
components/shared/
components/ui/
context/
hooks/
inngest/ or jobs/
lib/
lib/ai/
lib/ai/tasks/
lib/ai/providers/
lib/image/
lib/image/providers/
lib/youtube/
lib/billing/
lib/email/
lib/reports/
lib/storage/
prisma/
schemas/
types/
```

Rules:

- Routes live under `app/`.
- Server Actions live in `actions/[feature].ts`.
- Feature components live in `components/features/[feature]/`.
- App shell components live in `components/app-shell/`.
- Shared non-shadcn components live in `components/shared/`.
- shadcn primitives live in `components/ui/`.
- Provider clients live in `lib/[provider-or-domain]/`.
- AI task orchestration lives in `lib/ai/tasks/`.
- Image provider adapters live in `lib/image/providers/`.
- No circular imports between `lib/`, `actions/`, and `components/`.

---

## 6. Naming

- Components: PascalCase, e.g. `RecommendedTopicsPanel.tsx`.
- Hooks: camelCase with `use` prefix, e.g. `useCreditEstimate.ts`.
- Non-component files: kebab-case, e.g. `topic-recommendation.ts`.
- Functions and variables: camelCase.
- Constants: UPPER_SNAKE_CASE.
- Types and interfaces: PascalCase, no `I` prefix.
- Enum-like constants: UPPER_SNAKE_CASE object or TypeScript enum only when useful.
- Database tables: snake_case in SQL; Prisma models use PascalCase.
- Branches: `feat/spec-XX-short-name`.
- Commits: `[SPEC-XX] Short imperative description`.

---

## 7. Database And Prisma

- Neon Postgres is the database host.
- Prisma is the ORM and migration tool.
- All schema changes go through migrations.
- Never use `prisma db push` for this project.
- Never make untracked production schema changes.
- Never edit applied migration files.
- Use the repo migration workflow with Neon's direct non-pooled `DIRECT_URL` for migration execution.
- Use Neon's pooled `DATABASE_URL` for application runtime.
- Use `@default(cuid())` unless the auth integration requires UUID alignment.
- Add `createdAt` and `updatedAt` to mutable application tables.
- Use indexes for dashboard, report, job, and usage queries.
- Use transactions for credit deductions, balance updates, and job state transitions.
- Store global YouTube data separately from user-owned workspace data.
- Do not duplicate global YouTube channels/videos per user.

Important:

- Supabase Auth creates users in `auth.users`.
- If using Supabase Auth, decide early whether app `User.id` mirrors Supabase Auth UUID.
- Do not rely on user-editable metadata for authorization.

---

## 8. Database Security And RLS

- Enable RLS on all exposed tables.
- User-owned tables must be scoped by workspace membership.
- Service role key is server-only.
- Do not expose service role, secret keys, provider API keys, or webhook secrets to the browser.
- Admin access must use server-controlled role data, not user-editable metadata.
- Storage objects must be scoped by workspace/user.
- Views exposed directly to browser-authenticated clients must not bypass RLS unintentionally.

RLS applies especially to:

- Workspaces
- Settings
- Tracked channels
- Industry sources
- Reports
- Recommendations
- Content items
- Content assets
- Visual assets
- Credit transactions
- AI generations
- Export files

---

## 9. Data Fetching And Mutations

- Server Components fetch data directly through server-side data access functions.
- Client Components call Server Actions or typed API endpoints.
- Validate all external/user inputs with Zod.
- Server Actions return a consistent result shape.
- Mutations must check authorization server-side.
- Mutations that consume credits must be atomic.
- Never trust client-provided credit costs, user IDs, workspace IDs, or plan limits.

Recommended action result:

```ts
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };
```

---

## 10. AI Integration

- All text AI calls go through `lib/ai/model-router.ts`.
- All image generation calls go through `lib/image/image-router.ts`.
- Do not call OpenAI, Anthropic, Gemini, fal.ai, Nano Banana, or other providers directly from components or random actions.
- Use Vercel AI SDK for text generation, structured output, streaming, and model routing.
- Use direct provider adapters only where Vercel AI SDK is not the right abstraction, especially specialty image providers.
- Use structured output schemas for analysis, classification, recommendations, reports, and extraction tasks.
- Every AI call must log:
  - workspace ID
  - user ID if available
  - task type
  - provider
  - model
  - status
  - token/image usage where available
  - estimated cost
  - credits charged
  - error message if failed
- Prompt templates, model assignment, and credit costs should be configurable, not scattered hardcoded values.
- Expensive user-facing AI actions must show credit cost before execution.

Task examples:

```text
video_classification
transcript_summary
outlier_explanation
topic_recommendation
daily_report
outline_generation
script_generation
linkedin_repurpose
thumbnail_prompt
image_generation
```

---

## 11. Credit And Billing Logic

- Stripe is the billing source of truth.
- App database stores synced subscription state for product access decisions.
- Webhooks must be idempotent.
- Every paid task checks credits before execution.
- Deduct credits only inside a transaction.
- Prefer deduct-after-success for generation tasks unless provider cost is incurred before result is known.
- Failed tasks should not charge credits unless a clear policy says otherwise.
- Monthly plan credits refill and do not roll over.
- Extra credit purchase expiry policy must be encoded explicitly once finalized.
- Admin credit adjustments require an audit log reason.
- Never let the client decide credit balance or charge amount.

---

## 12. Background Jobs

- Use a durable job system such as Inngest or Trigger.dev.
- Do not run long research/report jobs inside normal page requests.
- Every job writes a `JobRun` record or equivalent job log.
- Jobs must be retry-safe or explicitly non-retryable.
- Jobs should be idempotent where possible.
- Store `referenceType` and `referenceId` for traceability.
- Failed jobs must be visible in admin.
- Manual retry should be possible for important jobs.
- Daily reports run only for users who enable them.
- No silent cron failures.

Critical jobs:

- YouTube channel backfill
- Recent video refresh
- Video metric snapshot
- Transcript fetch
- Video analysis
- Industry source refresh
- Topic recommendation generation
- Daily report generation
- Manual report generation
- Export generation
- Monthly credit refill
- Provider cost snapshot

---

## 13. YouTube And Data Providers

- Official YouTube Data API should be used for metadata where practical.
- YouTube RSS may be used for upload detection.
- Transcript provider must be abstracted behind an adapter.
- Never assume transcripts are available.
- Fallback to metadata-only analysis when transcripts are unavailable.
- Cache global channel/video data.
- Track provider quota and freshness.
- Avoid expensive YouTube API calls when lower-cost alternatives work.
- Do not scrape in ways that create unacceptable compliance risk.

Provider abstraction shape:

```ts
interface TranscriptProvider {
  fetchTranscript(input: { youtubeVideoId: string; url?: string }): Promise<TranscriptResult>;
}
```

---

## 14. Reports And Exports

- Reports are generated as structured data first, rendered second.
- Store report sections as JSON plus display-ready summary text.
- PDF/DOCX exports run in background jobs.
- Export links must be access-controlled or expiring.
- User branding should be applied at export time.
- Export failures must be logged.
- Do not block the UI while an export is running.

---

## 15. Error Handling

- All Server Actions and API routes must use try/catch.
- Return structured errors.
- Log server errors with enough context to debug.
- User-facing errors should be clear and actionable.
- Never silently swallow provider failures.
- Never expose secrets, raw provider credentials, or sensitive stack traces to the client.

Recommended error shape:

```ts
{
  error: string;
  code: string;
  retryable?: boolean;
}
```

---

## 16. Logging And Monitoring

- No casual `console.log` in committed code.
- Use structured logging or approved logger.
- `console.warn` and `console.error` are acceptable only when no logger exists yet.
- Track:
  - AI costs
  - Image costs
  - Transcript success rate
  - YouTube quota pressure
  - Job failures
  - Report generation latency
  - Export failures
  - Stripe webhook errors
  - Credit deduction failures
- Sentry should capture unexpected exceptions.
- PostHog should capture product usage events.

---

## 17. Testing And Verification

Minimum test coverage should match risk.

Required tests for:

- Credit deduction and refill logic
- Stripe webhook idempotency
- Authorization/workspace scoping
- Outlier score calculation
- Topic recommendation schema parsing
- AI model router fallback behavior
- Job retry/idempotency behavior
- Report/export creation

Frontend verification:

- Use browser testing for major dashboard and content flows.
- Check responsive layouts at desktop and mobile widths.
- Confirm text does not overflow buttons/cards.
- Confirm generated image previews are nonblank.

Before merge:

- Zero TypeScript errors
- Zero lint warnings
- Relevant tests pass
- No unrelated formatting churn
- No commented-out code
- No unused imports or variables

---

## 18. Performance

- Avoid fetching large transcripts into initial dashboard loads.
- Paginate long tables.
- Use select projections instead of loading entire records.
- Use indexes for dashboard queries.
- Cache global YouTube data.
- Defer expensive AI/report/export work to jobs.
- Stream long user-facing AI generations.
- Avoid unnecessary client-side bundles.
- Keep chart libraries lightweight.

---

## 19. Accessibility

- Buttons and controls require accessible names.
- Icon-only buttons require `aria-label` and tooltips.
- Inputs require labels.
- Status cannot rely only on color.
- Tables require proper headers.
- Dialogs/drawers must trap focus.
- Focus states must be visible.
- AI-generated content regions should have sensible headings.

---

## 20. Code Quality

- No commented-out code.
- No unused imports or variables.
- No dead files.
- No `any`.
- No duplicate provider calls outside routers.
- Functions should generally stay under 50 lines when practical.
- Split complex orchestration into named helpers.
- Prefer boring, readable code.
- Avoid premature abstractions, but abstract provider boundaries early.
- Keep changes scoped to the active spec.
- Do not mix unrelated refactors with feature implementation.

---

## 21. Security Rules

- Never commit secrets.
- Never expose service role keys.
- Never trust client-provided authorization data.
- Never trust client-provided prices, credit costs, or balances.
- Verify Stripe signatures on webhooks.
- Validate all inbound webhook payloads.
- Rate-limit expensive endpoints.
- Protect admin routes server-side.
- Audit admin mutations.
- Sanitize rendered user-provided markdown where applicable.

---

## 22. Build Order Discipline

Implementation should follow the spec index:

```text
docs/specs/spec-index.md
```

For each spec:

1. Read the spec.
2. Identify impacted files.
3. Implement the smallest complete vertical slice.
4. Add/adjust tests for risky logic.
5. Verify locally.
6. Update docs only if behavior changed.

Do not skip billing, credits, admin logging, or provider cost logging on AI features. Those are product foundations, not polish.

