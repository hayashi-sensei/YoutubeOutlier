# YTResearch — Project Overview

> **Status:** Product Definition / Pre-Build Specification
> **Target Launch:** TBD
> **Owner:** Founder / YTResearch
> **Primary Stack:** Next.js, Neon Postgres, Auth.js, Prisma, Cloudflare R2, Vercel, Stripe, Resend, Vercel AI SDK

---

## 1. Product Vision

YTResearch is a **YouTube Content Intelligence and Production Engine** for creators, agencies, coaches, course sellers, B2B SaaS marketers, and digital marketing consultants.

It helps users understand what is working in their niche, study competitor channels, detect outlier videos, monitor industry news, and turn those insights into content topics, outlines, scripts, thumbnails, LinkedIn posts, reports, and a simple publishing calendar.

The first user is the founder. The first niche is AI, AI automation, and digital marketing. However, YTResearch is not locked to one niche. Every user can define and change their own niche in settings, and the system adapts competitor recommendations, source recommendations, topic recommendations, reports, writing outputs, and visual prompts accordingly.

### The Core Problem

Creators and creator-led businesses face:

- Difficulty knowing what content to create next
- Manual competitor research spread across YouTube, websites, notes, and spreadsheets
- Generic AI-generated scripts that are not grounded in market evidence
- No systematic way to detect competitor outliers and audience demand
- No repeatable process for turning research into outlines, scripts, thumbnails, and LinkedIn content
- No daily research workflow that connects industry news with content production

### The Solution

One integrated SaaS platform that combines competitor intelligence, outlier detection, industry news monitoring, topic recommendation, AI-assisted writing, visual generation, repurposing, reports, and content planning.

The heart of the product is not generic AI writing. The heart is:

```text
Pattern recognition + topic recommendation + content execution
```

---

## 2. The Five Pillars

### Pillar 1 — Competitor Intelligence

- **Competitor Channel Tracker:** Users manually add competitor YouTube channels, up to plan limits.
- **AI Competitor Recommendation:** The app recommends relevant YouTube competitors based on niche, target audience, keywords, and existing tracked channels.
- **Video Research Engine:** The app analyzes recent and historical competitor videos, including title, description, thumbnail, publish date, duration, metrics, and transcript where available.
- **Global Data Cache:** YouTube channels and videos are stored globally once, then reused across users to reduce API cost and quota pressure.

### Pillar 2 — Outlier and Blueprint Analysis

- **Outlier Detection:** Scores videos based on relative performance against the channel baseline, velocity, engagement, recency, and repeat signals.
- **Opportunity Score:** Converts raw performance into user-specific content opportunity based on niche relevance, timing, brand fit, and content gaps.
- **Competitor Blueprint Analyzer:** Extracts title patterns, hook types, thumbnail patterns, content pillars, structure, CTA style, and emotional angle from top-performing videos.
- **Recent Topic Tracking:** Highlights what competitors have posted in the last 21 days.

### Pillar 3 — Topic Recommendation and Reports

- **Topic Recommendation Engine:** Recommends content topics based on competitor outliers, recent uploads, industry news, user niche, content gaps, and calendar history.
- **Industry News Monitor:** Users add news sources and industry websites; the app turns new items into content opportunities.
- **Manual Report Generation:** Users can click a button to generate a research report on demand.
- **Optional Daily Reports:** Daily reports run only for users who enable them, protecting costs and job volume.
- **PDF/DOCX Export:** Reports can be exported with user branding.

### Pillar 4 — Content Production Studio

- **Content Workspace:** Converts a selected topic into outline, hook, titles, captions, description, thumbnail concepts, and LinkedIn angles.
- **Script Generator:** Generates full long-form YouTube scripts only when the user explicitly clicks Generate Script.
- **Visual Generation Studio:** Generates YouTube thumbnails, LinkedIn images, carousel covers, quote cards, and diagram-style images.
- **Repurposing Studio:** Turns YouTube topics, outlines, scripts, or reports into LinkedIn posts, X/Twitter threads, and future newsletter blurbs.
- **Writing Style Settings:** User-provided style settings influence all generated writing.

