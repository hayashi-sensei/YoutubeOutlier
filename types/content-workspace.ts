export const CONTENT_WORKSPACE_SECTION_TYPES = ["outline", "hook", "titles", "caption", "description"] as const;

export const REPURPOSING_ASSET_TYPE_PREFIX = "repurpose_";

export type ContentWorkspaceSectionType = (typeof CONTENT_WORKSPACE_SECTION_TYPES)[number];

export type ContentWorkspaceSourceType = "recommendation" | "channel_recommendation" | "manual_topic";

export type ContentWorkspaceEvidenceSnapshot = {
  workspaceId: string;
  sourceType: ContentWorkspaceSourceType;
  manualTopic?: string;
  angle?: string | null;
  workspace?: {
    id: string;
    name: string;
    planCode: string;
  };
  recommendation?: {
    id: string;
    topic: string;
    title: string;
    angle: string | null;
    whyNow: string | null;
    audiencePainPoint: string | null;
    opportunityScore: number | null;
    suggestedTitle: string | null;
    suggestedHook: string | null;
    thumbnailConcept: string | null;
    linkedinAngle: string | null;
    sourceTrackedChannelId: string | null;
  };
  channel?: {
    trackedChannelId: string;
    youtubeChannelId: string;
    title: string;
    handle: string | null;
    nickname: string | null;
    reason: string | null;
  } | null;
  blueprint?: {
    id: string;
    summary: string | null;
    videoCount: number;
    averageOutlierScore: number | null;
    generatedAt: string;
    titlePatterns: unknown;
    hookPatterns: unknown;
    thumbnailPatterns: unknown;
    contentPillars: unknown;
    structurePatterns: unknown;
    ctaPatterns: unknown;
    emotionalAngles: unknown;
    observationsJson: unknown;
    topVideoIds: string[];
  } | null;
  evidences: Array<{
    id: string;
    evidenceType: string;
    note: string | null;
    video?: {
      id: string;
      youtubeVideoId: string;
      title: string;
      channelTitle: string;
      channelHandle: string | null;
      outlier?: {
        outlierScore: number;
        multiplier: number | null;
        calculatedAt: string;
      } | null;
    } | null;
    sourceItem?: {
      id: string;
      title: string;
      url: string;
      sourceName: string | null;
      sourceUrl: string;
    } | null;
  }>;
};
