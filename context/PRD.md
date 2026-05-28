# YTResearch PRD

## 1. Product Name

YTResearch

## 2. Product Vision

YTResearch is a SaaS platform that helps creators and creator-led businesses discover proven content opportunities, understand competitor content patterns, and turn insights into publishable YouTube and LinkedIn assets.

The product starts as the founder's operating system for building influence in AI, AI automation, and digital marketing, while being SaaS-ready from day one.

## 3. Problem

Creators and marketing teams often struggle to decide what to create next. They manually watch competitors, scan news sites, save random ideas, and ask generic AI tools to write scripts without enough strategic context.

This creates four problems:

- They miss fast-moving topics and trends.
- They copy surface-level ideas without understanding why content worked.
- They waste time on ideas with weak audience pull.
- AI-generated scripts sound generic because they are not grounded in market evidence.

## 4. Target Users

Primary v1 users:

- Solo creators
- Agencies
- Coaches and course sellers
- B2B SaaS marketers
- Digital marketing consultants

The founder is the first user.

## 5. Core Jobs To Be Done

- When I enter my niche, I want the app to understand my content market so it can recommend relevant competitors and sources.
- When I track competitor channels, I want to know what they are publishing and what is outperforming.
- When a video is an outlier, I want to know why it worked and how I can create an original angle for my audience.
- When industry news breaks, I want content ideas based on that news.
- When I choose a topic, I want outlines, hooks, titles, captions, thumbnails, scripts, and LinkedIn posts.
- When I plan content, I want to save ideas into a simple calendar.
- When I pay for the product, I want clear plan limits, monthly credits, and optional credit top-ups.

## 6. Goals

### Business Goals

- Help the founder produce better, more consistent content.
- Validate a SaaS product that can be sold to creators and agencies.
- Support paid subscriptions and credit-based AI usage from day one.
- Build a scalable architecture that can eventually support 15,000 paying users.

### Product Goals

- Produce daily and manual topic recommendations that feel strategic and actionable.
- Reduce time from research to outline.
- Help users recognize competitor content patterns.
- Make AI outputs reflect the user's niche, brand voice, and writing style.
- Keep AI and data costs measurable and controlled.

## 7. Non-Goals For V1

- Video editing
- Auto-publishing
- Comment analysis
- Team accounts
- Full thumbnail design editor
- Mobile app
- Browser extension
- Social listening across all platforms

## 8. Product Principles

- Evidence first, generation second.
- Recommendations must explain why a topic is worth creating.
- Competitor analysis should inspire, not copy.
- Credits should map to user-visible actions.
- Expensive AI actions should require explicit user intent.
- Global data should be cached once and reused across users.

## 9. Core User Flow

1. User signs up with Google OAuth.
2. User defines niche, target audience, brand voice, and content goals.
3. User manually adds competitor YouTube channels.
4. App recommends additional competitor channels.
5. User adds industry news sources.
6. App ingests competitor videos and recent source content.
7. App calculates outlier and opportunity scores.
8. User views dashboard with competitor trends, outliers, and topic recommendations.
9. User generates or schedules a report.
10. User selects a topic.
11. App generates outline, hooks, titles, captions, thumbnail concepts, and LinkedIn repurposing.
12. User optionally generates full script and images.
13. User saves content to calendar.
14. User exports reports or content assets as PDF/DOCX.

## 10. Functional Requirements

### 10.1 Authentication

- Users can sign up and sign in with Google OAuth.
- Users have individual accounts in v1.
- Account model should remain workspace-ready for future team support.

### 10.2 User Settings

Users can configure:

- Primary niche
- Sub-niche
- Target audience
- Content goals
- Brand voice
- Writing style examples
- CTA
- Products/services/offers
- Topics to avoid
- Report preferences
- Default AI quality preference

Changing the niche should affect competitor recommendations, source recommendations, topic recommendations, reports, writing outputs, and visual prompts.

### 10.3 Competitor Tracking

- Users can manually add competitor YouTube channels.
- Plan limits determine number of tracked competitor channels.
- Maximum planned limit is 25 channels per user.
- App resolves channel URL to global channel ID.
- Global channel data is reused across users.
- Users can archive or remove tracked competitors.

### 10.4 AI Competitor Recommendation

- App recommends competitor channels based on niche, audience, keywords, and existing competitors.
- Recommendations should include reason, relevance score, and suggested content overlap.
- Users must approve recommended competitors before tracking.

### 10.5 YouTube Video Ingestion

- App collects recent and historical videos for tracked channels.
- Initial scope: last 100 videos or last 12 months, whichever is more useful.
- App tracks recent uploads within the last 21 days.
- Metadata includes title, description, publish date, duration, thumbnail URL, view count, like count where available, comment count where available, channel ID, and source timestamps.
- Comments are excluded from v1 analysis.

### 10.6 Transcript Analysis

- App attempts transcript retrieval where available.
- Transcript provider should be swappable.
- If transcript is unavailable, app falls back to metadata and thumbnail/title analysis.
- Transcript analysis extracts hook, structure, claims, segments, CTA, topics, content pillar, and summary.

