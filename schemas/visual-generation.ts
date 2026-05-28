import { z } from "zod";

export const visualAssetTypeSchema = z.enum([
  "YOUTUBE_THUMBNAIL",
  "LINKEDIN_IMAGE",
  "LINKEDIN_CAROUSEL_COVER",
  "QUOTE_CARD",
  "DIAGRAM",
]);

export const visualAspectRatioSchema = z.enum(["1:1", "4:5", "16:9"]);

export const visualOverlaySchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  role: z.string().min(1),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
  fontWeight: z.enum(["regular", "semibold", "bold", "black"]),
  color: z.string().min(1),
});

export const visualStrategySchema = z.object({
  conceptTitle: z.string().min(1),
  objective: z.string().min(1),
  composition: z.string().min(1),
  focalPoint: z.string().min(1),
  background: z.string().min(1),
  styleDirection: z.string().min(1),
  colorPalette: z.array(z.string().min(1)).min(3),
  imagePrompt: z.string().min(1),
  negativePrompt: z.string().min(1),
  editableOverlays: z.array(visualOverlaySchema).min(1),
  providerNotes: z.string().min(1),
});

export const visualStrategyInputSchema = z.object({
  contentItemId: z.string().trim().min(1).optional(),
  assetType: visualAssetTypeSchema,
  aspectRatio: visualAspectRatioSchema,
  brief: z.string().trim().max(900).optional(),
});

export type VisualAssetTypeInput = z.infer<typeof visualAssetTypeSchema>;
export type VisualAspectRatioInput = z.infer<typeof visualAspectRatioSchema>;
export type VisualOverlay = z.infer<typeof visualOverlaySchema>;
export type VisualStrategy = z.infer<typeof visualStrategySchema>;
export type VisualStrategyInput = z.infer<typeof visualStrategyInputSchema>;
