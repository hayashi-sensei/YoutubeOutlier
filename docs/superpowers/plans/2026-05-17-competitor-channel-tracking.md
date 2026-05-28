# Competitor Channel Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Spec 005 vertical slice that lets authenticated workspace users add, archive, and approve competitor YouTube channel tracking while reusing global channel records and enforcing plan limits.

**Architecture:** Keep provider-specific YouTube metadata fetching out of this spec by resolving channel URLs into stable global records using normalized channel identifiers from the URL. Put pure parsing and plan-limit rules in tested library modules, server mutations in `actions/competitors.ts`, and the workspace page in `/app/competitors`. Recommended competitors are stored as pending rows and only create tracked channels after explicit approval.

**Tech Stack:** Next.js App Router, Server Actions, React Server Components, Prisma 7, Supabase Auth bootstrap, Zod, Vitest, Tailwind CSS v4 tokens.

---

## File Structure

- Modify `lib/billing/plans.ts`: add `maxTrackedChannels` to plan definitions.
- Create `lib/youtube/channel-url.ts`: pure YouTube channel URL parser and canonical channel helpers.
- Create `schemas/competitors.ts`: Zod schemas for add/archive/recommendation approval actions.
- Create `lib/competitors/tracking.ts`: workspace-scoped tracking business logic with injectable Prisma client/transaction.
- Create `actions/competitors.ts`: authenticated Server Actions that call tracking logic and revalidate `/app/competitors`.
- Modify `app/(app)/app/competitors/page.tsx`: real competitors page with add URL form, active/archived tracked channels, and pending recommendations.
- Create `components/competitors/competitor-channel-form.tsx`: add-channel form with accessible fields.
- Create `components/competitors/tracked-channel-list.tsx`: active and archived channel lists with archive controls.
- Create `components/competitors/recommendation-queue.tsx`: approve/dismiss controls for AI recommendations.
- Create `tests/billing/plans.test.ts` updates: assert channel limits.
- Create `tests/youtube/channel-url.test.ts`: parser coverage.
- Create `tests/competitors/tracking.test.ts`: duplicate reuse, limits, archive, recommendation approval.

## Task 1: Plan Entitlements Include Competitor Limits

**Files:**
- Modify: `lib/billing/plans.ts`
- Modify: `tests/billing/plans.test.ts`

- [ ] **Step 1: Write the failing plan-limit test**

Add this assertion to `tests/billing/plans.test.ts` inside the first test:

```ts
expect(PLAN_DEFINITIONS.FREE.maxTrackedChannels).toBe(0);
expect(PLAN_DEFINITIONS.STARTER.maxTrackedChannels).toBe(5);
expect(PLAN_DEFINITIONS.PRO.maxTrackedChannels).toBe(15);
expect(PLAN_DEFINITIONS.PREMIUM.maxTrackedChannels).toBe(25);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm run test -- tests/billing/plans.test.ts`

Expected: FAIL because `maxTrackedChannels` is missing from `PlanDefinition`.

- [ ] **Step 3: Add the entitlement field**

Update `lib/billing/plans.ts`:

```ts
export type PlanDefinition = {
  code: PlanCode;
  name: string;
  monthlyPriceUsd: number;
  monthlyCredits: number;
  maxTrackedChannels: number;
};
```

Add values to `PLAN_DEFINITIONS`:

```ts
FREE: {
  code: "FREE",
  name: "Free",
  monthlyPriceUsd: 0,
  monthlyCredits: 0,
  maxTrackedChannels: 0,
},
STARTER: {
  code: "STARTER",
  name: "Starter",
  monthlyPriceUsd: 49,
  monthlyCredits: 100,
  maxTrackedChannels: 5,
},
PRO: {
  code: "PRO",
  name: "Pro",
  monthlyPriceUsd: 99,
  monthlyCredits: 250,
  maxTrackedChannels: 15,
},
PREMIUM: {
  code: "PREMIUM",
  name: "Premium",
  monthlyPriceUsd: 199,
  monthlyCredits: 700,
  maxTrackedChannels: 25,
},
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npm run test -- tests/billing/plans.test.ts`

