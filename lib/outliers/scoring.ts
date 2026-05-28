import type {
  CalculatedOpportunityScore,
  CalculatedOutlierScore,
  OpportunityScoreInput,
  RepeatSignalVideo,
  VideoMetricSnapshotInput,
  VideoViewInput,
  OutlierScoreInput,
} from "../../types/outliers";

const DAY_MS = 24 * 60 * 60 * 1000;

export function calculateChannelBaseline(videos: VideoViewInput[]): number | null {
  const positiveViews = videos
    .map((video) => toPositiveNumber(video.viewCount))
    .filter((viewCount): viewCount is number => viewCount !== null)
    .sort((left, right) => left - right);

  if (positiveViews.length < 3) {
    return null;
  }

  const middleIndex = Math.floor(positiveViews.length / 2);
  if (positiveViews.length % 2 === 1) {
    return positiveViews[middleIndex] ?? null;
  }

  const lower = positiveViews[middleIndex - 1];
  const upper = positiveViews[middleIndex];
  return lower === undefined || upper === undefined ? null : (lower + upper) / 2;
}

export function calculateOutlierScore(
  input: OutlierScoreInput,
): CalculatedOutlierScore | null {
  const latestViewCount = toPositiveNumber(input.latestSnapshot?.viewCount);
  const baselineViews = toPositiveNumber(input.channelBaselineViews);

  if (latestViewCount === null || baselineViews === null) {
    return null;
  }

  const calculatedAt = input.now ?? new Date();
  const multiplier = latestViewCount / baselineViews;
  const relativeViewPerformanceScore = scoreRelativePerformance(multiplier);
  const viewVelocityScore = scoreVelocity({
    latestSnapshot: input.latestSnapshot,
    previousSnapshot: input.previousSnapshot,
    publishedAt: input.publishedAt,
    baselineViews,
    calculatedAt,
  });
  const engagementScore = scoreEngagement(input.latestSnapshot, latestViewCount);
  const recencyScore = scoreRecency(input.publishedAt, calculatedAt);
  const repeatSignalScore = clampScore(input.repeatSignalScore ?? 0);
  const outlierScore = weightedScore([
    [relativeViewPerformanceScore, 0.4],
    [viewVelocityScore, 0.25],
    [engagementScore, 0.15],
    [recencyScore, 0.1],
    [repeatSignalScore, 0.1],
  ]);

  return {
    channelBaselineViews: baselineViews,
    latestViewCount,
    relativeViewPerformance: round(multiplier),
    relativeViewPerformanceScore,
    viewVelocityScore,
    engagementScore,
    recencyScore,
    repeatSignalScore,
    outlierScore,
    multiplier: round(multiplier),
    calculatedAt,
  };
}

export function calculateRepeatSignalScore(input: {
  video: RepeatSignalVideo;
  peers: RepeatSignalVideo[];
}): number {
  if (input.peers.length === 0) {
    return 0;
  }

  const scores = input.peers.map((peer) => {
    let score = 0;
    if (sameSignal(input.video.contentPillar, peer.contentPillar)) {
      score += 30;
    }
    if (sameSignal(input.video.hookType, peer.hookType)) {
      score += 25;
    }
    if (sameSignal(input.video.titlePattern, peer.titlePattern)) {
      score += 25;
    }
    score += tagOverlapScore(input.video.tags, peer.tags) * 20;
    return score;
  });

  return clampScore(Math.max(...scores));
}

export function calculateOpportunityScore(
  input: OpportunityScoreInput,
): CalculatedOpportunityScore {
  const calculatedAt = input.now ?? new Date();
  const outlierScore = clampScore(
    typeof input.outlierScore === "number"
      ? input.outlierScore
      : input.outlierScore.outlierScore,
  );
  const userNicheRelevanceScore = clampScore(
    input.userNicheRelevance ?? inferNicheRelevance(input),
  );
  const topicFreshnessScore = clampScore(
    input.topicFreshness ?? inferFreshness(input.publishedAt, calculatedAt),
  );
  const competitiveSaturationScore = clampScore(input.competitiveSaturation ?? 70);
  const sourceCorroborationScore = clampScore(input.sourceCorroboration ?? 50);
  const brandFitScore = clampScore(input.brandFit ?? inferBrandFit(input));
  const opportunityScore = weightedScore([
    [outlierScore, 0.35],
    [userNicheRelevanceScore, 0.2],
    [topicFreshnessScore, 0.15],
    [competitiveSaturationScore, 0.1],
    [sourceCorroborationScore, 0.1],
    [brandFitScore, 0.1],
  ]);

  return {
    outlierScore,
    userNicheRelevanceScore,
    topicFreshnessScore,
    competitiveSaturationScore,
    sourceCorroborationScore,
    brandFitScore,
    opportunityScore,
    calculatedAt,
  };
}

function scoreRelativePerformance(multiplier: number): number {
  if (multiplier <= 1) {
    return clampScore(multiplier * 35);
  }

  return clampScore(35 + Math.log2(multiplier) * 30);
}

