import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32).refine((value) => value !== "replace-with-a-long-random-auth-secret", {
    message: "AUTH_SECRET must be set to a generated secret.",
  }),
  AUTH_GOOGLE_ID: z.string().min(1).refine((value) => value !== "your-google-oauth-client-id", {
    message: "AUTH_GOOGLE_ID must be set to a Google OAuth client ID.",
  }),
  AUTH_GOOGLE_SECRET: z.string().min(1).refine((value) => value !== "your-google-oauth-client-secret", {
    message: "AUTH_GOOGLE_SECRET must be set to a Google OAuth client secret.",
  }),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  YOUTUBE_DATA_API_KEY: z.string().min(1).optional(),
  YOUTUBE_DAILY_QUOTA_LIMIT: z.coerce.number().int().positive().default(9000),
  YTRESEARCH_DAILY_AI_SPEND_ALERT_USD: z.coerce.number().positive().default(25),
  YTRESEARCH_JOBS_SECRET: z.string().min(12).optional(),
  CLOUDFLARE_R2_ACCOUNT_ID: z.string().min(1).optional(),
  CLOUDFLARE_R2_ENDPOINT: z.string().url().optional(),
  CLOUDFLARE_R2_BUCKET_NAME: z.string().min(1).optional(),
  CLOUDFLARE_R2_REGION: z.string().min(1).default("auto"),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  CLOUDFLARE_R2_PUBLIC_BASE_URL: z.string().url().optional(),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
  AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  YOUTUBE_DATA_API_KEY: process.env.YOUTUBE_DATA_API_KEY,
  YOUTUBE_DAILY_QUOTA_LIMIT: process.env.YOUTUBE_DAILY_QUOTA_LIMIT,
  YTRESEARCH_DAILY_AI_SPEND_ALERT_USD: process.env.YTRESEARCH_DAILY_AI_SPEND_ALERT_USD,
  YTRESEARCH_JOBS_SECRET: process.env.YTRESEARCH_JOBS_SECRET,
  CLOUDFLARE_R2_ACCOUNT_ID: process.env.CLOUDFLARE_R2_ACCOUNT_ID,
  CLOUDFLARE_R2_ENDPOINT: process.env.CLOUDFLARE_R2_ENDPOINT,
  CLOUDFLARE_R2_BUCKET_NAME: process.env.CLOUDFLARE_R2_BUCKET_NAME,
  CLOUDFLARE_R2_REGION: process.env.CLOUDFLARE_R2_REGION,
  CLOUDFLARE_R2_ACCESS_KEY_ID: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  CLOUDFLARE_R2_PUBLIC_BASE_URL: process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL,
});
