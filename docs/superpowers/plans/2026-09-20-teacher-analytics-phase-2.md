# Teacher Analytics Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add curriculum level drill-down, a deterministic applicable-to-completed learning funnel, and honest current/latest failure-pattern analytics without weakening Phase 1 eligibility rules.

**Architecture:** Extend the existing bounded-query `getTeacherAnalytics()` pipeline and existing `/api/teacher/analytics` response. The 29 playable curriculum levels are small enough to return as compact per-lesson detail; all aggregation remains server-side and reuses each student's Phase 1 union-enabled level set. The React page renders expandable curriculum rows, CSS-only funnels, and sanitized failure summaries without new dependencies.

**Tech Stack:** Node.js, Express, Sequelize, Node test runner, React 19, CSS Modules, Vite, ESLint.

**Spec:** User-provided SharpRunner Teacher Analytics Phase 2 continuation brief attached to this session.

## Global Constraints

- Preserve single-classroom enabled-level semantics and all-classrooms per-student union semantics.
- Disabled levels contribute to no count, rate, score, attempt, time, hint, difficulty, funnel, failure, activity, or attention metric.
- `attemptCount` is failed submissions; a completed level adds one successful solution attempt.
- `latestFailure*` is a retained latest signal, not historical frequency; never multiply it by `attemptCount`.
- Keep teacher authorization and classroom/student scope checks server-side.
- Use bounded batched reads and no analytics-side writes.
- Do not add migrations, chart libraries, AI/LLM analysis, or unrelated changes.
- Do not commit or push.

## Review Focus

- A completed first-submission success with `attemptCount === 0` must be attempted and first-attempt successful.
- A timer/start-only row must be started but not attempted.
- Retained latest failure metadata on a completed row must be separated from unresolved current signals.
- A disabled historical row must not leak into level detail, funnel, or failure patterns.
- An all-classrooms student must be deduplicated while receiving the union of enabled levels.

---

### Task 1: Pin Level, Funnel, and Failure Semantics with Backend Tests

**Files:**
- Modify: `backend/test/teacherAnalytics.test.js`

**Interfaces:**
- Consumes: `getTeacherAnalytics({ req, query, now })` and existing Phase 1 fixture helpers.
- Produces: expected response contracts for `lessonPerformance[].levels`, `lessonPerformance[].funnel`, and top-level `failurePatterns`.

- [x] Extend `progressRow()` so tests can supply start-only evidence, detailed hints, and every `latestFailure*` field.
- [x] Add focused tests for all-enabled level metrics: applicability, started, attempted, completed, rates, score, attempts, failed attempts, active time, hint tiers, first-attempt success, and minimum-sample difficulty.
- [x] Add tests proving disabled and zero-applicable levels are omitted from drill-down and historical disabled rows affect no Phase 2 aggregate.
- [x] Add funnel tests distinguishing start-only, failed attempt, first-attempt completion, and full lesson completion.
- [x] Add multi-classroom deduplication/union assertions at level and funnel granularity.
- [x] Add latest category/code aggregation tests, including date-window exclusion and separate unresolved versus completed-after-failure counts.
- [x] Run `node --test backend/test/teacherAnalytics.test.js` and confirm the new assertions fail for missing Phase 2 fields while Phase 1 assertions still pass.

### Task 2: Implement Server-Side Phase 2 Aggregation

**Files:**
- Modify: `backend/src/services/teacherAnalyticsService.js`

**Interfaces:**
- Consumes: authorized students, batched `UserProgress` rows, `enabledLevelKeysByStudent`, current filters, and lesson definitions.
- Produces: `buildCurriculumLevelMetric(...)`, `buildLearningFunnel(...)`, `buildFailurePatterns(...)`, public level/funnel payloads, and top-level failure summaries.

