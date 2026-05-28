import { describe, expect, test } from "vitest";

import {
  calculateChannelBaseline,
  calculateOpportunityScore,
  calculateOutlierScore,
  calculateRepeatSignalScore,
} from "../../lib/outliers/scoring";

const NOW = new Date("2026-05-18T00:00:00Z");

describe("calculateChannelBaseline", () => {
  test("returns the median of positive view counts", () => {
    expect(
      calculateChannelBaseline([
        { viewCount: 500 },
        { viewCount: 100 },
        { viewCount: 0 },
        { viewCount: null },
        { viewCount: 900 },
        { viewCount: 300 },
      ]),
    ).toBe(400);
  });

  test("returns null unless at least three positive view counts exist", () => {
    expect(
      calculateChannelBaseline([
        { viewCount: 100 },
        { viewCount: 200 },
        { viewCount: 0 },
      ]),
    ).toBeNull();
  });
});

describe("calculateOutlierScore", () => {
  test("returns null when latest views or channel baseline are missing or nonpositive", () => {
    expect(
      calculateOutlierScore({
        publishedAt: new Date("2026-05-17T00:00:00Z"),
        latestSnapshot: { viewCount: 0, capturedAt: NOW },
        channelBaselineViews: 1000,
        now: NOW,
      }),
    ).toBeNull();

    expect(
      calculateOutlierScore({
        publishedAt: new Date("2026-05-17T00:00:00Z"),
        latestSnapshot: { viewCount: 1000, capturedAt: NOW },
        channelBaselineViews: null,
        now: NOW,
      }),
    ).toBeNull();
  });

  test("calculates deterministic weighted component scores", () => {
    const score = calculateOutlierScore({
      publishedAt: new Date("2026-05-15T00:00:00Z"),
      previousSnapshot: {
        viewCount: 20_000,
        capturedAt: new Date("2026-05-16T00:00:00Z"),
      },
      latestSnapshot: {
        viewCount: 80_000,
        likeCount: 4_000,
        commentCount: 800,
        capturedAt: NOW,
      },
      channelBaselineViews: 20_000,
      repeatSignalScore: 80,
      now: NOW,
    });

    expect(score).toEqual({
      channelBaselineViews: 20_000,
      latestViewCount: 80_000,
      relativeViewPerformance: 4,
      relativeViewPerformanceScore: 95,
      viewVelocityScore: 100,
      engagementScore: 87.5,
      recencyScore: 96.4,
      repeatSignalScore: 80,
      outlierScore: 93.8,
      multiplier: 4,
      calculatedAt: NOW,
    });
  });

  test("clamps component scores and final score to 0-100", () => {
    const score = calculateOutlierScore({
      publishedAt: new Date("2026-05-18T00:00:00Z"),
      latestSnapshot: {
        viewCount: 1_000_000,
        likeCount: 500_000,
        commentCount: 200_000,
        capturedAt: NOW,
      },
      channelBaselineViews: 1_000,
      repeatSignalScore: 500,
      now: NOW,
    });

    expect(score?.relativeViewPerformanceScore).toBe(100);
    expect(score?.engagementScore).toBe(100);
    expect(score?.repeatSignalScore).toBe(100);
    expect(score?.outlierScore).toBeLessThanOrEqual(100);
  });
});

describe("calculateRepeatSignalScore", () => {
  test("rewards matching content pillar, hook type, title pattern, and tag overlap", () => {
    expect(
      calculateRepeatSignalScore({
        video: {
          contentPillar: "AI automation",
          hookType: "Contrarian",
          titlePattern: "I built X",
          tags: ["ai agents", "automation", "workflow"],
        },
        peers: [
          {
            contentPillar: "AI automation",
            hookType: "Contrarian",
            titlePattern: "I built X",
            tags: ["automation", "workflow", "tutorial"],
          },
        ],
      }),
    ).toBe(90);
  });

  test("returns zero when no peer signals match", () => {
    expect(
      calculateRepeatSignalScore({
        video: {
          contentPillar: "AI automation",
          hookType: "Contrarian",
          titlePattern: "I built X",
          tags: ["agents"],
        },
        peers: [
          {
            contentPillar: "Creator monetization",
            hookType: "Case study",
            titlePattern: "How to X",
            tags: ["sales"],
          },
        ],
      }),
    ).toBe(0);
  });
});

describe("calculateOpportunityScore", () => {
  test("combines outlier score with relevance, freshness, saturation, corroboration, and brand fit", () => {
    expect(
      calculateOpportunityScore({
        outlierScore: 90,
        userNicheRelevance: 85,
        topicFreshness: 80,
        competitiveSaturation: 70,
        sourceCorroboration: 60,
        brandFit: 95,
        now: NOW,
      }),
    ).toEqual({
      outlierScore: 90,
      userNicheRelevanceScore: 85,
      topicFreshnessScore: 80,
      competitiveSaturationScore: 70,
      sourceCorroborationScore: 60,
      brandFitScore: 95,
      opportunityScore: 83,
      calculatedAt: NOW,
    });
  });

  test("infers deterministic defaults from workspace and topic context", () => {
    const score = calculateOpportunityScore({
      outlierScore: {
        channelBaselineViews: 20_000,
        latestViewCount: 80_000,
        relativeViewPerformance: 4,
        relativeViewPerformanceScore: 95,
        viewVelocityScore: 100,
        engagementScore: 87.5,
        recencyScore: 96.4,
        repeatSignalScore: 80,
        outlierScore: 93.8,
        multiplier: 4,
        calculatedAt: NOW,
      },
      workspace: {
        primaryNiche: "AI automation and digital marketing",
        targetAudience: "Creators and agencies",
        brandVoice: "Direct practical evidence-led AI automation",
      },
      topic: "AI automation workflow for creators",
      angle: "A practical breakdown for agencies",
      publishedAt: new Date("2026-05-16T00:00:00Z"),
      now: NOW,
    });

    expect(score.outlierScore).toBe(93.8);
    expect(score.userNicheRelevanceScore).toBe(80);
    expect(score.topicFreshnessScore).toBe(100);
    expect(score.brandFitScore).toBe(80);
    expect(score.opportunityScore).toBe(83.8);
  });

  test("clamps explicit opportunity inputs", () => {
    const score = calculateOpportunityScore({
      outlierScore: 120,
      userNicheRelevance: -20,
      topicFreshness: 200,
      competitiveSaturation: 75,
      sourceCorroboration: 80,
      brandFit: 90,
      now: NOW,
    });

    expect(score.outlierScore).toBe(100);
    expect(score.userNicheRelevanceScore).toBe(0);
    expect(score.topicFreshnessScore).toBe(100);
    expect(score.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(score.opportunityScore).toBeLessThanOrEqual(100);
  });
});
