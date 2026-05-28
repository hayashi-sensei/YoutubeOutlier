# Current Feature: Spec 026 Auth.js Google OAuth

This file tracks the active spec-driven development step for YTResearch.

## Status

- **Workflow State:** In Progress
- **Active Phase:** Review
- **Active Spec:** Spec 026: Auth.js Google OAuth
- **Spec File:** `docs/specs/026-authjs-google-oauth.md`
- **Implementation Status:** Implemented; verification passed
- **Branch:** `feat/spec-026-authjs-google-oauth`
- **Last Updated:** 2026-05-28

## Loaded Spec

Move YTResearch authentication from Supabase Auth to Auth.js with Google OAuth while preserving app user creation/linking, default workspace bootstrap, protected route behavior, server-side authorization, admin checks, and existing user/workspace ownership rules.

### Goals

- Install and configure Auth.js for Next.js App Router with the Google OAuth provider.
- Persist Auth.js users, accounts, and sessions through Prisma on Neon Postgres.
- Create or link the existing app `User` on first successful Google sign-in.
- Preserve the existing default workspace bootstrap behavior.
- Replace Supabase session reads with equivalent server-side Auth.js helpers for pages, route handlers, and server actions.
- Keep `/app/*` protected and redirect unauthenticated users to `/sign-in`.
- Keep `/app/admin` protected by server-side admin checks.
- Remove Supabase Auth usage only where Auth.js directly replaces it.
- Preserve `NEXT_PUBLIC_APP_URL` as the canonical app URL for redirects.
- Keep OAuth secrets and session data server-only.

### Non-Goals

- No email/password auth.
- No auth providers beyond Google.
- No billing, credits, storage, or AI behavior changes except where needed for session ownership.
- No client-side exposure of admin role or raw session tokens.

## Plan

Awaiting approval for the implementation plan shown in chat.

## Approval

Approved by `/feature start` on 2026-05-28.

## Implementation Notes

- Existing auth usage is Supabase-centered across `actions/*`, protected app pages, report export routes, `components/app-shell/app-shell.tsx`, `lib/admin/auth.ts`, `lib/auth/bootstrap.ts`, `proxy.ts`, and `lib/supabase/*`.
- Spec 025 explicitly left Supabase Auth removal for this spec, so Supabase Auth replacement is in scope here.
- Official Auth.js/Prisma guidance references `next-auth` plus `@auth/prisma-adapter`; implementation should verify exact current package versions during coding.
- Branch `feat/spec-026-authjs-google-oauth` created on 2026-05-28.
- Added Auth.js Google OAuth route handlers, Prisma-backed account/session persistence, and shared Auth.js server session helpers.
- Replaced Supabase session reads across protected app pages, server actions, report export routes, admin checks, and app shell.
- Removed email/password from active auth UI; sign-in and sign-up now use Google OAuth only.
- Added migration `0029_authjs_google_oauth` for Auth.js persistence tables and app user fields.

## Verification Plan

- Focused auth/admin/report-route tests after helper replacement: passed.
- `npm run prisma:validate`: passed.
- `npm run prisma:generate`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed, 73 files / 305 tests.
- `npm run build`: passed.
- Local dev check: `/sign-in` returned 200; unauthenticated `/app/dashboard` emitted `NEXT_REDIRECT` to `/sign-in?next=%2Fapp%2Fdashboard`.

## Review Summary

- Files created: `auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `lib/auth/session.ts`, `prisma/migrations/0029_authjs_google_oauth/migration.sql`.
- Files modified: Prisma schema, auth actions/pages, app shell, protected pages, server actions, export API routes, admin auth helper, env docs/schema notes, package manifests, and route test mocks.
- Deviations from plan: legacy `lib/supabase/*` files remain unused rather than deleted to avoid removing files without explicit deletion approval; active app code no longer imports them.
- Live Google OAuth initiation was verified locally with configured Google credentials and callback URL; full interactive Google account consent remains browser/user-driven.
- Follow-up spec added for email/password auth: `docs/specs/028-authjs-email-password.md`. This remains out of scope for Spec 026 until explicitly loaded and approved.

## Commit

Planned commit message after approval and implementation: `feat(spec-026): implement authjs google oauth`

## History

No active history.
