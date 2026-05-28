# Competitor Blueprint Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract reusable, non-copying content patterns from top competitor outliers and surface those blueprint signals in recommendations and the content workspace.

**Architecture:** Treat `VideoAnalysis` as the existing per-video signal source, then add a workspace-scoped `CompetitorBlueprint` rollup model so several top outliers can become one structured strategic summary. Keep extraction deterministic for this spec by using transcript/metadata analysis fields already in the database; later AI router work can replace or enrich the analyzer without changing the storage/query/UI shape.

**Tech Stack:** Next.js App Router, React Server Components, TypeScript strict mode, Prisma 7 client output in `generated/prisma`, Supabase Postgres, Vitest.

---

## File Structure

- Create `types/blueprints.ts`: domain view models, analyzer inputs/outputs, summary rows, and action/runner result types.
- Create `lib/blueprints/analyzer.ts`: pure deterministic extraction and aggregation helpers for title, hook, thumbnail, pillar, structure, CTA, angle, and production notes.
- Create `lib/blueprints/runner.ts`: Prisma-backed workspace/channel orchestration that loads top outliers, creates or updates blueprint rollups, and records job-safe summaries.
- Create `lib/blueprints/queries.ts`: workspace data access helpers for dashboard, topic ideas, and content studio summaries.
- Create `actions/blueprints.ts`: authenticated server action to manually refresh blueprint summaries.
- Create `components/blueprints/blueprint-summary-panel.tsx`: reusable compact blueprint summary panel.
- Create `tests/blueprints/analyzer.test.ts`: pure analyzer tests.
- Create `tests/blueprints/runner.test.ts`: mocked Prisma tests for top-outlier selection and persistence.
- Create `tests/blueprints/queries.test.ts`: query row normalization tests.
- Modify `prisma/schema.prisma`: add `CompetitorBlueprint` and relations.
- Create `prisma/migrations/0012_competitor_blueprints/migration.sql`: add table, indexes, foreign keys, RLS, and direct-client revokes.
- Modify `types/jobs.ts`: add `competitorBlueprintAnalyze`.
- Modify `lib/jobs/handlers.ts`: register the blueprint analysis job handler.
- Modify `lib/jobs/scheduler.ts`: enqueue blueprint analysis after due tracked channel refreshes are scheduled.
- Modify `app/(app)/app/dashboard/page.tsx`: add competitor blueprint signals panel and refresh affordance.
- Modify `app/(app)/app/topic-ideas/page.tsx`: expose blueprint summaries beside evidence queues.
- Modify `app/(app)/app/content-studio/page.tsx`: show blueprint context for future outline/script generation.
- Modify `docs/schema/schema-notes.md`: document workspace-scoped blueprint rollups and non-copying policy.
- Modify `context/current-feature.md`: track planning, implementation, and verification milestones.

---

### Task 1: Blueprint Types And Pure Analyzer

**Files:**
- Create: `types/blueprints.ts`
- Create: `lib/blueprints/analyzer.ts`
- Test: `tests/blueprints/analyzer.test.ts`

- [ ] **Step 1: Write failing analyzer tests**

Create `tests/blueprints/analyzer.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import {
  analyzeBlueprintVideo,
  buildBlueprintSummary,
  sanitizePatternLanguage,
} from "../../lib/blueprints/analyzer";

const outlierVideos = [
  {
    videoId: "video-1",
    youtubeVideoId: "yt-1",
    title: "I Built 7 AI Agents That Run My Business",
    channelTitle: "AI Automation Lab",
    publishedAt: new Date("2026-05-10T00:00:00Z"),
    outlierScore: 92,
    opportunityScore: 88,
    multiplier: 6.4,
    analysis: {
      contentPillar: "AI agents",
      hookType: "build-in-public proof",
      titlePattern: "I built X that does Y",
      thumbnailPattern: "creator face plus numbered system",
      structureJson: {
        hook: "Shows the finished workflow before explaining the build.",
        structure: [
          { label: "Proof", summary: "Shows the working result." },
          { label: "Breakdown", summary: "Explains each agent role." },
          { label: "CTA", summary: "Invites viewers to subscribe for templates." },
        ],
      },
      ctaPattern: "Subscribe for weekly AI automation breakdowns",
      emotionalAngle: "relief from operational overwhelm",
      summary: "Case study about using AI agents to run repeatable creator workflows.",
    },
  },
  {
    videoId: "video-2",
    youtubeVideoId: "yt-2",
    title: "How I Replaced My Marketing Team With AI Workflows",
    channelTitle: "AI Automation Lab",
    publishedAt: new Date("2026-05-12T00:00:00Z"),
    outlierScore: 86,
    opportunityScore: 82,
    multiplier: 4.8,
    analysis: {
      contentPillar: "AI workflows",
      hookType: "before-after transformation",
      titlePattern: "How I replaced X with Y",
      thumbnailPattern: "before-after dashboard",
      structureJson: {
        hook: "Opens with the transformation claim.",
        structure: [
          { label: "Problem", summary: "Frames manual marketing bottlenecks." },
          { label: "System", summary: "Shows the workflow stack." },
        ],
      },
      ctaPattern: "Download the workflow checklist",
      emotionalAngle: "control and speed",
      summary: "Transformation video about replacing manual work with AI systems.",
    },
  },
];

describe("analyzeBlueprintVideo", () => {
  test("extracts non-copying observations from an analyzed outlier video", () => {
    const observation = analyzeBlueprintVideo(outlierVideos[0]);

    expect(observation.videoId).toBe("video-1");
    expect(observation.titlePattern).toBe("I built X that does Y");
    expect(observation.hookPattern).toBe("build-in-public proof");
    expect(observation.structurePattern).toContain("Proof");
    expect(observation.reusableInsight).toContain("Use the pattern");
    expect(observation.reusableInsight).not.toContain(outlierVideos[0].title);
  });
});

describe("buildBlueprintSummary", () => {
  test("rolls top outlier observations into ranked pattern groups", () => {
    const summary = buildBlueprintSummary({
      workspaceId: "workspace-1",
      youtubeChannelId: "channel-1",
      channelTitle: "AI Automation Lab",
      videos: outlierVideos,
      now: new Date("2026-05-18T00:00:00Z"),
    });

    expect(summary.videoCount).toBe(2);
    expect(summary.averageOutlierScore).toBe(89);
    expect(summary.titlePatterns).toContain("I built X that does Y");
    expect(summary.hookPatterns).toContain("build-in-public proof");
    expect(summary.contentPillars).toContain("AI agents");
    expect(summary.observations).toHaveLength(2);
  });
});

describe("sanitizePatternLanguage", () => {
  test("removes quoted competitor titles while keeping reusable strategic meaning", () => {
    const sanitized = sanitizePatternLanguage(
      'The exact title "I Built 7 AI Agents That Run My Business" works because proof comes first.',
      ["I Built 7 AI Agents That Run My Business"],
    );

    expect(sanitized).not.toContain("I Built 7 AI Agents That Run My Business");
    expect(sanitized).toContain("[competitor wording removed]");
  });
});
```