### 10.7 Outlier Detection

YTResearch should compute two related scores:

- Outlier Score: how much a video overperformed its channel baseline.
- Opportunity Score: how useful the topic is for the user to create now.

V1 Outlier Score should use:

- 40 percent relative view performance
- 25 percent view velocity
- 15 percent engagement rate
- 10 percent recency boost
- 10 percent topic/format repeat signal

Relative view performance should compare a video to the channel median or average from the last 100 videos, not raw cross-channel views.

### 10.8 Competitor Blueprint Analyzer

For top outlier videos, app identifies:

- Topic
- Content pillar
- Hook type
- Title pattern
- Thumbnail pattern
- Script/video structure
- CTA pattern
- Emotional angle
- Video format
- Production notes

### 10.9 Industry News Monitor

- Users can add industry source URLs.
- Sources may be websites, blogs, newsletters, brand pages, RSS feeds, or media sites.
- App fetches latest source items.
- App recommends sources from time to time based on niche and tracked competitors.
- App converts news into content opportunities.

### 10.10 Topic Recommendation Engine

The app recommends content topics based on:

- Competitor outliers
- Recent competitor uploads
- Industry news
- User niche
- User brand profile
- Content gaps
- Repeated winning patterns
- Under-covered opportunities
- Calendar history

Each recommendation includes:

- Topic
- Angle
- Why now
- Audience pain point
- Competitor/news evidence
- Opportunity score
- Suggested title
- Suggested hook
- Suggested thumbnail concept
- Suggested outline
- Suggested LinkedIn angle

### 10.11 Reports

- Users can enable daily reports.
- Users can generate reports manually with a button.
- Daily reports should only run for users who enable them.
- Reports can be saved, downloaded as PDF/DOCX, and emailed.
- Exports should support user branding.

Report sections:

- Executive summary
- Competitor uploads
- Outliers
- Recent topic clusters
- Industry news
- Content gaps
- Five recommended topics
- Recommended actions

### 10.12 Content Creation Workspace

For a selected topic, users can generate:

- Structured outline
- Hook options
- Title options
- Caption options
- Description
- Thumbnail text options
- Thumbnail concept
- LinkedIn post
- LinkedIn image concept

Full script generation only occurs when user clicks a dedicated generate script button.

### 10.13 Script Generator

- Generates long-form YouTube scripts.
- Uses user writing style from settings.
- Uses selected topic, outline, competitor blueprint, and brand profile.
- Supports section-by-section regeneration.

### 10.14 Visual Generation Studio

Supports:

- YouTube thumbnails
- LinkedIn post images
- LinkedIn carousel cover images
- Branded quote cards
- Simple diagram concept images

Providers:

- fal.ai/Flux
- OpenAI image generation
- Nano Banana
- Gemini image models

The product should keep text overlays editable rather than relying only on generated image text.

### 10.15 Repurposing Studio

Turns content ideas, outlines, scripts, and reports into:

- LinkedIn thought leadership posts
- LinkedIn educational posts
- LinkedIn contrarian posts
- LinkedIn story posts
- X/Twitter thread draft
- Newsletter blurb, optional later

### 10.16 Content Calendar

V1 calendar should support:

- Idea
- Outline
- Script
- Thumbnail
- Scheduled
- Published
- Archived

Users can save topic recommendations and generated content assets to the calendar.

### 10.17 Billing And Credits

Plans:

- Starter: 49 USD/month
- Pro: 99 USD/month
- Premium: 199 USD/month

Requirements:

- Stripe subscriptions
- Monthly credit refill
- No credit rollover
- Extra credit purchases
- Credit ledger
- Plan usage limits
- Downgrade/upgrade handling

Credits are charged by action, not raw tokens.

### 10.18 Admin

Admin should support:

- User lookup
- Subscription status
- Credit adjustment
- Usage monitoring
- AI generation logs
- Failed job inspection
- Report retry
- Provider status
- YouTube quota monitoring
- Cost monitoring

### 10.19 Monitoring

App must track:

- Job failures
- Provider errors
- AI cost by task
- Credit usage
- YouTube quota consumption
- Report generation time
- Ingestion freshness
- Export failures

## 11. Success Metrics

Product:

- Weekly active users
- Topic recommendations saved
- Reports generated
- Outlines generated
- Scripts generated
- Calendar items created
- Thumbnail/image generations
- Export downloads

Business:

- Free-to-paid conversion
- Monthly recurring revenue
- Credit purchase revenue
- Gross margin
- Churn
- Expansion revenue

Operational:

- Cost per active user
- AI cost per report
- Transcript success rate
- Report failure rate
- YouTube ingestion freshness
- Queue latency

## 12. Open Decisions

- Transcript provider selection
- Exact plan limits
- Final credit pricing
- Whether to support user-owned YouTube OAuth in v1
- Whether to include Shorts in v1
- Final report format
- Whether to support BYOK later

