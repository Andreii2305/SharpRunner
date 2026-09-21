# Teacher Analytics Phase 4 Design

## Intent

Turn the Phase 1–3 analytics foundation into a practical teacher reporting experience without changing its source-of-truth boundaries. `UserProgress` remains the current/cumulative source and `LearningAnalyticsEvent` remains the append-only historical source. Phase 4 adds presentation, comparison, export, reporting, and usability around those sources; it does not add predictive analytics, synthetic history, or a parallel analytics architecture.

## Existing Architecture to Reuse

- `teacherAnalyticsService.getTeacherAnalytics()` owns teacher/admin authorization, active-classroom and roster scoping, classroom/student/lesson/date filters, enabled-level eligibility, current metrics, difficulty, attention, funnels, failure patterns, and the public dashboard payload.
- `learningAnalyticsHistoryService.getHistoricalLearningAnalytics()` owns event-backed, aggregate-only history and `trackingSince` semantics.
- `TeacherAnalyticsPage.jsx` owns the page-local filter state, lightweight CSS bar visualization, tables, lesson expansion, and student drawer.
- The admin route has a small CSV serializer pattern that quotes every cell and prefixes formula-like values, but it is route-local and untested.
- The frontend has no component-test framework. Phase 4 will test pure UI/query/download helpers with Node and use build/lint plus browser verification for rendered behavior.

## Backend Design

### Canonical analytics payload

Dashboard, report view, student detail, and exports consume the same `getTeacherAnalytics()` result so metric definitions cannot drift. The service continues to use batched reads. Requested students are validated against the full authorized active roster before data is narrowed, and the filter-option roster remains available after a student is selected.

An explicitly supplied invalid `studentId` is a 400 error. A valid but unauthorized student remains a 403 error. Custom `YYYY-MM-DD` boundaries are parsed as inclusive UTC day boundaries, matching the documented semantics regardless of server timezone.

Student rows gain only derived aggregates needed by reports and exports: started/completed lessons, total failed attempts, hint-use count/status, and existing progress, score, attempts, time, activity, and attention fields. When one student is requested, the payload gains sanitized per-lesson/per-level detail derived from already-loaded progress rows. It never exposes raw event rows, compiler output, source code, failure metadata, database metadata, authentication identifiers, or dedupe keys.

### Historical totals and comparison

Each returned history bucket includes:

- attempts
- successful attempts
- failed attempts
- completions
- active seconds
- hint uses
- first-attempt success numerator, denominator, and nullable rate

Successful attempts and completions are both exposed because teachers select them independently. Under the current Phase 3 taxonomy, a first successful completion produces one `level_completed` event, so their counts are equal. This is documented rather than obscured.

Historical first-attempt success is `level_completed` events whose trusted `attemptNumber` is 1 divided by all `level_completed` events in the period. This matches Phase 2's completed-with-zero-prior-failures definition. A zero completion denominator returns `null`, never 0%.

For `7d`, `30d`, and valid custom filters, comparison uses the immediately preceding window with the exact same duration. The prior window ends one millisecond before the current window begins. Current totals are reduced from the current series; one additional bounded aggregate query obtains previous totals. Query count is fixed relative to dataset size.

Count and duration metrics return current value, previous value, absolute change, and percentage change only when the previous value is greater than zero. When both values are zero, absolute change is zero and percentage change is unavailable. When previous is zero and current is positive, the response explicitly explains that percentage comparison is unavailable. First-attempt success compares nullable rates in percentage points, not relative percent.

### CSV exports

Create a shared `csvService` with `serializeCsv()` and `sendCsv()` and reuse it from admin and teacher routes. It emits a UTF-8 BOM, CRLF rows, quotes every cell, doubles quotes, preserves commas and line breaks inside quoted cells, and prefixes an apostrophe when the first non-whitespace/control character is `=`, `+`, `-`, or `@`.

Routes:

- `GET /api/teacher/analytics/export/students.csv`
- `GET /api/teacher/analytics/export/lessons.csv`

Both remain behind the existing teacher/admin middleware and pass the request query unchanged to `getTeacherAnalytics()`. Static safe filenames are sufficient. Null or unsupported metrics export as `N/A`; legitimate numeric zero remains `0`.

Student CSV fields: Student Name, Username, Progress %, Completed Lessons, Started Lessons, Average Score, Failed Attempts, Average Attempts, Active Time, Hint Usage, Last Activity, Needs Attention, Attention Reasons.

