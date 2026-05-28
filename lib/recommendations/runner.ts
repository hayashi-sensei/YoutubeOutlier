import { createAiModelRouter, type AiModelRouterPrisma } from "@/lib/ai/model-router";
import { aiTopicRecommendationsSchema } from "@/schemas/ai-recommendations";
import { AI_TASK_TYPES, type RunAiTextTaskInput, type RunAiTextTaskResult } from "@/types/ai";
import { generateTopicRecommendations } from "./generator";
import type {
  GeneratedTopicRecommendation,
  RecommendationBlueprintInput,
  RecommendationGenerationInput,
  RecommendationOutlierInput,
  RecommendationRecentVideoInput,
  RecommendationSourceItemInput,
  TopicRecommendationRunSummary,
} from "../../types/recommendations";

const SOURCE_ITEM_LIMIT = 12;
const VIDEO_LIMIT = 40;
const BLUEPRINT_LIMIT = 8;
const HISTORY_LIMIT = 50;
const PROMPT_OUTLIER_LIMIT = 8;
const PROMPT_RECENT_VIDEO_LIMIT = 5;
const PROMPT_SOURCE_ITEM_LIMIT = 5;
const PROMPT_BLUEPRINT_LIMIT = 2;
const PROMPT_HISTORY_LIMIT = 10;

type WorkspaceSettingsRow = {
  primaryNiche: string;
  targetAudience: string | null;
  brandVoice: string | null;
  contentGoals: string | null;
  topicsToAvoid: string | null;
};

type WorkspaceRow = {
  ownerId: string;
};

type VideoRow = {
  id: string;
  youtubeVideoId: string;
  title: string;
  publishedAt: Date;
  channel: { title: string };
  opportunityScores: Array<{ opportunityScore: number; calculatedAt: Date }>;
  outlierScores: Array<{
    outlierScore: number;
    multiplier: number | null;
    calculatedAt: Date;
  }>;
  analyses: Array<{
    contentPillar: string | null;
    hookType: string | null;
    titlePattern: string | null;
    thumbnailPattern: string | null;
    emotionalAngle: string | null;
    summary: string | null;
  }>;
};

type SourceItemRow = {
  id: string;
  url: string;
  title: string;
  summary: string | null;
  publishedAt: Date | null;
  source: { name: string | null; url: string };
};

type BlueprintRow = {
  channel: { title: string };
  contentPillars: unknown;
  topVideoIds: string[];
  titlePatterns: unknown;
  hookPatterns: unknown;
  thumbnailPatterns: unknown;
  emotionalAngles: unknown;
  averageOutlierScore: number | null;
  updatedAt: Date;
};

type AiGeneratedTopicRecommendation = Omit<GeneratedTopicRecommendation, "evidence"> & {
  evidence: Array<{
    youtubeVideoId?: string | null;
    sourceItemId?: string | null;
    evidenceType: string;
    note: string;
  }>;
};

