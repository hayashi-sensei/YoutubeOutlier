"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAiModelRouter, type AiModelRouterPrisma } from "@/lib/ai/model-router";
import {
  generateContentSectionThroughRouter,
  generateRepurposingThroughRouter,
  generateScriptSectionThroughRouter,
  generateScriptThroughRouter,
} from "@/lib/ai/tasks/content-generation";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { saveVersionedContentAsset, type ContentAssetWriterPrisma } from "@/lib/content-workspace/assets";
import {
  OPTIONAL_SCRIPT_CONTEXT_ASSET_TYPES,
  type OptionalScriptContextAssetType,
  SCRIPT_ASSET_TYPE,
  buildEditableScriptBody,
  replaceScriptSection,
  selectLatestOutlineForScript,
  selectOptionalScriptAssetContext,
  selectLatestStructuredScript,
} from "@/lib/content-workspace/scripts";
import {
  buildEditableRepurposingBody,
  repurposingAssetType,
  selectRepurposingSourceContext,
} from "@/lib/content-workspace/repurposing";
import {
  createManualContentWorkspace,
  openRecommendationContentWorkspace,
  type ContentWorkspaceSourcePrisma,
} from "@/lib/content-workspace/source";
import { getPrismaClient } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  manualContentTopicSchema,
  repurposingFormatSchema,
  repurposingSourceTypeSchema,
} from "@/schemas/content-generation";
import { CONTENT_WORKSPACE_SECTION_TYPES, type ContentWorkspaceSectionType } from "@/types/content-workspace";

function redirectTo(url: string): never {
  redirect(url as never);
}

async function getWorkspaceContextOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirectTo("/sign-in");
  }

  return bootstrapUserWorkspace(supabaseUser);
}

export async function openRecommendationWorkspace(formData: FormData) {
  const recommendationId = stringField(formData, "recommendationId");
  const { workspaceId } = await getWorkspaceContextOrRedirect();
  const prisma = getPrismaClient();
  const result = await openRecommendationContentWorkspace(prisma as unknown as ContentWorkspaceSourcePrisma, {
    workspaceId,
    recommendationId,
  });

  revalidatePath("/app/content-studio");
  redirectTo(`/app/content-studio/${result.contentItemId}`);
}

export async function createManualWorkspace(formData: FormData) {
  const rawAngle = formData.get("angle");
  const parsed = manualContentTopicSchema.safeParse({
    topic: formData.get("topic"),
    angle: typeof rawAngle === "string" && rawAngle.trim().length > 0 ? rawAngle : undefined,
  });
  if (!parsed.success) {
    redirectTo("/app/content-studio?error=manual_topic_invalid");
  }

  const { workspaceId } = await getWorkspaceContextOrRedirect();
  const prisma = getPrismaClient();
  const result = await createManualContentWorkspace(prisma as unknown as ContentWorkspaceSourcePrisma, {
    workspaceId,
    topic: parsed.data.topic,
    angle: parsed.data.angle,
  });

  revalidatePath("/app/content-studio");
  redirectTo(`/app/content-studio/${result.contentItemId}`);
}

export async function generateWorkspaceSection(formData: FormData) {
  const contentItemId = stringField(formData, "contentItemId");
  const sectionType = sectionField(formData, "sectionType");
  const { user, workspaceId } = await getWorkspaceContextOrRedirect();
  const prisma = getPrismaClient();
  const [settings, contentItem] = await Promise.all([
    prisma.workspaceSettings.findUnique({
      where: { workspaceId },
      select: {
        brandVoice: true,
        cta: true,
        writingSamples: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { sampleText: true },
        },
      },
    }),
    prisma.contentItem.findFirst({
      where: { id: contentItemId, workspaceId },
      select: {
        id: true,
        title: true,
        manualTopic: true,
        notes: true,
        evidenceSnapshot: true,
      },
    }),
  ]);

  if (!contentItem) {
    redirectTo("/app/content-studio?error=content_item_not_found");
  }

  const aiRouter = createAiModelRouter({ prisma: prisma as unknown as AiModelRouterPrisma });
  const result = await generateContentSectionThroughRouter(aiRouter, {
    workspaceId,
    userId: user.id,
    brandVoice: settings?.brandVoice,
    writingStyleSample: settings?.writingSamples[0]?.sampleText,
    cta: settings?.cta,
    contentItem,
    sectionType,
    onSuccessTransaction: async ({ generationId, result: generationResult, transaction }) => {
      if (!generationResult.output) {
        throw new Error("AI generation completed without structured output.");
      }
      await saveVersionedContentAsset(transaction as ContentAssetWriterPrisma, {
        contentItemId,
        assetType: sectionType,
        title: outputTitle(generationResult.output, sectionType),
        jsonBody: generationResult.output,
        aiGenerationId: generationId,
      });
    },
  });

  if (!result.output) {
    redirectTo(`/app/content-studio/${contentItemId}?error=${sectionType}_generation_failed`);
  }

  await prisma.contentItem.update({
    where: { id: contentItemId },
    data: sectionType === "outline" ? { status: "OUTLINE" } : { updatedAt: new Date() },
    select: { id: true },
  });

  revalidatePath(`/app/content-studio/${contentItemId}`);
  revalidatePath("/app/content-studio");
  revalidatePath("/app/calendar");
  revalidatePath("/app/billing");
  redirectTo(`/app/content-studio/${contentItemId}?generated=${sectionType}`);
}

