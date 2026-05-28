import type {
  TranscriptAnalysisInput,
  TranscriptAnalysisResult,
  TranscriptAnalyzer,
  TranscriptFetchResult,
  TranscriptPipelineSummary,
  TranscriptProvider,
  TranscriptSegment,
  TranscriptStatus,
  TranscriptVideoRecord,
} from "@/types/transcripts";

const TRANSCRIPT_JOB_TYPE = "transcript_fetch";
const TRANSCRIPT_QUEUE_PROVIDER = "transcript";

type JsonTranscriptAnalysisStructure = {
  hook: string;
  cta?: string;
  claims: string[];
  structure: TranscriptAnalysisResult["structure"];
  source: TranscriptAnalysisInput["source"];
  fallbackReason?: string;
};

type YoutubeVideoStatusWrite = {
  update(input: {
    where: { id: string };
    data: { transcriptStatus: TranscriptStatus };
  }): Promise<unknown>;
};

type VideoTranscriptWrite = {
  upsert(input: {
    where: { youtubeVideoId: string };
    create: VideoTranscriptWriteInput;
    update: Omit<VideoTranscriptWriteInput, "youtubeVideoId">;
  }): Promise<unknown>;
};

type VideoAnalysisWrite = {
  create(input: { data: VideoAnalysisWriteInput }): Promise<unknown>;
};

type JobRunQueueWrite = {
  create(input: {
    data: {
      jobType: typeof TRANSCRIPT_JOB_TYPE;
      status: "QUEUED";
      provider: typeof TRANSCRIPT_QUEUE_PROVIDER;
      referenceType: "YoutubeVideo";
      referenceId: string;
      attempts: 0;
      maxAttempts: 3;
      metadata: { queuedAt: string };
    };
  }): Promise<{ id: string }>;
};

type VideoTranscriptWriteInput = {
  youtubeVideoId: string;
  provider: string;
  language?: string;
  text: string;
  segmentsJson?: TranscriptSegment[];
  fetchedAt: Date;
};

type VideoAnalysisWriteInput = {
  youtubeVideoId: string;
  analysisType: "transcript" | "metadata_only";
  contentPillar?: string;
  hookType?: string;
  titlePattern?: string;
  thumbnailPattern?: string;
  structureJson: JsonTranscriptAnalysisStructure;
  summary: string;
  ctaPattern?: string;
  emotionalAngle?: string;
  model?: string;
};

export type TranscriptPipelineTx = {
  youtubeVideo: YoutubeVideoStatusWrite;
  videoTranscript: VideoTranscriptWrite;
  videoAnalysis: VideoAnalysisWrite;
};

export type TranscriptQueueTx = {
  youtubeVideo: YoutubeVideoStatusWrite;
  jobRun: JobRunQueueWrite;
};

export async function queueTranscriptFetchForVideo(
  tx: TranscriptQueueTx,
  input: { videoId: string; now?: Date },
): Promise<{ id: string }> {
  const now = input.now ?? new Date();

  await tx.youtubeVideo.update({
    where: { id: input.videoId },
    data: { transcriptStatus: "QUEUED" },
  });

  return tx.jobRun.create({
    data: {
      jobType: TRANSCRIPT_JOB_TYPE,
      status: "QUEUED",
      provider: TRANSCRIPT_QUEUE_PROVIDER,
      referenceType: "YoutubeVideo",
      referenceId: input.videoId,
      attempts: 0,
      maxAttempts: 3,
      metadata: { queuedAt: now.toISOString() },
    },
  });
}

