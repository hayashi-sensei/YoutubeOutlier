# Spec 026: Auth.js Google OAuth

## Goal

Move YTResearch authentication from Supabase Auth to Auth.js with Google OAuth while preserving user, workspace, admin, and server-side authorization behavior.

## Scope

- Auth.js installation and Next.js App Router integration
- Google OAuth provider configuration
- Prisma-backed user/session/account persistence
- Existing app user and workspace bootstrap flow
- Server-side session helpers for pages, route handlers, and server actions
- Sign-in, sign-out, callback, and protected app routes
- Admin authorization preservation

## Environment Contract

Required server-only variables:

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`

Application URL variables:

- `NEXT_PUBLIC_APP_URL` remains the canonical app origin for redirects and user-facing links.

Do not expose OAuth client secrets, session tokens, or admin status client-side.

## Requirements

- Users can sign in with Google OAuth through Auth.js.
- First successful Google sign-in creates or links the app `User`.
- First login preserves the existing default workspace bootstrap behavior.
- Existing `requireUser`, workspace access, and admin helper behavior is preserved or replaced with equivalent server-side Auth.js helpers.
- Every protected app route and server action continues to validate session before processing.
- `/app/admin` remains protected by server-side admin checks.
- Supabase Auth client usage is removed only where Auth.js replaces it directly.
- Supabase-related database hosting assumptions must not be reintroduced after Spec 025.
- Session handling must work in Next.js App Router server components, route handlers, and server actions.

## Non-Goals

- Do not add email/password auth in this spec.
- Do not add multi-provider auth beyond Google.
- Do not change billing, credits, or storage behavior unless needed for session ownership.
- Do not expose admin role or raw session token to client components.

## Acceptance Criteria

- User can sign in with Google.
- User can sign out.
- First login creates or links user and default workspace records.
- Protected `/app/*` routes redirect unauthenticated users to sign-in.
- Admin routes reject non-admin users.
- Server actions and API routes continue to enforce authenticated access.
- `npm run prisma:validate` passes.
- `npm run typecheck` passes.
- `npm run test` passes.
- `npm run build` passes.

