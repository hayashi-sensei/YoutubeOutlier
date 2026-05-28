# Spec 014 Content Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the selected-topic Content Workspace where recommendation, channel-topic, and manual topics become versioned outline, hook, title, caption, and description assets tied to calendar content items.

**Architecture:** Extend the existing `ContentItem` / `ContentAsset` foundation instead of introducing a parallel workspace model. A content workspace is one `ContentItem`; its generated sections are versioned `ContentAsset` rows; source context is retained through `recommendationId` plus an immutable evidence snapshot for later inspection. The UI becomes a selected-item workspace at `/app/content-studio/[contentItemId]`, while Topic Ideas, competitor channel topic cards, and manual topic creation route users into that workspace.

**Tech Stack:** Next.js App Router Server Components, Server Actions, Prisma 7, Supabase auth bootstrap, Vercel AI SDK model router, Zod schemas, Vitest.

---

## File Structure

- Modify `prisma/schema.prisma`: add source and evidence snapshot fields to `ContentItem`; add optional `aiGenerationId` to `ContentAsset`; index workspace/source lookups.
- Create `prisma/migrations/0021_content_workspace_sources/migration.sql`: SQL migration for the schema changes.
- Modify `types/ai.ts` and `lib/ai/task-config.ts`: add section-specific AI task types for hook, title, caption, and description generation.
- Modify `schemas/content-generation.ts`: add Zod schemas for section outputs and manual topic input.
- Modify `lib/ai/tasks/content-generation.ts`: support outline, hook, title, caption, and description generation from the same evidence-rich context; keep script generation separate.
- Create `types/content-workspace.ts`: shared view models and section constants.
- Create `lib/content-workspace/source.ts`: create/reuse content items from recommendations and manual topics, build evidence snapshots, and load selected workspaces.
- Create `lib/content-workspace/assets.ts`: save section assets with monotonic versions and summarize latest assets.
- Create `actions/content-workspace.ts`: server actions for opening recommendations/channel ideas, creating manual topics, and generating/saving section assets.
- Modify `app/(app)/app/topic-ideas/page.tsx`: add `Create Outline` / `Open Workspace` entry point for global recommendations.
- Modify `app/(app)/app/competitors/[trackedChannelId]/page.tsx`: add the same workspace entry point for channel-specific ideas.
- Modify `app/(app)/app/content-studio/page.tsx`: turn the existing list page into a workspace index plus manual-topic form.
- Create `app/(app)/app/content-studio/[contentItemId]/page.tsx`: selected workspace page with evidence panel, section tabs/panels, generation actions, versions, and calendar status.
- Modify `app/(app)/app/calendar/page.tsx`: show content items and their latest generated assets.
- Create `tests/content-workspace/source.test.ts`: source/reuse/evidence snapshot tests.
- Create `tests/content-workspace/assets.test.ts`: versioning tests.
- Create `tests/ai/content-generation.test.ts`: prompt/schema/task routing tests for all non-script sections.
- Modify `tests/ai/task-config.test.ts`: route matrix expectations for new AI task types.
- Modify `context/current-feature.md`: update implementation notes and history as milestones complete.

---

### Task 1: Data Model For Workspace Sources

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0021_content_workspace_sources/migration.sql`
- Modify: `docs/schema/schema-notes.md`

- [ ] **Step 1: Add `ContentItem` source fields and `ContentAsset.aiGenerationId`**

In `prisma/schema.prisma`, update `ContentItem`:

```prisma
model ContentItem {
  id               String        @id @default(cuid())
  workspaceId      String
  recommendationId String?
  title            String
  contentType      String
  status           ContentStatus @default(IDEA)
  sourceType       String        @default("recommendation")
  manualTopic      String?
  evidenceSnapshot Json?
  scheduledFor     DateTime?
  publishedAt      DateTime?
  notes            String?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  workspace        Workspace            @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  recommendation   TopicRecommendation? @relation(fields: [recommendationId], references: [id], onDelete: SetNull)
  assets           ContentAsset[]
  visualAssets     VisualAsset[]

  @@index([workspaceId, status])
  @@index([workspaceId, scheduledFor])
  @@index([workspaceId, sourceType, updatedAt])
}
```

Update `ContentAsset`:

```prisma
model ContentAsset {
  id             String       @id @default(cuid())
  contentItemId  String
  aiGenerationId String?
  assetType      String
  title          String?
  body           String?
  jsonBody       Json?
  version        Int          @default(1)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  contentItem    ContentItem  @relation(fields: [contentItemId], references: [id], onDelete: Cascade)

  @@index([contentItemId, assetType])
  @@index([aiGenerationId])
}
```

- [ ] **Step 2: Create the migration**

Create `prisma/migrations/0021_content_workspace_sources/migration.sql`:

```sql
ALTER TABLE "ContentItem"
  ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'recommendation',
  ADD COLUMN "manualTopic" TEXT,
  ADD COLUMN "evidenceSnapshot" JSONB;

ALTER TABLE "ContentAsset"
  ADD COLUMN "aiGenerationId" TEXT;

CREATE INDEX "ContentItem_workspaceId_sourceType_updatedAt_idx"
  ON "ContentItem"("workspaceId", "sourceType", "updatedAt");

CREATE INDEX "ContentAsset_aiGenerationId_idx"
  ON "ContentAsset"("aiGenerationId");
