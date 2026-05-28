import { createHash } from "node:crypto";

import { generateText, Output } from "ai";

import { resolveLanguageModel } from "@/lib/ai/provider-registry";
import { deductCreditsForTask, refundCreditsForTask, type CreditTransactionClient } from "@/lib/billing/credits";
import { applyAiTaskRouteOverrides, getAiTaskConfig, toAiTaskConfig, type AiTaskRouteOverrideRecord } from "@/lib/ai/task-config";
import type {
  AiGenerationUsage,
  AiTextExecutor,
  AiTextExecutorInput,
  AiTextExecutorResult,
  RunAiTextTaskInput,
  RunAiTextTaskResult,
} from "@/types/ai";

type AiGenerationRow = {
  id: string;
};

type AiGenerationCreateInput = {
  workspaceId: string;
  userId: string | null;
  taskType: string;
  provider: string;
  model: string;
  status: "RUNNING";
  promptHash: string;
  requestJson: unknown;
};

type AiGenerationUpdateInput = {
  status: "SUCCEEDED" | "FAILED";
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  creditsCharged?: number;
  responseJson?: unknown;
  errorMessage?: string | null;
  completedAt: Date;
};

export type AiModelRouterPrisma = CreditTransactionClient & {
  $transaction<T>(callback: (tx: CreditTransactionClient & AiGenerationWriteClient) => Promise<T>): Promise<T>;
  aiGeneration: AiGenerationWriteClient["aiGeneration"];
  aiTaskRouteOverride?: {
    findUnique(input: {
      where: { taskType_qualityTier: { taskType: string; qualityTier: string } };
      select: {
        taskType: true;
        qualityTier: true;
        provider: true;
        model: true;
        credits: true;
        estimatedCostUsd: true;
        maxOutputTokens: true;
        temperature: true;
        updatedAt: true;
      };
    }): Promise<AiTaskRouteOverrideRecord | null>;
  };
};

type AiGenerationWriteClient = {
  aiGeneration: {
    create(input: { data: AiGenerationCreateInput; select: { id: true } }): Promise<AiGenerationRow>;
    update(input: { where: { id: string }; data: AiGenerationUpdateInput }): Promise<AiGenerationRow>;
  };
};

export type AiModelRouterOptions = {
  prisma: AiModelRouterPrisma;
  textExecutor?: AiTextExecutor;
  now?: () => Date;
};

export function createAiModelRouter(options: AiModelRouterOptions) {
  const executeText = options.textExecutor ?? defaultTextExecutor;
  const now = options.now ?? (() => new Date());

  return {
    async runTextTask<TOutput>(input: RunAiTextTaskInput<TOutput>): Promise<RunAiTextTaskResult<TOutput>> {
      const config = await resolveTaskConfig(options.prisma, input.taskType, input.qualityTier);
      const requestJson = {
        system: input.system,
        prompt: input.prompt,
        metadata: input.metadata ?? {},
        schema: input.schema ? "zod" : null,
      };
      const generation = await options.prisma.aiGeneration.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId ?? null,
          taskType: input.taskType,
          provider: config.provider,
          model: config.model,
          status: "RUNNING",
          promptHash: hashPrompt(input.system, input.prompt),
          requestJson,
        },
        select: { id: true },
      });
      let creditsReserved = false;

      try {
        await options.prisma.$transaction(async (tx) => {
          await deductCreditsForTask(tx, {
            workspaceId: input.workspaceId,
            userId: input.userId ?? null,
            taskType: input.taskType,
            credits: config.credits,
            referenceType: input.referenceType ?? "AiGeneration",
            referenceId: input.referenceId ?? generation.id,
          });
        });
        creditsReserved = true;
        const result = await runTextExecutorWithStructuredRetry(executeText, {
          config,
          system: input.system,
          prompt: input.prompt,
          schema: input.schema,
        });
        const usage = {
          inputTokens: result.usage.inputTokens ?? estimateTokens(input.system, input.prompt),
          outputTokens: result.usage.outputTokens ?? estimateTokens(result.text),
        };
        const costUsd = config.estimatedCostUsd * ((result.metadata?.attempts as number | undefined) ?? 1);

        await options.prisma.$transaction(async (tx) => {
          await tx.aiGeneration.update({
            where: { id: generation.id },
            data: {
              status: "SUCCEEDED",
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              costUsd,
              creditsCharged: config.credits,
              responseJson: result.responseJson ?? toResponseJson(result),
              errorMessage: null,
              completedAt: now(),
            },
          });
          await input.onSuccessTransaction?.({
            generationId: generation.id,
            provider: config.provider,
            model: config.model,
            creditsCharged: config.credits,
            costUsd,
            result,
            transaction: tx,
          });
        });

        return {
          ...result,
          generationId: generation.id,
          provider: config.provider,
          model: config.model,
          creditsCharged: config.credits,
          costUsd,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI text generation failed.";
        let failureMessage = message;
        if (creditsReserved) {
          try {
            await options.prisma.$transaction(async (tx) => {
              await refundCreditsForTask(tx, {
                workspaceId: input.workspaceId,
                userId: input.userId ?? null,
                taskType: input.taskType,
                credits: config.credits,
                referenceType: input.referenceType ?? "AiGeneration",
                referenceId: input.referenceId ?? generation.id,
              });
            });
          } catch (refundError) {
            const refundMessage = refundError instanceof Error ? refundError.message : "credit refund failed";
            failureMessage = `${message}; credit refund failed: ${refundMessage}`;
          }
        }
        await options.prisma.aiGeneration.update({
          where: { id: generation.id },
          data: {
            status: "FAILED",
            costUsd: config.estimatedCostUsd,
            creditsCharged: 0,
            errorMessage: failureMessage,
            completedAt: now(),
          },
        });
        throw error;
      }
    },
  };
}

