import { AI_TASK_TYPES, type AiQualityTier, type AiTaskConfig, type AiTaskType } from "@/types/ai";

export const AI_QUALITY_TIERS: AiQualityTier[] = ["bulk", "standard", "premium"];
export const TEXT_AI_PROVIDERS: AiTaskConfig["provider"][] = ["openai", "anthropic", "google", "deepseek", "xai", "mistral", "groq"];
export const IMAGE_AI_PROVIDERS: AiTaskConfig["provider"][] = ["openai", "google", "xai", "fal", "piapi"];

export const AI_PROVIDER_MODEL_PRESETS: Record<string, string[]> = {
  openai: ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-image-1", "gpt-image-1-mini"],
  anthropic: ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-6"],
  google: ["gemini-3.1-flash-lite", "gemini-3.1-flash", "imagen-4.0-fast-generate-001", "imagen-4.0-generate-001"],
  deepseek: ["deepseek-v4-flash", "deepseek-v4-pro"],
  xai: ["grok-3-mini", "grok-4-fast-non-reasoning", "grok-imagine-image", "grok-imagine-image-pro"],
  mistral: ["ministral-3b-latest", "ministral-8b-latest", "mistral-small-latest", "mistral-medium-latest"],
  groq: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "openai/gpt-oss-120b"],
  fal: ["fal-ai/flux-pro/v1.1", "fal-ai/flux/dev", "fal-ai/flux/schnell"],
  piapi: ["Qubico/flux1-dev", "Qubico/flux1-schnell", "Qubico/flux1-dev-advanced"],
};

export type AiTaskRouteRow = AiTaskConfig & {
  qualityTier: AiQualityTier;
  isOverride?: boolean;
  updatedAt?: Date | null;
};

export type AiTaskRouteOverrideRecord = {
  taskType: string;
  qualityTier: string;
  provider: string;
  model: string;
  credits: number;
  estimatedCostUsd: string | number;
  maxOutputTokens: number;
  temperature: string | number;
  updatedAt?: Date | null;
};

const TEXT_TASK_CONFIG: Record<Exclude<AiTaskType, "image_generation">, Record<AiQualityTier, AiTaskConfig>> = {
  [AI_TASK_TYPES.topicRecommendation]: {
    bulk: task(AI_TASK_TYPES.topicRecommendation, "google", "gemini-3.1-flash-lite", 1, 0.01, 4200, 0.3),
    standard: task(AI_TASK_TYPES.topicRecommendation, "openai", "gpt-5.4", 2, 0.03, 6000, 0.35),
    premium: task(AI_TASK_TYPES.topicRecommendation, "anthropic", "claude-sonnet-4-6", 3, 0.05, 6500, 0.4),
  },
  [AI_TASK_TYPES.outlineGeneration]: {
    bulk: task(AI_TASK_TYPES.outlineGeneration, "google", "gemini-3.1-flash-lite", 1, 0.01, 1600, 0.35),
    standard: task(AI_TASK_TYPES.outlineGeneration, "openai", "gpt-5.4", 2, 0.03, 2200, 0.4),
    premium: task(AI_TASK_TYPES.outlineGeneration, "anthropic", "claude-sonnet-4-6", 3, 0.06, 2800, 0.45),
  },
  [AI_TASK_TYPES.hookGeneration]: {
    bulk: task(AI_TASK_TYPES.hookGeneration, "google", "gemini-3.1-flash-lite", 1, 0.01, 1200, 0.45),
    standard: task(AI_TASK_TYPES.hookGeneration, "openai", "gpt-5.4", 2, 0.02, 1600, 0.5),
    premium: task(AI_TASK_TYPES.hookGeneration, "anthropic", "claude-sonnet-4-6", 3, 0.04, 2000, 0.55),
  },
  [AI_TASK_TYPES.titleGeneration]: {
    bulk: task(AI_TASK_TYPES.titleGeneration, "google", "gemini-3.1-flash-lite", 1, 0.01, 1200, 0.45),
    standard: task(AI_TASK_TYPES.titleGeneration, "openai", "gpt-5.4", 2, 0.02, 1600, 0.5),
    premium: task(AI_TASK_TYPES.titleGeneration, "anthropic", "claude-sonnet-4-6", 3, 0.04, 2000, 0.55),
  },
  [AI_TASK_TYPES.captionGeneration]: {
    bulk: task(AI_TASK_TYPES.captionGeneration, "google", "gemini-3.1-flash-lite", 1, 0.01, 1400, 0.45),
    standard: task(AI_TASK_TYPES.captionGeneration, "openai", "gpt-5.4", 2, 0.03, 2000, 0.45),
    premium: task(AI_TASK_TYPES.captionGeneration, "anthropic", "claude-sonnet-4-6", 3, 0.05, 2400, 0.5),
  },
  [AI_TASK_TYPES.descriptionGeneration]: {
    bulk: task(AI_TASK_TYPES.descriptionGeneration, "google", "gemini-3.1-flash-lite", 1, 0.01, 1800, 0.35),
    standard: task(AI_TASK_TYPES.descriptionGeneration, "openai", "gpt-5.4", 2, 0.03, 2400, 0.4),
    premium: task(AI_TASK_TYPES.descriptionGeneration, "anthropic", "claude-sonnet-4-6", 3, 0.05, 3000, 0.45),
  },
  [AI_TASK_TYPES.scriptGeneration]: {
    bulk: task(AI_TASK_TYPES.scriptGeneration, "google", "gemini-3.1-flash", 4, 0.04, 5000, 0.45),
    standard: task(AI_TASK_TYPES.scriptGeneration, "openai", "gpt-5.4", 6, 0.12, 7000, 0.45),
    premium: task(AI_TASK_TYPES.scriptGeneration, "anthropic", "claude-sonnet-4-6", 8, 0.2, 9000, 0.5),
  },
  [AI_TASK_TYPES.repurposingGeneration]: {
    bulk: task(AI_TASK_TYPES.repurposingGeneration, "google", "gemini-3.1-flash-lite", 1, 0.01, 2200, 0.45),
    standard: task(AI_TASK_TYPES.repurposingGeneration, "openai", "gpt-5.4", 2, 0.03, 3000, 0.45),
    premium: task(AI_TASK_TYPES.repurposingGeneration, "anthropic", "claude-sonnet-4-6", 3, 0.06, 3600, 0.5),
  },
  [AI_TASK_TYPES.reportTrendAnalysis]: {
    bulk: task(AI_TASK_TYPES.reportTrendAnalysis, "google", "gemini-3.1-flash-lite", 1, 0.01, 1400, 0.25),
    standard: task(AI_TASK_TYPES.reportTrendAnalysis, "openai", "gpt-5.4-mini", 1, 0.01, 1800, 0.3),
    premium: task(AI_TASK_TYPES.reportTrendAnalysis, "anthropic", "claude-haiku-4-5", 2, 0.03, 2200, 0.35),
  },
};

