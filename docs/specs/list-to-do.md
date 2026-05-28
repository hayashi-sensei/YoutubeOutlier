# Integration To-Do

Use this checklist at the start of each spec. Mark an item when the current spec has implemented and verified that integration, and add a short note if the integration is only a placeholder, mock, or partial slice.

## Core Platform

- [x] Supabase Postgres through Prisma runtime
  - Specs: [001 App Foundation](./001-app-foundation.md)
  - Notes: Runtime connectivity is in place; schema hardening continues through later specs.
- [x] Supabase Auth
  - Specs: [002 Auth And User Settings](./002-auth-and-user-settings.md)
  - Notes: Email/password and Google OAuth flows are wired through Supabase.
- [x] Google OAuth
  - Specs: [002 Auth And User Settings](./002-auth-and-user-settings.md)
  - Notes: Used for sign-in/sign-up.
- [ ] Stripe billing
  - Specs: [003 Billing Credits And Plans](./003-billing-credits-and-plans.md)
  - Notes: Plan and credit foundations exist; verify live checkout, customer portal, and webhooks before ticking.
- [ ] Vercel deployment
  - Specs: [024 Production Readiness](./024-production-readiness.md)
  - Notes: Keep environment variables, build behavior, and deployment checks documented here when production setup starts.

## Research Data

- [x] YouTube channel URL parsing and competitor tracking
  - Specs: [005 Competitor Channel Tracking](./005-competitor-channel-tracking.md)
  - Notes: Workspace-scoped tracking with global channel reuse is implemented.
- [x] YouTube Data API metadata ingestion
  - Specs: [006 YouTube Ingestion](./006-youtube-ingestion.md)
  - Notes: Channel/video metadata, recent fetches, metric snapshots, and quota accounting are implemented.
- [x] YouTube quota accounting
  - Specs: [006 YouTube Ingestion](./006-youtube-ingestion.md), [022 Cost Controls And Quotas](./022-cost-controls-and-quotas.md)
  - Notes: Baseline reservation/accounting exists; hard quota degradation belongs in Spec 022.
- [x] Transcript provider abstraction
  - Specs: [007 Transcript Pipeline](./007-transcript-pipeline.md)
  - Notes: Local no-op provider and analysis contracts are in place; a live transcript provider still needs selection/configuration.
- [x] RSS and page extraction
  - Specs: [008 Industry Source Monitoring](./008-industry-source-monitoring.md)
  - Notes: Manual source fetches support RSS, alternate feed detection, candidate feed fallback, and HTML page fallback.
- [ ] Global source-item reuse
  - Specs: [008 Industry Source Monitoring](./008-industry-source-monitoring.md)
  - Notes: Current storage is per workspace source; add global dedupe if this becomes a cost or quality concern.

## Jobs And Monitoring

- [x] Job run logging
  - Specs: [004 Admin Foundation](./004-admin-foundation.md), [006 YouTube Ingestion](./006-youtube-ingestion.md), [007 Transcript Pipeline](./007-transcript-pipeline.md)
  - Notes: Core job log visibility and failure handling exist.
- [x] Background job runner
  - Specs: [009 Background Jobs And Monitoring](./009-background-jobs-and-monitoring.md)
  - Notes: First-party Prisma-backed queue, retry handling, worker endpoint, and admin retry visibility are implemented. Configure `YTRESEARCH_JOBS_SECRET` before wiring a cron trigger.
- [x] Scheduled jobs
  - Specs: [009 Background Jobs And Monitoring](./009-background-jobs-and-monitoring.md), [019 Daily And Manual Reports](./019-daily-and-manual-reports.md)
  - Notes: Scheduler enqueues due YouTube refreshes, source refreshes, transcript fetches, and daily report placeholders only for enabled workspaces. Full report content generation remains in Spec 019.
- [ ] Provider monitoring and alerting
  - Specs: [004 Admin Foundation](./004-admin-foundation.md), [022 Cost Controls And Quotas](./022-cost-controls-and-quotas.md), [024 Production Readiness](./024-production-readiness.md)
  - Notes: Admin visibility exists; production-grade external monitoring is not complete.

## AI Providers

- [ ] Vercel AI SDK model router
  - Specs: [013 AI Model Router](./013-ai-model-router.md)
  - Notes: Needed before production AI calls are centralized.
- [ ] OpenAI text generation
  - Specs: [012 Topic Recommendation Engine](./012-topic-recommendation-engine.md), [015 Script Generation](./015-script-generation.md), [019 Daily And Manual Reports](./019-daily-and-manual-reports.md)
  - Notes: Use through the router once Spec 013 lands.
