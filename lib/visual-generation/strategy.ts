import type {
  BuildVisualStrategyInput,
  VisualAssetDimensions,
  VisualAspectRatioInput,
  VisualAssetTypeInput,
  VisualOverlay,
  VisualStrategy,
} from "@/types/visual-generation";

const ASSET_TYPE_LABELS: Record<VisualAssetTypeInput, string> = {
  YOUTUBE_THUMBNAIL: "YouTube thumbnail",
  LINKEDIN_IMAGE: "LinkedIn post image",
  LINKEDIN_CAROUSEL_COVER: "LinkedIn carousel cover",
  QUOTE_CARD: "branded quote card",
  DIAGRAM: "diagram or explainer image",
};

export function buildVisualStrategy(input: BuildVisualStrategyInput): VisualStrategy {
  const topic = compactText(input.contentItem?.title ?? input.contentItem?.manualTopic ?? input.brief ?? "Untitled visual");
  const evidence = evidenceSummary(input.contentItem?.evidenceSnapshot);
  const recommendation = input.contentItem?.recommendation;
  const angle = compactText(input.brief ?? recommendation?.thumbnailConcept ?? recommendation?.linkedinAngle ?? input.contentItem?.notes ?? "");
  const assetLabel = ASSET_TYPE_LABELS[input.assetType];
  const overlays = editableOverlays(input.assetType, topic, recommendation?.suggestedHook ?? angle);
  const composition = compositionFor(input.assetType, input.aspectRatio);
  const styleDirection = [
    "serious analytics SaaS visual language",
    "clean interface details",
    "high contrast focal hierarchy",
    "credible creator-business tone",
  ].join(", ");
  const imagePrompt = [
    `${assetLabel} background for YTResearch.`,
    `Topic: ${topic}.`,
    angle ? `Strategic angle: ${angle}.` : "",
    evidence ? `Evidence context: ${evidence}.` : "",
    `Composition: ${composition}.`,
    "Use a polished product/creator intelligence aesthetic with dashboards, workflows, evidence markers, and realistic depth.",
    "Do not render words, logos, captions, watermarks, or readable UI text in the image; leave clean negative space for editable overlays.",
    input.brandVoice ? `Brand voice to imply visually: ${compactText(input.brandVoice)}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    conceptTitle: conceptTitle(input.assetType, topic),
    objective: objectiveFor(input.assetType, topic),
    composition,
    focalPoint: focalPointFor(input.assetType),
    background: backgroundFor(input.assetType),
    styleDirection,
    colorPalette: ["teal primary accent", "deep navy text contrast", "cool blue data accent", "soft neutral dashboard surface"],
    imagePrompt,
    negativePrompt: "readable text, misspelled words, fake logos, distorted faces, cluttered UI, heavy purple gradients, cartoon styling",
    editableOverlays: overlays,
    providerNotes: "Generate the image without baked-in text. Apply all headline, quote, and proof text through editable overlays after generation.",
  };
}

export function visualAssetDimensions(aspectRatio: VisualAspectRatioInput): VisualAssetDimensions {
  switch (aspectRatio) {
    case "1:1":
      return { width: 1200, height: 1200 };
    case "4:5":
      return { width: 1080, height: 1350 };
    case "16:9":
      return { width: 1280, height: 720 };
  }
}

export function visualAssetStoragePath(input: {
  workspaceId: string;
  contentItemId?: string | null;
  assetType: VisualAssetTypeInput;
  generationId: string;
  mediaType?: string | null;
}): string {
  const extension = mediaTypeExtension(input.mediaType);
  const contentSegment = input.contentItemId ? `content-items/${input.contentItemId}` : "standalone";
  return `visual-assets/${input.workspaceId}/${contentSegment}/${input.assetType.toLowerCase()}/${input.generationId}.${extension}`;
}

export function dataUrlFromImageFile(file: { mediaType: string; base64: string } | undefined): string | null {
  return file ? `data:${file.mediaType};base64,${file.base64}` : null;
}

function conceptTitle(assetType: VisualAssetTypeInput, topic: string): string {
  if (assetType === "YOUTUBE_THUMBNAIL") {
    return `Thumbnail concept: ${topic}`;
  }
  if (assetType === "DIAGRAM") {
    return `Explainer diagram: ${topic}`;
  }
  return `${ASSET_TYPE_LABELS[assetType]} concept: ${topic}`;
}

function objectiveFor(assetType: VisualAssetTypeInput, topic: string): string {
  if (assetType === "YOUTUBE_THUMBNAIL") {
    return `Make ${topic} instantly legible as a high-stakes, evidence-backed YouTube idea.`;
  }
  if (assetType === "QUOTE_CARD") {
    return `Package one sharp insight from ${topic} as a branded, editable quote visual.`;
  }
  if (assetType === "DIAGRAM") {
    return `Explain the core mechanism behind ${topic} with a clean visual system.`;
  }
  return `Turn ${topic} into a professional LinkedIn visual that supports the written post.`;
}

function compositionFor(assetType: VisualAssetTypeInput, aspectRatio: VisualAspectRatioInput): string {
  if (assetType === "YOUTUBE_THUMBNAIL") {
    return "16:9 frame with one strong focal object on the right and open headline space on the left";
  }
  if (assetType === "LINKEDIN_CAROUSEL_COVER") {
    return "cover-slide composition with a central dashboard motif and generous top-left title space";
  }
  if (assetType === "DIAGRAM") {
    return "simple flow diagram metaphor with three to five connected blocks and clear whitespace";
  }
  if (assetType === "QUOTE_CARD") {
    return "editorial quote-card background with quiet texture, generous center text space, and a small brand footer zone";
  }
  return aspectRatio === "4:5"
    ? "vertical feed image with a strong top third, central proof visual, and bottom caption-safe spacing"
    : "balanced square social image with a clear central proof visual and side margin for overlays";
}

function focalPointFor(assetType: VisualAssetTypeInput): string {
  if (assetType === "DIAGRAM") {
    return "connected workflow blocks showing cause and effect";
  }
  if (assetType === "QUOTE_CARD") {
    return "subtle content intelligence workspace backdrop behind editable quote text";
  }
  return "creator intelligence dashboard with visible evidence cards and workflow state";
}

function backgroundFor(assetType: VisualAssetTypeInput): string {
  if (assetType === "YOUTUBE_THUMBNAIL") {
    return "crisp studio desk plus analytics dashboard, not a stock-photo scene";
  }
  if (assetType === "DIAGRAM") {
    return "light dashboard canvas with restrained gridlines and clear separation between nodes";
  }
  return "clean SaaS workspace surface with subtle depth, neutral panels, and teal/blue accents";
}

function editableOverlays(assetType: VisualAssetTypeInput, topic: string, supportingText?: string | null): VisualOverlay[] {
  const headline = headlineText(assetType, topic);
  const support = compactText(supportingText ?? "");
  if (assetType === "YOUTUBE_THUMBNAIL") {
    return [
      overlay("headline", headline, "primary headline", 6, 18, 42, 34, "black", "#FFFFFF"),
      overlay("proof", support || "PROOF INSIDE", "proof badge", 7, 58, 30, 12, "bold", "#CCFBF1"),
    ];
  }
  if (assetType === "QUOTE_CARD") {
    return [
      overlay("quote", support || headline, "editable quote", 12, 24, 76, 42, "bold", "#101828"),
      overlay("brand", "YTResearch", "brand footer", 12, 78, 28, 8, "semibold", "#0F766E"),
    ];
  }
  if (assetType === "DIAGRAM") {
    return [
      overlay("title", headline, "diagram title", 8, 8, 58, 12, "bold", "#101828"),
      overlay("step-1", "Signal", "diagram label", 14, 38, 18, 8, "semibold", "#0F766E"),
      overlay("step-2", "Pattern", "diagram label", 41, 38, 18, 8, "semibold", "#2563EB"),
      overlay("step-3", "Output", "diagram label", 68, 38, 18, 8, "semibold", "#047857"),
    ];
  }
  return [
    overlay("headline", headline, "post headline", 8, 12, 66, 18, "bold", "#101828"),
    overlay("supporting", support || "Evidence-backed content idea", "supporting line", 8, 34, 62, 12, "semibold", "#344054"),
  ];
}

function overlay(
  id: string,
  text: string,
  role: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontWeight: VisualOverlay["fontWeight"],
  color: string,
): VisualOverlay {
  return { id, text: truncate(compactText(text), 54), role, x, y, width, height, fontWeight, color };
}

function headlineText(assetType: VisualAssetTypeInput, topic: string): string {
  const words = compactText(topic).split(" ").filter(Boolean);
  const shortTopic = words.slice(0, assetType === "YOUTUBE_THUMBNAIL" ? 5 : 8).join(" ");
  if (assetType === "YOUTUBE_THUMBNAIL") {
    return shortTopic.toUpperCase();
  }
  return shortTopic;
}

function evidenceSummary(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }
  const snapshot = value as {
    recommendation?: { whyNow?: string | null; audiencePainPoint?: string | null };
    channel?: { title?: string | null };
    evidences?: Array<{ video?: { title?: string | null }; sourceItem?: { title?: string | null } }>;
  };
  return [
    snapshot.recommendation?.whyNow,
    snapshot.recommendation?.audiencePainPoint,
    snapshot.channel?.title ? `source channel ${snapshot.channel.title}` : "",
    ...(snapshot.evidences ?? []).slice(0, 3).map((item) => item.video?.title ?? item.sourceItem?.title ?? ""),
  ]
    .filter(Boolean)
    .map((item) => compactText(String(item)))
    .join(" | ");
}

function mediaTypeExtension(mediaType?: string | null): string {
  if (mediaType === "image/jpeg") {
    return "jpg";
  }
  if (mediaType === "image/webp") {
    return "webp";
  }
  return "png";
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}...` : value;
}
