# Spec 028: Auth.js Email Password Auth

## Goal

Add first-party email/password sign-up and sign-in alongside the existing Auth.js Google OAuth flow while preserving account linking, workspace bootstrap, protected route behavior, admin checks, and server-only credential handling.

## Background

Spec 026 intentionally made Google OAuth the only active authentication path. This spec adds a credential-based path for users who expect a traditional email/password form on `/sign-up` and `/sign-in`.

The implementation must remain Auth.js-centered. It must not reintroduce Supabase Auth, Supabase-hosted auth users, or client-side credential handling.

## Scope

- Email/password registration through Auth.js-compatible server-side credential logic
- Email/password sign-in through Auth.js Credentials provider
- Secure password hashing and verification
- Email verification before unrestricted app access
- Password reset request and reset completion flow
- Prisma-backed credential/token persistence on Neon Postgres
- Account linking rules between Google OAuth and password credentials
- Updated sign-in and sign-up UI with both Google OAuth and email/password options
- Server-side validation, rate limiting, error handling, and audit-friendly logging
- Tests for auth domain logic, server actions, and protected route behavior

## Non-Goals

- No additional OAuth providers beyond Google.
- No magic-link/passwordless email auth in this spec.
- No team invitations or organization-level account management.
- No passkeys/WebAuthn.
- No client-side exposure of password hashes, verification tokens, reset tokens, raw session tokens, or admin status.
- No changes to billing, credits, AI, storage, reports, or jobs except where auth ownership is directly affected.

## Environment Contract

Existing required variables remain:

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `NEXT_PUBLIC_APP_URL`