export async function generateWorkspaceScript(formData: FormData) {
  const contentItemId = stringField(formData, "contentItemId");
  const { user, workspaceId } = await getWorkspaceContextOrRedirect();
  const prisma = getPrismaClient();
  const [settings, contentItem] = await Promise.all([
    loadWorkspaceWritingSettings(prisma, workspaceId),
    loadContentItemForGeneration(prisma, workspaceId, contentItemId),
  ]);

  if (!contentItem) {
    redirectTo("/app/content-studio?error=content_item_not_found");
  }

  const selectedOutline = safeSelectOutline(contentItem.assets);
  if (!selectedOutline) {
    redirectTo(`/app/content-studio/${contentItemId}?error=outline_required_for_script`);
  }
  const generatedAssetsContext = selectOptionalScriptAssetContext(
    contentItem.assets,
    optionalScriptContextFields(formData),
  );

  const aiRouter = createAiModelRouter({ prisma: prisma as unknown as AiModelRouterPrisma });
  const result = await generateScriptThroughRouter(aiRouter, {
    workspaceId,
    userId: user.id,
    brandVoice: settings?.brandVoice,
    writingStyleSample: settings?.writingSamples[0]?.sampleText,
    cta: settings?.cta,
    contentItem: toGenerationContentItem(contentItem),
    selectedOutline,
    generatedAssetsContext,
    onSuccessTransaction: async ({ generationId, result: generationResult, transaction }) => {
      if (!generationResult.output) {
        throw new Error("AI script generation completed without structured output.");
      }
      await saveVersionedContentAsset(transaction as ContentAssetWriterPrisma, {
        contentItemId,
        assetType: SCRIPT_ASSET_TYPE,
        title: generationResult.output.title,
        body: buildEditableScriptBody(generationResult.output),
        jsonBody: generationResult.output,
        aiGenerationId: generationId,
      });
    },
  }).catch(() => null);

  if (!result?.output) {
    redirectTo(`/app/content-studio/${contentItemId}?error=script_generation_failed`);
  }

  await prisma.contentItem.update({
    where: { id: contentItemId },
    data: { status: "SCRIPT" },
    select: { id: true },
  });

  revalidateContentWorkspace(contentItemId);
  redirectTo(`/app/content-studio/${contentItemId}?generated=script`);
}

export async function regenerateWorkspaceScriptSection(formData: FormData) {
  const contentItemId = stringField(formData, "contentItemId");
  const sectionIndex = numberField(formData, "sectionIndex");
  const { user, workspaceId } = await getWorkspaceContextOrRedirect();
  const prisma = getPrismaClient();
  const [settings, contentItem] = await Promise.all([
    loadWorkspaceWritingSettings(prisma, workspaceId),
    loadContentItemForGeneration(prisma, workspaceId, contentItemId),
  ]);

  if (!contentItem) {
    redirectTo("/app/content-studio?error=content_item_not_found");
  }

  const selectedOutline = safeSelectOutline(contentItem.assets);
  const selectedScript = safeSelectScript(contentItem.assets);
  if (!selectedOutline || !selectedScript) {
    redirectTo(`/app/content-studio/${contentItemId}?error=script_section_context_missing`);
  }

  const currentSection = selectedScript.sections[sectionIndex];
  if (!currentSection) {
    redirectTo(`/app/content-studio/${contentItemId}?error=script_section_not_found`);
  }

  const aiRouter = createAiModelRouter({ prisma: prisma as unknown as AiModelRouterPrisma });
  const result = await generateScriptSectionThroughRouter(aiRouter, {
    workspaceId,
    userId: user.id,
    brandVoice: settings?.brandVoice,
    writingStyleSample: settings?.writingSamples[0]?.sampleText,
    cta: settings?.cta,
    contentItem: toGenerationContentItem(contentItem),
    selectedOutline,
    selectedScript,
    scriptSection: {
      sectionIndex,
      heading: currentSection.heading,
    },
    onSuccessTransaction: async ({ generationId, result: generationResult, transaction }) => {
      if (!generationResult.output) {
        throw new Error("AI script section generation completed without structured output.");
      }
      const updatedScript = replaceScriptSection(selectedScript, {
        ...generationResult.output,
        sectionIndex,
      });
      await saveVersionedContentAsset(transaction as ContentAssetWriterPrisma, {
        contentItemId,
        assetType: SCRIPT_ASSET_TYPE,
        title: updatedScript.title,
        body: buildEditableScriptBody(updatedScript),
        jsonBody: updatedScript,
        aiGenerationId: generationId,
      });
    },
  }).catch(() => null);

  if (!result?.output) {
    redirectTo(`/app/content-studio/${contentItemId}?error=script_section_generation_failed`);
  }

  revalidateContentWorkspace(contentItemId);
  redirectTo(`/app/content-studio/${contentItemId}?generated=script_section`);
}

