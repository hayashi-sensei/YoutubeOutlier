import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  YOUTUBE_DATA_API_KEY: z.string().min(1).optional(),
  YOUTUBE_DAILY_QUOTA_LIMIT: z.coerce.number().int().positive().default(9000),
  YTRESEARCH_DAILY_AI_SPEND_ALERT_USD: z.coerce.number().positive().default(25),
  YTRESEARCH_JOBS_SECRET: z.string().min(12).optional(),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  YOUTUBE_DATA_API_KEY: process.env.YOUTUBE_DATA_API_KEY,
  YOUTUBE_DAILY_QUOTA_LIMIT: process.env.YOUTUBE_DAILY_QUOTA_LIMIT,
  YTRESEARCH_DAILY_AI_SPEND_ALERT_USD: process.env.YTRESEARCH_DAILY_AI_SPEND_ALERT_USD,
  YTRESEARCH_JOBS_SECRET: process.env.YTRESEARCH_JOBS_SECRET,
});