Lesson CSV fields: Lesson, Type, Applicable Students, Started Students, Completed Students, Completion Rate, Average Progress, Average Score, Average Attempts, Failed Attempts, Average Active Time, Hint Usage Rate, First Attempt Success, Difficulty.

Level and historical CSV exports are intentionally deferred: the two required exports cover the useful canonical tables without multiplying endpoints and UI controls.

## Frontend Design

### Filters and request states

Add a server-backed student filter to the existing classroom/date/lesson filters. Show active-filter chips/context and a Clear Filters action. Classroom changes reset incompatible student and lesson selections. The same query builder is used by dashboard requests, student detail, and exports.

While a request is pending, mark the results region busy and show an updating state. On a non-cancelled request failure, replace prior analytics with the empty payload before displaying the error so stale results are never represented as current. Export failures receive their own alert and do not disturb dashboard data.

### Trends

Keep the existing dependency-free CSS visualization. Add all seven required selectors, a visible metric title, exact text values, human-readable active durations with exact seconds in accessible text, nullable first-attempt rates, and a compact current-versus-previous comparison. The chart is supplementary; a text/table equivalent exposes every period and value.

### Report and print

Dashboard and Report are local view modes, not new routes or global state. The report reuses the loaded payload and contains factual Overview, Engagement, Lesson Performance, Students Needing Attention, and Failure Summary sections. It includes the selected scope and generation timestamp.

Print activates the report view before calling `window.print()`. Print CSS hides the sidebar and interactive-only controls, uses white backgrounds, preserves the title/context/timestamp, avoids breaking cards and rows where supported, and allows wide tables to fit legibly. Browser Print/Save as PDF is the only PDF workflow.

### Student drill-down

The drawer keeps its compact role and adds aggregate lesson/level status, score, attempts, failed attempts, active time, hint use, latest activity, attention reasons, and historical totals/trend when available. It never displays raw events. The dialog closes with Escape, moves focus to its close button on open, restores focus to the launching control on close, and uses semantic buttons rather than clickable table rows.

### Accessibility and responsive behavior

Selectors and view toggles use semantic buttons with `aria-pressed`; expandable lessons retain `aria-expanded` and `aria-controls`; tables use scoped headers; chart values have exact textual equivalents; status/difficulty/failure states always include words or symbols as well as color. Focus indicators remain visible. Genuine wide tables scroll horizontally on small screens, while KPI, filter, trend, report, and drawer grids collapse without hiding information.

## Error and Empty Semantics

Explicit copy distinguishes no students, no applicable levels, no attempts, no completions, no history, pre-tracking windows, no recorded failures, unavailable scores/difficulty, dashboard failure, and export failure. Missing evidence is `N/A` or “Not enough data,” not numeric zero. Absence of failures is described as no recorded failures for the scope, not proof that students had no difficulty.

## Security and Performance

All scope identifiers are revalidated by the backend. Exports cannot broaden beyond the current authorized classroom/student/lesson/date selection. No email, auth ID, token, secret, source, compiler log, stack trace, raw metadata, raw event, or dedupe key is exported.

Phase 4 adds at most one previous-period aggregate query for bounded history and no per-row queries. Exports reuse the already-batched analytics service and buffer only the capstone-scale authorized result. No queue, new dependency, or schema migration is introduced.

## Verification

Backend tests cover filter validation, UTC boundaries, comparison math and zero denominators, first-attempt semantics, tracking start, export authorization/filter consistency, CSV quoting/injection/UTF-8, unavailable values, enabled-level and multi-classroom preservation, and sensitive-field absence. Frontend pure-helper tests cover query/reset/export derivation and trend comparison formatting. Existing Phase 1–3 tests remain unchanged and green. Final verification includes backend full suite and compiler build, frontend tests/lint/build/content audits, `git diff --check`, source security/query/accessibility/responsive/migration reviews, and interactive browser checks when available.

## Limitations

- Successful Attempts and Completions are numerically identical under the current event taxonomy.
- Historical trends cover built-in gameplay events; reusable classroom lessons do not yet emit `LearningAnalyticsEvent` rows.
- Historical comparison is unavailable for all-time because it has no bounded equivalent preceding period.
- CSV export is limited to student and lesson performance in Phase 4.
- PDF output depends on the browser's Print/Save as PDF support.
- Event retention remains unlimited as documented in Phase 3.

