import {
  processVideoTranscript,
  type TranscriptPipelineTx,
} from "./pipeline";
import {
  HeuristicTranscriptAnalyzer,
  NoopTranscriptProvider,
} from "./provider";
import type {
  TranscriptAnalyzer,
  TranscriptPipelineSummary,
  TranscriptProvider,
  TranscriptVideoRecord,
} from "@/types/transcripts";

const TRANSCRIPT_JOB_TYPE = "transcript_fetch";

type TranscriptVideoRead = {
  findUnique(input: {
    where: { id: string };
    select: {
      id: true;
      youtubeVideoId: true;
      title: true;
      description: true;
      publishedAt: true;
      durationSeconds: true;
      thumbnailUrl: true;
      tags: true;
      categoryId: true;
      defaultLanguage: true;
      transcriptStatus: true;
    };
  }): Promise<TranscriptVideoRecord | null>;
};

type JobRunWrite = {
  create(input: {
    data: {
      jobType: typeof TRANSCRIPT_JOB_TYPE;
      status: "RUNNING";
      provider: string;
      referenceType: "YoutubeVideo";
      referenceId: string;
      attempts: 1;
      maxAttempts: 3;
      startedAt: Date;
      metadata: { youtubeVideoId: string };
    };
  }): Promise<{ id: string }>;
  update(input: {
    where: { id: string };
    data:
      | {
          status: "SUCCEEDED";
          completedAt: Date;
          metadata: {
            youtubeVideoId: string;
            summary: TranscriptPipelineSummary;
          };
        }
      | {
          status: "FAILED";
          completedAt: Date;
          errorMessage: string;
        };
  }): Promise<unknown>;
};

export type TranscriptRunnerPrisma = TranscriptPipelineTx & {
  youtubeVideo: TranscriptPipelineTx["youtubeVideo"] & TranscriptVideoRead;
  jobRun: JobRunWrite;
};

export async function runTranscriptFetchJob(input: {
  prisma: TranscriptRunnerPrisma;
  provider?: TranscriptProvider;
  analyzer?: TranscriptAnalyzer;
  videoId: string;
  jobRunId?: string;
  now?: Date;
}): Promise<TranscriptPipelineSummary> {
  const now = input.now ?? new Date();
  const provider = input.provider ?? new NoopTranscriptProvider();
  const analyzer = input.analyzer ?? new HeuristicTranscriptAnalyzer();
  const video = await loadRunnerVideo(input.prisma, input.videoId);
  const metadata = { youtubeVideoId: video.youtubeVideoId };
  const job = input.jobRunId
    ? { id: input.jobRunId }
    : await input.prisma.jobRun.create({
        data: {
          jobType: TRANSCRIPT_JOB_TYPE,
          status: "RUNNING",
          provider: provider.name,
          referenceType: "YoutubeVideo",
          referenceId: video.id,
          attempts: 1,
          maxAttempts: 3,
          startedAt: now,
          metadata,
        },
      });

  try {
    const summary = await processVideoTranscript({
      tx: input.prisma,
      provider,
      analyzer,
      video,
      now,
    });

    await input.prisma.jobRun.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        completedAt: now,
        metadata: {
          ...metadata,
          summary,
        },
      },
    });

    return summary;
  } catch (error) {
    await recordTranscriptJobFailure(input.prisma, {
      jobRunId: job.id,
      completedAt: now,
      error,
    });
    throw error;
  }
}

async function loadRunnerVideo(
  prisma: TranscriptRunnerPrisma,
  videoId: string,
): Promise<TranscriptVideoRecord> {
  const video = await prisma.youtubeVideo.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      youtubeVideoId: true,
      title: true,
      description: true,
      publishedAt: true,
      durationSeconds: true,
      thumbnailUrl: true,
      tags: true,
      categoryId: true,
      defaultLanguage: true,
      transcriptStatus: true,
    },
  });

  if (!video) {
    throw new Error(`YouTube video not found: ${videoId}`);
  }

  return video;
}

async function recordTranscriptJobFailure(
  prisma: TranscriptRunnerPrisma,
  input: {
    jobRunId: string;
    completedAt: Date;
    error: unknown;
  },
): Promise<void> {
  try {
    await prisma.jobRun.update({
      where: { id: input.jobRunId },
      data: {
        status: "FAILED",
        completedAt: input.completedAt,
        errorMessage: getErrorMessage(input.error),
      },
    });
  } catch (loggingError) {
    console.error("Failed to record transcript job failure.", {
      jobRunId: input.jobRunId,
      originalError: getErrorMessage(input.error),
      loggingError: getErrorMessage(loggingError),
    });
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
