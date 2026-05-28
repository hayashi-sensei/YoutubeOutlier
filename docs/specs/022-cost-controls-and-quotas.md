# Spec 022: Cost Controls And Quotas

## Goal

Protect margins and prevent runaway provider usage.

## Scope

- Plan limits
- Workspace count limits
- Credit checks
- Provider quotas
- YouTube quota tracking
- AI cost budget alerts
- Abuse detection

## Requirements

- Every expensive task checks credits before execution.
- Workspace creation checks the account's plan-configured `maxWorkspaces` limit.
- AI cost is logged by task.
- Daily provider spend thresholds trigger alerts.
- Queue workers should stop or degrade noncritical jobs under quota pressure.

## Acceptance Criteria

- User cannot run paid task without credits.
- User cannot create more workspaces than the plan allows.
- Admin can see cost by user and task.
- Quota pressure creates alert.
