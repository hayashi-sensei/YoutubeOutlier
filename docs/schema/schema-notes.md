# Schema Notes

## Design Principles

The schema separates global research data from user-owned SaaS data.

Global data:

- `YoutubeChannel`
- `YoutubeVideo`
- `VideoMetricSnapshot`
- `YoutubeQuotaUsage`
- `VideoTranscript`
- `VideoAnalysis`
- `OutlierScore`

User/workspace data:

- `Workspace`
- `WorkspaceSettings`
- `TrackedChannel`
- `IndustrySource`
- `ResearchReport`
- `TopicRecommendation`
- `WorkspaceVideoOpportunityScore`
- `CompetitorBlueprint`
- `ContentItem`
- `VisualAsset`

Account-level SaaS data:

- billing plan and subscription state
- shared credit balance
- `CreditTransaction`
- shared calendar view across the user's workspaces

This matters because many users may track the same competitor. The app should fetch and store that competitor once, then let many workspaces reference it.

Workspaces are separate research accounts under one email login. Each workspace owns its own niche, audience, settings, competitors, industry sources, reports, topic ideas, outlier opportunity context, and competitor blueprints. Credits and calendar visibility are shared across the email account, with workspace filters where useful.

## Supabase RLS Guidance

Enable RLS on all exposed public tables.

Spec 023 adds migration `0025_security_rls_and_compliance`, which defines `yt_app` helper functions that map `auth.uid()` to the application `User.supabaseUserId`, check workspace membership through server-controlled app tables, and check admin access through `User.role`. RLS policies must not depend on user-editable Supabase metadata.

User-owned tables should be scoped by workspace membership:

- `Workspace`
- `WorkspaceSettings`
- `TrackedChannel`
- `IndustrySource`
- `ResearchReport`
- `TopicRecommendation`
- `WorkspaceVideoOpportunityScore`
- `CompetitorBlueprint`
- `ContentItem`
- `ContentAsset`
- `VisualAsset`
- `CreditTransaction`
- `AiGeneration`
- `JobRun`
- `ExportFile`
- `EmailLog`

Global YouTube tables can be server-managed. If exposed through the client, use restrictive read policies and avoid write access from clients.

Browser-authenticated table access is read-only through RLS. Application mutations must continue to flow through server actions and Prisma so validation, credit checks, provider cost logging, and audit logs cannot be bypassed with the publishable Supabase key.

Admin/operational tables such as `PlanLimit`, `UserRoleLimit`, `AiTaskRouteOverride`, `AdminAuditLog`, and `YoutubeQuotaUsage` are admin-readable through RLS. Admin mutations must continue to use server-side `requireAdmin()` checks and write `AdminAuditLog` rows for sensitive changes.

Never expose Supabase service role keys in client code.

Workspace storage objects should use a path shape beginning with `workspaces/{workspaceId}/...`; storage policies should verify the workspace prefix against `yt_app.is_workspace_member`. The storage policy block must run with a role allowed to manage `storage.objects`; privilege failures should stop migration instead of silently leaving storage unscoped. Local export downloads also validate that persisted `ExportFile.storagePath` stays under `exports/{workspaceId}/{reportId}/` before reading from disk.

## YouTube Ingestion Freshness And Quota

`YoutubeChannel.lastFetchedAt` tracks channel metadata freshness, and `YoutubeVideo.lastFetchedAt` tracks video metadata freshness. Ingestion jobs should refresh stale channel records, backfill the last 100 uploads or last 12 months, skip videos shorter than 90 seconds, and monitor recent videos for 21 days after publish so metric snapshots keep catching early view velocity.

`YoutubeQuotaUsage` records estimated YouTube Data API quota units by provider quota day and operation. YouTube Data API quotas reset on Pacific time, so ingestion code should bucket usage with the `America/Los_Angeles` day boundary, check usage before provider calls, use `YOUTUBE_DAILY_QUOTA_LIMIT` as the daily budget, and record successful calls with a reference type/id when usage can be tied to a channel, video, or job.

`YOUTUBE_DATA_API_KEY` is optional so local development and tests can use mocked providers. Real ingestion jobs must fail fast when no API key is configured instead of attempting live YouTube requests.

## Prisma And Supabase Notes

Prisma is useful for app queries and migrations, but Supabase Auth creates users in `auth.users`, not the Prisma `User` model. The app should create/sync an application user profile after OAuth login.

If using Supabase Auth directly, decide whether the `User.id` should mirror `auth.users.id` as UUID. The starter schema uses `cuid()` for portability. For a real Supabase Auth integration, consider switching user IDs to UUIDs.

Production app code should reuse one Prisma client and a bounded Postgres pool per runtime instance. Serverless deployments must use the Supabase pooler-compatible `DATABASE_URL` and keep direct database URLs for migrations only, otherwise concurrent page requests and job invocations can exhaust Postgres connections before application CPU becomes the bottleneck.

Scale-readiness indexes in migration `0028_scale_readiness_indexes` support bounded scheduler discovery, queued job claiming, dashboard job status aggregation, scheduled topic expiry, and transcript queue scans. Add new dashboard, job, or admin list queries with matching indexes instead of relying on unbounded scans.

Topic recommendation expiry is scheduled background work. Normal recommendation reads should filter expired rows, but they should not perform expiry writes as a side effect of rendering a page.

## Credit Ledger

Credits are modeled and presented as an account-level balance on `User.creditBalance`, shared across the user's workspaces. `Workspace.creditBalance` is retained only as a legacy migration mirror and should not drive user-facing balance checks, displays, or ledger math.

