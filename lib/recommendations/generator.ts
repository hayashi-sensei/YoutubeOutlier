import type {
  GeneratedRecommendationEvidence,
  GeneratedTopicRecommendation,
  RecommendationGenerationInput,
  RecommendationOutlierInput,
} from "../../types/recommendations";

const TARGET_RECOMMENDATION_COUNT = 5;

type Candidate = GeneratedTopicRecommendation & {
  sourceRank: number;
};

export function generateTopicRecommendations(
  input: RecommendationGenerationInput,
): GeneratedTopicRecommendation[] {
  const existingTopics = new Set(
    [
      ...input.calendarItems.map((item) => item.title),
      ...input.existingRecommendations
        .filter((item) => item.status !== "DISMISSED")
        .map((item) => item.topic),
    ].map(normalizeTopic),
  );
  const blockedTerms = splitBlockedTerms(input.workspace.topicsToAvoid);
  const candidates = [
    ...outlierCandidates(input),
    ...sourceCandidates(input),
    ...blueprintCandidates(input),
    ...recentVideoCandidates(input),
    ...fallbackCandidates(input),
  ];

  const selected: GeneratedTopicRecommendation[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates.sort(sortCandidates)) {
    const key = normalizeTopic(candidate.topic);
    if (seen.has(key) || existingTopics.has(key) || isBlocked(candidate.topic, blockedTerms)) {
      continue;
    }
    if (!hasLinkableEvidence(candidate.evidence)) {
      continue;
    }

    seen.add(key);
    selected.push(withoutRank(candidate));

    if (selected.length === TARGET_RECOMMENDATION_COUNT) {
      return selected;
    }
  }

  return selected;
}

function outlierCandidates(input: RecommendationGenerationInput): Candidate[] {
  return input.outliers.map((outlier, index) => {
    const topic = topicFromOutlier(outlier);
    const blueprint = matchingBlueprint(input, topic);
    const score = clampScore((outlier.opportunityScore || outlier.outlierScore) - 2);
    const sourceEvidence = matchingSourceEvidence(input, topic);

    return buildCandidate({
      input,
      topic,
      score,
      sourceRank: index,
      evidence: [
        {
          youtubeVideoId: outlier.videoId,
          evidenceType: "competitor_outlier",
          note: `${outlier.channelTitle} outperformed its baseline with "${outlier.title}" (${formatMultiplier(outlier.multiplier)}).`,
        },
        ...sourceEvidence,
      ],
      titlePattern: outlier.analysis?.titlePattern ?? blueprint?.titlePatterns[0] ?? "proof-first breakdown",
      hookType: outlier.analysis?.hookType ?? blueprint?.hookPatterns[0] ?? "evidence-led opening",
      thumbnailPattern:
        outlier.analysis?.thumbnailPattern ?? blueprint?.thumbnailPatterns[0] ?? "clear before/after dashboard",
      emotionalAngle: outlier.analysis?.emotionalAngle ?? blueprint?.emotionalAngles[0] ?? "clarity",
    });
  });
}

function sourceCandidates(input: RecommendationGenerationInput): Candidate[] {
  return input.sourceItems.map((item, index) => {
    const topic = inferSourceTopic(item.title, input.workspace.primaryNiche);
    return buildCandidate({
      input,
      topic,
      score: clampScore(82 - index * 3),
      sourceRank: 30 + index,
      evidence: [
        {
          sourceItemId: item.sourceItemId,
          evidenceType: "industry_source",
          note: `${item.sourceName} published "${item.title}".`,
        },
      ],
      titlePattern: "new shift explained",
      hookType: "timely market shift",
      thumbnailPattern: "headline plus simple workflow diagram",
      emotionalAngle: "urgency",
    });
  });
}

