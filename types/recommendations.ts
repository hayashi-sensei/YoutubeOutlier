export type RecommendationStatus = "NEW" | "SAVED" | "DISMISSED" | "USED" | "EXPIRED";
export type TopicRecommendationKind = "STANDARD" | "EXPERIMENTAL";

export type RecommendationWorkspaceContext = {
  primaryNiche: string;
  targetAudience: string | null;
  brandVoice: string | null;
  contentGoals: string | null;
  topicsToAvoid: string | null;
};

export type RecommendationOutlierInput = {
  videoId: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  title: string;
  channelTitle: string;
  publishedAt: Date;
  opportunityScore: number;
  outlierScore: number;
  multiplier: number | null;
  analysis: {
    contentPillar: string | null;
    hookType: string | null;
    titlePattern: string | null;
    thumbnailPattern: string | null;
    emotionalAngle: string | null;
    summary: string | null;
  } | null;
};

export type RecommendationRecentVideoInput = {
  videoId: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  title: string;
  channelTitle: string;
  publishedAt: Date;
};

export type RecommendationSourceItemInput = {
  sourceItemId: string;
  url: string;
  title: string;
  sourceName: string;
  publishedAt: Date | null;
  summary: string | null;
};

export type RecommendationBlueprintInput = {
  channelTitle: string;
  contentPillars: string[];
  topVideoIds: string[];
  titlePatterns: string[];
  hookPatterns: string[];
  thumbnailPatterns: string[];
  emotionalAngles: string[];
  averageOutlierScore: number;
};

export type RecommendationCalendarInput = {
  title: string;
  status: string;
};

export type ExistingRecommendationInput = {
  topic: string;
  status: RecommendationStatus;
};

export type RecommendationGenerationInput = {
  now: Date;
  workspaceOwnerId: string;
  workspace: RecommendationWorkspaceContext;
  outliers: RecommendationOutlierInput[];
  recentVideos: RecommendationRecentVideoInput[];
  sourceItems: RecommendationSourceItemInput[];
  blueprints: RecommendationBlueprintInput[];
  calendarItems: RecommendationCalendarInput[];
  existingRecommendations: ExistingRecommendationInput[];
};

export type GeneratedRecommendationEvidence = {
  youtubeVideoId?: string;
  sourceItemId?: string;
  evidenceType: string;
  note: string;
};

export type GeneratedRecommendationOutline = {
  sections: string[];
};

export type GeneratedTopicRecommendation = {
  title: string;
  topic: string;
  angle: string;
  whyNow: string;
  audiencePainPoint: string;
  opportunityScore: number;
  suggestedTitle: string;
  suggestedHook: string;
  thumbnailConcept: string;
  outline: GeneratedRecommendationOutline;
  linkedinAngle: string;
  evidence: GeneratedRecommendationEvidence[];
};

export type TopicRecommendationSummaryRow = {
  id: string;
  title: string;
  topic: string;
  angle: string | null;
  whyNow: string | null;
  audiencePainPoint: string | null;
  opportunityScore: number | null;
  suggestedTitle: string | null;
  suggestedHook: string | null;
  thumbnailConcept: string | null;
  outlineJson: unknown;
  linkedinAngle: string | null;
  status: RecommendationStatus;
  kind: TopicRecommendationKind;
  sourceTrackedChannelId: string | null;
  createdAt: Date;
  reportId: string | null;
  evidences: Array<{
    id: string;
    evidenceType: string;
    note: string | null;
    video: {
      id: string;
      youtubeVideoId: string;
      title: string;
      channel: { title: string; handle: string | null };
    } | null;
    sourceItem: {
      id: string;
      title: string;
      url: string;
      source: { name: string | null; url: string };
    } | null;
  }>;
};

export type TopicRecommendationRunSummary = {
  workspaceId: string;
  reportId: string;
  kind: TopicRecommendationKind;
  recommendationsCreated: number;
  evidenceCreated: number;
};
