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

## Filters and current-state limits

Classroom filters are validated against teacher ownership before roster/activity reads. For the current-state cards, tables, funnels, and failure patterns, date windows use the latest recorded activity on cumulative progress records. Current roster size is not presented as historical roster size. Pre-event data cannot reconstruct attempts-by-day or active-time-by-day, so those metrics remain explicitly unavailable before Phase 3 tracking began rather than being inferred.

Current failure patterns apply the selected window directly to `latestFailureAt`. A signal outside the window is excluded even if another cumulative field on the row changed inside the window. This does not reconstruct failures that occurred before the latest retained failure and does not claim historical frequency.

Built-in `UserProgress` predates classroom placement and is student-scoped. A teacher can see it only while the student is an active member of that teacher’s selected classroom. Consequently, the all-classrooms union rule can determine current eligibility but cannot determine which classroom produced a built-in progress event. Reusable teacher-library lesson progress is fully classroom-scoped.

## Query and authorization audit

The analytics service uses a fixed number of batched queries. Level metrics, funnels, and failure patterns reuse the same one `UserProgress` read and the same one `LevelContentOverride` read; they do not issue one query per level, lesson, student, or failure category. Student detail uses the same ownership and membership checks with a narrowed student scope. An unknown lesson filter is rejected rather than being treated as an authorized empty drill-down.

The earlier additive migration changed reusable lesson progress uniqueness to `(classroomId, lessonId, studentId)` and added indexes for the actual analytics predicates. Phase 2 required no migration: it uses the existing latest-failure fields and does not add synthetic or historical failure events.

## Phase 3 event history

Phase 3 adds the append-only `LearningAnalyticsEvents` table as a durable history source while retaining `UserProgress` as the current-state source. It does not rewrite or backfill either source. The event table contains only typed analytics fields: student, nullable classroom, curriculum level and lesson keys, event type and occurrence time, plus the small event-specific values needed for attempts, score, failure category/code, active seconds, or hint type/purchase. `dedupeKey` is a unique server-generated idempotency key. Rows have `createdAt` but deliberately have no `updatedAt`, free-form metadata, source code, compiler output, stdout, stderr, request payload, or student-authored text.

The supported event taxonomy and recording points are:

- `level_started`: recorded once for the first non-replay start of a student-level.
- `solution_attempt_failed`: recorded after each validated failed submission, with the resulting cumulative failed-attempt number and sanitized failure category/code.
- `level_completed`: recorded for the first successful completion submission, with score and total solution-attempt number. Replay completion is excluded.
- `active_time_recorded`: recorded only for a positive timer delta accepted into `UserProgress.timeSpentSeconds`, including accepted heartbeat, end, level replacement/switch, or completion flushes.
- `hint_used`: recorded once for first basic-hint use and once for detailed-hint purchase/use for a student-level.

The frontend generates stable opaque action identifiers for an evaluation and unique timer synchronization identifiers for timer writes. The backend validates their format, derives a hashed event `dedupeKey`, and enforces uniqueness in PostgreSQL. State-transition events such as first start, first completion, and each hint type derive their key from student and level. Timer and failed-attempt retries are detected under the progress-row lock before cumulative state changes, while first completion and hint events are protected by monotonic state transitions. The database unique index remains a final race barrier: a conflicting insert rejects and rolls back its transaction instead of creating duplicate state or history. All authoritative values—including attempt number, score, failure classification, timer delta, and classroom—come from backend state rather than the client.

Event insertion occurs in the same database transaction and under the same row lock as the corresponding `UserProgress` mutation wherever the current-state row changes. Detailed-hint events share the existing idempotent XP/progress purchase transaction. A failure therefore cannot commit its current-state counter without its event, a completion cannot commit without its event, and accepted active seconds cannot be accumulated without their event. Timer mutations recheck completion and session identity after locking, and out-of-order heartbeats or replacement starts cannot move the locked watermark backward. Stale sessions, duplicate synchronization identifiers, non-positive elapsed time, and unconfirmed gaps over 45 seconds add neither cumulative time nor history.