export type TopicRecommendationRunnerPrisma = {
  $transaction<T>(
    callback: (tx: TopicRecommendationWritePrisma) => Promise<T>,
  ): Promise<T>;
  workspaceSettings: {
    findUnique(input: unknown): Promise<WorkspaceSettingsRow | null>;
  };
  workspace: {
    findUnique(input: unknown): Promise<WorkspaceRow | null>;
  };
  youtubeVideo: {
    findMany(input: unknown): Promise<VideoRow[]>;
  };
  industrySourceItem: {
    findMany(input: unknown): Promise<SourceItemRow[]>;
  };
  competitorBlueprint: {
    findMany(input: unknown): Promise<BlueprintRow[]>;
  };
  contentItem: {
    findMany(input: unknown): Promise<Array<{ title: string; status: string }>>;
  };
  topicRecommendation: {
    findMany(input: unknown): Promise<Array<{ topic: string; status: "NEW" | "SAVED" | "DISMISSED" | "USED" | "EXPIRED" }>>;
    create(input: {
      data: {
        workspaceId: string;
        reportId: string;
        title: string;
        topic: string;
        angle: string;
        whyNow: string;
        audiencePainPoint: string;
        opportunityScore: number;
        suggestedHook: string;
        suggestedTitle: string;
        thumbnailConcept: string;
        outlineJson: { sections: string[] };
        linkedinAngle: string;
        status: "NEW";
        kind: "STANDARD" | "EXPERIMENTAL";
        sourceTrackedChannelId?: string | null;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
  topicRecommendationEvidence: {
    createMany(input: {
      data: Array<{
        recommendationId: string;
        youtubeVideoId?: string;
        sourceItemId?: string;
        evidenceType: string;
        note: string;
      }>;
    }): Promise<{ count: number }>;
  };
  researchReport: {
    create(input: {
      data: {
        workspaceId: string;
        title: string;
        status: "GENERATING";
        reportDate: Date;
        manualRun: boolean;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
    update(input: {
      where: { id: string };
      data: {
        status: "GENERATING" | "COMPLETED" | "FAILED";
        summary?: string;
        sectionsJson?: unknown;
        errorMessage?: string | null;
        generatedAt?: Date;
      };
    }): Promise<{ id: string }>;
  };
};

export type TopicRecommendationAiRouter = {
  runTextTask<TOutput>(input: RunAiTextTaskInput<TOutput>): Promise<RunAiTextTaskResult<TOutput>>;
};

type TopicRecommendationWritePrisma = Pick<
  TopicRecommendationRunnerPrisma,
  "topicRecommendation" | "topicRecommendationEvidence" | "researchReport"
>;

export async function runTopicRecommendationJob(input: {
  prisma: TopicRecommendationRunnerPrisma;
  aiRouter?: TopicRecommendationAiRouter;
  workspaceId: string;
  reportId?: string;
  manualRun?: boolean;
  kind?: "STANDARD" | "EXPERIMENTAL";
  youtubeChannelId?: string;
  sourceTrackedChannelId?: string;
  sourceLabel?: string;
  now?: Date;
}): Promise<TopicRecommendationRunSummary> {
  const now = input.now ?? new Date();
  const kind = input.kind ?? "STANDARD";
  const reportTitle = input.sourceLabel
    ? `${input.sourceLabel} topic ideas for ${dateLabel(now)}`
    : `Research report for ${dateLabel(now)}`;
  const reportId =
    input.reportId ??
    (
      await input.prisma.researchReport.create({
        data: {
          workspaceId: input.workspaceId,
          title: reportTitle,
          status: "GENERATING",
          reportDate: now,
          manualRun: input.manualRun ?? false,
        },
        select: { id: true },
      })
    ).id;

  try {
    const generationInput = await loadGenerationInput(input.prisma, {
      workspaceId: input.workspaceId,
      youtubeChannelId: input.youtubeChannelId,
      now,
    });
    const baselineRecommendations = generateTopicRecommendations(generationInput);
    const aiRouter = input.aiRouter ?? createAiModelRouter({ prisma: input.prisma as unknown as AiModelRouterPrisma });
    const aiResult = await aiRouter.runTextTask({
      workspaceId: input.workspaceId,
      userId: generationInput.workspaceOwnerId,
      taskType: AI_TASK_TYPES.topicRecommendation,
      qualityTier: "standard",
      system: topicRecommendationSystemPrompt(),
      prompt: topicRecommendationPrompt(generationInput, baselineRecommendations, kind),
      schema: aiTopicRecommendationsSchema,
      referenceType: "ResearchReport",
      referenceId: reportId,
      metadata: {
        reportId,
        manualRun: input.manualRun ?? false,
        recommendationKind: kind,
        youtubeChannelId: input.youtubeChannelId ?? null,
        sourceTrackedChannelId: input.sourceTrackedChannelId ?? null,
        sourceLabel: input.sourceLabel ?? null,
      },
    });
    const recommendations = normalizeGeneratedRecommendations(aiResult.output?.recommendations ?? []);

    if (recommendations.length < 5) {
      throw new Error(
        "Not enough evidence to create five topic recommendations. Add competitor outliers, source items, or blueprint signals first.",
      );
    }

    const evidenceCreated = await input.prisma.$transaction(async (tx) => {
      let createdEvidenceCount = 0;

      for (const recommendation of recommendations) {
        const created = await tx.topicRecommendation.create({
          data: {
            workspaceId: input.workspaceId,
            reportId,
            title: recommendation.title,
            topic: recommendation.topic,
            angle: recommendation.angle,
            whyNow: recommendation.whyNow,
            audiencePainPoint: recommendation.audiencePainPoint,
            opportunityScore: recommendation.opportunityScore,
            suggestedHook: recommendation.suggestedHook,
            suggestedTitle: recommendation.suggestedTitle,
            thumbnailConcept: recommendation.thumbnailConcept,
            outlineJson: recommendation.outline,
            linkedinAngle: recommendation.linkedinAngle,
            status: "NEW",
            kind,
            sourceTrackedChannelId: input.sourceTrackedChannelId ?? null,
          },
          select: { id: true },
        });
        const evidenceRows = recommendation.evidence.map((evidence) => ({
          recommendationId: created.id,
          youtubeVideoId: evidence.youtubeVideoId ?? undefined,
          sourceItemId: evidence.sourceItemId ?? undefined,
          evidenceType: evidence.evidenceType,
          note: evidence.note,
        }));
        const result = await tx.topicRecommendationEvidence.createMany({
          data: evidenceRows,
        });
        createdEvidenceCount += result.count;
      }

      await tx.researchReport.update({
        where: { id: reportId },
        data: {
          status: "COMPLETED",
          summary: reportSummary(generationInput, recommendations.length),
          sectionsJson: buildReportSections(generationInput, recommendations),
          errorMessage: null,
          generatedAt: now,
        },
      });

      return createdEvidenceCount;
    });

    return {
      workspaceId: input.workspaceId,
      reportId,
      kind,
      recommendationsCreated: recommendations.length,
      evidenceCreated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Topic recommendation generation failed.";
    await input.prisma.researchReport.update({
      where: { id: reportId },
      data: {
        status: "FAILED",
        errorMessage: message,
      },
    });
    throw error;
  }
}

async function loadGenerationInput(
  prisma: TopicRecommendationRunnerPrisma,
  input: { workspaceId: string; youtubeChannelId?: string; now: Date },
): Promise<RecommendationGenerationInput> {
  const [workspace, settings, videos, sourceItems, blueprints, calendarItems, existingRecommendations] =
    await Promise.all([
      prisma.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { ownerId: true },
      }),
      prisma.workspaceSettings.findUnique({
        where: { workspaceId: input.workspaceId },
        select: {
          primaryNiche: true,
          targetAudience: true,
          brandVoice: true,
          contentGoals: true,
          topicsToAvoid: true,
        },
      }),
      prisma.youtubeVideo.findMany({
        where: {
          ...(input.youtubeChannelId ? { youtubeChannelId: input.youtubeChannelId } : {}),
          channel: {
            trackedBy: {
              some: { workspaceId: input.workspaceId, isActive: true },
            },
          },
        },
        orderBy: [{ publishedAt: "desc" }],
        take: VIDEO_LIMIT,
        select: {
          id: true,
          youtubeVideoId: true,
          title: true,
          publishedAt: true,
          channel: { select: { title: true } },
          opportunityScores: {
            where: { workspaceId: input.workspaceId },
            orderBy: { calculatedAt: "desc" },
            take: 1,
            select: { opportunityScore: true, calculatedAt: true },
          },
          outlierScores: {
            orderBy: { calculatedAt: "desc" },
            take: 1,
            select: { outlierScore: true, multiplier: true, calculatedAt: true },
          },
          analyses: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              contentPillar: true,
              hookType: true,
              titlePattern: true,
              thumbnailPattern: true,
              emotionalAngle: true,
              summary: true,
            },
          },
        },
      }),
      prisma.industrySourceItem.findMany({
        where: {
          source: { workspaceId: input.workspaceId, isActive: true },
        },
        orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
        take: SOURCE_ITEM_LIMIT,
        select: {
          id: true,
          url: true,
          title: true,
          summary: true,
          publishedAt: true,
          source: { select: { name: true, url: true } },
        },
      }),
      prisma.competitorBlueprint.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(input.youtubeChannelId ? { youtubeChannelId: input.youtubeChannelId } : {}),
        },
        orderBy: [{ averageOutlierScore: "desc" }, { updatedAt: "desc" }],
        take: BLUEPRINT_LIMIT,
        select: {
          channel: { select: { title: true } },
          contentPillars: true,
          topVideoIds: true,
          titlePatterns: true,
          hookPatterns: true,
          thumbnailPatterns: true,
          emotionalAngles: true,
          averageOutlierScore: true,
          updatedAt: true,
        },
      }),
      prisma.contentItem.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: [{ createdAt: "desc" }],
        take: HISTORY_LIMIT,
        select: { title: true, status: true },
      }),
      prisma.topicRecommendation.findMany({
        where: {
          workspaceId: input.workspaceId,
          status: { in: ["NEW", "SAVED", "USED"] },
        },
        orderBy: [{ createdAt: "desc" }],
        take: HISTORY_LIMIT,
        select: { topic: true, status: true },
      }),
    ]);

  if (!workspace) {
    throw new Error("Workspace is required to generate topic recommendations.");
  }

  if (!settings) {
    throw new Error("Workspace settings are required to generate topic recommendations.");
  }

  return {
    now: input.now,
    workspaceOwnerId: workspace.ownerId,
    workspace: settings,
    outliers: toOutlierInputs(videos),
    recentVideos: toRecentVideoInputs(videos),
    sourceItems: sourceItems.map(toSourceInput),
    blueprints: blueprints.map(toBlueprintInput),
    calendarItems,
    existingRecommendations,
  };
}

