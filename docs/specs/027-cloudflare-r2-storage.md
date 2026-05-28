# Spec 027: Cloudflare R2 Storage

## Goal

Move generated files and binary assets to Cloudflare R2 object storage using an S3-compatible server-side storage adapter.

## Scope

- Cloudflare R2 environment contract
- Server-only S3-compatible R2 client
- Storage adapter for upload, read/download, signed access, and delete where needed
- Report export file storage
- Visual asset binary storage
- Access-controlled download behavior
- Documentation and tests for object key safety

## Environment Contract

Required server-only variables:

- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ENDPOINT`
- `CLOUDFLARE_R2_BUCKET_NAME`
- `CLOUDFLARE_R2_REGION`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`

Optional variable:

- `CLOUDFLARE_R2_PUBLIC_BASE_URL`

Use `CLOUDFLARE_R2_REGION="auto"` for Cloudflare R2 unless there is a provider-specific reason to do otherwise. Keep all access keys server-only.

## Requirements

- Add a storage boundary under `lib/storage/` instead of calling R2 directly from route handlers, server actions, or components.
- Keep object keys workspace-scoped where assets are user-owned.
- Validate object keys before reads and downloads to prevent path traversal or cross-workspace access.
- Report exports currently using local `outputs/report_exports` storage move to R2-backed persistence.
- Visual generated image binaries move to R2 where provider output can be persisted.
- Database `storagePath` fields store stable R2 object keys, not secrets or temporary signed URLs.
- Public URLs are used only when `CLOUDFLARE_R2_PUBLIC_BASE_URL` is configured and the asset is intentionally public.
- Private downloads must go through authenticated app routes or signed URLs.
- Tests cover object key construction and access validation.

## Non-Goals

- Do not migrate the database in this spec.
- Do not migrate auth in this spec.
- Do not make all assets public by default.
- Do not store R2 credentials in the database or client-visible config.

## Acceptance Criteria

- R2 env variables are documented in `.env.example`.
- Storage adapter can upload and read objects through a testable interface.
- Report export downloads read from R2 or a local test double through the same adapter boundary.
- Visual assets persist `storagePath` as an R2 object key.
- Cross-workspace object path access is rejected.
- `npm run typecheck` passes.
- `npm run test` passes.
- `npm run build` passes.

