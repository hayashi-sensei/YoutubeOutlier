import type { CreditTransactionType, PlanCode } from "@/generated/prisma/client";
import { getWorkspacePlanEntitlement, type WorkspaceEntitlementClient } from "@/lib/billing/plan-limits";
import { PLAN_DEFINITIONS } from "@/lib/billing/plans";

type AccountCreditUpdateManyArgs = {
  where: {
    id?: string;
    creditBalance?: {
      gte?: number;
    };
  };
  data: {
    creditBalance: {
      decrement?: number;
      increment?: number;
    };
  };
};

type CreditWorkspace = {
  id: string;
  ownerId: string;
  planCode?: PlanCode;
  owner?: { id?: string; role: "USER" | "ADMIN" };
};

type CreditAccount = {
  id: string;
  creditBalance: number;
};

type CreditTransactionInput = {
  workspaceId: string;
  userId?: string | null;
  type: CreditTransactionType;
  amount: number;
  balanceAfter: number;
  description?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
};

export type CreditTransactionClient = WorkspaceEntitlementClient & {
  user: {
    findUnique(args: { where: { id: string }; select?: Record<string, boolean> }): Promise<CreditAccount | null>;
    updateMany(args: AccountCreditUpdateManyArgs): Promise<{ count: number }>;
    update(args: {
      where: { id: string };
      data: { creditBalance?: number };
      select?: Record<string, boolean>;
    }): Promise<CreditAccount>;
  };
  workspace: {
    findUnique(args: unknown): Promise<CreditWorkspace | null>;
  } & WorkspaceEntitlementClient["workspace"];
  creditTransaction: {
    create(args: { data: CreditTransactionInput }): Promise<unknown>;
  };
};

export class CreditBalanceError extends Error {
  constructor(message = "Insufficient credits for this task.") {
    super(message);
    this.name = "CreditBalanceError";
  }
}

export class CreditInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditInputError";
  }
}

function assertPositiveAmount(amount: number, label: string) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new CreditInputError(`${label} must be a positive integer.`);
  }
}

async function getWorkspaceAccount(tx: CreditTransactionClient, workspaceId: string) {
  const workspace = await tx.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerId: true, planCode: true, owner: { select: { id: true, role: true } } },
  });

  if (!workspace) {
    throw new CreditInputError("Workspace was not found.");
  }

  const accountId = workspace.owner?.id ?? workspace.ownerId;
  const account = await tx.user.findUnique({
    where: { id: accountId },
    select: { id: true, creditBalance: true },
  });

  if (!account) {
    throw new CreditInputError("Workspace owner account was not found.");
  }

  return { workspace, account };
}

async function writeLedgerEntry(tx: CreditTransactionClient, input: CreditTransactionInput) {
  await tx.creditTransaction.create({ data: input });
  return {
    balanceAfter: input.balanceAfter,
  };
}

export async function deductCreditsForTask(
  tx: CreditTransactionClient,
  input: {
    workspaceId: string;
    userId?: string | null;
    taskType: string;
    credits: number;
    referenceType?: string | null;
    referenceId?: string | null;
  },
) {
  assertPositiveAmount(input.credits, "Credits");

  const { account } = await getWorkspaceAccount(tx, input.workspaceId);
  const updateResult = await tx.user.updateMany({
    where: {
      id: account.id,
      creditBalance: {
        gte: input.credits,
      },
    },
    data: {
      creditBalance: {
        decrement: input.credits,
      },
    },
  });

  if (updateResult.count !== 1) {
    throw new CreditBalanceError();
  }

  const updatedAccount = await tx.user.findUnique({
    where: { id: account.id },
    select: { id: true, creditBalance: true },
  });

  return writeLedgerEntry(tx, {
    workspaceId: input.workspaceId,
    userId: updatedAccount?.id ?? account.id,
    type: "USAGE",
    amount: -input.credits,
    balanceAfter: updatedAccount?.creditBalance ?? account.creditBalance - input.credits,
    description: input.taskType,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
  });
}