```

- [ ] **Step 3: Update schema notes**

In `docs/schema/schema-notes.md`, add a short note under content workspace notes:

```markdown
- Spec 014 content workspaces use `ContentItem` as the selected-topic workspace. `sourceType`, `manualTopic`, and `evidenceSnapshot` preserve whether the item came from a recommendation, channel-specific recommendation, or manual topic, while generated sections remain versioned `ContentAsset` rows.
```

- [ ] **Step 4: Verify Prisma schema**

Run:

```powershell
npm run prisma:validate
```

Expected: Prisma validates successfully.

---

### Task 2: AI Task Types And Section Schemas

**Files:**
- Modify: `types/ai.ts`
- Modify: `lib/ai/task-config.ts`
- Modify: `schemas/content-generation.ts`
- Modify: `tests/ai/task-config.test.ts`

- [ ] **Step 1: Add task types**

In `types/ai.ts`, extend `AI_TASK_TYPES`:

```ts
export const AI_TASK_TYPES = {
  topicRecommendation: "topic_recommendation",
  outlineGeneration: "outline_generation",
  hookGeneration: "hook_generation",
  titleGeneration: "title_generation",
  captionGeneration: "caption_generation",
  descriptionGeneration: "description_generation",
  scriptGeneration: "script_generation",
  imageGeneration: "image_generation",
} as const;
```

- [ ] **Step 2: Add route configs**

In `lib/ai/task-config.ts`, add entries inside `TEXT_TASK_CONFIG`:

```ts
[AI_TASK_TYPES.hookGeneration]: {
  bulk: task(AI_TASK_TYPES.hookGeneration, "google", "gemini-3.1-flash-lite", 1, 0.01, 1200, 0.45),
  standard: task(AI_TASK_TYPES.hookGeneration, "openai", "gpt-5.4", 2, 0.02, 1600, 0.5),
  premium: task(AI_TASK_TYPES.hookGeneration, "anthropic", "claude-sonnet-4-6", 3, 0.04, 2000, 0.55),
},
[AI_TASK_TYPES.titleGeneration]: {
  bulk: task(AI_TASK_TYPES.titleGeneration, "google", "gemini-3.1-flash-lite", 1, 0.01, 1200, 0.45),
  standard: task(AI_TASK_TYPES.titleGeneration, "openai", "gpt-5.4", 2, 0.02, 1600, 0.5),
  premium: task(AI_TASK_TYPES.titleGeneration, "anthropic", "claude-sonnet-4-6", 3, 0.04, 2000, 0.55),
},
[AI_TASK_TYPES.captionGeneration]: {
  bulk: task(AI_TASK_TYPES.captionGeneration, "google", "gemini-3.1-flash-lite", 1, 0.01, 1400, 0.45),
  standard: task(AI_TASK_TYPES.captionGeneration, "openai", "gpt-5.4", 2, 0.03, 2000, 0.45),
  premium: task(AI_TASK_TYPES.captionGeneration, "anthropic", "claude-sonnet-4-6", 3, 0.05, 2400, 0.5),
},
[AI_TASK_TYPES.descriptionGeneration]: {
  bulk: task(AI_TASK_TYPES.descriptionGeneration, "google", "gemini-3.1-flash-lite", 1, 0.01, 1800, 0.35),
  standard: task(AI_TASK_TYPES.descriptionGeneration, "openai", "gpt-5.4", 2, 0.03, 2400, 0.4),
  premium: task(AI_TASK_TYPES.descriptionGeneration, "anthropic", "claude-sonnet-4-6", 3, 0.05, 3000, 0.45),
},
```

- [ ] **Step 3: Update route matrix test**

In `tests/ai/task-config.test.ts`, update:

```ts
expect(matrix).toHaveLength(24);
expect(matrix).toContainEqual(
  expect.objectContaining({
    taskType: AI_TASK_TYPES.hookGeneration,
    qualityTier: "standard",
    provider: "openai",
  }),
);
expect(matrix).toContainEqual(
  expect.objectContaining({
    taskType: AI_TASK_TYPES.descriptionGeneration,
    qualityTier: "premium",
    provider: "anthropic",
  }),
);
```

- [ ] **Step 4: Add section schemas**

In `schemas/content-generation.ts`, add:

```ts
export const hookGenerationSchema = z.object({
  title: z.string().min(1),
  hooks: z.array(z.string().min(1)).min(5),
  rationale: z.string().min(1),
});

export const titleGenerationSchema = z.object({
  title: z.string().min(1),
  titles: z.array(z.string().min(1)).min(8),
  titlePatterns: z.array(z.string().min(1)).min(2),
});

export const captionGenerationSchema = z.object({
  title: z.string().min(1),
  captions: z.array(z.string().min(1)).min(3),
  hashtags: z.array(z.string().min(1)).min(3),
});

export const descriptionGenerationSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  chapters: z.array(z.object({ label: z.string().min(1), timestamp: z.string().min(1) })).default([]),
  pinnedComment: z.string().min(1),
});

export const manualContentTopicSchema = z.object({
  topic: z.string().trim().min(3).max(180),
  angle: z.string().trim().max(500).optional(),
});

export type HookGenerationOutput = z.infer<typeof hookGenerationSchema>;
export type TitleGenerationOutput = z.infer<typeof titleGenerationSchema>;
export type CaptionGenerationOutput = z.infer<typeof captionGenerationSchema>;
export type DescriptionGenerationOutput = z.infer<typeof descriptionGenerationSchema>;
```

- [ ] **Step 5: Verify focused tests**

Run:

```powershell
npm run test -- tests/ai/task-config.test.ts
```

Expected: route config tests pass after implementation.

---

### Task 3: Content Workspace Persistence Helpers

**Files:**
- Create: `types/content-workspace.ts`
- Create: `lib/content-workspace/assets.ts`
- Create: `lib/content-workspace/source.ts`
- Create: `tests/content-workspace/assets.test.ts`
- Create: `tests/content-workspace/source.test.ts`

- [ ] **Step 1: Define section constants and view models**

Create `types/content-workspace.ts`:

```ts
export const CONTENT_WORKSPACE_SECTION_TYPES = ["outline", "hook", "titles", "caption", "description"] as const;