### Pillar 5 — SaaS Operations, Billing, and Monitoring

- **Google OAuth:** Users sign in with Google.
- **Stripe Billing:** Subscription plans and credit purchases.
- **Monthly Credits:** Credits refill monthly and do not roll over.
- **Admin Dashboard:** User lookup, credits, subscriptions, job logs, provider status, usage, cost, and failed report retry.
- **Monitoring:** Tracks AI cost, YouTube quota, job failures, report generation, export failures, and provider errors.

---

## 3. Target Users

| User Type | Core Need |
|---|---|
| Solo Creators | Know what topics to create and turn them into YouTube/LinkedIn content quickly |
| Agencies | Research client niches, competitors, and content opportunities at scale |
| Coaches / Course Sellers | Build authority through consistent educational and thought-leadership content |
| B2B SaaS Marketers | Monitor industry trends and competitor narratives for content marketing |
| Digital Marketing Consultants | Create client-facing research reports, content plans, and scripts |

---

## 4. Feature Index

| ID | Feature | Status |
|---|---|---|
| A | App Foundation | Spec |
| B | Google OAuth and User Settings | Spec |
| C | Billing, Plans, and Credits | Spec |
| D | Admin Foundation | Spec |
| E | Competitor Channel Tracker | Spec |
| F | AI Competitor Recommendation | Spec |
| G | YouTube Metadata Ingestion | Spec |
| H | Transcript Pipeline | Spec |
| I | Industry Source Monitoring | Spec |
| J | Background Jobs and Monitoring | Spec |
| K | Outlier Scoring | Spec |
| L | Competitor Blueprint Analysis | Spec |
| M | Topic Recommendation Engine | Spec |
| N | AI Model Router | Spec |
| O | Content Workspace | Spec |
| P | Script Generator | Spec |
| Q | Visual Generation Studio | Spec |
| R | Repurposing Studio | Spec |
| S | Content Calendar | Spec |
| T | Daily and Manual Reports | Spec |
| U | PDF/DOCX Exports | Spec |
| V | Email Notifications | Spec |
| W | Cost Controls and Quotas | Spec |
| X | Security, RLS, and Compliance | Spec |

---

## 5. Data Model

The full starter schema is maintained in:

```text
docs/schema/prisma.schema
```

The model below is the product-level database overview.

---

### 5.1 User, Workspace, and Settings

**`users`**
```text
id                  String    PK  cuid()
email               String    unique
name                String?
avatar_url          String?
role                Enum      [USER, ADMIN]
default_workspace_id String?
stripe_customer_id  String?   unique
created_at          DateTime  default(now())
updated_at          DateTime  updatedAt
```

**`workspaces`**
```text
id                  String    PK  cuid()
owner_id            String    FK  users.id
name                String
slug                String    unique
logo_url            String?
plan_code           Enum      [FREE, STARTER, PRO, PREMIUM]
credit_balance      Int       default(0)
created_at          DateTime  default(now())
updated_at          DateTime  updatedAt
```

**`workspace_settings`**
```text
id                       String    PK  cuid()
workspace_id             String    FK  workspaces.id  unique
primary_niche             String
sub_niche                 String?
target_audience           String?
content_goals             String?
brand_voice               String?
cta                       String?
offers                    String?
topics_to_avoid           String?
default_ai_quality_tier   String    default("standard")
daily_report_enabled      Boolean   default(false)
report_delivery_email     String?
timezone                  String    default("Asia/Singapore")
created_at                DateTime  default(now())
updated_at                DateTime  updatedAt
```

**Mock Data**
```json
{
  "email": "founder@ytresearch.app",
  "name": "Founder",
  "workspace": {
    "name": "Founder Workspace",
    "plan_code": "PREMIUM",
    "credit_balance": 740
  },
  "settings": {
    "primary_niche": "AI, AI automation, and digital marketing",
    "target_audience": "Creators, agencies, coaches, course sellers, B2B SaaS marketers, and digital marketing consultants",
    "brand_voice": "Direct, strategic, practical, evidence-led",
    "cta": "Subscribe for weekly AI automation and content strategy breakdowns",
    "daily_report_enabled": true
  }
}
```

