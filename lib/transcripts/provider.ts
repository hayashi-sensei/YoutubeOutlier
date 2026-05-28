import type {
  TranscriptAnalysisInput,
  TranscriptAnalysisResult,
  TranscriptAnalyzer,
  TranscriptFetchInput,
  TranscriptFetchResult,
  TranscriptProvider,
} from "@/types/transcripts";

export class NoopTranscriptProvider implements TranscriptProvider {
  readonly name = "noop-transcript";

  async fetchTranscript(
    _input: TranscriptFetchInput,
  ): Promise<TranscriptFetchResult> {
    return {
      status: "skipped",
      provider: this.name,
      reason: "No live transcript provider is configured.",
    };
  }
}

export class HeuristicTranscriptAnalyzer implements TranscriptAnalyzer {
  readonly name = "heuristic-transcript-analyzer";

  async analyze(
    input: TranscriptAnalysisInput,
  ): Promise<TranscriptAnalysisResult> {
    const sourceText = input.transcriptText ?? metadataText(input);
    const sentences = splitSentences(sourceText);
    const hook = sentences[0] ?? input.video.title;
    const summary = summarize(sentences, input.video.title);
    const claims = sentences.slice(0, 3);
    const contentPillars = inferContentPillars(input);

    return {
      hook,
      hookType: inferHookType(hook),
      structure: {
        source: input.source,
        sections: inferSections(input),
        notes: input.fallbackReason ? [input.fallbackReason] : undefined,
      },
      cta: inferCta(sourceText),
      claims,
      summary,
      contentPillars,
      titlePattern: inferTitlePattern(input.video.title),
      thumbnailPattern: input.video.thumbnailUrl ? "thumbnail_available" : "metadata_only",
      emotionalAngle: inferEmotionalAngle(sourceText),
      model: this.name,
    };
  }
}

function metadataText(input: TranscriptAnalysisInput): string {
  return [input.video.title, input.video.description ?? "", input.video.tags.join(", ")]
    .filter(Boolean)
    .join(". ");
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function summarize(sentences: string[], title: string): string {
  if (sentences.length === 0) {
    return title;
  }

  return sentences.slice(0, 2).join(" ");
}

function inferContentPillars(input: TranscriptAnalysisInput): string[] {
  if (input.video.tags.length > 0) {
    return input.video.tags.slice(0, 3);
  }

  return [input.video.categoryId ? `category:${input.video.categoryId}` : "uncategorized"];
}

function inferHookType(hook: string): string | undefined {
  const lowerHook = hook.toLowerCase();
  if (lowerHook.includes("why") || lowerHook.includes("fail")) {
    return "contrarian";
  }
  if (lowerHook.includes("how to") || lowerHook.includes("build")) {
    return "tutorial";
  }
  if (/\d/.test(hook)) {
    return "list";
  }

  return "statement";
}

function inferSections(input: TranscriptAnalysisInput): string[] {
  if (input.source === "metadata") {
    return ["title", "description", "metadata"];
  }

  return ["hook", "body", "cta"];
}

function inferCta(text: string): string | undefined {
  const lowerText = text.toLowerCase();
  if (lowerText.includes("subscribe")) {
    return "subscribe";
  }
  if (lowerText.includes("download") || lowerText.includes("link below")) {
    return "lead_magnet";
  }

  return undefined;
}

function inferTitlePattern(title: string): string {
  if (/\d/.test(title)) {
    return "numbered";
  }
  if (title.includes("?")) {
    return "question";
  }

  return "statement";
}

function inferEmotionalAngle(text: string): string | undefined {
  const lowerText = text.toLowerCase();
  if (lowerText.includes("mistake") || lowerText.includes("fail")) {
    return "avoid_failure";
  }
  if (lowerText.includes("fast") || lowerText.includes("easy")) {
    return "speed";
  }

  return undefined;
}
