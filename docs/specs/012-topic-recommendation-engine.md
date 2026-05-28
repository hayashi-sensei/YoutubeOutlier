# Spec 012: Topic Recommendation Engine

## Goal

Recommend content topics users should create next.

## Scope

- Recommendation generation
- Opportunity scoring
- Evidence linking
- Manual save/dismiss
- Daily report integration

## Inputs

- Competitor outliers
- Recent competitor uploads
- Industry source items
- User niche
- User brand settings
- Calendar history
- Content gaps
- Repeated winning patterns

Recommendation prompts should stay lightweight by default. Use video titles, channel titles, opportunity/outlier scores, multipliers, compact video analysis fields, blueprint summaries, source headlines/summaries, and prior calendar/recommendation history. Do not include full transcripts or long descriptions unless a future deep-research action explicitly asks for that heavier context.

## Recommendation Output

- Topic
- Angle
- Why now
- Audience pain point
- Evidence links
- Opportunity score
- Suggested title
- Suggested hook
- Suggested thumbnail concept
- Suggested outline
- LinkedIn angle

## Experimental Recommendations

The Topic Ideas dashboard should include a "Try New Things" section. When clicked, it generates 5 experimental recommendations that still cite evidence but intentionally favor novel formats, contrarian angles, emerging patterns, and content experiments over safe repeats.

## Acceptance Criteria

- User receives at least five topic recommendations from a report run.
- Recommendations cite source evidence.
- User can save recommendation to calendar.
- User can generate five "Try New Things" ideas separately from standard recommendations.
