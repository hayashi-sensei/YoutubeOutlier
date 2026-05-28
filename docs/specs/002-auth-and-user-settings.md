# Spec 002: Auth And User Settings

## Status

Complete.

## Implementation Summary

- Supabase Auth selected as the auth provider.
- Added Supabase SSR clients and Next.js proxy session refresh.
- Added sign-in, sign-up, and auth callback routes.
- Added Google OAuth server action and email/password sign-in/sign-up actions.
- Added first-login bootstrap for app `User`, default `Workspace`, `WorkspaceMember`, and `WorkspaceSettings`.
- Added route protection for `/app/*`.
- Added settings schema, settings server action, and `/app/settings` form.
- Added writing style sample persistence.
- Added `recommendationsStaleAt` for niche/audience changes.
- Applied migrations through `npm run db:migrate:pg`.

## Verification

Verified on 2026-05-17:

- `npm run prisma:validate` passes.
- `npm run prisma:generate` passes.
- `npm run typecheck` passes.
- `npm run build` passes.
- `npm run db:migrate:pg` applied `0001_init` and `0002_auth_user_settings`.
- Supabase database has 29 public tables and recorded both migrations.
- `/sign-in` returns 200.
- `/sign-up` returns 200.
- Unauthenticated `/app/dashboard` redirects to `/sign-in?next=%2Fapp%2Fdashboard`.
- `/api/health` returns `{"status":"ok","app":"ok","database":"ok"}`.
- Google OAuth sign-in works.
- Email registration page is available at `/sign-up`, with `/register` redirecting to it.
- Authenticated settings flow was manually tested.

## Operational Notes

- Supabase Auth is the auth provider for this spec.
- Resend should be used through Supabase Auth custom SMTP for auth emails.
- Direct app-level Resend email sending is deferred to email/report specs.

## Goal

Implement Google OAuth and user settings that drive the entire YTResearch intelligence layer.

## Scope

- Google OAuth
- User profile
- Individual account model
- Workspace-ready schema
- Niche settings
- Brand and writing style settings
- Report preferences

## Settings

- Primary niche
- Sub-niche
- Target audience
- Content goals
- Brand voice
- Writing style examples
- CTA
- Offers/products/services
- Topics to avoid
- Default AI quality tier
- Daily report enabled
- Report delivery email

## Requirements

- First login creates user and default workspace.
- User can change niche at any time.
- Niche changes should trigger stale recommendation flags.
- Store writing style examples as text records.

## Acceptance Criteria

- User can sign in with Google.
- User can save settings.
- Settings are available to AI tasks and recommendations.
