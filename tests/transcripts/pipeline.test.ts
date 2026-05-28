import { describe, expect, test, vi } from "vitest";

import {
  processVideoTranscript,
  queueTranscriptFetchForVideo,
  type TranscriptPipelineTx,
  type TranscriptQueueTx,
} from "../../lib/transcripts/pipeline";
import {
  runTranscriptFetchJob,
  type TranscriptRunnerPrisma,
} from "../../lib/transcripts/runner";
import type {
  TranscriptAnalysisInput,
  TranscriptAnalysisResult,
  TranscriptAnalyzer,
  TranscriptFetchResult,
  TranscriptProvider,
  TranscriptVideoRecord,
} from "../../types/transcripts";

const NOW = new Date("2026-05-17T12:00:00Z");

describe("processVideoTranscript", () => {
  test("stores available transcript text and analysis output", async () => {
    const tx = createPipelineTx();
    const provider = createProvider({
      result: {
        status: "available",
        provider: "mock-transcripts",
        language: "en",
        text: "Most AI agents fail because teams skip workflow design.",
        segments: [
          {
            startSeconds: 0,
            durationSeconds: 4.2,
            text: "Most AI agents fail because teams skip workflow design.",
          },
        ],
      },
    });
    const analyzer = createAnalyzer();

    const summary = await processVideoTranscript({
      tx,
      provider,
      analyzer,
      video: createVideo(),
      now: NOW,
    });

    expect(summary).toEqual({
      videoId: "video-db-id",
      youtubeVideoId: "yt-video-1",
      transcriptStatus: "AVAILABLE",
      analysisType: "transcript",
      provider: "mock-transcripts",
      fallbackUsed: false,
    });
    expect(provider.fetchTranscript).toHaveBeenCalledWith({
      youtubeVideoId: "yt-video-1",
      url: "https://www.youtube.com/watch?v=yt-video-1",
    });
    expect(tx.videoTranscript.upsert).toHaveBeenCalledWith({
      where: { youtubeVideoId: "video-db-id" },
      create: {
        youtubeVideoId: "video-db-id",
        provider: "mock-transcripts",
        language: "en",
        text: "Most AI agents fail because teams skip workflow design.",
        segmentsJson: [
          {
            startSeconds: 0,
            durationSeconds: 4.2,
            text: "Most AI agents fail because teams skip workflow design.",
          },
        ],
        fetchedAt: NOW,
      },
      update: {
        provider: "mock-transcripts",
        language: "en",
        text: "Most AI agents fail because teams skip workflow design.",
        segmentsJson: [
          {
            startSeconds: 0,
            durationSeconds: 4.2,
            text: "Most AI agents fail because teams skip workflow design.",
          },
        ],
        fetchedAt: NOW,
      },
    });
    expect(tx.youtubeVideo.update).toHaveBeenCalledWith({
      where: { id: "video-db-id" },
      data: { transcriptStatus: "AVAILABLE" },
    });
    expect(analyzer.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "transcript",
        transcriptText:
          "Most AI agents fail because teams skip workflow design.",
      }),
    );
    expect(tx.videoAnalysis.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        youtubeVideoId: "video-db-id",
        analysisType: "transcript",
        contentPillar: "AI workflow",
        hookType: "contrarian",
        ctaPattern: "Subscribe for weekly AI workflow breakdowns.",
        model: "mock-analyzer",
      }),
    });
  });

  test("falls back to metadata-only analysis when transcript is unavailable", async () => {
    const tx = createPipelineTx();
    const provider = createProvider({
      result: {
        status: "unavailable",
        provider: "mock-transcripts",
        reason: "Captions disabled",
      },
    });
    const analyzer = createAnalyzer();

    const summary = await processVideoTranscript({
      tx,
      provider,
      analyzer,
      video: createVideo(),
      now: NOW,
    });

    expect(summary).toEqual({
      videoId: "video-db-id",
      youtubeVideoId: "yt-video-1",
      transcriptStatus: "UNAVAILABLE",
      analysisType: "metadata_only",
      provider: "mock-transcripts",
      fallbackUsed: true,
      reason: "Captions disabled",
    });
    expect(tx.videoTranscript.upsert).not.toHaveBeenCalled();
    expect(tx.youtubeVideo.update).toHaveBeenCalledWith({
      where: { id: "video-db-id" },
      data: { transcriptStatus: "UNAVAILABLE" },
    });
    expect(analyzer.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "metadata",
        transcriptText: undefined,
        fallbackReason: "Captions disabled",
      }),
    );
    expect(tx.videoAnalysis.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        youtubeVideoId: "video-db-id",
        analysisType: "metadata_only",
      }),
    });
  });

  test("records failed transcript status and still stores metadata analysis", async () => {
    const tx = createPipelineTx();
    const provider = createProvider({
      error: new Error("provider timeout"),
    });
    const analyzer = createAnalyzer();

    const summary = await processVideoTranscript({
      tx,
      provider,
      analyzer,
      video: createVideo(),
      now: NOW,
    });

    expect(summary).toEqual({
      videoId: "video-db-id",
      youtubeVideoId: "yt-video-1",
      transcriptStatus: "FAILED",
      analysisType: "metadata_only",
      provider: "mock-transcripts",
      fallbackUsed: true,
      reason: "provider timeout",
    });
    expect(tx.youtubeVideo.update).toHaveBeenCalledWith({
      where: { id: "video-db-id" },
      data: { transcriptStatus: "FAILED" },
    });
    expect(tx.videoAnalysis.create).toHaveBeenCalled();
  });
});

