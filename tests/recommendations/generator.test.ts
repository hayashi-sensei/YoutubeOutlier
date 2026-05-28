import { describe, expect, test } from "vitest";

import { generateTopicRecommendations } from "../../lib/recommendations/generator";
import type { RecommendationGenerationInput } from "../../types/recommendations";

describe("generateTopicRecommendations", () => {
  test("returns at least five scored recommendations with cited evidence", () => {
    const recommendations = generateTopicRecommendations(fixtureInput());

    expect(recommendations).toHaveLength(5);
    expect(recommendations[0]).toEqual(
      expect.objectContaining({
        topic: "AI agent workflow implementation",
        suggestedTitle: expect.stringContaining("AI agent"),
        opportunityScore: 94,
      }),
    );
    for (const recommendation of recommendations) {
      expect(recommendation.evidence.length).toBeGreaterThan(0);
      expect(recommendation.evidence[0]).toEqual(
        expect.objectContaining({
          evidenceType: expect.any(String),
          note: expect.any(String),
        }),
      );
      expect(recommendation.suggestedHook.length).toBeGreaterThan(20);
      expect(recommendation.outline.sections.length).toBeGreaterThanOrEqual(5);
    }
  });

  test("filters topics that are already in the calendar or existing recommendations", () => {
    const recommendations = generateTopicRecommendations({
      ...fixtureInput(),
      calendarItems: [{ title: "AI agent workflow implementation", status: "IDEA" }],
      existingRecommendations: [{ topic: "Founder-led AI content systems", status: "SAVED" }],
    });

    expect(recommendations.map((item) => item.topic)).not.toContain(
      "AI agent workflow implementation",
    );
    expect(recommendations.map((item) => item.topic)).not.toContain(
      "Founder-led AI content systems",
    );
    expect(recommendations).toHaveLength(5);
  });
});

function fixtureInput(): RecommendationGenerationInput {
  return {
    now: new Date("2026-05-18T00:00:00Z"),
    workspaceOwnerId: "user-1",
    workspace: {
      primaryNiche: "AI, AI automation, and digital marketing",
      targetAudience:
        "Creators, agencies, coaches, course sellers, B2B SaaS marketers, and digital marketing consultants",
      brandVoice: "Direct, strategic, practical, evidence-led",
      contentGoals: "Build authority and turn research into weekly YouTube ideas",
      topicsToAvoid: null,
    },
    outliers: [
      {
        videoId: "video-agent-stack",
        youtubeVideoId: "yt-agent-stack",
        youtubeUrl: "https://www.youtube.com/watch?v=yt-agent-stack",
        title: "I Built 7 AI Agents That Run My Business",
        channelTitle: "AI Automation Lab",
        publishedAt: new Date("2026-05-10T00:00:00Z"),
        opportunityScore: 96,
        outlierScore: 92,
        multiplier: 6.4,
        analysis: {
          contentPillar: "AI agent workflow implementation",
          hookType: "proof first",
          titlePattern: "I built X that does Y",
          thumbnailPattern: "dashboard proof",
          emotionalAngle: "confidence",
          summary: "A practical agent stack outperformed the channel baseline.",
        },
      },
      {
        videoId: "video-linkedin",
        youtubeVideoId: "yt-linkedin",
        youtubeUrl: "https://www.youtube.com/watch?v=yt-linkedin",
        title: "The LinkedIn AI System I Use Every Morning",
        channelTitle: "Creator Ops",
        publishedAt: new Date("2026-05-12T00:00:00Z"),
        opportunityScore: 88,
        outlierScore: 84,
        multiplier: 4.1,
        analysis: {
          contentPillar: "Founder-led AI content systems",
          hookType: "routine teardown",
          titlePattern: "The system I use every morning",
          thumbnailPattern: "workflow screenshot",
          emotionalAngle: "relief",
          summary: "A daily publishing workflow resonated with operators.",
        },
      },
      {
        videoId: "video-no-code",
        youtubeVideoId: "yt-no-code",
        youtubeUrl: "https://www.youtube.com/watch?v=yt-no-code",
        title: "No-Code Automations That Save 10 Hours a Week",
        channelTitle: "Automation School",
        publishedAt: new Date("2026-05-08T00:00:00Z"),
        opportunityScore: 82,
        outlierScore: 80,
        multiplier: 3.7,
        analysis: {
          contentPillar: "No-code automation workflows",
          hookType: "time saved",
          titlePattern: "X that save Y hours",
          thumbnailPattern: "before after dashboard",
          emotionalAngle: "control",
          summary: "Automation ideas with concrete time savings performed well.",
        },
      },
    ],
    recentVideos: [
      {
        videoId: "recent-1",
        youtubeVideoId: "yt-recent-1",
        youtubeUrl: "https://www.youtube.com/watch?v=yt-recent-1",
        title: "5 AI Workflow Mistakes Creators Still Make",
        channelTitle: "AI Automation Lab",
        publishedAt: new Date("2026-05-16T00:00:00Z"),
      },
    ],
    sourceItems: [
      {
        sourceItemId: "source-1",
        url: "https://openai.com/news/agent-workflow-update",
        title: "New agent workflow update announced",
        sourceName: "OpenAI Blog",
        publishedAt: new Date("2026-05-17T00:00:00Z"),
        summary:
          "A new workflow feature creates a content opportunity around practical agent adoption.",
      },
      {
        sourceItemId: "source-2",
        url: "https://example.com/ai-operating-systems",
        title: "Marketers move AI from experiments to operating systems",
        sourceName: "Marketing Tech Daily",
        publishedAt: new Date("2026-05-15T00:00:00Z"),
        summary:
          "Teams are looking for repeatable AI operating systems rather than one-off prompts.",
      },
    ],
    blueprints: [
      {
        channelTitle: "AI Automation Lab",
        contentPillars: ["AI agent workflow implementation", "No-code automation workflows"],
        topVideoIds: ["video-agent-stack", "video-no-code"],
        titlePatterns: ["I built X that does Y", "X that save Y hours"],
        hookPatterns: ["proof first", "time saved"],
        thumbnailPatterns: ["dashboard proof", "before after dashboard"],
        emotionalAngles: ["confidence", "control"],
        averageOutlierScore: 88,
      },
    ],
    calendarItems: [],
    existingRecommendations: [],
  };
}

test("blueprint candidates carry linkable video evidence", () => {
  const input = fixtureInput();
  const recommendations = generateTopicRecommendations({
    ...input,
    outliers: [],
    recentVideos: [],
    sourceItems: [],
    blueprints: [
      {
        channelTitle: "AI Automation Lab",
        contentPillars: [
          "AI agent workflow implementation",
          "No-code automation workflows",
          "LinkedIn AI content workflow",
          "AI operating systems for content teams",
          "Practical AI tool stack comparison",
        ],
        topVideoIds: ["video-agent-stack", "video-no-code"],
        titlePatterns: ["I built X that does Y"],
        hookPatterns: ["proof first"],
        thumbnailPatterns: ["dashboard proof"],
        emotionalAngles: ["confidence"],
        averageOutlierScore: 88,
      },
    ],
  });

  expect(recommendations).toHaveLength(5);
  for (const recommendation of recommendations) {
    expect(recommendation.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceType: "competitor_blueprint",
          youtubeVideoId: expect.any(String),
        }),
      ]),
    );
  }
});
