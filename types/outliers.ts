export type NumericMetric = number | bigint | null | undefined;

export interface VideoViewInput {
  id?: string;
  viewCount: NumericMetric;
}

export interface VideoMetricSnapshotInput {
  viewCount: NumericMetric;
  likeCount?: NumericMetric;
  commentCount?: NumericMetric;
  capturedAt: Date;
}

export interface VideoAnalysisSignal {
  contentPillar?: string | null;
  hookType?: string | null;
  titlePattern?: string | null;
  tags?: string[] | null;
}

export interface RepeatSignalVideo extends VideoAnalysisSignal {
  id?: string;
}

export interface OutlierScoreInput {
  videoId?: string;
  publishedAt: Date;
  latestSnapshot?: VideoMetricSnapshotInput | null;
  previousSnapshot?: VideoMetricSnapshotInput | null;
  channelBaselineViews: NumericMetric;
  repeatSignalScore?: number | null;
  now?: Date;
}

export interface CalculatedOutlierScore {
  channelBaselineViews: number;
  latestViewCount: number;
  relativeViewPerformance: number;
  relativeViewPerformanceScore: number;
  viewVelocityScore: number;
  engagementScore: number;
  recencyScore: number;
  repeatSignalScore: number;
  outlierScore: number;
  multiplier: number;
  calculatedAt: Date;
}

export interface OpportunityWorkspaceInput {
  primaryNiche?: string | null;
  subNiche?: string | null;
  targetAudience?: string | null;
  brandVoice?: string | null;
  topicsToAvoid?: string[] | null;
}

export interface OpportunityScoreInput {
  outlierScore: number | CalculatedOutlierScore;
  workspace?: OpportunityWorkspaceInput | null;
  topic?: string | null;
  angle?: string | null;
  publishedAt?: Date | null;
  now?: Date;
  userNicheRelevance?: number | null;
  topicFreshness?: number | null;
  competitiveSaturation?: number | null;
  sourceCorroboration?: number | null;
  brandFit?: number | null;
}

export interface CalculatedOpportunityScore {
  outlierScore: number;
  userNicheRelevanceScore: number;
  topicFreshnessScore: number;
  competitiveSaturationScore: number;
  sourceCorroborationScore: number;
  brandFitScore: number;
  opportunityScore: number;
  calculatedAt: Date;
}

export interface OutlierScoreRefreshSummary {
  videosScored: number;
  videosSkipped: number;
  scoresCreated: number;
  scoresUpdated: number;
}

export interface RankedOutlierRow {
  rank: number;
  videoId: string;
  youtubeVideoId: string;
  title: string;
  channelTitle: string;
  publishedAt: Date;
  durationSeconds: number | null;
  viewCount: number;
  outlierScore: number;
  opportunityScore?: number | null;
  multiplier: number;
}
