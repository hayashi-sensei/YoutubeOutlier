import { z } from "zod";

export const calendarStatusValues = [
  "IDEA",
  "OUTLINE",
  "SCRIPT",
  "THUMBNAIL",
  "SCHEDULED",
  "PUBLISHED",
  "ARCHIVED",
] as const;

export const calendarStatusSchema = z.enum(calendarStatusValues);

export const calendarContentTypeSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9_ -]+$/i);

export const calendarDateInputSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal(""));

export const createCalendarItemSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().trim().min(3).max(180),
  contentType: calendarContentTypeSchema.default("youtube_video"),
  status: calendarStatusSchema.default("IDEA"),
  scheduledFor: calendarDateInputSchema,
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const updateCalendarItemSchema = z.object({
  contentItemId: z.string().min(1),
  status: calendarStatusSchema,
  scheduledFor: calendarDateInputSchema,
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  returnTo: z.string().optional(),
});

export type CalendarStatus = z.infer<typeof calendarStatusSchema>;
