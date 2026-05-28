import {
  captionGenerationSchema,
  descriptionGenerationSchema,
  hookGenerationSchema,
  outlineGenerationSchema,
  repurposingGenerationSchema,
  scriptGenerationSchema,
  scriptSectionGenerationSchema,
  titleGenerationSchema,
  type CaptionGenerationOutput,
  type DescriptionGenerationOutput,
  type HookGenerationOutput,
  type OutlineGenerationOutput,
  type RepurposingFormat,
  type RepurposingGenerationOutput,
  type RepurposingSourceType,
  type ScriptGenerationOutput,
  type ScriptSectionGenerationOutput,
  type TitleGenerationOutput,
} from "@/schemas/content-generation";
import { AI_TASK_TYPES, type RunAiTextTaskInput, type RunAiTextTaskResult } from "@/types/ai";
import type { ContentWorkspaceSectionType } from "@/types/content-workspace";
import type { z } from "zod";

type ContentGenerationContext = {
  workspaceId: string;
  userId: string;
  brandVoice?: string | null;
  writingStyleSample?: string | null;
  cta?: string | null;
  contentItem: {
    id: string;
    title: string;
    manualTopic: string | null;
    notes: string | null;
    evidenceSnapshot: unknown;
  };
  selectedOutline?: OutlineGenerationOutput;
  generatedAssetsContext?: unknown;
  selectedScript?: ScriptGenerationOutput;
  repurposingFormat?: RepurposingFormat;
  repurposingSourceType?: RepurposingSourceType;
  repurposingSourceContext?: unknown;
  scriptSection?: {
    sectionIndex: number;
    heading: string;
  };
};

type ContentAiRouter = {
  runTextTask<TOutput>(input: RunAiTextTaskInput<TOutput>): Promise<RunAiTextTaskResult<TOutput>>;
};

export type ContentSectionOutputByType = {
  outline: OutlineGenerationOutput;
  hook: HookGenerationOutput;
  titles: TitleGenerationOutput;
  caption: CaptionGenerationOutput;
  description: DescriptionGenerationOutput;
};

type SectionConfig<TSection extends ContentWorkspaceSectionType> = {
  taskType: (typeof AI_TASK_TYPES)[keyof typeof AI_TASK_TYPES];
  schema: z.ZodType<ContentSectionOutputByType[TSection]>;
  promptName: string;
};

const SECTION_CONFIGS: {
  [TSection in ContentWorkspaceSectionType]: SectionConfig<TSection>;
} = {
  outline: {
    taskType: AI_TASK_TYPES.outlineGeneration,
    schema: outlineGenerationSchema,
    promptName: "structured YouTube outline",
  },
  hook: {
    taskType: AI_TASK_TYPES.hookGeneration,
    schema: hookGenerationSchema,
    promptName: "YouTube hook options",
  },
  titles: {
    taskType: AI_TASK_TYPES.titleGeneration,
    schema: titleGenerationSchema,
    promptName: "YouTube title options",
  },
  caption: {
    taskType: AI_TASK_TYPES.captionGeneration,
    schema: captionGenerationSchema,
    promptName: "social caption options",
  },
  description: {
    taskType: AI_TASK_TYPES.descriptionGeneration,
    schema: descriptionGenerationSchema,
    promptName: "YouTube description",
  },
};

export async function generateContentSectionThroughRouter<TSection extends ContentWorkspaceSectionType>(
  aiRouter: ContentAiRouter,
  input: ContentGenerationContext &
    Pick<RunAiTextTaskInput<ContentSectionOutputByType[TSection]>, "onSuccessTransaction"> & {
      sectionType: TSection;
    },
): Promise<RunAiTextTaskResult<ContentSectionOutputByType[TSection]>> {
  const config = SECTION_CONFIGS[input.sectionType];

  return aiRouter.runTextTask({
    workspaceId: input.workspaceId,
    userId: input.userId,
    taskType: config.taskType,
    qualityTier: "standard",
    system: contentSystemPrompt(config.promptName),
    prompt: contentPrompt(input),
    schema: config.schema,
    referenceType: "ContentItem",
    referenceId: input.contentItem.id,
    metadata: {
      contentItemId: input.contentItem.id,
      sectionType: input.sectionType,
    },
    onSuccessTransaction: input.onSuccessTransaction,
  });
}

export async function generateOutlineThroughRouter(
  aiRouter: ContentAiRouter,
  input: ContentGenerationContext,
): Promise<RunAiTextTaskResult<OutlineGenerationOutput>> {
  return generateContentSectionThroughRouter(aiRouter, {
    ...input,
    sectionType: "outline",
  });
}

