import { describe, expect, test } from "vitest";

import {
  generateContentSectionThroughRouter,
  generateOutlineThroughRouter,
  generateRepurposingThroughRouter,
  generateScriptThroughRouter,
} from "../../lib/ai/tasks/content-generation";
import { AI_TASK_TYPES } from "../../types/ai";
import type { RunAiTextTaskInput, RunAiTextTaskResult } from "../../types/ai";

const context = {
  workspaceId: "workspace-1",
  userId: "user-1",
  brandVoice: "Direct",
  writingStyleSample: "Short, practical sentences.",
  cta: "Subscribe",
  contentItem: {
    id: "content-1",
    title: "Build an AI workflow",
    manualTopic: null,
    notes: null,
    evidenceSnapshot: {
      workspaceId: "workspace-1",
      sourceType: "recommendation",
      recommendation: {
        id: "rec-1",
        topic: "AI workflow",
        title: "AI workflow",
        angle: "Build it simply",
        whyNow: "Competitors are spiking",
        audiencePainPoint: "Too much complexity",
        opportunityScore: 91,
        suggestedTitle: "Build This AI Workflow",
        suggestedHook: "Most demos fail.",
        thumbnailConcept: "Workflow blocks",
        linkedinAngle: "Practical lesson",
        sourceTrackedChannelId: null,
      },
      evidences: [],
    },
  },
};

