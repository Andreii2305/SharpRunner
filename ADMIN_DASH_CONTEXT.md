# Admin Dash Context (Checkpoint)

Last updated: 2026-03-20

## What We Completed

- Added role-aware and status-aware user management for admin.
- Added user `status` support (`active` / `inactive`) in backend model and schema normalization.
- Added admin activity log model and logging service for real dashboard logs.
- Reworked admin APIs to return real user status and real logs (no fake/random frontend values).
- Updated admin dashboard UI to the Figma-style layout while using live backend data.
- Wired dashboard actions:
  - create teacher account
  - activate/deactivate non-admin users
  - refresh users/logs from backend
- Added login guard: inactive users cannot sign in.

## Backend Changes

### Models

- `backend/src/models/User.js`
  - Added `status` field with allowed values: `active`, `inactive`.
- `backend/src/models/AdminActivityLog.js` (new)
  - Stores actor, target user, role, activity, details, status, timestamp.
- `backend/src/models/index.js`
  - Registered `AdminActivityLog` model and associations.

### Services

- `backend/src/services/userRoleSchemaService.js`
  - Added `ensureUserStatusColumn()` plus status cleanup/normalization.
- `backend/src/services/adminActivityLogService.js` (new)
  - Helper to write admin activity logs safely.

### Routes

- `backend/src/routes/admin.js`
  - `GET /api/admin/users` now includes real `status`.
  - `GET /api/admin/logs?limit=20` returns real admin activity logs.
  - `PATCH /api/admin/users/:id/status` updates account status.
  - `POST /api/admin/users/teacher` now writes a log entry.
- `backend/src/routes/auth.js`
  - Blocks login for inactive accounts.
  - Auth responses now include `status`.

### Server Startup

- `backend/src/server.js`
  - Runs both:
    - `ensureUserRoleColumn()`
    - `ensureUserStatusColumn()`

## Frontend Changes

- `frontend/src/pages/admin/AdminDashboardPage.jsx`
  - Uses real API data:
    - users from `GET /api/admin/users`
    - logs from `GET /api/admin/logs`
  - Removed hardcoded/fake activity/status generation.
  - User action buttons now call `PATCH /api/admin/users/:id/status`.
- `frontend/src/pages/admin/AdminDashboardPage.module.css`
  - Updated styling and action button states to match current admin UI design.

## Current API Contract (Admin)

- `GET /api/admin/users`
  - Returns: `id, firstName, lastName, username, email, role, status, createdAt, updatedAt`
- `GET /api/admin/logs?limit=20`
  - Returns recent admin activity logs.
- `POST /api/admin/users/teacher`
  - Creates teacher account (status defaults to active).
- `PATCH /api/admin/users/:id/status`
  - Body: `{ "status": "active" | "inactive" }`
  - Prevents admin accounts from being set inactive.

## Known Gaps / TODO (Before or During Teacher Dash)

1. Add persistent classroom data model (teacher-owned classrooms, class code, membership).
2. Add teacher-focused routes:
   - create/manage classroom
   - view classroom roster
   - view student progress/analytics per classroom
3. Add teacher dashboard UI pages and protected routing.
4. Add pagination/sorting in admin users/logs APIs for larger datasets.
5. Add optional user audit actions in admin:
   - reset password
   - role update
   - soft delete / archive
6. Add seed/demo logs for local testing so log panel is not empty on fresh DB.
7. Add API-level tests for admin routes (`users`, `logs`, `status patch`).

## Next Focus

- Proceed with Teacher Dash implementation.
- Keep Admin Dash stable; only return for bug fixes or pagination improvements.