Expected: PASS.

## Task 2: YouTube Channel URL Parser

**Files:**
- Create: `lib/youtube/channel-url.ts`
- Create: `tests/youtube/channel-url.test.ts`

- [ ] **Step 1: Write parser tests**

Create `tests/youtube/channel-url.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { parseYoutubeChannelUrl } from "../../lib/youtube/channel-url";

describe("parseYoutubeChannelUrl", () => {
  test("parses canonical channel URLs", () => {
    expect(parseYoutubeChannelUrl("https://www.youtube.com/channel/UCabc123XYZ")).toEqual({
      type: "channelId",
      value: "UCabc123XYZ",
      canonicalUrl: "https://www.youtube.com/channel/UCabc123XYZ",
    });
  });

  test("parses handle URLs and normalizes casing", () => {
    expect(parseYoutubeChannelUrl("https://youtube.com/@AIAutomationLab/videos")).toEqual({
      type: "handle",
      value: "@aiautomationlab",
      canonicalUrl: "https://www.youtube.com/@aiautomationlab",
    });
  });

  test("parses legacy custom and user URLs", () => {
    expect(parseYoutubeChannelUrl("https://www.youtube.com/c/CreatorScience")).toMatchObject({
      type: "custom",
      value: "CreatorScience",
    });
    expect(parseYoutubeChannelUrl("https://www.youtube.com/user/oldschoolcreator")).toMatchObject({
      type: "user",
      value: "oldschoolcreator",
    });
  });

  test("rejects non-youtube and video URLs", () => {
    expect(() => parseYoutubeChannelUrl("https://example.com/@AIAutomationLab")).toThrow("Enter a valid YouTube channel URL.");
    expect(() => parseYoutubeChannelUrl("https://www.youtube.com/watch?v=abc")).toThrow("Enter a YouTube channel URL, not a video or playlist URL.");
  });
});
```

- [ ] **Step 2: Run parser tests and verify failure**

Run: `npm run test -- tests/youtube/channel-url.test.ts`

Expected: FAIL because `lib/youtube/channel-url.ts` does not exist.

- [ ] **Step 3: Implement parser**

Create `lib/youtube/channel-url.ts`:

```ts
export type ParsedYoutubeChannelUrl =
  | { type: "channelId"; value: string; canonicalUrl: string }
  | { type: "handle"; value: string; canonicalUrl: string }
  | { type: "custom"; value: string; canonicalUrl: string }
  | { type: "user"; value: string; canonicalUrl: string };

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);

function trimSlash(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

export function parseYoutubeChannelUrl(input: string): ParsedYoutubeChannelUrl {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Enter a valid YouTube channel URL.");
  }

  const hostname = url.hostname.toLowerCase();

  if (!YOUTUBE_HOSTS.has(hostname)) {
    throw new Error("Enter a valid YouTube channel URL.");
  }

  const segments = trimSlash(url.pathname).split("/").filter(Boolean);
  const first = segments[0] ?? "";

  if (["watch", "playlist", "shorts", "embed"].includes(first)) {
    throw new Error("Enter a YouTube channel URL, not a video or playlist URL.");
  }

  if (first.startsWith("@")) {
    const handle = first.toLowerCase();
    return {
      type: "handle",
      value: handle,
      canonicalUrl: `https://www.youtube.com/${handle}`,
    };
  }

  if (first === "channel" && segments[1]) {
    return {
      type: "channelId",
      value: segments[1],
      canonicalUrl: `https://www.youtube.com/channel/${segments[1]}`,
    };
  }

  if ((first === "c" || first === "user") && segments[1]) {
    return {
      type: first,
      value: segments[1],
      canonicalUrl: `https://www.youtube.com/${first}/${segments[1]}`,
    };
  }

  throw new Error("Enter a valid YouTube channel URL.");
}
```

- [ ] **Step 4: Run parser tests and verify pass**

Run: `npm run test -- tests/youtube/channel-url.test.ts`

Expected: PASS.

## Task 3: Competitor Tracking Business Logic

**Files:**
- Create: `lib/competitors/tracking.ts`
- Create: `tests/competitors/tracking.test.ts`

- [ ] **Step 1: Write behavior tests**

Create `tests/competitors/tracking.test.ts` with tests for these behaviors:

```ts
import { describe, expect, test } from "vitest";
import { canTrackMoreChannels, createChannelUpsertInput } from "../../lib/competitors/tracking";
import { parseYoutubeChannelUrl } from "../../lib/youtube/channel-url";

