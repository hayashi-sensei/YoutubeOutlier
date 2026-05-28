import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { CREDIT_PACKS, PLAN_DEFINITIONS } from "@/lib/billing/plans";
import { getPrismaClient } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";

const paidPlans = [PLAN_DEFINITIONS.STARTER, PLAN_DEFINITIONS.PRO, PLAN_DEFINITIONS.PREMIUM];

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();
  const bootstrap = supabaseUser ? await bootstrapUserWorkspace(supabaseUser) : null;
  const prisma = getPrismaClient();
  const [workspace, account] = bootstrap
    ? await Promise.all([
        prisma.workspace.findUnique({
        where: { id: bootstrap.workspaceId },
        select: {
          id: true,
          name: true,
          planCode: true,
          subscriptions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              status: true,
              currentPeriodEnd: true,
              cancelAtPeriodEnd: true,
            },
          },
        },
        }),
        prisma.user.findUnique({
          where: { id: bootstrap.user.id },
          select: {
            creditBalance: true,
            creditTransactions: {
              orderBy: { createdAt: "desc" },
              take: 8,
              select: {
                id: true,
                type: true,
                amount: true,
                balanceAfter: true,
                description: true,
                createdAt: true,
                workspace: { select: { name: true } },
              },
            },
          },
        }),
      ])
    : [null, null];

  return (
    <main className="p-5 lg:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="mt-1 text-sm text-[var(--yt-text-muted)]">Credit balance, plan allowances, and ledger activity.</p>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4">
          <p className="text-sm font-bold text-[var(--yt-text-muted)]">Current Plan</p>
          <p className="mt-2 text-3xl font-extrabold">{workspace?.planCode ?? "FREE"}</p>
          <p className="mt-2 text-sm text-[var(--yt-text-muted)]">Admin-managed until checkout is connected.</p>
        </div>
        <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4">
          <p className="text-sm font-bold text-[var(--yt-text-muted)]">Credits</p>
          <p className="mt-2 text-3xl font-extrabold">{account?.creditBalance ?? 0}</p>
          <p className="mt-2 text-sm text-[var(--yt-text-muted)]">Shared across every workspace on this account.</p>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold">Plans</h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          {paidPlans.map((plan) => (
            <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4" key={plan.code}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-extrabold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-[var(--yt-text-muted)]">{plan.monthlyCredits} credits monthly</p>
                </div>
                <p className="text-xl font-extrabold">${plan.monthlyPriceUsd}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 className="text-lg font-bold">Extra Credits</h2>
          <div className="mt-3 space-y-3">
            {Object.values(CREDIT_PACKS).map((pack) => (
              <div className="flex items-center justify-between gap-3 rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4" key={pack.code}>
                <div>
                  <p className="font-bold">{pack.name}</p>
                  <p className="text-sm text-[var(--yt-text-muted)]">${pack.priceUsd}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-lg font-bold">Credit Ledger</h2>
          <div className="mt-3 overflow-hidden rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white">
            {(account?.creditTransactions.length ?? 0) === 0 ? (
              <p className="p-4 text-sm text-[var(--yt-text-muted)]">No credit activity yet.</p>
            ) : (
              <div className="divide-y divide-[var(--yt-border)]">
                {account?.creditTransactions.map((transaction) => (
                  <div className="grid gap-2 p-4 text-sm md:grid-cols-[1fr_auto_auto]" key={transaction.id}>
                    <div>
                      <p className="font-bold">{transaction.type.replaceAll("_", " ")}</p>
                      <p className="text-[var(--yt-text-muted)]">
                        {transaction.description ?? transaction.createdAt.toLocaleString()} · {transaction.workspace?.name ?? "Deleted workspace"}
                      </p>
                    </div>
                    <p className={transaction.amount >= 0 ? "font-bold text-[var(--yt-success)]" : "font-bold text-[var(--yt-danger)]"}>
                      {transaction.amount > 0 ? "+" : ""}
                      {transaction.amount}
                    </p>
                    <p className="font-semibold text-[var(--yt-text-muted)]">Balance {transaction.balanceAfter}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