- [ ] **Step 2: Run analyzer tests to verify they fail**

Run:

```powershell
npm run test -- tests/blueprints/analyzer.test.ts
```

Expected: FAIL because `lib/blueprints/analyzer.ts` and `types/blueprints.ts` do not exist.

- [ ] **Step 3: Add shared blueprint types**

Create `types/blueprints.ts` with:

```ts
export type BlueprintVideoAnalysisInput = {
  videoId: string;
  youtubeVideoId: string;
  title: string;
  channelTitle: string;
  publishedAt: Date;
  outlierScore: number;
  opportunityScore: number | null;
  multiplier: number | null;
  analysis: {
    contentPillar: string | null;
    hookType: string | null;
    titlePattern: string | null;
    thumbnailPattern: string | null;
    structureJson: unknown;
    ctaPattern: string | null;
    emotionalAngle: string | null;
    summary: string | null;
  } | null;
};

export type BlueprintObservation = {
  videoId: string;
  youtubeVideoId: string;
  titlePattern: string;
  hookPattern: string;
  thumbnailPattern: string;
  contentPillar: string;
  structurePattern: string;
  ctaPattern: string;
  emotionalAngle: string;
  videoFormat: string;
  productionNotes: string;
  reusableInsight: string;
  outlierScore: number;
  opportunityScore: number | null;
  multiplier: number | null;
};

export type CompetitorBlueprintSummary = {
  workspaceId: string;
  youtubeChannelId: string;
  channelTitle: string;
  videoCount: number;
  averageOutlierScore: number;
  titlePatterns: string[];
  hookPatterns: string[];
  thumbnailPatterns: string[];
  contentPillars: string[];
  structurePatterns: string[];
  ctaPatterns: string[];
  emotionalAngles: string[];
  observations: BlueprintObservation[];
  generatedAt: Date;
};

export type BlueprintSummaryRow = CompetitorBlueprintSummary & {
  id: string;
  updatedAt: Date;
};

export type BlueprintRefreshSummary = {
  workspaceId: string;
  channelsEvaluated: number;
  blueprintsCreated: number;
  blueprintsUpdated: number;
  channelsSkipped: number;
};
```

- [ ] **Step 4: Implement the deterministic analyzer**

Create `lib/blueprints/analyzer.ts` with exported functions:

```ts
import type {
  BlueprintObservation,
  BlueprintVideoAnalysisInput,
  CompetitorBlueprintSummary,
} from "../../types/blueprints";

export function analyzeBlueprintVideo(video: BlueprintVideoAnalysisInput): BlueprintObservation {
  const structurePattern = summarizeStructure(video.analysis?.structureJson);
  const titlePattern = fallback(video.analysis?.titlePattern, inferTitlePattern(video.title));
  const hookPattern = fallback(video.analysis?.hookType, "metadata-led hook");
  const thumbnailPattern = fallback(video.analysis?.thumbnailPattern, "thumbnail pattern unavailable");
  const contentPillar = fallback(video.analysis?.contentPillar, firstUsefulTopic(video.title));
  const ctaPattern = fallback(video.analysis?.ctaPattern, "soft subscribe or resource CTA");
  const emotionalAngle = fallback(video.analysis?.emotionalAngle, "practical confidence");
  const productionNotes = inferProductionNotes(video, thumbnailPattern);
  const reusableInsight = sanitizePatternLanguage(
    `Use the pattern "${titlePattern}" with a ${hookPattern} opening, a ${structurePattern} structure, and a ${emotionalAngle} angle.`,
    [video.title],
  );

  return {
    videoId: video.videoId,
    youtubeVideoId: video.youtubeVideoId,
    titlePattern,
    hookPattern,
    thumbnailPattern,
    contentPillar,
    structurePattern,
    ctaPattern,
    emotionalAngle,
    videoFormat: inferVideoFormat(video.title, structurePattern),
    productionNotes,
    reusableInsight,
    outlierScore: video.outlierScore,
    opportunityScore: video.opportunityScore,
    multiplier: video.multiplier,
  };
}

export function buildBlueprintSummary(input: {
  workspaceId: string;
  youtubeChannelId: string;
  channelTitle: string;
  videos: BlueprintVideoAnalysisInput[];
  now?: Date;
}): CompetitorBlueprintSummary {
  const observations = input.videos.map(analyzeBlueprintVideo);

  return {
    workspaceId: input.workspaceId,
    youtubeChannelId: input.youtubeChannelId,
    channelTitle: input.channelTitle,
    videoCount: observations.length,
    averageOutlierScore: average(observations.map((item) => item.outlierScore)),
    titlePatterns: uniqueTop(observations.map((item) => item.titlePattern)),
    hookPatterns: uniqueTop(observations.map((item) => item.hookPattern)),
    thumbnailPatterns: uniqueTop(observations.map((item) => item.thumbnailPattern)),
    contentPillars: uniqueTop(observations.map((item) => item.contentPillar)),
    structurePatterns: uniqueTop(observations.map((item) => item.structurePattern)),
    ctaPatterns: uniqueTop(observations.map((item) => item.ctaPattern)),
    emotionalAngles: uniqueTop(observations.map((item) => item.emotionalAngle)),
    observations,
    generatedAt: input.now ?? new Date(),
  };
}

export function sanitizePatternLanguage(value: string, blockedPhrases: string[]): string {
  return blockedPhrases.reduce((current, phrase) => {
    if (phrase.trim().length === 0) {
      return current;
    }
    return current.replaceAll(phrase, "[competitor wording removed]");
  }, value);
}

function summarizeStructure(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "hook, proof, breakdown, takeaway";
  }

  const maybeStructure = "structure" in value ? (value as { structure?: unknown }).structure : undefined;
  if (!Array.isArray(maybeStructure)) {
    return "hook, proof, breakdown, takeaway";
  }

  const labels = maybeStructure
    .map((item) => (item && typeof item === "object" && "label" in item ? String((item as { label: unknown }).label) : ""))
    .map((label) => label.trim())
    .filter((label) => label.length > 0);

  return labels.length > 0 ? labels.join(" -> ") : "hook, proof, breakdown, takeaway";
}

function inferTitlePattern(title: string): string {
  if (/^how\b/i.test(title)) {
    return "How to achieve X with Y";
  }
  if (/\bi built\b/i.test(title)) {
    return "I built X that creates Y";
  }
  if (/\b\d+\b/u.test(title)) {
    return "Numbered system or list";
  }
  return "Outcome-led title";
}

function inferVideoFormat(title: string, structurePattern: string): string {
  if (/\bi built\b/i.test(title)) {
    return "case study";
  }
  if (/how\b/i.test(title)) {
    return "tutorial";
  }
  if (structurePattern.toLowerCase().includes("problem")) {
    return "problem-solution breakdown";
  }
  return "strategic explainer";
}

function inferProductionNotes(video: BlueprintVideoAnalysisInput, thumbnailPattern: string): string {
  const multiplier = video.multiplier ? `${video.multiplier.toFixed(1)}x lift` : "strong lift";
  return `${video.channelTitle} used ${thumbnailPattern}; prioritize clear visual contrast and proof of outcome (${multiplier}).`;
}

function firstUsefulTopic(title: string): string {
  return title.split(/[^a-z0-9]+/i).find((term) => term.length > 3) ?? "general strategy";
}

function fallback(value: string | null | undefined, fallbackValue: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallbackValue;
}

function uniqueTop(values: string[], limit = 5): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].slice(0, limit);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10;
}
```

- [ ] **Step 5: Run analyzer tests**

Run:

```powershell
npm run test -- tests/blueprints/analyzer.test.ts
```

Expected: PASS.

---

### Task 2: Blueprint Storage

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0012_competitor_blueprints/migration.sql`
- Modify: `docs/schema/schema-notes.md`

- [ ] **Step 1: Add Prisma relations and model**

In `prisma/schema.prisma`, add `competitorBlueprints CompetitorBlueprint[]` to `Workspace` and `YoutubeChannel`, then add this model after `WorkspaceVideoOpportunityScore`:

```prisma
model CompetitorBlueprint {
  id                 String         @id @default(cuid())
  workspaceId        String
  youtubeChannelId   String
  summary            String?
  titlePatterns      Json
  hookPatterns       Json
  thumbnailPatterns  Json
  contentPillars     Json
  structurePatterns  Json
  ctaPatterns        Json
  emotionalAngles    Json
  observationsJson   Json
  topVideoIds        String[]
  videoCount         Int            @default(0)
  averageOutlierScore Float?
  generatedAt        DateTime       @default(now())
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

  workspace          Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  channel            YoutubeChannel @relation(fields: [youtubeChannelId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, youtubeChannelId])
  @@index([workspaceId, updatedAt])
  @@index([youtubeChannelId])
}
```

- [ ] **Step 2: Add SQL migration**

Create `prisma/migrations/0012_competitor_blueprints/migration.sql`:

```sql
CREATE TABLE "CompetitorBlueprint" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "youtubeChannelId" TEXT NOT NULL,
  "summary" TEXT,
  "titlePatterns" JSONB NOT NULL,
  "hookPatterns" JSONB NOT NULL,
  "thumbnailPatterns" JSONB NOT NULL,
  "contentPillars" JSONB NOT NULL,
  "structurePatterns" JSONB NOT NULL,
  "ctaPatterns" JSONB NOT NULL,
  "emotionalAngles" JSONB NOT NULL,
  "observationsJson" JSONB NOT NULL,
  "topVideoIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "videoCount" INTEGER NOT NULL DEFAULT 0,
  "averageOutlierScore" DOUBLE PRECISION,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompetitorBlueprint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompetitorBlueprint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompetitorBlueprint_youtubeChannelId_fkey" FOREIGN KEY ("youtubeChannelId") REFERENCES "YoutubeChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CompetitorBlueprint_workspaceId_youtubeChannelId_key" ON "CompetitorBlueprint"("workspaceId", "youtubeChannelId");
