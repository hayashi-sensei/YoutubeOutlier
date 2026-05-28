# Admin Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first internal admin console for user lookup, subscription and credit inspection, audited credit adjustments, failed job visibility, AI usage logs, provider failure summaries, and failed report retry.

**Architecture:** Keep admin authorization server-side and based on the application `User.role`, never Supabase user metadata. Move admin reads/mutations into `lib/admin/` and `actions/admin.ts`, then render a dense dashboard in the existing `/app/admin` route. Reuse the existing Prisma models from Spec 003 and the current `applyAdminCreditAdjustment` helper.

**Tech Stack:** Next.js App Router Server Components, Server Actions, Prisma 7, Supabase SSR Auth, Vitest, TypeScript strict mode.

---

## File Structure

- Create `lib/admin/auth.ts`: server-side admin session resolution and authorization helpers.
- Create `lib/admin/overview.ts`: admin read model queries for users, workspaces, subscriptions, credits, jobs, AI logs, provider failures, reports, and audit logs.
- Create `lib/admin/report-retry.ts`: pure retry eligibility and retry data helpers.
- Create `actions/admin.ts`: audited admin mutations for credit adjustment and failed report retry.
- Modify `app/(admin)/app/admin/page.tsx`: replace the current small workspace list with a full Spec 004 admin console.
- Keep `actions/admin-credits.ts` temporarily only as a migration bridge if needed, then stop importing it from the page.
- Modify `lib/billing/credits.ts`: optionally return the credit transaction ID from admin adjustments if needed for audit cross-linking.
- Create `tests/admin/auth.test.ts`: role authorization unit tests.
- Create `tests/admin/overview.test.ts`: provider failure and usage summary tests using pure helpers where possible.
- Create `tests/admin/report-retry.test.ts`: report retry eligibility and state transition tests.
- Modify `context/current-feature.md`: update status/history after implementation milestones.

No schema change is planned. The required models already exist in `prisma/schema.prisma`: `User`, `Workspace`, `Subscription`, `CreditTransaction`, `AiGeneration`, `JobRun`, `ResearchReport`, and `AdminAuditLog`.

---

### Task 1: Admin Authorization Boundary

**Files:**
- Create: `lib/admin/auth.ts`
- Test: `tests/admin/auth.test.ts`

- [ ] **Step 1: Write the failing authorization tests**

```ts
import { describe, expect, test } from "vitest";
import { assertAdminRole, isAdminRole } from "../../lib/admin/auth";

describe("admin authorization", () => {
  test("allows ADMIN application role", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(() => assertAdminRole({ role: "ADMIN" })).not.toThrow();
  });

  test("rejects USER application role", () => {
    expect(isAdminRole("USER")).toBe(false);
    expect(() => assertAdminRole({ role: "USER" })).toThrow("Admin access is required.");
  });

  test("rejects missing application user", () => {
    expect(() => assertAdminRole(null)).toThrow("Admin access is required.");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm run test -- tests/admin/auth.test.ts`

Expected: fail because `lib/admin/auth.ts` does not exist.

- [ ] **Step 3: Implement the helper**

```ts
import { redirect } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getPrismaClient } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";

type RoleRecord = {
  role: UserRole;
};

export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === "ADMIN";
}

export function assertAdminRole(user: RoleRecord | null): void {
  if (!isAdminRole(user?.role)) {
    throw new Error("Admin access is required.");
  }
}

export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirect("/sign-in?next=/app/admin" as never);
  }

  const bootstrap = await bootstrapUserWorkspace(supabaseUser);
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({
    where: { id: bootstrap.user.id },
    select: { id: true, email: true, role: true, defaultWorkspaceId: true },
  });

  if (!isAdminRole(user?.role)) {
    redirect("/app/dashboard" as never);
  }

  return { appUser: user, workspaceId: bootstrap.workspaceId };
}
```

- [ ] **Step 4: Run the authorization test**

