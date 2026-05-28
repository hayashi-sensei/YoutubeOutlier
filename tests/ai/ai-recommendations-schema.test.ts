import { describe, expect, test } from "vitest";

import { aiTopicRecommendationsSchema } from "../../schemas/ai-recommendations";

describe("AI topic recommendation schema", () => {
  test("uses nullable evidence IDs instead of optional IDs for strict structured output", () => {
    const parsed = aiTopicRecommendationsSchema.parse({
      recommendations: Array.from({ length: 5 }, (_, index) => ({
        title: `Title ${index}`,
        topic: `Topic ${index}`,
        angle: "Evidence-led angle",
        whyNow: "The evidence is timely.",
        audiencePainPoint: "Audience needs clearer guidance.",
        opportunityScore: 80,
        suggestedTitle: `Suggested title ${index}`,
        suggestedHook: "A strong opening hook",
        thumbnailConcept: "High contrast practical thumbnail",
        outline: { sections: ["One", "Two", "Three", "Four", "Five"] },
        linkedinAngle: "Professional takeaway",
        evidence: [
          {
            youtubeVideoId: index % 2 === 0 ? "video-1" : null,
            sourceItemId: index % 2 === 0 ? null : "source-1",
            evidenceType: "outlier_video",
            note: "Evidence note",
          },
        ],
      })),
    });

    expect(parsed.recommendations[0].evidence[0]).toEqual(
      expect.objectContaining({
        youtubeVideoId: "video-1",
        sourceItemId: null,
      }),
    );
  });
});