export type ContentWorkspaceSectionType = (typeof CONTENT_WORKSPACE_SECTION_TYPES)[number];

export type ContentWorkspaceSourceType = "recommendation" | "channel_recommendation" | "manual_topic";

export type ContentWorkspaceEvidenceSnapshot = {
  workspaceId: string;
  sourceType: ContentWorkspaceSourceType;
  recommendation?: {
    id: string;
    topic: string;
    title: string;
    angle: string | null;
    whyNow: string | null;
    audiencePainPoint: string | null;
    opportunityScore: number | null;
    suggestedTitle: string | null;
    suggestedHook: string | null;
    thumbnailConcept: string | null;
    linkedinAngle: string | null;
    sourceTrackedChannelId: string | null;
  };
  evidences: Array<{
    id: string;
    evidenceType: string;
    note: string | null;
    video?: {
      id: string;
      youtubeVideoId: string;
      title: string;
      channelTitle: string;
      channelHandle: string | null;
    } | null;
    sourceItem?: {
      id: string;
      title: string;
      url: string;
      sourceName: string | null;
      sourceUrl: string;
    } | null;
  }>;
};
```

- [ ] **Step 2: Write asset versioning tests**

Create `tests/content-workspace/assets.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { saveVersionedContentAsset } from "../../lib/content-workspace/assets";

describe("content workspace assets", () => {
  test("saves the first asset version as version 1", async () => {
    const prisma = {
      contentAsset: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: "asset-1", version: 1 })),
      },
    };

    await expect(
      saveVersionedContentAsset(prisma, {
        contentItemId: "content-1",
        assetType: "outline",
        title: "Outline",
        jsonBody: { title: "Outline" },
        aiGenerationId: "gen-1",
      }),
    ).resolves.toEqual({ id: "asset-1", version: 1 });

    expect(prisma.contentAsset.create).toHaveBeenCalledWith({
      data: {
        contentItemId: "content-1",
        assetType: "outline",
        title: "Outline",
        body: undefined,
        jsonBody: { title: "Outline" },
        aiGenerationId: "gen-1",
        version: 1,
      },
      select: { id: true, version: true },
    });
  });

  test("increments from the latest matching asset version", async () => {
    const prisma = {
      contentAsset: {
        findFirst: vi.fn(async () => ({ version: 3 })),
        create: vi.fn(async () => ({ id: "asset-4", version: 4 })),
      },
    };

    await saveVersionedContentAsset(prisma, {
      contentItemId: "content-1",
      assetType: "hook",
      title: "Hooks",
      jsonBody: { hooks: ["A", "B", "C", "D", "E"] },
    });

    expect(prisma.contentAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 4 }),
      }),
    );
  });
});
```

- [ ] **Step 3: Implement asset helper**

Create `lib/content-workspace/assets.ts`:

```ts
export type ContentAssetWriterPrisma = {
  contentAsset: {
    findFirst(input: {
      where: { contentItemId: string; assetType: string };
      orderBy: { version: "desc" };
      select: { version: true };
    }): Promise<{ version: number } | null>;
    create(input: {
      data: {
        contentItemId: string;
        assetType: string;
        title?: string;
        body?: string;
        jsonBody?: unknown;
        aiGenerationId?: string;
        version: number;
      };
      select: { id: true; version: true };
    }): Promise<{ id: string; version: number }>;
  };
};

export async function saveVersionedContentAsset(
  prisma: ContentAssetWriterPrisma,
  input: {
    contentItemId: string;
    assetType: string;
    title?: string;
    body?: string;
    jsonBody?: unknown;
    aiGenerationId?: string;
  },
): Promise<{ id: string; version: number }> {
  const latest = await prisma.contentAsset.findFirst({
    where: { contentItemId: input.contentItemId, assetType: input.assetType },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  return prisma.contentAsset.create({
    data: {
      contentItemId: input.contentItemId,
      assetType: input.assetType,
      title: input.title,
      body: input.body,
      jsonBody: input.jsonBody,
      aiGenerationId: input.aiGenerationId,
      version: (latest?.version ?? 0) + 1,
    },
    select: { id: true, version: true },
  });
}
```

- [ ] **Step 4: Write source helper tests**

Create `tests/content-workspace/source.test.ts` with tests for:

```ts
import { describe, expect, test, vi } from "vitest";
import { createManualContentWorkspace, openRecommendationContentWorkspace } from "../../lib/content-workspace/source";

describe("content workspace sources", () => {
  test("reuses an existing content item for the same recommendation", async () => {
    const prisma = {
      topicRecommendation: { findFirst: vi.fn() },
      contentItem: {
        findFirst: vi.fn(async () => ({ id: "content-existing" })),
        create: vi.fn(),
      },
    };

    await expect(
      openRecommendationContentWorkspace(prisma, {
        workspaceId: "workspace-1",
        recommendationId: "rec-1",
      }),
    ).resolves.toEqual({ contentItemId: "content-existing", reused: true });
    expect(prisma.topicRecommendation.findFirst).not.toHaveBeenCalled();
    expect(prisma.contentItem.create).not.toHaveBeenCalled();
  });

  test("creates a recommendation-backed content item with evidence snapshot", async () => {
    const prisma = {
      topicRecommendation: {
        findFirst: vi.fn(async () => ({
          id: "rec-1",
          workspaceId: "workspace-1",
          title: "Recommendation",
          topic: "AI workflow",
          angle: "Build the stack",
          whyNow: "Competitors are spiking",
          audiencePainPoint: "Too many demos",
          opportunityScore: 91,
          suggestedTitle: "Build This AI Workflow",
          suggestedHook: "Most demos fail in production.",
          thumbnailConcept: "Five blocks",
          linkedinAngle: "Operational lesson",
          sourceTrackedChannelId: "tracked-1",
          evidences: [],
        })),
      },
      contentItem: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: "content-1" })),
      },
    };

    await openRecommendationContentWorkspace(prisma, {
      workspaceId: "workspace-1",
      recommendationId: "rec-1",
    });

    expect(prisma.contentItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        recommendationId: "rec-1",
        title: "Build This AI Workflow",
        contentType: "youtube_video",
        status: "IDEA",
        sourceType: "channel_recommendation",
        evidenceSnapshot: expect.objectContaining({
          workspaceId: "workspace-1",
          sourceType: "channel_recommendation",
        }),
      }),
      select: { id: true },
    });
  });

  test("creates a manual topic content item without recommendation", async () => {
    const prisma = {
      contentItem: {
        create: vi.fn(async () => ({ id: "content-manual" })),
      },
    };

    await createManualContentWorkspace(prisma, {
      workspaceId: "workspace-1",
      topic: "Manual AI agent idea",
      angle: "Show a simple build",
    });

    expect(prisma.contentItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        recommendationId: null,
        title: "Manual AI agent idea",
        sourceType: "manual_topic",
        manualTopic: "Manual AI agent idea",
      }),
      select: { id: true },
    });
  });
});
```

- [ ] **Step 5: Implement source helpers**

Create `lib/content-workspace/source.ts` with:

```ts
import type { ContentWorkspaceEvidenceSnapshot, ContentWorkspaceSourceType } from "@/types/content-workspace";

