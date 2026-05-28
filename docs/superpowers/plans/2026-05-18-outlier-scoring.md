# Outlier Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calculate global outlier scores for competitor videos, calculate workspace-specific opportunity scores, persist score history, and let the dashboard rank top outliers.

**Architecture:** Keep raw outlier score history global in the existing `OutlierScore` model because YouTube videos are globally cached. Add `WorkspaceVideoOpportunityScore` for user/workspace-specific opportunity scoring because niche relevance, source corroboration, saturation, and brand fit depend on the workspace. Implement pure scoring math first, then database orchestration, then queue integration, then dashboard/outliers UI.

**Tech Stack:** Next.js App Router, React Server Components, TypeScript strict mode, Prisma 7 client output in `generated/prisma`, Supabase Postgres, Vitest.

---

## File Structure

- Create `types/outliers.ts`: exported domain types for scoring inputs, score outputs, runner summaries, and dashboard rows.
- Create `lib/outliers/scoring.ts`: pure, deterministic scoring math for channel baselines, relative view performance, velocity, engagement, recency, repeat signals, and opportunity scoring.
- Create `lib/outliers/runner.ts`: Prisma-backed orchestration that loads eligible videos, writes `OutlierScore` rows, writes workspace opportunity score rows, and returns job-safe summaries.
- Create `lib/outliers/queries.ts`: dashboard/outliers data access helpers that return top ranked workspace outlier rows.
- Create `tests/outliers/scoring.test.ts`: unit tests for score math.
- Create `tests/outliers/runner.test.ts`: unit tests for persistence and runner behavior with mocked Prisma.
- Create `tests/outliers/queries.test.ts`: unit tests for row mapping/ranking behavior if query logic needs non-trivial mapping.
- Modify `prisma/schema.prisma`: add `WorkspaceVideoOpportunityScore`, add relation fields, and add practical indexes.
- Create `prisma/migrations/0011_outlier_opportunity_scores/migration.sql`: create the opportunity score table, indexes, foreign keys, enable RLS, and revoke direct client-role access.
- Modify `types/jobs.ts`: add `outlierScoreRefresh`.
- Modify `lib/jobs/handlers.ts`: register the scoring job handler.
- Modify `lib/jobs/scheduler.ts`: enqueue scoring refresh work after active tracked channel refreshes are due.
- Modify `lib/youtube/ingestion-runner.ts`: enqueue or directly run score refresh after backfill/recent refresh succeeds. Prefer direct runner call inside the existing job summary only if it does not introduce circular queue behavior; otherwise enqueue a new scoring job.
- Modify `app/(app)/app/dashboard/page.tsx`: replace the placeholder outlier readiness panel with top ranked outliers and update the outliers KPI.
- Modify `app/(app)/app/outliers/page.tsx`: render the full ranked outlier list for the current workspace.
- Modify `docs/schema/schema-notes.md`: document global outlier history vs workspace-specific opportunity scoring.
- Modify `context/current-feature.md`: mark implementation planning complete and link this plan.

---

### Task 1: Pure Outlier Math

**Files:**
- Create: `types/outliers.ts`
- Create: `lib/outliers/scoring.ts`
- Test: `tests/outliers/scoring.test.ts`

- [ ] **Step 1: Write failing scoring tests**

Create `tests/outliers/scoring.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import {
  calculateChannelBaseline,
  calculateOutlierScore,
  calculateOpportunityScore,
  calculateRepeatSignalScore,
} from "../../lib/outliers/scoring";

const NOW = new Date("2026-05-18T00:00:00Z");

describe("calculateChannelBaseline", () => {
  test("uses the median of eligible channel view counts", () => {
    const baseline = calculateChannelBaseline([
      { videoId: "a", viewCount: 100 },
      { videoId: "b", viewCount: 1000 },
      { videoId: "c", viewCount: 200 },
    ]);

    expect(baseline).toBe(200);
  });

  test("returns null when fewer than three videos have views", () => {
    const baseline = calculateChannelBaseline([
      { videoId: "a", viewCount: 100 },
      { videoId: "b", viewCount: null },
    ]);

    expect(baseline).toBeNull();
  });
});

describe("calculateOutlierScore", () => {
  test("combines weighted score components and clamps to 0 through 100", () => {
    const score = calculateOutlierScore({
      videoId: "video-1",
      publishedAt: new Date("2026-05-15T00:00:00Z"),
      latestSnapshot: {
        viewCount: 1200,
        likeCount: 120,
        commentCount: 30,
        capturedAt: NOW,
      },
      previousSnapshot: {
        viewCount: 700,
        likeCount: 80,
        commentCount: 20,
        capturedAt: new Date("2026-05-17T00:00:00Z"),
      },
      channelBaselineViews: 200,
      repeatSignalScore: 80,
      now: NOW,
    });

    expect(score.channelBaselineViews).toBe(200);
    expect(score.relativeViewPerformance).toBe(6);
    expect(score.multiplier).toBe(6);
    expect(score.outlierScore).toBeGreaterThan(80);
    expect(score.outlierScore).toBeLessThanOrEqual(100);
  });

  test("returns null when latest views or channel baseline are missing", () => {
    const score = calculateOutlierScore({
      videoId: "video-1",
      publishedAt: new Date("2026-05-15T00:00:00Z"),
      latestSnapshot: {
        viewCount: null,
        likeCount: 10,
        commentCount: 1,
        capturedAt: NOW,
      },
      previousSnapshot: null,
      channelBaselineViews: 200,
      repeatSignalScore: 50,
      now: NOW,
    });

    expect(score).toBeNull();
  });
});

describe("calculateRepeatSignalScore", () => {
  test("rewards repeated content pillar, hook type, title pattern, and tag overlap", () => {
    const score = calculateRepeatSignalScore({
      video: {
        id: "target",
        tags: ["ai agents", "automation"],
        analysis: {
          contentPillar: "AI agents",
          hookType: "case study",
          titlePattern: "I built X",
        },
      },
      peers: [
        {
          id: "peer-1",
          tags: ["ai agents"],
          analysis: {
            contentPillar: "AI agents",
            hookType: "case study",
            titlePattern: "I built X",
          },
        },
        {
          id: "peer-2",
          tags: ["youtube"],
          analysis: {
            contentPillar: "Creator workflow",
            hookType: "tutorial",
            titlePattern: "How to",
          },
        },
      ],
    });

    expect(score).toBeGreaterThan(50);
  });
});

describe("calculateOpportunityScore", () => {
  test("combines outlier strength with workspace relevance and market timing factors", () => {
    const score = calculateOpportunityScore({
      outlierScore: 90,
      title: "AI agents for solo creator automation",
      description: "A practical workflow for AI automation.",
      tags: ["ai agents", "automation"],
      publishedAt: new Date("2026-05-16T00:00:00Z"),
      workspace: {
        primaryNiche: "AI automation",
        subNiche: "AI agents",
        targetAudience: "solo creators",
        brandVoice: "practical and strategic",
        topicsToAvoid: "crypto",
      },
      similarTrackedVideoCount: 2,
      corroboratingSourceItemCount: 1,
      now: NOW,
    });

    expect(score.opportunityScore).toBeGreaterThan(80);
    expect(score.nicheRelevanceScore).toBeGreaterThan(80);
    expect(score.sourceCorroborationScore).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run scoring tests to verify they fail**

Run:

```powershell
npm run test -- tests/outliers/scoring.test.ts
```

Expected: FAIL because `lib/outliers/scoring.ts` does not exist.

- [ ] **Step 3: Add shared outlier types**

Create `types/outliers.ts`:

```ts
export type VideoViewInput = {
  videoId: string;
  viewCount: number | null;
};