CREATE INDEX "CompetitorBlueprint_workspaceId_updatedAt_idx" ON "CompetitorBlueprint"("workspaceId", "updatedAt");
CREATE INDEX "CompetitorBlueprint_youtubeChannelId_idx" ON "CompetitorBlueprint"("youtubeChannelId");

ALTER TABLE "CompetitorBlueprint" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CompetitorBlueprint" FROM anon;
REVOKE ALL ON TABLE "CompetitorBlueprint" FROM authenticated;
```

- [ ] **Step 3: Document schema behavior**

Append to `docs/schema/schema-notes.md`:

```md
## Competitor Blueprints

`CompetitorBlueprint` is workspace-scoped because the selected competitor set and downstream content strategy belong to a workspace. The source video metadata, transcripts, analyses, outlier scores, and channels remain globally cached and reusable.

Blueprint rows store structured pattern observations in JSON fields. They must describe reusable patterns and strategic insight, not copied competitor titles, hooks, or script language.
```

- [ ] **Step 4: Validate Prisma schema**

Run:

```powershell
npm run prisma:validate
```

Expected: PASS.

---

### Task 3: Blueprint Runner

**Files:**
- Create: `lib/blueprints/runner.ts`
- Test: `tests/blueprints/runner.test.ts`

- [ ] **Step 1: Write failing runner tests**

Create `tests/blueprints/runner.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";

import { runCompetitorBlueprintAnalysisJob } from "../../lib/blueprints/runner";

describe("runCompetitorBlueprintAnalysisJob", () => {
  test("creates a blueprint for an active tracked channel with analyzed outliers", async () => {
    const prisma = {
      trackedChannel: {
        findMany: vi.fn().mockResolvedValue([
          {
            workspaceId: "workspace-1",
            youtubeChannelId: "channel-1",
            channel: {
              id: "channel-1",
              title: "AI Automation Lab",
              videos: [
                video("video-1", 92, "I built X that does Y"),
                video("video-2", 86, "How to achieve X with Y"),
              ],
            },
          },
        ]),
      },
      competitorBlueprint: {
        upsert: vi.fn().mockResolvedValue({ id: "blueprint-1", createdAt: new Date("2026-05-18T00:00:00Z") }),
      },
    };

    const summary = await runCompetitorBlueprintAnalysisJob({
      prisma,
      workspaceId: "workspace-1",
      now: new Date("2026-05-18T00:00:00Z"),
    });

    expect(summary).toEqual({
      workspaceId: "workspace-1",
      channelsEvaluated: 1,
      blueprintsCreated: 1,
      blueprintsUpdated: 0,
      channelsSkipped: 0,
    });
    expect(prisma.competitorBlueprint.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_youtubeChannelId: {
            workspaceId: "workspace-1",
            youtubeChannelId: "channel-1",
          },
        },
      }),
    );
  });

  test("skips channels without enough analyzed outliers", async () => {
    const prisma = {
      trackedChannel: {
        findMany: vi.fn().mockResolvedValue([
          {
            workspaceId: "workspace-1",
            youtubeChannelId: "channel-1",
            channel: { id: "channel-1", title: "AI Automation Lab", videos: [] },
          },
        ]),
      },
      competitorBlueprint: {
        upsert: vi.fn(),
      },
    };

    const summary = await runCompetitorBlueprintAnalysisJob({
      prisma,
      workspaceId: "workspace-1",
      now: new Date("2026-05-18T00:00:00Z"),
    });

    expect(summary.channelsSkipped).toBe(1);
    expect(prisma.competitorBlueprint.upsert).not.toHaveBeenCalled();
  });
});

function video(id: string, outlierScore: number, titlePattern: string) {
  return {
    id,
    youtubeVideoId: `yt-${id}`,
    title: `Video ${id}`,
    publishedAt: new Date("2026-05-10T00:00:00Z"),
    outlierScores: [{ outlierScore, multiplier: 5.2, calculatedAt: new Date("2026-05-18T00:00:00Z") }],
    opportunityScores: [{ opportunityScore: outlierScore - 4, calculatedAt: new Date("2026-05-18T00:00:00Z") }],
    analyses: [
      {
        contentPillar: "AI agents",
        hookType: "proof first",
        titlePattern,
        thumbnailPattern: "face plus dashboard",
        structureJson: { structure: [{ label: "Proof" }, { label: "Breakdown" }] },
        ctaPattern: "subscribe for templates",
        emotionalAngle: "confidence",
        summary: "A strong outlier pattern.",
      },
    ],
  };
}
```

- [ ] **Step 2: Implement runner**

Create `lib/blueprints/runner.ts`:

```ts
import { buildBlueprintSummary } from "./analyzer";
import type { BlueprintRefreshSummary, BlueprintVideoAnalysisInput } from "../../types/blueprints";

