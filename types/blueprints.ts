export type BlueprintVideoAnalysisInput = {
  videoId: string;
  youtubeVideoId: string;
  title: string;
  channelTitle: string;
  publishedAt: Date;
  outlierScore: number;
  opportunityScore: number | null;
  multiplier: number | null;
  analysis: {
    contentPillar: string | null;
    hookType: string | null;
    titlePattern: string | null;
    thumbnailPattern: string | null;
    structureJson: unknown;
    ctaPattern: string | null;
    emotionalAngle: string | null;
    summary: string | null;
  } | null;
};

export type BlueprintObservation = {
  videoId: string;
  youtubeVideoId: string;
  titlePattern: string;
  hookPattern: string;
  thumbnailPattern: string;
  contentPillar: string;
  structurePattern: string;
  ctaPattern: string;
  emotionalAngle: string;
  videoFormat: string;
  productionNotes: string;
  reusableInsight: string;
  outlierScore: number;
  opportunityScore: number | null;
  multiplier: number | null;
};

export type CompetitorBlueprintSummary = {
  workspaceId: string;
  youtubeChannelId: string;
  channelTitle: string;
  videoCount: number;
  averageOutlierScore: number;
  titlePatterns: string[];
  hookPatterns: string[];
  thumbnailPatterns: string[];
  contentPillars: string[];
  structurePatterns: string[];
  ctaPatterns: string[];
  emotionalAngles: string[];
  observations: BlueprintObservation[];
  generatedAt: Date;
};

export type BlueprintSummaryRow = CompetitorBlueprintSummary & {
  id: string;
  summary: string | null;
  channelHandle: string | null;
  channelThumbnailUrl: string | null;
  updatedAt: Date;
};

export type BlueprintRefreshSummary = {
  workspaceId: string;
  channelsEvaluated: number;
  blueprintsCreated: number;
  blueprintsUpdated: number;
  channelsSkipped: number;
};
