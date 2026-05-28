import { describe, expect, test, vi } from "vitest";

import { runTopicRecommendationJob, type TopicRecommendationAiRouter } from "../../lib/recommendations/runner";
import type { RunAiTextTaskInput, RunAiTextTaskResult } from "../../types/ai";

const NOW = new Date("2026-05-18T00:00:00Z");

describe("runTopicRecommendationJob", () => {
  test("creates a completed report with at least five cited topic recommendations", async () => {
    const prisma = createRunnerPrisma();
    const aiRouter = createAiRouter();

    const summary = await runTopicRecommendationJob({
      prisma,
      aiRouter,
      workspaceId: "workspace-1",
      manualRun: true,
      now: NOW,
    });

    expect(summary).toEqual({
      workspaceId: "workspace-1",
      reportId: "report-1",
      kind: "STANDARD",
      recommendationsCreated: 5,
      evidenceCreated: 7,
    });
    expect(prisma.researchReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "workspace-1",
          status: "GENERATING",
          manualRun: true,
        }),
      }),
    );
    expect(prisma.youtubeVideo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ publishedAt: "desc" }],
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(aiRouter.calls[0]).toEqual(
      expect.objectContaining({
        workspaceId: "workspace-1",
        userId: "user-1",
        taskType: "topic_recommendation",
        referenceType: "ResearchReport",
        referenceId: "report-1",
      }),
    );
    expect(prisma.transaction.topicRecommendation.create).toHaveBeenCalledTimes(5);
    expect(prisma.transaction.topicRecommendation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "STANDARD" }),
      }),
    );
    expect(prisma.transaction.topicRecommendationEvidence.createMany).toHaveBeenCalledTimes(5);
    expect(prisma.transaction.researchReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "report-1" },
        data: expect.objectContaining({
          status: "COMPLETED",
          generatedAt: NOW,
        }),
      }),
    );
  });

  test("stores full report sections with competitor, source, gap, topic, and action context", async () => {
    const prisma = createRunnerPrisma();

    await runTopicRecommendationJob({
      prisma,
      aiRouter: createAiRouter(),
      workspaceId: "workspace-1",
      manualRun: true,
      now: NOW,
    });

    expect(prisma.transaction.researchReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "report-1" },
        data: expect.objectContaining({
          summary: "Generated 5 evidence-backed topic recommendations for AI, AI automation, and digital marketing.",
          sectionsJson: {
            executiveSummary: expect.objectContaining({
              headline: "Research report for AI, AI automation, and digital marketing",
              keySignals: expect.arrayContaining([
                "3 competitor videos analyzed",
                "2 industry source items reviewed",
                "1 competitor blueprints included",
              ]),
            }),
            competitorUploads: expect.arrayContaining([
              expect.objectContaining({
                youtubeVideoId: "video-agent",
                youtubeUrl: "https://www.youtube.com/watch?v=yt-video-agent",
                title: "I Built 7 AI Agents That Run My Business",
                channelTitle: "AI Automation Lab",
              }),
            ]),
            outliers: expect.arrayContaining([
              expect.objectContaining({
                youtubeVideoId: "video-agent",
                youtubeUrl: "https://www.youtube.com/watch?v=yt-video-agent",
                opportunityScore: 96,
                multiplier: 4.8,
              }),
            ]),
            recentTopicClusters: expect.arrayContaining([
              expect.objectContaining({
                topic: "AI agent workflow implementation",
              }),
            ]),
            industryNews: expect.arrayContaining([
              expect.objectContaining({
                sourceItemId: "source-1",
                title: "New agent workflow update announced",
                url: "https://openai.com/news/agent-workflow-update",
              }),
            ]),
            contentGaps: expect.arrayContaining([
              expect.stringContaining("No recent calendar items"),
            ]),
            recommendedTopics: expect.arrayContaining([
              expect.objectContaining({
                topic: "AI agent workflow implementation",
                evidenceCount: 2,
              }),
            ]),
            recommendedActions: expect.arrayContaining([
              expect.stringContaining("Create an outline"),
            ]),
          },
        }),
      }),
    );
  });

  test("does not leave partial recommendations when evidence writing fails", async () => {
    const prisma = createRunnerPrisma({ failEvidenceWrite: true });

    await expect(
      runTopicRecommendationJob({
        prisma,
        aiRouter: createAiRouter(),
        workspaceId: "workspace-1",
        manualRun: true,
        now: NOW,
      }),
    ).rejects.toThrow("evidence write failed");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.topicRecommendation.create).not.toHaveBeenCalled();
    expect(prisma.topicRecommendationEvidence.createMany).not.toHaveBeenCalled();
    expect(prisma.researchReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "report-1" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "evidence write failed",
        }),
      }),
    );
  });

  test("marks the report failed when not enough evidence exists", async () => {
    const prisma = createRunnerPrisma({ emptyEvidence: true });

    await expect(
      runTopicRecommendationJob({
        prisma,
        aiRouter: createAiRouter({ emptyOutput: true }),
        workspaceId: "workspace-1",
        manualRun: true,
        now: NOW,
      }),
    ).rejects.toThrow("Not enough evidence");

    expect(prisma.topicRecommendation.create).not.toHaveBeenCalled();
    expect(prisma.researchReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "report-1" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: expect.stringContaining("Not enough evidence"),
        }),
      }),
    );
  });

  test("compresses evidence and history before sending the prompt to AI", async () => {
    const prisma = createRunnerPrisma({ noisyEvidence: true });
    const aiRouter = createAiRouter();

    await runTopicRecommendationJob({
      prisma,
      aiRouter,
      workspaceId: "workspace-1",
      manualRun: true,
      now: NOW,
    });

    const prompt = JSON.parse(aiRouter.calls[0].prompt) as {
      availableEvidence: {
        outliers: unknown[];
        recentVideos: unknown[];
        sourceItems: unknown[];
        blueprints: unknown[];
      };
      avoid: {
        calendarItems: unknown[];
        existingRecommendations: unknown[];
      };
    };

    expect(prompt.availableEvidence.outliers).toHaveLength(8);
    expect(prompt.availableEvidence.recentVideos).toHaveLength(5);
    expect(prompt.availableEvidence.sourceItems).toHaveLength(5);
    expect(prompt.availableEvidence.blueprints).toHaveLength(2);
    expect(prompt.avoid.calendarItems).toHaveLength(10);
    expect(prompt.avoid.existingRecommendations).toHaveLength(10);
    expect(aiRouter.calls[0].prompt.length).toBeLessThan(20_000);
  });

  test("marks experimental recommendations and prompts for try-new-things ideas", async () => {
    const prisma = createRunnerPrisma();
    const aiRouter = createAiRouter();

    const summary = await runTopicRecommendationJob({
      prisma,
      aiRouter,
      workspaceId: "workspace-1",
      manualRun: true,
      kind: "EXPERIMENTAL",
      now: NOW,
    });
    const prompt = JSON.parse(aiRouter.calls[0].prompt) as { mode: string };

    expect(summary.kind).toBe("EXPERIMENTAL");
    expect(prompt.mode).toContain("Try New Things");
    expect(aiRouter.calls[0].metadata).toMatchObject({ recommendationKind: "EXPERIMENTAL" });
    expect(prisma.transaction.topicRecommendation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "EXPERIMENTAL" }),
      }),
    );
  });

  test("can generate recommendations from a single competitor channel", async () => {
    const prisma = createRunnerPrisma();
    const aiRouter = createAiRouter();

    const summary = await runTopicRecommendationJob({
      prisma,
      aiRouter,
      workspaceId: "workspace-1",
      manualRun: true,
      youtubeChannelId: "channel-1",
      sourceTrackedChannelId: "tracked-1",
      sourceLabel: "AI Automation Lab",
      now: NOW,
    });

    expect(summary.recommendationsCreated).toBe(5);
    expect(prisma.researchReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "AI Automation Lab topic ideas for May 18, 2026",
        }),
      }),
    );
    expect(prisma.youtubeVideo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          youtubeChannelId: "channel-1",
        }),
      }),
    );
    expect(prisma.competitorBlueprint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace-1",
          youtubeChannelId: "channel-1",
        }),
      }),
    );
    expect(prisma.competitorBlueprint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ averageOutlierScore: "desc" }, { updatedAt: "desc" }],
      }),
    );
    expect(aiRouter.calls[0].metadata).toMatchObject({
      youtubeChannelId: "channel-1",
      sourceTrackedChannelId: "tracked-1",
      sourceLabel: "AI Automation Lab",
    });
    expect(prisma.transaction.topicRecommendation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceTrackedChannelId: "tracked-1",
        }),
      }),
    );
  });
});