`CreditTransaction` is the source of truth for auditability. Ledger rows are account-scoped by `userId` and retain `workspaceId` so usage can still be attributed to the workspace that triggered the charge.

Every paid task should:

1. Check plan entitlement.
2. Check credit balance.
3. Create a negative credit transaction.
4. Update balance atomically.
5. Link the charge to the generation/job/report where possible.

Stripe checkout and webhook automation is deferred. Until it is connected, plan and credit changes are server/admin-managed and recorded through the credit ledger.

## AI Logging

`AiGeneration` should log every LLM or image model call.

Track:

- user
- workspace
- task type
- provider
- model
- status
- tokens or image count
- estimated cost
- credits charged
- request/response metadata

Avoid storing raw sensitive prompts forever if privacy requirements become stricter. Keep prompt hashes and summarized metadata if needed.

## Cost Controls And Quota Alerts

`provider_cost_snapshot` summarizes successful `AiGeneration` spend for the current UTC day and writes admin audit alerts when daily AI spend reaches `YTRESEARCH_DAILY_AI_SPEND_ALERT_USD`. The same snapshot checks `YoutubeQuotaUsage` against `YOUTUBE_DAILY_QUOTA_LIMIT` using the YouTube Pacific-time quota day and alerts when usage reaches the pressure threshold.

Admin cost monitoring uses recent `AiGeneration` rows to show cost by user and task. The audit log is the current lightweight alert sink for provider spend and quota pressure; a dedicated alert table can replace it later if notifications need assignment, acknowledgements, or retention policies.

Background workers degrade noncritical queued work, such as daily reports, topic recommendations, outlier refresh, and blueprint analysis, when the daily AI spend threshold has already been reached. User-triggered paid actions still rely on atomic credit checks and task-specific logging.

## Outlier Score Storage

`OutlierScore` stores calculated scores over time so the product can explain historical changes.

`OutlierScore` remains global video score history. It should not contain workspace-specific context such as brand fit, niche relevance, or source corroboration.

`WorkspaceVideoOpportunityScore` stores workspace-specific opportunity score history for a video. It can optionally reference the global `OutlierScore` row used as an input, while keeping workspace context isolated from the shared YouTube scoring layer.

Score rows are append-only history. Dashboard queries should select the latest score per video/workspace, usually by ordering `calculatedAt` descending within each `(workspaceId, youtubeVideoId)` group.

For dashboard performance, a future denormalized `currentOutlierScore` field can be added to `YoutubeVideo`.

## Competitor Blueprints

`CompetitorBlueprint` is workspace-scoped because the selected competitor set and downstream content strategy belong to a workspace. The source video metadata, transcripts, analyses, outlier scores, and channels remain globally cached and reusable.

Blueprint rows store structured pattern observations in JSON fields. They must describe reusable patterns and strategic insight, not copied competitor titles, hooks, or script language.

Each tracked competitor should have a clear intelligence surface that shows its current blueprint, top outliers, channel baseline stats, and freshness state. Regeneration should update the current channel intelligence while preserving enough history/status to explain when it changed.

## Topic Recommendation Evidence Weight

Topic recommendation prompts should remain compact. YouTube Data API does not provide a native per-video topic summary, so the app relies on its own analysis layer. Standard recommendation generation should use titles, channel names, scores, compact analysis fields, blueprint summaries, and source item headlines/summaries. Full transcripts and long descriptions should be reserved for explicit future deep-research workflows.

Channel-specific topic suggestions are stored as `TopicRecommendation` rows with `sourceTrackedChannelId` set. Global Topic Ideas should only show recommendations where `sourceTrackedChannelId` is null; competitor intelligence pages should query their own tracked channel id. This keeps per-channel emulation ideas separate from the workspace-wide topic recommendation tool while reusing the same evidence and action model.

## Content Workspace Sources

Spec 014 content workspaces use `ContentItem` as the selected-topic workspace. `sourceType`, `manualTopic`, and `evidenceSnapshot` preserve whether the item came from a recommendation, channel-specific recommendation, or manual topic, while generated sections remain versioned `ContentAsset` rows.

## Visual Generation Assets

`VisualAsset` stores both strategy-only concepts and generated image variants. Strategy rows use the local `visual-strategy-v1` provider with no `imageUrl`; generated variants link back to the triggering `AiGeneration` through `aiGenerationId`, preserve the generated prompt, provider/model, aspect ratio, dimensions, estimated cost, editable overlay JSON, and a traceable `storagePath`.

Editable overlay text remains structured in `editableOverlays` so thumbnail headlines, quote text, and diagram labels can be edited after image generation instead of being baked into provider-rendered pixels. Until external object storage is configured, generated previews may be stored as data URLs in `imageUrl`; production storage should move binary image data to Supabase Storage or S3-compatible storage and keep `storagePath` as the object key.

## Transcript Storage

Transcripts can be large. If storage cost grows, move full transcript text to object storage and keep summary/segments in Postgres.

Transcript retrieval is intentionally provider-abstracted. Local development and tests can use mocked providers or the no-op provider, which marks transcripts as skipped and still stores metadata-only analysis. A live external transcript service can be selected later without changing the pipeline contract.

## Recommended Indexes To Revisit

Before production launch, review query plans for:

- dashboard report lookup
- latest videos by tracked competitors
- top outliers by workspace
- recommendations by status
- content calendar by scheduled date
- AI cost by workspace/date
- job failures by status/date

## Future Tables

Likely future additions:

- team invitations
- plan entitlement snapshots
- prompt templates
- reusable thumbnail templates
- user-owned YouTube channel OAuth connections
- short-form platform accounts
- content publishing integrations
- competitor collections
- source recommendation approval history