type RecommendationForWorkspace = {
  id: string;
  workspaceId: string;
  title: string;
  topic: string;
  angle: string | null;
  whyNow: string | null;
  audiencePainPoint: string | null;
  opportunityScore: number | null;
  suggestedTitle: string | null;
  suggestedHook: string | null;
  thumbnailConcept: string | null;
  linkedinAngle: string | null;
  sourceTrackedChannelId: string | null;
  evidences: Array<{
    id: string;
    evidenceType: string;
    note: string | null;
    video: { id: string; youtubeVideoId: string; title: string; channel: { title: string; handle: string | null } } | null;
    sourceItem: { id: string; title: string; url: string; source: { name: string | null; url: string } } | null;
  }>;
};

export type ContentWorkspaceSourcePrisma = {
  topicRecommendation: {
    findFirst(input: unknown): Promise<RecommendationForWorkspace | null>;
  };
  contentItem: {
    findFirst(input: { where: { workspaceId: string; recommendationId: string }; select: { id: true } }): Promise<{ id: string } | null>;
    create(input: { data: Record<string, unknown>; select: { id: true } }): Promise<{ id: string }>;
  };
};

export async function openRecommendationContentWorkspace(
  prisma: ContentWorkspaceSourcePrisma,
  input: { workspaceId: string; recommendationId: string },
): Promise<{ contentItemId: string; reused: boolean }> {
  const existing = await prisma.contentItem.findFirst({
    where: { workspaceId: input.workspaceId, recommendationId: input.recommendationId },
    select: { id: true },
  });
  if (existing) {
    return { contentItemId: existing.id, reused: true };
  }

  const recommendation = await prisma.topicRecommendation.findFirst({
    where: {
      id: input.recommendationId,
      workspaceId: input.workspaceId,
      status: { notIn: ["DISMISSED", "EXPIRED"] },
    },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      topic: true,
      angle: true,
      whyNow: true,
      audiencePainPoint: true,
      opportunityScore: true,
      suggestedTitle: true,
      suggestedHook: true,
      thumbnailConcept: true,
      linkedinAngle: true,
      sourceTrackedChannelId: true,
      evidences: {
        select: {
          id: true,
          evidenceType: true,
          note: true,
          video: { select: { id: true, youtubeVideoId: true, title: true, channel: { select: { title: true, handle: true } } } },
          sourceItem: { select: { id: true, title: true, url: true, source: { select: { name: true, url: true } } } },
        },
      },
    },
  });
  if (!recommendation) {
    throw new Error("Recommendation was not found for this workspace.");
  }

  const sourceType: ContentWorkspaceSourceType = recommendation.sourceTrackedChannelId ? "channel_recommendation" : "recommendation";
  const contentItem = await prisma.contentItem.create({
    data: {
      workspaceId: input.workspaceId,
      recommendationId: recommendation.id,
      title: recommendation.suggestedTitle ?? recommendation.title,
      contentType: "youtube_video",
      status: "IDEA",
      sourceType,
      evidenceSnapshot: buildEvidenceSnapshot(input.workspaceId, sourceType, recommendation),
      notes: `Created from topic recommendation: ${recommendation.topic}`,
    },
    select: { id: true },
  });

  return { contentItemId: contentItem.id, reused: false };
}

export async function createManualContentWorkspace(
  prisma: Pick<ContentWorkspaceSourcePrisma, "contentItem">,
  input: { workspaceId: string; topic: string; angle?: string },
): Promise<{ contentItemId: string }> {
  const contentItem = await prisma.contentItem.create({
    data: {
      workspaceId: input.workspaceId,
      recommendationId: null,
      title: input.topic,
      contentType: "youtube_video",
      status: "IDEA",
      sourceType: "manual_topic",
      manualTopic: input.topic,
      evidenceSnapshot: {
        workspaceId: input.workspaceId,
        sourceType: "manual_topic",
        manualTopic: input.topic,
        angle: input.angle ?? null,
        evidences: [],
      },
      notes: input.angle ?? null,
    },
    select: { id: true },
  });

  return { contentItemId: contentItem.id };
}

