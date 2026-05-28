import { z } from "zod";

export const settingsSchema = z.object({
  primaryNiche: z.string().trim().min(2, "Primary niche is required."),
  subNiche: z.string().trim().optional(),
  targetAudience: z.string().trim().optional(),
  contentGoals: z.string().trim().optional(),
  brandVoice: z.string().trim().optional(),
  cta: z.string().trim().optional(),
  offers: z.string().trim().optional(),
  topicsToAvoid: z.string().trim().optional(),
  defaultAiQualityTier: z.enum(["standard", "premium"]).default("standard"),
  dailyReportEnabled: z.boolean().default(false),
  reportDeliveryEmail: z.string().trim().email().optional().or(z.literal("")),
  writingSamples: z.string().trim().optional(),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

export function parseWritingSamples(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(/\n{2,}/)
    .map((sample) => sample.trim())
    .filter(Boolean);
}