Run: `npm run test -- tests/admin/auth.test.ts`

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add lib/admin/auth.ts tests/admin/auth.test.ts
git commit -m "[SPEC-004] Add admin authorization boundary"
```

---

### Task 2: Admin Read Models

**Files:**
- Create: `lib/admin/overview.ts`
- Test: `tests/admin/overview.test.ts`

- [ ] **Step 1: Write pure summary tests**

```ts
import { describe, expect, test } from "vitest";
import { summarizeProviderFailures, summarizeUserUsage } from "../../lib/admin/overview";

describe("admin overview summaries", () => {
  test("summarizes provider failures by provider and model", () => {
    const rows = [
      { provider: "openai", model: "gpt-5.2", status: "FAILED" as const, costUsd: null, creditsCharged: 0 },
      { provider: "openai", model: "gpt-5.2", status: "FAILED" as const, costUsd: null, creditsCharged: 0 },
      { provider: "gemini", model: "flash", status: "SUCCEEDED" as const, costUsd: "0.0100", creditsCharged: 1 },
    ];

    expect(summarizeProviderFailures(rows)).toEqual([
      { provider: "openai", model: "gpt-5.2", failures: 2 },
    ]);
  });

  test("summarizes usage totals", () => {
    const rows = [
      { provider: "openai", model: "gpt-5.2", status: "SUCCEEDED" as const, costUsd: "0.1250", creditsCharged: 5 },
      { provider: "openai", model: "gpt-5.2", status: "FAILED" as const, costUsd: null, creditsCharged: 0 },
    ];

    expect(summarizeUserUsage(rows)).toEqual({
      generations: 2,
      failedGenerations: 1,
      creditsCharged: 5,
      costUsd: 0.125,
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm run test -- tests/admin/overview.test.ts`

Expected: fail because `lib/admin/overview.ts` does not exist.

- [ ] **Step 3: Implement pure helpers and query function**

```ts
import type { AiGenerationStatus } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";

type GenerationSummaryInput = {
  provider: string;
  model: string;
  status: AiGenerationStatus;
  costUsd: string | number | null;
  creditsCharged: number;
};

export function summarizeProviderFailures(rows: GenerationSummaryInput[]) {
  const grouped = new Map<string, { provider: string; model: string; failures: number }>();

  for (const row of rows) {
    if (row.status !== "FAILED") {
      continue;
    }

    const key = `${row.provider}:${row.model}`;
    const current = grouped.get(key) ?? { provider: row.provider, model: row.model, failures: 0 };
    current.failures += 1;
    grouped.set(key, current);
  }

  return [...grouped.values()].sort((a, b) => b.failures - a.failures);
}

export function summarizeUserUsage(rows: GenerationSummaryInput[]) {
  return rows.reduce(
    (summary, row) => ({
      generations: summary.generations + 1,
      failedGenerations: summary.failedGenerations + (row.status === "FAILED" ? 1 : 0),
      creditsCharged: summary.creditsCharged + row.creditsCharged,
      costUsd: summary.costUsd + Number(row.costUsd ?? 0),
    }),
    { generations: 0, failedGenerations: 0, creditsCharged: 0, costUsd: 0 },
  );
}

export async function getAdminOverview(search: string | null) {
  const prisma = getPrismaClient();
  const normalizedSearch = search?.trim() ?? "";

  const users = await prisma.user.findMany({
    where: normalizedSearch
      ? {
          OR: [
            { email: { contains: normalizedSearch, mode: "insensitive" } },
            { name: { contains: normalizedSearch, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      defaultWorkspaceId: true,
      ownedWorkspaces: {
        take: 3,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          planCode: true,
          creditBalance: true,
          subscriptions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              planCode: true,
              status: true,
              currentPeriodEnd: true,
              cancelAtPeriodEnd: true,
            },
          },
          creditTransactions: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              type: true,
              amount: true,
              balanceAfter: true,
              description: true,
              createdAt: true,
            },
          },
        },
      },
      aiGenerations: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          provider: true,
          model: true,
          status: true,
          taskType: true,
          costUsd: true,
          creditsCharged: true,
          errorMessage: true,
          createdAt: true,
        },
      },
    },
  });

  const [failedJobs, recentAiGenerations, failedReports, auditLogs] = await Promise.all([
    prisma.jobRun.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        workspaceId: true,
        jobType: true,
        provider: true,
        referenceType: true,
        referenceId: true,
        attempts: true,
        maxAttempts: true,
        errorMessage: true,
        updatedAt: true,
      },
    }),
    prisma.aiGeneration.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        workspaceId: true,
        userId: true,
        taskType: true,
        provider: true,
        model: true,
        status: true,
        costUsd: true,
        creditsCharged: true,
        errorMessage: true,
        createdAt: true,
      },
    }),
    prisma.researchReport.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        workspaceId: true,
        title: true,
        errorMessage: true,
        updatedAt: true,
      },
    }),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        reason: true,
        createdAt: true,
        actor: { select: { email: true } },
      },
    }),
  ]);

  return {
    users,
    failedJobs,
    failedReports,
    auditLogs,
    recentAiGenerations,
    providerFailures: summarizeProviderFailures(
      recentAiGenerations.map((row) => ({
        provider: row.provider,
        model: row.model,
        status: row.status,
        costUsd: row.costUsd?.toString() ?? null,
        creditsCharged: row.creditsCharged,
      })),
    ),
  };
}
```

- [ ] **Step 4: Run the summary tests**

Run: `npm run test -- tests/admin/overview.test.ts`

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add lib/admin/overview.ts tests/admin/overview.test.ts
git commit -m "[SPEC-004] Add admin overview read models"
```