function buildEvidenceSnapshot(
  workspaceId: string,
  sourceType: ContentWorkspaceSourceType,
  recommendation: RecommendationForWorkspace,
): ContentWorkspaceEvidenceSnapshot {
  return {
    workspaceId,
    sourceType,
    recommendation: {
      id: recommendation.id,
      topic: recommendation.topic,
      title: recommendation.title,
      angle: recommendation.angle,
      whyNow: recommendation.whyNow,
      audiencePainPoint: recommendation.audiencePainPoint,
      opportunityScore: recommendation.opportunityScore,
      suggestedTitle: recommendation.suggestedTitle,
      suggestedHook: recommendation.suggestedHook,
      thumbnailConcept: recommendation.thumbnailConcept,
      linkedinAngle: recommendation.linkedinAngle,
      sourceTrackedChannelId: recommendation.sourceTrackedChannelId,
    },
    evidences: recommendation.evidences.map((evidence) => ({
      id: evidence.id,
      evidenceType: evidence.evidenceType,
      note: evidence.note,
      video: evidence.video
        ? {
            id: evidence.video.id,
            youtubeVideoId: evidence.video.youtubeVideoId,
            title: evidence.video.title,
            channelTitle: evidence.video.channel.title,
            channelHandle: evidence.video.channel.handle,
          }
        : null,
      sourceItem: evidence.sourceItem
        ? {
            id: evidence.sourceItem.id,
            title: evidence.sourceItem.title,
            url: evidence.sourceItem.url,
            sourceName: evidence.sourceItem.source.name,
            sourceUrl: evidence.sourceItem.source.url,
          }
        : null,
    })),
  };
}
```

- [ ] **Step 6: Run helper tests**

Run:

```powershell
npm run test -- tests/content-workspace/assets.test.ts tests/content-workspace/source.test.ts
```

Expected: both test files pass.

---

### Task 4: Section Generation Orchestration

**Files:**
- Modify: `lib/ai/tasks/content-generation.ts`
- Create: `tests/ai/content-generation.test.ts`

- [ ] **Step 1: Add section generation tests**

Create `tests/ai/content-generation.test.ts` with a fake router that captures inputs:

```ts
import { describe, expect, test, vi } from "vitest";
import {
  generateContentSectionThroughRouter,
  generateOutlineThroughRouter,
  generateScriptThroughRouter,
} from "../../lib/ai/tasks/content-generation";
import { AI_TASK_TYPES } from "../../types/ai";

const context = {
  workspaceId: "workspace-1",
  userId: "user-1",
  brandVoice: "Direct",
  writingStyleSample: "Short, practical sentences.",
  cta: "Subscribe",
  contentItem: {
    id: "content-1",
    title: "Build an AI workflow",
    manualTopic: null,
    notes: null,
    evidenceSnapshot: {
      workspaceId: "workspace-1",
      sourceType: "recommendation",
      recommendation: {
        id: "rec-1",
        topic: "AI workflow",
        title: "AI workflow",
        angle: "Build it simply",
        whyNow: "Competitors are spiking",
        audiencePainPoint: "Too much complexity",
        opportunityScore: 91,
        suggestedTitle: "Build This AI Workflow",
        suggestedHook: "Most demos fail.",
        thumbnailConcept: "Workflow blocks",
        linkedinAngle: "Practical lesson",
        sourceTrackedChannelId: null,
      },
      evidences: [],
    },
  },
};

describe("content generation task orchestration", () => {
  test("routes hook generation through the hook task with content item reference", async () => {
    const router = {
      runTextTask: vi.fn(async () => ({ text: "", output: { title: "Hooks", hooks: ["1", "2", "3", "4", "5"], rationale: "Variety" } })),
    };

    await generateContentSectionThroughRouter(router, { ...context, sectionType: "hook" });

    expect(router.runTextTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: AI_TASK_TYPES.hookGeneration,
        referenceType: "ContentItem",
        referenceId: "content-1",
        qualityTier: "standard",
      }),
    );
  });

  test("keeps script generation on the explicit script route", async () => {
    const router = { runTextTask: vi.fn(async () => ({ text: "", output: { title: "Script", estimatedDurationMinutes: 8, sections: Array.from({ length: 5 }, (_, index) => ({ heading: `S${index}`, script: "Body" })), description: "Desc" } })) };

    await generateScriptThroughRouter(router, context);

    expect(router.runTextTask).toHaveBeenCalledWith(expect.objectContaining({ taskType: AI_TASK_TYPES.scriptGeneration }));
  });

  test("outline generation still uses outline_generation", async () => {
    const router = { runTextTask: vi.fn(async () => ({ text: "", output: { title: "Outline", hookOptions: ["a", "b", "c"], sections: Array.from({ length: 5 }, (_, index) => ({ heading: `S${index}`, purpose: "Purpose", talkingPoints: ["A", "B"] })), cta: "Subscribe" } })) };

    await generateOutlineThroughRouter(router, context);

    expect(router.runTextTask).toHaveBeenCalledWith(expect.objectContaining({ taskType: AI_TASK_TYPES.outlineGeneration }));
  });
});
```

- [ ] **Step 2: Refactor generation context**

In `lib/ai/tasks/content-generation.ts`, change the context to use a `contentItem` plus evidence snapshot:

```ts
type ContentGenerationContext = {
  workspaceId: string;
  userId: string;
  brandVoice?: string | null;
  writingStyleSample?: string | null;
  cta?: string | null;
  contentItem: {
    id: string;
    title: string;
    manualTopic: string | null;
    notes: string | null;
    evidenceSnapshot: unknown;
  };
};
```

- [ ] **Step 3: Add section routing**

Add:

```ts
export type GeneratableContentSection = "outline" | "hook" | "titles" | "caption" | "description";