function blueprintCandidates(input: RecommendationGenerationInput): Candidate[] {
  return input.blueprints.flatMap((blueprint, blueprintIndex) =>
    blueprint.contentPillars.map((pillar, pillarIndex) => {
      const topVideoId = blueprint.topVideoIds[pillarIndex % blueprint.topVideoIds.length];

      return buildCandidate({
        input,
        topic: pillar,
        score: clampScore(78 + blueprint.averageOutlierScore / 10 - pillarIndex),
        sourceRank: 50 + blueprintIndex * 10 + pillarIndex,
        evidence: [
          {
            ...(topVideoId ? { youtubeVideoId: topVideoId } : {}),
            evidenceType: "competitor_blueprint",
            note: `${blueprint.channelTitle} repeatedly wins with ${pillar}.`,
          },
        ],
        titlePattern: blueprint.titlePatterns[0] ?? "repeatable framework",
        hookType: blueprint.hookPatterns[0] ?? "pattern teardown",
        thumbnailPattern: blueprint.thumbnailPatterns[0] ?? "signal board",
        emotionalAngle: blueprint.emotionalAngles[0] ?? "confidence",
      });
    }),
  );
}

function recentVideoCandidates(input: RecommendationGenerationInput): Candidate[] {
  return input.recentVideos.map((video, index) =>
    buildCandidate({
      input,
      topic: normalizeDisplayTopic(video.title),
      score: clampScore(70 - index * 2),
      sourceRank: 80 + index,
      evidence: [
        {
          youtubeVideoId: video.videoId,
          evidenceType: "recent_competitor_upload",
          note: `${video.channelTitle} recently published "${video.title}".`,
        },
      ],
      titlePattern: "competitor response",
      hookType: "what they missed",
      thumbnailPattern: "comparison board",
      emotionalAngle: "curiosity",
    }),
  );
}

function fallbackCandidates(input: RecommendationGenerationInput): Candidate[] {
  const evidence = firstAvailableEvidence(input);
  if (!evidence) {
    return [];
  }

  const topics = [
    `${input.workspace.primaryNiche} operating system`,
    "Content gaps competitors are leaving open",
    "Beginner-to-operator AI workflow roadmap",
    "Practical AI tool stack comparison",
    "Weekly research-to-content workflow",
  ];

  return topics.map((topic, index) =>
    buildCandidate({
      input,
      topic,
      score: 68 - index,
      sourceRank: 100 + index,
      evidence: [evidence],
      titlePattern: "practical framework",
      hookType: "problem-first",
      thumbnailPattern: "simple checklist dashboard",
      emotionalAngle: "relief",
    }),
  );
}

function buildCandidate(input: {
  input: RecommendationGenerationInput;
  topic: string;
  score: number;
  sourceRank: number;
  evidence: GeneratedRecommendationEvidence[];
  titlePattern: string;
  hookType: string;
  thumbnailPattern: string;
  emotionalAngle: string;
}): Candidate {
  const targetAudience =
    input.input.workspace.targetAudience ?? "creators and operators";
  const cleanTopic = normalizeDisplayTopic(input.topic);
  const angle = `Turn ${cleanTopic} into a practical, evidence-backed workflow for ${targetAudience}.`;

  return {
    title: cleanTopic,
    topic: cleanTopic,
    angle,
    whyNow: whyNow(input.evidence),
    audiencePainPoint: `The audience wants a useful path through ${cleanTopic} without another generic trend recap.`,
    opportunityScore: Math.round(input.score),
    suggestedTitle: suggestedTitle(cleanTopic, input.titlePattern),
    suggestedHook: `Most people have heard the promise of ${cleanTopic}. This breakdown shows what is actually working now, using competitor and source evidence instead of guesses.`,
    thumbnailConcept: `${input.thumbnailPattern}: bold topic label, one concrete proof point, and a simple workflow visual.`,
    outline: {
      sections: [
        "Cold open with the strongest evidence signal",
        "Why this topic is becoming urgent now",
        "Break down the competitor or source pattern",
        "Show a practical workflow the viewer can copy",
        "Call out the common mistake or blind spot",
        "Close with the next action and CTA",
      ],
    },
    linkedinAngle: `A concise operator post on why ${cleanTopic} is shifting from trend to execution, with one practical takeaway.`,
    evidence: input.evidence,
    sourceRank: input.sourceRank,
  };
}

