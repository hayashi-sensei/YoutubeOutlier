import { z } from "zod";

export const addIndustrySourceSchema = z.object({
  url: z.string().url("Enter a valid source URL."),
  name: z.string().trim().max(120).optional(),
});

export const industrySourceIdSchema = z.object({
  sourceId: z.string().min(1),
});