export type VideoMetricSnapshotInput = {
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  capturedAt: Date;
};

export type VideoAnalysisSignal = {
  contentPillar?: string | null;
  hookType?: string | null;
  titlePattern?: string | null;
};

export type RepeatSignalVideo = {
  id: string;
  tags: string[];
  analysis?: VideoAnalysisSignal | null;
};

export type OutlierScoreInput = {
  videoId: string;
  publishedAt: Date;
  latestSnapshot: VideoMetricSnapshotInput;
  previousSnapshot?: VideoMetricSnapshotInput | null;
  channelBaselineViews: number | null;
  repeatSignalScore: number;
  now?: Date;
};

export type CalculatedOutlierScore = {
  videoId: string;
  channelBaselineViews: number;
  relativeViewPerformance: number;
  viewVelocityScore: number;
  engagementScore: number;
  recencyScore: number;
  repeatSignalScore: number;
  outlierScore: number;
  multiplier: number;
};

export type OpportunityWorkspaceInput = {
  primaryNiche: string;
  subNiche?: string | null;
  targetAudience?: string | null;
  brandVoice?: string | null;
  topicsToAvoid?: string | null;
};

export type OpportunityScoreInput = {
  outlierScore: number;
  title: string;
  description?: string | null;
  tags: string[];
  publishedAt: Date;
  workspace: OpportunityWorkspaceInput;
  similarTrackedVideoCount: number;
  corroboratingSourceItemCount: number;
  now?: Date;
};

export type CalculatedOpportunityScore = {
  outlierScore: number;
  nicheRelevanceScore: number;
  topicFreshnessScore: number;
  competitiveSaturationScore: number;
  sourceCorroborationScore: number;
  brandFitScore: number;
  opportunityScore: number;
};

export type OutlierScoreRefreshSummary = {
  workspaceId?: string;
  channelId?: string;
  videosEvaluated: number;
  outlierScoresCreated: number;
  opportunityScoresCreated: number;
  skippedVideos: number;
};

export type RankedOutlierRow = {
  videoId: string;
  title: string;
  channelTitle: string;
  channelHandle?: string | null;
  thumbnailUrl?: string | null;
  publishedAt: Date;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  outlierScore: number;
  opportunityScore: number | null;
  multiplier: number | null;
  calculatedAt: Date;
};
```

- [ ] **Step 4: Implement pure scoring math**

Create `lib/outliers/scoring.ts`:

```ts
import type {
  CalculatedOpportunityScore,
  CalculatedOutlierScore,
  OpportunityScoreInput,
  OutlierScoreInput,
  RepeatSignalVideo,
  VideoViewInput,
} from "@/types/outliers";

const MIN_BASELINE_VIDEO_COUNT = 3;
const RECENCY_WINDOW_DAYS = 21;
const MAX_RELATIVE_MULTIPLIER = 8;
const MAX_VIEWS_PER_DAY_MULTIPLIER = 4;
const STRONG_ENGAGEMENT_RATE = 0.12;

export function calculateChannelBaseline(videos: VideoViewInput[]): number | null {
  const views = videos
    .map((video) => video.viewCount)
    .filter((viewCount): viewCount is number => typeof viewCount === "number" && viewCount > 0)
    .sort((a, b) => a - b);

  if (views.length < MIN_BASELINE_VIDEO_COUNT) {
    return null;
  }

  const middle = Math.floor(views.length / 2);
  if (views.length % 2 === 1) {
    return views[middle] ?? null;
  }

  const left = views[middle - 1];
  const right = views[middle];
  if (left === undefined || right === undefined) {
    return null;
  }

  return (left + right) / 2;
}

export function calculateOutlierScore(
  input: OutlierScoreInput,
): CalculatedOutlierScore | null {
  const latestViews = input.latestSnapshot.viewCount;
  if (
    typeof latestViews !== "number" ||
    latestViews <= 0 ||
    input.channelBaselineViews === null ||
    input.channelBaselineViews <= 0
  ) {
    return null;
  }

  const now = input.now ?? new Date();
  const multiplier = latestViews / input.channelBaselineViews;
  const relativeViewPerformance = round(multiplier, 2);
  const relativeViewScore = scoreRatio(multiplier, MAX_RELATIVE_MULTIPLIER);
  const viewVelocityScore = calculateViewVelocityScore(input, latestViews, now);
  const engagementScore = calculateEngagementScore(input, latestViews);
  const recencyScore = calculateRecencyScore(input.publishedAt, now);
  const repeatSignalScore = clamp(input.repeatSignalScore);
  const outlierScore = round(
    relativeViewScore * 0.4 +
      viewVelocityScore * 0.25 +
      engagementScore * 0.15 +
      recencyScore * 0.1 +
      repeatSignalScore * 0.1,
    1,
  );

  return {
    videoId: input.videoId,
    channelBaselineViews: round(input.channelBaselineViews, 2),
    relativeViewPerformance,
    viewVelocityScore,
    engagementScore,
    recencyScore,
    repeatSignalScore,
    outlierScore: clamp(outlierScore),
    multiplier: round(multiplier, 2),
  };
}