---

### 5.2 Billing and Credits

**`subscriptions`**
```text
id                       String    PK  cuid()
workspace_id              String    FK  workspaces.id
user_id                   String    FK  users.id
plan_code                 Enum      [FREE, STARTER, PRO, PREMIUM]
status                    Enum      [INCOMPLETE, TRIALING, ACTIVE, PAST_DUE, CANCELED, UNPAID, PAUSED]
stripe_subscription_id    String?   unique
stripe_price_id           String?
current_period_start      DateTime?
current_period_end        DateTime?
cancel_at_period_end      Boolean   default(false)
created_at                DateTime  default(now())
updated_at                DateTime  updatedAt
```

**`credit_transactions`**
```text
id              String    PK  cuid()
workspace_id    String    FK  workspaces.id
user_id         String?   FK  users.id
type            Enum      [MONTHLY_REFILL, PURCHASE, USAGE, ADMIN_ADJUSTMENT, REFUND, EXPIRATION]
amount          Int
balance_after   Int
description     String?
reference_type  String?
reference_id    String?
created_at      DateTime  default(now())
```

**Business Rule**

Every expensive AI action checks plan entitlement and credit balance before execution. Credits refill monthly and do not roll over.

---

### 5.3 Competitor Channels

**`youtube_channels`**
```text
id                   String    PK  cuid()
youtube_channel_id    String    unique
handle                String?
title                 String
description           String?
thumbnail_url         String?
subscriber_count      BigInt?
video_count           Int?
view_count            BigInt?
uploads_playlist_id   String?
country               String?
last_fetched_at       DateTime?
created_at            DateTime  default(now())
updated_at            DateTime  updatedAt
```

**`tracked_channels`**
```text
id                       String    PK  cuid()
workspace_id              String    FK  workspaces.id
youtube_channel_id        String    FK  youtube_channels.id
nickname                  String?
is_active                 Boolean   default(true)
reason                    String?
added_by_recommendation   Boolean   default(false)
created_at                DateTime  default(now())
updated_at                DateTime  updatedAt
```

**`competitor_recommendations`**
```text
id                  String    PK  cuid()
workspace_id         String
youtube_channel_id   String?
channel_url          String
title                String
reason               String
relevance_score      Float
status               Enum      [NEW, SAVED, DISMISSED, USED]
created_at           DateTime  default(now())
updated_at           DateTime  updatedAt
```

**Mock Data**
```json
{
  "channel": {
    "title": "AI Automation Lab",
    "handle": "@AIAutomationLab",
    "subscriber_count": 245000
  },
  "tracked_channel": {
    "nickname": "AI workflow competitor",
    "reason": "Shares similar audience interested in AI agents and no-code automation"
  }
}
```

---

### 5.4 YouTube Videos, Metrics, and Transcripts

**`youtube_videos`**
```text
id                  String    PK  cuid()
youtube_video_id     String    unique
youtube_channel_id   String    FK  youtube_channels.id
title                String
description          String?
published_at         DateTime
duration_seconds     Int?
thumbnail_url        String?
tags                 String[]
category_id          String?
default_language     String?
transcript_status    Enum      [NOT_REQUESTED, QUEUED, AVAILABLE, UNAVAILABLE, FAILED, SKIPPED]
last_fetched_at      DateTime?
created_at           DateTime  default(now())
updated_at           DateTime  updatedAt
```

**`video_metric_snapshots`**
```text
id               String    PK  cuid()
youtube_video_id String    FK  youtube_videos.id
view_count        BigInt?
like_count        BigInt?
comment_count     BigInt?
captured_at       DateTime  default(now())
```

**`video_transcripts`**
```text
id                String    PK  cuid()
youtube_video_id  String    FK  youtube_videos.id  unique
provider          String?
language          String?
text              String?
segments_json     Json?
fetched_at        DateTime?
created_at        DateTime  default(now())
updated_at        DateTime  updatedAt
```

