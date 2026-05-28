import { generateText } from "ai";

import { supportsTemperature } from "@/lib/ai/model-router";
import { resolveLanguageModel } from "@/lib/ai/provider-registry";
import { AI_TASK_TYPES, type AiProvider, type AiTaskConfig } from "@/types/ai";

export type AiProviderCapability = "text" | "image";

export type AiProviderHealthStatus = "CONNECTED" | "CONFIGURED" | "MISSING_KEY" | "PING_FAILED" | "RECENT_FAILURES";

export type AiProviderCatalogItem = {
  id: AiProvider;
  label: string;
  envKey: string;
  capabilities: AiProviderCapability[];
  pingModel: string | null;
  pingMode: "text" | "configuration";
};

export type AiProviderHealthInput = {
  provider: string;
  model: string;
  status: string;
  errorMessage?: string | null;
  createdAt?: Date;
};

export type AiProviderPingInput = {
  provider: string | null;
  ok: boolean | null;
  message?: string | null;
  checkedAt: Date;
};

export type AiProviderHealthRow = AiProviderCatalogItem & {
  configured: boolean;
  status: AiProviderHealthStatus;
  recentFailures: number;
  lastGeneration: AiProviderHealthInput | null;
  lastPing: AiProviderPingInput | null;
};

export type PingAiProviderResult = {
  ok: boolean;
  provider: AiProvider;
  message: string;
};

type PingExecutor = (config: AiTaskConfig) => Promise<void>;

export const AI_PROVIDER_CATALOG: AiProviderCatalogItem[] = [
  {
    id: "openai",
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    capabilities: ["text", "image"],
    pingModel: "gpt-5.4-nano",
    pingMode: "text",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    capabilities: ["text"],
    pingModel: "claude-haiku-4-5",
    pingMode: "text",
  },
  {
    id: "google",
    label: "Google Gemini",
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    capabilities: ["text", "image"],
    pingModel: "gemini-3.1-flash-lite",
    pingMode: "text",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    capabilities: ["text"],
    pingModel: "deepseek-v4-flash",
    pingMode: "text",
  },
  {
    id: "xai",
    label: "xAI",
    envKey: "XAI_API_KEY",
    capabilities: ["text", "image"],
    pingModel: "grok-3-mini",
    pingMode: "text",
  },
  {
    id: "mistral",
    label: "Mistral",
    envKey: "MISTRAL_API_KEY",
    capabilities: ["text"],
    pingModel: "ministral-3b-latest",
    pingMode: "text",
  },
  {
    id: "groq",
    label: "Groq",
    envKey: "GROQ_API_KEY",
    capabilities: ["text"],
    pingModel: "llama-3.1-8b-instant",
    pingMode: "text",
  },
  {
    id: "fal",
    label: "fal.ai",
    envKey: "FAL_API_KEY",
    capabilities: ["image"],
    pingModel: null,
    pingMode: "configuration",
  },
  {
    id: "piapi",
    label: "PiAPI",
    envKey: "PIAPI_API_KEY",
    capabilities: ["image"],
    pingModel: null,
    pingMode: "configuration",
  },
];

export function getAiProviderHealth(
  rows: AiProviderHealthInput[],
  env: Record<string, string | undefined> = process.env,
  pings: AiProviderPingInput[] = [],
): AiProviderHealthRow[] {
  return AI_PROVIDER_CATALOG.map((provider) => {
    const providerRows = rows.filter((row) => row.provider === provider.id);
    const recentFailures = providerRows.filter((row) => row.status === "FAILED").length;
    const configured = Boolean(env[provider.envKey]);
    const lastPing = pings.find((ping) => ping.provider === provider.id) ?? null;

    return {
      ...provider,
      configured,
      recentFailures,
      lastGeneration: providerRows[0] ?? null,
      lastPing,
      status: getHealthStatus(configured, recentFailures, lastPing),
    };
  });
}

export async function pingAiProvider(providerId: string, executor: PingExecutor = defaultPingExecutor): Promise<PingAiProviderResult> {
  const provider = AI_PROVIDER_CATALOG.find((item) => item.id === providerId);
  if (!provider) {
    return { ok: false, provider: "local", message: "Unknown provider." };
  }

  if (!process.env[provider.envKey]) {
    return { ok: false, provider: provider.id, message: `${provider.envKey} is not configured.` };
  }

  if (provider.pingMode === "configuration") {
    return {
      ok: true,
      provider: provider.id,
      message: `${provider.label} key is configured. Live image pings are skipped to avoid spending image credits.`,
    };
  }

  try {
    await executor({
      taskType: AI_TASK_TYPES.topicRecommendation,
      provider: provider.id,
      model: provider.pingModel ?? "",
      credits: 0,
      estimatedCostUsd: 0,
      maxOutputTokens: 16,
      temperature: 0,
    });
    return { ok: true, provider: provider.id, message: `${provider.label} responded successfully.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : `${provider.label} ping failed.`;
    return { ok: false, provider: provider.id, message };
  }
}

export function parseProviderPingMetadata(value: unknown): AiProviderPingInput | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const metadata = value as Record<string, unknown>;
  const provider = typeof metadata.provider === "string" ? metadata.provider : null;
  const ok = typeof metadata.ok === "boolean" ? metadata.ok : null;
  const message = typeof metadata.message === "string" ? metadata.message : null;
  const checkedAt = typeof metadata.checkedAt === "string" ? new Date(metadata.checkedAt) : null;

  if (!provider || ok === null || !checkedAt || Number.isNaN(checkedAt.getTime())) {
    return null;
  }

  return { provider, ok, message, checkedAt };
}

function getHealthStatus(configured: boolean, recentFailures: number, lastPing: AiProviderPingInput | null): AiProviderHealthStatus {
  if (!configured) {
    return "MISSING_KEY";
  }

  if (lastPing?.ok === true) {
    return "CONNECTED";
  }

  if (lastPing?.ok === false) {
    return "PING_FAILED";
  }

  if (recentFailures > 0) {
    return "RECENT_FAILURES";
  }

  return "CONFIGURED";
}

async function defaultPingExecutor(config: AiTaskConfig) {
  const temperatureOptions = supportsTemperature(config)
    ? { temperature: config.temperature }
    : {};

  await generateText({
    model: resolveLanguageModel(config),
    prompt: "Reply with pong.",
    maxOutputTokens: config.maxOutputTokens,
    ...temperatureOptions,
  });
}