Email delivery variables required for verification and reset emails:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` or `EMAIL_FROM`

Optional security/config variables:

- `AUTH_PASSWORD_MIN_LENGTH` defaults to `12`.
- `AUTH_EMAIL_TOKEN_TTL_MINUTES` defaults to `30`.
- `AUTH_PASSWORD_RESET_TTL_MINUTES` defaults to `30`.

All credential, token, and email provider secrets must remain server-only.

## Requirements

### Credential Storage

- Add a dedicated credential storage model rather than storing hashes directly in Auth.js `Account` provider metadata.
- Store only a strong password hash, never plaintext or reversible password material.
- Use `@default(cuid())` primary keys and repo-standard camelCase Prisma fields.
- Credential records must be linked to the existing app `User`.
- Credential records must support future password hash algorithm migration.
- Password reset and email verification tokens must be stored hashed, single-use, and expiring.

### Password Hashing

- Use a maintained password hashing library suitable for Node.js server runtime, such as `bcryptjs` or `argon2`.
- Centralize hashing and verification in `lib/auth/passwords.ts`.
- Never hash or verify passwords in React components.
- Never log plaintext passwords, hashes, reset tokens, or verification tokens.

### Sign-Up

- `/sign-up` must show:
  - Continue with Google
  - Email
  - Password
  - Confirm password
  - Submit button
- Sign-up input must be validated with Zod before any database write.
- Email must be normalized by trimming and lowercasing.
- Password must meet the configured minimum length and must match confirmation.
- First successful email/password registration creates or links the app `User`.
- New password users must receive an email verification message.
- Default workspace bootstrap behavior from Spec 026 must be preserved.
- The UI must not reveal whether an email belongs to an existing account in a way that enables account enumeration.

### Email Verification

- Newly registered password users should have `emailVerified = null` until verification is completed.
- Verification links must use `NEXT_PUBLIC_APP_URL` as the canonical origin.
- Verification tokens must be random, stored hashed, single-use, and expire after the configured TTL.
- Completing verification sets `User.emailVerified`.
- Expired or reused verification links must show a clear, non-sensitive error with a way to request a new verification email.

### Sign-In

- `/sign-in` must show:
  - Continue with Google
  - Email
  - Password
  - Submit button
  - Link to reset password
- Auth.js Credentials provider must validate the email/password pair server-side.
- Invalid credentials must return a generic error.
- Users with unverified email/password credentials must be guided to verify their email before accessing `/app/*`.
- Existing Google OAuth sign-in must continue to work.
- Successful password sign-in must use the existing Auth.js session and protected route behavior.

### Password Reset

- Add a request reset flow where a user submits an email address.
- The request response must be generic whether or not the email exists.
- If the user exists and has password credentials, send a reset link by email.
- Reset tokens must be random, stored hashed, single-use, and expire after the configured TTL.
- Add a reset completion page with password and confirm password fields.
- Completing reset updates the stored password hash and invalidates the used reset token.
- Password reset must not sign the user in automatically unless the implementation explicitly creates a normal Auth.js session server-side.

### Account Linking

- If a Google OAuth user later sets a password for the same verified email, link to the existing `User`.
- If a password user later signs in with Google using the same verified email, link to the existing `User`.
- Do not link accounts on unverified email claims.
- Preserve `allowDangerousEmailAccountLinking` behavior only where the implementation has documented why it remains acceptable after adding password auth.
- The admin role must continue to come from server-controlled `User.role` and configured admin email rules, not provider metadata.

### Route Protection And Authorization

- Existing `/app/*` protection must remain unchanged for fully authenticated users.
- Server actions and API routes must continue to validate session before processing.
- `/app/admin` routes and admin actions must continue to use server-side admin checks.
- Unverified password users must not reach protected product routes unless the feature explicitly defines a limited verification-required page.

### Email Delivery

- Use the existing app email boundary and `EmailLog` model where possible.
- Verification and reset emails must record delivery attempts.
- Email failures must produce actionable user-facing errors without exposing provider payloads or raw stack traces.

### Security Controls

- Add rate limiting or throttling for:
  - Password sign-in attempts
  - Sign-up attempts
  - Verification resend
  - Password reset request
- Rate limiting may be database-backed or another repo-approved server-side mechanism.
- All auth forms must be server actions or Auth.js handlers; no credential submission to client-owned code.
- Error messages must avoid account enumeration.
- Password reset and verification links must not include user IDs or unhashed database identifiers.

### UI And UX

- Keep the auth pages compact and aligned with the YTResearch design system.
- Google OAuth remains the primary fast path, but email/password fields must be visible and usable.
- Inputs must have labels, visible focus states, and accessible error text.
- Buttons must not overflow on mobile.
- Do not add marketing copy or a landing-page hero to auth routes.

## Data Model Direction

Expected Prisma additions:

- `PasswordCredential`
  - `id`
  - `userId`
  - `passwordHash`
  - `passwordHashAlgorithm`
  - `createdAt`
  - `updatedAt`
- `EmailVerificationToken`
  - `id`
  - `userId`
  - `tokenHash`
  - `expiresAt`
  - `usedAt`
  - `createdAt`
- `PasswordResetToken`
  - `id`
  - `userId`
  - `tokenHash`
  - `expiresAt`
  - `usedAt`
  - `createdAt`

Indexes must support lookup by token hash and cleanup by expiration time.

## Implementation Plan

### Schema

- Update `prisma/schema.prisma` with password credential, email verification token, and password reset token models.
- Add a Prisma migration under `prisma/migrations/`.
- Update `docs/schema/schema-notes.md` with password credential and token storage decisions.
- Run `npm run prisma:validate` and `npm run prisma:generate`.

### Validation And Domain Helpers

- Create `schemas/auth-credentials.ts` with Zod schemas for:
  - Sign-up
  - Sign-in
  - Verification resend
  - Password reset request
  - Password reset completion
- Create `lib/auth/passwords.ts` for hash and verify operations.
- Create `lib/auth/tokens.ts` for random token generation, hashing, expiration, and single-use validation.
- Create `lib/auth/credentials.ts` for registration, credential lookup, verification completion, and password reset domain logic.
- Add focused Vitest coverage for each helper.

### Auth.js Integration

- Add an Auth.js Credentials provider in `auth.ts`.
- Keep Google provider working.
- Ensure credentials authorization returns the existing app `User` shape needed by Auth.js.
- Preserve database sessions.
- Review and document `allowDangerousEmailAccountLinking` after adding password credentials.

### Server Actions And Routes

- Extend `actions/auth.ts` with server actions for:
  - Email/password sign-up
  - Email/password sign-in
  - Verification resend
  - Password reset request
  - Password reset completion
- Add route/page handlers for verification and password reset completion as needed.
- Validate all form inputs before writes.
- Use generic user-facing errors for invalid credentials and reset requests.

### Components

- Update `app/(auth)/sign-in/page.tsx` with the email/password sign-in form and reset link.
- Update `app/(auth)/sign-up/page.tsx` with the email/password registration form.
- Add small reusable auth form components only if they reduce duplication between sign-in and sign-up.
- Keep auth pages server-rendered unless client state is genuinely required.

### Integration

- Confirm first password sign-up creates or links a `User`.
- Confirm first password sign-up bootstraps the default workspace.
- Confirm verified password sign-in reaches `/app/dashboard`.
- Confirm unverified password sign-in cannot access protected app routes.
- Confirm Google OAuth users can still sign in and access their workspace.
- Confirm admin checks are unchanged.

## Acceptance Criteria

- User can register with email/password from `/sign-up`.
- User can verify email through an emailed verification link.
- Verified user can sign in with email/password from `/sign-in`.
- User can request and complete password reset.
- Google OAuth sign-in continues to work.
- First successful password registration creates or links the app `User`.
- Default workspace bootstrap is preserved.
- Protected `/app/*` routes reject unauthenticated and unverified password users.
- `/app/admin` remains protected by server-side admin checks.
- No password hashes, reset tokens, verification tokens, session tokens, or admin status are exposed client-side.
- Account linking is deterministic and documented.
- Auth email delivery attempts are logged.
- `npm run prisma:validate` passes.
- `npm run typecheck` passes.
- `npm run test` passes.
- `npm run build` passes.

## Verification Plan

- Unit tests for password hashing and verification.
- Unit tests for token hashing, expiry, and single-use behavior.
- Unit tests for Zod schemas.
- Domain tests for registration, account linking, verification completion, and password reset.
- Server action tests for generic errors and validation failures.
- Auth route/page tests for protected redirects and verification-required behavior.
- Browser smoke test for:
  - Sign-up form validation
  - Verification-required state
  - Sign-in form validation
  - Password reset request and completion
  - Existing Google OAuth button remains present

## Review Notes

This spec should be implemented only after Spec 026 is completed or explicitly superseded. Until then, the absence of email/password fields on `/sign-up` is expected behavior for Spec 026 and should be treated as a follow-up feature, not a defect in the Google OAuth implementation.