- [x] Add pure evidence helpers: attempted is `attemptCount > 0 || isCompleted`; latest failure is eligible only when code/category and `latestFailureAt` are present and the timestamp matches the selected date window.
- [x] Build one student/level lookup per curriculum lesson and aggregate each playable level over applicable students only.
- [x] Return per-level counts/rates and use the existing `calculateDifficulty()` function unchanged.
- [x] Build lesson funnels from student states: applicable if at least one lesson level is enabled, started from legitimate progress evidence, attempted from an actual failure or completion, completed only when all applicable enabled levels are completed.
- [x] Aggregate latest failure categories/codes without using failure attempt counts as frequency; retain raw keys and add teacher-friendly labels.
- [x] Split failure signals into unresolved and completed-after-latest-failure outcomes; include affected student/lesson/level counts and most-affected locations without returning metadata.
- [x] Select all required failure columns in the existing single `UserProgress.findAll()` query and keep the query count unchanged.
- [x] Add formulas and limitations to payload metadata and the empty payload.
- [x] Run `node --test backend/test/teacherAnalytics.test.js` until all Phase 1 and Phase 2 tests pass.

### Task 3: Add Expandable Level Analytics and Learning Funnels

**Files:**
- Modify: `frontend/src/pages/teacher/TeacherAnalyticsPage.jsx`
- Modify: `frontend/src/pages/teacher/TeacherAnalyticsPage.module.css`

**Interfaces:**
- Consumes: `lessonPerformance[].levels`, `lessonPerformance[].funnel`, and `failurePatterns` from the analytics response.
- Produces: keyboard-accessible expandable curriculum rows, compact CSS funnels, and current failure-pattern cards/details.

- [x] Add expansion state keyed by curriculum lesson id and a real button with `aria-expanded`/`aria-controls` in each supported lesson row.
- [x] Render the expanded level table directly below its parent lesson, preserving horizontal overflow and explicit unavailable/insufficient states.
- [x] Render selected-lesson funnel when a lesson filter is active; otherwise render compact curriculum lesson funnels for comparison.
- [x] Use null-safe rate labels so zero denominators show `Not enough data`, never fabricated `0%`.
- [x] Render Current Failure Patterns with unresolved signals first and completed-after-latest-failure as a clearly separate retained-history group.
- [x] Show category, affected students, and most-affected lesson/level without exposing raw metadata; allow accessible expansion to affected level counts if data is present.
- [x] Add responsive CSS for long titles, small screens, focus states, funnel stages, nested level tables, and empty states without relying only on color.
- [x] Run frontend lint and build, correcting all introduced issues.

### Task 4: Align Documentation with Stored Semantics

**Files:**
- Modify: `docs/TEACHER_ANALYTICS_AUDIT.md`

**Interfaces:**
- Consumes: final backend formulas and response semantics.
- Produces: the authoritative audit documentation for Phase 2.

- [x] Document every level metric denominator and the unchanged difficulty formula/minimum sample.
- [x] Document applicable, started, attempted, completed, overall rates, and stage-to-stage conversions.
- [x] Document that latest failure fields are one retained signal per student-level, remain after success, and are split by unresolved versus completed-after-failure.
- [x] Document date-window handling, disabled-level exclusion, all-classrooms union/deduplication, bounded queries, and lack of a migration.

### Task 5: Full Validation and Diff Audit

**Files:**
- Verify all files above; do not modify unrelated files.

**Interfaces:**
- Consumes: completed implementation.
- Produces: reproducible verification evidence for the final report.

- [x] Run the focused Teacher Analytics tests.
- [x] Run relevant backend progress, hint, failure-classification, and analytics tests.
- [x] Run the full backend test suite where feasible.
- [x] Run frontend lint, build, and configured tests.
- [ ] Start the local frontend and use the in-app browser to inspect loading/empty states, filters, keyboard expansion, long names, horizontal overflow, small screens, failure empty state, and funnel null-rate rendering where fixture data permits. **Blocked:** the in-app browser bridge rejected its required sandbox metadata; the app server started successfully, but the bridge could not establish a session.
- [x] Run `git diff --check`, inspect `git status --short`, and confirm no migration was added.
- [x] Reconfirm bounded query assertions and the Phase 1 disabled-level regression tests.

## Execution Rulings

- Worked in the current checkout because the request explicitly targets the present Phase 1 state and forbids commits or pushes; creating a commit-backed integration worktree would conflict with that handoff.
- Extended the existing analytics response instead of adding another endpoint, keeping authorization, filters, eligibility, and the bounded-query contract in one pipeline.
- Added no frontend dependency or dedicated component harness. Existing lint/build/tests and source-level accessibility checks cover the implementation; the deferred browser smoke check is documented above.
