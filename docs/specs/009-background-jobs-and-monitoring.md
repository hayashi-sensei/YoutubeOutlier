# Spec 009: Background Jobs And Monitoring

## Goal

Implement durable background processing for ingestion, reports, AI analysis, exports, and notifications.

## Scope

- Job queue
- Scheduled jobs
- Retry logic
- Job status table
- Error tracking
- Cost and quota metrics

## Requirements

- Daily reports only run for users who enable them.
- Manual generate-now jobs are supported.
- Jobs are idempotent where possible.
- Failed jobs can be retried from admin.
- Store provider error payloads safely.

## Acceptance Criteria

- Background jobs can run independently of web requests.
- Job failures are visible in admin.
- Queue latency and failures are tracked.