async function resolveTaskConfig(
  prisma: AiModelRouterPrisma,
  taskType: RunAiTextTaskInput<unknown>["taskType"],
  qualityTier: RunAiTextTaskInput<unknown>["qualityTier"],
) {
  const tier = qualityTier ?? "standard";
  const fallback = getAiTaskConfig(taskType, tier);
  const override = await prisma.aiTaskRouteOverride?.findUnique({
    where: { taskType_qualityTier: { taskType, qualityTier: tier } },
    select: {
      taskType: true,
      qualityTier: true,
      provider: true,
      model: true,
      credits: true,
      estimatedCostUsd: true,
      maxOutputTokens: true,
      temperature: true,
      updatedAt: true,
    },
  });

  if (!override) {
    return fallback;
  }

  return toAiTaskConfig(applyAiTaskRouteOverrides([override], [{ ...fallback, qualityTier: tier }])[0]);
}

export const defaultTextExecutor: AiTextExecutor = async <TOutput>(
  input: AiTextExecutorInput<TOutput>,
): Promise<AiTextExecutorResult<TOutput>> => {
  const temperatureOptions = supportsTemperature(input.config)
    ? { temperature: input.config.temperature }
    : {};
  const result = input.schema
    ? await generateText({
        model: resolveLanguageModel(input.config),
        system: input.system,
        prompt: input.prompt,
        output: Output.object({ schema: input.schema }),
        maxOutputTokens: input.config.maxOutputTokens,
        ...temperatureOptions,
      })
    : await generateText({
        model: resolveLanguageModel(input.config),
        system: input.system,
        prompt: input.prompt,
        maxOutputTokens: input.config.maxOutputTokens,
        ...temperatureOptions,
      });
  if (input.schema && result.finishReason !== "stop") {
    throw new Error(
      `AI structured output did not complete. Finish reason: ${result.finishReason}. Increase max output tokens or reduce prompt size.`,
    );
  }

  return {
    text: result.text,
    output: input.schema ? (result.output as TOutput) : undefined,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    },
    responseJson: {
      finishReason: result.finishReason,
      modelId: result.response.modelId,
      output: input.schema ? result.output : undefined,
    },
  };
};

async function runTextExecutorWithStructuredRetry<TOutput>(
  executeText: AiTextExecutor,
  input: AiTextExecutorInput<TOutput>,
): Promise<AiTextExecutorResult<TOutput>> {
  try {
    return await executeText(input);
  } catch (error) {
    if (!input.schema || !isNoObjectGeneratedError(error)) {
      throw error;
    }

    const retryResult = await executeText({
      ...input,
      system: [
        input.system,
        "Return only valid JSON that matches the requested schema exactly.",
        "Do not wrap the JSON in markdown. Do not add prose before or after the JSON.",
        "Include every required field, and ensure arrays satisfy the requested minimum item counts.",
      ].join("\n"),
    });
    const failedUsage = usageFromError(error);
    const retryAttempts = 1;
    return {
      ...retryResult,
      usage: {
        inputTokens: addOptionalNumbers(failedUsage.inputTokens, retryResult.usage.inputTokens),
        outputTokens: addOptionalNumbers(failedUsage.outputTokens, retryResult.usage.outputTokens),
      },
      responseJson: {
        ...toResponseJson(retryResult),
        ...(isObjectRecord(retryResult.responseJson) ? retryResult.responseJson : {}),
        retryAttempts,
        failedStructuredOutputUsage: failedUsage,
      },
      metadata: {
        ...(isObjectRecord(retryResult.metadata) ? retryResult.metadata : {}),
        attempts: retryAttempts + 1,
        retryAttempts,
      },
    };
  }
}

function isNoObjectGeneratedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AI_NoObjectGeneratedError" ||
      error.message.toLowerCase().includes("no object generated"))
  );
}

function usageFromError(error: unknown): AiGenerationUsage {
  if (isObjectRecord(error) && isObjectRecord(error.usage)) {
    return {
      inputTokens: numberValue(error.usage.inputTokens),
      outputTokens: numberValue(error.usage.outputTokens),
    };
  }
  return {};
}

function addOptionalNumbers(first?: number, second?: number): number | undefined {
  if (typeof first !== "number" && typeof second !== "number") {
    return undefined;
  }
  return (first ?? 0) + (second ?? 0);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function supportsTemperature(config: { provider: string; model: string }): boolean {
  return !(config.provider === "openai" && config.model.startsWith("gpt-5"));
}

export function hashPrompt(system: string, prompt: string): string {
  return createHash("sha256").update(`${system}\n\n${prompt}`).digest("hex");
}

export function estimateTokens(...parts: string[]): number {
  return Math.ceil(parts.join(" ").length / 4);
}

function toResponseJson<TOutput>(result: AiTextExecutorResult<TOutput>) {
  return {
    text: result.text,
    output: result.output ?? null,
    usage: result.usage,
  };
}
