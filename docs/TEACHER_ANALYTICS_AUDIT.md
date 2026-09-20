# Teacher Analytics Audit

## End-to-end trace

The original analytics path was:

1. `UserProgress` records (one row per student and built-in level).
2. `buildDashboardPayload` in `backend/src/routes/teacher.js`.
3. `GET /api/teacher/dashboard`.
4. `TeacherAnalyticsPage.jsx`, which read only `lessonInsights`.
5. Hand-built CSS bars and an SVG line; there is no charting dependency in the frontend package.

The repaired analytics path is:

1. Active teacher-owned `Classroom` rows.
2. Active `ClassroomMembership` rows and active student `User` rows.
3. Batched reads of `UserProgress`, `LevelContentOverride`, `ClassroomLessonPlacement`, `ClassroomLesson`, `ClassroomLessonProgress`, and `ClassroomLessonSubmission`.
4. Server-side transformation by `teacherAnalyticsService`.
5. `GET /api/teacher/analytics` for the dashboard and `GET /api/teacher/analytics/students/:studentId` for an authorized drill-down.
6. `TeacherAnalyticsPage.jsx`, which renders cards, sortable tables, deterministic heatmap states, and small CSS distributions.

The dashboard endpoint remains for the overview/classes/students pages. Its legacy lesson insights now use recorded time and the same evidence-based difficulty formula instead of the old inverse-progress calculation.

## Root causes in the previous analytics

- Average time was always the literal string `Not enough data`; `timeSpentSeconds` was not selected or aggregated.
- Difficulty was `100 - average progress`. This made untouched lessons appear maximally difficult, produced suspicious inverse/sequential values, ignored attempts/scores/hints, and allowed insufficient samples to rank as “most difficult.”
- “Completion by lesson” was actually the mean of level `progressPercent` values, not a completion rate among students who started.
- The analytics screen had no classroom, date, or lesson filters and no error state.
- Reusable classroom lesson progress used a unique key and lookup of `(lessonId, studentId)`. The stored `classroomId` was ignored, allowing a student’s progress for the same library lesson to be reused by a second classroom placement.
- Analytics were calculated in the general dashboard route rather than a focused service, making formulas hard to test and document.
- The dashboard GET performed a progress-row count and then called `ensureProgressRowsForUser` once per incomplete student. This was both an N+1 pattern and an unexpected write during an analytics read; the read now treats absent legacy rows as unstarted work.

## Source records and semantics

- `Classroom` and `ClassroomMembership`: authorization and current roster scope. Archived classrooms, removed/pending memberships, inactive users, and non-student accounts are excluded.
- `UserProgress`: built-in level progress, cumulative failed attempts (`attemptCount`), first-completion `finalScore`, confirmed foreground `timeSpentSeconds`, first completion time, hint fields, and latest failure/activity timestamps.
- `LevelContentOverride`: enabled levels and class due dates.
- `ClassroomLessonPlacement`: classroom identity for teacher-library lessons.
- `ClassroomLessonProgress`: viewed/completed state for reading lessons, now uniquely scoped by classroom, lesson, and student.
- `ClassroomLessonSubmission`: assignment submission count and teacher grade. Grades are normalized by `maxScore` only for cross-lesson percentage distributions.

Replay attempts do not update completed `UserProgress` rows, so stored attempts, time, score, and completion remain the original academic outcome. Legacy rows with null timing or scores remain valid and produce an explicit “Not enough data” value rather than zero.

## Curriculum enablement and classroom scope

Built-in curriculum eligibility is derived from `PLAYABLE_LEVEL_KEYS` plus the already-batched `LevelContentOverride` rows. An explicit `isEnabled: false` disables a level. A missing override is enabled by default, matching `classroomLevelSettingsService` and the student level-access flow.

For a single-classroom filter, each student's expected curriculum levels are the levels enabled in that classroom. For the all-classrooms view, students are deduplicated and each student's applicable level set is the union of levels enabled across that student's selected classroom memberships. A student-scoped `UserProgress` row therefore contributes at most once even when the student belongs to multiple selected classrooms. This union is deterministic and reflects every currently assigned level, but it cannot attribute the student's built-in progress to a particular classroom because `UserProgress` has no `classroomId`.

The same applicable-level set controls both the denominator and the included progress rows. A currently disabled level does not contribute progress, completion, attempts, scores, active time, hints, activity, difficulty, or attention evidence, even if the student completed or attempted it before it was disabled. Due dates are considered only from classroom settings where that level is enabled; when multiple enabled selected classrooms provide due dates, the earliest due date is used.

If a student has no enabled levels in a curriculum lesson, that student-lesson outcome is unavailable: it has zero expected levels, null progress, no completion state, and an explicit `Unavailable` heatmap cell. If no student in scope has an enabled level for the lesson, the lesson remains visible as unavailable but is excluded from progress, completion, difficulty, highlights, and attention calculations. It is never treated as 0% complete or as unstarted work.

Disabling a level is an analytics and access-policy decision only. Existing `UserProgress` rows are neither changed nor deleted and become eligible again if the level is re-enabled in the applicable scope.

## Formulas

- Total Students: distinct active students with an active membership in the selected active classroom scope.
- Average Progress: mean current progress across started, applicable built-in curriculum lessons in scope; unavailable outcomes are excluded.
- Completion Rate: completed applicable student-lesson outcomes divided by started applicable student-lesson outcomes in the selected activity window.
- Average Score: mean stored first-completion level scores plus normalized graded assignment scores.
- Average Attempts: mean recorded solution attempts, where a curriculum outcome is failed attempts plus one successful attempt when completed; assignments use stored submission attempts.
- Average Active Time: mean confirmed active timer seconds for started curriculum lessons with positive time.
- Hint Usage Rate: curriculum student-lesson outcomes with any hint divided by started curriculum outcomes.
- First-attempt Success: completed levels with zero recorded failures divided by completed levels.

Difficulty needs at least three starters and one attempt/completion. It is a normalized 0–100 composite:

- 35% failed-attempt rate
- 30% non-completion rate
- 20% score deficit
- 15% hint-use rate

Missing signals are omitted and remaining weights are normalized. Scores below 34 are Low, 34–66.9 Moderate, and 67+ High. Raw time is not used as proof of difficulty.

Attention rules are centralized in `ATTENTION_RULES` and emit plain-language reasons. Current rules cover five or more failed attempts on unfinished work, four or more attempts without completion, progress at or below 25% across started work, 14 days of inactivity, hint use on at least half of three or more started lessons, and known overdue class work.

## Filters and historical limits

Classroom filters are validated against teacher ownership before roster/activity reads. Date windows use the latest recorded activity on cumulative progress records. Current roster size is not presented as historical roster size. The existing schema cannot reconstruct attempts-by-day or active-time-by-day, so those metrics are explicitly unavailable rather than inferred.

Built-in `UserProgress` predates classroom placement and is student-scoped. A teacher can see it only while the student is an active member of that teacher’s selected classroom. Consequently, the all-classrooms union rule can determine current eligibility but cannot determine which classroom produced a built-in progress event. Reusable teacher-library lesson progress is fully classroom-scoped.

## Query and authorization audit

The analytics service uses a fixed number of batched queries. It does not issue one query per student or per lesson and does not return raw level rows to React. Student detail uses the same ownership and membership checks with a narrowed student scope.

The additive migration changes reusable lesson progress uniqueness to `(classroomId, lessonId, studentId)` and adds indexes for the actual analytics predicates. No analytics columns or synthetic events were added.