export async function refundCreditsForTask(
  tx: CreditTransactionClient,
  input: {
    workspaceId: string;
    userId?: string | null;
    taskType: string;
    credits: number;
    referenceType?: string | null;
    referenceId?: string | null;
  },
) {
  assertPositiveAmount(input.credits, "Refund credits");

  const { account } = await getWorkspaceAccount(tx, input.workspaceId);
  await tx.user.updateMany({
    where: { id: account.id },
    data: {
      creditBalance: {
        increment: input.credits,
      },
    },
  });

  const updatedAccount = await tx.user.findUnique({
    where: { id: account.id },
    select: { id: true, creditBalance: true },
  });

  return writeLedgerEntry(tx, {
    workspaceId: input.workspaceId,
    userId: updatedAccount?.id ?? account.id,
    type: "REFUND",
    amount: input.credits,
    balanceAfter: updatedAccount?.creditBalance ?? account.creditBalance + input.credits,
    description: `${input.taskType} failed credit refund`,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
  });
}

export async function refillMonthlyCredits(
  tx: CreditTransactionClient,
  input: {
    workspaceId: string;
    userId?: string | null;
    planCode: PlanCode;
    referenceType?: string | null;
    referenceId?: string | null;
  },
) {
  const planEntitlement = await getWorkspacePlanEntitlement(tx, input.workspaceId);
  const entitlement = planEntitlement?.monthlyCredits ?? PLAN_DEFINITIONS[input.planCode].monthlyCredits;
  const { account } = await getWorkspaceAccount(tx, input.workspaceId);
  const expiredCredits = Math.max(account.creditBalance - entitlement, 0);
  const refillAmount = Math.max(entitlement - account.creditBalance, 0);

  await tx.user.update({
    where: { id: account.id },
    data: { creditBalance: entitlement },
    select: { id: true, creditBalance: true },
  });

  if (expiredCredits > 0) {
    await writeLedgerEntry(tx, {
      workspaceId: input.workspaceId,
      userId: account.id,
      type: "EXPIRATION",
      amount: -expiredCredits,
      balanceAfter: entitlement,
      description: "Monthly credit rollover expiration",
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
    });
  }

  return writeLedgerEntry(tx, {
    workspaceId: input.workspaceId,
    userId: account.id,
    type: "MONTHLY_REFILL",
    amount: refillAmount,
    balanceAfter: entitlement,
    description: `${PLAN_DEFINITIONS[input.planCode].name} monthly credit refill`,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
  });
}

export async function addPurchasedCredits(
  tx: CreditTransactionClient,
  input: {
    workspaceId: string;
    userId?: string | null;
    credits: number;
    referenceType?: string | null;
    referenceId?: string | null;
  },
) {
  assertPositiveAmount(input.credits, "Purchased credits");

  const { account } = await getWorkspaceAccount(tx, input.workspaceId);
  await tx.user.updateMany({
    where: { id: account.id },
    data: {
      creditBalance: {
        increment: input.credits,
      },
    },
  });

  const updatedAccount = await tx.user.findUnique({
    where: { id: account.id },
    select: { id: true, creditBalance: true },
  });

  return writeLedgerEntry(tx, {
    workspaceId: input.workspaceId,
    userId: updatedAccount?.id ?? account.id,
    type: "PURCHASE",
    amount: input.credits,
    balanceAfter: updatedAccount?.creditBalance ?? account.creditBalance + input.credits,
    description: "Extra credit pack purchase",
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
  });
}

export async function applyAdminCreditAdjustment(
  tx: CreditTransactionClient,
  input: {
    workspaceId: string;
    actorUserId?: string | null;
    amount: number;
    reason: string;
  },
) {
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw new CreditInputError("Admin adjustment amount must be a non-zero integer.");
  }

  const { account } = await getWorkspaceAccount(tx, input.workspaceId);

  if (input.amount > 0) {
    await tx.user.updateMany({
      where: { id: account.id },
      data: {
        creditBalance: {
          increment: input.amount,
        },
      },
    });
  } else {
    const decrement = Math.abs(input.amount);
    const updateResult = await tx.user.updateMany({
      where: {
        id: account.id,
        creditBalance: {
          gte: decrement,
        },
      },
      data: {
        creditBalance: {
          decrement,
        },
      },
    });

    if (updateResult.count !== 1) {
      throw new CreditBalanceError("Admin adjustment cannot reduce credits below zero.");
    }
  }

  const updatedAccount = await tx.user.findUnique({
    where: { id: account.id },
    select: { id: true, creditBalance: true },
  });

  return writeLedgerEntry(tx, {
    workspaceId: input.workspaceId,
    userId: updatedAccount?.id ?? account.id,
    type: "ADMIN_ADJUSTMENT",
    amount: input.amount,
    balanceAfter: updatedAccount?.creditBalance ?? account.creditBalance + input.amount,
    description: input.reason,
    referenceType: "AdminAuditLog",
    referenceId: null,
  });
}