describe("content generation task orchestration", () => {
  test("routes hook generation through the hook task with content item reference", async () => {
    const output = { title: "Hooks", hooks: ["1", "2", "3", "4", "5"], rationale: "Variety" };
    const calls: Array<RunAiTextTaskInput<unknown>> = [];
    const router = {
      async runTextTask<TOutput>(input: RunAiTextTaskInput<TOutput>): Promise<RunAiTextTaskResult<TOutput>> {
        calls.push(input as RunAiTextTaskInput<unknown>);
        return {
        text: "",
        output: output as TOutput,
        usage: {},
        generationId: "gen-1",
        provider: "openai" as const,
        model: "gpt-5.4",
        creditsCharged: 2,
        costUsd: 0.02,
        };
      },
    };

    await generateContentSectionThroughRouter(router, { ...context, sectionType: "hook" });

    expect(calls[0]).toEqual(
      expect.objectContaining({
        taskType: AI_TASK_TYPES.hookGeneration,
        referenceType: "ContentItem",
        referenceId: "content-1",
        qualityTier: "standard",
      }),
    );
  });

  test("keeps script generation on the explicit script route", async () => {
    const output = {
      title: "Script",
      estimatedDurationMinutes: 8,
      sections: Array.from({ length: 5 }, (_, index) => ({ heading: `S${index}`, script: "Body" })),
      description: "Desc",
    };
    const calls: Array<RunAiTextTaskInput<unknown>> = [];
    const router = {
      async runTextTask<TOutput>(input: RunAiTextTaskInput<TOutput>): Promise<RunAiTextTaskResult<TOutput>> {
        calls.push(input as RunAiTextTaskInput<unknown>);
        return {
        text: "",
        output: output as TOutput,
        usage: {},
        generationId: "gen-1",
        provider: "openai" as const,
        model: "gpt-5.4",
        creditsCharged: 6,
        costUsd: 0.12,
        };
      },
    };

    const onSuccessTransaction = async () => undefined;

    await generateScriptThroughRouter(router, {
      ...context,
      selectedOutline: {
        title: "Outline",
        hookOptions: ["Hook A", "Hook B", "Hook C"],
        sections: Array.from({ length: 5 }, (_, index) => ({
          heading: `Outline ${index}`,
          purpose: "Teach the point",
          talkingPoints: ["A", "B"],
        })),
        cta: "Subscribe",
      },
      generatedAssetsContext: [
        {
          assetType: "hook",
          title: "Hooks",
          version: 2,
          jsonBody: { hooks: ["Strong hook"] },
        },
        {
          assetType: "titles",
          title: "Titles",
          version: 1,
          jsonBody: { titles: ["Strong title"], titlePatterns: ["Contrarian"] },
        },
      ],
      onSuccessTransaction,
    });

    expect(calls[0]).toEqual(
      expect.objectContaining({
        taskType: AI_TASK_TYPES.scriptGeneration,
        qualityTier: "premium",
        metadata: expect.objectContaining({ sectionType: "script" }),
        onSuccessTransaction,
      }),
    );
    expect(calls[0]?.prompt).toContain("selectedOutline");
    expect(calls[0]?.prompt).toContain("Outline 0");
    expect(calls[0]?.prompt).toContain("generatedAssetsContext");
    expect(calls[0]?.prompt).toContain("Strong hook");
    expect(calls[0]?.prompt).toContain("Strong title");
    expect(calls[0]?.system).toContain("Use selectedOutline as the script structure source of truth");
    expect(calls[0]?.system).toContain("Use generatedAssetsContext only as supporting inspiration");
  });

  test("outline generation still uses outline_generation", async () => {
    const output = {
      title: "Outline",
      hookOptions: ["a", "b", "c"],
      sections: Array.from({ length: 5 }, (_, index) => ({
        heading: `S${index}`,
        purpose: "Purpose",
        talkingPoints: ["A", "B"],
      })),
      cta: "Subscribe",
    };
    const calls: Array<RunAiTextTaskInput<unknown>> = [];
    const router = {
      async runTextTask<TOutput>(input: RunAiTextTaskInput<TOutput>): Promise<RunAiTextTaskResult<TOutput>> {
        calls.push(input as RunAiTextTaskInput<unknown>);
        return {
        text: "",
        output: output as TOutput,
        usage: {},
        generationId: "gen-1",
        provider: "openai" as const,
        model: "gpt-5.4",
        creditsCharged: 2,
        costUsd: 0.03,
        };
      },
    };

    await generateOutlineThroughRouter(router, context);

    expect(calls[0]).toEqual(
      expect.objectContaining({ taskType: AI_TASK_TYPES.outlineGeneration }),
    );
  });

  test("routes description generation through the description task", async () => {
    const output = {
      title: "Description",
      description: "A clear YouTube description.",
      chapters: [],
      pinnedComment: "What would you build first?",
    };
    const calls: Array<RunAiTextTaskInput<unknown>> = [];
    const router = {
      async runTextTask<TOutput>(input: RunAiTextTaskInput<TOutput>): Promise<RunAiTextTaskResult<TOutput>> {
        calls.push(input as RunAiTextTaskInput<unknown>);
        return {
          text: "",
          output: output as TOutput,
          usage: {},
          generationId: "gen-1",
          provider: "openai" as const,
          model: "gpt-5.4",
          creditsCharged: 2,
          costUsd: 0.03,
        };
      },
    };

    await generateContentSectionThroughRouter(router, { ...context, sectionType: "description" });

    expect(calls[0]).toEqual(
      expect.objectContaining({
        taskType: AI_TASK_TYPES.descriptionGeneration,
        referenceType: "ContentItem",
        referenceId: "content-1",
      }),
    );
  });

  test("routes repurposing through the dedicated task with selected format and source metadata", async () => {
    const output = {
      title: "LinkedIn post",
      format: "LINKEDIN_THOUGHT_LEADERSHIP" as const,
      sourceType: "outline" as const,
      primaryDraft: "A native LinkedIn post.",
      hook: "Most workflow advice skips the boring part.",
      cta: "Subscribe",
      platformNotes: ["Keep paragraphs short.", "Lead with the practical tension."],
      imageConcept: {
        headline: "The Workflow Gap",
        visualMetaphor: "Two dashboards side by side.",
        composition: "Clean creator workspace with a simple process map.",
        editableTextOverlays: ["Workflow gap", "Fix this first"],
        aspectRatio: "4:5" as const,
      },
    };
    const calls: Array<RunAiTextTaskInput<unknown>> = [];
    const router = {
      async runTextTask<TOutput>(input: RunAiTextTaskInput<TOutput>): Promise<RunAiTextTaskResult<TOutput>> {
        calls.push(input as RunAiTextTaskInput<unknown>);
        return {
          text: "",
          output: output as TOutput,
          usage: {},
          generationId: "gen-1",
          provider: "openai" as const,
          model: "gpt-5.4",
          creditsCharged: 2,
          costUsd: 0.03,
        };
      },
    };

    await generateRepurposingThroughRouter(router, {
      ...context,
      repurposingFormat: "LINKEDIN_THOUGHT_LEADERSHIP",
      repurposingSourceType: "outline",
      repurposingSourceContext: { sourceType: "outline", outline: { title: "Outline" } },
    });

    expect(calls[0]).toEqual(
      expect.objectContaining({
        taskType: AI_TASK_TYPES.repurposingGeneration,
        referenceType: "ContentItem",
        referenceId: "content-1",
        metadata: expect.objectContaining({
          sectionType: "repurposing",
          repurposingFormat: "LINKEDIN_THOUGHT_LEADERSHIP",
          repurposingSourceType: "outline",
        }),
      }),
    );
    expect(calls[0]?.prompt).toContain("repurposingSourceContext");
    expect(calls[0]?.system).toContain("native social asset");
  });
});