describe("competitor tracking rules", () => {
  test("allows tracking below the active channel limit", () => {
    expect(canTrackMoreChannels({ activeCount: 4, maxTrackedChannels: 5 })).toBe(true);
    expect(canTrackMoreChannels({ activeCount: 5, maxTrackedChannels: 5 })).toBe(false);
  });

  test("builds stable global channel upsert input for channel IDs", () => {
    const parsed = parseYoutubeChannelUrl("https://www.youtube.com/channel/UCabc123XYZ");
    expect(createChannelUpsertInput(parsed)).toEqual({
      youtubeChannelId: "UCabc123XYZ",
      handle: undefined,
      title: "UCabc123XYZ",
      sourceUrl: "https://www.youtube.com/channel/UCabc123XYZ",
    });
  });

  test("builds deterministic placeholder IDs for handle URLs until provider resolution exists", () => {
    const parsed = parseYoutubeChannelUrl("https://www.youtube.com/@AIAutomationLab");
    expect(createChannelUpsertInput(parsed)).toEqual({
      youtubeChannelId: "handle:aiautomationlab",
      handle: "@aiautomationlab",
      title: "@aiautomationlab",
      sourceUrl: "https://www.youtube.com/@aiautomationlab",
    });
  });
});
```

- [ ] **Step 2: Run tracking tests and verify failure**

Run: `npm run test -- tests/competitors/tracking.test.ts`

Expected: FAIL because `lib/competitors/tracking.ts` does not exist.

- [ ] **Step 3: Implement pure tracking helpers**

Create the first version of `lib/competitors/tracking.ts`:

```ts
import type { Prisma, RecommendationStatus } from "@/generated/prisma/client";
import { getPlanEntitlement } from "@/lib/billing/plans";
import type { ParsedYoutubeChannelUrl } from "@/lib/youtube/channel-url";

export type ChannelUpsertInput = {
  youtubeChannelId: string;
  handle?: string;
  title: string;
  sourceUrl: string;
};

export function canTrackMoreChannels(input: { activeCount: number; maxTrackedChannels: number }) {
  return input.activeCount < input.maxTrackedChannels;
}

export function createChannelUpsertInput(parsed: ParsedYoutubeChannelUrl): ChannelUpsertInput {
  if (parsed.type === "channelId") {
    return {
      youtubeChannelId: parsed.value,
      handle: undefined,
      title: parsed.value,
      sourceUrl: parsed.canonicalUrl,
    };
  }

  const normalized = parsed.value.startsWith("@") ? parsed.value.slice(1) : parsed.value;
  const idPrefix = parsed.type === "handle" ? "handle" : parsed.type;

  return {
    youtubeChannelId: `${idPrefix}:${normalized.toLowerCase()}`,
    handle: parsed.type === "handle" ? parsed.value : undefined,
    title: parsed.type === "handle" ? parsed.value : parsed.value,
    sourceUrl: parsed.canonicalUrl,
  };
}
```

- [ ] **Step 4: Add database orchestration functions**

Extend `lib/competitors/tracking.ts` with these exported functions:

```ts
export type CompetitorActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };

