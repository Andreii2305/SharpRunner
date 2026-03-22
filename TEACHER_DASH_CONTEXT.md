# Teacher Dash Context (Checkpoint)

Last updated: 2026-03-22

## Current Direction

- Teacher dashboard is now connected to real backend data (no hardcoded stats).
- Classroom creation follows your agreed rules:
  - class code is auto-generated
  - required: `className`, `section`, `schoolYear`
  - optional: `maxStudents`, `description`
- Student flow now includes class join gating before dashboard/map/game access.

## What We Completed

- Implemented teacher dashboard overview with live metrics:
  - total students
  - total classrooms
  - average progress
  - active students today
- Implemented classroom creation modal based on your frame and requirements.
- Added success modal showing generated class code after classroom creation.
- Added class metadata display in teacher class cards (section, SY, class code).
- Implemented active student logic using game heartbeat:
  - student must be active account
  - `isPlayingGame = true`
  - recent heartbeat window
- Implemented student join-class flow using class code.
- Added student membership gate so progress/game endpoints require active class membership.

## Backend Changes

### Models

- `backend/src/models/Classroom.js`
  - Supports `className`, `section`, `schoolYear`, `maxStudents`, `description`, `classCode`, `isActive`.
- `backend/src/models/ClassroomMembership.js`
  - Tracks `classroomId`, `studentId`, `status`, `joinedAt`.
- `backend/src/models/User.js`
  - Added activity fields used by teacher analytics:
    - `isPlayingGame`
    - `lastGameHeartbeatAt`
    - `lastLoginAt`

### Routes

- `backend/src/routes/teacher.js`
  - `GET /api/teacher/dashboard`
  - `GET /api/teacher/classrooms`
  - `POST /api/teacher/classrooms`
  - `POST /api/teacher/classrooms/:classroomId/students`
- `backend/src/routes/classrooms.js`
  - `GET /api/classrooms/me` (student membership status)
  - `POST /api/classrooms/join` (join via class code)
- `backend/src/routes/progress.js`
  - activity endpoint + class membership gating
- `backend/src/routes/auth.js`
  - login updates `lastLoginAt` and resets `isPlayingGame`

### Middleware / Services

- `backend/src/middleware/requireActiveClassMembership.js` (new)
  - Blocks students without active class membership from progress/game APIs.
- `backend/src/services/classroomSchemaService.js`
  - Ensures classroom columns exist in older DB schema.
- `backend/src/services/userRoleSchemaService.js`
  - Ensures user role/status/activity columns.
- `backend/src/server.js`
  - Runs schema ensure functions at startup.

## Frontend Changes

- `frontend/src/pages/teacher/TeacherDashboardPage.jsx`
  - Live teacher overview + class performance + lesson insight cards
  - Create classroom modal using required/optional fields
  - Success modal with generated class code
- `frontend/src/pages/teacher/TeacherDashboardPage.module.css`
  - Updated to your reference layout and palette
- `frontend/src/pages/student/JoinClassPage.jsx` (new)
  - Student class-code join page
- `frontend/src/Components/ProtectedRoute/ProtectedRoute.jsx`
  - Membership-aware route protection for student dashboard/map/game routes
- `frontend/src/App.jsx`
  - Added `/join-class` route and class-membership guards
- `frontend/src/Components/Dashboard/Dashboard.jsx`
  - Added "Joined Class" card using `/api/classrooms/me`

## Current API Contract (Teacher + Class Join)

- `GET /api/teacher/dashboard`
  - Returns overview, class performance, top student rows, lesson insights.
- `GET /api/teacher/classrooms`
  - Returns teacher-owned classrooms with student counts.
- `POST /api/teacher/classrooms`
  - Body:
    - required: `className`, `section`, `schoolYear`
    - optional: `maxStudents`, `description`
  - Response includes generated `classCode`.
- `POST /api/teacher/classrooms/:classroomId/students`
  - Adds students via ids or usernames.
- `GET /api/classrooms/me` (student)
  - Returns `hasActiveMembership`, classroom list, `primaryClassroom`.
- `POST /api/classrooms/join` (student)
  - Body: `{ "classCode": "ABC123" }`

## Known Gaps / TODO (Next)

1. Build Teacher Classes page (separate from overview):
   - class list
   - open class details
   - class-level filtering
2. Build class roster management UI:
   - view enrolled students per class
   - remove/deactivate student membership from class
3. Add per-class analytics view:
   - switch from overall to selected class stats
   - per-class completion and difficulty
4. Add class lifecycle controls:
   - archive/disable classroom
   - regenerate class code (optional)
5. Add teacher account/settings page:
   - profile update
   - password change
6. Add backend validation enhancements:
   - enforce section/SY format rules
   - stricter maxStudents handling and edge-case messages
7. Add API tests for teacher/classroom routes and membership gate.

## Suggested Next Focus

- Start with **Teacher Classes page + class details** first, since your top nav already shows a Classes tab.
- Then add roster actions (remove student, class capacity visibility) before advanced analytics.
