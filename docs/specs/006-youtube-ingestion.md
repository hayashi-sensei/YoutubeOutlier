# Spec 006: YouTube Ingestion

## Goal

Ingest YouTube channel and video metadata for competitor research.

## Scope

- Channel metadata
- Upload playlist discovery
- Video metadata collection
- Metric snapshots
- Recent 21-day monitoring
- Initial historical backfill

## Requirements

- Backfill last 100 videos or last 12 months.
- Avoid expensive API calls where possible.
- Store video metric snapshots over time.
- Track ingestion freshness.
- Respect provider quotas.
- Global cache prevents duplicate fetches for the same channel.

## Acceptance Criteria

- Channel backfill creates video records.
- Daily refresh updates recent videos and metric snapshots.
- Ingestion job logs success/failure.