export function calculateRepeatSignalScore(input: {
  video: RepeatSignalVideo;
  peers: RepeatSignalVideo[];
}): number {
  if (input.peers.length === 0) {
    return 35;
  }

  const peerCount = input.peers.length;
  const pillarMatches = ratioOfMatches(peerCount, input.peers, (peer) =>
    sameText(peer.analysis?.contentPillar, input.video.analysis?.contentPillar),
  );
  const hookMatches = ratioOfMatches(peerCount, input.peers, (peer) =>
    sameText(peer.analysis?.hookType, input.video.analysis?.hookType),
  );
  const titlePatternMatches = ratioOfMatches(peerCount, input.peers, (peer) =>
    sameText(peer.analysis?.titlePattern, input.video.analysis?.titlePattern),
  );
  const tagMatches = ratioOfMatches(peerCount, input.peers, (peer) =>
    hasTagOverlap(input.video.tags, peer.tags),
  );

  return clamp(round(
    pillarMatches * 35 +
      hookMatches * 25 +
      titlePatternMatches * 25 +
      tagMatches * 15,
    1,
  ));
}

export function calculateOpportunityScore(
  input: OpportunityScoreInput,
): CalculatedOpportunityScore {
  const now = input.now ?? new Date();
  const searchable = tokenize([
    input.title,
    input.description ?? "",
    input.tags.join(" "),
  ].join(" "));
  const nicheTerms = tokenize([
    input.workspace.primaryNiche,
    input.workspace.subNiche ?? "",
    input.workspace.targetAudience ?? "",
  ].join(" "));
  const avoidTerms = tokenize(input.workspace.topicsToAvoid ?? "");
  const brandTerms = tokenize(input.workspace.brandVoice ?? "");
  const nicheRelevanceScore = keywordOverlapScore(searchable, nicheTerms);
  const topicFreshnessScore = calculateRecencyScore(input.publishedAt, now);
  const competitiveSaturationScore = saturationScore(input.similarTrackedVideoCount);
  const sourceCorroborationScore = clamp(input.corroboratingSourceItemCount * 35);
  const avoidPenalty = avoidTerms.some((term) => searchable.includes(term)) ? 55 : 0;
  const brandFitScore = clamp(Math.max(keywordOverlapScore(searchable, brandTerms), 70) - avoidPenalty);

  return {
    outlierScore: clamp(input.outlierScore),
    nicheRelevanceScore,
    topicFreshnessScore,
    competitiveSaturationScore,
    sourceCorroborationScore,
    brandFitScore,
    opportunityScore: clamp(round(
      input.outlierScore * 0.45 +
        nicheRelevanceScore * 0.2 +
        topicFreshnessScore * 0.12 +
        competitiveSaturationScore * 0.08 +
        sourceCorroborationScore * 0.08 +
        brandFitScore * 0.07,
      1,
    )),
  };
}

function calculateViewVelocityScore(
  input: OutlierScoreInput,
  latestViews: number,
  now: Date,
): number {
  const ageDays = Math.max(1, daysBetween(input.publishedAt, now));
  if (!input.previousSnapshot?.viewCount || input.previousSnapshot.viewCount <= 0) {
    const viewsPerDay = latestViews / ageDays;
    const baselinePerDay = (input.channelBaselineViews ?? latestViews) / 30;
    return scoreRatio(viewsPerDay / Math.max(1, baselinePerDay), MAX_VIEWS_PER_DAY_MULTIPLIER);
  }

  const elapsedDays = Math.max(1, daysBetween(input.previousSnapshot.capturedAt, input.latestSnapshot.capturedAt));
  const gainedViews = Math.max(0, latestViews - input.previousSnapshot.viewCount);
  const gainedViewsPerDay = gainedViews / elapsedDays;
  const baselinePerDay = (input.channelBaselineViews ?? latestViews) / 30;
  return scoreRatio(gainedViewsPerDay / Math.max(1, baselinePerDay), MAX_VIEWS_PER_DAY_MULTIPLIER);
}

function calculateEngagementScore(input: OutlierScoreInput, latestViews: number): number {
  const likes = input.latestSnapshot.likeCount ?? 0;
  const comments = input.latestSnapshot.commentCount ?? 0;
  const rate = (likes + comments) / latestViews;
  return scoreRatio(rate, STRONG_ENGAGEMENT_RATE);
}

function calculateRecencyScore(publishedAt: Date, now: Date): number {
  const ageDays = daysBetween(publishedAt, now);
  if (ageDays <= 1) {
    return 100;
  }
  if (ageDays >= RECENCY_WINDOW_DAYS) {
    return 20;
  }
  return clamp(round(100 - ((ageDays - 1) / (RECENCY_WINDOW_DAYS - 1)) * 80, 1));
}

function saturationScore(similarTrackedVideoCount: number): number {
  if (similarTrackedVideoCount <= 0) {
    return 85;
  }
  if (similarTrackedVideoCount <= 2) {
    return 100;
  }
  if (similarTrackedVideoCount <= 5) {
    return 70;
  }
  return 35;
}

function keywordOverlapScore(sourceTerms: string[], targetTerms: string[]): number {
  if (targetTerms.length === 0) {
    return 50;
  }

  const uniqueTargets = [...new Set(targetTerms)];
  const matches = uniqueTargets.filter((term) => sourceTerms.includes(term)).length;
  return clamp(round((matches / uniqueTargets.length) * 100, 1));
}

