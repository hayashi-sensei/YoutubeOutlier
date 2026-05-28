import type { z } from "zod";

export const AI_TASK_TYPES = {
  topicRecommendation: "topic_recommendation",
  outlineGeneration: "outline_generation",
  hookGeneration: "hook_generation",
  titleGeneration: "title_generation",
  captionGeneration: "caption_generation",
  descriptionGeneration: "description_generation",
  scriptGeneration: "script_generation",
  repurposingGeneration: "repurposing_generation",
  reportTrendAnalysis: "report_trend_analysis",
  imageGeneration: "image_generation",
} as const;

export type AiTaskType = (typeof AI_TASK_TYPES)[keyof typeof AI_TASK_TYPES];

export type AiProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "xai"
  | "mistral"
  | "groq"
  | "fal"
  | "piapi"
  | "local";

export type AiQualityTier = "bulk" | "standard" | "premium";

export type AiTaskConfig = {
  taskType: AiTaskType;
  provider: AiProvider;
  model: string;
  credits: number;
  estimatedCostUsd: number;
  maxOutputTokens: number;
  temperature: number;
};

export type AiGenerationUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type AiTextExecutorInput<TOutput> = {
  config: AiTaskConfig;
  system: string;
  prompt: string;
  schema?: z.ZodType<TOutput>;
};

export type AiTextExecutorResult<TOutput> = {
  text: string;
  output?: TOutput;
  usage: AiGenerationUsage;
  responseJson?: unknown;
  metadata?: Record<string, unknown>;
};

export type AiTextExecutor = <TOutput>(
  input: AiTextExecutorInput<TOutput>,
) => Promise<AiTextExecutorResult<TOutput>>;

export type RunAiTextTaskInput<TOutput> = {
  workspaceId: string;
  userId?: string | null;
  taskType: AiTaskType;
  system: string;
  prompt: string;
  schema?: z.ZodType<TOutput>;
  qualityTier?: AiQualityTier;
  referenceType?: string | null;
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
  onSuccessTransaction?: (input: {
    generationId: string;
    provider: AiProvider;
    model: string;
    creditsCharged: number;
    costUsd: number;
    result: AiTextExecutorResult<TOutput>;
    transaction: unknown;
  }) => Promise<void>;
};

export type RunAiTextTaskResult<TOutput> = AiTextExecutorResult<TOutput> & {
  generationId: string;
  provider: AiProvider;
  model: string;
  creditsCharged: number;
  costUsd: number;
};

export type ImageAspectRatio = "1:1" | "4:5" | "16:9";

export type ImageRouterInput = {
  workspaceId: string;
  userId?: string | null;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  qualityTier?: AiQualityTier;
  referenceType?: string | null;
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
  onSuccessTransaction?: (input: {
    generationId: string;
    provider: AiProvider;
    model: string;
    creditsCharged: number;
    costUsd: number;
    files: Array<{
      mediaType: string;
      base64: string;
    }>;
    transaction: unknown;
  }) => Promise<void>;
};

export type ImageRouterResult = {
  generationId: string;
  provider: AiProvider;
  model: string;
  creditsCharged: number;
  costUsd: number;
  files: Array<{
    mediaType: string;
    base64: string;
  }>;
};
