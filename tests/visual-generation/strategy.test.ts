import { describe, expect, test } from "vitest";

import {
  buildVisualStrategy,
  dataUrlFromImageFile,
  visualAssetDimensions,
  visualAssetStoragePath,
} from "../../lib/visual-generation/strategy";

describe("visual generation strategy", () => {
  test("creates a text-free thumbnail image prompt with editable overlays", () => {
    const strategy = buildVisualStrategy({
      assetType: "YOUTUBE_THUMBNAIL",
      aspectRatio: "16:9",
      brandVoice: "Direct and evidence-led",
      contentItem: {
        id: "content-1",
        title: "5 AI Agents That Run My Content Business",
        evidenceSnapshot: {
          recommendation: {
            whyNow: "Three competitor outliers show the topic is accelerating.",
            audiencePainPoint: "Creators need practical workflows.",
          },
          channel: { title: "AI Automation Lab" },
          evidences: [{ video: { title: "I Built 7 AI Agents" } }],
        },
        recommendation: {
          topic: "AI agents",
          angle: "Show the actual stack",
          suggestedHook: "Most AI agent demos never run a business.",
          thumbnailConcept: "Creator dashboard with five labeled agent cards",
          linkedinAngle: "Practical agent adoption",
        },
      },
    });

    expect(strategy.conceptTitle).toContain("Thumbnail concept");
    expect(strategy.imagePrompt).toContain("Do not render words");
    expect(strategy.imagePrompt).toContain("Three competitor outliers");
    expect(strategy.editableOverlays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "headline",
          text: "5 AI AGENTS THAT RUN",
        }),
      ]),
    );
  });

  test("uses stable dimensions and traceable storage paths", () => {
    expect(visualAssetDimensions("16:9")).toEqual({ width: 1280, height: 720 });
    expect(visualAssetDimensions("4:5")).toEqual({ width: 1080, height: 1350 });
    expect(visualAssetDimensions("1:1")).toEqual({ width: 1200, height: 1200 });

    expect(
      visualAssetStoragePath({
        workspaceId: "workspace-1",
        contentItemId: "content-1",
        assetType: "LINKEDIN_IMAGE",
        generationId: "generation-1",
        mediaType: "image/webp",
      }),
    ).toBe("visual-assets/workspace-1/content-items/content-1/linkedin_image/generation-1.webp");
  });

  test("builds preview data URLs from generated image files", () => {
    expect(dataUrlFromImageFile({ mediaType: "image/png", base64: "abc123" })).toBe("data:image/png;base64,abc123");
    expect(dataUrlFromImageFile(undefined)).toBeNull();
  });
});
