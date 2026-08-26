# Admin Dashboard Context

Last updated: 2026-08-26

## Current Status

The admin area is a responsive platform-governance workspace. It manages account retention and access, provides read-only classroom/content oversight, exposes non-sensitive health totals, supports filtered audit review, and exports safe CSV reports. It does not duplicate teacher authoring or game-development tools.

## Implemented Capabilities

- Reversible account archive/restore using the existing user `status` field (`archived`). Archived users cannot authenticate and are excluded from normal user views unless explicitly filtered.
- JWT session revocation through additive `Users.tokenVersion`. Force logout, archive, admin password reset (enabled by default), and self-service password change rotate the version.
- Permanent deletion is secondary: the account must already be archived and the admin must type `DELETE`. Admin accounts and the current admin remain protected.
- Paginated users with role/status/search filters, teacher/student views, status badges, compact action menus, user detail history, and teacher classroom ownership visibility.
- Paginated classroom oversight with name/teacher search, state and created-date filters, student/module counts, latest activity, archive/restore, and read-only detail for roster, learning content/resources, and announcements.
- Read-only, paginated teacher-content oversight with search, content-type, and publish-state filters.
- System health and summary cards using real `/api/health`, database connectivity, user counts, classroom count, and archived-account count.
- Paginated audit filters for actor, action, affected user, status, and date range. Metadata remains deliberately non-sensitive.
- Filter-aware CSV exports for users (including teacher/student subsets), classrooms, and audit logs. Passwords, hashes, tokens, and internal token-version state are excluded.
- Responsive sidebar/drawer, horizontally scrollable tables, loading/error/empty states, confirmation dialogs, and read-only detail drawers.
- Teacher accounts are admin-created and email-verified through the existing invitation flow; a separate identity-document approval state was intentionally not added.

## API Contract

- `GET /api/admin/summary`
- `GET /api/admin/users` and `GET /api/admin/users/export.csv`
- `GET /api/admin/users/:id`
- `POST /api/admin/users/:id/archive`
- `POST /api/admin/users/:id/restore`
- `POST /api/admin/users/:id/force-logout`
- `PATCH /api/admin/users/:id/status`
- `PATCH /api/admin/users/:id/role`
- `POST /api/admin/users/:id/reset-password` with optional `{ "revokeSessions": false }` (defaults to true)
- `DELETE /api/admin/users/:id` with `{ "confirmation": "DELETE" }`; archived users only
- `POST /api/admin/users/teacher`
- `GET /api/admin/classrooms` and `GET /api/admin/classrooms/export.csv`
- `GET /api/admin/classrooms/:id`
- `POST /api/admin/classrooms/:id/archive`
- `POST /api/admin/classrooms/:id/restore`
- `GET /api/admin/content`
- `GET /api/admin/content/:id`
- `GET /api/admin/logs` and `GET /api/admin/logs/export.csv`
- `GET /api/health` (public, non-sensitive)

All `/api/admin/*` routes require a current active admin in server-side middleware.

## Data and Security Changes

- `Users.status` recognizes `active`, `inactive`, `pending`, and `archived`.
- `Users.tokenVersion` is an integer with default `0`.
- Migration: `supabase/migrations/20260826000000_admin_governance.sql`.
- JWTs carry `tokenVersion`; middleware compares it to the current database value on every authenticated request.
- CSV cells beginning with spreadsheet formula characters are prefixed safely.
- Audit and health responses never include credentials, password material, JWTs, environment variables, or filesystem information.

## Deliberately Deferred

- Global announcements: classroom announcements have classroom ownership semantics; a separate scoped platform-announcement delivery/read model is needed before this can be added safely.
- Maintenance mode: safely blocking every student/teacher route while preserving admin access requires a cross-cutting platform-setting and middleware design. It was not bolted onto selected pages.
- Teacher transfer: classroom ownership is tied to several teacher workflows and was not changed without an explicit reassignment policy.
- Browser E2E automation: responsive behavior is implemented in CSS, but no browser-test framework exists in the repository.

## Verification

- Backend integration/security suite: 32 tests passing, including rejection of a previously issued token after version rotation.
- Frontend production build: passing.
- Frontend ESLint: passing.
- Existing game, progress, score, XP, hint, validator, and teacher challenge code was not changed.