function createRunnerPrisma(input: { emptyEvidence?: boolean; failEvidenceWrite?: boolean; noisyEvidence?: boolean } = {}) {
  const transaction = {
    topicRecommendation: {
      create: vi.fn(async ({ data }) => ({ id: `${data.topic}-id` })),
    },
    topicRecommendationEvidence: {
      createMany: vi.fn(async ({ data }) => {
        if (input.failEvidenceWrite) {
          throw new Error("evidence write failed");
        }

        return { count: data.length };
      }),
    },
    researchReport: {
      update: vi.fn(async () => ({ id: "report-1" })),
    },
  };
  return {
    transaction,
    $transaction: vi.fn(async (callback) => callback(transaction)),
    workspace: {
      findUnique: vi.fn(async () => ({ ownerId: "user-1" })),
    },
    workspaceSettings: {
      findUnique: vi.fn(async () => ({
        primaryNiche: "AI, AI automation, and digital marketing",
        targetAudience: "Creators and B2B SaaS marketers",
        brandVoice: "Direct, strategic, practical, evidence-led",
        contentGoals: "Build authority",
        topicsToAvoid: null,
      })),
    },
    youtubeVideo: {
      findMany: vi.fn(async () =>
        input.emptyEvidence
          ? []
          : input.noisyEvidence
            ? Array.from({ length: 40 }, (_, index) =>
                video(
                  `video-${index}`,
                  `A very long AI operations case study title ${index} ${"with workflow proof ".repeat(12)}`,
                  99 - index,
                  `AI operating system pillar ${index} ${"repeatable automation pattern ".repeat(8)}`,
                ),
              )
          : [
              video("video-agent", "I Built 7 AI Agents That Run My Business", 96, "AI agent workflow implementation"),
              video("video-linkedin", "The LinkedIn AI System I Use Every Morning", 88, "Founder-led AI content systems"),
              video("video-automation", "No-Code Automations That Save 10 Hours a Week", 82, "No-code automation workflows"),
            ],
      ),
    },
    industrySourceItem: {
      findMany: vi.fn(async () =>
        input.emptyEvidence
          ? []
          : input.noisyEvidence
            ? Array.from({ length: 12 }, (_, index) => ({
                id: `source-${index}`,
                title: `Extensive AI industry research source ${index} ${"market movement ".repeat(12)}`,
                url: `https://example.com/source-${index}`,
                summary: `Long research summary ${index}. ${"Teams are turning AI experiments into durable weekly operating systems. ".repeat(12)}`,
                publishedAt: new Date("2026-05-17T00:00:00Z"),
                source: { name: `Research Source ${index} ${"Daily ".repeat(8)}`, url: "https://example.com" },
              }))
          : [
              {
                id: "source-1",
                title: "New agent workflow update announced",
                url: "https://openai.com/news/agent-workflow-update",
                summary: "Practical agent adoption is accelerating.",
                publishedAt: new Date("2026-05-17T00:00:00Z"),
                source: { name: "OpenAI Blog", url: "https://openai.com/news/" },
              },
              {
                id: "source-2",
                title: "Marketers move AI from experiments to operating systems",
                url: "https://example.com/ai-operating-systems",
                summary: "Teams want repeatable AI operating systems.",
                publishedAt: new Date("2026-05-15T00:00:00Z"),
                source: { name: "Marketing Tech Daily", url: "https://example.com" },
              },
            ],
      ),
    },
    competitorBlueprint: {
      findMany: vi.fn(async () =>
        input.emptyEvidence
          ? []
          : input.noisyEvidence
            ? Array.from({ length: 8 }, (_, index) => ({
                channel: { title: `AI Automation Lab ${index} ${"Strategy ".repeat(8)}` },
                contentPillars: Array.from({ length: 12 }, (_, itemIndex) => `Pillar ${itemIndex} ${"repeatable creator workflow ".repeat(6)}`),
                topVideoIds: Array.from({ length: 12 }, (_, itemIndex) => `video-${itemIndex}`),
                titlePatterns: Array.from({ length: 12 }, (_, itemIndex) => `Title pattern ${itemIndex} ${"I built a system that ".repeat(6)}`),
                hookPatterns: Array.from({ length: 12 }, (_, itemIndex) => `Hook pattern ${itemIndex} ${"proof before explanation ".repeat(6)}`),
                thumbnailPatterns: Array.from({ length: 12 }, (_, itemIndex) => `Thumbnail pattern ${itemIndex} ${"dashboard plus result ".repeat(6)}`),
                emotionalAngles: Array.from({ length: 12 }, (_, itemIndex) => `Angle ${itemIndex} ${"confidence and clarity ".repeat(6)}`),
                averageOutlierScore: 88 - index,
                updatedAt: new Date(`2026-05-${String(18 - index).padStart(2, "0")}T00:00:00Z`),
              }))
          : [
              {
                channel: { title: "AI Automation Lab" },
                contentPillars: ["AI agent workflow implementation", "No-code automation workflows"],
                topVideoIds: ["video-agent", "video-automation"],
                titlePatterns: ["I built X that does Y"],
                hookPatterns: ["proof first"],
                thumbnailPatterns: ["dashboard proof"],
                emotionalAngles: ["confidence"],
                averageOutlierScore: 88,
                updatedAt: new Date("2026-05-18T00:00:00Z"),
              },
            ],
      ),
    },
    contentItem: {
      findMany: vi.fn(async () =>
        input.noisyEvidence
          ? Array.from({ length: 50 }, (_, index) => ({
              title: `Existing calendar topic ${index} ${"AI workflow operating system ".repeat(8)}`,
              status: index % 2 === 0 ? "DRAFT" : "PUBLISHED",
            }))
          : [],
      ),
    },
    topicRecommendation: {
      findMany: vi.fn(async () =>
        input.noisyEvidence
          ? Array.from({ length: 50 }, (_, index) => ({
              topic: `Existing recommendation topic ${index} ${"automation workflow idea ".repeat(8)}`,
              status: index % 2 === 0 ? ("NEW" as const) : ("USED" as const),
            }))
          : [],
      ),
      create: vi.fn(async ({ data }) => ({ id: `${data.topic}-id` })),
    },
    topicRecommendationEvidence: {
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
    researchReport: {
      create: vi.fn(async () => ({ id: "report-1" })),
      update: vi.fn(async () => ({ id: "report-1" })),
    },
  };
}

function createAiRouter(input: { emptyOutput?: boolean } = {}): TopicRecommendationAiRouter & {
  calls: Array<RunAiTextTaskInput<unknown>>;
} {
  const calls: Array<RunAiTextTaskInput<unknown>> = [];

  async function runTextTask<TOutput>(
    taskInput: RunAiTextTaskInput<TOutput>,
  ): Promise<RunAiTextTaskResult<TOutput>> {
    calls.push(taskInput as RunAiTextTaskInput<unknown>);
    const parsed = JSON.parse(taskInput.prompt) as { baselineRecommendations?: unknown };
    const recommendations = Array.isArray(parsed.baselineRecommendations)
      ? parsed.baselineRecommendations.map((recommendation, index) => recommendationFromSeed(recommendation, index))
      : [];
    return {
      generationId: "generation-1",
      provider: "openai",
      model: "gpt-5.4",
      creditsCharged: 2,
      costUsd: 0.03,
      text: "",
      output: {
        recommendations: input.emptyOutput ? [] : recommendations,
      } as TOutput,
      usage: { inputTokens: 100, outputTokens: 200 },
    };
  }

  return {
    runTextTask,
    calls,
  };
}

function recommendationFromSeed(seed: unknown, index: number) {
  const recommendation = seed as {
    title?: string;
    topic?: string;
    opportunityScore?: number;
    suggestedTitle?: string;
    evidence?: Array<{
      youtubeVideoId?: string | null;
      sourceItemId?: string | null;
      evidenceType?: string;
      note?: string;
    }>;
  };
  const topic = recommendation.topic ?? `Generated topic ${index + 1}`;

  return {
    title: recommendation.title ?? topic,
    topic,
    angle: `Turn ${topic} into a useful evidence-backed workflow.`,
    whyNow: "The available evidence shows timely audience demand.",
    audiencePainPoint: `The audience needs a clearer practical path through ${topic}.`,
    opportunityScore: recommendation.opportunityScore ?? 75,
    suggestedTitle: recommendation.suggestedTitle ?? `The Practical Guide to ${topic}`,
    suggestedHook: `This breakdown shows what is working now for ${topic}.`,
    thumbnailConcept: "Clear topic label with one proof point.",
    outline: {
      sections: ["Evidence signal", "Why now", "Practical workflow", "Common mistake", "Next action"],
    },
    linkedinAngle: `A concise operator post about ${topic}.`,
    evidence:
      recommendation.evidence?.map((item) => ({
        youtubeVideoId: item.youtubeVideoId ?? undefined,
        sourceItemId: item.sourceItemId ?? undefined,
        evidenceType: item.evidenceType ?? "competitor_outlier",
        note: item.note ?? "Evidence signal.",
      })) ?? [],
  };
}

function video(id: string, title: string, opportunityScore: number, contentPillar: string) {
  return {
    id,
    youtubeVideoId: `yt-${id}`,
    title,
    publishedAt: new Date("2026-05-10T00:00:00Z"),
    channel: { title: "AI Automation Lab" },
    opportunityScores: [{ opportunityScore, calculatedAt: NOW }],
    outlierScores: [
      {
        outlierScore: opportunityScore - 4,
        multiplier: 4.8,
        calculatedAt: NOW,
      },
    ],
    analyses: [
      {
        contentPillar,
        hookType: "proof first",
        titlePattern: "I built X that does Y",
        thumbnailPattern: "dashboard proof",
        emotionalAngle: "confidence",
        summary: "Strong competitor signal.",
      },
    ],
  };
}