**Mock Data**
```json
{
  "title": "I Built 7 AI Agents That Run My Business",
  "published_at": "2026-05-03T10:00:00Z",
  "duration_seconds": 1280,
  "metric_snapshot": {
    "view_count": 842000,
    "like_count": 31100,
    "comment_count": 1870
  },
  "transcript_status": "AVAILABLE"
}
```

---

### 5.5 Video Analysis and Outlier Scores

**`video_analyses`**
```text
id                  String    PK  cuid()
youtube_video_id     String    FK  youtube_videos.id
analysis_type        String
content_pillar       String?
hook_type            String?
title_pattern        String?
thumbnail_pattern    String?
structure_json       Json?
summary              String?
cta_pattern          String?
emotional_angle      String?
model                String?
created_at           DateTime  default(now())
```

**`outlier_scores`**
```text
id                         String    PK  cuid()
youtube_video_id            String    FK  youtube_videos.id
channel_baseline_views      Float?
relative_view_performance   Float?
view_velocity_score         Float?
engagement_score            Float?
recency_score               Float?
repeat_signal_score         Float?
outlier_score               Float
multiplier                  Float?
calculated_at               DateTime  default(now())
```

**Outlier Score Formula**
```text
Outlier Score =
40% Relative View Performance
25% View Velocity
15% Engagement Rate
10% Recency Boost
10% Topic/Format Repeat Signal
```

**Mock Data**
```json
{
  "channel_baseline_views": 132000,
  "relative_view_performance": 6.38,
  "view_velocity_score": 91,
  "engagement_score": 84,
  "recency_score": 76,
  "repeat_signal_score": 88,
  "outlier_score": 89.4,
  "multiplier": 6.4
}
```

---

### 5.6 Industry Sources

**`industry_sources`**
```text
id              String    PK  cuid()
workspace_id    String    FK  workspaces.id
url             String
name            String?
source_type     Enum      [WEBSITE, RSS, BLOG, NEWSLETTER, BRAND_PAGE, OTHER]
rss_url         String?
is_active       Boolean   default(true)
last_fetched_at DateTime?
created_at      DateTime  default(now())
updated_at      DateTime  updatedAt
```

**`industry_source_items`**
```text
id              String    PK  cuid()
source_id        String    FK  industry_sources.id
url             String
title           String
author          String?
summary         String?
content_text     String?
published_at     DateTime?
fetched_at       DateTime  default(now())
content_hash     String?
```

**Mock Data**
```json
{
  "source": {
    "name": "OpenAI Blog",
    "url": "https://openai.com/news/",
    "source_type": "BRAND_PAGE"
  },
  "item": {
    "title": "New agent workflow update announced",
    "summary": "A new workflow feature creates a content opportunity around practical agent adoption."
  }
}
```

---

### 5.7 Topic Recommendations

**`topic_recommendations`**
```text
id                    String    PK  cuid()
workspace_id           String    FK  workspaces.id
report_id              String?   FK  research_reports.id
title                  String
topic                  String
angle                  String?
why_now                String?
audience_pain_point    String?
opportunity_score      Float?
suggested_hook         String?
suggested_title        String?
thumbnail_concept      String?
outline_json           Json?
linkedin_angle         String?
status                 Enum      [NEW, SAVED, DISMISSED, USED]
created_at             DateTime  default(now())
updated_at             DateTime  updatedAt
```

**`topic_recommendation_evidence`**
```text
id                  String    PK  cuid()
recommendation_id    String    FK  topic_recommendations.id
youtube_video_id     String?   FK  youtube_videos.id
source_item_id       String?   FK  industry_source_items.id
evidence_type        String
note                 String?
created_at           DateTime  default(now())
```