### Classroom attribution and replay behavior

Every gameplay request resolves the student's primary active membership: the most recently joined, then most recently updated, active membership whose classroom is active. That same membership authorizes/configures the gameplay request and supplies `classroomId` to its event; analytics do not independently choose a classroom after the fact. If a student belongs to multiple active classrooms, an event is attributed to this one authoritative gameplay-policy context. The foreign key uses `ON DELETE SET NULL` so deleting a classroom does not delete the student's academic history, although such an orphaned event is no longer included in a classroom-scoped teacher view. Deleting the student uses `ON DELETE CASCADE` in accordance with removal of that student's account data.

Completed-level replay remains practice-only. It does not change original progress, attempts, score, completion, failure history, active-time history, or completion events. Starting an already completed level is treated as replay and does not create a new start event. This preserves the first academic outcome while allowing gameplay.

### Historical aggregation and filters

Teacher history is authorized through the same teacher-owned active classroom, active membership, active-student, lesson, and currently enabled curriculum-level checks as the current analytics. The server never returns raw event rows. It performs exactly three aggregate reads: one grouped time series, one grouped historical failure-category summary, and the earliest eligible event timestamp used as `trackingSince`. Disabled levels and students no longer in the authorized roster do not leak through history. The classroom, student drill-down, lesson, and inclusive UTC date-window filters are applied in PostgreSQL.

Seven-day, 30-day, and custom windows up to 93 days use UTC daily buckets; longer custom windows and all-time history use UTC monthly buckets. The UI exposes one selectable metric at a time—attempts, completions, failures, active time, or hint usage—with exact values and no fabricated zero periods. Historical failure counts are actual failed-submission events and are displayed separately from current latest-failure signals. If there are no eligible events, the response has an empty series and explains that tracking has no data; it never manufactures legacy history.

`trackingSince` is the earliest eligible event for the currently authorized classroom/student/lesson/level scope, intentionally ignoring the selected date window. This makes the limitation visible when a teacher selects a window that predates tracking. It is not a claim that the student, class, or product began on that date.

### Privacy, access, retention, and deployment

`LearningAnalyticsEvents` has row-level security enabled and grants revoked from `PUBLIC` and, when present, Supabase `anon` and `authenticated` roles. Normal writes occur only through authenticated backend routes and typed server-side writers. Teacher reads are backend aggregates after ownership/membership authorization. The migration adds indexes for classroom/student/time, student/time, event-type/time, lesson/level/time, and unique deduplication; aggregation remains a fixed query count rather than growing per student or period.

Retention is currently unlimited so the first deployment does not silently discard academic history. Once real volume and institutional policy are known, a later phase should define a documented retention window and, if needed, PostgreSQL time partitioning or archival. No automatic deletion is introduced here.

Deploy by running `npm run db:migrate` from `backend`. Migration `20260921000000_learning_analytics_events.sql` is additive and idempotent: it creates the event table, checks, indexes, foreign keys, RLS, and revokes, and the migration ledger prevents reapplying completed work. It performs no event replay and does not mutate `UserProgresses`. Consequently, trends begin only when the Phase 3 backend is deployed; all earlier current-state metrics remain available, but pre-deployment daily/monthly attempts, failures, active time, and hints are unknowable and stay absent.

## Phase 4 reporting, exports, and historical comparison

Phase 4 keeps the Phase 1-3 data split intact: `UserProgress` and classroom-lesson records provide current/cumulative reporting, while `LearningAnalyticsEvent` provides historical trends. The interactive dashboard remains the primary exploration view. A separate factual Report view reuses the same authorized payload for overview, engagement, lesson performance, students needing attention, and failure summaries. It does not generate predictions or narrative recommendations. The report preserves the selected filter context and generation timestamp and has print rules that hide navigation and interactive controls, use ink-friendly colors, and avoid splitting important cards and table rows where practical. Browser Print / Save as PDF is the supported PDF path; there is no server-side PDF generator.

