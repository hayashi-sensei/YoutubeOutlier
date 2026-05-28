import type {
  BlueprintObservation,
  BlueprintVideoAnalysisInput,
  CompetitorBlueprintSummary,
} from "../../types/blueprints";

export function analyzeBlueprintVideo(
  video: BlueprintVideoAnalysisInput,
): BlueprintObservation {
  const structurePattern = summarizeStructure(video.analysis?.structureJson);
  const titlePattern = fallback(
    video.analysis?.titlePattern,
    inferTitlePattern(video.title),
  );
  const hookPattern = fallback(video.analysis?.hookType, "metadata-led hook");
  const thumbnailPattern = fallback(
    video.analysis?.thumbnailPattern,
    "thumbnail pattern unavailable",
  );
  const contentPillar = fallback(
    video.analysis?.contentPillar,
    firstUsefulTopic(video.title),
  );
  const ctaPattern = fallback(
    video.analysis?.ctaPattern,
    "soft subscribe or resource CTA",
  );
  const emotionalAngle = fallback(
    video.analysis?.emotionalAngle,
    "practical confidence",
  );
  const productionNotes = inferProductionNotes(video, thumbnailPattern);
  const reusableInsight = sanitizePatternLanguage(
    `Use the pattern "${titlePattern}" with a ${hookPattern} opening, a ${structurePattern} structure, and a ${emotionalAngle} angle.`,
    [video.title],
  );

  return {
    videoId: video.videoId,
    youtubeVideoId: video.youtubeVideoId,
    titlePattern,
    hookPattern,
    thumbnailPattern,
    contentPillar,
    structurePattern,
    ctaPattern,
    emotionalAngle,
    videoFormat: inferVideoFormat(video.title, structurePattern),
    productionNotes,
    reusableInsight,
    outlierScore: video.outlierScore,
    opportunityScore: video.opportunityScore,
    multiplier: video.multiplier,
  };
}

export function buildBlueprintSummary(input: {
  workspaceId: string;
  youtubeChannelId: string;
  channelTitle: string;
  videos: BlueprintVideoAnalysisInput[];
  now?: Date;
}): CompetitorBlueprintSummary {
  const observations = input.videos.map(analyzeBlueprintVideo);

  return {
    workspaceId: input.workspaceId,
    youtubeChannelId: input.youtubeChannelId,
    channelTitle: input.channelTitle,
    videoCount: observations.length,
    averageOutlierScore: average(observations.map((item) => item.outlierScore)),
    titlePatterns: uniqueTop(observations.map((item) => item.titlePattern)),
    hookPatterns: uniqueTop(observations.map((item) => item.hookPattern)),
    thumbnailPatterns: uniqueTop(
      observations.map((item) => item.thumbnailPattern),
    ),
    contentPillars: uniqueTop(observations.map((item) => item.contentPillar)),
    structurePatterns: uniqueTop(
      observations.map((item) => item.structurePattern),
    ),
    ctaPatterns: uniqueTop(observations.map((item) => item.ctaPattern)),
    emotionalAngles: uniqueTop(
      observations.map((item) => item.emotionalAngle),
    ),
    observations,
    generatedAt: input.now ?? new Date(),
  };
}

export function sanitizePatternLanguage(
  value: string,
  blockedPhrases: string[],
): string {
  return blockedPhrases.reduce((current, phrase) => {
    if (phrase.trim().length === 0) {
      return current;
    }

    return current.replaceAll(phrase, "[competitor wording removed]");
  }, value);
}

function summarizeStructure(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "hook, proof, breakdown, takeaway";
  }

  const maybeStructure = "structure" in value
    ? (value as { structure?: unknown }).structure
    : undefined;
  if (!Array.isArray(maybeStructure)) {
    return "hook, proof, breakdown, takeaway";
  }

  const labels = maybeStructure
    .map((item) =>
      item && typeof item === "object" && "label" in item
        ? String((item as { label: unknown }).label)
        : "",
    )
    .map((label) => label.trim())
    .filter((label) => label.length > 0);

  return labels.length > 0
    ? labels.join(" -> ")
    : "hook, proof, breakdown, takeaway";
}

function inferTitlePattern(title: string): string {
  if (/^how\b/i.test(title)) {
    return "How to achieve X with Y";
  }
  if (/\bi built\b/i.test(title)) {
    return "I built X that creates Y";
  }
  if (/\b\d+\b/u.test(title)) {
    return "Numbered system or list";
  }

  return "Outcome-led title";
}

function inferVideoFormat(title: string, structurePattern: string): string {
  if (/\bi built\b/i.test(title)) {
    return "case study";
  }
  if (/how\b/i.test(title)) {
    return "tutorial";
  }
  if (structurePattern.toLowerCase().includes("problem")) {
    return "problem-solution breakdown";
  }

  return "strategic explainer";
}

function inferProductionNotes(
  video: BlueprintVideoAnalysisInput,
  thumbnailPattern: string,
): string {
  const multiplier = video.multiplier
    ? `${video.multiplier.toFixed(1)}x lift`
    : "strong lift";
  return `${video.channelTitle} used ${thumbnailPattern}; prioritize clear visual contrast and proof of outcome (${multiplier}).`;
}

function firstUsefulTopic(title: string): string {
  return (
    title.split(/[^a-z0-9]+/i).find((term) => term.length > 3) ??
    "general strategy"
  );
}

function fallback(value: string | null | undefined, fallbackValue: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallbackValue;
}

function uniqueTop(values: string[], limit = 5): string[] {
  return [
    ...new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  ].slice(0, limit);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return (
    Math.round(
      (values.reduce((total, value) => total + value, 0) / values.length) * 10,
    ) / 10
  );
}