**Mock Data**
```json
{
  "topic": "AI agents are moving from demos to daily business workflows",
  "angle": "Show the exact 5-agent stack a solo creator can build this week",
  "why_now": "Three competitor outliers and two source items mention practical AI agent deployment.",
  "audience_pain_point": "People are overwhelmed by AI agent hype and need a practical starting point.",
  "opportunity_score": 92,
  "suggested_title": "I Built a 5-Agent AI Workflow for My Content Business",
  "suggested_hook": "Most people are still watching AI agent demos. I wanted to know if they can actually run part of a business.",
  "thumbnail_concept": "Creator dashboard with five labeled AI agent cards and bold text: '5 AGENTS RUN THIS'"
}
```

---

### 5.8 Reports and Exports

**`research_reports`**
```text
id              String    PK  cuid()
workspace_id     String    FK  workspaces.id
title           String
status          Enum      [QUEUED, GENERATING, COMPLETED, FAILED]
report_date      DateTime
manual_run       Boolean   default(false)
summary          String?
sections_json    Json?
error_message    String?
generated_at     DateTime?
created_at       DateTime  default(now())
updated_at       DateTime  updatedAt
```

**`export_files`**
```text
id              String    PK  cuid()
workspace_id     String
report_id        String?   FK  research_reports.id
file_type        String
storage_path     String
download_url     String?
expires_at       DateTime?
created_at       DateTime  default(now())
```

**Report Sections**

- Executive summary
- New competitor uploads
- Recent outliers
- Topic clusters
- Industry news
- Content gaps
- Five recommended topics
- Suggested actions

---

### 5.9 Content Workspace and Calendar

**`content_items`**
```text
id                 String    PK  cuid()
workspace_id        String    FK  workspaces.id
recommendation_id   String?   FK  topic_recommendations.id
title               String
content_type        String
status              Enum      [IDEA, OUTLINE, SCRIPT, THUMBNAIL, SCHEDULED, PUBLISHED, ARCHIVED]
scheduled_for       DateTime?
published_at        DateTime?
notes               String?
created_at          DateTime  default(now())
updated_at          DateTime  updatedAt
```

**`content_assets`**
```text
id               String    PK  cuid()
content_item_id   String    FK  content_items.id
asset_type        String
title             String?
body              String?
json_body         Json?
version           Int       default(1)
created_at        DateTime  default(now())
updated_at        DateTime  updatedAt
```

**Mock Data**
```json
{
  "title": "5 AI Agents That Run My Content Business",
  "content_type": "youtube_video",
  "status": "OUTLINE",
  "scheduled_for": "2026-05-22T09:00:00Z",
  "assets": [
    {
      "asset_type": "outline",
      "title": "Structured YouTube Outline",
      "json_body": {
        "sections": ["Hook", "Problem", "Agent Stack", "Walkthrough", "CTA"]
      }
    }
  ]
}
```

---

### 5.10 Visual Generation

**`visual_assets`**
```text
id              String    PK  cuid()
workspace_id     String    FK  workspaces.id
content_item_id  String?   FK  content_items.id
asset_type       Enum      [YOUTUBE_THUMBNAIL, LINKEDIN_IMAGE, LINKEDIN_CAROUSEL_COVER, QUOTE_CARD, DIAGRAM]
provider         String
model            String?
prompt           String
image_url        String?
storage_path     String?
width            Int?
height           Int?
cost_usd         Decimal?
created_at       DateTime  default(now())
```

**Image Providers**

- fal.ai / Flux
- OpenAI image generation
- Nano Banana
- Gemini image model

**Business Rule**

The system should generate visual strategy first, then image assets. Text overlays should remain editable where possible instead of relying entirely on AI-rendered text.

---

### 5.11 AI, Jobs, Email, and Admin

**`ai_generations`**
```text
id                String    PK  cuid()
workspace_id       String    FK  workspaces.id
user_id            String?   FK  users.id
task_type          String
provider           String
model              String
status             Enum      [QUEUED, RUNNING, SUCCEEDED, FAILED]
prompt_hash        String?
input_tokens       Int?
output_tokens      Int?
cost_usd           Decimal?
credits_charged    Int       default(0)
request_json       Json?
response_json      Json?
error_message      String?
created_at         DateTime  default(now())
completed_at       DateTime?
```