const TOP_OUTLIER_LIMIT = 5;
const MIN_BLUEPRINT_VIDEOS = 2;

type RunnerVideo = {
  id: string;
  youtubeVideoId: string;
  title: string;
  publishedAt: Date;
  outlierScores: Array<{ outlierScore: number; multiplier: number | null; calculatedAt: Date }>;
  opportunityScores: Array<{ opportunityScore: number; calculatedAt: Date }>;
  analyses: Array<{
    contentPillar: string | null;
    hookType: string | null;
    titlePattern: string | null;
    thumbnailPattern: string | null;
    structureJson: unknown;
    ctaPattern: string | null;
    emotionalAngle: string | null;
    summary: string | null;
  }>;
};

type RunnerTrackedChannel = {
  workspaceId: string;
  youtubeChannelId: string;
  channel: {
    id: string;
    title: string;
    videos: RunnerVideo[];
  };
};

export type BlueprintRunnerPrisma = {
  trackedChannel: {
    findMany(input: unknown): Promise<RunnerTrackedChannel[]>;
  };
  competitorBlueprint: {
    upsert(input: unknown): Promise<{ id: string; createdAt: Date }>;
  };
};

export async function runCompetitorBlueprintAnalysisJob(input: {
  prisma: BlueprintRunnerPrisma;
  workspaceId: string;
  youtubeChannelId?: string;
  now?: Date;
}): Promise<BlueprintRefreshSummary> {
  const now = input.now ?? new Date();
  const trackedChannels = await input.prisma.trackedChannel.findMany({
    where: {
      workspaceId: input.workspaceId,
      isActive: true,
      ...(input.youtubeChannelId ? { youtubeChannelId: input.youtubeChannelId } : {}),
    },
    select: {
      workspaceId: true,
      youtubeChannelId: true,
      channel: {
        select: {
          id: true,
          title: true,
          videos: {
            orderBy: [{ outlierScores: { _count: "desc" } }, { publishedAt: "desc" }],
            take: 25,
            select: {
              id: true,
              youtubeVideoId: true,
              title: true,
              publishedAt: true,
              outlierScores: { orderBy: { calculatedAt: "desc" }, take: 1, select: { outlierScore: true, multiplier: true, calculatedAt: true } },
              opportunityScores: { where: { workspaceId: input.workspaceId }, orderBy: { calculatedAt: "desc" }, take: 1, select: { opportunityScore: true, calculatedAt: true } },
              analyses: { orderBy: { createdAt: "desc" }, take: 1, select: { contentPillar: true, hookType: true, titlePattern: true, thumbnailPattern: true, structureJson: true, ctaPattern: true, emotionalAngle: true, summary: true } },
            },
          },
        },
      },
    },
  });

  let blueprintsCreated = 0;
  let blueprintsUpdated = 0;
  let channelsSkipped = 0;

  for (const tracked of trackedChannels) {
    const videos = selectTopBlueprintVideos(tracked.channel.title, tracked.channel.videos);
    if (videos.length < MIN_BLUEPRINT_VIDEOS) {
      channelsSkipped += 1;
      continue;
    }

    const summary = buildBlueprintSummary({
      workspaceId: tracked.workspaceId,
      youtubeChannelId: tracked.youtubeChannelId,
      channelTitle: tracked.channel.title,
      videos,
      now,
    });
    const writeData = {
      summary: readableSummary(summary),
      titlePatterns: summary.titlePatterns,
      hookPatterns: summary.hookPatterns,
      thumbnailPatterns: summary.thumbnailPatterns,
      contentPillars: summary.contentPillars,
      structurePatterns: summary.structurePatterns,
      ctaPatterns: summary.ctaPatterns,
      emotionalAngles: summary.emotionalAngles,
      observationsJson: summary.observations,
      topVideoIds: summary.observations.map((item) => item.videoId),
      videoCount: summary.videoCount,
      averageOutlierScore: summary.averageOutlierScore,
      generatedAt: summary.generatedAt,
    };

    const created = await input.prisma.competitorBlueprint.upsert({
      where: {
        workspaceId_youtubeChannelId: {
          workspaceId: tracked.workspaceId,
          youtubeChannelId: tracked.youtubeChannelId,
        },
      },
      update: writeData,
      create: {
        workspaceId: tracked.workspaceId,
        youtubeChannelId: tracked.youtubeChannelId,
        ...writeData,
      },
    });

    if (created.createdAt.getTime() === now.getTime()) {
      blueprintsCreated += 1;
    } else {
      blueprintsUpdated += 1;
    }
  }

  return {
    workspaceId: input.workspaceId,
    channelsEvaluated: trackedChannels.length,
    blueprintsCreated,
    blueprintsUpdated,
    channelsSkipped,
  };
}

function selectTopBlueprintVideos(channelTitle: string, videos: RunnerVideo[]): BlueprintVideoAnalysisInput[] {
  return videos
    .filter((video) => video.outlierScores[0] && video.analyses[0])
    .sort((left, right) => (right.outlierScores[0]?.outlierScore ?? 0) - (left.outlierScores[0]?.outlierScore ?? 0))
    .slice(0, TOP_OUTLIER_LIMIT)
    .map((video) => ({
      videoId: video.id,
      youtubeVideoId: video.youtubeVideoId,
      title: video.title,
      channelTitle,
      publishedAt: video.publishedAt,
      outlierScore: video.outlierScores[0]?.outlierScore ?? 0,
      opportunityScore: video.opportunityScores[0]?.opportunityScore ?? null,
      multiplier: video.outlierScores[0]?.multiplier ?? null,
      analysis: video.analyses[0] ?? null,
    }));
}