export async function saveEditedScriptAsset(formData: FormData) {
  const contentItemId = stringField(formData, "contentItemId");
  const body = stringField(formData, "body");
  const { workspaceId } = await getWorkspaceContextOrRedirect();
  const prisma = getPrismaClient();
  const contentItem = await loadContentItemForGeneration(prisma, workspaceId, contentItemId);

  if (!contentItem) {
    redirectTo("/app/content-studio?error=content_item_not_found");
  }

  const latestScript = safeSelectScript(contentItem.assets);
  await prisma.$transaction(async (transaction) => {
    await saveVersionedContentAsset(transaction as unknown as ContentAssetWriterPrisma, {
      contentItemId,
      assetType: SCRIPT_ASSET_TYPE,
      title: latestScript?.title ?? `${contentItem.title} script`,
      body,
      jsonBody: latestScript
        ? {
            ...latestScript,
            editedBody: body,
          }
        : { title: contentItem.title, editedBody: body },
    });

    await transaction.contentItem.update({
      where: { id: contentItemId },
      data: { status: "SCRIPT" },
      select: { id: true },
    });
  });

  revalidateContentWorkspace(contentItemId);
  redirectTo(`/app/content-studio/${contentItemId}?saved=script`);
}

export async function generateWorkspaceRepurposing(formData: FormData) {
  const contentItemId = stringField(formData, "contentItemId");
  const parsedFormat = repurposingFormatSchema.safeParse(formData.get("format"));
  const parsedSourceType = repurposingSourceTypeSchema.safeParse(formData.get("sourceType"));

  if (!parsedFormat.success || !parsedSourceType.success) {
    redirectTo(`/app/content-studio/${contentItemId}?error=repurposing_input_invalid`);
  }

  const { user, workspaceId } = await getWorkspaceContextOrRedirect();
  const prisma = getPrismaClient();
  const [settings, contentItem] = await Promise.all([
    loadWorkspaceWritingSettings(prisma, workspaceId),
    loadContentItemForGeneration(prisma, workspaceId, contentItemId),
  ]);

  if (!contentItem) {
    redirectTo("/app/content-studio?error=content_item_not_found");
  }

  let sourceContext: unknown;
  try {
    sourceContext = selectRepurposingSourceContext(contentItem.assets, parsedSourceType.data, contentItem);
  } catch {
    redirectTo(`/app/content-studio/${contentItemId}?error=repurposing_source_missing`);
  }

  const assetType = repurposingAssetType(parsedFormat.data);
  const aiRouter = createAiModelRouter({ prisma: prisma as unknown as AiModelRouterPrisma });
  const result = await generateRepurposingThroughRouter(aiRouter, {
    workspaceId,
    userId: user.id,
    brandVoice: settings?.brandVoice,
    writingStyleSample: settings?.writingSamples[0]?.sampleText,
    cta: settings?.cta,
    contentItem: toGenerationContentItem(contentItem),
    repurposingFormat: parsedFormat.data,
    repurposingSourceType: parsedSourceType.data,
    repurposingSourceContext: sourceContext,
    onSuccessTransaction: async ({ generationId, result: generationResult, transaction }) => {
      if (!generationResult.output) {
        throw new Error("AI repurposing generation completed without structured output.");
      }
      await saveVersionedContentAsset(transaction as ContentAssetWriterPrisma, {
        contentItemId,
        assetType,
        title: generationResult.output.title,
        body: buildEditableRepurposingBody(generationResult.output),
        jsonBody: generationResult.output,
        aiGenerationId: generationId,
      });
    },
  }).catch(() => null);

  if (!result?.output) {
    redirectTo(`/app/content-studio/${contentItemId}?error=repurposing_generation_failed`);
  }

  await prisma.contentItem.update({
    where: { id: contentItemId },
    data: { updatedAt: new Date() },
    select: { id: true },
  });

  revalidateContentWorkspace(contentItemId);
  redirectTo(`/app/content-studio/${contentItemId}?generated=repurposing`);
}

