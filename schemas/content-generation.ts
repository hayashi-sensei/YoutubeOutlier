import { z } from "zod";

export const outlineGenerationSchema = z.object({
  title: z.string().min(1),
  hookOptions: z.array(z.string().min(1)).min(3),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1),
        purpose: z.string().min(1),
        talkingPoints: z.array(z.string().min(1)).min(2),
      }),
    )
    .min(5),
  cta: z.string().min(1),
});

export const scriptGenerationSchema = z.object({
  title: z.string().min(1),
  estimatedDurationMinutes: z.number().min(1),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1),
        script: z.string().min(1),
      }),
    )
    .min(5),
  description: z.string().min(1),
});

export const scriptSectionGenerationSchema = z.object({
  heading: z.string().min(1),
  script: z.string().min(1),
});

export const hookGenerationSchema = z.object({
  title: z.string().min(1),
  hooks: z.array(z.string().min(1)).min(5),
  rationale: z.string().min(1),
});

export const titleGenerationSchema = z.object({
  title: z.string().min(1),
  titles: z.array(z.string().min(1)).min(8),
  titlePatterns: z.array(z.string().min(1)).min(2),
});

export const captionGenerationSchema = z.object({
  title: z.string().min(1),
  captions: z.array(z.string().min(1)).min(3),
  hashtags: z.array(z.string().min(1)).min(3),
});

export const descriptionGenerationSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  chapters: z.array(z.object({ label: z.string().min(1), timestamp: z.string().min(1) })),
  pinnedComment: z.string().min(1),
});

export const repurposingFormatSchema = z.enum([
  "LINKEDIN_THOUGHT_LEADERSHIP",
  "LINKEDIN_EDUCATIONAL",
  "LINKEDIN_CONTRARIAN",
  "LINKEDIN_STORY",
  "X_THREAD",
  "NEWSLETTER_BLURB",
]);

export const repurposingSourceTypeSchema = z.enum(["topic", "outline", "script", "report"]);

export const repurposingGenerationSchema = z.object({
  title: z.string().min(1),
  format: repurposingFormatSchema,
  sourceType: repurposingSourceTypeSchema,
  primaryDraft: z.string().min(1),
  hook: z.string().min(1),
  cta: z.string().min(1),
  platformNotes: z.array(z.string().min(1)).min(2),
  imageConcept: z.object({
    headline: z.string().min(1),
    visualMetaphor: z.string().min(1),
    composition: z.string().min(1),
    editableTextOverlays: z.array(z.string().min(1)).min(1),
    aspectRatio: z.enum(["1:1", "4:5", "16:9"]),
  }),
});

export const manualContentTopicSchema = z.object({
  topic: z.string().trim().min(3).max(180),
  angle: z.string().trim().max(500).optional(),
});

export type OutlineGenerationOutput = z.infer<typeof outlineGenerationSchema>;
export type ScriptGenerationOutput = z.infer<typeof scriptGenerationSchema>;
export type ScriptSectionGenerationOutput = z.infer<typeof scriptSectionGenerationSchema>;
export type HookGenerationOutput = z.infer<typeof hookGenerationSchema>;
export type TitleGenerationOutput = z.infer<typeof titleGenerationSchema>;
export type CaptionGenerationOutput = z.infer<typeof captionGenerationSchema>;
export type DescriptionGenerationOutput = z.infer<typeof descriptionGenerationSchema>;
export type RepurposingFormat = z.infer<typeof repurposingFormatSchema>;
export type RepurposingSourceType = z.infer<typeof repurposingSourceTypeSchema>;
export type RepurposingGenerationOutput = z.infer<typeof repurposingGenerationSchema>;