function matchingSourceEvidence(
  input: RecommendationGenerationInput,
  topic: string,
): GeneratedRecommendationEvidence[] {
  const topicWords = keywordSet(topic);
  return input.sourceItems
    .filter((item) => hasKeywordOverlap(topicWords, `${item.title} ${item.summary ?? ""}`))
    .slice(0, 1)
    .map((item) => ({
      sourceItemId: item.sourceItemId,
      evidenceType: "industry_source",
      note: `${item.sourceName} corroborates the timing with "${item.title}".`,
    }));
}

function matchingBlueprint(
  input: RecommendationGenerationInput,
  topic: string,
) {
  const topicWords = keywordSet(topic);
  return input.blueprints.find((blueprint) =>
    blueprint.contentPillars.some((pillar) => hasKeywordOverlap(topicWords, pillar)),
  );
}

function firstAvailableEvidence(
  input: RecommendationGenerationInput,
): GeneratedRecommendationEvidence | null {
  const outlier = input.outliers[0];
  if (outlier) {
    return {
      youtubeVideoId: outlier.videoId,
      evidenceType: "competitor_outlier",
      note: `${outlier.channelTitle} created a strong outlier with "${outlier.title}".`,
    };
  }

  const source = input.sourceItems[0];
  if (source) {
    return {
      sourceItemId: source.sourceItemId,
      evidenceType: "industry_source",
      note: `${source.sourceName} published "${source.title}".`,
    };
  }

  return null;
}

function topicFromOutlier(outlier: RecommendationOutlierInput): string {
  return (
    outlier.analysis?.contentPillar ??
    outlier.analysis?.summary ??
    normalizeDisplayTopic(outlier.title)
  );
}

function inferSourceTopic(title: string, niche: string): string {
  const lowered = title.toLowerCase();
  if (lowered.includes("agent")) {
    return "Practical AI agent adoption";
  }
  if (lowered.includes("operating system")) {
    return "AI operating systems for content teams";
  }
  if (lowered.includes("linkedin")) {
    return "LinkedIn AI content workflow";
  }
  return `${niche} market shift`;
}

function whyNow(evidence: GeneratedRecommendationEvidence[]): string {
  const outlierCount = evidence.filter((item) => item.youtubeVideoId).length;
  const sourceCount = evidence.filter((item) => item.sourceItemId).length;
  if (outlierCount > 0 && sourceCount > 0) {
    return "Competitor performance and industry source timing are pointing at the same demand.";
  }
  if (outlierCount > 0) {
    return "Recent competitor performance shows clear audience demand around this pattern.";
  }
  if (sourceCount > 0) {
    return "Fresh industry source coverage gives this topic timely relevance.";
  }
  return "Repeated blueprint signals show this pattern is worth turning into a topic.";
}

function hasLinkableEvidence(evidence: GeneratedRecommendationEvidence[]): boolean {
  return evidence.some((item) => item.youtubeVideoId || item.sourceItemId);
}

function suggestedTitle(topic: string, pattern: string): string {
  if (pattern.toLowerCase().includes("i built")) {
    return `I Built a Practical ${topic} Workflow`;
  }
  if (pattern.toLowerCase().includes("save")) {
    return `${topic} That Saves Hours Every Week`;
  }
  return `The Practical Guide to ${topic}`;
}

function sortCandidates(left: Candidate, right: Candidate): number {
  return right.opportunityScore - left.opportunityScore || left.sourceRank - right.sourceRank;
}

function withoutRank(candidate: Candidate): GeneratedTopicRecommendation {
  const { sourceRank: _sourceRank, ...recommendation } = candidate;
  return recommendation;
}

function splitBlockedTerms(value: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isBlocked(topic: string, blockedTerms: string[]): boolean {
  const lowered = topic.toLowerCase();
  return blockedTerms.some((term) => lowered.includes(term));
}

function normalizeTopic(value: string): string {
  return normalizeDisplayTopic(value).toLowerCase();
}

function normalizeDisplayTopic(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function keywordSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3),
  );
}

function hasKeywordOverlap(keywords: Set<string>, value: string): boolean {
  const haystack = keywordSet(value);
  for (const keyword of keywords) {
    if (haystack.has(keyword)) {
      return true;
    }
  }
  return false;
}

function formatMultiplier(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "strong outlier";
  }
  return `${value.toFixed(1)}x`;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 50;
  }
  return Math.max(35, Math.min(100, value));
}