const SECTION_TASKS = {
  outline: AI_TASK_TYPES.outlineGeneration,
  hook: AI_TASK_TYPES.hookGeneration,
  titles: AI_TASK_TYPES.titleGeneration,
  caption: AI_TASK_TYPES.captionGeneration,
  description: AI_TASK_TYPES.descriptionGeneration,
} as const;
```

Implement `generateContentSectionThroughRouter` to choose the right schema and prompt. Keep `generateOutlineThroughRouter` as a wrapper around section type `outline`; keep `generateScriptThroughRouter` separate with `qualityTier: "premium"` and `taskType: AI_TASK_TYPES.scriptGeneration`.

- [ ] **Step 4: Enrich the prompt**

Make `contentPrompt()` serialize:

```ts
{
  brandVoice: input.brandVoice,
  writingStyleSample: input.writingStyleSample,
  cta: input.cta,
  contentItem: input.contentItem,
}
```

Expected prompt behavior: the model receives the stored evidence snapshot, so regenerated assets remain grounded in the original source context even if recommendation evidence changes later.

- [ ] **Step 5: Run generation tests**

Run:

```powershell
npm run test -- tests/ai/content-generation.test.ts tests/ai/task-config.test.ts
```

Expected: all tests pass.

---

### Task 5: Server Actions For Workspace Opening And Generation

**Files:**
- Create: `actions/content-workspace.ts`
- Modify: `actions/ai-generation.ts`
- Modify: `actions/recommendations.ts`
- Create or modify tests as needed under `tests/content-workspace/`

- [ ] **Step 1: Create content workspace actions**

Create `actions/content-workspace.ts` with server actions:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAiModelRouter, type AiModelRouterPrisma } from "@/lib/ai/model-router";
import { generateContentSectionThroughRouter, type GeneratableContentSection } from "@/lib/ai/tasks/content-generation";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { saveVersionedContentAsset } from "@/lib/content-workspace/assets";
import {
  createManualContentWorkspace,
  openRecommendationContentWorkspace,
  type ContentWorkspaceSourcePrisma,
} from "@/lib/content-workspace/source";
import { getPrismaClient } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";
import { manualContentTopicSchema } from "@/schemas/content-generation";

function redirectTo(url: string): never {
  redirect(url as never);
}

async function getWorkspaceContextOrRedirect() {
  const supabase = await createClient();
  const { data: { user: supabaseUser } } = await supabase.auth.getUser();
  if (!supabaseUser) {
    redirectTo("/sign-in");
  }
  return bootstrapUserWorkspace(supabaseUser);
}

export async function openRecommendationWorkspace(formData: FormData) {
  const recommendationId = stringField(formData, "recommendationId");
  const { workspaceId } = await getWorkspaceContextOrRedirect();
  const prisma = getPrismaClient();
  const result = await openRecommendationContentWorkspace(prisma as unknown as ContentWorkspaceSourcePrisma, {
    workspaceId,
    recommendationId,
  });
  revalidatePath("/app/content-studio");
  redirectTo(`/app/content-studio/${result.contentItemId}`);
}

export async function createManualWorkspace(formData: FormData) {
  const parsed = manualContentTopicSchema.safeParse({
    topic: formData.get("topic"),
    angle: formData.get("angle") || undefined,
  });
  if (!parsed.success) {
    redirectTo("/app/content-studio?error=manual_topic_invalid");
  }
  const { workspaceId } = await getWorkspaceContextOrRedirect();
  const prisma = getPrismaClient();
  const result = await createManualContentWorkspace(prisma as unknown as ContentWorkspaceSourcePrisma, {
    workspaceId,
    topic: parsed.data.topic,
    angle: parsed.data.angle,
  });
  revalidatePath("/app/content-studio");
  redirectTo(`/app/content-studio/${result.contentItemId}`);
}

export async function generateWorkspaceSection(formData: FormData) {
  const contentItemId = stringField(formData, "contentItemId");
  const sectionType = sectionField(formData, "sectionType");
  const { user, workspaceId } = await getWorkspaceContextOrRedirect();
  const prisma = getPrismaClient();
  const [settings, contentItem] = await Promise.all([
    prisma.workspaceSettings.findUnique({
      where: { workspaceId },
      select: {
        brandVoice: true,
        cta: true,
        writingSamples: { orderBy: { createdAt: "desc" }, take: 1, select: { sampleText: true } },
      },
    }),
    prisma.contentItem.findFirst({
      where: { id: contentItemId, workspaceId },
      select: { id: true, title: true, manualTopic: true, notes: true, evidenceSnapshot: true },
    }),
  ]);
  if (!contentItem) {
    redirectTo("/app/content-studio?error=content_item_not_found");
  }

  const aiRouter = createAiModelRouter({ prisma: prisma as unknown as AiModelRouterPrisma });
  const result = await generateContentSectionThroughRouter(aiRouter, {
    workspaceId,
    userId: user.id,
    brandVoice: settings?.brandVoice,
    writingStyleSample: settings?.writingSamples[0]?.sampleText,
    cta: settings?.cta,
    contentItem,
    sectionType,
  });
  if (!result.output) {
    redirectTo(`/app/content-studio/${contentItemId}?error=${sectionType}_generation_failed`);
  }

  await prisma.$transaction(async (tx) => {
    await saveVersionedContentAsset(tx, {
      contentItemId,
      assetType: sectionType,
      title: outputTitle(result.output, sectionType),
      jsonBody: result.output,
      aiGenerationId: result.generationId,
    });
    await tx.contentItem.update({
      where: { id: contentItemId },
      data: { status: sectionType === "outline" ? "OUTLINE" : undefined },
      select: { id: true },
    });
  });

  revalidatePath(`/app/content-studio/${contentItemId}`);
  revalidatePath("/app/content-studio");
  revalidatePath("/app/calendar");
  revalidatePath("/app/billing");
  redirectTo(`/app/content-studio/${contentItemId}?generated=${sectionType}`);
}
```