type TrackingTx = Prisma.TransactionClient;

export async function addTrackedChannel(input: {
  tx: TrackingTx;
  workspaceId: string;
  channel: ChannelUpsertInput;
  nickname?: string;
  reason?: string;
  addedByRecommendation?: boolean;
}) {
  const workspace = await input.tx.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { planCode: true },
  });

  if (!workspace) {
    return { success: false, error: "Workspace not found.", code: "WORKSPACE_NOT_FOUND" } satisfies CompetitorActionResult<never>;
  }

  const activeCount = await input.tx.trackedChannel.count({
    where: { workspaceId: input.workspaceId, isActive: true },
  });
  const entitlement = getPlanEntitlement(workspace.planCode);

  if (!canTrackMoreChannels({ activeCount, maxTrackedChannels: entitlement.maxTrackedChannels })) {
    return {
      success: false,
      error: `Your ${entitlement.name} plan can track ${entitlement.maxTrackedChannels} competitor channels.`,
      code: "TRACKED_CHANNEL_LIMIT_REACHED",
    } satisfies CompetitorActionResult<never>;
  }

  const channel = await input.tx.youtubeChannel.upsert({
    where: { youtubeChannelId: input.channel.youtubeChannelId },
    update: {
      handle: input.channel.handle,
      title: input.channel.title,
    },
    create: {
      youtubeChannelId: input.channel.youtubeChannelId,
      handle: input.channel.handle,
      title: input.channel.title,
      description: `Added from ${input.channel.sourceUrl}`,
    },
    select: { id: true, title: true, handle: true, youtubeChannelId: true },
  });

  const tracked = await input.tx.trackedChannel.upsert({
    where: {
      workspaceId_youtubeChannelId: {
        workspaceId: input.workspaceId,
        youtubeChannelId: channel.id,
      },
    },
    update: {
      isActive: true,
      nickname: input.nickname,
      reason: input.reason,
      addedByRecommendation: input.addedByRecommendation ?? false,
    },
    create: {
      workspaceId: input.workspaceId,
      youtubeChannelId: channel.id,
      nickname: input.nickname,
      reason: input.reason,
      addedByRecommendation: input.addedByRecommendation ?? false,
    },
    select: { id: true },
  });

  return { success: true, data: { trackedChannelId: tracked.id, channelId: channel.id } } satisfies CompetitorActionResult<{
    trackedChannelId: string;
    channelId: string;
  }>;
}

export async function archiveTrackedChannel(input: { tx: TrackingTx; workspaceId: string; trackedChannelId: string }) {
  const updated = await input.tx.trackedChannel.updateMany({
    where: { id: input.trackedChannelId, workspaceId: input.workspaceId, isActive: true },
    data: { isActive: false },
  });

  if (updated.count === 0) {
    return { success: false, error: "Tracked channel was not found.", code: "TRACKED_CHANNEL_NOT_FOUND" } satisfies CompetitorActionResult<never>;
  }

  return { success: true, data: { trackedChannelId: input.trackedChannelId } } satisfies CompetitorActionResult<{ trackedChannelId: string }>;
}

export function nextRecommendationStatus(action: "approve" | "dismiss"): RecommendationStatus {
  return action === "approve" ? "USED" : "DISMISSED";
}
```

- [ ] **Step 5: Run tracking tests and verify pass**

Run: `npm run test -- tests/competitors/tracking.test.ts`

Expected: PASS.

## Task 4: Server Actions And Validation

**Files:**
- Create: `schemas/competitors.ts`
- Create: `actions/competitors.ts`

- [ ] **Step 1: Add input schemas**

Create `schemas/competitors.ts`:

```ts
import { z } from "zod";

export const addCompetitorSchema = z.object({
  channelUrl: z.string().url("Enter a valid YouTube channel URL."),
  nickname: z.string().trim().max(80).optional(),
});

