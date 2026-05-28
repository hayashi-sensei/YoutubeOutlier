# Spec 023: Security RLS And Compliance

## Goal

Secure user data, billing data, generated assets, reports, and admin actions.

## Scope

- Supabase RLS
- Service role isolation
- Admin role model
- Audit logs
- Storage policies
- Prompt/output privacy

## Requirements

- RLS on exposed tables.
- Do not authorize using user-editable metadata.
- Keep service role out of client.
- Admin actions are audited.
- Storage objects are user-scoped.

## Acceptance Criteria

- Users can only access their own workspace data.
- Admin access is explicitly controlled.
- Sensitive keys are server-only.

