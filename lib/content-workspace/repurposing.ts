import {
  outlineGenerationSchema,
  repurposingGenerationSchema,
  scriptGenerationSchema,
  type RepurposingFormat,
  type RepurposingGenerationOutput,
  type RepurposingSourceType,
} from "@/schemas/content-generation";
import { REPURPOSING_ASSET_TYPE_PREFIX } from "@/types/content-workspace";

export const REPURPOSING_FORMAT_LABELS: Record<RepurposingFormat, string> = {
  LINKEDIN_THOUGHT_LEADERSHIP: "LinkedIn thought leadership post",
  LINKEDIN_EDUCATIONAL: "LinkedIn educational post",
  LINKEDIN_CONTRARIAN: "LinkedIn contrarian post",
  LINKEDIN_STORY: "LinkedIn story post",
  X_THREAD: "X/Twitter thread draft",
  NEWSLETTER_BLURB: "Newsletter blurb",
};

export const REPURPOSING_SOURCE_LABELS: Record<RepurposingSourceType, string> = {
  topic: "Topic and evidence",
  outline: "YouTube outline",
  script: "Full script",
  report: "Report or recommendation context",
};

type RepurposingAsset = {
  assetType: string;
  version: number;
  title: string | null;
  jsonBody: unknown;
};

type RepurposingReportContext = {
  id: string;
  title: string;
  summary: string | null;
  reportDate: Date;
  sectionsJson: unknown;
};

export function repurposingAssetType(format: RepurposingFormat): string {
  return `${REPURPOSING_ASSET_TYPE_PREFIX}${format.toLowerCase()}`;
}

export function isRepurposingAssetType(assetType: string): boolean {
  return assetType.startsWith(REPURPOSING_ASSET_TYPE_PREFIX);
}

export function selectRepurposingSourceContext(
  assets: RepurposingAsset[],
  sourceType: RepurposingSourceType,
  input: {
    title: string;
    manualTopic: string | null;
    notes: string | null;
    evidenceSnapshot: unknown;
    report?: RepurposingReportContext | null;
  },
): unknown {
  if (sourceType === "topic") {
    return {
      sourceType,
      title: input.title,
      manualTopic: input.manualTopic,
      notes: input.notes,
      evidenceSnapshot: input.evidenceSnapshot,
    };
  }

  if (sourceType === "outline") {
    const outline = latestParsedAsset(assets, "outline", outlineGenerationSchema);
    if (!outline) {
      throw new Error("Generate a YouTube outline before repurposing from an outline.");
    }
    return { sourceType, outline };
  }

  if (sourceType === "script") {
    const script = latestParsedAsset(assets, "script", scriptGenerationSchema);
    if (!script) {
      throw new Error("Generate a full script before repurposing from a script.");
    }
    return { sourceType, script };
  }

  if (sourceType === "report") {
    if (!input.report) {
      throw new Error("Open a report-backed recommendation before repurposing from a report.");
    }
    return { sourceType, report: input.report };
  }

  return {
    sourceType,
    title: input.title,
    notes: input.notes,
    evidenceSnapshot: input.evidenceSnapshot,
  };
}

export function buildEditableRepurposingBody(output: RepurposingGenerationOutput): string {
  return [
    `# ${output.title}`,
    "",
    `Format: ${REPURPOSING_FORMAT_LABELS[output.format]}`,
    `Source: ${REPURPOSING_SOURCE_LABELS[output.sourceType]}`,
    "",
    "## Hook",
    output.hook,
    "",
    "## Draft",
    output.primaryDraft,
    "",
    "## CTA",
    output.cta,
    "",
    "## Platform Notes",
    ...output.platformNotes.map((note) => `- ${note}`),
    "",
    "## LinkedIn Image Concept",
    `Headline: ${output.imageConcept.headline}`,
    `Aspect ratio: ${output.imageConcept.aspectRatio}`,
    "",
    output.imageConcept.visualMetaphor,
    "",
    output.imageConcept.composition,
    "",
    "Editable overlays:",
    ...output.imageConcept.editableTextOverlays.map((overlay) => `- ${overlay}`),
  ].join("\n");
}

export function parseRepurposingOutput(value: unknown): RepurposingGenerationOutput | null {
  const parsed = repurposingGenerationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function latestParsedAsset<TOutput>(
  assets: RepurposingAsset[],
  assetType: string,
  schema: { safeParse(value: unknown): { success: true; data: TOutput } | { success: false } },
): TOutput | null {
  const candidates = assets
    .filter((asset) => asset.assetType === assetType)
    .sort((a, b) => b.version - a.version);

  for (const candidate of candidates) {
    const parsed = schema.safeParse(candidate.jsonBody);
    if (parsed.success) {
      return parsed.data;
    }
  }

  return null;
}