describe("queueTranscriptFetchForVideo", () => {
  test("marks a video queued and creates a queued job", async () => {
    const tx = createQueueTx();

    const job = await queueTranscriptFetchForVideo(tx, {
      videoId: "video-db-id",
      now: NOW,
    });

    expect(job).toEqual({ id: "job-1" });
    expect(tx.youtubeVideo.update).toHaveBeenCalledWith({
      where: { id: "video-db-id" },
      data: { transcriptStatus: "QUEUED" },
    });
    expect(tx.jobRun.create).toHaveBeenCalledWith({
      data: {
        jobType: "transcript_fetch",
        status: "QUEUED",
        provider: "transcript",
        referenceType: "YoutubeVideo",
        referenceId: "video-db-id",
        attempts: 0,
        maxAttempts: 3,
        metadata: { queuedAt: NOW.toISOString() },
      },
    });
  });
});

describe("runTranscriptFetchJob", () => {
  test("records a successful transcript fetch job", async () => {
    const prisma = createRunnerPrisma();
    const provider = createProvider({
      result: {
        status: "skipped",
        provider: "mock-transcripts",
        reason: "No live transcript provider is configured.",
      },
    });
    const analyzer = createAnalyzer();

    const summary = await runTranscriptFetchJob({
      prisma,
      provider,
      analyzer,
      videoId: "video-db-id",
      now: NOW,
    });

    expect(summary).toMatchObject({
      transcriptStatus: "SKIPPED",
      analysisType: "metadata_only",
      fallbackUsed: true,
    });
    expect(prisma.youtubeVideo.findUnique).toHaveBeenCalledWith({
      where: { id: "video-db-id" },
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
    expect(prisma.jobRun.create).toHaveBeenCalledWith({
      data: {
        jobType: "transcript_fetch",
        status: "RUNNING",
        provider: "mock-transcripts",
        referenceType: "YoutubeVideo",
        referenceId: "video-db-id",
        attempts: 1,
        maxAttempts: 3,
        startedAt: NOW,
        metadata: { youtubeVideoId: "yt-video-1" },
      },
    });
    expect(prisma.jobRun.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "SUCCEEDED",
        completedAt: NOW,
        metadata: {
          youtubeVideoId: "yt-video-1",
          summary,
        },
      },
    });
  });

  test("marks the transcript job failed when analysis throws", async () => {
    const prisma = createRunnerPrisma();
    const provider = createProvider({
      result: {
        status: "unavailable",
        provider: "mock-transcripts",
        reason: "Captions disabled",
      },
    });
    const analyzer: TranscriptAnalyzer = {
      name: "failing-analyzer",
      analyze: vi.fn(async () => {
        throw new Error("analysis unavailable");
      }),
    };

    await expect(
      runTranscriptFetchJob({
        prisma,
        provider,
        analyzer,
        videoId: "video-db-id",
        now: NOW,
      }),
    ).rejects.toThrow("analysis unavailable");

    expect(prisma.jobRun.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "FAILED",
        completedAt: NOW,
        errorMessage: "analysis unavailable",
      },
    });
  });
});

