import { z } from "zod";

export const aiRecommendationEvidenceSchema = z.object({
  youtubeVideoId: z.string().nullable(),
  sourceItemId: z.string().nullable(),
  evidenceType: z.string().min(1),
  note: z.string().min(1),
});

export const aiTopicRecommendationSchema = z.object({
  title: z.string().min(1),
  topic: z.string().min(1),
  angle: z.string().min(1),
  whyNow: z.string().min(1),
  audiencePainPoint: z.string().min(1),
  opportunityScore: z.number().min(0).max(100),
  suggestedTitle: z.string().min(1),
  suggestedHook: z.string().min(1),
  thumbnailConcept: z.string().min(1),
  outline: z.object({
    sections: z.array(z.string().min(1)).min(5),
  }),
  linkedinAngle: z.string().min(1),
  evidence: z.array(aiRecommendationEvidenceSchema).min(1),
});

export const aiTopicRecommendationsSchema = z.object({
  recommendations: z.array(aiTopicRecommendationSchema).min(5).max(5),
});

export type AiTopicRecommendationsOutput = z.infer<typeof aiTopicRecommendationsSchema>;
