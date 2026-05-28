export type CompetitorIntelligenceOutlier = {
  videoId: string;
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  durationSeconds: number | null;
  viewCount: number | null;
  outlierScore: number | null;
  opportunityScore: number | null;
  multiplier: number | null;
};

export type CompetitorIntelligenceCachedVideo = {
  videoId: string;
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  durationSeconds: number | null;
  viewCount: number | null;
  outlierScore: number | null;
  multiplier: number | null;
};

export type CompetitorIntelligenceBlueprint = {
  id: string;
  summary: string | null;
  generatedAt: Date;
  averageOutlierScore: number | null;
  videoCount: number;
  signals: string[];
  titlePatterns: string[];
  hookPatterns: string[];
  thumbnailPatterns: string[];
  contentPillars: string[];
  structurePatterns: string[];
  ctaPatterns: string[];
  emotionalAngles: string[];
  observations: Array<{
    videoTitle?: string;
    topic?: string;
    contentPillar?: string;
    hookType?: string;
    titlePattern?: string;
    thumbnailPattern?: string;
    structure?: string[];
    ctaPattern?: string;
    emotionalAngle?: string;
    productionNotes?: string[];
  }>;
};

export type CompetitorChannelIntelligence = {
  trackedChannelId: string;
  nickname: string | null;
  reason: string | null;
  isActive: boolean;
  channel: {
    id: string;
    title: string;
    handle: string | null;
    youtubeChannelId: string;
    subscriberCount: bigint | number | null;
    videoCount: number | null;
    viewCount: bigint | number | null;
    lastFetchedAt: Date | null;
  };
  stats: {
    cachedVideos: number;
    baselineViews: number | null;
    topMultiplier: number | null;
    averageMultiplier: number | null;
    emulationScore: number | null;
    averageOutlierScore: number | null;
  };
  latestIngestionJob: {
    status: string;
    createdAt: Date;
    errorMessage: string | null;
  } | null;
  blueprint: CompetitorIntelligenceBlueprint | null;
  topOutliers: CompetitorIntelligenceOutlier[];
  cachedVideos: CompetitorIntelligenceCachedVideo[];
  cachedVideoPage: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
