import { anthropic } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import { fal } from "@ai-sdk/fal";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { mistral } from "@ai-sdk/mistral";
import { openai } from "@ai-sdk/openai";
import { xai } from "@ai-sdk/xai";
import type { ImageModel, LanguageModel } from "ai";

import type { AiTaskConfig } from "@/types/ai";

export const TEXT_PROVIDER_ENV_KEYS = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  xai: "XAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  groq: "GROQ_API_KEY",
} as const;

export const IMAGE_PROVIDER_ENV_KEYS = {
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  xai: "XAI_API_KEY",
  fal: "FAL_API_KEY",
  piapi: "PIAPI_API_KEY",
} as const;

export function resolveLanguageModel(config: AiTaskConfig): LanguageModel {
  switch (config.provider) {
    case "openai":
      return openai(config.model);
    case "anthropic":
      return anthropic(config.model);
    case "google":
      return google(config.model);
    case "deepseek":
      return deepseek(config.model);
    case "xai":
      return xai(config.model);
    case "mistral":
      return mistral(config.model);
    case "groq":
      return groq(config.model);
    case "fal":
      throw new Error("fal is configured for image generation, not text generation.");
    case "piapi":
      throw new Error("PiAPI is configured for image generation, not text generation.");
    case "local":
      throw new Error("Local AI execution is not configured yet.");
  }
}

export function resolveImageModel(config: AiTaskConfig): ImageModel {
  switch (config.provider) {
    case "openai":
      return openai.image(config.model);
    case "google":
      return google.image(config.model);
    case "xai":
      return xai.image(config.model);
    case "fal":
      return fal.image(config.model);
    case "piapi":
      throw new Error("PiAPI uses its task API instead of an AI SDK image model.");
    case "anthropic":
    case "deepseek":
    case "mistral":
    case "groq":
      throw new Error(`${config.provider} is not configured for image generation.`);
    case "local":
      throw new Error("Local image generation is not configured yet.");
  }
}
