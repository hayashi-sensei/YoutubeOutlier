import { describe, expect, test } from "vitest";
import {
  CreditBalanceError,
  applyAdminCreditAdjustment,
  deductCreditsForTask,
  refillMonthlyCredits,
} from "../../lib/billing/credits";

type Workspace = {
  id: string;
  ownerId: string;
  planCode: "FREE" | "STARTER" | "PRO" | "PREMIUM";
};

type Account = {
  id: string;
  creditBalance: number;
};

function createCreditStore(workspace: Workspace, account: Account) {
  const ledger: unknown[] = [];
  const tx = {
    user: {
      findUnique: async () => ({ ...account }),
      updateMany: async ({ where, data }: { where: { id?: string; creditBalance?: { gte?: number } }; data: { creditBalance: { decrement?: number; increment?: number } } }) => {
        const minimum = where.creditBalance?.gte;
        if (where.id !== account.id || (typeof minimum === "number" && account.creditBalance < minimum)) {
          return { count: 0 };
        }

        account.creditBalance += data.creditBalance.increment ?? 0;
        account.creditBalance -= data.creditBalance.decrement ?? 0;
        return { count: 1 };
      },
      update: async ({ data }: { where: { id: string }; data: { creditBalance?: number } }) => {
        if (typeof data.creditBalance === "number") {
          account.creditBalance = data.creditBalance;
        }

        return { ...account };
      },
    },
    workspace: {
      findUnique: async () => ({ ...workspace, owner: { id: workspace.ownerId, role: "USER" as const } }),
      updateMany: async () => ({ count: 1 }),
      update: async () => ({ ...workspace }),
    },
    creditTransaction: {
      create: async ({ data }: { data: unknown }) => {
        ledger.push(data);
        return data;
      },
    },
    planLimit: {
      findMany: async () => [],
    },
  };

  return { tx, workspace, account, ledger };
}

describe("credit ledger helpers", () => {
  test("deducts credits atomically and writes usage ledger entry", async () => {
    const store = createCreditStore({ id: "workspace_1", ownerId: "user_1", planCode: "PRO" }, { id: "user_1", creditBalance: 12 });

    const result = await deductCreditsForTask(store.tx, {
      workspaceId: "workspace_1",
      userId: "user_1",
      taskType: "GENERATE_OUTLINE",
      credits: 2,
      referenceType: "AiGeneration",
      referenceId: "generation_1",
    });

    expect(result.balanceAfter).toBe(10);
    expect(store.account.creditBalance).toBe(10);
    expect(store.ledger).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        userId: "user_1",
        type: "USAGE",
        amount: -2,
        balanceAfter: 10,
        referenceType: "AiGeneration",
        referenceId: "generation_1",
      }),
    );
  });

  test("rejects usage when the account balance is too low", async () => {
    const store = createCreditStore({ id: "workspace_1", ownerId: "user_1", planCode: "STARTER" }, { id: "user_1", creditBalance: 1 });

    await expect(
      deductCreditsForTask(store.tx, {
        workspaceId: "workspace_1",
        userId: "user_1",
        taskType: "GENERATE_OUTLINE",
        credits: 2,
      }),
    ).rejects.toBeInstanceOf(CreditBalanceError);

    expect(store.account.creditBalance).toBe(1);
    expect(store.ledger).toHaveLength(0);
  });

  test("refills monthly credits to the plan allowance without rollover", async () => {
    const store = createCreditStore({ id: "workspace_1", ownerId: "user_1", planCode: "PRO" }, { id: "user_1", creditBalance: 25 });

    const result = await refillMonthlyCredits(store.tx, {
      workspaceId: "workspace_1",
      userId: "user_1",
      planCode: "PRO",
    });

    expect(result.balanceAfter).toBe(250);
    expect(store.account.creditBalance).toBe(250);
    expect(store.ledger).toContainEqual(
      expect.objectContaining({
        type: "MONTHLY_REFILL",
        amount: 225,
        balanceAfter: 250,
      }),
    );
  });

  test("records expired credits separately when monthly refill removes rollover balance", async () => {
    const store = createCreditStore({ id: "workspace_1", ownerId: "user_1", planCode: "PRO" }, { id: "user_1", creditBalance: 300 });

    const result = await refillMonthlyCredits(store.tx, {
      workspaceId: "workspace_1",
      userId: "user_1",
      planCode: "PRO",
    });

    expect(result.balanceAfter).toBe(250);
    expect(store.account.creditBalance).toBe(250);
    expect(store.ledger).toContainEqual(
      expect.objectContaining({
        type: "EXPIRATION",
        amount: -50,
        balanceAfter: 250,
      }),
    );
    expect(store.ledger).toContainEqual(
      expect.objectContaining({
        type: "MONTHLY_REFILL",
        amount: 0,
        balanceAfter: 250,
      }),
    );
  });

  test("records admin credit adjustments with signed amounts", async () => {
    const store = createCreditStore({ id: "workspace_1", ownerId: "user_1", planCode: "STARTER" }, { id: "user_1", creditBalance: 25 });

    const result = await applyAdminCreditAdjustment(store.tx, {
      workspaceId: "workspace_1",
      actorUserId: "admin_1",
      amount: -5,
      reason: "Test correction",
    });

    expect(result.balanceAfter).toBe(20);
    expect(store.account.creditBalance).toBe(20);
    expect(store.ledger).toContainEqual(
      expect.objectContaining({
        type: "ADMIN_ADJUSTMENT",
        amount: -5,
        balanceAfter: 20,
        description: "Test correction",
      }),
    );
  });
});
