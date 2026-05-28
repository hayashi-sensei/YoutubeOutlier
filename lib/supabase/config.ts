import { env } from "@/lib/env";

export function getOptionalSupabaseConfig() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return null;
  }

  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function getSupabaseConfig() {
  const config = getOptionalSupabaseConfig();

  if (!config) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required for Supabase Auth.");
  }

  return config;
}