Add helper functions `stringField`, `sectionField`, and `outputTitle`. `sectionField` must accept only `"outline"`, `"hook"`, `"titles"`, `"caption"`, and `"description"`.

- [ ] **Step 2: Preserve old action exports temporarily**

In `actions/ai-generation.ts`, either delegate `generateOutlineAsset` to the new `generateWorkspaceSection` only after UI no longer uses the old recommendation form, or leave it untouched until the Content Studio page is migrated. Do not keep duplicate UI paths after Task 7.

- [ ] **Step 3: Keep calendar save behavior intact**

Do not remove `saveRecommendationToCalendar`. Spec 014’s workspace-open action creates/reuses a `ContentItem`, and existing save-to-calendar behavior already marks recommendations `USED`. The selected workspace page will show calendar association by the presence of the `ContentItem`.

- [ ] **Step 4: Run action-adjacent tests**

Run:

```powershell
npm run test -- tests/content-workspace/source.test.ts tests/content-workspace/assets.test.ts tests/recommendations/mutations.test.ts
```

Expected: existing calendar mutation behavior still passes, and new helpers pass.

---

### Task 6: Entry Points From Recommendations And Channel Ideas

**Files:**
- Modify: `app/(app)/app/topic-ideas/page.tsx`
- Modify: `app/(app)/app/competitors/[trackedChannelId]/page.tsx`

- [ ] **Step 1: Import the workspace action**

In both files, import:

```ts
import { openRecommendationWorkspace } from "@/actions/content-workspace";
```

- [ ] **Step 2: Add Create Outline action to Topic Ideas**

In `RecommendationRow`, add a primary action before `Save to Calendar`:

```tsx
<RecommendationAction
  action={openRecommendationWorkspace}
  id={recommendation.id}
  label="Create Outline"
  primary
/>
```

Demote `Save to Calendar` to non-primary if needed so there is one visually dominant action.

- [ ] **Step 3: Add Create Outline action to channel topic cards**

In `ChannelTopicIdeaCard`, add:

```tsx
<form action={openRecommendationWorkspace} className="mt-3">
  <input name="recommendationId" type="hidden" value={recommendation.id} />
  <button
    className="rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-3 py-2 text-xs font-bold text-white"
    type="submit"
  >
    Create Outline
  </button>
</form>
```

- [ ] **Step 4: Verify build catches type mistakes**

Run:

```powershell
npm run typecheck
```

Expected: no TypeScript errors.

---

### Task 7: Content Studio Index And Manual Topic Form

**Files:**
- Modify: `app/(app)/app/content-studio/page.tsx`
- Use: `actions/content-workspace.ts`

- [ ] **Step 1: Replace old recommendation generation buttons**

Remove direct `generateOutlineAsset` / `generateScriptAsset` imports from `app/(app)/app/content-studio/page.tsx`. Import:

```ts
import Link from "next/link";
import { createManualWorkspace, openRecommendationWorkspace } from "@/actions/content-workspace";
```

- [ ] **Step 2: Add manual topic form**

Add a panel near the top:

```tsx
<section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]">
  <h2 className="text-base font-bold">Manual Topic</h2>
  <form action={createManualWorkspace} className="mt-3 grid gap-3">
    <label className="grid gap-1 text-sm font-bold">
      Topic
      <input className="rounded-[var(--yt-radius-input)] border border-[var(--yt-border)] px-3 py-2 font-normal" name="topic" required />
    </label>
    <label className="grid gap-1 text-sm font-bold">
      Angle
      <textarea className="min-h-24 rounded-[var(--yt-radius-input)] border border-[var(--yt-border)] px-3 py-2 font-normal" name="angle" />
    </label>
    <button className="w-fit rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-4 py-2 text-sm font-bold text-white" type="submit">
      Open Workspace
    </button>
  </form>
</section>
```

- [ ] **Step 3: Add recommendation entry list**

For each recommendation in the list, use `openRecommendationWorkspace` and label the action `Open Workspace`.

- [ ] **Step 4: Link recent content items to selected pages**

Wrap recent content item titles with:

```tsx
<Link className="font-bold text-[var(--yt-primary)]" href={`/app/content-studio/${item.id}`}>
  {item.title}
</Link>
```

- [ ] **Step 5: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: no errors.

---

### Task 8: Selected Workspace Page

**Files:**
- Create: `app/(app)/app/content-studio/[contentItemId]/page.tsx`
- Use: `actions/content-workspace.ts`

- [ ] **Step 1: Create the route shell**

Create a server component that authenticates, bootstraps the workspace, loads the content item by `contentItemId`, and calls `notFound()` if it does not belong to the active workspace.

Query:

