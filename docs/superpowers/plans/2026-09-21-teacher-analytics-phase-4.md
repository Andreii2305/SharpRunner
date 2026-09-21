# Teacher Analytics Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver authorized teacher reporting, bounded historical comparison, safe student/lesson CSV exports, an accessible report view, and improved analytics exploration while preserving Phase 1–3 semantics.

**Architecture:** Extend the existing canonical analytics and history services, then make dashboard, report, drill-down, and exports consume that shared payload. Keep visualization and view state lightweight and page-local; add no schema, analytics subsystem, or chart dependency.

**Tech Stack:** Node.js, Express 5, Sequelize 6, Node test runner, React 19, Axios, CSS Modules, Vite, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-21-teacher-analytics-phase-4-design.md`

## Global Constraints

- Preserve `UserProgress` as current/cumulative state and `LearningAnalyticsEvent` as append-only history.
- Preserve enabled-level, all-classroom union, deduplication, difficulty, due-date, failure-signal, replay, and tracking-start semantics.
- Do not add a heavy chart dependency, global state system, server PDF generator, queue, predictive model, synthetic backfill, or database migration.
- Do not expose raw events, source, compiler output, failure metadata, dedupe keys, auth data, or internal database fields.
- Keep query count fixed relative to students, lessons, levels, periods, and export rows.
- Do not commit or push.

## Review Focus

- A syntactically present but invalid `studentId` must return 400 rather than silently widening scope; Task 1 tests this.
- Custom dates must remain inclusive UTC days under non-UTC server timezones; Task 1 tests exact timestamps.
- A previous period with zero and current period above zero must never produce Infinity; Task 2 tests the response and message.
- CSV cells with whitespace/control prefixes before formula characters must be neutralized; Task 3 tests them.
- A failed filter refresh must remove prior results rather than leave stale analytics; Task 4 tests the state helper and Task 5 wires it into the page.

---

### Task 1: Canonical Filter and Student Detail Semantics

**Files:**
- Modify: `backend/src/services/teacherAnalyticsService.js`
- Modify: `backend/test/teacherAnalytics.test.js`

**Interfaces:**
- Consumes: existing `getTeacherAnalytics({ req, query, now })` and current metric builders.
- Produces: strict `parseAnalyticsFilters()` with nullable `studentId`; `filters.students`; enriched public student rows; sanitized `studentDetails` for a selected student.

- [ ] **Step 1: Add failing filter tests** asserting invalid `studentId` returns status 400 and custom `2026-09-01` through `2026-09-03` yields `2026-09-01T00:00:00.000Z` and `2026-09-03T23:59:59.999Z`.
- [ ] **Step 2: Run `node --test test/teacherAnalytics.test.js`** and confirm failures are caused by permissive student parsing and local date setters.
- [ ] **Step 3: Implement strict student parsing and UTC date parsing** using an exact `YYYY-MM-DD` parser and `Date.UTC`; authorize against the full active roster before narrowing analytics data.
- [ ] **Step 4: Add failing aggregate/detail tests** for filter-option persistence, started/completed lesson counts, failed attempts, hint use, and sanitized per-level detail.
- [ ] **Step 5: Implement enriched student aggregates and selected-student detail** from already-loaded states/rows, explicitly selecting safe fields.
- [ ] **Step 6: Re-run `node --test test/teacherAnalytics.test.js`** and confirm all existing and new tests pass.

### Task 2: Historical Metrics and Previous-Period Comparison

**Files:**
- Modify: `backend/src/services/learningAnalyticsHistoryService.js`
- Modify: `backend/test/teacherAnalytics.test.js`

**Interfaces:**
- Consumes: authorized `classroomIds`, `studentIds`, enabled-level map, lesson/date filters.
- Produces: per-bucket first-attempt numerator/denominator/rate; `historical.totals`; nullable `historical.comparison` containing exact current/previous windows and metric comparisons.

- [ ] **Step 1: Add failing history tests** for all seven metrics, actual event aggregates, first-attempt rate denominator, preceding equal-duration windows, zero previous denominator, all-zero values, rate percentage-point change, and unchanged `trackingSince` lookup.
- [ ] **Step 2: Run the focused tests** and confirm missing totals/comparison/rates are the failure reasons.
- [ ] **Step 3: Implement pure total/rate/comparison helpers** and test them directly before query integration.
- [ ] **Step 4: Add one bounded previous-period aggregate query** only when `startAt` and `endAt` exist; retain the current series, failure, and tracking queries.
- [ ] **Step 5: Re-run analytics and Phase 3 tests** with `node --test test/teacherAnalytics.test.js test/learningAnalyticsEvents.test.js` and confirm they pass.

### Task 3: Safe Authorized CSV Exports

**Files:**
- Create: `backend/src/services/csvService.js`
- Create: `backend/src/services/teacherAnalyticsExportService.js`
- Create: `backend/test/teacherAnalyticsExport.test.js`
- Modify: `backend/src/routes/admin.js`
- Modify: `backend/src/routes/teacher.js`
- Modify: `backend/test/runTests.js`

**Interfaces:**
- Consumes: canonical analytics payload from `getTeacherAnalytics()`.
- Produces: `serializeCsv({ headers, rows })`, `sendCsv(res, filename, headers, rows)`, `buildStudentPerformanceCsv(payload)`, and `buildLessonPerformanceCsv(payload)` plus two authenticated `.csv` routes.

- [ ] **Step 1: Write failing serializer tests** for commas, quotes, CR/LF, UTF-8, nulls, and formula characters after leading spaces/tabs/control characters.
- [ ] **Step 2: Run `node --test test/teacherAnalyticsExport.test.js`** and confirm the module is missing.
- [ ] **Step 3: Implement the shared serializer** with BOM, CRLF, quoted cells, quote doubling, injection neutralization, and safe fixed filenames; switch admin exports to the shared functions without changing their columns.
- [ ] **Step 4: Add failing export mapping tests** for all required columns, `N/A`, legitimate zeros, filter-preserved payloads, disabled-level/multi-classroom semantics, and absence of sensitive field names/values.
- [ ] **Step 5: Implement student and lesson export mappers and routes** that call `getTeacherAnalytics({ req, query: req.query })` behind existing middleware and return appropriate headers.
- [ ] **Step 6: Add route-focused authorization tests** for owned classroom/student success and unauthorized classroom/student rejection before CSV output.
- [ ] **Step 7: Run export, teacher analytics, API integration, and Phase 3 tests** and confirm they pass.

### Task 4: Frontend Analytics Helpers

**Files:**
- Create: `frontend/src/pages/teacher/teacherAnalyticsUtils.js`
- Create: `frontend/src/pages/teacher/teacherAnalyticsUtils.test.js`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: page filter state and backend historical comparison shape.
- Produces: `DEFAULT_ANALYTICS_FILTERS`, `buildAnalyticsQuery()`, `resetAnalyticsFilters()`, `formatTrendValue()`, `formatComparison()`, `downloadAnalyticsCsv()`, and an empty-data replacement helper for request failure.

- [ ] **Step 1: Write failing Node tests** for classroom/student/lesson/custom-date query consistency, reset behavior, duration/rate display, zero comparison copy, export URL derivation, filename parsing fallback, and stale-data clearing.
- [ ] **Step 2: Run `node src/pages/teacher/teacherAnalyticsUtils.test.js`** and confirm the missing exports fail.
- [ ] **Step 3: Implement the pure helpers and authenticated Blob download function** without adding a dependency.
- [ ] **Step 4: Add `test:teacher-analytics` to the frontend test chain** and run it to confirm all helper tests pass.

### Task 5: Trends, Report, Filters, Drawer, Accessibility, and Responsive UI

**Files:**
- Create: `frontend/src/pages/teacher/TeacherAnalyticsReport.jsx`
- Modify: `frontend/src/pages/teacher/TeacherAnalyticsPage.jsx`
- Modify: `frontend/src/pages/teacher/TeacherAnalyticsPage.module.css`

**Interfaces:**
- Consumes: Task 1 payload additions, Task 2 historical totals/comparison, Task 4 helpers.
- Produces: seven-metric trend selector, current/previous comparison, student filter and active-filter context, CSV actions, Dashboard/Report modes, print action, enriched accessible drawer, explicit states, responsive and print styling.

- [ ] **Step 1: Wire shared query/reset helpers and student filter**; clear stale data on failed refresh and keep export errors separate.
- [ ] **Step 2: Extend Learning Trends** with successful attempts and first-attempt success, exact text values, nullable rates, accessible labels, and comparison copy.
- [ ] **Step 3: Implement `TeacherAnalyticsReport`** with overview, engagement, lesson, attention, and failure sections plus filter context and generation timestamp.
- [ ] **Step 4: Add export, view-toggle, reset, and print controls** with semantic labels and busy/disabled states; switch to report view before printing.
- [ ] **Step 5: Enrich the student drawer** with level aggregates and history, Escape/focus management, focus restoration, and semantic launch buttons.
- [ ] **Step 6: Add responsive and print CSS** for KPI/filter/report/trend/drawer grids, controlled table scrolling, white print surfaces, hidden interactive controls/sidebar, and row/card break avoidance.
- [ ] **Step 7: Run frontend analytics tests, lint, and production build**; resolve every new error or warning attributable to Phase 4.

### Task 6: Documentation and Full Verification

**Files:**
- Modify: `docs/TEACHER_ANALYTICS_AUDIT.md`
- Modify only if verification exposes a defect: files owned by Tasks 1–5 and their tests.

**Interfaces:**
- Consumes: implemented behavior and fresh verification output.
- Produces: Phase 4 audit documentation and release-readiness evidence.

- [ ] **Step 1: Update the audit** with report/export features, metric and comparison definitions, first-attempt denominator, CSV fields/security, filter consistency, authorization, print/accessibility/responsive behavior, query count, limitations, and no-migration statement.
- [ ] **Step 2: Run focused backend Phase 4, teacher analytics, and event/history tests.**
- [ ] **Step 3: Run `npm test` in `backend`** and read the compiler build and full test output.
- [ ] **Step 4: Run frontend analytics tests, `npm run lint`, `npm run build`, and `npm test` in `frontend`.**
- [ ] **Step 5: Run `git diff --check` and review the complete diff** for authorization, formula injection, sensitive data, N+1 queries, accessibility, responsive behavior, and accidental schema/migration changes.
- [ ] **Step 6: Manually verify in the in-app browser when runnable**: filters, selector, comparison, downloads, expansion, drawer keyboard behavior, report/print presentation, errors, and narrow viewport. Record any environment blocker without claiming the check passed.
- [ ] **Step 7: Perform final code review** against this plan/spec, fix Critical/Important findings test-first, rerun affected and full suites, and prepare the required 26-point final report ending with the exact readiness verdict.