The Learning Trends selector now covers Attempts, Successful Attempts, Failed Attempts, Completions, Active Learning Time, Hint Usage, and First-Attempt Success. Counts and accepted active seconds are summed from event aggregates, never reconstructed from `UserProgress`. Active time has a readable duration and an exact-seconds text alternative. Each daily or monthly rate point includes its numerator and denominator. Historical first-attempt success is defined as successful completion events whose authoritative `attemptNumber` is 1 divided by all successful completion events in the period. This is consistent with the current level metric's academic meaning, but its source is historical completion events rather than cumulative rows. A period with no completions has a null rate and is displayed as `N/A`, not 0%.

For a bounded 7-day, 30-day, or valid custom UTC range, the server compares the selected inclusive interval with the immediately preceding interval of exactly the same millisecond duration. Count and duration metrics include current value, previous value, absolute change, and percentage change only when the previous value is greater than zero. A zero previous value produces an explicit explanation instead of infinity; two zero periods likewise avoid a percentage claim. First-attempt success compares percentage points, not relative percentages, and is unavailable if either period has no successful-completion denominator. All-time history is unbounded and therefore has no preceding-period comparison.

### Filters, drill-down, and states

Classroom, student, lesson, and date controls share one canonical query builder. The same query string is used for dashboard refreshes and CSV requests. Classroom IDs remain ownership-validated; an explicit student ID must be an active student in the teacher's selected active classroom scope. Malformed, empty, non-scalar, or duplicate classroom, student, lesson, date-preset, custom-date, and admin teacher-scope values return 400 rather than silently falling back to a broader result. Unauthorized but well-formed classroom, student, or lesson scope returns 403. The student selector retains the full authorized roster while the data payload is narrowed to the selected student. Custom date inputs are accepted only with the custom preset and are parsed as exact `YYYY-MM-DD` UTC boundaries (`00:00:00.000Z` through `23:59:59.999Z`) so browser or server local time cannot shift the range.

The student drawer returns aggregate-only lesson and curriculum-level details: progress/status, score, attempts, failed attempts, accepted active time, hint use, latest activity, attention reasons, and a compact event-backed history summary. It never exposes raw events, source, compiler output, or failure metadata. The page clears previously displayed payloads after a failed filter request, shows a busy state during refresh, identifies incomplete/invalid custom ranges, and gives explicit empty states for absent students, applicable levels, attempts, completions, historical events, and failures. Missing scores, rates, and difficulty remain `N/A` or `Not enough data`; absence is not converted into a positive claim.

Keyboard and assistive-technology behavior includes native buttons for sortable headers and student rows, labelled metric selectors, `aria-expanded` on lesson expansion controls, scoped row/column table headers, visible focus styles, exact textual chart values, and a focus-managed student dialog that closes with Escape and returns focus to its launcher. Status, attention, completion, difficulty, and failure information is expressed in text as well as color. Wide tables and the heatmap use controlled horizontal scrolling at narrow widths, while KPI, filter, trend, report, and drawer layouts reflow without removing data columns.

### CSV exports

Two teacher-only routes are provided: `GET /api/teacher/analytics/export/students.csv` and `GET /api/teacher/analytics/export/lessons.csv`. Both run the canonical analytics service with the request's current filters, so authorization, disabled-level exclusion, all-classrooms union behavior, student deduplication, lesson validation, and metric definitions cannot diverge from the screen. Exports are buffered in memory, which is appropriate for the current teacher-owned active roster and fixed lesson catalog; there are no per-student, per-lesson, or per-level export queries.