function scoreVelocity(input: {
  latestSnapshot?: VideoMetricSnapshotInput | null;
  previousSnapshot?: VideoMetricSnapshotInput | null;
  publishedAt: Date;
  baselineViews: number;
  calculatedAt: Date;
}): number {
  const latestViews = toPositiveNumber(input.latestSnapshot?.viewCount);
  if (latestViews === null) {
    return 0;
  }

  const previousViews = toNonNegativeNumber(input.previousSnapshot?.viewCount);
  const latestAt = input.latestSnapshot?.capturedAt ?? input.calculatedAt;
  const previousAt = input.previousSnapshot?.capturedAt ?? input.publishedAt;
  const elapsedDays = Math.max((latestAt.getTime() - previousAt.getTime()) / DAY_MS, 1);
  const gainedViews = Math.max(latestViews - (previousViews ?? 0), 0);
  const dailyBaseline = input.baselineViews / 30;
  return clampScore((gainedViews / elapsedDays / dailyBaseline) * 50);
}

function scoreEngagement(
  snapshot: VideoMetricSnapshotInput | null | undefined,
  latestViewCount: number,
): number {
  const likeCount = toNonNegativeNumber(snapshot?.likeCount) ?? 0;
  const commentCount = toNonNegativeNumber(snapshot?.commentCount) ?? 0;
  const engagementRate = (likeCount + commentCount * 2) / latestViewCount;
  return clampScore((engagementRate / 0.08) * 100);
}

function scoreRecency(publishedAt: Date, now: Date): number {
  const ageDays = Math.max((now.getTime() - publishedAt.getTime()) / DAY_MS, 0);
  if (ageDays <= 2) {
    return 100;
  }
  if (ageDays >= 30) {
    return 0;
  }

  return clampScore(100 - ((ageDays - 2) / 28) * 100);
}

function inferNicheRelevance(input: OpportunityScoreInput): number {
  const topicText = normalizeTokens(`${input.topic ?? ""} ${input.angle ?? ""}`);
  const nicheText = normalizeTokens(
    `${input.workspace?.primaryNiche ?? ""} ${input.workspace?.subNiche ?? ""} ${input.workspace?.targetAudience ?? ""}`,
  );

  if (topicText.size === 0 || nicheText.size === 0) {
    return 50;
  }

  const matches = [...topicText].filter((token) => nicheText.has(token)).length;
  return clampScore(35 + matches * 15);
}

function inferFreshness(publishedAt: Date | null | undefined, now: Date): number {
  if (!publishedAt) {
    return 50;
  }

  return scoreRecency(publishedAt, now);
}

function inferBrandFit(input: OpportunityScoreInput): number {
  const topicTokens = normalizeTokens(`${input.topic ?? ""} ${input.angle ?? ""}`);
  const brandTokens = normalizeTokens(input.workspace?.brandVoice ?? "");
  const avoidedTopics = new Set(
    (input.workspace?.topicsToAvoid ?? []).flatMap((topic) => [...normalizeTokens(topic)]),
  );

  if ([...topicTokens].some((token) => avoidedTopics.has(token))) {
    return 10;
  }

  if (topicTokens.size === 0 || brandTokens.size === 0) {
    return 65;
  }

  const matches = [...topicTokens].filter((token) => brandTokens.has(token)).length;
  return clampScore(60 + matches * 10);
}

function tagOverlapScore(
  videoTags: string[] | null | undefined,
  peerTags: string[] | null | undefined,
): number {
  const videoSet = normalizeTags(videoTags);
  const peerSet = normalizeTags(peerTags);
  if (videoSet.size === 0 || peerSet.size === 0) {
    return 0;
  }

  const intersectionSize = [...videoSet].filter((tag) => peerSet.has(tag)).length;
  const unionSize = new Set([...videoSet, ...peerSet]).size;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

function sameSignal(left: string | null | undefined, right: string | null | undefined): boolean {
  return normalizeSignal(left) !== "" && normalizeSignal(left) === normalizeSignal(right);
}

function normalizeSignal(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeTags(tags: string[] | null | undefined): Set<string> {
  return new Set((tags ?? []).map(normalizeSignal).filter((tag) => tag !== ""));
}

function normalizeTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((token) => token.length > 2),
  );
}

function weightedScore(parts: Array<[number, number]>): number {
  return clampScore(parts.reduce((total, [score, weight]) => total + clampScore(score) * weight, 0));
}

function toPositiveNumber(value: number | bigint | null | undefined): number | null {
  const numericValue = toFiniteNumber(value);
  return numericValue !== null && numericValue > 0 ? numericValue : null;
}

function toNonNegativeNumber(value: number | bigint | null | undefined): number | null {
  const numericValue = toFiniteNumber(value);
  return numericValue !== null && numericValue >= 0 ? numericValue : null;
}

function toFiniteNumber(value: number | bigint | null | undefined): number | null {
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return round(Math.min(Math.max(value, 0), 100));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