```ts
const contentItem = await prisma.contentItem.findFirst({
  where: { id: contentItemId, workspaceId },
  select: {
    id: true,
    title: true,
    status: true,
    sourceType: true,
    manualTopic: true,
    notes: true,
    evidenceSnapshot: true,
    scheduledFor: true,
    recommendation: {
      select: {
        id: true,
        topic: true,
        angle: true,
        whyNow: true,
        audiencePainPoint: true,
        opportunityScore: true,
        sourceTrackedChannel: {
          select: {
            id: true,
            nickname: true,
            channel: { select: { title: true, handle: true } },
          },
        },
      },
    },
    assets: {
      orderBy: [{ assetType: "asc" }, { version: "desc" }],
      select: {
        id: true,
        assetType: true,
        title: true,
        body: true,
        jsonBody: true,
        version: true,
        createdAt: true,
      },
    },
  },
});
```

- [ ] **Step 2: Build the two-column workspace layout**

Use the design-system layout:

```tsx
<main className="yt-workspace grid gap-5 p-5 lg:grid-cols-[0.85fr_1.15fr] lg:p-8">
  <aside className="space-y-5">...</aside>
  <section className="space-y-5">...</section>
</main>
```

Left column includes source type, recommendation fields, channel source if present, manual topic angle, and evidence snapshot badges.

- [ ] **Step 3: Render generation panels**

For each section type `outline`, `hook`, `titles`, `caption`, `description`, render:

```tsx
<form action={generateWorkspaceSection}>
  <input name="contentItemId" type="hidden" value={contentItem.id} />
  <input name="sectionType" type="hidden" value="outline" />
  <button className="rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-3 py-2 text-xs font-bold text-white" type="submit">
    Generate Outline
  </button>
</form>
```

Below each action, show the latest asset version and a compact version history. Use `JSON.stringify(asset.jsonBody, null, 2)` inside a `<pre>` for v1 rendering; do not use raw `dangerouslySetInnerHTML`.

- [ ] **Step 4: Keep full script separate**

Do not add automatic script generation to the page. If a script action remains visible, label it separately as `Generate Script` and keep it visually after outline/hooks/titles. Script generation may be retained from Spec 013 but must not run as part of outline generation.

- [ ] **Step 5: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: no errors.

---

### Task 9: Calendar And Recent Asset Visibility

**Files:**
- Modify: `app/(app)/app/calendar/page.tsx`
- Modify: `app/(app)/app/content-studio/page.tsx`

- [ ] **Step 1: Load latest assets on calendar**

In `app/(app)/app/calendar/page.tsx`, add `assets` to the query:

```ts
assets: {
  orderBy: [{ updatedAt: "desc" }],
  take: 5,
  select: { id: true, assetType: true, version: true },
},
```

- [ ] **Step 2: Render asset chips**

Inside each calendar row:

```tsx
{item.assets.length > 0 ? (
  <div className="mt-2 flex flex-wrap gap-2">
    {item.assets.map((asset) => (
      <span className="rounded-[var(--yt-radius-pill)] border border-[var(--yt-border)] bg-[var(--yt-surface-soft)] px-2 py-1 text-[11px] font-bold text-[var(--yt-text-secondary)]" key={asset.id}>
        {asset.assetType} v{asset.version}
      </span>
    ))}
  </div>
) : null}
```

- [ ] **Step 3: Link calendar items back to workspace**

Wrap the content title:

```tsx
<Link className="font-bold text-[var(--yt-primary)]" href={`/app/content-studio/${item.id}`}>
  {item.title}
</Link>
```

- [ ] **Step 4: Verify typecheck**

Run:

```powershell
npm run typecheck
```

Expected: no errors.

---

### Task 10: Final Verification And Tracker Update

**Files:**
- Modify: `context/current-feature.md`

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm run test -- tests/content-workspace/assets.test.ts tests/content-workspace/source.test.ts tests/ai/content-generation.test.ts tests/ai/task-config.test.ts tests/recommendations/mutations.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm run prisma:validate
npm run prisma:generate
npm run test
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 3: Run local app smoke checks**

Start the dev server if it is not already running:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3001
```

Smoke-check:

- `/app/topic-ideas`: a recommendation has `Create Outline`.
- `/app/competitors/<trackedChannelId>`: a channel topic idea has `Create Outline`.
- `/app/content-studio`: manual topic form opens a selected workspace.
- `/app/content-studio/<contentItemId>`: outline, hooks, titles, captions, and description each generate a new version.
- `/app/calendar`: content items show generated asset chips and link back to the workspace.

- [ ] **Step 4: Update feature tracker**

In `context/current-feature.md`, set:

```markdown
- **Workflow State:** In Progress
- **Active Phase:** Verification
- **Implementation Status:** Implemented
```

Append a History bullet:

```markdown
- Implemented Spec 014 Content Workspace with selected-topic workspace routes, recommendation/channel/manual topic entry points, versioned section assets, evidence snapshots, and calendar-linked generated assets.
```

---

## Self-Review

- Spec coverage: The plan covers recommendation opening, channel-specific recommendation opening, manual topic workspaces, outline generation, hook/title/caption/description generation, saved/versioned content assets, regeneration, evidence preservation, and calendar association through `ContentItem`.
- Scope discipline: Full script generation remains separate and is not part of outline generation. Existing script support can remain, but this plan does not expand it.
- Placeholder scan: No task uses TBD/fill-later instructions; every implementation step names files, functions, commands, and expected outcomes.
- Type consistency: Section names are stable: `outline`, `hook`, `titles`, `caption`, `description`; AI task type names match `AI_TASK_TYPES`; source types are `recommendation`, `channel_recommendation`, `manual_topic`.
