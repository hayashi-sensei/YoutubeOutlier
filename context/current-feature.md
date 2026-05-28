# Current Feature: Spec 027 Cloudflare R2 Storage

This file tracks the active spec-driven development step for YTResearch.

## Status

- **Workflow State:** In Progress
- **Active Phase:** Review / Verification
- **Active Spec:** Spec 027: Cloudflare R2 Storage
- **Spec File:** docs/specs/027-cloudflare-r2-storage.md
- **Implementation Status:** Implemented
- **Branch:** feat/spec-027-cloudflare-r2-storage
- **Last Updated:** 2026-05-29

## Loaded Spec

Spec 027 moves generated files and binary assets to Cloudflare R2 object storage through a server-only S3-compatible storage adapter.

Goals:

- Document the Cloudflare R2 server-only environment contract in `.env.example`.
- Add a `lib/storage/` boundary so route handlers, server actions, components, report exports, and visual generation code do not call R2 directly.
- Support upload, read/download, signed access, public URL construction when explicitly configured, and delete where needed through a testable adapter interface.
- Keep workspace-owned object keys workspace-scoped and validate keys before reads/downloads to prevent traversal or cross-workspace access.
- Move report export file persistence away from direct `outputs/report_exports` local storage to the storage adapter.
- Persist visual generated image binaries through the storage adapter when provider output can be stored.
- Store stable object keys in database `storagePath` / `storage_path` fields, never secrets or temporary signed URLs.
- Route private downloads through authenticated app routes or signed URLs.
- Add focused tests for object key construction, object key validation, adapter behavior, and access control.

Notes:

- No database migration is in scope for this spec.
- No auth migration is in scope for this spec.
- Assets must not become public by default.
- R2 credentials must remain server-only and must not be stored in the database or client-visible config.
- Use `CLOUDFLARE_R2_REGION="auto"` for Cloudflare R2 unless implementation findings show a provider-specific need otherwise.

## Plan

1. Schema and environment:
   - Confirm no Prisma schema changes are required for existing `storagePath` / `storage_path` fields.
   - Update `.env.example` with `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ENDPOINT`, `CLOUDFLARE_R2_BUCKET_NAME`, `CLOUDFLARE_R2_REGION`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, and optional `CLOUDFLARE_R2_PUBLIC_BASE_URL`.
   - Update any environment validation module if the repo has one for server-only runtime variables.

2. Storage boundary:
   - Add `lib/storage/types.ts` with storage adapter interfaces and request/result types.
   - Add `lib/storage/keys.ts` with workspace-scoped key builders and validation helpers.
   - Add `lib/storage/config.ts` with server-only R2 environment parsing.
   - Add `lib/storage/r2-client.ts` or equivalent S3-compatible client factory using the existing dependency stack if available, adding a dependency only if required.
   - Add `lib/storage/r2-adapter.ts` implementing upload, read/download, signed access, public URL construction, and delete.
   - Add `lib/storage/local-adapter.ts` or test double support if existing tests need deterministic local storage behavior.
   - Add `lib/storage/index.ts` as the only import boundary for app code.

3. Report exports integration:
   - Search existing report export generation and download paths under `lib/reports/`, `app/`, `actions/`, and `tests/`.
   - Replace direct `outputs/report_exports` persistence reads/writes with storage adapter calls.
   - Ensure export database records store object keys in `storagePath` / `storage_path` and do not store signed URLs as permanent state.
   - Ensure authenticated download routes validate workspace ownership before reading or signing stored objects.

4. Visual assets integration:
   - Search existing visual generation persistence under `lib/image/`, `lib/ai/`, `actions/`, and `app/`.
   - Persist generated image binaries to storage when provider output is available as bytes or fetchable server-side URL.
   - Save only stable object keys in visual asset `storagePath` / `storage_path` fields.
   - Use public URLs only when `CLOUDFLARE_R2_PUBLIC_BASE_URL` is configured and the asset is intentionally public.

5. Tests:
   - Add unit tests for key construction and validation, including traversal and cross-workspace rejection.
   - Add adapter-level tests using a fake/local implementation for upload/read/delete/signed/public URL behavior.
   - Add focused report export tests proving downloads go through the storage boundary and enforce workspace access.
   - Add focused visual asset tests proving persisted storage paths are stable object keys.

6. Documentation:
   - Update `docs/schema/schema-notes.md` only if implementation reveals meaningful storage-path decisions worth documenting.
   - Update implementation notes in this file after each milestone.

## Approval

Approved on 2026-05-29. Branch created and implementation completed.

## Implementation Notes

- Added `lib/storage/` with shared storage types, safe object key builders/validators, an in-memory test adapter, Cloudflare R2 config parsing, and an S3-compatible R2 adapter using the AWS SDK.
- Connected report export generation to `StorageAdapter.putObject()` and removed direct `outputs/report_exports` write behavior.
- Connected authenticated report export downloads to `StorageAdapter.getObject()` after validating the stored key stays under `exports/{workspaceId}/{reportId}/`.
- Connected visual generated image persistence to server-side storage uploads and stable R2 object keys; public URLs are used only when the storage adapter returns one from the configured public base URL.
- Updated report and visual storage path builders to delegate to the shared object-key safety layer.
- Updated storage documentation notes and the integration checklist for Spec 027.

## Verification Plan

Verification completed:

- `npm run test -- tests/storage/keys.test.ts tests/storage/memory-adapter.test.ts`
- `npm run test -- tests/reports/export-runner.test.ts tests/reports/export-download.test.ts tests/visual-generation/action-persistence.test.ts`
- `npm run test -- tests/storage/r2-config.test.ts tests/storage/r2-adapter.test.ts`
- `npm run test -- tests/storage/keys.test.ts tests/storage/memory-adapter.test.ts tests/storage/r2-config.test.ts tests/storage/r2-adapter.test.ts tests/reports/export-runner.test.ts tests/reports/export-download.test.ts tests/visual-generation/action-persistence.test.ts tests/visual-generation/strategy.test.ts`
- `npm run prisma:validate`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## Review Summary

Implemented the approved Spec 027 scope without Prisma schema changes or migrations. No deviations from the approved plan. Known operational requirement: deploy environments must provide the Cloudflare R2 credentials and bucket/base URL variables from `.env.example` before storage-backed report export or visual image generation is used live.

## Commit

Planned commit message: `feat(spec-027): add cloudflare r2 storage`

## History

- **Spec 026: Auth.js Google OAuth** — Completed on 2026-05-29.
  - Commit: `89da930` / `feat(spec-026): implement authjs google oauth`
  - Branch: `feat/spec-026-authjs-google-oauth`
  - Summary: Replaced Supabase Auth session reads with Auth.js Google OAuth, Prisma-backed Auth.js persistence, server-side session helpers, protected app/admin route behavior, Google-only auth UI, env contract validation, and follow-up Spec 028 for email/password auth.
  - Verification: `npm run prisma:validate`, `npm run typecheck`, `npm run test` (73 files / 305 tests), `npm run build`, and local Google OAuth initiation.
