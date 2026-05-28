import { z } from "zod";

import { createAiModelRouter, type AiModelRouterPrisma } from "@/lib/ai/model-router";
import { AI_TASK_TYPES, type AiTextExecutor } from "@/types/ai";

export type CompetitorTrendInput = {
  title: string;
  channelTitle: string;
  publishedAt?: Date | string | null;
};

export type CompetitorTrendInsight = {
  title: string;
  summary: string;
  videoCount: number;
  channelCount: number;
  supportingTitles: string[];
};

const MAX_TRENDS = 5;
const MAX_SUPPORTING_TITLES = 3;
const SHORT_SIGNAL_WORDS = new Set(["ai"]);
const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "best",
  "build",
  "built",
  "channel",
  "channels",
  "complete",
  "day",
  "days",
  "easy",
  "every",
  "faceless",
  "follow",
  "free",
  "from",
  "full",
  "guide",
  "into",
  "latest",
  "make",
  "making",
  "more",
  "that",
  "this",
  "tour",
  "using",
  "video",
  "videos",
  "with",
  "workflow",
  "workflows",
  "your",
]);

const competitorTrendAnalysisSchema = z.object({
  trends: z.array(
    z.object({
      title: z.string().min(1),
      summary: z.string().min(1),
      videoCount: z.number().int().nonnegative(),
      channelCount: z.number().int().nonnegative(),
      supportingTitles: z.array(z.string().min(1)).max(MAX_SUPPORTING_TITLES),
    }),
  ).max(MAX_TRENDS),
});

type CompetitorTrendAnalysisOutput = z.infer<typeof competitorTrendAnalysisSchema>;

export async function generateCompetitorTrendInsights(input: {
  prisma: AiModelRouterPrisma;
  workspaceId: string;
  userId?: string | null;
  reportId: string;
  videos: CompetitorTrendInput[];
  textExecutor?: AiTextExecutor;
  now?: Date;
}): Promise<CompetitorTrendInsight[]> {
  const cleanedVideos = input.videos
    .map((video) => ({
      title: video.title.trim(),
      channelTitle: video.channelTitle.trim() || "Unknown channel",
      publishedAt: video.publishedAt ?? null,
    }))
    .filter((video) => video.title.length > 0);

  if (cleanedVideos.length === 0) {
    return [];
  }

  const fallback = buildCompetitorTrendInsights(cleanedVideos);
  const router = createAiModelRouter({
    prisma: input.prisma,
    textExecutor: input.textExecutor,
    now: input.now ? () => input.now ?? new Date() : undefined,
  });

  try {
    const result = await router.runTextTask<CompetitorTrendAnalysisOutput>({
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      taskType: AI_TASK_TYPES.reportTrendAnalysis,
      qualityTier: "standard",
      referenceType: "ResearchReport",
      referenceId: input.reportId,
      metadata: {
        reportId: input.reportId,
        competitorVideoCount: cleanedVideos.length,
        fallbackTrendCount: fallback.length,
      },
      schema: competitorTrendAnalysisSchema,
      system: [
        "You analyze fresh competitor YouTube uploads for a daily research report.",
        "Group the uploaded video headlines into up to five concrete audience-facing trends.",
        "Prefer useful editorial themes, pain points, formats, or demand signals over generic keywords.",
        "Use only the supplied titles and channel names. Do not invent videos, channels, or metrics.",
      ].join("\n"),
      prompt: [
        "Find the top competitor trends from these same-day uploads.",
        "Return concise trend titles, a one-sentence summary, counts, and up to three supporting video titles.",
        "",
        ...cleanedVideos.map((video, index) => `${index + 1}. ${video.title} - ${video.channelTitle}${formatPublishedAt(video.publishedAt)}`),
      ].join("\n"),
    });

    return normalizeAiTrends(result.output?.trends ?? [], fallback);
  } catch {
    return fallback;
  }
}

export function buildCompetitorTrendInsights(videos: CompetitorTrendInput[]): CompetitorTrendInsight[] {
  const candidates = new Map<
    string,
    {
      phrase: string;
      titles: string[];
      channels: Set<string>;
    }
  >();

  for (const video of videos) {
    const title = video.title.trim();
    if (!title) {
      continue;
    }

    const phrases = new Set(candidatePhrases(title));
    for (const phrase of phrases) {
      const existing = candidates.get(phrase) ?? {
        phrase,
        titles: [],
        channels: new Set<string>(),
      };
      existing.titles.push(title);
      existing.channels.add(video.channelTitle);
      candidates.set(phrase, existing);
    }
  }

  return [...candidates.values()]
    .filter((candidate) => candidate.titles.length > 0)
    .sort((first, second) => trendScore(second) - trendScore(first) || first.phrase.localeCompare(second.phrase))
    .slice(0, MAX_TRENDS)
    .map((candidate) => ({
      title: titleCase(candidate.phrase),
      summary: `${candidate.titles.length} competitor upload${candidate.titles.length === 1 ? "" : "s"} point to ${candidate.phrase}.`,
      videoCount: candidate.titles.length,
      channelCount: candidate.channels.size,
      supportingTitles: candidate.titles.slice(0, MAX_SUPPORTING_TITLES),
    }));
}

function normalizeAiTrends(
  trends: CompetitorTrendAnalysisOutput["trends"],
  fallback: CompetitorTrendInsight[],
): CompetitorTrendInsight[] {
  const normalized = trends
    .map((trend) => ({
      title: trend.title.trim(),
      summary: trend.summary.trim(),
      videoCount: Math.max(0, Math.trunc(trend.videoCount)),
      channelCount: Math.max(0, Math.trunc(trend.channelCount)),
      supportingTitles: trend.supportingTitles
        .map((title) => title.trim())
        .filter((title) => title.length > 0)
        .slice(0, MAX_SUPPORTING_TITLES),
    }))
    .filter((trend) => trend.title.length > 0 && trend.summary.length > 0)
    .slice(0, MAX_TRENDS);

  return normalized.length > 0 ? normalized : fallback;
}

function formatPublishedAt(value: Date | string | null): string {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return ` (${date.toISOString()})`;
}

function candidatePhrases(title: string): string[] {
  const words = normalizedWords(title);
  const phrases = new Set<string>();

  for (const word of words) {
    if (!STOP_WORDS.has(word) && word.length >= 4) {
      phrases.add(word);
    }
  }

  for (let index = 0; index < words.length - 1; index += 1) {
    const phraseWords = words.slice(index, index + 2);
    if (
      phraseWords.some((word) => STOP_WORDS.has(word)) ||
      phraseWords.some((word) => word.length < 3 && !SHORT_SIGNAL_WORDS.has(word))
    ) {
      continue;
    }
    phrases.add(phraseWords.join(" "));
  }

  return [...phrases];
}

function normalizedWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(normalizeWord)
    .filter((word) => word.length > 0);
}

function normalizeWord(word: string): string {
  if (word.endsWith("ies") && word.length > 4) {
    return `${word.slice(0, -3)}y`;
  }
  if (word.endsWith("s") && word.length > 4) {
    return word.slice(0, -1);
  }
  return word;
}

function trendScore(candidate: { titles: string[]; channels: Set<string>; phrase: string }): number {
  return candidate.titles.length * 10 + candidate.channels.size * 3 + candidate.phrase.split(" ").length;
}

function titleCase(value: string): string {
  if (value === "ai agent") {
    return "AI Agents";
  }

  return value
    .split(" ")
    .map((part) => (part === "ai" ? "AI" : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}
