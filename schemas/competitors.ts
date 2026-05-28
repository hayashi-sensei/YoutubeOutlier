import { z } from "zod";

export const addCompetitorSchema = z.object({
  channelUrl: z.string().url("Enter a valid YouTube channel URL."),
  nickname: z.string().trim().max(80).optional(),
});

export const trackedChannelIdSchema = z.object({
  trackedChannelId: z.string().min(1),
});

export const recommendationActionSchema = z.object({
  recommendationId: z.string().min(1),
  action: z.enum(["approve", "dismiss"]),
});