export const trackedChannelIdSchema = z.object({
  trackedChannelId: z.string().min(1),
});

export const recommendationActionSchema = z.object({
  recommendationId: z.string().min(1),
  action: z.enum(["approve", "dismiss"]),
});
```

- [ ] **Step 2: Add authenticated actions**

Create `actions/competitors.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { addTrackedChannel, archiveTrackedChannel, createChannelUpsertInput, nextRecommendationStatus } from "@/lib/competitors/tracking";
import { getPrismaClient } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";
import { parseYoutubeChannelUrl } from "@/lib/youtube/channel-url";
import { addCompetitorSchema, recommendationActionSchema, trackedChannelIdSchema } from "@/schemas/competitors";

function redirectTo(url: string): never {
  redirect(url as never);
}

async function getWorkspaceId() {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirectTo("/sign-in");
  }

  const { workspaceId } = await bootstrapUserWorkspace(supabaseUser);
  return workspaceId;
}

export async function addCompetitorChannel(formData: FormData) {
  const workspaceId = await getWorkspaceId();
  const input = addCompetitorSchema.parse({
    channelUrl: String(formData.get("channelUrl") ?? ""),
    nickname: String(formData.get("nickname") ?? "").trim() || undefined,
  });
  const parsed = parseYoutubeChannelUrl(input.channelUrl);
  const channel = createChannelUpsertInput(parsed);
  const prisma = getPrismaClient();
  const result = await prisma.$transaction((tx) =>
    addTrackedChannel({
      tx,
      workspaceId,
      channel,
      nickname: input.nickname,
      reason: "Manually added competitor.",
    }),
  );

  if (!result.success) {
    redirectTo(`/app/competitors?error=${result.code}`);
  }

  revalidatePath("/app/competitors");
  redirectTo("/app/competitors?added=1");
}

export async function archiveCompetitorChannel(formData: FormData) {
  const workspaceId = await getWorkspaceId();
  const input = trackedChannelIdSchema.parse({
    trackedChannelId: String(formData.get("trackedChannelId") ?? ""),
  });
  const prisma = getPrismaClient();
  const result = await prisma.$transaction((tx) =>
    archiveTrackedChannel({
      tx,
      workspaceId,
      trackedChannelId: input.trackedChannelId,
    }),
  );

  if (!result.success) {
    redirectTo(`/app/competitors?error=${result.code}`);
  }

  revalidatePath("/app/competitors");
  redirectTo("/app/competitors?archived=1");
}

