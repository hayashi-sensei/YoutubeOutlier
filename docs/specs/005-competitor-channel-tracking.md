# Spec 005: Competitor Channel Tracking

## Goal

Allow users to track competitor YouTube channels and receive AI recommendations for additional competitors.

## Scope

- Manual competitor channel entry
- Channel URL parsing
- Global channel records
- User tracked channel records
- AI competitor recommendation queue
- Competitor dashboard entry points into per-channel intelligence

## Requirements

- Users can add a YouTube channel URL.
- App resolves URL to global channel ID.
- Duplicate global channels are reused.
- Plan limits restrict tracked channel count.
- User can archive a tracked competitor.
- App recommends competitors based on niche, keywords, and existing competitor graph.
- Each active tracked channel links to a channel intelligence view with channel stats, baseline views, ingestion status, top outliers, current blueprint, and channel-specific topic suggestion actions.

## Acceptance Criteria

- User can add and remove competitor tracking.
- Duplicate channels do not create duplicate global records.
- Recommended competitors require user approval before tracking.
- User can open a tracked competitor and understand what is working on that specific channel.
