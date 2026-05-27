# Teacher Dash Context

Last updated: 2026-05-27

## Current Status

The teacher experience is connected to live backend data. Teachers can create classrooms, monitor students, view performance, post announcements, and edit per-classroom level content overrides.

## Completed

- Teacher dashboard overview with live metrics:
  - total students
  - total classrooms
  - average progress
  - active students today
- Classroom creation with generated class codes.
- Class metadata display:
  - class name
  - section
  - school year
  - max students
  - description
  - class code
- Student join-class flow using class code.
- Student class membership gating before dashboard, map, game, leaderboard, and progress APIs.
- Active student tracking through game heartbeat:
  - `isPlayingGame`
  - `lastGameHeartbeatAt`
- Teacher classes page.
- Teacher students page with per-student grade/progress views.
- Teacher analytics page.
- Teacher announcements page.
- Teacher level editor for classroom-specific level overrides.

## Backend Files

- `backend/src/models/Classroom.js`
- `backend/src/models/ClassroomMembership.js`
- `backend/src/models/ClassroomAnnouncement.js`
- `backend/src/models/ClassroomAnnouncementView.js`
- `backend/src/models/LevelContentOverride.js`
- `backend/src/routes/teacher.js`
- `backend/src/routes/classrooms.js`
- `backend/src/routes/progress.js`
- `backend/src/middleware/requireActiveClassMembership.js`
- `backend/src/services/classroomSchemaService.js`
- `backend/src/services/studentClassService.js`
- `backend/src/services/levelContentSchemaService.js`

## Frontend Files

- `frontend/src/pages/teacher/TeacherDashboardPage.jsx`
- `frontend/src/pages/teacher/TeacherClassesPage.jsx`
- `frontend/src/pages/teacher/TeacherStudentsPage.jsx`
- `frontend/src/pages/teacher/TeacherAnalyticsPage.jsx`
- `frontend/src/pages/teacher/TeacherAnnouncementsPage.jsx`
- `frontend/src/pages/teacher/TeacherLevelEditorPage.jsx`
- `frontend/src/pages/student/JoinClassPage.jsx`
- `frontend/src/Components/ProtectedRoute/ProtectedRoute.jsx`
- `frontend/src/Components/Dashboard/Dashboard.jsx`

## Current API Contract

- `GET /api/teacher/dashboard`
  - Returns teacher overview, class performance, student performance, and lesson insights.
- `GET /api/teacher/classrooms`
  - Returns teacher-owned classrooms with student counts.
- `POST /api/teacher/classrooms`
  - Body: `className`, `section`, `schoolYear`, optional `maxStudents`, optional `description`.
  - Returns generated `classCode`.
- `POST /api/teacher/classrooms/:classroomId/students`
  - Adds students by ids or usernames.
- `GET /api/teacher/classrooms/:classroomId/students`
  - Returns classroom roster with progress and score summaries.
- `GET /api/teacher/students/:studentId/grades`
  - Returns per-level grades, attempts, time spent, and completion data for a student in the teacher's class.
- `GET /api/teacher/announcements`
  - Returns teacher classroom announcement data.
- `POST /api/teacher/announcements`
  - Creates a classroom announcement.
- `GET /api/teacher/classrooms/:classroomId/level-overrides`
  - Returns content overrides for a classroom.
- `PUT /api/teacher/classrooms/:classroomId/level-overrides/:levelKey`
  - Creates or updates a classroom level override.
- `DELETE /api/teacher/classrooms/:classroomId/level-overrides/:levelKey`
  - Removes a classroom level override.
- `GET /api/classrooms/me`
  - Returns a student's active classroom membership state.
- `POST /api/classrooms/join`
  - Student joins a classroom with a class code.

## Remaining Gaps

1. Add roster actions for removing or deactivating a student membership from a class.
2. Add classroom lifecycle controls:
   - archive classroom
   - reactivate classroom
   - regenerate class code
3. Add teacher account/settings page:
   - profile update
   - password change
4. Expose deadlines/par time settings in teacher tools.
5. Expand level editor to support dialogue and result message overrides.
6. Add API tests for teacher/classroom routes and membership gates.

## Suggested Next Focus

Teacher features are strong enough for the current demo. The next highest-impact work is finishing Lesson 1 levels 6-10 so teachers have a complete module to monitor.