export async function saveRepurposingToCalendar(formData: FormData) {
  const contentItemId = stringField(formData, "contentItemId");
  let scheduledDate: Date;
  try {
    scheduledDate = dateField(formData, "scheduledFor");
  } catch {
    redirectTo(`/app/content-studio/${contentItemId}?error=calendar_date_invalid`);
  }
  const { workspaceId } = await getWorkspaceContextOrRedirect();
  const prisma = getPrismaClient();
  const contentItem = await prisma.contentItem.findFirst({
    where: { id: contentItemId, workspaceId },
    select: { id: true },
  });

  if (!contentItem) {
    redirectTo("/app/content-studio?error=content_item_not_found");
  }

  await prisma.contentItem.update({
    where: { id: contentItemId },
    data: {
      status: "SCHEDULED",
      scheduledFor: scheduledDate,
    },
    select: { id: true },
  });

  revalidateContentWorkspace(contentItemId);
  redirectTo(`/app/content-studio/${contentItemId}?saved=calendar`);
}

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function dateField(formData: FormData, key: string): Date {
  const value = stringField(formData, key);
  const date = new Date(`${value}T09:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${key} must be a valid date.`);
  }
  return date;
}

function numberField(formData: FormData, key: string): number {
  const value = Number.parseInt(stringField(formData, key), 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer.`);
  }
  return value;
}

function sectionField(formData: FormData, key: string): ContentWorkspaceSectionType {
  const value = stringField(formData, key);
  if (CONTENT_WORKSPACE_SECTION_TYPES.includes(value as ContentWorkspaceSectionType)) {
    return value as ContentWorkspaceSectionType;
  }
  throw new Error(`${key} must be a supported content section.`);
}

function outputTitle(output: unknown, sectionType: ContentWorkspaceSectionType): string {
  if (typeof output === "object" && output !== null && "title" in output) {
    const title = (output as { title?: unknown }).title;
    if (typeof title === "string" && title.length > 0) {
      return title;
    }
  }
  return `${sectionType} asset`;
}

function loadWorkspaceWritingSettings(prisma: ReturnType<typeof getPrismaClient>, workspaceId: string) {
  return prisma.workspaceSettings.findUnique({
    where: { workspaceId },
    select: {
      brandVoice: true,
      cta: true,
      writingSamples: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { sampleText: true },
      },
    },
  });
}

function loadContentItemForGeneration(
  prisma: ReturnType<typeof getPrismaClient>,
  workspaceId: string,
  contentItemId: string,
) {
  return prisma.contentItem.findFirst({
    where: { id: contentItemId, workspaceId },
    select: {
      id: true,
      title: true,
      manualTopic: true,
      notes: true,
      evidenceSnapshot: true,
      recommendation: {
        select: {
          report: {
            select: {
              id: true,
              title: true,
              summary: true,
              reportDate: true,
              sectionsJson: true,
            },
          },
        },
      },
      assets: {
        orderBy: [{ assetType: "asc" }, { version: "desc" }],
        select: {
          assetType: true,
          version: true,
          title: true,
          jsonBody: true,
        },
      },
    },
  });
}

function safeSelectOutline(assets: Array<{ assetType: string; version: number; jsonBody: unknown }>) {
  try {
    return selectLatestOutlineForScript(assets);
  } catch {
    return null;
  }
}

function safeSelectScript(assets: Array<{ assetType: string; version: number; jsonBody: unknown }>) {
  try {
    return selectLatestStructuredScript(assets);
  } catch {
    return null;
  }
}

function optionalScriptContextFields(formData: FormData): OptionalScriptContextAssetType[] {
  return formData
    .getAll("includeAssetTypes")
    .filter((value): value is OptionalScriptContextAssetType =>
      typeof value === "string" &&
      OPTIONAL_SCRIPT_CONTEXT_ASSET_TYPES.includes(value as OptionalScriptContextAssetType),
    );
}

function revalidateContentWorkspace(contentItemId: string) {
  revalidatePath(`/app/content-studio/${contentItemId}`);
  revalidatePath("/app/content-studio");
  revalidatePath("/app/calendar");
  revalidatePath("/app/billing");
}

function toGenerationContentItem<TContentItem extends {
  id: string;
  title: string;
  manualTopic: string | null;
  notes: string | null;
  evidenceSnapshot: unknown;
}>(contentItem: TContentItem) {
  return {
    id: contentItem.id,
    title: contentItem.title,
    manualTopic: contentItem.manualTopic,
    notes: contentItem.notes,
    evidenceSnapshot: contentItem.evidenceSnapshot,
  };
}