function ratioOfMatches<T>(count: number, peers: T[], predicate: (peer: T) => boolean): number {
  return peers.filter(predicate).length / Math.max(1, count);
}

function hasTagOverlap(left: string[], right: string[]): boolean {
  const normalizedRight = new Set(right.map(normalizeText));
  return left.map(normalizeText).some((tag) => normalizedRight.has(tag));
}

function sameText(left?: string | null, right?: string | null): boolean {
  return Boolean(left && right && normalizeText(left) === normalizeText(right));
}

function scoreRatio(value: number, maxUsefulValue: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return clamp(round((Math.min(value, maxUsefulValue) / maxUsefulValue) * 100, 1));
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 86_400_000);
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function round(value: number, digits = 0): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}
```

- [ ] **Step 5: Run scoring tests**

Run:

```powershell
npm run test -- tests/outliers/scoring.test.ts
```

Expected: PASS.

---

### Task 2: Opportunity Score Persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0011_outlier_opportunity_scores/migration.sql`
- Modify: `docs/schema/schema-notes.md`

- [ ] **Step 1: Add the Prisma model**

In `prisma/schema.prisma`, add `opportunityScores WorkspaceVideoOpportunityScore[]` to `Workspace`, `opportunityScores WorkspaceVideoOpportunityScore[]` to `YoutubeVideo`, `opportunityScores WorkspaceVideoOpportunityScore[]` to `OutlierScore`, then add:

```prisma
model WorkspaceVideoOpportunityScore {
  id                         String        @id @default(cuid())
  workspaceId                String
  youtubeVideoId             String
  outlierScoreId             String?
  nicheRelevanceScore        Float?
  topicFreshnessScore        Float?
  competitiveSaturationScore Float?
  sourceCorroborationScore   Float?
  brandFitScore              Float?
  opportunityScore           Float
  calculatedAt               DateTime      @default(now())

  workspace                  Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  video                      YoutubeVideo  @relation(fields: [youtubeVideoId], references: [id], onDelete: Cascade)
  outlierScore               OutlierScore? @relation(fields: [outlierScoreId], references: [id], onDelete: SetNull)

  @@index([workspaceId, opportunityScore])
  @@index([workspaceId, calculatedAt])
  @@index([workspaceId, youtubeVideoId, calculatedAt])
  @@index([youtubeVideoId])
  @@index([outlierScoreId])
}
```

- [ ] **Step 2: Add the SQL migration**

Create `prisma/migrations/0011_outlier_opportunity_scores/migration.sql`:

```sql
CREATE TABLE "WorkspaceVideoOpportunityScore" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "outlierScoreId" TEXT,
    "nicheRelevanceScore" DOUBLE PRECISION,
    "topicFreshnessScore" DOUBLE PRECISION,
    "competitiveSaturationScore" DOUBLE PRECISION,
    "sourceCorroborationScore" DOUBLE PRECISION,
    "brandFitScore" DOUBLE PRECISION,
    "opportunityScore" DOUBLE PRECISION NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceVideoOpportunityScore_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceVideoOpportunityScore_workspaceId_opportunityScore_idx"
ON "WorkspaceVideoOpportunityScore"("workspaceId", "opportunityScore");

CREATE INDEX "WorkspaceVideoOpportunityScore_workspaceId_calculatedAt_idx"
ON "WorkspaceVideoOpportunityScore"("workspaceId", "calculatedAt");

CREATE INDEX "WorkspaceVideoOpportunityScore_workspaceId_youtubeVideoId_calculatedAt_idx"
ON "WorkspaceVideoOpportunityScore"("workspaceId", "youtubeVideoId", "calculatedAt");

CREATE INDEX "WorkspaceVideoOpportunityScore_youtubeVideoId_idx"
ON "WorkspaceVideoOpportunityScore"("youtubeVideoId");

CREATE INDEX "WorkspaceVideoOpportunityScore_outlierScoreId_idx"
ON "WorkspaceVideoOpportunityScore"("outlierScoreId");

ALTER TABLE "WorkspaceVideoOpportunityScore"
ADD CONSTRAINT "WorkspaceVideoOpportunityScore_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceVideoOpportunityScore"
ADD CONSTRAINT "WorkspaceVideoOpportunityScore_youtubeVideoId_fkey"
FOREIGN KEY ("youtubeVideoId") REFERENCES "YoutubeVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceVideoOpportunityScore"
ADD CONSTRAINT "WorkspaceVideoOpportunityScore_outlierScoreId_fkey"
FOREIGN KEY ("outlierScoreId") REFERENCES "OutlierScore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkspaceVideoOpportunityScore" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "WorkspaceVideoOpportunityScore" FROM anon, authenticated;
```

- [ ] **Step 3: Validate Prisma schema**

Run:

```powershell
npm run prisma:validate
```

Expected: PASS.

- [ ] **Step 4: Update schema notes**

Append this section to `docs/schema/schema-notes.md`:

```md
## Spec 010 Outlier And Opportunity Scores

- `OutlierScore` remains global because YouTube videos are globally cached and the outlier formula compares each video to its own channel baseline.
- `WorkspaceVideoOpportunityScore` stores workspace-specific opportunity score history because niche relevance, brand fit, saturation, and source/news corroboration depend on user settings and tracked sources.
- Score rows are append-only history. Dashboard queries should select the latest score per video/workspace rather than overwriting old rows.
```

---

### Task 3: Prisma-Backed Scoring Runner

**Files:**
- Create: `lib/outliers/runner.ts`
- Test: `tests/outliers/runner.test.ts`

- [ ] **Step 1: Write failing runner tests**