function topicRecommendationSystemPrompt(): string {
  return [
    "You are the YTResearch topic recommendation engine.",
    "Return exactly five evidence-backed topic recommendations as structured data.",
    "Use only the provided evidence IDs. Do not invent youtubeVideoId or sourceItemId values.",
    "For each evidence item, set unavailable youtubeVideoId or sourceItemId fields to null.",
    "Keep topics original and useful; competitor evidence is inspiration, not copy.",
  ].join("\n");
}

function reportSummary(input: RecommendationGenerationInput, recommendationCount: number): string {
  return `Generated ${recommendationCount} evidence-backed topic recommendations for ${input.workspace.primaryNiche}.`;
}

function normalizeGeneratedRecommendations(recommendations: AiGeneratedTopicRecommendation[]): GeneratedTopicRecommendation[] {
  return recommendations.map((recommendation) => ({
    ...recommendation,
    evidence: recommendation.evidence.map((evidence) => ({
      evidenceType: evidence.evidenceType,
      note: evidence.note,
      youtubeVideoId: evidence.youtubeVideoId ?? undefined,
      sourceItemId: evidence.sourceItemId ?? undefined,
    })),
  }));
}

function buildReportSections(
  input: RecommendationGenerationInput,
  recommendations: GeneratedTopicRecommendation[],
) {
  const topOutliers = input.outliers.slice(0, 8);
  const recentVideos = input.recentVideos.slice(0, 10);
  const sourceItems = input.sourceItems.slice(0, 8);
  const clusters = topicClusters(input);

  return {
    executiveSummary: {
      headline: `Research report for ${input.workspace.primaryNiche}`,
      generatedAt: input.now.toISOString(),
      keySignals: [
        `${recentVideos.length} competitor videos analyzed`,
        `${sourceItems.length} industry source items reviewed`,
        `${input.blueprints.length} competitor blueprints included`,
        `${recommendations.length} recommended topics generated`,
      ],
    },
        competitorUploads: recentVideos.map((video) => ({
          youtubeVideoId: video.videoId,
          publicYoutubeVideoId: video.youtubeVideoId,
          youtubeUrl: video.youtubeUrl,
          title: video.title,
      channelTitle: video.channelTitle,
      publishedAt: video.publishedAt.toISOString(),
    })),
    outliers: topOutliers.map((outlier) => ({
      youtubeVideoId: outlier.videoId,
      publicYoutubeVideoId: outlier.youtubeVideoId,
      youtubeUrl: outlier.youtubeUrl,
      title: outlier.title,
      channelTitle: outlier.channelTitle,
      opportunityScore: outlier.opportunityScore,
      outlierScore: outlier.outlierScore,
      multiplier: outlier.multiplier,
      contentPillar: outlier.analysis?.contentPillar ?? null,
      hookType: outlier.analysis?.hookType ?? null,
    })),
    recentTopicClusters: clusters,
    industryNews: sourceItems.map((item) => ({
      sourceItemId: item.sourceItemId,
      url: item.url,
      title: item.title,
      sourceName: item.sourceName,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      summary: item.summary,
    })),
    contentGaps: contentGaps(input, clusters),
    recommendedTopics: recommendations.map((recommendation) => ({
      title: recommendation.title,
      topic: recommendation.topic,
      angle: recommendation.angle,
      whyNow: recommendation.whyNow,
      opportunityScore: recommendation.opportunityScore,
      suggestedTitle: recommendation.suggestedTitle,
      suggestedHook: recommendation.suggestedHook,
      evidenceCount: recommendation.evidence.length,
    })),
    recommendedActions: recommendedActions(recommendations),
  };
}

