# Spec 004: Admin Foundation

## Goal

Create internal admin tooling for operating YTResearch.

## Scope

- Admin-only route protection
- User lookup
- Subscription status
- Credit adjustment
- Job overview
- AI generation logs
- Provider failure summary

## Requirements

- Admin role must not rely on user-editable metadata.
- Admin actions should be audited.
- Admin can retry failed report jobs.
- Admin can inspect usage by user.

## Acceptance Criteria

- Admin can find a user.
- Admin can view subscription and credit status.
- Admin can adjust credits with an audit reason.
- Admin can see recent failed jobs.