**`job_runs`**
```text
id              String    PK  cuid()
workspace_id     String?
job_type         String
status           Enum      [QUEUED, RUNNING, SUCCEEDED, FAILED, CANCELED, RETRYING]
provider         String?
reference_type   String?
reference_id     String?
attempts         Int       default(0)
max_attempts     Int       default(3)
started_at       DateTime?
completed_at     DateTime?
error_message    String?
metadata         Json?
created_at       DateTime  default(now())
updated_at       DateTime  updatedAt
```

**`email_logs`**
```text
id              String    PK  cuid()
workspace_id     String?
to_email         String
template         String
provider         String    default("resend")
provider_id      String?
status           String
error_message    String?
metadata         Json?
created_at       DateTime  default(now())
```

**`admin_audit_logs`**
```text
id              String    PK  cuid()
actor_user_id    String?   FK  users.id
action           String
target_type      String
target_id        String?
reason           String?
metadata         Json?
created_at       DateTime  default(now())
```

---

## 6. Subscription Plans

| Plan | Monthly | Suggested Credits/mo | Competitor Channels | Daily Reports | Images | Best For |
|---|---:|---:|---:|---|---|---|
| Starter | $49 | TBD | 5 | Optional / limited | Limited | Solo creators testing a niche |
| Pro | $99 | TBD | 15 | Yes | Moderate | Serious creators and consultants |
| Premium | $199 | TBD | 25 | Yes | Higher | Agencies, B2B marketers, heavy users |

**AI Credit Top-Ups**

| Package | Price | Credits | Expiry |
|---|---:|---:|---|
| Small Pack | TBD | TBD | No rollover beyond package policy |
| Growth Pack | TBD | TBD | No rollover beyond package policy |
| Heavy Pack | TBD | TBD | No rollover beyond package policy |

> Plan credits refill monthly. Plan credits do not roll over. Extra credit purchase rules should be finalized before billing implementation.

---

## 7. Technical Architecture

### Stack

```text
Framework:       Next.js App Router + React + TypeScript
Database:        Neon Postgres + Prisma ORM
Auth:            Auth.js with Google OAuth
AI SDK:          Vercel AI SDK
AI Gateway:      Vercel AI Gateway for observability and routing
CSS/UI:          Tailwind CSS + shadcn/ui
Storage:         Cloudflare R2 object storage
Vector Search:   pgvector in Supabase
Payments:        Stripe
Email:           Resend + React Email
Jobs:            Inngest or Trigger.dev
Monitoring:      Sentry + PostHog + Vercel logs
Deployment:      Vercel
```

### AI Providers

Text:

- OpenAI as primary provider
- Claude Sonnet for premium writing and scripts
- Gemini Flash/Flash-Lite class model for bulk analysis and classification

Image:

- fal.ai / Flux
- OpenAI image generation
- Nano Banana
- Gemini image models

### Data Providers

- YouTube Data API for official metadata
- YouTube RSS for upload detection where useful
- Transcript provider abstraction for public transcript access where available
- RSS/page extraction for industry sources

### Migration Policy

```text
All schema changes should use migrations.
Do not make untracked production schema changes.
Do not expose service role keys to the client.
RLS must be enabled for exposed Supabase tables.
```

---

## 8. Master Background Jobs

| Job | Timing | Purpose | Failure Risk |
|---|---|---|---|
| `youtube_channel_backfill` | On competitor add | Fetch channel and initial video history | High |
| `youtube_recent_refresh` | Scheduled | Refresh tracked channels and recent videos | High |
| `video_metric_snapshot` | Scheduled | Capture view/like/comment changes | Medium |
| `transcript_fetch` | Queue | Fetch transcript where available | Medium |
| `video_analysis` | Queue | Analyze transcript/metadata for structure and pillars | Medium |
| `industry_source_refresh` | Scheduled | Fetch source items from user-provided sources | Medium |
| `topic_recommendation_generate` | Manual/report-triggered | Generate topic recommendations | High |
| `daily_report_generate` | User timezone, opt-in only | Generate daily reports for enabled users | High |
| `manual_report_generate` | User-triggered | Generate report on demand | High |
| `export_generate` | User-triggered | Generate PDF/DOCX report exports | Medium |
| `monthly_credit_refill` | Billing cycle | Refill plan credits, no rollover | Critical |
| `provider_cost_snapshot` | Daily | Track AI/data/image provider cost | High |