function readableSummary(summary: ReturnType<typeof buildBlueprintSummary>): string {
  const pillars = summary.contentPillars.join(", ") || "mixed pillars";
  const hooks = summary.hookPatterns.join(", ") || "mixed hooks";
  return `${summary.channelTitle} repeatedly wins with ${pillars}, using ${hooks} across ${summary.videoCount} top outliers.`;
}
```

- [ ] **Step 3: Run runner tests**

Run:

```powershell
npm run test -- tests/blueprints/runner.test.ts
```

Expected: PASS.

---

### Task 4: Queries, Action, And Job Integration

**Files:**
- Create: `lib/blueprints/queries.ts`
- Create: `actions/blueprints.ts`
- Modify: `types/jobs.ts`
- Modify: `lib/jobs/handlers.ts`
- Modify: `lib/jobs/scheduler.ts`
- Test: `tests/blueprints/queries.test.ts`
- Test: `tests/jobs/scheduler.test.ts`
- Test: `tests/jobs/handlers.test.ts`

- [ ] **Step 1: Add query tests**

Create `tests/blueprints/queries.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";

import { getWorkspaceBlueprintSummaries } from "../../lib/blueprints/queries";

describe("getWorkspaceBlueprintSummaries", () => {
  test("normalizes JSON fields into string arrays and observation arrays", async () => {
    const prisma = {
      competitorBlueprint: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "blueprint-1",
            workspaceId: "workspace-1",
            youtubeChannelId: "channel-1",
            summary: "AI Automation Lab repeatedly wins with AI agents.",
            titlePatterns: ["I built X"],
            hookPatterns: ["proof first"],
            thumbnailPatterns: ["face plus dashboard"],
            contentPillars: ["AI agents"],
            structurePatterns: ["Proof -> Breakdown"],
            ctaPatterns: ["subscribe for templates"],
            emotionalAngles: ["confidence"],
            observationsJson: [{ videoId: "video-1", titlePattern: "I built X" }],
            videoCount: 2,
            averageOutlierScore: 89,
            generatedAt: new Date("2026-05-18T00:00:00Z"),
            updatedAt: new Date("2026-05-18T00:00:00Z"),
            channel: { title: "AI Automation Lab", handle: "@ai", thumbnailUrl: null },
          },
        ]),
      },
    };

    const rows = await getWorkspaceBlueprintSummaries(prisma, { workspaceId: "workspace-1", limit: 3 });

    expect(rows[0]?.titlePatterns).toEqual(["I built X"]);
    expect(rows[0]?.channelTitle).toBe("AI Automation Lab");
    expect(rows[0]?.observations[0]?.videoId).toBe("video-1");
  });
});
```

- [ ] **Step 2: Implement queries**

Create `lib/blueprints/queries.ts`:

```ts
import type { BlueprintObservation, BlueprintSummaryRow } from "../../types/blueprints";

type BlueprintRecord = {
  id: string;
  workspaceId: string;
  youtubeChannelId: string;
  summary: string | null;
  titlePatterns: unknown;
  hookPatterns: unknown;
  thumbnailPatterns: unknown;
  contentPillars: unknown;
  structurePatterns: unknown;
  ctaPatterns: unknown;
  emotionalAngles: unknown;
  observationsJson: unknown;
  videoCount: number;
  averageOutlierScore: number | null;
  generatedAt: Date;
  updatedAt: Date;
  channel: { title: string; handle: string | null; thumbnailUrl: string | null };
};

export type BlueprintQueryPrisma = {
  competitorBlueprint: {
    findMany(input: unknown): Promise<BlueprintRecord[]>;
  };
};