Create `tests/outliers/runner.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";

import {
  runOutlierScoreRefreshJob,
  type OutlierRunnerPrisma,
} from "../../lib/outliers/runner";

const NOW = new Date("2026-05-18T00:00:00Z");

describe("runOutlierScoreRefreshJob", () => {
  test("calculates score history for eligible videos and workspace opportunity scores", async () => {
    const prisma = createPrisma();

    const summary = await runOutlierScoreRefreshJob({
      prisma,
      channelId: "channel-1",
      now: NOW,
    });

    expect(summary).toEqual({
      channelId: "channel-1",
      videosEvaluated: 4,
      outlierScoresCreated: 1,
      opportunityScoresCreated: 1,
      skippedVideos: 3,
    });
    expect(prisma.outlierScore.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        youtubeVideoId: "target-video",
        channelBaselineViews: 200,
        multiplier: 6,
      }),
      select: { id: true },
    });
    expect(prisma.workspaceVideoOpportunityScore.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        youtubeVideoId: "target-video",
        opportunityScore: expect.any(Number),
      }),
    });
  });
});

function createPrisma(): OutlierRunnerPrisma & {
  youtubeChannel: { findUnique: ReturnType<typeof vi.fn> };
  outlierScore: { create: ReturnType<typeof vi.fn> };
  workspaceVideoOpportunityScore: { create: ReturnType<typeof vi.fn> };
} {
  return {
    youtubeChannel: {
      findUnique: vi.fn(async () => ({
        id: "channel-1",
        videos: [
          video("baseline-1", 100, new Date("2026-04-01T00:00:00Z")),
          video("baseline-2", 200, new Date("2026-04-02T00:00:00Z")),
          video("baseline-3", 300, new Date("2026-04-03T00:00:00Z")),
          video("target-video", 1200, new Date("2026-05-16T00:00:00Z"), {
            tags: ["ai agents", "automation"],
            title: "AI agents for solo creator automation",
            description: "A practical workflow for AI automation.",
            snapshots: [
              snapshot(700, new Date("2026-05-17T00:00:00Z")),
              snapshot(1200, NOW),
            ],
            analyses: [
              {
                contentPillar: "AI agents",
                hookType: "case study",
                titlePattern: "I built X",
              },
            ],
          }),
        ],
        trackedBy: [
          {
            workspaceId: "workspace-1",
            workspace: {
              settings: {
                primaryNiche: "AI automation",
                subNiche: "AI agents",
                targetAudience: "solo creators",
                brandVoice: "practical and strategic",
                topicsToAvoid: "crypto",
              },
              industrySources: [
                {
                  items: [
                    {
                      title: "AI agents are becoming practical",
                      summary: "Solo creator automation workflows are trending.",
                    },
                  ],
                },
              ],
              trackedChannels: [
                {
                  channel: {
                    videos: [
                      {
                        id: "similar-video",
                        title: "AI agents workflow",
                        tags: ["ai agents"],
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      })),
    },
    outlierScore: {
      create: vi.fn(async () => ({ id: "score-1" })),
    },
    workspaceVideoOpportunityScore: {
      create: vi.fn(async () => ({})),
    },
  };
}

function video(
  id: string,
  views: number,
  publishedAt: Date,
  overrides: Partial<{
    title: string;
    description: string;
    tags: string[];
    snapshots: ReturnType<typeof snapshot>[];
    analyses: Array<{
      contentPillar: string | null;
      hookType: string | null;
      titlePattern: string | null;
    }>;
  }> = {},
) {
  return {
    id,
    title: overrides.title ?? `Video ${id}`,
    description: overrides.description ?? null,
    publishedAt,
    tags: overrides.tags ?? [],
    metricSnapshots: overrides.snapshots ?? [snapshot(views, NOW)],
    analyses: overrides.analyses ?? [],
  };
}

function snapshot(viewCount: number, capturedAt: Date) {
  return {
    viewCount: BigInt(viewCount),
    likeCount: BigInt(Math.floor(viewCount * 0.1)),
    commentCount: BigInt(Math.floor(viewCount * 0.01)),
    capturedAt,
  };
}
```

- [ ] **Step 2: Run runner test to verify it fails**

Run:

```powershell
npm run test -- tests/outliers/runner.test.ts
```

Expected: FAIL because `lib/outliers/runner.ts` does not exist.

- [ ] **Step 3: Implement the runner**

Create `lib/outliers/runner.ts` with exported `OutlierRunnerPrisma`, `runOutlierScoreRefreshJob`, and small private mappers. The implementation must:

