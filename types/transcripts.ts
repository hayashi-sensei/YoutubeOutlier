export type TranscriptStatus =
  | "NOT_REQUESTED"
  | "QUEUED"
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "FAILED"
  | "SKIPPED";

export type TranscriptSegment = {
  startSeconds?: number;
  durationSeconds?: number;
  text: string;
};

export type TranscriptFetchInput = {
  youtubeVideoId: string;
  url?: string;
};

export type TranscriptFetchResult =
  | {
      status: "available";
      provider: string;
      language?: string;
      text: string;
      segments?: TranscriptSegment[];
    }
  | {
      status: "unavailable";
      provider: string;
      reason?: string;
    }
  | {
      status: "skipped";
      provider: string;
      reason: string;
    };

export type TranscriptProvider = {
  name: string;
  fetchTranscript(input: TranscriptFetchInput): Promise<TranscriptFetchResult>;
};

export type TranscriptVideoRecord = {
  id: string;
  youtubeVideoId: string;
  title: string;
  description?: string | null;
  publishedAt: Date;
  durationSeconds?: number | null;
  thumbnailUrl?: string | null;
  tags: string[];
  categoryId?: string | null;
  defaultLanguage?: string | null;
  transcriptStatus: TranscriptStatus;
};

export type TranscriptAnalysisInput = {
  source: "transcript" | "metadata";
  video: TranscriptVideoRecord;
  transcriptText?: string;
  transcriptLanguage?: string;
  transcriptSegments?: TranscriptSegment[];
  fallbackReason?: string;
};

export type TranscriptAnalysisResult = {
  hook: string;
  hookType?: string;
  structure: {
    sections: string[];
    source?: string;
    notes?: string[];
  };
  cta?: string;
  claims: string[];
  summary: string;
  contentPillars: string[];
  titlePattern?: string;
  thumbnailPattern?: string;
  emotionalAngle?: string;
  model?: string;
};

export type TranscriptAnalyzer = {
  name: string;
  analyze(input: TranscriptAnalysisInput): Promise<TranscriptAnalysisResult>;
};

export type TranscriptPipelineSummary = {
  videoId: string;
  youtubeVideoId: string;
  transcriptStatus: Extract<
    TranscriptStatus,
    "AVAILABLE" | "UNAVAILABLE" | "FAILED" | "SKIPPED"
  >;
  analysisType: "transcript" | "metadata_only";
  provider: string;
  fallbackUsed: boolean;
  reason?: string;
};