---

### Task 3: Failed Report Retry Mutation

**Files:**
- Create: `lib/admin/report-retry.ts`
- Create or Modify: `actions/admin.ts`
- Test: `tests/admin/report-retry.test.ts`

- [ ] **Step 1: Write retry eligibility tests**

```ts
import { describe, expect, test } from "vitest";
import { assertReportRetryable, getRetriedReportData } from "../../lib/admin/report-retry";

describe("admin report retry", () => {
  test("allows failed reports to be retried", () => {
    expect(() => assertReportRetryable({ status: "FAILED" })).not.toThrow();
    expect(getRetriedReportData()).toEqual({
      status: "QUEUED",
      errorMessage: null,
      generatedAt: null,
    });
  });

  test("rejects non-failed reports", () => {
    expect(() => assertReportRetryable({ status: "COMPLETED" })).toThrow("Only failed reports can be retried.");
    expect(() => assertReportRetryable(null)).toThrow("Report was not found.");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm run test -- tests/admin/report-retry.test.ts`

Expected: fail because `lib/admin/report-retry.ts` does not exist.

- [ ] **Step 3: Implement retry helper**

```ts
import type { ReportStatus } from "@/generated/prisma/client";

type ReportRetryRecord = {
  status: ReportStatus;
};

export function assertReportRetryable(report: ReportRetryRecord | null): void {
  if (!report) {
    throw new Error("Report was not found.");
  }

  if (report.status !== "FAILED") {
    throw new Error("Only failed reports can be retried.");
  }
}

export function getRetriedReportData() {
  return {
    status: "QUEUED" as const,
    errorMessage: null,
    generatedAt: null,
  };
}
```

- [ ] **Step 4: Implement admin server actions**

