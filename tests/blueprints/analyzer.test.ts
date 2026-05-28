import { describe, expect, test } from "vitest";

import {
  analyzeBlueprintVideo,
  buildBlueprintSummary,
  sanitizePatternLanguage,
} from "../../lib/blueprints/analyzer";

const outlierVideos = [
  {
    videoId: "video-1",
    youtubeVideoId: "yt-1",
    title: "I Built 7 AI Agents That Run My Business",
    channelTitle: "AI Automation Lab",
    publishedAt: new Date("2026-05-10T00:00:00Z"),
    outlierScore: 92,
    opportunityScore: 88,
    multiplier: 6.4,
    analysis: {
      contentPillar: "AI agents",
      hookType: "build-in-public proof",
      titlePattern: "I built X that does Y",
      thumbnailPattern: "creator face plus numbered system",
      structureJson: {
        hook: "Shows the finished workflow before explaining the build.",
        structure: [
          { label: "Proof", summary: "Shows the working result." },
          { label: "Breakdown", summary: "Explains each agent role." },
          { label: "CTA", summary: "Invites viewers to subscribe for templates." },
        ],
      },
      ctaPattern: "Subscribe for weekly AI automation breakdowns",
      emotionalAngle: "relief from operational overwhelm",
      summary: "Case study about using AI agents to run repeatable creator workflows.",
    },
  },
  {
    videoId: "video-2",
    youtubeVideoId: "yt-2",
    title: "How I Replaced My Marketing Team With AI Workflows",
    channelTitle: "AI Automation Lab",
    publishedAt: new Date("2026-05-12T00:00:00Z"),
    outlierScore: 86,
    opportunityScore: 82,
    multiplier: 4.8,
    analysis: {
      contentPillar: "AI workflows",
      hookType: "before-after transformation",
      titlePattern: "How I replaced X with Y",
      thumbnailPattern: "before-after dashboard",
      structureJson: {
        hook: "Opens with the transformation claim.",
        structure: [
          { label: "Problem", summary: "Frames manual marketing bottlenecks." },
          { label: "System", summary: "Shows the workflow stack." },
        ],
      },
      ctaPattern: "Download the workflow checklist",
      emotionalAngle: "control and speed",
      summary: "Transformation video about replacing manual work with AI systems.",
    },
  },
];

describe("analyzeBlueprintVideo", () => {
  test("extracts non-copying observations from an analyzed outlier video", () => {
    const observation = analyzeBlueprintVideo(outlierVideos[0]);

    expect(observation.videoId).toBe("video-1");
    expect(observation.titlePattern).toBe("I built X that does Y");
    expect(observation.hookPattern).toBe("build-in-public proof");
    expect(observation.structurePattern).toContain("Proof");
    expect(observation.reusableInsight).toContain("Use the pattern");
    expect(observation.reusableInsight).not.toContain(outlierVideos[0].title);
  });
});

describe("buildBlueprintSummary", () => {
  test("rolls top outlier observations into ranked pattern groups", () => {
    const summary = buildBlueprintSummary({
      workspaceId: "workspace-1",
      youtubeChannelId: "channel-1",
      channelTitle: "AI Automation Lab",
      videos: outlierVideos,
      now: new Date("2026-05-18T00:00:00Z"),
    });

    expect(summary.videoCount).toBe(2);
    expect(summary.averageOutlierScore).toBe(89);
    expect(summary.titlePatterns).toContain("I built X that does Y");
    expect(summary.hookPatterns).toContain("build-in-public proof");
    expect(summary.contentPillars).toContain("AI agents");
    expect(summary.observations).toHaveLength(2);
  });
});

describe("sanitizePatternLanguage", () => {
  test("removes quoted competitor titles while keeping reusable strategic meaning", () => {
    const sanitized = sanitizePatternLanguage(
      'The exact title "I Built 7 AI Agents That Run My Business" works because proof comes first.',
      ["I Built 7 AI Agents That Run My Business"],
    );

    expect(sanitized).not.toContain("I Built 7 AI Agents That Run My Business");
    expect(sanitized).toContain("[competitor wording removed]");
  });
});