```ts
import {
  calculateChannelBaseline,
  calculateOpportunityScore,
  calculateOutlierScore,
  calculateRepeatSignalScore,
} from "./scoring";
import type {
  OutlierScoreRefreshSummary,
  RepeatSignalVideo,
  VideoMetricSnapshotInput,
} from "@/types/outliers";

const SCORE_LOOKBACK_LIMIT = 100;
const RECENT_VIDEO_DAYS = 21;

type RunnerSnapshot = {
  viewCount: bigint | number | null;
  likeCount: bigint | number | null;
  commentCount: bigint | number | null;
  capturedAt: Date;
};

type RunnerVideo = {
  id: string;
  title: string;
  description: string | null;
  publishedAt: Date;
  tags: string[];
  metricSnapshots: RunnerSnapshot[];
  analyses: Array<{
    contentPillar: string | null;
    hookType: string | null;
    titlePattern: string | null;
  }>;
};

export type OutlierRunnerPrisma = {
  youtubeChannel: {
    findUnique(input: unknown): Promise<{
      id: string;
      videos: RunnerVideo[];
      trackedBy: Array<{
        workspaceId: string;
        workspace: {
          settings: {
            primaryNiche: string;
            subNiche: string | null;
            targetAudience: string | null;
            brandVoice: string | null;
            topicsToAvoid: string | null;
          } | null;
          industrySources: Array<{
            items: Array<{ title: string; summary: string | null }>;
          }>;
          trackedChannels: Array<{
            channel: {
              videos: Array<{ id: string; title: string; tags: string[] }>;
            };
          }>;
        };
      }>;
    } | null>;
  };
  outlierScore: {
    create(input: {
      data: {
        youtubeVideoId: string;
        channelBaselineViews: number;
        relativeViewPerformance: number;
        viewVelocityScore: number;
        engagementScore: number;
        recencyScore: number;
        repeatSignalScore: number;
        outlierScore: number;
        multiplier: number;
        calculatedAt: Date;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
  workspaceVideoOpportunityScore: {
    create(input: {
      data: {
        workspaceId: string;
        youtubeVideoId: string;
        outlierScoreId: string;
        nicheRelevanceScore: number;
        topicFreshnessScore: number;
        competitiveSaturationScore: number;
        sourceCorroborationScore: number;
        brandFitScore: number;
        opportunityScore: number;
        calculatedAt: Date;
      };
    }): Promise<unknown>;
  };
};

export async function runOutlierScoreRefreshJob(input: {
  prisma: OutlierRunnerPrisma;
  channelId: string;
  workspaceId?: string;
  now?: Date;
}): Promise<OutlierScoreRefreshSummary> {
  const now = input.now ?? new Date();
  const channel = await input.prisma.youtubeChannel.findUnique({
    where: { id: input.channelId },
    select: {
      id: true,
      videos: {
        orderBy: { publishedAt: "desc" },
        take: SCORE_LOOKBACK_LIMIT,
        select: {
          id: true,
          title: true,
          description: true,
          publishedAt: true,
          tags: true,
          metricSnapshots: {
            orderBy: { capturedAt: "desc" },
            take: 2,
            select: {
              viewCount: true,
              likeCount: true,
              commentCount: true,
              capturedAt: true,
            },
          },
          analyses: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              contentPillar: true,
              hookType: true,
              titlePattern: true,
            },
          },
        },
      },
      trackedBy: {
        where: {
          isActive: true,
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        },
        select: {
          workspaceId: true,
          workspace: {
            select: {
              settings: {
                select: {
                  primaryNiche: true,
                  subNiche: true,
                  targetAudience: true,
                  brandVoice: true,
                  topicsToAvoid: true,
                },
              },
              industrySources: {
                where: { isActive: true },
                select: {
                  items: {
                    orderBy: { fetchedAt: "desc" },
                    take: 25,
                    select: { title: true, summary: true },
                  },
                },
              },
              trackedChannels: {
                where: { isActive: true },
                select: {
                  channel: {
                    select: {
                      videos: {
                        where: { publishedAt: { gte: daysAgo(now, RECENT_VIDEO_DAYS) } },
                        take: 100,
                        select: { id: true, title: true, tags: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!channel) {
    throw new Error(`YouTube channel not found: ${input.channelId}`);
  }

  const baseline = calculateChannelBaseline(
    channel.videos.map((video) => ({
      videoId: video.id,
      viewCount: toNumber(video.metricSnapshots[0]?.viewCount),
    })),
  );
  let outlierScoresCreated = 0;
  let opportunityScoresCreated = 0;
  let skippedVideos = 0;

  for (const video of channel.videos) {
    const latestSnapshot = snapshotInput(video.metricSnapshots[0]);
    if (!latestSnapshot) {
      skippedVideos += 1;
      continue;
    }

    const repeatSignalScore = calculateRepeatSignalScore({
      video: repeatVideo(video),
      peers: channel.videos.filter((peer) => peer.id !== video.id).map(repeatVideo),
    });
    const outlier = calculateOutlierScore({
      videoId: video.id,
      publishedAt: video.publishedAt,
      latestSnapshot,
      previousSnapshot: snapshotInput(video.metricSnapshots[1]),
      channelBaselineViews: baseline,
      repeatSignalScore,
      now,
    });

    if (!outlier) {
      skippedVideos += 1;
      continue;
    }

    const created = await input.prisma.outlierScore.create({
      data: {
        youtubeVideoId: video.id,
        channelBaselineViews: outlier.channelBaselineViews,
        relativeViewPerformance: outlier.relativeViewPerformance,
        viewVelocityScore: outlier.viewVelocityScore,
        engagementScore: outlier.engagementScore,
        recencyScore: outlier.recencyScore,
        repeatSignalScore: outlier.repeatSignalScore,
        outlierScore: outlier.outlierScore,
        multiplier: outlier.multiplier,
        calculatedAt: now,
      },
      select: { id: true },
    });
    outlierScoresCreated += 1;

    for (const tracked of channel.trackedBy) {
      const settings = tracked.workspace.settings;
      if (!settings) {
        continue;
      }

      const opportunity = calculateOpportunityScore({
        outlierScore: outlier.outlierScore,
        title: video.title,
        description: video.description,
        tags: video.tags,
        publishedAt: video.publishedAt,
        workspace: settings,
        similarTrackedVideoCount: countSimilarTrackedVideos(video, tracked.workspace.trackedChannels),
        corroboratingSourceItemCount: countCorroboratingSources(video, tracked.workspace.industrySources),
        now,
      });

      await input.prisma.workspaceVideoOpportunityScore.create({
        data: {
          workspaceId: tracked.workspaceId,
          youtubeVideoId: video.id,
          outlierScoreId: created.id,
          nicheRelevanceScore: opportunity.nicheRelevanceScore,
          topicFreshnessScore: opportunity.topicFreshnessScore,
          competitiveSaturationScore: opportunity.competitiveSaturationScore,
          sourceCorroborationScore: opportunity.sourceCorroborationScore,
          brandFitScore: opportunity.brandFitScore,
          opportunityScore: opportunity.opportunityScore,
          calculatedAt: now,
        },
      });
      opportunityScoresCreated += 1;
    }
  }

  return {
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    channelId: channel.id,
    videosEvaluated: channel.videos.length,
    outlierScoresCreated,
    opportunityScoresCreated,
    skippedVideos,
  };
}

function repeatVideo(video: RunnerVideo): RepeatSignalVideo {
  const analysis = video.analyses[0];
  return {
    id: video.id,
    tags: video.tags,
    analysis: analysis
      ? {
          contentPillar: analysis.contentPillar,
          hookType: analysis.hookType,
          titlePattern: analysis.titlePattern,
        }
      : null,
  };
}

function snapshotInput(snapshot?: RunnerSnapshot): VideoMetricSnapshotInput | null {
  if (!snapshot) {
    return null;
  }
  return {
    viewCount: toNumber(snapshot.viewCount),
    likeCount: toNumber(snapshot.likeCount),
    commentCount: toNumber(snapshot.commentCount),
    capturedAt: snapshot.capturedAt,
  };
}

function countSimilarTrackedVideos(
  video: RunnerVideo,
  trackedChannels: Array<{ channel: { videos: Array<{ id: string; title: string; tags: string[] }> } }>,
): number {
  const terms = new Set(tokenize(`${video.title} ${video.tags.join(" ")}`));
  return trackedChannels
    .flatMap((tracked) => tracked.channel.videos)
    .filter((candidate) => candidate.id !== video.id)
    .filter((candidate) =>
      tokenize(`${candidate.title} ${candidate.tags.join(" ")}`).some((term) => terms.has(term)),
    ).length;
}

function countCorroboratingSources(
  video: RunnerVideo,
  sources: Array<{ items: Array<{ title: string; summary: string | null }> }>,
): number {
  const terms = new Set(tokenize(`${video.title} ${video.tags.join(" ")}`));
  return sources
    .flatMap((source) => source.items)
    .filter((item) => tokenize(`${item.title} ${item.summary ?? ""}`).some((term) => terms.has(term)))
    .length;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((term) => term.length >= 3);
}

function toNumber(value: bigint | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value);
}

function daysAgo(now: Date, days: number): Date {
  const result = new Date(now);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}
```