export async function getWorkspaceBlueprintSummaries(
  prisma: BlueprintQueryPrisma,
  input: { workspaceId: string; limit: number },
): Promise<BlueprintSummaryRow[]> {
  const rows = await prisma.competitorBlueprint.findMany({
    where: { workspaceId: input.workspaceId },
    orderBy: [{ updatedAt: "desc" }],
    take: input.limit,
    select: {
      id: true,
      workspaceId: true,
      youtubeChannelId: true,
      summary: true,
      titlePatterns: true,
      hookPatterns: true,
      thumbnailPatterns: true,
      contentPillars: true,
      structurePatterns: true,
      ctaPatterns: true,
      emotionalAngles: true,
      observationsJson: true,
      videoCount: true,
      averageOutlierScore: true,
      generatedAt: true,
      updatedAt: true,
      channel: { select: { title: true, handle: true, thumbnailUrl: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    youtubeChannelId: row.youtubeChannelId,
    channelTitle: row.channel.title,
    videoCount: row.videoCount,
    averageOutlierScore: row.averageOutlierScore ?? 0,
    titlePatterns: stringArray(row.titlePatterns),
    hookPatterns: stringArray(row.hookPatterns),
    thumbnailPatterns: stringArray(row.thumbnailPatterns),
    contentPillars: stringArray(row.contentPillars),
    structurePatterns: stringArray(row.structurePatterns),
    ctaPatterns: stringArray(row.ctaPatterns),
    emotionalAngles: stringArray(row.emotionalAngles),
    observations: observationArray(row.observationsJson),
    generatedAt: row.generatedAt,
    updatedAt: row.updatedAt,
  }));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function observationArray(value: unknown): BlueprintObservation[] {
  return Array.isArray(value) ? (value.filter((item) => item && typeof item === "object") as BlueprintObservation[]) : [];
}
```

- [ ] **Step 3: Add manual refresh action**

Create `actions/blueprints.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getPrismaClient } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";
import { runCompetitorBlueprintAnalysisJob } from "@/lib/blueprints/runner";

function redirectTo(url: string): never {
  redirect(url as never);
}

export async function refreshCompetitorBlueprints() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirectTo("/sign-in");
  }

  const { workspaceId } = await bootstrapUserWorkspace(user);
  const prisma = getPrismaClient();

  try {
    const summary = await runCompetitorBlueprintAnalysisJob({ prisma, workspaceId });
    redirectTo(`/app/dashboard?blueprints=updated&channels=${summary.channelsEvaluated}&created=${summary.blueprintsCreated}&updated=${summary.blueprintsUpdated}&skipped=${summary.channelsSkipped}`);
  } catch {
    redirectTo("/app/dashboard?error=BLUEPRINT_REFRESH_FAILED");
  }
}
```

- [ ] **Step 4: Add job type and handler**

In `types/jobs.ts`, add:

```ts
competitorBlueprintAnalyze: "competitor_blueprint_analyze",
```

In `lib/jobs/handlers.ts`, import the runner and register:

```ts
[JOB_TYPES.competitorBlueprintAnalyze]: async ({ prisma, job, now }) => {
  const workspaceId = optionalWorkspaceId(job.metadata);
  if (!workspaceId) {
    throw new Error("competitor_blueprint_analyze requires metadata.workspaceId.");
  }

  const summary = await runCompetitorBlueprintAnalysisJob({
    prisma: prisma as BlueprintRunnerPrisma,
    workspaceId,
    youtubeChannelId: optionalReferenceId(job.metadata),
    now,
  });
  return summary as unknown as JobMetadata;
},
```

Add helper:

```ts
function optionalReferenceId(metadata: JobMetadata): string | undefined {
  const referenceId = metadata.referenceId;
  return typeof referenceId === "string" && referenceId.length > 0 ? referenceId : undefined;
}
```

- [ ] **Step 5: Schedule blueprint jobs**

In `lib/jobs/scheduler.ts`, add `competitorBlueprintAnalyze` to the schedule summary and enqueue it for each active due tracked channel after `youtube_recent_refresh` and `outlier_score_refresh` are enqueued:

```ts
await enqueueJob(prisma, {
  workspaceId: trackedChannel.workspaceId,
  jobType: JOB_TYPES.competitorBlueprintAnalyze,
  provider: "internal",
  referenceType: "YoutubeChannel",
  referenceId: trackedChannel.channel.id,
  metadata: {
    scheduledReason: "tracked_channel_blueprint_analysis",
    workspaceId: trackedChannel.workspaceId,
    referenceId: trackedChannel.channel.id,
  },
  now,
});
summary.competitorBlueprintAnalyze += 1;
```

- [ ] **Step 6: Run query and job tests**

Run:

```powershell
npm run test -- tests/blueprints/queries.test.ts tests/jobs/scheduler.test.ts tests/jobs/handlers.test.ts
```

Expected: PASS after updating existing job test expectations for the new summary field and handler registration.

---

### Task 5: Blueprint UI Surfaces

**Files:**
- Create: `components/blueprints/blueprint-summary-panel.tsx`
- Modify: `app/(app)/app/dashboard/page.tsx`
- Modify: `app/(app)/app/topic-ideas/page.tsx`
- Modify: `app/(app)/app/content-studio/page.tsx`

- [ ] **Step 1: Create reusable summary panel**

Create `components/blueprints/blueprint-summary-panel.tsx`:

```tsx
import type { BlueprintSummaryRow } from "@/types/blueprints";

type BlueprintSummaryPanelProps = {
  blueprints: BlueprintSummaryRow[];
  title?: string;
  emptyText?: string;
};

