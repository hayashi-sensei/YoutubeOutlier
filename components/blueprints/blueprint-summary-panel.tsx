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
    <section className="yt-panel">
      <div className="yt-panel-head">
        <h2 className="yt-panel-title">{title}</h2>
      </div>
      {blueprints.length === 0 ? (
        <p className="yt-empty-state">{emptyText}</p>
      ) : (
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {blueprints.map((blueprint) => (
            <article
              className="yt-subpanel"
              key={blueprint.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="line-clamp-1 font-bold text-[var(--yt-text)]">
                    {blueprint.channelTitle}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">
                    {blueprint.videoCount} outliers analyzed - Avg score{" "}
                    {blueprint.averageOutlierScore.toFixed(0)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ...blueprint.contentPillars,
                  ...blueprint.hookPatterns,
                  ...blueprint.thumbnailPatterns,
                ]
                  .slice(0, 7)
                  .map((signal) => (
                    <span className="yt-signal-chip" key={signal}>
                      {signal}
                    </span>
                  ))}
              </div>
              {blueprint.observations[0] ? (
                <p className="mt-3 line-clamp-2 text-sm text-[var(--yt-text-secondary)]">
                  {blueprint.observations[0].reusableInsight}
                </p>
              ) : blueprint.summary ? (
                <p className="mt-3 line-clamp-2 text-sm text-[var(--yt-text-secondary)]">
                  {blueprint.summary}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