- [ ] **Step 4: Run runner tests**

Run:

```powershell
npm run test -- tests/outliers/runner.test.ts
```

Expected: PASS.

---

### Task 4: Queue And Scheduler Integration

**Files:**
- Modify: `types/jobs.ts`
- Modify: `lib/jobs/handlers.ts`
- Modify: `lib/jobs/scheduler.ts`
- Test: `tests/jobs/scheduler.test.ts`
- Test: `tests/jobs/worker.test.ts`

- [ ] **Step 1: Add job type**

In `types/jobs.ts`, add:

```ts
outlierScoreRefresh: "outlier_score_refresh",
```

to `JOB_TYPES`.

- [ ] **Step 2: Register the job handler**

In `lib/jobs/handlers.ts`, import:

```ts
import {
  runOutlierScoreRefreshJob,
  type OutlierRunnerPrisma,
} from "@/lib/outliers/runner";
```

Add to `backgroundJobHandlers`:

```ts
[JOB_TYPES.outlierScoreRefresh]: async ({ prisma, job, now }) => {
  const summary = await runOutlierScoreRefreshJob({
    prisma: prisma as OutlierRunnerPrisma,
    channelId: requiredReferenceId(job.metadata),
    workspaceId: optionalWorkspaceId(job.metadata),
    now,
  });
  return summary as unknown as JobMetadata;
},
```

Add this helper:

```ts
function optionalWorkspaceId(metadata: JobMetadata): string | undefined {
  const workspaceId = metadata.workspaceId;
  return typeof workspaceId === "string" && workspaceId.length > 0 ? workspaceId : undefined;
}
```

- [ ] **Step 3: Schedule scoring after due channel refreshes**

In `lib/jobs/scheduler.ts`, add `outlierScoreRefresh: number` to `JobScheduleSummary`, initialize it to `0`, and after enqueuing `youtube_recent_refresh` for each due tracked channel also enqueue:

```ts
const scoreResult = await enqueueJob(prisma, {
  workspaceId: trackedChannel.workspaceId,
  jobType: JOB_TYPES.outlierScoreRefresh,
  provider: "internal",
  referenceType: "YoutubeChannel",
  referenceId: trackedChannel.channel.id,
  metadata: {
    scheduledReason: "tracked_channel_scoring",
    workspaceId: trackedChannel.workspaceId,
  },
  now,
});
summary.outlierScoreRefresh += scoreResult.reused ? 0 : 1;
```

- [ ] **Step 4: Update scheduler test**

In `tests/jobs/scheduler.test.ts`, change expected summary to:

```ts
expect(summary).toEqual({
  youtubeRecentRefresh: 1,
  industrySourceRefresh: 1,
  transcriptFetch: 1,
  dailyReportGenerate: 1,
  outlierScoreRefresh: 1,
});
```

Add an assertion:

```ts
expect(prisma.jobRun.create).toHaveBeenCalledWith(
  expect.objectContaining({
    data: expect.objectContaining({
      jobType: "outlier_score_refresh",
      referenceType: "YoutubeChannel",
      referenceId: "channel-1",
      metadata: expect.objectContaining({
        scheduledReason: "tracked_channel_scoring",
        workspaceId: "workspace-1",
      }),
    }),
  }),
);
```

- [ ] **Step 5: Run job tests**

Run:

```powershell
npm run test -- tests/jobs/scheduler.test.ts tests/jobs/worker.test.ts
```

Expected: PASS.

---

### Task 5: Ranked Outlier Queries And UI

**Files:**
- Create: `lib/outliers/queries.ts`
- Modify: `app/(app)/app/dashboard/page.tsx`
- Modify: `app/(app)/app/outliers/page.tsx`

- [ ] **Step 1: Implement ranked outlier query helper**

Create `lib/outliers/queries.ts`:

```ts
import type { RankedOutlierRow } from "@/types/outliers";

export type OutlierQueryPrisma = {
  workspaceVideoOpportunityScore: {
    findMany(input: unknown): Promise<Array<{
      youtubeVideoId: string;
      opportunityScore: number;
      calculatedAt: Date;
      video: {
        id: string;
        title: string;
        thumbnailUrl: string | null;
        publishedAt: Date;
        channel: { title: string; handle: string | null };
        metricSnapshots: Array<{
          viewCount: bigint | number | null;
          likeCount: bigint | number | null;
          commentCount: bigint | number | null;
        }>;
        outlierScores: Array<{
          outlierScore: number;
          multiplier: number | null;
          calculatedAt: Date;
        }>;
      };
    }>>;
  };
};

export async function getTopWorkspaceOutliers(
  prisma: OutlierQueryPrisma,
  input: { workspaceId: string; limit: number },
): Promise<RankedOutlierRow[]> {
  const rows = await prisma.workspaceVideoOpportunityScore.findMany({
    where: { workspaceId: input.workspaceId },
    orderBy: [{ opportunityScore: "desc" }, { calculatedAt: "desc" }],
    distinct: ["youtubeVideoId"],
    take: input.limit,
    select: {
      youtubeVideoId: true,
      opportunityScore: true,
      calculatedAt: true,
      video: {
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          publishedAt: true,
          channel: { select: { title: true, handle: true } },
          metricSnapshots: {
            orderBy: { capturedAt: "desc" },
            take: 1,
            select: { viewCount: true, likeCount: true, commentCount: true },
          },
          outlierScores: {
            orderBy: { calculatedAt: "desc" },
            take: 1,
            select: { outlierScore: true, multiplier: true, calculatedAt: true },
          },
        },
      },
    },
  });

  return rows.flatMap((row) => {
    const outlierScore = row.video.outlierScores[0];
    if (!outlierScore) {
      return [];
    }

    const snapshot = row.video.metricSnapshots[0];
    return [{
      videoId: row.video.id,
      title: row.video.title,
      channelTitle: row.video.channel.title,
      channelHandle: row.video.channel.handle,
      thumbnailUrl: row.video.thumbnailUrl,
      publishedAt: row.video.publishedAt,
      viewCount: toNumber(snapshot?.viewCount),
      likeCount: toNumber(snapshot?.likeCount),
      commentCount: toNumber(snapshot?.commentCount),
      outlierScore: outlierScore.outlierScore,
      opportunityScore: row.opportunityScore,
      multiplier: outlierScore.multiplier,
      calculatedAt: outlierScore.calculatedAt,
    }];
  });
}

function toNumber(value: bigint | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value);
}
```

- [ ] **Step 2: Update dashboard**

In `app/(app)/app/dashboard/page.tsx`:

1. Import `getTopWorkspaceOutliers`.
2. Fetch `topOutliers` in the existing `Promise.all`.
3. Change the third KPI from `Cached Videos` to `Outliers Found`, using `topOutliers.length`.
4. Replace the `Dashboard outliers` placeholder with a compact list of top 5 outliers showing thumbnail, title, channel, `outlierScore`, `opportunityScore`, and multiplier.

Use this row structure inside the existing `Research Readiness` panel or a renamed `Top Recent Outliers` panel:

```tsx
{topOutliers.length === 0 ? (
  <p className="text-sm text-[var(--yt-text-muted)]">No outlier scores yet. Run the background worker after competitor videos are cached.</p>
) : (
  <div className="space-y-3">
    {topOutliers.map((outlier) => (
      <article className="grid gap-3 rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3 sm:grid-cols-[112px_1fr]" key={outlier.videoId}>
        <div className="aspect-video overflow-hidden rounded-[var(--yt-radius-button)] bg-[var(--yt-surface-soft)]">
          {outlier.thumbnailUrl ? <img alt="" className="h-full w-full object-cover" src={outlier.thumbnailUrl} /> : null}
        </div>
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-bold text-[var(--yt-text)]">{outlier.title}</h3>
          <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">{outlier.channelHandle ?? outlier.channelTitle}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-success-soft)] bg-[var(--yt-success-soft)] px-2 py-0.5 text-[var(--yt-success)]">{outlier.multiplier?.toFixed(1) ?? "n/a"}x</span>
            <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-blue-soft)] bg-[var(--yt-blue-soft)] px-2 py-0.5 text-[var(--yt-blue)]">Outlier {outlier.outlierScore.toFixed(0)}</span>
            {outlier.opportunityScore ? <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-primary-soft)] bg-[var(--yt-primary-soft)] px-2 py-0.5 text-[var(--yt-primary)]">Opportunity {outlier.opportunityScore.toFixed(0)}</span> : null}
          </div>
        </div>
      </article>
    ))}
  </div>
)}
```

- [ ] **Step 3: Build the outliers page**

In `app/(app)/app/outliers/page.tsx`, use the same auth/bootstrap pattern as dashboard, call `getTopWorkspaceOutliers(prisma, { workspaceId, limit: 50 })`, and render:

```tsx
<main className="p-5 lg:p-8">
  <div className="mb-6">
    <h1 className="text-2xl font-bold">Outliers</h1>
    <p className="mt-1 text-sm text-[var(--yt-text-muted)]">Ranked competitor videos by outlier and workspace opportunity score.</p>
  </div>
  <Panel title="Top Ranked Outliers">
    {/* Empty state or table/list rows using the same badges as dashboard. */}
  </Panel>
</main>
```

- [ ] **Step 4: Run TypeScript check**

Run:

```powershell
npm run typecheck
```

Expected: PASS.

---

### Task 6: Verification And Current Feature Update

**Files:**
- Modify: `context/current-feature.md`

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm run test -- tests/outliers/scoring.test.ts tests/outliers/runner.test.ts tests/jobs/scheduler.test.ts tests/jobs/worker.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm run prisma:validate
npm run test
npm run typecheck
npm run build
```

Expected: all PASS.

- [ ] **Step 3: Update current feature tracker**

In `context/current-feature.md`, set:

```md
- **Workflow State:** In Progress
- **Active Phase:** Verification complete
- **Implementation Status:** Spec 010 implemented; ready for /feature review
```

Add to `Implementation Notes`:

```md
- Implemented scoring plan: `docs/superpowers/plans/2026-05-18-outlier-scoring.md`.
- Added global outlier score history, workspace opportunity score history, background score refresh jobs, and ranked dashboard/outliers views.
- Verified `npm run prisma:validate`, `npm run test`, `npm run typecheck`, and `npm run build`.
```

---

## Self-Review

- Spec coverage:
  - Channel baseline calculation: Task 1 and Task 3.
  - Video score calculation: Task 1 and Task 3.
  - Recent velocity calculation: Task 1.
  - Engagement rate: Task 1.
  - Topic/format repeat signal: Task 1.
  - Score history: Task 2 and Task 3.
  - Opportunity score: Task 1, Task 2, and Task 3.
  - Dashboard ranking: Task 5.
- Placeholder scan:
  - The plan avoids TBD/TODO language and includes concrete file paths, code snippets, and commands.
- Type consistency:
  - Shared score types are defined in `types/outliers.ts` before use.
  - Runner summary type matches job metadata serialization needs.
  - Query row type matches dashboard/outliers rendering needs.