export function BlueprintSummaryPanel({
  blueprints,
  title = "Competitor Blueprint Signals",
  emptyText = "No blueprint summaries yet. Refresh blueprints after outlier and transcript analysis jobs complete.",
}: BlueprintSummaryPanelProps) {
  return (
    <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
      <div className="border-b border-[var(--yt-border)] px-4 py-3">
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      {blueprints.length === 0 ? (
        <p className="p-4 text-sm text-[var(--yt-text-muted)]">{emptyText}</p>
      ) : (
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {blueprints.map((blueprint) => (
            <article className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3" key={blueprint.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-[var(--yt-text)]">{blueprint.channelTitle}</h3>
                  <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">
                    {blueprint.videoCount} outliers analyzed · Avg score {blueprint.averageOutlierScore.toFixed(0)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[...blueprint.contentPillars, ...blueprint.hookPatterns, ...blueprint.thumbnailPatterns].slice(0, 7).map((signal) => (
                  <span className="yt-signal-chip" key={signal}>{signal}</span>
                ))}
              </div>
              {blueprint.observations[0] ? (
                <p className="mt-3 line-clamp-2 text-sm text-[var(--yt-text-secondary)]">
                  {blueprint.observations[0].reusableInsight}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Add dashboard blueprint panel**

In `app/(app)/app/dashboard/page.tsx`:

1. Import `refreshCompetitorBlueprints`, `BlueprintSummaryPanel`, and `getWorkspaceBlueprintSummaries`.
2. Fetch `blueprints` in the existing `Promise.all`.
3. Render a panel below top outliers with a small form button:

```tsx
<div className="mt-5">
  <div className="mb-3 flex items-center justify-between gap-3">
    <h2 className="text-base font-bold">Competitor Blueprint Signals</h2>
    <form action={refreshCompetitorBlueprints}>
      <button className="rounded-[var(--yt-radius-button)] border border-[var(--yt-primary)] bg-white px-3 py-2 text-sm font-bold text-[var(--yt-primary)]" type="submit">
        Refresh Blueprints
      </button>
    </form>
  </div>
  <BlueprintSummaryPanel blueprints={blueprints} title="Latest Blueprint Signals" />
</div>
```

- [ ] **Step 3: Add topic ideas blueprint context**

In `app/(app)/app/topic-ideas/page.tsx`, fetch `blueprints` and render:

```tsx
<div className="mt-5">
  <BlueprintSummaryPanel
    blueprints={blueprints}
    title="Winning Patterns To Consider"
    emptyText="Blueprint signals will appear here after competitor outliers are analyzed."
  />
</div>
```

- [ ] **Step 4: Add content studio blueprint context**

Replace the placeholder body in `app/(app)/app/content-studio/page.tsx` with the same auth/bootstrap pattern used by other app pages, fetch top blueprint summaries, and render a two-column `yt-workspace` style layout:

```tsx
<main className="p-5 lg:p-8">
  <div className="mb-6">
    <h1 className="text-2xl font-bold">Content Studio</h1>
    <p className="mt-1 text-sm text-[var(--yt-text-muted)]">Blueprint-backed outlines, hooks, titles, scripts, captions, and repurposed content will be generated here.</p>
  </div>
  <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
    <BlueprintSummaryPanel blueprints={blueprints} title="Competitor Blueprint Context" />
    <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]">
      <h2 className="text-base font-bold">Generation Workspace</h2>
      <p className="mt-2 text-sm text-[var(--yt-text-muted)]">
        Outline and script generation will use the selected topic, brand profile, and these reusable blueprint patterns without copying competitor language.
      </p>
    </section>
  </div>
</main>
```

- [ ] **Step 5: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: PASS.

---

### Task 6: Full Verification And Tracker Update

**Files:**
- Modify: `context/current-feature.md`

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm run test -- tests/blueprints/analyzer.test.ts tests/blueprints/runner.test.ts tests/blueprints/queries.test.ts tests/jobs/scheduler.test.ts tests/jobs/handlers.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm run prisma:validate
npm run prisma:generate
npm run test
npm run typecheck
npm run build
```

Expected: all PASS.

- [ ] **Step 3: Manual smoke check**

Start the dev server:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3001
```

Open:

```text
http://127.0.0.1:3001/app/dashboard
http://127.0.0.1:3001/app/topic-ideas
http://127.0.0.1:3001/app/content-studio
```

Expected:

- Dashboard shows `Competitor Blueprint Signals` with empty or populated state.
- `Refresh Blueprints` does not expose unauthenticated access and redirects unauthenticated users to sign-in.
- Topic Ideas shows `Winning Patterns To Consider`.
- Content Studio shows `Competitor Blueprint Context` and does not overflow at desktop width.

- [ ] **Step 4: Update current feature tracker**

In `context/current-feature.md`, set:

```md
- **Workflow State:** In Progress
- **Active Phase:** Implementation planned
- **Implementation Status:** Plan ready; implementation not started
```

Add to `Implementation Notes`:

```md
- Implementation plan saved at `docs/superpowers/plans/2026-05-18-competitor-blueprint-analysis.md`.
- Planned storage: workspace-scoped `CompetitorBlueprint` rollups built from top outliers and existing `VideoAnalysis` records.
- Planned verification: blueprint unit tests, job integration tests, Prisma validation/generation, full test suite, typecheck, build, and app UI smoke checks.
```

---

## Self-Review

- Spec coverage:
  - Analyze top outliers per channel: Task 3 selects top scored videos per active tracked channel.
  - Title pattern extraction: Task 1 extracts and rolls up `titlePattern`.
  - Hook analysis: Task 1 extracts `hookType` as `hookPattern`.
  - Thumbnail pattern analysis: Task 1 extracts `thumbnailPattern`.
  - Content pillar tagging: Task 1 extracts `contentPillar`.
  - Structure extraction: Task 1 summarizes `structureJson`.
  - CTA and angle analysis: Task 1 extracts `ctaPattern` and `emotionalAngle`.
  - Store structured records: Task 2 adds `CompetitorBlueprint`.
  - Avoid direct copying: Task 1 sanitizes competitor wording and tests this behavior.
  - Expose in topic recommendations and content workspace: Task 5 adds Topic Ideas and Content Studio visibility.
  - Blueprint data can influence outlines/scripts: Task 5 establishes content workspace context for future generation, without implementing Spec 014/015 generation early.
- Placeholder scan:
  - No placeholder markers or vague deferred-work instructions remain.
  - Each task has concrete files, code, commands, and expected outcomes.
- Type consistency:
  - `BlueprintObservation`, `CompetitorBlueprintSummary`, `BlueprintSummaryRow`, and `BlueprintRefreshSummary` are defined before use.
  - Runner/query/action/UI names all use `blueprints` and `CompetitorBlueprint` consistently.