Create `actions/admin.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { applyAdminCreditAdjustment } from "@/lib/billing/credits";
import { requireAdmin } from "@/lib/admin/auth";
import { assertReportRetryable, getRetriedReportData } from "@/lib/admin/report-retry";
import { getPrismaClient } from "@/lib/db/prisma";

function redirectTo(url: string): never {
  redirect(url as never);
}

export async function adjustWorkspaceCredits(formData: FormData) {
  const { appUser } = await requireAdmin();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const amount = Number.parseInt(String(formData.get("amount") ?? ""), 10);
  const reason = String(formData.get("reason") ?? "").trim();

  if (!workspaceId || !Number.isInteger(amount) || amount === 0 || !reason) {
    redirectTo("/app/admin?error=invalid_adjustment");
  }

  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    await applyAdminCreditAdjustment(tx, {
      workspaceId,
      actorUserId: appUser.id,
      amount,
      reason,
    });

    await tx.adminAuditLog.create({
      data: {
        actorUserId: appUser.id,
        action: "credit.adjust",
        targetType: "Workspace",
        targetId: workspaceId,
        reason,
        metadata: { amount },
      },
    });
  });

  revalidatePath("/app/admin");
  redirectTo("/app/admin?adjusted=1");
}

export async function retryFailedReport(formData: FormData) {
  const { appUser } = await requireAdmin();
  const reportId = String(formData.get("reportId") ?? "");

  if (!reportId) {
    redirectTo("/app/admin?error=invalid_report");
  }

  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const report = await tx.researchReport.findUnique({
      where: { id: reportId },
      select: { id: true, status: true, workspaceId: true },
    });

    assertReportRetryable(report);

    await tx.researchReport.update({
      where: { id: reportId },
      data: getRetriedReportData(),
    });

    await tx.jobRun.create({
      data: {
        workspaceId: report.workspaceId,
        jobType: "manual_report_generate",
        status: "QUEUED",
        referenceType: "ResearchReport",
        referenceId: report.id,
        attempts: 0,
        maxAttempts: 3,
        metadata: { retriedByAdminUserId: appUser.id },
      },
    });

    await tx.adminAuditLog.create({
      data: {
        actorUserId: appUser.id,
        action: "report.retry",
        targetType: "ResearchReport",
        targetId: report.id,
        reason: "Admin retry of failed report",
      },
    });
  });

  revalidatePath("/app/admin");
  redirectTo("/app/admin?reportRetried=1");
}
```

- [ ] **Step 5: Run retry tests**

Run: `npm run test -- tests/admin/report-retry.test.ts`

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add lib/admin/report-retry.ts actions/admin.ts tests/admin/report-retry.test.ts
git commit -m "[SPEC-004] Add audited failed report retry"
```

---

### Task 4: Admin Console UI

**Files:**
- Modify: `app/(admin)/app/admin/page.tsx`
- Modify: `actions/admin-credits.ts` only if removing obsolete imports creates dead code cleanup; otherwise leave it untouched.

- [ ] **Step 1: Replace imports**

Use these imports at the top of `app/(admin)/app/admin/page.tsx`:

```ts
import { adjustWorkspaceCredits, retryFailedReport } from "@/actions/admin";
import { AppShell } from "@/components/app-shell/app-shell";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminOverview, summarizeUserUsage } from "@/lib/admin/overview";
```

- [ ] **Step 2: Fetch admin data**

Use this page signature and data load:

```ts
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; adjusted?: string; reportRetried?: string; error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const overview = await getAdminOverview(params.q ?? null);
```

- [ ] **Step 3: Render top-level status messages and user search**

Add a search form that submits with `GET` and input name `q`. Show success/error banners for `adjusted`, `reportRetried`, and `error`.

- [ ] **Step 4: Render user lookup cards**

For each `overview.users`, show:

```tsx
const usage = summarizeUserUsage(
  user.aiGenerations.map((row) => ({
    provider: row.provider,
    model: row.model,
    status: row.status,
    costUsd: row.costUsd?.toString() ?? null,
    creditsCharged: row.creditsCharged,
  })),
);
```

Display email, role, created date, workspace name, plan, subscription status, credit balance, recent ledger rows, generation count, failed generation count, credits charged, and estimated AI cost.

- [ ] **Step 5: Render credit adjustment**

Keep the existing credit adjustment form, but source workspace options from `overview.users.flatMap((user) => user.ownedWorkspaces)`. Preserve required `workspaceId`, signed integer `amount`, and required `reason`.

- [ ] **Step 6: Render failed jobs**

Show a compact table from `overview.failedJobs` with job type, provider, attempts/max attempts, reference, error, and updated time.

- [ ] **Step 7: Render failed reports with retry buttons**

For each `overview.failedReports`, render:

```tsx
<form action={retryFailedReport}>
  <input name="reportId" type="hidden" value={report.id} />
  <button className="rounded-[var(--yt-radius-button)] border border-[var(--yt-primary)] px-3 py-2 text-sm font-bold text-[var(--yt-primary)]" type="submit">
    Retry
  </button>