> Build job execution logs and failure alerts from day one. Noisy failure is better than silent failure.

---

## 9. UI/UX Principles

- **Theme:** Light mode first, dark mode optional later
- **Reference Feel:** Linear, PostHog, Vercel dashboard, modern analytics SaaS
- **Layout:** Collapsible sidebar + dense main dashboard
- **Dashboard Priority:** Recommendations, outliers, topic momentum, reports, and content actions
- **Mobile:** Responsive, but desktop-first for v1
- **Cards:** Use 8px radius or less
- **Tone:** Serious creator/business intelligence tool, not a generic AI toy
- **Text:** Compact, readable, operational
- **AI Output:** Render markdown properly with AI UI components

### Main Navigation

- Dashboard
- Competitors
- Outliers
- Topic Ideas
- Reports
- Content Studio
- Calendar
- Visual Studio
- Settings
- Admin

---

## 10. Admin Panel Tabs

| Tab | Purpose |
|---|---|
| Users | Search users, inspect workspace, subscription, and usage |
| Credits | Adjust credits, view credit ledger |
| Subscriptions | Inspect Stripe status and billing issues |
| Jobs | View job runs, failures, retries, and queue health |
| AI Usage | Cost by provider, model, task, user, and workspace |
| Providers | Model/data provider status and failure rates |
| Reports | View report generation status and retry failed reports |
| YouTube Quota | Track quota usage, freshness, and ingestion pressure |
| Sources | Inspect industry source ingestion and failures |
| Prompt Configs | Manage prompt templates and model assignment per task |
| Limits | Configure plan limits and task credit costs |
| Audit Logs | Review admin actions |

---

## 11. Key Business Logic Rules

1. **Global YouTube cache** = A YouTube channel or video is stored once globally and reused across all users who track it.

2. **Tracked channel limit** = Plan determines how many competitor channels a workspace can actively track. Premium target limit is 25.

3. **Outlier scoring** = Videos are compared against their own channel baseline, not ranked purely by raw views.

4. **Opportunity scoring** = Outlier performance is combined with user niche relevance, freshness, content gap, news corroboration, and brand fit.

5. **Transcript fallback** = If transcript is unavailable, analysis falls back to title, description, thumbnail, metrics, and metadata.

6. **Daily reports** = Daily reports only run for users who enable them. Manual report generation is available by button.

7. **Full script generation** = Full scripts are generated only when the user explicitly clicks Generate Script. Outlines, hooks, titles, and captions come first.

8. **Credits** = Paid AI actions deduct credits. Credit costs are task-based and configurable from admin.

9. **Monthly refill** = Plan credits refill monthly and do not roll over.

10. **Extra credits** = Users can buy additional credits. Expiry policy must be finalized before implementation.

11. **Image generation** = Visual generation deducts credits and stores provider, model, prompt, cost, and output metadata.

12. **Reports and exports** = Reports are saved before export. PDF/DOCX export runs as a background job.

13. **Admin actions** = Credit adjustments, retries, and sensitive changes must create audit log entries.

14. **Provider costs** = Every AI and image generation logs estimated cost by provider, model, user, workspace, and task type.

15. **Security** = RLS must protect user-owned tables. Admin role must not depend on user-editable metadata.

---

## 12. Spec-Driven Development Map

The implementation specs are maintained in:

```text
docs/specs/spec-index.md
```

Current spec count:

```text
24 specs
```

Recommended build order:

1. App foundation
2. Auth and settings
3. Billing and credits
4. Competitor tracking
5. YouTube ingestion
6. AI model router
7. Outlier scoring
8. Topic recommendation
9. Content workspace
10. Reports
11. Calendar
12. Visual generation
13. Repurposing
14. Admin and monitoring hardening

