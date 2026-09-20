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
6. `TeacherAnalyticsPage.jsx`, which renders cards, sortable tables, deterministic heatmap states, CSS funnels, expandable curriculum-level tables, and current failure-pattern summaries.

Phase 2 keeps level details in the existing analytics response. SharpRunner has 29 playable level keys, so compact server-aggregated metrics do not justify a second endpoint or duplicated authorization/filter logic. Raw `UserProgress` rows and failure metadata are never returned to React.

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

`attemptCount` is the number of failed solution submissions, not total submissions. A completed row therefore proves one successful solution attempt even when `attemptCount === 0`; analytics calculate recorded solution attempts as failed submissions plus one when completed. Opening or timing a level can establish started evidence without establishing an attempted state.

`latestFailureCode`, `latestFailureCategory`, sanitized `latestFailureMetadata`, `latestFailureAt`, and `latestFailureAttemptCount` are overwritten together after each failed validated submission. `latestFailureAttemptCount` is the cumulative failed-attempt count at which that latest signal was recorded; it is not the number of occurrences of that failure code or category. Successful completion does not clear these fields, so completed rows can retain a pre-success signal.

## Curriculum enablement and classroom scope

Built-in curriculum eligibility is derived from `PLAYABLE_LEVEL_KEYS` plus the already-batched `LevelContentOverride` rows. An explicit `isEnabled: false` disables a level. A missing override is enabled by default, matching `classroomLevelSettingsService` and the student level-access flow.

For a single-classroom filter, each student's expected curriculum levels are the levels enabled in that classroom. For the all-classrooms view, students are deduplicated and each student's applicable level set is the union of levels enabled across that student's selected classroom memberships. A student-scoped `UserProgress` row therefore contributes at most once even when the student belongs to multiple selected classrooms. This union is deterministic and reflects every currently assigned level, but it cannot attribute the student's built-in progress to a particular classroom because `UserProgress` has no `classroomId`.

The same applicable-level set controls both the denominator and the included progress rows. A currently disabled level does not contribute progress, completion, attempts, scores, active time, hints, activity, difficulty, or attention evidence, even if the student completed or attempted it before it was disabled. Due dates are considered only from classroom settings where that level is enabled; when multiple enabled selected classrooms provide due dates, the earliest due date is used.

If a student has no enabled levels in a curriculum lesson, that student-lesson outcome is unavailable: it has zero expected levels, null progress, no completion state, and an explicit `Unavailable` heatmap cell. If no student in scope has an enabled level for the lesson, the lesson remains visible as unavailable but is excluded from progress, completion, difficulty, highlights, and attention calculations. It is never treated as 0% complete or as unstarted work.

Disabling a level is an analytics and access-policy decision only. Existing `UserProgress` rows are neither changed nor deleted and become eligible again if the level is re-enabled in the applicable scope.

The same rules apply to Phase 2 details. A level appears in a lesson drill-down only when it is applicable to at least one student in the selected scope. A disabled historical row cannot contribute to its level metrics, lesson funnel, or failure patterns. In the all-classrooms view, each student-level is counted once when that level is enabled in at least one of the student's selected classroom memberships.

## Curriculum level analytics

Each curriculum lesson returns a compact `levels` array. Zero-applicable levels are omitted instead of being displayed as failed 0% outcomes. A teacher-provided `lessonCardTitle` is used when one unambiguous enabled title exists in the selected scope; otherwise the display name is `Level N`.

Per-level formulas are:

- Applicable Students: distinct scoped students for whom this exact level is enabled.
- Started: applicable students with legitimate progress evidence in the selected activity window (`startedAt`, progress, completion, failed attempt, positive active time, or hint evidence).
- Attempted: applicable students with at least one failed submission or a completed outcome. Started alone is not attempted.
- Completed: applicable students whose row records completion.
- Start Rate: started divided by applicable students.
- Attempt Rate: attempted divided by applicable students.
- Completion Rate: completed divided by started, matching the lesson-performance completion denominator.
- Average Score: mean stored first-completion `finalScore` among completed rows with a score.
- Average Attempts: mean failed submissions plus one successful submission when completed, among attempted rows.
- Average Failed Attempts: mean `attemptCount` among attempted rows; Total Failed Attempts is the sum of `attemptCount`.
- Average Active Time: mean positive confirmed `timeSpentSeconds` among started rows.
- Hint Usage Rate: started rows with `hintUsed` divided by started rows. Basic users require recorded basic use; purchased/situational users use `detailedHintUnlocked` or the detailed hint type.
- First-attempt Success: completed rows with zero failed submissions divided by completed rows.

Level difficulty calls the same shared `calculateDifficulty()` implementation as lesson difficulty: 35% failed-attempt rate, 30% non-completion rate, 20% score deficit, and 15% hint-use rate, with available weights normalized and at least three starters required. Raw time is not a difficulty signal.

## Learning funnel

Each curriculum lesson returns one funnel based on the same per-student applicable-level set used by lesson completion:

- Applicable: the student has at least one enabled level in the lesson.
- Started: at least one applicable enabled level has legitimate progress evidence in the selected activity window.
- Attempted: at least one applicable enabled level has a failed submission or recorded completion. A successful first submission counts even when `attemptCount === 0`.
- Completed: every applicable enabled level in the lesson is completed under the Phase 1 semantics.

`startedRate`, `attemptedRate`, and funnel `completionRate` use Applicable as the denominator. The response also returns `startedFromApplicable`, `attemptedFromStarted`, and `completedFromAttempted`. A zero denominator returns `null`, never a fabricated percentage. The funnel completion rate therefore answers a different explicit question from the lesson-performance completion rate: completion across all applicable students versus completion among students who started.

## Current failure patterns

Failure analytics describe latest recorded signals, not historical error frequency. Each applicable student-level contributes at most one signal. Aggregates preserve raw category/code values in the API, add safe readable labels, count distinct affected students/levels/lessons, identify the most affected level, and expose the latest occurrence. `latestFailureAttemptCount` and cumulative `attemptCount` are never treated as category occurrence counts.

The default presentation has two explicit groups:

- Unresolved Latest Signals: the level remains unfinished, so the retained latest failure is a current blocker signal.
- Completed After Latest Failure: the student subsequently completed the level. The retained pre-success signal is useful context but is not labeled current or unresolved.

Only category/code identifiers and safe aggregates reach the teacher UI. `latestFailureMetadata` is not included in the analytics payload, so compiler/debug details and submitted source cannot be exposed by this feature. Unknown stored categories or codes fall back to a readable form without being reclassified.

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

Current failure patterns apply the selected window directly to `latestFailureAt`. A signal outside the window is excluded even if another cumulative field on the row changed inside the window. This does not reconstruct failures that occurred before the latest retained failure and does not claim historical frequency.

Built-in `UserProgress` predates classroom placement and is student-scoped. A teacher can see it only while the student is an active member of that teacher’s selected classroom. Consequently, the all-classrooms union rule can determine current eligibility but cannot determine which classroom produced a built-in progress event. Reusable teacher-library lesson progress is fully classroom-scoped.

## Query and authorization audit

The analytics service uses a fixed number of batched queries. Level metrics, funnels, and failure patterns reuse the same one `UserProgress` read and the same one `LevelContentOverride` read; they do not issue one query per level, lesson, student, or failure category. Student detail uses the same ownership and membership checks with a narrowed student scope. An unknown lesson filter is rejected rather than being treated as an authorized empty drill-down.

The earlier additive migration changed reusable lesson progress uniqueness to `(classroomId, lessonId, studentId)` and added indexes for the actual analytics predicates. Phase 2 requires no migration: it uses the existing latest-failure fields and does not add synthetic or historical failure events.
