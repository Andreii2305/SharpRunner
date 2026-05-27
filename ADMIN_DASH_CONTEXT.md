# Admin Dash Context

Last updated: 2026-05-27

## Current Status

The admin dashboard is connected to live backend data and supports user management, teacher creation, account activation/deactivation, and activity logs.

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
  - Returns users with `id`, `firstName`, `lastName`, `username`, `email`, `role`, `status`, `createdAt`, and `updatedAt`.
- `GET /api/admin/logs?limit=20`
  - Returns recent admin activity logs.
- `POST /api/admin/users/teacher`
  - Creates a teacher account.
- `PATCH /api/admin/users/:id/status`
  - Body: `{ "status": "active" | "inactive" }`
  - Prevents admin accounts from being set inactive.
- `POST /api/auth/bootstrap-admin`
  - Creates the first admin when `ADMIN_SETUP_KEY` is configured and no admin exists.
- `POST /api/auth/register-admin-invite`
  - Creates an admin account with a valid developer-generated invite.

## Remaining Gaps

1. Add pagination to admin users and logs.
2. Add optional admin actions:
   - reset password
   - update role
   - archive/delete user
3. Add stronger audit coverage for more admin actions.
4. Add API tests for admin users, logs, teacher creation, and status changes.
5. Add rate limiting or other hardening for production auth endpoints.

## Suggested Next Focus

Admin is stable enough for the current capstone loop. Return to it after completing the playable Lesson 1 path, unless the panel specifically asks for more admin controls.
