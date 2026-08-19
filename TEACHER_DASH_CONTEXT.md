# Teacher Dash Context

Last updated: 2026-08-19

## Current Status

The teacher experience is connected to live backend data. Teachers can create classrooms, monitor students, view performance, post announcements, manage classwork, and configure supported per-classroom level settings. Curriculum content and validators remain system-managed.

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
- Teacher level settings for classroom-specific availability, order, scheduling, hints, and grading deductions.
- Classroom roster removal with retained progress and reversible membership history.
- Classroom lifecycle controls for archive, reactivation, and class-code rotation.
- Teacher account settings for profile and password updates.
- Per-level availability, ordering, unlock dates, due dates, hints, and grading deductions.
- Classroom lessons and assignments with scheduling, attachments, audience targeting, submission policies, rubrics, grading, feedback, and version history.

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
- `PATCH /api/teacher/classrooms/:classroomId/students/:studentId`
  - Removes or reactivates a membership without deleting saved student progress.
- `GET /api/teacher/classrooms/:classroomId/students`
  - Returns classroom roster with progress and score summaries.
- `PATCH /api/teacher/classrooms/:classroomId`
  - Archives or reactivates a teacher-owned classroom.
- `POST /api/teacher/classrooms/:classroomId/regenerate-code`
  - Rotates the join code for an active classroom.
- `GET /api/teacher/students/:studentId/grades`
  - Returns per-level grades, attempts, time spent, and completion data for a student in the teacher's class.
- `GET /api/teacher/announcements`
  - Returns teacher classroom announcement data.
- `POST /api/teacher/announcements`
  - Creates a classroom announcement.
- `GET /api/teacher/classrooms/:classroomId/level-overrides`
  - Returns the stored rows used to populate classroom level settings.
- `PUT /api/teacher/classrooms/:classroomId/level-settings`
  - Saves availability, order, scheduling, hints, and grading deductions for every playable level.
- `DELETE /api/teacher/classrooms/:classroomId/level-settings`
  - Restores the supported level settings to system defaults.
- `PUT /api/auth/me/profile`
  - Updates the current teacher's name and username.
- `PUT /api/auth/me/password`
  - Changes a password after current-password verification.
- `GET /api/classrooms/me`
  - Returns a student's active classroom membership state.
- `POST /api/classrooms/join`
  - Student joins a classroom with a class code.

## Remaining Gaps

1. Add an explicit removed-members view if teachers need to reactivate students without entering their username again. The existing add-student endpoint already reactivates a removed membership.
2. Add a configurable par-time field only if grading requirements expand beyond the currently supported due-date controls.
3. Keep curriculum text, starter code, dialogue, result messages, and validators system-managed unless a later product decision explicitly expands teacher editing.
4. Add browser-level end-to-end coverage for the teacher dashboard; API ownership coverage now includes roster, classwork, lifecycle, profile, and password routes.

## Suggested Next Focus

Teacher features are strong enough for the current demo. The next highest-impact work is finishing Lesson 1 levels 6-10 so teachers have a complete module to monitor.