export async function updateCompetitorRecommendation(formData: FormData) {
  const workspaceId = await getWorkspaceId();
  const input = recommendationActionSchema.parse({
    recommendationId: String(formData.get("recommendationId") ?? ""),
    action: String(formData.get("action") ?? ""),
  });
  const prisma = getPrismaClient();

  await prisma.$transaction(async (tx) => {
    const recommendation = await tx.competitorRecommendation.findFirst({
      where: { id: input.recommendationId, workspaceId, status: "NEW" },
      select: { id: true, channelUrl: true, title: true, reason: true },
    });

    if (!recommendation) {
      return;
    }

    if (input.action === "approve") {
      const parsed = parseYoutubeChannelUrl(recommendation.channelUrl);
      const result = await addTrackedChannel({
        tx,
        workspaceId,
        channel: createChannelUpsertInput(parsed),
        nickname: recommendation.title,
        reason: recommendation.reason,
        addedByRecommendation: true,
      });

      if (!result.success) {
        throw new Error(result.code);
      }
    }

    await tx.competitorRecommendation.update({
      where: { id: recommendation.id },
      data: { status: nextRecommendationStatus(input.action) },
    });
  });

  revalidatePath("/app/competitors");
  redirectTo("/app/competitors?recommendation=updated");
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS or actionable TypeScript errors in the new files only.

## Task 5: Competitors Page UI

**Files:**
- Modify: `app/(app)/app/competitors/page.tsx`
- Create: `components/competitors/competitor-channel-form.tsx`
- Create: `components/competitors/tracked-channel-list.tsx`
- Create: `components/competitors/recommendation-queue.tsx`

- [ ] **Step 1: Create the add form component**

Create `components/competitors/competitor-channel-form.tsx`:

```tsx
import { addCompetitorChannel } from "@/actions/competitors";

export function CompetitorChannelForm({ activeCount, maxTrackedChannels }: { activeCount: number; maxTrackedChannels: number }) {
  const atLimit = activeCount >= maxTrackedChannels;

  return (
    <form action={addCompetitorChannel} className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Add competitor channel</h2>
          <p className="mt-1 text-sm text-[var(--yt-text-muted)]">
            {activeCount} of {maxTrackedChannels} competitor slots used.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px_auto]">
        <label className="grid gap-1 text-sm font-semibold">
          YouTube channel URL
          <input
            className="min-h-10 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 text-sm"
            disabled={atLimit}
            name="channelUrl"
            placeholder="https://www.youtube.com/@example"
            type="url"
            required
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Nickname
          <input
            className="min-h-10 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 text-sm"
            disabled={atLimit}
            name="nickname"
            placeholder="Optional"
            type="text"
          />
        </label>
        <button
          className="self-end rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={atLimit}
          type="submit"
        >
          Add Channel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create list and recommendation components**

Create `components/competitors/tracked-channel-list.tsx`:

```tsx
import { archiveCompetitorChannel } from "@/actions/competitors";

export type TrackedChannelListItem = {
  id: string;
  nickname: string | null;
  reason: string | null;
  isActive: boolean;
  createdAt: Date;
  channel: {
    title: string;
    handle: string | null;
    youtubeChannelId: string;
    thumbnailUrl: string | null;
    subscriberCount: bigint | null;
  };
};

function formatSubscriberCount(value: bigint | null) {
  if (value === null) {
    return "Subscribers unavailable";
  }

  return `${new Intl.NumberFormat("en", { notation: "compact" }).format(Number(value))} subscribers`;
}

export function TrackedChannelList({ channels, title }: { channels: TrackedChannelListItem[]; title: string }) {
  return (
    <section className="overflow-hidden rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white">
      <div className="border-b border-[var(--yt-border)] px-4 py-3">
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      {channels.length === 0 ? (
        <p className="p-4 text-sm text-[var(--yt-text-muted)]">No competitors tracked yet.</p>
      ) : (
        <div className="divide-y divide-[var(--yt-border)]">
          {channels.map((tracked) => (
            <div className="grid gap-3 p-4 text-sm md:grid-cols-[1fr_auto] md:items-center" key={tracked.id}>
              <div>
                <p className="font-bold">{tracked.nickname ?? tracked.channel.title}</p>
                <p className="mt-1 text-[var(--yt-text-muted)]">{tracked.channel.handle ?? tracked.channel.youtubeChannelId}</p>
                <p className="mt-1 text-xs text-[var(--yt-text-muted)]">{formatSubscriberCount(tracked.channel.subscriberCount)}</p>
                {tracked.reason ? <p className="mt-2 text-xs text-[var(--yt-text-secondary)]">{tracked.reason}</p> : null}
              </div>
              {tracked.isActive ? (
                <form action={archiveCompetitorChannel}>
                  <input name="trackedChannelId" type="hidden" value={tracked.id} />
                  <button className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2 text-sm font-bold" type="submit">
                    Archive
                  </button>
                </form>
              ) : (
                <span className="rounded-full bg-[var(--yt-surface-soft)] px-3 py-1 text-xs font-bold text-[var(--yt-text-muted)]">Archived</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

Create `components/competitors/recommendation-queue.tsx`:

```tsx
import { updateCompetitorRecommendation } from "@/actions/competitors";

export type CompetitorRecommendationListItem = {
  id: string;
  channelUrl: string;
  title: string;
  reason: string;
  relevanceScore: number;
};

export function RecommendationQueue({ recommendations }: { recommendations: CompetitorRecommendationListItem[] }) {
  return (
    <section className="overflow-hidden rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white">
      <div className="border-b border-[var(--yt-border)] px-4 py-3">
        <h2 className="text-lg font-bold">Recommended competitors</h2>
        <p className="mt-1 text-sm text-[var(--yt-text-muted)]">Approve a recommendation before it becomes tracked.</p>
      </div>
      {recommendations.length === 0 ? (
        <p className="p-4 text-sm text-[var(--yt-text-muted)]">No pending competitor recommendations.</p>
      ) : (
        <div className="divide-y divide-[var(--yt-border)]">
          {recommendations.map((recommendation) => (
            <div className="space-y-3 p-4 text-sm" key={recommendation.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{recommendation.title}</p>
                  <p className="mt-1 text-[var(--yt-text-muted)]">{recommendation.channelUrl}</p>
                </div>
                <span className="rounded-full bg-[var(--yt-primary-soft)] px-3 py-1 text-xs font-extrabold text-[var(--yt-primary)]">
                  {Math.round(recommendation.relevanceScore * 100)} match
                </span>
              </div>
              <p className="text-[var(--yt-text-secondary)]">{recommendation.reason}</p>
              <div className="flex flex-wrap gap-2">
                <form action={updateCompetitorRecommendation}>
                  <input name="recommendationId" type="hidden" value={recommendation.id} />
                  <input name="action" type="hidden" value="approve" />
                  <button className="rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-3 py-2 text-sm font-bold text-white" type="submit">
                    Approve
                  </button>
                </form>
                <form action={updateCompetitorRecommendation}>
                  <input name="recommendationId" type="hidden" value={recommendation.id} />
                  <input name="action" type="hidden" value="dismiss" />
                  <button className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2 text-sm font-bold" type="submit">
                    Dismiss
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Replace the page stub**

Replace `app/(app)/app/competitors/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { CompetitorChannelForm } from "@/components/competitors/competitor-channel-form";
import { RecommendationQueue } from "@/components/competitors/recommendation-queue";
import { TrackedChannelList } from "@/components/competitors/tracked-channel-list";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getPlanEntitlement } from "@/lib/billing/plans";
import { getPrismaClient } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";

export default async function CompetitorsPage() {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirect("/sign-in");
  }

  const bootstrap = await bootstrapUserWorkspace(supabaseUser);
  const prisma = getPrismaClient();
const workspace = await prisma.workspace.findUnique({
  where: { id: bootstrap.workspaceId },
  select: {
    id: true,
    planCode: true,
    trackedChannels: {
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        nickname: true,
        reason: true,
        isActive: true,
        createdAt: true,
        channel: {
          select: {
            title: true,
            handle: true,
            youtubeChannelId: true,
            thumbnailUrl: true,
            subscriberCount: true,
          },
        },
      },
    },
  },
});

  if (!workspace) {
    redirect("/sign-in");
  }

  const recommendations = await prisma.competitorRecommendation.findMany({
    where: { workspaceId: workspace.id, status: "NEW" },
    orderBy: [{ relevanceScore: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      channelUrl: true,
      title: true,
      reason: true,
      relevanceScore: true,
    },
  });
  const entitlement = getPlanEntitlement(workspace.planCode);
  const activeChannels = workspace.trackedChannels.filter((tracked) => tracked.isActive);
  const archivedChannels = workspace.trackedChannels.filter((tracked) => !tracked.isActive);

  return (
    <main className="p-5 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Competitors</h1>
        <p className="mt-1 text-sm text-[var(--yt-text-muted)]">Track competitor channels and approve recommended additions before they enter research workflows.</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <CompetitorChannelForm activeCount={activeChannels.length} maxTrackedChannels={entitlement.maxTrackedChannels} />
          <TrackedChannelList channels={activeChannels} title="Active competitor channels" />
          <TrackedChannelList channels={archivedChannels} title="Archived competitor channels" />
        </div>
        <RecommendationQueue recommendations={recommendations} />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

## Task 6: Seed Recommendation Queue For Manual Verification

**Files:**
- Create: `scripts/seed-competitor-recommendations.mjs`

- [ ] **Step 1: Add a local seed script**

Create `scripts/seed-competitor-recommendations.mjs`:

```js
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const client = await pool.connect();

try {
  const workspaceResult = await client.query('select id from "Workspace" order by "createdAt" asc limit 1');
  const workspaceId = workspaceResult.rows[0]?.id;

  if (!workspaceId) {
    throw new Error("No workspace found.");
  }

  const existing = await client.query('select count(*)::int as count from "CompetitorRecommendation" where "workspaceId" = $1 and status = $2', [
    workspaceId,
    "NEW",
  ]);

  if (existing.rows[0].count > 0) {
    console.log(`Recommendations already exist for ${workspaceId}`);
  } else {
    await client.query(
      'insert into "CompetitorRecommendation" (id, "workspaceId", "channelUrl", title, reason, "relevanceScore", status, "createdAt", "updatedAt") values ($1,$2,$3,$4,$5,$6,$7,now(),now()), ($8,$2,$9,$10,$11,$12,$7,now(),now())',
      [
        `rec_${Date.now()}_1`,
        workspaceId,
        "https://www.youtube.com/@aiautomationlab",
        "AI Automation Lab",
        "Audience overlap with AI agents and no-code automation.",
        0.91,
        "NEW",
        `rec_${Date.now()}_2`,
        "https://www.youtube.com/@creatorbooth",
        "Creator Booth",
        "Similar creator education format with repeatable tutorial patterns.",
        0.82,
      ],
    );
    console.log(`Seeded competitor recommendations for ${workspaceId}`);
  }
} finally {
  client.release();
  await pool.end();
}
```

- [ ] **Step 2: Run the seed only for local manual verification**

Run: `node scripts/seed-competitor-recommendations.mjs`

Expected: logs `Seeded competitor recommendations for <workspaceId>` or `Recommendations already exist for <workspaceId>`.

## Task 7: Verification And Tracker Update

**Files:**
- Modify: `context/current-feature.md`

- [ ] **Step 1: Run automated verification**

Run:

```powershell
npm run test
npm run typecheck
npm run build
```

Expected: all commands pass.

- [ ] **Step 2: Browser-smoke the flow**

Start dev server if needed:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3001
```

Open `http://127.0.0.1:3001/app/competitors` while signed in. Verify:

- Add form renders with the correct used/allowed channel count.
- Adding a duplicate channel URL reuses the same global channel and does not create duplicate active tracking.
- Archive moves an active row into the archived section.
- Approve on a recommendation creates a tracked channel and marks the recommendation used.
- Dismiss marks a recommendation dismissed without creating a tracked channel.

- [ ] **Step 3: Update `context/current-feature.md`**

Set:

```md
- **Workflow State:** In Progress
- **Active Phase:** Implementation Verified
- **Implementation Status:** Complete pending review
```

Append verification notes under `## Implementation Notes` with the exact commands run and results.

## Self-Review

- Spec coverage: manual entry is covered by Tasks 2, 4, and 5; URL parsing by Task 2; global channel reuse by Task 3; workspace tracked records by Tasks 3-5; plan limits by Tasks 1 and 3; archive by Tasks 3-5; recommendation approval by Tasks 4 and 5.
- Placeholder scan: every code-writing step includes concrete file paths, names, and code blocks.
- Type consistency: `maxTrackedChannels`, `parseYoutubeChannelUrl`, `createChannelUpsertInput`, `addTrackedChannel`, `archiveTrackedChannel`, and `nextRecommendationStatus` names are consistent across tests, actions, and UI tasks.
