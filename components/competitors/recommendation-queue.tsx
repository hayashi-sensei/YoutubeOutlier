import { updateCompetitorRecommendation } from "@/actions/competitors";

export type CompetitorRecommendationListItem = {
  id: string;
  channelUrl: string;
  title: string;
  reason: string;
  relevanceScore: number;
};

type RecommendationQueueProps = {
  recommendations: CompetitorRecommendationListItem[];
};

function formatRelevanceScore(score: number) {
  if (score <= 1) {
    return `${Math.round(score * 100)}%`;
  }

  return Math.round(score).toString();
}

export function RecommendationQueue({ recommendations }: RecommendationQueueProps) {
  return (
    <section className="yt-panel">
      <div className="yt-panel-head">
        <h2 className="yt-panel-title">Recommendation Queue</h2>
        <span className="yt-badge">{recommendations.length} new</span>
      </div>

      {recommendations.length === 0 ? (
        <p className="yt-empty-state">No competitor recommendations waiting for review.</p>
      ) : (
        <div className="divide-y divide-[var(--yt-border)]">
          {recommendations.map((recommendation) => (
            <article className="grid gap-3 p-4 text-sm" key={recommendation.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-[var(--yt-text)]">{recommendation.title}</h3>
                  <p className="mt-1 break-all text-xs font-semibold text-[var(--yt-blue)]">{recommendation.channelUrl}</p>
                </div>
                <span className="yt-badge primary">
                  {formatRelevanceScore(recommendation.relevanceScore)} relevance
                </span>
              </div>

              <p className="text-sm leading-5 text-[var(--yt-text-secondary)]">{recommendation.reason}</p>

              <div className="flex flex-wrap gap-2">
                <form action={updateCompetitorRecommendation}>
                  <input name="recommendationId" type="hidden" value={recommendation.id} />
                  <input name="action" type="hidden" value="approve" />
                  <button
                    className="yt-btn yt-btn-primary"
                    type="submit"
                  >
                    Approve
                  </button>
                </form>
                <form action={updateCompetitorRecommendation}>
                  <input name="recommendationId" type="hidden" value={recommendation.id} />
                  <input name="action" type="hidden" value="dismiss" />
                  <button
                    className="yt-btn yt-btn-ghost"
                    type="submit"
                  >
                    Dismiss
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