function topicClusters(input: RecommendationGenerationInput) {
  const counts = new Map<string, { topic: string; count: number; channels: Set<string> }>();

  for (const outlier of input.outliers) {
    const topic = outlier.analysis?.contentPillar ?? outlier.analysis?.hookType ?? outlier.channelTitle;
    const existing = counts.get(topic) ?? { topic, count: 0, channels: new Set<string>() };
    existing.count += 1;
    existing.channels.add(outlier.channelTitle);
    counts.set(topic, existing);
  }

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.topic.localeCompare(right.topic))
    .slice(0, 6)
    .map((cluster) => ({
      topic: cluster.topic,
      signalCount: cluster.count,
      channels: [...cluster.channels].slice(0, 4),
    }));
}

function contentGaps(input: RecommendationGenerationInput, clusters: Array<{ topic: string }>): string[] {
  const gaps: string[] = [];
  const calendarTitles = input.calendarItems.map((item) => item.title.toLowerCase());

  if (input.calendarItems.length === 0) {
    gaps.push("No recent calendar items exist, so every high-signal topic is currently uncovered.");
  }

  for (const cluster of clusters.slice(0, 3)) {
    const normalizedTopic = cluster.topic.toLowerCase();
    const alreadyPlanned = calendarTitles.some((title) => title.includes(normalizedTopic));

    if (!alreadyPlanned) {
      gaps.push(`No planned content currently covers ${cluster.topic}.`);
    }
  }

  return gaps.length > 0 ? gaps : ["Existing calendar coverage overlaps the top research signals."];
}

