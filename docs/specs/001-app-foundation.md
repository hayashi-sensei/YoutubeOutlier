# Spec 001: App Foundation

## Status

Complete.

## Implementation Summary

- Created the baseline Next.js App Router project with TypeScript and Tailwind CSS v4.
- Added public, app, and admin route groups.
- Added `/`, `/app`, `/app/dashboard`, `/app/settings`, `/app/billing`, and `/app/admin`.
- Added basic app shell, dashboard foundation, route stubs, error boundary, and not-found page.
- Added `/api/health` with app and database connectivity checks.
- Added environment files, Prisma 7 configuration, generated Prisma client output, and a baseline migration.
- Connected Prisma runtime to Postgres through `@prisma/adapter-pg` and `pg` with SSL. Spec 025 later moves the hosted database target to Neon Postgres.

## Verification

Verified on 2026-05-16:

- `npm run prisma:validate` passes.
- `npm run prisma:generate` passes.
- `npm run typecheck` passes.
- `npm run build` passes.
- `http://127.0.0.1:3001/app/dashboard` returns 200.
- `http://127.0.0.1:3001/api/health` returns `{"status":"ok","app":"ok","database":"ok"}`.

## Notes

- The dev server is running on `http://127.0.0.1:3001`.
- Port 3000 was already occupied by another app during setup.
- Prisma CLI database execution hit a Windows TLS issue against Supabase, but Prisma runtime connectivity works through the `pg` adapter with explicit SSL.

## Goal

Create the baseline Next.js SaaS application structure for YTResearch.

## Scope

- Next.js App Router project
- TypeScript
- Tailwind or equivalent styling
- Prisma connected to Postgres
- Environment variable management
- Basic app shell
- Dashboard route structure
- Marketing-lite landing route only if needed for public SaaS access

## Key Routes

- `/`
- `/app`
- `/app/dashboard`
- `/app/settings`
- `/app/billing`
- `/app/admin`

## Requirements

- Use a clean application shell for logged-in users.
- Separate public, app, and admin route groups.
- Add health check endpoint.
- Add basic error boundary and not-found pages.
- Use server components by default.
- Keep UI dense and operational, not marketing-heavy.

## Acceptance Criteria

- App runs locally.
- Database connection works.
- Prisma migration baseline exists.
- Auth-protected routes can be wired in the next spec.
