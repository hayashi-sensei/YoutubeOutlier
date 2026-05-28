# Spec 010: Outlier Scoring

## Goal

Calculate outlier and opportunity scores for competitor videos.

## Scope

- Channel baseline calculation
- Video score calculation
- Recent velocity calculation
- Engagement rate
- Topic/format repeat signal
- Score history

## Formula

Outlier Score v1:

- 40 percent relative view performance
- 25 percent view velocity
- 15 percent engagement rate
- 10 percent recency boost
- 10 percent topic/format repeat signal

Opportunity Score:

- Outlier score
- User niche relevance
- Topic freshness
- Competitive saturation
- Source/news corroboration
- Brand fit

## Acceptance Criteria

- Each eligible video has an outlier score.
- Scores compare video performance to channel baseline.
- Dashboard can rank top outliers.

