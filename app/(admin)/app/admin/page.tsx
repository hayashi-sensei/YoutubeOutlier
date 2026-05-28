import { adjustWorkspaceCredits, pingAiProviderAction, retryFailedJobRun, retryFailedReport, updateAiTaskRoute, updatePlanLimits } from "@/actions/admin";
import { AppShell } from "@/components/app-shell/app-shell";
import { AI_PROVIDER_CATALOG } from "@/lib/admin/ai-provider-health";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminOverview, summarizeUserUsage } from "@/lib/admin/overview";
import { AI_PROVIDER_MODEL_PRESETS, isProviderAllowedForTask } from "@/lib/ai/task-config";

function formatDate(value: Date | null | undefined): string {
  return value ? value.toLocaleString() : "Not set";
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatTokenCount(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "n/a";
}

function statusClass(status: string): string {
  if (status.includes("FAILED") || status.includes("PAST_DUE") || status.includes("CANCELED") || status.includes("MISSING")) {
    return "bg-[var(--yt-danger-soft)] text-[var(--yt-danger)]";
  }

  if (status.includes("ACTIVE") || status.includes("SUCCEEDED") || status.includes("COMPLETED") || status.includes("CONFIGURED") || status.includes("CONNECTED") || status.includes("SENT")) {
    return "bg-[var(--yt-success-soft)] text-[var(--yt-success)]";
  }

  if (status.includes("SKIPPED")) {
    return "bg-[var(--yt-surface-soft)] text-[var(--yt-text-secondary)]";
  }

  return "bg-[var(--yt-warning-soft)] text-[var(--yt-warning)]";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    adjusted?: string;
    reportRetried?: string;
    jobRetried?: string;
    planLimitsUpdated?: string;
    providerPinged?: string;
    providerPingStatus?: string;
    providerPingMessage?: string;
    aiTaskRouteUpdated?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const overview = await getAdminOverview(params.q ?? null);
  const workspaceOptions = Array.from(
    new Map(
      overview.users
        .flatMap((user) =>
          user.ownedWorkspaces.map((workspace) => ({
            ...workspace,
            ownerEmail: user.email,
          })),
        )
        .map((workspace) => [workspace.id, workspace]),
    ).values(),
  );

  return (
    <AppShell>
      <main className="space-y-6 p-5 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Admin</h1>
            <p className="mt-1 text-sm text-[var(--yt-text-muted)]">
              User lookup, credits, subscriptions, failed jobs, AI usage, and audited operations.
            </p>
          </div>
          <form action="/app/admin" className="flex w-full max-w-xl gap-2" method="get">
            <label className="sr-only" htmlFor="admin-search">
              Search users
            </label>
            <input
              className="min-h-10 flex-1 rounded-[var(--yt-radius-input)] border border-[var(--yt-border)] bg-white px-3 text-sm"
              defaultValue={params.q ?? ""}
              id="admin-search"
              name="q"
              placeholder="Search by email or name"
              type="search"
            />
            <button className="rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-4 py-2 text-sm font-bold text-white" type="submit">
              Search
            </button>
          </form>
        </div>

        {params.adjusted ? (
          <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-success-soft)] p-3 text-sm font-bold text-[var(--yt-success)]">
            Credit adjustment applied and audited.
          </div>
        ) : null}
        {params.reportRetried ? (
          <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-primary-soft)] p-3 text-sm font-bold text-[var(--yt-primary)]">
            Failed report queued for retry.
          </div>
        ) : null}
        {params.jobRetried ? (
          <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-primary-soft)] p-3 text-sm font-bold text-[var(--yt-primary)]">
            Failed job queued for retry.
          </div>
        ) : null}
        {params.planLimitsUpdated ? (
          <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-primary-soft)] p-3 text-sm font-bold text-[var(--yt-primary)]">
            Plan limits updated and audited.
          </div>
        ) : null}
        {params.providerPinged ? (
          <div
            className={`rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] p-3 text-sm font-bold ${
              params.providerPingStatus === "success"
                ? "bg-[var(--yt-success-soft)] text-[var(--yt-success)]"
                : "bg-[var(--yt-danger-soft)] text-[var(--yt-danger)]"
            }`}
          >
            Provider ping {params.providerPingStatus === "success" ? "passed" : "failed"} for {params.providerPinged}:{" "}
            {params.providerPingMessage ?? "No details returned."}
          </div>
        ) : null}
        {params.aiTaskRouteUpdated ? (
          <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-primary-soft)] p-3 text-sm font-bold text-[var(--yt-primary)]">
            AI task route updated and audited.
          </div>
        ) : null}
        {params.error ? (
          <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-danger-soft)] p-3 text-sm font-bold text-[var(--yt-danger)]">
            Admin action failed: {params.error.replaceAll("_", " ")}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]">
            <p className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">Users</p>
            <p className="mt-2 text-3xl font-extrabold">{overview.users.length}</p>
          </div>
          <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]">
            <p className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">Failed Jobs</p>
            <p className="mt-2 text-3xl font-extrabold">{overview.failedJobs.length}</p>
            <p className="mt-1 text-xs text-[var(--yt-text-muted)]">
              {overview.queueHealth.queued} queued · {overview.queueHealth.retrying} retrying
            </p>
          </div>
          <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]">
            <p className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">Failed Reports</p>
            <p className="mt-2 text-3xl font-extrabold">{overview.failedReports.length}</p>
          </div>
          <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]">
            <p className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">AI Logs</p>
            <p className="mt-2 text-3xl font-extrabold">{overview.recentAiGenerations.length}</p>
          </div>
        </section>

        <nav className="flex flex-wrap gap-2 border-b border-[var(--yt-border)] pb-3 text-sm font-bold" aria-label="Admin sections">
          <a className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-3 py-2" href="#users">Users</a>
          <a className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-3 py-2" href="#providers">Providers</a>
          <a className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-3 py-2" href="#task-routes">Task Routes</a>
          <a className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-3 py-2" href="#plan-limits">Plan Limits</a>
          <a className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-3 py-2" href="#jobs">Jobs</a>
          <a className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-3 py-2" href="#email">Email</a>
          <a className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-3 py-2" href="#usage">AI Usage</a>
        </nav>

        <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]" id="providers">
          <div className="border-b border-[var(--yt-border)] p-4">
            <h2 className="text-lg font-bold">AI Providers</h2>
            <p className="mt-1 text-sm text-[var(--yt-text-muted)]">
              Check configured API keys, recent failures, and run a low-cost provider ping from the admin console.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#1F2937] text-white">
                <tr>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Capabilities</th>
                  <th className="px-3 py-2">Env Key</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Recent Use</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--yt-border)]">
                {overview.aiProviders.map((provider) => (
                  <tr key={provider.id}>
                    <td className="px-3 py-3">
                      <p className="font-bold">{provider.label}</p>
                      <p className="text-xs text-[var(--yt-text-muted)]">{provider.pingModel ?? "Image-only configuration check"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {provider.capabilities.map((capability) => (
                          <span className="rounded-[var(--yt-radius-pill)] bg-[var(--yt-surface-muted)] px-2 py-1 text-xs font-bold" key={capability}>
                            {capability}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{provider.envKey}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-[var(--yt-radius-pill)] px-2 py-1 text-xs font-bold ${statusClass(provider.status)}`}>
                        {provider.status.replaceAll("_", " ")}
                      </span>
                      {provider.lastPing ? (
                        <p className="mt-1 text-xs text-[var(--yt-text-muted)]">Pinged {formatDate(provider.lastPing.checkedAt)}</p>
                      ) : null}
                      {provider.recentFailures > 0 ? (
                        <p className="mt-1 text-xs font-bold text-[var(--yt-danger)]">{provider.recentFailures} recent failures</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      {provider.lastGeneration ? (
                        <div>
                          <p className="font-bold">{provider.lastGeneration.status}</p>
                          <p className="text-xs text-[var(--yt-text-muted)]">
                            {provider.lastGeneration.model} · {formatDate(provider.lastGeneration.createdAt)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--yt-text-muted)]">No recent logs</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <form action={pingAiProviderAction}>
                        <input name="provider" type="hidden" value={provider.id} />
                        <button
                          className="rounded-[var(--yt-radius-button)] border border-[var(--yt-primary)] px-3 py-2 text-sm font-bold text-[var(--yt-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!provider.configured}
                          type="submit"
                        >
                          Ping
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="ai-model-options">
              {Object.entries(AI_PROVIDER_MODEL_PRESETS).flatMap(([provider, models]) =>
                models.map((model) => <option key={`${provider}-${model}`} value={model} />),
              )}
            </datalist>
          </div>
        </section>

        <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]" id="task-routes">
          <div className="border-b border-[var(--yt-border)] p-4">
            <h2 className="text-lg font-bold">AI Task Routes</h2>
            <p className="mt-1 text-sm text-[var(--yt-text-muted)]">
              The current router matrix for each task and quality tier. Report trend analysis uses the report trend analysis standard route.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#1F2937] text-white">
                <tr>
                  <th className="px-3 py-2">Task</th>
                  <th className="px-3 py-2">Tier</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">Credits</th>
                  <th className="px-3 py-2">Est. Cost</th>
                  <th className="px-3 py-2">Max Output</th>
                  <th className="px-3 py-2">Temperature</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--yt-border)]">
                {overview.aiTaskRoutes.map((route) => (
                  <tr key={`${route.taskType}-${route.qualityTier}`} className={route.isOverride ? "bg-[var(--yt-primary-soft)]/40" : undefined}>
                    <td className="px-3 py-3">
                      <form action={updateAiTaskRoute} id={`route-${route.taskType}-${route.qualityTier}`}>
                        <input name="taskType" type="hidden" value={route.taskType} />
                        <input name="qualityTier" type="hidden" value={route.qualityTier} />
                      </form>
                      <p className="font-bold">{route.taskType.replaceAll("_", " ")}</p>
                      {route.taskType === "topic_recommendation" && route.qualityTier === "standard" ? (
                        <p className="text-xs font-bold text-[var(--yt-primary)]">Used by topic recommendations</p>
                      ) : null}
                      {route.taskType === "report_trend_analysis" && route.qualityTier === "standard" ? (
                        <p className="text-xs font-bold text-[var(--yt-primary)]">Used by report competitor trends</p>
                      ) : null}
                      {route.isOverride ? <p className="text-xs text-[var(--yt-text-muted)]">Override saved {formatDate(route.updatedAt)}</p> : null}
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-[var(--yt-radius-pill)] bg-[var(--yt-surface-muted)] px-2 py-1 text-xs font-bold">
                        {route.qualityTier}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        className="w-full min-w-32 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-3 py-2 text-sm font-bold"
                        defaultValue={route.provider}
                        form={`route-${route.taskType}-${route.qualityTier}`}
                        name="provider"
                        required
                      >
                        {AI_PROVIDER_CATALOG.filter((provider) => isProviderAllowedForTask(route.taskType, provider.id)).map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        className="w-full min-w-48 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2 font-mono text-xs"
                        defaultValue={route.model}
                        form={`route-${route.taskType}-${route.qualityTier}`}
                        list="ai-model-options"
                        name="model"
                        required
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        className="w-24 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2 text-sm font-bold"
                        defaultValue={route.credits}
                        form={`route-${route.taskType}-${route.qualityTier}`}
                        min={0}
                        name="credits"
                        required
                        type="number"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        className="w-28 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2 text-sm"
                        defaultValue={route.estimatedCostUsd.toFixed(4)}
                        form={`route-${route.taskType}-${route.qualityTier}`}
                        min={0}
                        name="estimatedCostUsd"
                        required
                        step="0.0001"
                        type="number"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        className="w-28 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2 text-sm"
                        defaultValue={route.maxOutputTokens}
                        form={`route-${route.taskType}-${route.qualityTier}`}
                        min={16}
                        name="maxOutputTokens"
                        required
                        type="number"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          className="w-20 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2 text-sm"
                          defaultValue={route.temperature}
                          form={`route-${route.taskType}-${route.qualityTier}`}
                          max={2}
                          min={0}
                          name="temperature"
                          required
                          step="0.01"
                          type="number"
                        />
                        <button
                          className="rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-3 py-2 text-sm font-bold text-white"
                          form={`route-${route.taskType}-${route.qualityTier}`}
                          type="submit"
                        >
                          Save
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]" id="users">
          <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
            <div className="border-b border-[var(--yt-border)] p-4">
              <h2 className="text-lg font-bold">User Lookup</h2>
              <p className="mt-1 text-sm text-[var(--yt-text-muted)]">Inspect user workspace, subscription, credit, and AI usage state.</p>
            </div>
            <div className="divide-y divide-[var(--yt-border)]">
              {overview.users.length === 0 ? (
                <p className="p-4 text-sm text-[var(--yt-text-muted)]">No users found.</p>
              ) : (
                overview.users.map((user) => {
                  const usage = summarizeUserUsage(
                    user.aiGenerations.map((row) => ({
                      provider: row.provider,
                      model: row.model,
                      status: row.status,
                      costUsd: row.costUsd?.toString() ?? null,
                      creditsCharged: row.creditsCharged,
                    })),
                  );

                  return (
                    <article className="space-y-4 p-4" key={user.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold">{user.email}</h3>
                          <p className="text-sm text-[var(--yt-text-muted)]">{user.name ?? "No profile name"} · Joined {formatDate(user.createdAt)}</p>
                        </div>
                        <span className={`rounded-[var(--yt-radius-pill)] px-3 py-1 text-xs font-extrabold ${statusClass(user.role)}`}>{user.role}</span>
                      </div>

                      <div className="grid gap-3 md:grid-cols-5">
                        <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3">
                          <p className="text-xs font-bold text-[var(--yt-text-muted)]">Generations</p>
                          <p className="mt-1 text-xl font-extrabold">{usage.generations}</p>
                        </div>
                        <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3">
                          <p className="text-xs font-bold text-[var(--yt-text-muted)]">Failed</p>
                          <p className="mt-1 text-xl font-extrabold">{usage.failedGenerations}</p>
                        </div>
                        <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3">
                          <p className="text-xs font-bold text-[var(--yt-text-muted)]">Credits Used</p>
                          <p className="mt-1 text-xl font-extrabold">{usage.creditsCharged}</p>
                        </div>
                        <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3">
                          <p className="text-xs font-bold text-[var(--yt-text-muted)]">AI Cost</p>
                          <p className="mt-1 text-xl font-extrabold">{formatCurrency(usage.costUsd)}</p>
                        </div>
                        <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3">
                          <p className="text-xs font-bold text-[var(--yt-text-muted)]">Account Credits</p>
                          <p className="mt-1 text-xl font-extrabold">{user.creditBalance}</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {user.ownedWorkspaces.map((workspace) => {
                          const subscription = workspace.subscriptions[0];

                          return (
                            <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3" key={workspace.id}>
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-bold">{workspace.name}</p>
                                  <p className="text-sm text-[var(--yt-text-muted)]">Workspace {workspace.id}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm text-[var(--yt-text-muted)]">Plan {workspace.planCode}</p>
                                </div>
                              </div>
                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">Subscription</p>
                                  <p className="mt-1 text-sm font-bold">
                                    {subscription ? `${subscription.planCode} · ${subscription.status}` : "No subscription record"}
                                  </p>
                                  <p className="text-xs text-[var(--yt-text-muted)]">Period ends {formatDate(subscription?.currentPeriodEnd)}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">Account Credit Ledger</p>
                                  {user.creditTransactions.length === 0 ? (
                                    <p className="mt-1 text-sm text-[var(--yt-text-muted)]">No recent account credit activity.</p>
                                  ) : (
                                    <div className="mt-1 space-y-1">
                                      {user.creditTransactions.map((transaction) => (
                                        <p className="text-sm" key={transaction.id}>
                                          <span className="font-bold">{transaction.amount > 0 ? "+" : ""}{transaction.amount}</span>{" "}
                                          <span className="text-[var(--yt-text-muted)]">
                                            {transaction.type.replaceAll("_", " ")} · Balance {transaction.balanceAfter} · {transaction.workspace?.name ?? "Deleted workspace"}
                                          </span>
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>

          <aside className="space-y-5">
            <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]">
              <h2 className="text-lg font-bold">Account Credit Adjustment</h2>
              <form action={adjustWorkspaceCredits} className="mt-4 space-y-4">
                <label className="block text-sm font-bold">
                  Workspace context
                  <select className="mt-1 w-full rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2" name="workspaceId" required>
                    {workspaceOptions.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name} - {workspace.ownerEmail}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-bold">
                  Amount
                  <input
                    className="mt-1 w-full rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2"
                    name="amount"
                    placeholder="100 or -25"
                    required
                    type="number"
                  />
                </label>
                <label className="block text-sm font-bold">
                  Reason
                  <textarea className="mt-1 min-h-24 w-full rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2" name="reason" required />
                </label>
                <button className="rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-4 py-2 text-sm font-bold text-white" type="submit">
                  Apply Adjustment
                </button>
              </form>
            </section>

            <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white p-4 shadow-[var(--yt-shadow-soft)]">
              <h2 className="text-lg font-bold">Provider Failures</h2>
              {overview.providerFailures.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--yt-text-muted)]">No provider failures in recent AI logs.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {overview.providerFailures.map((failure) => (
                    <div className="flex items-center justify-between gap-3 rounded-[var(--yt-radius-row)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3 text-sm" key={`${failure.provider}-${failure.model}`}>
                      <div>
                        <p className="font-bold">{failure.provider}</p>
                        <p className="text-[var(--yt-text-muted)]">{failure.model}</p>
                      </div>
                      <p className="font-extrabold text-[var(--yt-danger)]">{failure.failures}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </section>

        <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]" id="plan-limits">
          <div className="border-b border-[var(--yt-border)] p-4">
            <h2 className="text-lg font-bold">Plan Limits</h2>
            <p className="mt-1 text-sm text-[var(--yt-text-muted)]">
              Change monthly refill credits, workspace limits, and competitor channel limits for subscription plans and admin users.
            </p>
          </div>
          <form action={updatePlanLimits}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#1F2937] text-white">
                  <tr>
                    <th className="px-3 py-2">Plan</th>
                    <th className="px-3 py-2">Monthly Price</th>
                    <th className="px-3 py-2">Monthly Refill Credits</th>
                    <th className="px-3 py-2">Workspaces</th>
                    <th className="px-3 py-2">Competitor Channels</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--yt-border)]">
                  {overview.planDefinitions.map((plan) => (
                    <tr key={plan.code}>
                      <td className="px-3 py-3">
                        <p className="font-bold">{plan.name}</p>
                        <p className="text-xs text-[var(--yt-text-muted)]">{plan.code}</p>
                      </td>
                      <td className="px-3 py-3 font-bold">${plan.monthlyPriceUsd}</td>
                      <td className="px-3 py-3">
                        <label className="sr-only" htmlFor={`${plan.code}-monthlyCredits`}>
                          {plan.name} monthly refill credits
                        </label>
                        <input
                          className="w-32 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2"
                          defaultValue={plan.monthlyCredits}
                          id={`${plan.code}-monthlyCredits`}
                          min={0}
                          name={`${plan.code}_monthlyCredits`}
                          required
                          type="number"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <label className="sr-only" htmlFor={`${plan.code}-maxWorkspaces`}>
                          {plan.name} workspace limit
                        </label>
                        <input
                          className="w-32 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2"
                          defaultValue={plan.maxWorkspaces}
                          id={`${plan.code}-maxWorkspaces`}
                          min={0}
                          name={`${plan.code}_maxWorkspaces`}
                          required
                          type="number"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <label className="sr-only" htmlFor={`${plan.code}-maxTrackedChannels`}>
                          {plan.name} competitor channel limit
                        </label>
                        <input
                          className="w-32 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2"
                          defaultValue={plan.maxTrackedChannels}
                          id={`${plan.code}-maxTrackedChannels`}
                          min={0}
                          name={`${plan.code}_maxTrackedChannels`}
                          required
                          type="number"
                        />
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[var(--yt-primary-soft)]/40">
                    <td className="px-3 py-3">
                      <p className="font-bold">Admin users</p>
                      <p className="text-xs text-[var(--yt-text-muted)]">ADMIN user type</p>
                    </td>
                    <td className="px-3 py-3 font-bold">n/a</td>
                    <td className="px-3 py-3">
                      <label className="sr-only" htmlFor="ADMIN-monthlyCredits">
                        Admin monthly refill credits
                      </label>
                      <input
                        className="w-32 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2"
                        defaultValue={overview.adminEntitlement.monthlyCredits}
                        id="ADMIN-monthlyCredits"
                        min={0}
                        name="ADMIN_monthlyCredits"
                        required
                        type="number"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <label className="sr-only" htmlFor="ADMIN-maxWorkspaces">
                        Admin workspace limit
                      </label>
                      <input
                        className="w-32 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2"
                        defaultValue={overview.adminEntitlement.maxWorkspaces}
                        id="ADMIN-maxWorkspaces"
                        min={0}
                        name="ADMIN_maxWorkspaces"
                        required
                        type="number"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <label className="sr-only" htmlFor="ADMIN-maxTrackedChannels">
                        Admin competitor channel limit
                      </label>
                      <input
                        className="w-32 rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] px-3 py-2"
                        defaultValue={overview.adminEntitlement.maxTrackedChannels}
                        id="ADMIN-maxTrackedChannels"
                        min={0}
                        name="ADMIN_maxTrackedChannels"
                        required
                        type="number"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="border-t border-[var(--yt-border)] p-4">
              <button className="rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] px-4 py-2 text-sm font-bold text-white" type="submit">
                Save Plan Limits
              </button>
            </div>
          </form>
        </section>

        <section className="grid gap-5 xl:grid-cols-2" id="jobs">
          <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
            <div className="border-b border-[var(--yt-border)] p-4">
              <h2 className="text-lg font-bold">Recent Failed Jobs</h2>
              <p className="mt-1 text-sm text-[var(--yt-text-muted)]">
                Queue latency avg {Math.round(overview.queueHealth.latency.averageMs / 1000)}s · max {Math.round(overview.queueHealth.latency.maxMs / 1000)}s · {overview.queueHealth.running} running
              </p>
            </div>
            {overview.failedJobs.length === 0 ? (
              <p className="p-4 text-sm text-[var(--yt-text-muted)]">No recent failed jobs.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#1F2937] text-white">
                    <tr>
                      <th className="px-3 py-2">Job</th>
                      <th className="px-3 py-2">Attempts</th>
                      <th className="px-3 py-2">Reference</th>
                      <th className="px-3 py-2">Error</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--yt-border)]">
                    {overview.failedJobs.map((job) => (
                      <tr key={job.id}>
                        <td className="px-3 py-3">
                          <p className="font-bold">{job.jobType}</p>
                          <p className="text-xs text-[var(--yt-text-muted)]">{job.provider ?? "No provider"} · {formatDate(job.updatedAt)}</p>
                        </td>
                        <td className="px-3 py-3 font-bold">{job.attempts}/{job.maxAttempts}</td>
                        <td className="px-3 py-3 text-xs text-[var(--yt-text-muted)]">{job.referenceType ?? "None"} {job.referenceId ?? ""}</td>
                        <td className="px-3 py-3 text-[var(--yt-danger)]">{job.errorMessage ?? "Unknown failure"}</td>
                        <td className="px-3 py-3">
                          {job.attempts < job.maxAttempts ? (
                            <form action={retryFailedJobRun}>
                              <input name="jobId" type="hidden" value={job.id} />
                              <button className="rounded-[var(--yt-radius-button)] border border-[var(--yt-primary)] px-3 py-2 text-sm font-bold text-[var(--yt-primary)]" type="submit">
                                Retry
                              </button>
                            </form>
                          ) : (
                            <span className="text-xs font-bold text-[var(--yt-text-muted)]">Max attempts</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
            <div className="border-b border-[var(--yt-border)] p-4">
              <h2 className="text-lg font-bold">Failed Reports</h2>
            </div>
            {overview.failedReports.length === 0 ? (
              <p className="p-4 text-sm text-[var(--yt-text-muted)]">No failed reports to retry.</p>
            ) : (
              <div className="divide-y divide-[var(--yt-border)]">
                {overview.failedReports.map((report) => (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm" key={report.id}>
                    <div>
                      <p className="font-bold">{report.title}</p>
                      <p className="text-[var(--yt-text-muted)]">{report.errorMessage ?? "No error recorded"} · {formatDate(report.updatedAt)}</p>
                    </div>
                    <form action={retryFailedReport}>
                      <input name="reportId" type="hidden" value={report.id} />
                      <button className="rounded-[var(--yt-radius-button)] border border-[var(--yt-primary)] px-3 py-2 text-sm font-bold text-[var(--yt-primary)]" type="submit">
                        Retry
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]" id="email">
          <div className="border-b border-[var(--yt-border)] p-4">
            <h2 className="text-lg font-bold">Email Delivery Logs</h2>
            <p className="mt-1 text-sm text-[var(--yt-text-muted)]">
              Recent report, export, and billing notification delivery attempts through Resend.
            </p>
          </div>
          {overview.recentEmailLogs.length === 0 ? (
            <p className="p-4 text-sm text-[var(--yt-text-muted)]">No email delivery attempts recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#1F2937] text-white">
                  <tr>
                    <th className="px-3 py-2">Template</th>
                    <th className="px-3 py-2">Recipient</th>
                    <th className="px-3 py-2">Provider</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--yt-border)]">
                  {overview.recentEmailLogs.map((email) => (
                    <tr key={email.id}>
                      <td className="px-3 py-3">
                        <p className="font-bold">{email.template}</p>
                        <p className="text-xs text-[var(--yt-text-muted)]">{formatDate(email.createdAt)}</p>
                      </td>
                      <td className="px-3 py-3">{email.toEmail || "No recipient"}</td>
                      <td className="px-3 py-3">
                        <p>{email.provider}</p>
                        <p className="text-xs text-[var(--yt-text-muted)]">{email.providerId ?? "No provider id"}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-[var(--yt-radius-pill)] px-2 py-1 text-xs font-bold ${statusClass(email.status)}`}>{email.status}</span>
                      </td>
                      <td className="px-3 py-3 text-[var(--yt-text-muted)]">{email.errorMessage ?? "Delivered or queued without provider error."}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]" id="usage">
          <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
            <div className="border-b border-[var(--yt-border)] p-4">
              <h2 className="text-lg font-bold">AI Generation Logs</h2>
            </div>
            {overview.recentAiGenerations.length === 0 ? (
              <p className="p-4 text-sm text-[var(--yt-text-muted)]">No AI generation logs yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#1F2937] text-white">
                    <tr>
                      <th className="px-3 py-2">Task</th>
                      <th className="px-3 py-2">Provider</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Input Tokens</th>
                      <th className="px-3 py-2">Output Tokens</th>
                      <th className="px-3 py-2">Credits</th>
                      <th className="px-3 py-2">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--yt-border)]">
                    {overview.recentAiGenerations.map((generation) => (
                      <tr key={generation.id}>
                        <td className="px-3 py-3">
                          <p className="font-bold">{generation.taskType}</p>
                          <p className="text-xs text-[var(--yt-text-muted)]">{generation.errorMessage ?? formatDate(generation.createdAt)}</p>
                        </td>
                        <td className="px-3 py-3">{generation.provider} · {generation.model}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-[var(--yt-radius-pill)] px-2 py-1 text-xs font-bold ${statusClass(generation.status)}`}>{generation.status}</span>
                        </td>
                        <td className="px-3 py-3 font-bold tabular-nums">{formatTokenCount(generation.inputTokens)}</td>
                        <td className="px-3 py-3 font-bold tabular-nums">{formatTokenCount(generation.outputTokens)}</td>
                        <td className="px-3 py-3 font-bold">{generation.creditsCharged}</td>
                        <td className="px-3 py-3">{generation.costUsd ? `$${generation.costUsd.toString()}` : "$0.0000"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
              <div className="border-b border-[var(--yt-border)] p-4">
                <h2 className="text-lg font-bold">Cost By User And Task</h2>
              </div>
              {overview.userTaskCosts.length === 0 ? (
                <p className="p-4 text-sm text-[var(--yt-text-muted)]">No costed AI usage in recent logs.</p>
              ) : (
                <div className="divide-y divide-[var(--yt-border)]">
                  {overview.userTaskCosts.slice(0, 8).map((row) => (
                    <div className="grid grid-cols-[1fr_auto] gap-3 p-4 text-sm" key={`${row.userId ?? "system"}-${row.taskType}`}>
                      <div>
                        <p className="font-bold">{row.taskType.replaceAll("_", " ")}</p>
                        <p className="text-xs text-[var(--yt-text-muted)]">{row.userId ?? "System"} · {row.generations} generations · {row.creditsCharged} credits</p>
                      </div>
                      <p className="font-extrabold tabular-nums">{formatCurrency(row.costUsd)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]">
            <div className="border-b border-[var(--yt-border)] p-4">
              <h2 className="text-lg font-bold">Audit Logs</h2>
            </div>
            {overview.auditLogs.length === 0 ? (
              <p className="p-4 text-sm text-[var(--yt-text-muted)]">No admin actions recorded.</p>
            ) : (
              <div className="divide-y divide-[var(--yt-border)]">
                {overview.auditLogs.map((log) => (
                  <div className="p-4 text-sm" key={log.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold">{log.action}</p>
                      <p className="text-xs text-[var(--yt-text-muted)]">{formatDate(log.createdAt)}</p>
                    </div>
                    <p className="mt-1 text-[var(--yt-text-muted)]">
                      {log.actor?.email ?? "Unknown admin"} · {log.targetType} {log.targetId ?? ""}
                    </p>
                    {log.reason ? <p className="mt-1 text-[var(--yt-text-secondary)]">{log.reason}</p> : null}
                  </div>
                ))}
              </div>
            )}
            </section>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
