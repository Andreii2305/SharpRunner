# Admin Dash Context

Last updated: 2026-08-19

## Current Status

The admin dashboard is connected to live backend data and supports paginated user management, accurate system summaries, teacher creation, account activation/deactivation, guarded role changes, teacher password resets, deletion, and activity logs.

## Completed

- Role-aware and status-aware user management.
- User `status` support with `active` and `inactive`.
- Admin activity log model and logging service.
- Admin APIs return real user status and real activity logs.
- Admin dashboard UI uses live backend data.
- Admin can create teacher accounts.
- Admin can activate or deactivate non-admin users.
- Inactive users are blocked from login.
- Admin invite registration exists through the developer invite flow.
- Server-side pagination and filtering for users and activity logs.
- Accurate totals for users, active teachers, active students, and active classrooms.
- Student/teacher role changes with admin-account protection and classroom-ownership safeguards.
- Teacher password reset through an emailed temporary password; credentials are never returned to the dashboard.
- Permanent deletion for non-admin users with an explicit confirmation.
- Audit entries for status, role, teacher invitation, password-reset, and deletion actions.
- Rate limiting for teacher creation and admin mutation endpoints.

## Backend Files

- `backend/src/models/User.js`
- `backend/src/models/AdminActivityLog.js`
- `backend/src/models/AdminInvite.js`
- `backend/src/routes/admin.js`
- `backend/src/routes/auth.js`
- `backend/src/services/userRoleSchemaService.js`
- `backend/src/services/adminActivityLogService.js`

## Frontend Files

- `frontend/src/pages/admin/AdminDashboardPage.jsx`
- `frontend/src/pages/admin/AdminDashboardPage.module.css`
- `frontend/src/pages/auth/AdminInviteRegisterPage.jsx`
- `frontend/src/pages/developer/DeveloperPage.jsx`

## Current API Contract

- `GET /api/admin/users`
  - Supports `page`, `limit`, `role`, `status`, and `search`; returns pagination metadata and sanitized users.
- `GET /api/admin/logs?page=1&limit=20`
  - Returns paginated admin activity logs.
- `GET /api/admin/summary`
  - Returns total users, active teachers/students, and active classrooms.
- `POST /api/admin/users/teacher`
  - Creates a teacher account.
- `PATCH /api/admin/users/:id/status`
  - Body: `{ "status": "active" | "inactive" }`
  - Prevents admin accounts from being set inactive.
- `PATCH /api/admin/users/:id/role`
  - Changes a non-admin account between student and teacher; teacher demotion is blocked while classrooms remain assigned.
- `POST /api/admin/users/:id/reset-password`
  - Emails a temporary password to a local-password teacher account and never returns the password in the API.
- `DELETE /api/admin/users/:id`
  - Permanently deletes a non-admin account and records the action.
- `POST /api/auth/bootstrap-admin`
  - Creates the first admin when `ADMIN_SETUP_KEY` is configured and no admin exists.
- `POST /api/auth/register-admin-invite`
  - Creates an admin account with a valid developer-generated invite.

## Remaining Gaps

1. Add a reversible archive/restore flow if permanent deletion is too destructive for production policy.
2. Add forced sign-out/token revocation after password reset if the project later stores session or token-version state.
3. Add student self-service password settings before enabling dashboard password reset for student accounts; current resets intentionally support teachers only.
4. Add browser-level end-to-end coverage for the admin dashboard. API coverage now includes pagination, summaries, status, roles, password reset, deletion, and auditing.

## Suggested Next Focus

Admin is stable enough for the current capstone loop. The next admin work should be driven by an explicit retention/session policy rather than adding more destructive controls by default.