export async function generateScriptThroughRouter(
  aiRouter: ContentAiRouter,
  input: ContentGenerationContext &
    Pick<RunAiTextTaskInput<ScriptGenerationOutput>, "onSuccessTransaction"> & {
      selectedOutline: OutlineGenerationOutput;
    },
): Promise<RunAiTextTaskResult<ScriptGenerationOutput>> {
  return aiRouter.runTextTask({
    workspaceId: input.workspaceId,
    userId: input.userId,
    taskType: AI_TASK_TYPES.scriptGeneration,
    qualityTier: "premium",
    system: scriptSystemPrompt("full YouTube script"),
    prompt: contentPrompt(input),
    schema: scriptGenerationSchema,
    referenceType: "ContentItem",
    referenceId: input.contentItem.id,
    metadata: {
      contentItemId: input.contentItem.id,
      sectionType: "script",
    },
    onSuccessTransaction: input.onSuccessTransaction,
  });
}

export async function generateScriptSectionThroughRouter(
  aiRouter: ContentAiRouter,
  input: ContentGenerationContext &
    Pick<RunAiTextTaskInput<ScriptSectionGenerationOutput>, "onSuccessTransaction"> & {
      selectedOutline: OutlineGenerationOutput;
      selectedScript: ScriptGenerationOutput;
      scriptSection: {
        sectionIndex: number;
        heading: string;
      };
    },
): Promise<RunAiTextTaskResult<ScriptSectionGenerationOutput>> {
  return aiRouter.runTextTask({
    workspaceId: input.workspaceId,
    userId: input.userId,
    taskType: AI_TASK_TYPES.scriptGeneration,
    qualityTier: "standard",
    system: scriptSystemPrompt(`section ${input.scriptSection.sectionIndex + 1} of a YouTube script`),
    prompt: contentPrompt(input),
    schema: scriptSectionGenerationSchema,
    referenceType: "ContentItem",
    referenceId: input.contentItem.id,
    metadata: {
      contentItemId: input.contentItem.id,
      sectionType: "script_section",
      scriptSectionIndex: input.scriptSection.sectionIndex,
    },
    onSuccessTransaction: input.onSuccessTransaction,
  });
}

export async function generateRepurposingThroughRouter(
  aiRouter: ContentAiRouter,
  input: ContentGenerationContext &
    Pick<RunAiTextTaskInput<RepurposingGenerationOutput>, "onSuccessTransaction"> & {
      repurposingFormat: RepurposingFormat;
      repurposingSourceType: RepurposingSourceType;
      repurposingSourceContext: unknown;
    },
): Promise<RunAiTextTaskResult<RepurposingGenerationOutput>> {
  return aiRouter.runTextTask({
    workspaceId: input.workspaceId,
    userId: input.userId,
    taskType: AI_TASK_TYPES.repurposingGeneration,
    qualityTier: "standard",
    system: repurposingSystemPrompt(input.repurposingFormat),
    prompt: contentPrompt(input),
    schema: repurposingGenerationSchema,
    referenceType: "ContentItem",
    referenceId: input.contentItem.id,
    metadata: {
      contentItemId: input.contentItem.id,
      sectionType: "repurposing",
      repurposingFormat: input.repurposingFormat,
      repurposingSourceType: input.repurposingSourceType,
    },
    onSuccessTransaction: input.onSuccessTransaction,
  });
}

function contentSystemPrompt(assetName: string): string {
  return [
    `Generate ${assetName} for a YouTube creator using YTResearch evidence.`,
    "Keep the output original, evidence-led, and aligned with the user's brand voice.",
    "For descriptions, always include a chapters array. Use an empty array when chapter timestamps are not available.",
    "Return only structured data that matches the schema.",
  ].join("\n");
}

function repurposingSystemPrompt(format: RepurposingFormat): string {
  return [
    contentSystemPrompt(`repurposed ${format.toLowerCase().replaceAll("_", " ")} asset`),
    "Transform the selected source into a native social asset, not a summary.",
    "Preserve the strategic claim and evidence, but rewrite the framing for the selected platform.",
    "Use the user's brand voice, writing style, and CTA. Never invent evidence not present in the source context.",
    "Always include a LinkedIn-ready imageConcept with editable text overlays, even when the written format is not LinkedIn.",
  ].join("\n");
}

function scriptSystemPrompt(assetName: string): string {
  return [
    contentSystemPrompt(assetName),
    "Use selectedOutline as the script structure source of truth.",
    "Use the contentItem evidenceSnapshot as the factual and strategic grounding.",
    "Use generatedAssetsContext only as supporting inspiration for hooks, titles, positioning, phrasing, and tone.",
    "Do not let captions, hashtags, or descriptions override the selectedOutline structure.",
  ].join("\n");
}

function contentPrompt(input: ContentGenerationContext): string {
  return JSON.stringify(
    {
      brandVoice: input.brandVoice,
      writingStyleSample: input.writingStyleSample,
      cta: input.cta,
      contentItem: input.contentItem,
      selectedOutline: input.selectedOutline,
      generatedAssetsContext: input.generatedAssetsContext,
      selectedScript: input.selectedScript,
      repurposingFormat: input.repurposingFormat,
      repurposingSourceType: input.repurposingSourceType,
      repurposingSourceContext: input.repurposingSourceContext,
      scriptSection: input.scriptSection,
    },
    null,
    2,
  );
}