Student CSV columns are Student Name, Username, Progress %, Completed Lessons, Started Lessons, Average Score, Failed Attempts, Average Attempts, Active Time, Hint Usage, Last Activity, Needs Attention, and Attention Reasons. Lesson CSV columns are Lesson, Type, Applicable Students, Started Students, Completed Students, Completion Rate, Average Progress, Average Score, Average Attempts, Failed Attempts, Average Active Time, Hint Usage Rate, First Attempt Success, and Difficulty. Legitimate numeric zeroes are preserved. Null or unavailable analytics values use `N/A`.

The shared CSV serializer quotes every cell, doubles embedded quotes, uses CRLF rows, and prefixes a UTF-8 BOM for spreadsheet-compatible names. After any leading whitespace or control characters, strings beginning with `=`, `+`, `-`, or `@` receive a leading apostrophe to prevent spreadsheet formula execution. Download filenames are restricted to letters, digits, dots, underscores, and hyphens; responses set a UTF-8 CSV content type, attachment disposition, and `X-Content-Type-Options: nosniff`. Exports intentionally omit email, database/auth identifiers, password or token data, event dedupe keys, raw events, source code, compiler output, and raw failure metadata.

### Query shape, deployment, and limitations

Current analytics and exports continue to use the Phase 1-3 fixed batched reads. A bounded historical request adds one aggregate query for the preceding period, making four historical reads total: grouped series, grouped failures, one previous-window aggregate, and tracking start. All-time history remains three reads. Query count is fixed relative to student, lesson, level, bucket, and CSV row counts; raw event rows are never loaded.

Phase 4 adds no database columns, tables, indexes, event types, backfill, or migration. Deploy the backend and frontend normally; the only outstanding database step is the already-documented Phase 3 migration for environments that have not applied it. Known limitations remain: history begins at Phase 3 tracking deployment, built-in current progress cannot be retrospectively attributed among multiple classrooms, retained current failure signals are not historical frequency, report PDF output depends on the browser print engine, and CSV generation is buffered rather than streamed. Level and historical CSVs were intentionally not added because student and lesson exports cover the requested teacher workflows without duplicating endpoints or widening the export surface.

## Phase 5 release-readiness audit

The final audit retained the Phase 1-4 metric definitions and the current-state/historical split. Metric denominators, enabled-level eligibility, zero-enabled unavailable lessons, multi-classroom student deduplication and enabled-level union behavior, current latest-failure signals, append-only historical failures, first-attempt completion semantics, `trackingSince`, UTC boundaries, and immediately preceding equal-period comparisons remain unchanged. Historical aggregation still performs three fixed reads for all time and four for bounded ranges; current analytics and both CSV exports remain batched and do not add per-student, per-lesson, per-level, or per-bucket queries.

The audit tightened filter handling at the service boundary. Duplicate query parameters arrive as non-scalar values and are rejected along with unsupported date presets, invalid lesson values, custom date values used without the custom preset, and malformed admin teacher scope. Dashboard, drill-down, and CSV routes all inherit the same validation because they call the canonical analytics service.

Completion consistency now uses one database transaction for the `UserProgress` completion and score, the `level_completed` event, the idempotent XP ledger entry, the user's XP balance, and the progress row's XP-award marker. Completion and detailed-hint purchase both lock the user before progress, preventing an opposing lock order during concurrency. A failed event or XP write therefore rolls back the academic completion instead of leaving a completed level with missing history or reward; replay remains immutable and cannot duplicate either event or XP.

The teacher page aborts and invalidates student-detail requests when a newer student is opened, filters change, the drawer closes, or the component unmounts. This prevents late responses from replacing the currently selected student's data. The dialog moves initial focus to its close control, traps Tab/Shift+Tab within the drawer, closes on Escape or backdrop activation, and restores focus to its launcher. Dashboard and report sections use native heading structure, while existing table scopes, textual chart values, status labels, error alerts, loading status, responsive overflow, and print-only rules remain in place.

Phase 5 adds no schema change, migration, cache, queue, background worker, PDF service, or analytics feature. Deployment remains the normal backend/frontend deployment plus `npm run db:migrate` for environments that have not applied the existing Phase 3 event migration.
