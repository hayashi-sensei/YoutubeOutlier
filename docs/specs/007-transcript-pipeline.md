# Spec 007: Transcript Pipeline

## Goal

Retrieve and analyze transcripts where available.

## Scope

- Provider abstraction
- Transcript fetch attempts
- Transcript storage
- Transcript analysis
- Fallback handling

## Requirements

- Transcript provider must be swappable.
- Store transcript status: available, unavailable, failed, skipped.
- Analyze transcript for hook, structure, CTA, claims, summary, and content pillars.
- Fall back to metadata-only analysis when transcript is unavailable.

## Acceptance Criteria

- Transcript fetch can be queued per video.
- Transcript analysis result is stored.
- Failed transcripts do not block report generation.