function recommendedActions(recommendations: GeneratedTopicRecommendation[]): string[] {
  return recommendations.slice(0, 5).map((recommendation, index) =>
    index === 0
      ? `Create an outline for "${recommendation.topic}" first; it has the strongest evidence-backed opportunity.`
      : `Review "${recommendation.topic}" and decide whether to save it to the calendar.`,
  );
}

function topicRecommendationPrompt(
  input: RecommendationGenerationInput,
  baselineRecommendations: GeneratedTopicRecommendation[],
  kind: "STANDARD" | "EXPERIMENTAL",
): string {
  return JSON.stringify(
    {
      workspace: input.workspace,
      now: input.now.toISOString(),
      availableEvidence: {
        outliers: input.outliers.slice(0, PROMPT_OUTLIER_LIMIT).map((outlier) => ({
          youtubeVideoId: outlier.videoId,
          title: truncate(outlier.title, 120),
          channelTitle: truncate(outlier.channelTitle, 60),
          opportunityScore: outlier.opportunityScore,
          outlierScore: outlier.outlierScore,
          multiplier: outlier.multiplier,
          analysis: compactAnalysis(outlier.analysis),
        })),
        recentVideos: input.recentVideos.slice(0, PROMPT_RECENT_VIDEO_LIMIT).map((video) => ({
          youtubeVideoId: video.videoId,
          title: truncate(video.title, 120),
          channelTitle: truncate(video.channelTitle, 60),
          publishedAt: video.publishedAt.toISOString(),
        })),
        sourceItems: input.sourceItems.slice(0, PROMPT_SOURCE_ITEM_LIMIT).map((item) => ({
          sourceItemId: item.sourceItemId,
          title: truncate(item.title, 120),
          sourceName: truncate(item.sourceName, 60),
          publishedAt: item.publishedAt?.toISOString() ?? null,
          summary: truncate(item.summary, 160),
        })),
        blueprints: input.blueprints.slice(0, PROMPT_BLUEPRINT_LIMIT).map((blueprint) => ({
          channelTitle: truncate(blueprint.channelTitle, 60),
          contentPillars: blueprint.contentPillars.slice(0, 3).map((value) => truncate(value, 80)),
          topVideoIds: blueprint.topVideoIds.slice(0, 5),
          titlePatterns: blueprint.titlePatterns.slice(0, 3).map((value) => truncate(value, 80)),
          hookPatterns: blueprint.hookPatterns.slice(0, 3).map((value) => truncate(value, 80)),
          thumbnailPatterns: blueprint.thumbnailPatterns.slice(0, 3).map((value) => truncate(value, 80)),
          emotionalAngles: blueprint.emotionalAngles.slice(0, 3).map((value) => truncate(value, 60)),
          averageOutlierScore: blueprint.averageOutlierScore,
        })),
      },
      avoid: {
        calendarItems: input.calendarItems.slice(0, PROMPT_HISTORY_LIMIT).map((item) => ({
          title: truncate(item.title, 100),
          status: item.status,
        })),
        existingRecommendations: input.existingRecommendations.slice(0, PROMPT_HISTORY_LIMIT).map((recommendation) => ({
          topic: truncate(recommendation.topic, 100),
          status: recommendation.status,
        })),
      },
      baselineRecommendations: baselineRecommendations.map((recommendation) => ({
        title: truncate(recommendation.title, 120),
        topic: truncate(recommendation.topic, 120),
        opportunityScore: recommendation.opportunityScore,
        suggestedTitle: truncate(recommendation.suggestedTitle, 120),
        evidence: recommendation.evidence.slice(0, 3).map((evidence) => ({
          youtubeVideoId: evidence.youtubeVideoId ?? null,
          sourceItemId: evidence.sourceItemId ?? null,
          evidenceType: evidence.evidenceType,
          note: truncate(evidence.note, 120),
        })),
      })),
      mode:
        kind === "EXPERIMENTAL"
          ? "Generate more novel 'Try New Things' ideas: evidence-backed, original, contrarian when useful, format-aware, and less safe than standard recommendations."
          : "Generate standard evidence-backed recommendations.",
    },
  );
}

