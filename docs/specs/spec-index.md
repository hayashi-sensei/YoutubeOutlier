# YTResearch Spec Index

This is the spec-driven development breakdown for YTResearch.

The product should be built in phases, but the architecture should be SaaS-ready from the beginning.

Before starting a spec, review and update the [Integration To-Do](./list-to-do.md) checklist for any external service, provider, job, export, or platform dependency the spec touches.

## Phase 0: Foundation

1. [001 App Foundation](./001-app-foundation.md)
2. [002 Auth And User Settings](./002-auth-and-user-settings.md)
3. [003 Billing Credits And Plans](./003-billing-credits-and-plans.md)
4. [004 Admin Foundation](./004-admin-foundation.md)

## Phase 1: Research Data Layer

5. [005 Competitor Channel Tracking](./005-competitor-channel-tracking.md)
6. [006 YouTube Ingestion](./006-youtube-ingestion.md)
7. [007 Transcript Pipeline](./007-transcript-pipeline.md)
8. [008 Industry Source Monitoring](./008-industry-source-monitoring.md)
9. [009 Background Jobs And Monitoring](./009-background-jobs-and-monitoring.md)

## Phase 2: Intelligence Layer

10. [010 Outlier Scoring](./010-outlier-scoring.md)
11. [011 Competitor Blueprint Analysis](./011-competitor-blueprint-analysis.md)
12. [012 Topic Recommendation Engine](./012-topic-recommendation-engine.md)
13. [013 AI Model Router](./013-ai-model-router.md)

## Phase 2.5: UX Consolidation

13A. [013A UX Consolidation Before Content Production](./013a-ux-consolidation-before-content-production.md)

## Phase 3: Content Production

14. [014 Content Workspace](./014-content-workspace.md)
15. [015 Script Generation](./015-script-generation.md)
16. [016 Visual Generation Studio](./016-visual-generation-studio.md)
17. [017 Repurposing Studio](./017-repurposing-studio.md)
18. [018 Content Calendar](./018-content-calendar.md)

## Phase 4: Reports And Exports

19. [019 Daily And Manual Reports](./019-daily-and-manual-reports.md)
20. [020 PDF DOCX Exports](./020-pdf-docx-exports.md)
21. [021 Email Notifications](./021-email-notifications.md)

## Phase 5: Scale And Hardening

22. [022 Cost Controls And Quotas](./022-cost-controls-and-quotas.md)
23. [023 Security RLS And Compliance](./023-security-rls-and-compliance.md)
24. [024 Production Readiness](./024-production-readiness.md)

## Phase 6: Infrastructure Migration

25. [025 Neon Database Migration](./025-neon-database-migration.md)
26. [026 Auth.js Google OAuth](./026-authjs-google-oauth.md)
27. [027 Cloudflare R2 Storage](./027-cloudflare-r2-storage.md)
28. [028 Auth.js Email Password Auth](./028-authjs-email-password.md)

## Recommended Build Order

1. App foundation
2. Auth and user settings
3. Billing credits and plans
4. Competitor channel tracking
5. YouTube ingestion
6. AI model router
7. Outlier scoring
8. Topic recommendation engine
9. UX consolidation before content production
10. Content workspace
11. Reports
12. Calendar
13. Visual generation
14. Repurposing
15. Admin and monitoring hardening
16. Neon database migration
17. Auth.js Google OAuth
18. Cloudflare R2 storage
19. Auth.js email/password auth