const IMAGE_TASK_CONFIG: Record<AiQualityTier, AiTaskConfig> = {
  bulk: task(AI_TASK_TYPES.imageGeneration, "google", "imagen-4.0-fast-generate-001", 4, 0.04, 1200, 0.6),
  standard: task(AI_TASK_TYPES.imageGeneration, "openai", "gpt-image-1", 6, 0.08, 1200, 0.6),
  premium: task(AI_TASK_TYPES.imageGeneration, "piapi", "Qubico/flux1-dev", 8, 0.12, 1200, 0.6),
};

export function getAiTaskConfig(taskType: AiTaskType, qualityTier: AiQualityTier = "standard"): AiTaskConfig {
  if (taskType === AI_TASK_TYPES.imageGeneration) {
    return IMAGE_TASK_CONFIG[qualityTier];
  }

  return TEXT_TASK_CONFIG[taskType][qualityTier];
}

export function getAiTaskRoutingMatrix(): AiTaskRouteRow[] {
  return Object.values(AI_TASK_TYPES).flatMap((taskType) =>
    AI_QUALITY_TIERS.map((qualityTier) => ({
      ...getAiTaskConfig(taskType, qualityTier),
      qualityTier,
    })),
  );
}

export function applyAiTaskRouteOverrides(
  overrides: AiTaskRouteOverrideRecord[],
  baseRoutes: AiTaskRouteRow[] = getAiTaskRoutingMatrix(),
): AiTaskRouteRow[] {
  const overrideByRoute = new Map(overrides.map((override) => [routeKey(override.taskType, override.qualityTier), override]));

  return baseRoutes.map((route) => {
    const override = overrideByRoute.get(routeKey(route.taskType, route.qualityTier));
    if (!override) {
      return route;
    }

    return {
      ...route,
      provider: override.provider as AiTaskConfig["provider"],
      model: override.model,
      credits: override.credits,
      estimatedCostUsd: Number(override.estimatedCostUsd),
      maxOutputTokens: override.maxOutputTokens,
      temperature: Number(override.temperature),
      isOverride: true,
      updatedAt: override.updatedAt ?? null,
    };
  });
}

export function toAiTaskConfig(route: AiTaskRouteRow): AiTaskConfig {
  return {
    taskType: route.taskType,
    provider: route.provider,
    model: route.model,
    credits: route.credits,
    estimatedCostUsd: route.estimatedCostUsd,
    maxOutputTokens: route.maxOutputTokens,
    temperature: route.temperature,
  };
}

export function isAiTaskType(value: string): value is AiTaskType {
  return Object.values(AI_TASK_TYPES).includes(value as AiTaskType);
}

export function isAiQualityTier(value: string): value is AiQualityTier {
  return AI_QUALITY_TIERS.includes(value as AiQualityTier);
}

export function isProviderAllowedForTask(taskType: AiTaskType, provider: string): provider is AiTaskConfig["provider"] {
  const allowedProviders = taskType === AI_TASK_TYPES.imageGeneration ? IMAGE_AI_PROVIDERS : TEXT_AI_PROVIDERS;
  return allowedProviders.includes(provider as AiTaskConfig["provider"]);
}

function routeKey(taskType: string, qualityTier: string): string {
  return `${taskType}:${qualityTier}`;
}

function task(
  taskType: AiTaskType,
  provider: AiTaskConfig["provider"],
  model: string,
  credits: number,
  estimatedCostUsd: number,
  maxOutputTokens: number,
  temperature: number,
): AiTaskConfig {
  return {
    taskType,
    provider,
    model,
    credits,
    estimatedCostUsd,
    maxOutputTokens,
    temperature,
  };
}