function compactAnalysis(value: RecommendationOutlierInput["analysis"]) {
  if (!value) {
    return null;
  }

  return {
    contentPillar: truncate(value.contentPillar, 80),
    hookType: truncate(value.hookType, 60),
    titlePattern: truncate(value.titlePattern, 80),
    thumbnailPattern: truncate(value.thumbnailPattern, 80),
    emotionalAngle: truncate(value.emotionalAngle, 60),
    summary: truncate(value.summary, 140),
  };
}

function truncate(value: string | null, maxLength: number): string | null {
  if (!value || value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function toOutlierInputs(videos: VideoRow[]): RecommendationOutlierInput[] {
  return videos
    .filter((video) => video.opportunityScores[0] || video.outlierScores[0])
    .map((video) => ({
      videoId: video.id,
      youtubeVideoId: video.youtubeVideoId,
      youtubeUrl: youtubeWatchUrl(video.youtubeVideoId),
      title: video.title,
      channelTitle: video.channel.title,
      publishedAt: video.publishedAt,
      opportunityScore:
        video.opportunityScores[0]?.opportunityScore ??
        video.outlierScores[0]?.outlierScore ??
        0,
      outlierScore: video.outlierScores[0]?.outlierScore ?? 0,
      multiplier: video.outlierScores[0]?.multiplier ?? null,
      analysis: video.analyses[0] ?? null,
    }))
    .sort(
      (left, right) =>
        right.opportunityScore - left.opportunityScore ||
        right.publishedAt.getTime() - left.publishedAt.getTime(),
    );
}

function toRecentVideoInputs(videos: VideoRow[]): RecommendationRecentVideoInput[] {
  return videos.slice(0, 10).map((video) => ({
    videoId: video.id,
    youtubeVideoId: video.youtubeVideoId,
    youtubeUrl: youtubeWatchUrl(video.youtubeVideoId),
    title: video.title,
    channelTitle: video.channel.title,
    publishedAt: video.publishedAt,
  }));
}

function toSourceInput(row: SourceItemRow): RecommendationSourceItemInput {
  return {
    sourceItemId: row.id,
    url: row.url,
    title: row.title,
    sourceName: row.source.name ?? row.source.url,
    publishedAt: row.publishedAt,
    summary: row.summary,
  };
}

function toBlueprintInput(row: BlueprintRow): RecommendationBlueprintInput {
  return {
    channelTitle: row.channel.title,
    contentPillars: stringArray(row.contentPillars),
    topVideoIds: row.topVideoIds,
    titlePatterns: stringArray(row.titlePatterns),
    hookPatterns: stringArray(row.hookPatterns),
    thumbnailPatterns: stringArray(row.thumbnailPatterns),
    emotionalAngles: stringArray(row.emotionalAngles),
    averageOutlierScore: row.averageOutlierScore ?? 0,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function dateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

function youtubeWatchUrl(youtubeVideoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeVideoId)}`;
}