- [ ] Anthropic or secondary text provider
  - Specs: [013 AI Model Router](./013-ai-model-router.md), [022 Cost Controls And Quotas](./022-cost-controls-and-quotas.md)
  - Notes: Intended for fallback/routing, not direct feature calls.
- [x] OpenAI image generation
  - Specs: [016 Visual Generation Studio](./016-visual-generation-studio.md)
  - Notes: Visual Studio routes image generation through the centralized image router, with the standard route using OpenAI image models and alternate Google/PiAPI routes available through quality/provider selection. Live use still requires the relevant provider environment variables.
- [ ] Vector search or embeddings
  - Specs: [011 Competitor Blueprint Analysis](./011-competitor-blueprint-analysis.md), [012 Topic Recommendation Engine](./012-topic-recommendation-engine.md)
  - Notes: Project overview calls out pgvector; implement only when the intelligence layer needs it.

## Content And Delivery

- [ ] Asset storage
  - Specs: [016 Visual Generation Studio](./016-visual-generation-studio.md), [020 PDF DOCX Exports](./020-pdf-docx-exports.md)
  - Notes: Spec 016 saves visual metadata, editable overlays, generated preview data URLs, and traceable `storagePath` values on `VisualAsset`. External Supabase Storage or S3-compatible object upload remains unticked until production storage credentials and bucket policy are configured.
- [ ] Calendar integration inside the app
  - Specs: [018 Content Calendar](./018-content-calendar.md)
  - Notes: Internal content calendar, not external Google Calendar unless explicitly added later.
- [ ] PDF export
  - Specs: [020 PDF DOCX Exports](./020-pdf-docx-exports.md)
  - Notes: Spec 020 adds branded PDF rendering, background `export_generate` jobs, access-controlled expiring download links, and local file persistence under `outputs/report_exports`. Keep unchecked until production object storage is configured.
- [ ] DOCX export
  - Specs: [020 PDF DOCX Exports](./020-pdf-docx-exports.md)
  - Notes: Spec 020 adds branded DOCX rendering, background `export_generate` jobs, access-controlled expiring download links, and local file persistence under `outputs/report_exports`. Keep unchecked until production object storage is configured.
- [x] Resend email delivery
  - Specs: [021 Email Notifications](./021-email-notifications.md)
  - Notes: Spec 021 adds a Resend-backed app email boundary using `RESEND_API_KEY` and `RESEND_FROM_EMAIL` or `EMAIL_FROM`, logs every delivery attempt to `EmailLog`, sends daily report emails only when report preferences are enabled, and sends export-ready notifications from the export job. Auth emails can still use Supabase SMTP.
- [ ] Billing email triggers
  - Specs: [003 Billing Credits And Plans](./003-billing-credits-and-plans.md), [021 Email Notifications](./021-email-notifications.md), [024 Production Readiness](./024-production-readiness.md)
  - Notes: Spec 021 includes the billing notification email helper/template, but live billing emails should be wired at the tail end when Stripe checkout, customer portal, and webhooks are completed and tested. Candidate triggers include subscription activation, payment failure, cancellation, renewal/refill, and credit-pack purchase receipt.
- [ ] React Email templates
  - Specs: [021 Email Notifications](./021-email-notifications.md)
  - Notes: Spec 021 uses local HTML/text template functions for report, export-ready, and billing notification content to avoid adding another rendering dependency before production email design. Replace with React Email if branded component templates become necessary.

## Security And Compliance

- [x] Supabase RLS review
  - Specs: [023 Security RLS And Compliance](./023-security-rls-and-compliance.md)
  - Notes: Spec 023 adds explicit authenticated read policies for workspace-scoped tables, admin-readable policies for operational tables, and workspace-prefixed Supabase Storage policies. Browser-authenticated direct table writes remain blocked so mutations keep flowing through audited server actions. Re-run policy verification before production if new tables are added.
- [x] Provider secret and environment audit
  - Specs: [023 Security RLS And Compliance](./023-security-rls-and-compliance.md), [024 Production Readiness](./024-production-readiness.md)
  - Notes: Spec 023 confirms client code uses only `NEXT_PUBLIC_SUPABASE_*` publishable configuration while provider, cron, email, and database secrets remain server-only environment variables. Re-check deployed environment configuration during Spec 024.
- [ ] Production smoke checks
  - Specs: [024 Production Readiness](./024-production-readiness.md)
  - Notes: Include auth, billing, ingestion, AI generation, exports, email, and admin monitoring.