export async function processVideoTranscript(input: {
  tx: TranscriptPipelineTx;
  provider: TranscriptProvider;
  analyzer: TranscriptAnalyzer;
  video: TranscriptVideoRecord;
  now?: Date;
}): Promise<TranscriptPipelineSummary> {
  const now = input.now ?? new Date();
  const fetchResult = await safeFetchTranscript(input.provider, input.video);

  if (fetchResult.status === "available") {
    await storeTranscript(input.tx, input.video.id, fetchResult, now);
    await updateTranscriptStatus(input.tx, input.video.id, "AVAILABLE");
    await storeAnalysis(input.tx, {
      video: input.video,
      analyzer: input.analyzer,
      analysisInput: {
        source: "transcript",
        video: input.video,
        transcriptText: fetchResult.text,
        transcriptLanguage: fetchResult.language,
        transcriptSegments: fetchResult.segments,
      },
      analysisType: "transcript",
    });

    return {
      videoId: input.video.id,
      youtubeVideoId: input.video.youtubeVideoId,
      transcriptStatus: "AVAILABLE",
      analysisType: "transcript",
      provider: fetchResult.provider,
      fallbackUsed: false,
    };
  }

  const fallback = fallbackSummary(input.video, fetchResult, input.provider.name);
  await updateTranscriptStatus(input.tx, input.video.id, fallback.transcriptStatus);
  await storeAnalysis(input.tx, {
    video: input.video,
    analyzer: input.analyzer,
    analysisInput: {
      source: "metadata",
      video: input.video,
      transcriptText: undefined,
      fallbackReason: fallback.reason,
    },
    analysisType: "metadata_only",
  });

  return fallback;
}

async function safeFetchTranscript(
  provider: TranscriptProvider,
  video: TranscriptVideoRecord,
): Promise<TranscriptFetchResult | { status: "failed"; provider: string; reason: string }> {
  try {
    return await provider.fetchTranscript({
      youtubeVideoId: video.youtubeVideoId,
      url: `https://www.youtube.com/watch?v=${video.youtubeVideoId}`,
    });
  } catch (error) {
    return {
      status: "failed",
      provider: provider.name,
      reason: getErrorMessage(error),
    };
  }
}

async function storeTranscript(
  tx: TranscriptPipelineTx,
  videoId: string,
  result: Extract<TranscriptFetchResult, { status: "available" }>,
  fetchedAt: Date,
): Promise<void> {
  const writeInput = {
    provider: result.provider,
    language: result.language,
    text: result.text,
    segmentsJson: result.segments,
    fetchedAt,
  };

  await tx.videoTranscript.upsert({
    where: { youtubeVideoId: videoId },
    create: {
      youtubeVideoId: videoId,
      ...writeInput,
    },
    update: writeInput,
  });
}

async function updateTranscriptStatus(
  tx: TranscriptPipelineTx,
  videoId: string,
  transcriptStatus: TranscriptStatus,
): Promise<void> {
  await tx.youtubeVideo.update({
    where: { id: videoId },
    data: { transcriptStatus },
  });
}

async function storeAnalysis(
  tx: TranscriptPipelineTx,
  input: {
    video: TranscriptVideoRecord;
    analyzer: TranscriptAnalyzer;
    analysisInput: TranscriptAnalysisInput;
    analysisType: "transcript" | "metadata_only";
  },
): Promise<void> {
  const analysis = await input.analyzer.analyze(input.analysisInput);

  await tx.videoAnalysis.create({
    data: {
      youtubeVideoId: input.video.id,
      analysisType: input.analysisType,
      contentPillar: analysis.contentPillars[0],
      hookType: analysis.hookType,
      titlePattern: analysis.titlePattern,
      thumbnailPattern: analysis.thumbnailPattern,
      structureJson: {
        hook: analysis.hook,
        cta: analysis.cta,
        claims: analysis.claims,
        structure: analysis.structure,
        source: input.analysisInput.source,
        fallbackReason: input.analysisInput.fallbackReason,
      },
      summary: analysis.summary,
      ctaPattern: analysis.cta,
      emotionalAngle: analysis.emotionalAngle,
      model: analysis.model ?? input.analyzer.name,
    },
  });
}

function fallbackSummary(
  video: TranscriptVideoRecord,
  result: Exclude<Awaited<ReturnType<typeof safeFetchTranscript>>, { status: "available" }>,
  defaultProvider: string,
): TranscriptPipelineSummary {
  const transcriptStatus = transcriptStatusFromFetchResult(result.status);

  return {
    videoId: video.id,
    youtubeVideoId: video.youtubeVideoId,
    transcriptStatus,
    analysisType: "metadata_only",
    provider: result.provider || defaultProvider,
    fallbackUsed: true,
    reason: result.reason,
  };
}

function transcriptStatusFromFetchResult(
  status: "unavailable" | "skipped" | "failed",
): "UNAVAILABLE" | "SKIPPED" | "FAILED" {
  if (status === "unavailable") {
    return "UNAVAILABLE";
  }
  if (status === "skipped") {
    return "SKIPPED";
  }

  return "FAILED";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