</form>
```

- [ ] **Step 8: Render AI generation logs and provider failures**

Show recent AI generation rows with task type, provider/model, status, credits, cost, error, and created date. Show provider failure summary from `overview.providerFailures`.

- [ ] **Step 9: Render audit logs**

Show recent `AdminAuditLog` rows with actor email, action, target, reason, and timestamp.

- [ ] **Step 10: Run typecheck**

Run: `npm run typecheck`

Expected: pass.

- [ ] **Step 11: Commit**

```powershell
git add "app/(admin)/app/admin/page.tsx"
git commit -m "[SPEC-004] Build admin foundation console"
```

---

### Task 5: Verification and Tracker Update

**Files:**
- Modify: `context/current-feature.md`

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm run test -- tests/admin/auth.test.ts tests/admin/overview.test.ts tests/admin/report-retry.test.ts
```

Expected: all admin tests pass.

- [ ] **Step 2: Run full test suite**

Run: `npm run test`

Expected: all tests pass.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: no TypeScript errors.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: Next.js production build succeeds and `/app/admin` appears as a dynamic route.

- [ ] **Step 5: Smoke-check admin route**

With the dev server running on port `3001`, check:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/app/admin -MaximumRedirection 0
```

Expected for an unauthenticated request: redirect to sign-in.

Then sign in as an admin account and verify:

- User lookup finds `ginkomedia@gmail.com`.
- Subscription and credit status are visible.
- Credit adjustment requires a reason and writes a ledger row plus audit row.
- Recent failed jobs section renders, including empty state if none exist.
- Failed report retry creates a queued `JobRun` and an audit row.
- AI usage logs and provider failure summary render, including empty states if no rows exist.

- [ ] **Step 6: Update current feature tracker**

Update `context/current-feature.md`:

```md
- **Workflow State:** In Progress
- **Implementation Status:** Admin foundation implemented and verified
```

Add implementation notes listing the files changed and verification commands run.

- [ ] **Step 7: Commit tracker update**

```powershell
git add context/current-feature.md
git commit -m "[SPEC-004] Update admin foundation tracker"
```

---

## Spec Coverage Self-Review

- Admin-only route protection: Task 1 and Task 4 use `requireAdmin()` based on app `User.role`.
- User lookup: Task 2 and Task 4 implement searchable user read models.
- Subscription status: Task 2 includes latest workspace subscription; Task 4 renders it.
- Credit adjustment: Task 3 reuses `applyAdminCreditAdjustment`; Task 4 renders the form; audit log is written.
- Job overview: Task 2 fetches failed `JobRun` rows; Task 4 renders them.
- AI generation logs: Task 2 fetches recent `AiGeneration` rows; Task 4 renders them.
- Provider failure summary: Task 2 summarizes failed generations by provider/model; Task 4 renders it.
- Admin role not user-editable metadata: Task 1 reads `User.role` from Prisma after Supabase session verification.
- Admin actions audited: Task 3 writes `AdminAuditLog` for credit adjustment and report retry.
- Admin can retry failed report jobs: Task 3 resets failed reports and queues a `JobRun`.
- Admin can inspect usage by user: Task 2/4 summarize AI cost, credits, and generation counts per user.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-17-admin-foundation.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
