import type { VisualAssetTypeInput, VisualAspectRatioInput, VisualOverlay, VisualStrategy } from "@/schemas/visual-generation";

export type VisualGenerationContentContext = {
  id?: string;
  title: string;
  manualTopic?: string | null;
  notes?: string | null;
  evidenceSnapshot?: unknown;
  recommendation?: {
    topic: string;
    angle: string | null;
    suggestedHook: string | null;
    thumbnailConcept: string | null;
    linkedinAngle: string | null;
  } | null;
};

export type BuildVisualStrategyInput = {
  assetType: VisualAssetTypeInput;
  aspectRatio: VisualAspectRatioInput;
  brief?: string | null;
  brandVoice?: string | null;
  cta?: string | null;
  contentItem?: VisualGenerationContentContext | null;
};

export type VisualAssetDimensions = {
  width: number;
  height: number;
};

export type { VisualAspectRatioInput, VisualAssetTypeInput, VisualOverlay, VisualStrategy };