function createPipelineTx(): TranscriptPipelineTx & {
  youtubeVideo: { update: ReturnType<typeof vi.fn> };
  videoTranscript: { upsert: ReturnType<typeof vi.fn> };
  videoAnalysis: { create: ReturnType<typeof vi.fn> };
} {
  return {
    youtubeVideo: {
      update: vi.fn(async () => ({ id: "video-db-id" })),
    },
    videoTranscript: {
      upsert: vi.fn(async () => ({ id: "transcript-1" })),
    },
    videoAnalysis: {
      create: vi.fn(async () => ({ id: "analysis-1" })),
    },
  };
}

function createQueueTx(): TranscriptQueueTx & {
  youtubeVideo: { update: ReturnType<typeof vi.fn> };
  jobRun: { create: ReturnType<typeof vi.fn> };
} {
  return {
    youtubeVideo: {
      update: vi.fn(async () => ({ id: "video-db-id" })),
    },
    jobRun: {
      create: vi.fn(async () => ({ id: "job-1" })),
    },
  };
}

function createRunnerPrisma(): TranscriptRunnerPrisma & {
  youtubeVideo: TranscriptRunnerPrisma["youtubeVideo"] & {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  videoTranscript: { upsert: ReturnType<typeof vi.fn> };
  videoAnalysis: { create: ReturnType<typeof vi.fn> };
  jobRun: TranscriptRunnerPrisma["jobRun"] & {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
} {
  return {
    youtubeVideo: {
      findUnique: vi.fn(async () => createVideo()),
      update: vi.fn(async () => ({ id: "video-db-id" })),
    },
    videoTranscript: {
      upsert: vi.fn(async () => ({ id: "transcript-1" })),
    },
    videoAnalysis: {
      create: vi.fn(async () => ({ id: "analysis-1" })),
    },
    jobRun: {
      create: vi.fn(async () => ({ id: "job-1" })),
      update: vi.fn(async () => ({})),
    },
  };
}

function createProvider(input: {
  result?: TranscriptFetchResult;
  error?: Error;
}): TranscriptProvider & { fetchTranscript: ReturnType<typeof vi.fn> } {
  return {
    name: "mock-transcripts",
    fetchTranscript: vi.fn(async () => {
      if (input.error) {
        throw input.error;
      }

      if (!input.result) {
        throw new Error("Missing transcript result");
      }

      return input.result;
    }),
  };
}

function createAnalyzer(): TranscriptAnalyzer & {
  analyze: ReturnType<typeof vi.fn>;
} {
  return {
    name: "mock-analyzer",
    analyze: vi.fn(async (input: TranscriptAnalysisInput) =>
      createAnalysis(input),
    ),
  };
}

function createAnalysis(
  input: TranscriptAnalysisInput,
): TranscriptAnalysisResult {
  return {
    hook: input.transcriptText ?? input.video.title,
    hookType: "contrarian",
    structure: {
      source: input.source,
      sections: ["hook", "proof", "cta"],
    },
    cta: "Subscribe for weekly AI workflow breakdowns.",
    claims: ["AI agents need workflow design."],
    summary: "A practical AI workflow breakdown.",
    contentPillars: ["AI workflow"],
    model: "mock-analyzer",
  };
}

function createVideo(): TranscriptVideoRecord {
  return {
    id: "video-db-id",
    youtubeVideoId: "yt-video-1",
    title: "Most AI agents fail for boring reasons",
    description: "A breakdown of workflow design mistakes.",
    publishedAt: new Date("2026-05-01T00:00:00Z"),
    durationSeconds: 620,
    thumbnailUrl: "https://img.youtube.com/vi/yt-video-1/hqdefault.jpg",
    tags: ["AI agents", "workflow"],
    categoryId: "28",
    defaultLanguage: "en",
    transcriptStatus: "QUEUED",
  };
}
