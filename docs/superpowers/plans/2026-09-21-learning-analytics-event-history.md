# Learning Analytics Event History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a durable, sanitized, append-only curriculum event history and a concise event-backed Learning Trends view while preserving `UserProgress` and all Phase 1/2 analytics semantics.

**Architecture:** Trusted backend mutation paths append typed `LearningAnalyticsEvent` rows in the same transaction as the academic mutation where practical. PostgreSQL aggregates authorized, date-bounded events into the existing teacher analytics response; React renders one dependency-free selectable trend chart. No existing progress is backfilled.

**Tech Stack:** Node.js, Express 5, Sequelize 6, PostgreSQL/Supabase SQL migrations, Node test runner, React 19, CSS Modules, Vite, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-21-learning-analytics-event-history-design.md`

## Global Constraints

- `UserProgress` remains the current/cumulative academic source of truth.
- Store no submitted source, compiler output, stack trace, request payload, token, IP address, personal-name copy, raw failure metadata, or arbitrary analytics JSON.
- Only trusted backend actions create events; add no client event-ingestion endpoint.
- Record no replay academic events and create no historical backfill from cumulative state.
- Use the exact backend-selected active classroom policy context; never infer classroom identity in the teacher query.
- Preserve Phase 1 disabled-level exclusion and per-student multi-classroom union semantics.
- Preserve Phase 2 level analytics, funnels, and current/latest failure patterns.
- Aggregate growing history in PostgreSQL; never return or scan unlimited raw events in React or Node.
- Add no chart dependency and no unrelated dashboard redesign.
- Do not commit or push; commit steps normally required by the planning workflow are intentionally omitted.

## Audited Write-Path Map

| Fact | Path and mutation |
| --- | --- |
| First start | `GamePage.jsx` → `POST /progress/level/:levelKey/start` → access check → `startProgressSession()` sets `startedAt` and session fields |
| Failed solution | game outcome → `POST /progress/level/:levelKey/attempt` → `validateLevelCode()` → locked transaction increments failed `attemptCount` and replaces `latestFailure*` |
| Successful solution/completion | game outcome → `PUT /progress/level/:levelKey` → server validation → timer pause → score calculation → first-completion save → idempotent XP transaction |
| Active time | start/heartbeat/end, visibility changes, replacement, deadline, and completion → `activeLevelTimerService`; only confirmed foreground deltas up to 45 seconds are accumulated |
| Basic hint | `POST /progress/level/:levelKey/hint-use`; first use changes `hintUsed`, `hintUsedAt`, and `hintType` |
| Detailed hint | `POST /progress/level/:levelKey/detailed-hint-purchase` → `purchaseDetailedHint()` transaction deducts XP once and marks the purchased hint used |
| Replay | completed starts are ephemeral; failed-attempt endpoint returns `replay`; repeat completion preserves score/time/XP |
| Reset | editor/scene reset is client-only and does not reset academic state |
| Latest failure | only a backend-validated failed attempt writes `latestFailure*`; success does not clear it |

## Review Focus

- A retried failed-attempt request with the same `activityId` must create one event and increment `attemptCount` once.
- Concurrent/retried active-time synchronization must not duplicate a positive delta, and zero/negative/stale deltas must not create events.
- A student in multiple classrooms must store the exact classroom whose settings authorized the action, while teacher all-classroom analytics still deduplicates eligibility by student.
- A level disabled after historical activity must contribute to neither current metrics nor historical trends in that selected scope.
- Empty history and a date window before the first recorded event must not display fabricated zero-history.

---

### Task 1: Typed Event Model, Migration, and Safe Writer

**Files:**
- Create: `backend/src/models/LearningAnalyticsEvent.js`
- Create: `backend/src/services/learningAnalyticsEventService.js`
- Create: `supabase/migrations/20260921000000_learning_analytics_events.sql`
- Create: `backend/test/learningAnalyticsEvents.test.js`
- Modify: `backend/src/models/index.js`
- Modify: `backend/src/services/migrationService.js`
- Modify: `backend/test/runTests.js`
- Modify: `backend/test/securityRegression.test.js`

**Interfaces:**
- Consumes: `PLAYABLE_LEVEL_KEYS`, Sequelize transactions, trusted numeric/string event inputs.
- Produces: `EVENT_TYPES`, `normalizeActionId(value)`, `buildEventDedupeKey(namespace, parts)`, `findRecordedEvent(dedupeKey, { transaction })`, and typed writers `recordLevelStarted`, `recordFailedAttempt`, `recordLevelCompleted`, `recordActiveTime`, `recordHintUsed`.

- [x] **Step 1: Add failing model/privacy/taxonomy tests**

```js
test("learning event schema is typed, append-only, and contains no sensitive payload fields", () => {
  const fields = LearningAnalyticsEvent.rawAttributes;
  assert.ok(fields.studentId && fields.classroomId && fields.levelKey && fields.lessonKey);
  assert.ok(fields.eventType && fields.occurredAt && fields.dedupeKey && fields.createdAt);
  assert.equal(fields.updatedAt, undefined);
  for (const forbidden of ["sourceCode", "stdout", "stderr", "metadata", "requestPayload", "ipAddress"]) {
    assert.equal(fields[forbidden], undefined);
  }
});

test("typed writers retain normalized failure facts but discard arbitrary inputs", async () => {
  let created;
  await withStubs([[LearningAnalyticsEvent, "create", async (values) => {
    created = values;
    return values;
  }]], () => recordFailedAttempt({
      studentId: 1, classroomId: 2, levelKey: "arrays-level-8",
      attemptNumber: 3, failureCategory: "incorrect_output",
      failureCode: "OUTPUT_MISMATCH", activityId: "attempt_action_123",
      sourceCode: "secret", stderr: "compiler dump",
    }));
  assert.equal(created.failureCode, "OUTPUT_MISMATCH");
  assert.equal(created.sourceCode, undefined);
  assert.equal(created.stderr, undefined);
});
```

- [x] **Step 2: Run the new test and confirm RED**

Run: `node --test test/learningAnalyticsEvents.test.js` from `backend`  
Expected: failure because the model and service do not exist.

- [x] **Step 3: Implement the controlled model and writer**

```js
const EVENT_TYPES = Object.freeze({
  LEVEL_STARTED: "level_started",
  ATTEMPT_FAILED: "solution_attempt_failed",
  LEVEL_COMPLETED: "level_completed",
  ACTIVE_TIME: "active_time_recorded",
  HINT_USED: "hint_used",
});

const recordFailedAttempt = (input, options = {}) => createValidatedEvent({
  studentId: input.studentId,
  classroomId: input.classroomId,
  levelKey: input.levelKey,
  eventType: EVENT_TYPES.ATTEMPT_FAILED,
  occurredAt: input.occurredAt,
  attemptNumber: input.attemptNumber,
  failureCategory: input.failureCategory,
  failureCode: input.failureCode,
  dedupeKey: buildEventDedupeKey("failed-attempt", [input.studentId, input.levelKey, input.activityId]),
}, options);
```

Derive `lessonKey` from the validated level key. Whitelist only schema fields. Reject invalid IDs, unsupported levels/types, scores outside 0–100, non-positive active seconds, invalid hint types, and malformed action IDs.

- [x] **Step 4: Add and register the forward migration**

Create the table with bigint identity primary key, foreign keys, check constraints, unique `dedupeKey`, the four query indexes from the spec, RLS, and privilege revocation. Register `20260921000000_learning_analytics_events` after the Phase 2 migration. Add model associations using user cascade and classroom set-null behavior.

- [x] **Step 5: Add migration agreement and no-backfill tests**

```js
test("event migration matches the model and performs no UserProgress backfill", async () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "LearningAnalyticsEvents"/);
  assert.match(sql, /CHECK \("eventType" IN/);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+"LearningAnalyticsEvents"\s+SELECT/i);
  assert.doesNotMatch(sql, /UPDATE\s+"UserProgresses"/i);
});
```

- [x] **Step 6: Run focused schema/service/security tests until GREEN**

Run: `node --test test/learningAnalyticsEvents.test.js test/securityRegression.test.js` from `backend`  
Expected: all tests pass and the RLS regression includes `LearningAnalyticsEvents`.

### Task 2: Idempotent Failure and Completion History

**Files:**
- Modify: `backend/src/routes/progress.js`
- Modify: `frontend/src/pages/game/GamePage.jsx`
- Modify: `backend/test/apiRoutes.integration.test.js`
- Modify: `backend/test/learningAnalyticsEvents.test.js`

**Interfaces:**
- Consumes: `normalizeActionId`, `findRecordedEvent`, `recordFailedAttempt`, `recordLevelCompleted`.
- Produces: required opaque `activityId` request fields for failed attempts and completion; atomic progress/event mutations.

- [x] **Step 1: Add failing request/idempotency tests**

```js
test("a failed attempt retry records one sanitized event and one academic failure", async () => {
  const body = { sourceCode: invalidSource, activityId: "attempt_action_123" };
  const first = await request(app).post(attemptPath).send(body);
  const retry = await request(app).post(attemptPath).send(body);
  assert.equal(first.body.attemptRecorded, true);
  assert.equal(retry.body.attemptRecorded, false);
  assert.equal(progress.attemptCount, 1);
  assert.equal(events.filter((event) => event.eventType === "solution_attempt_failed").length, 1);
});

test("first-submission success records one completion with attempt number one", async () => {
  await request(app).put(levelPath).send({
    progressPercent: 100, isCompleted: true, sourceCode: validSource,
    activityId: "completion_action_123",
  });
  assert.equal(events[0].eventType, "level_completed");
  assert.equal(events[0].attemptNumber, 1);
  assert.equal(events[0].score, 100);
});
```

- [x] **Step 2: Run the focused route tests and confirm RED**

Run: `node --test test/learningAnalyticsEvents.test.js test/apiRoutes.integration.test.js` from `backend`  
Expected: event assertions fail while existing validation/scoring assertions remain green.

- [x] **Step 3: Add stable frontend activity IDs**

Generate one opaque ID in `runLevelCheck()`, include it in the emitted outcome, pass it to `/attempt` or the completion PUT, and reuse it for that request promise. Do not send event type, score, failure fields, or other analytics values from React.

- [x] **Step 4: Make failed attempts atomic and retry-safe**

Within the existing row-lock transaction, build the dedupe key and check for a prior event before incrementing `attemptCount`. On first handling, update `latestFailure*` and append the event using the backend validation result. On retry, return the locked row with `attemptRecorded: false`.

- [x] **Step 5: Make first completion and its event atomic**

Resolve one membership/access context, lock the progress row, re-check completion, finalize confirmed time, compute the first score, save completion, and append `level_completed` with `attemptNumber = failedAttempts + 1`. Preserve the existing separate idempotent XP award afterward. Repeat/replay completion creates no event and changes no first result.

- [x] **Step 6: Test failed→successful order, privacy, replay, and duplicate requests**

Assert event order, occurrence times, attempt numbers, stored score, normalized failure fields, absence of source/compiler content, no replay event, and one completion event after retry.

- [x] **Step 7: Run the focused route/event tests until GREEN**

Run: `node --test test/learningAnalyticsEvents.test.js test/apiRoutes.integration.test.js` from `backend`  
Expected: all focused tests pass.

### Task 3: Start, Active-Time, and Hint History

**Files:**
- Modify: `backend/src/services/activeLevelTimerService.js`
- Modify: `backend/src/services/gamificationService.js`
- Modify: `backend/src/routes/progress.js`
- Modify: `frontend/src/pages/game/GamePage.jsx`
- Modify: `backend/test/levelTimingAndDeadline.test.js`
- Modify: `backend/test/hintSystem.test.js`
- Modify: `backend/test/learningAnalyticsEvents.test.js`

**Interfaces:**
- Consumes: `recordLevelStarted`, `recordActiveTime`, `recordHintUsed`; resolved classroom context; validated `syncId`.
- Produces: one first-start event, positive delta events, one basic hint event, and one purchased detailed hint event.

- [x] **Step 1: Add failing timer/start tests**

```js
test("timer history stores accepted deltas rather than cumulative totals", async () => {
  await startProgressSession(row, "session_one", began, context);
  await heartbeatProgressSession(row, "session_one", plus30, { ...context, syncId: "timer_sync_123" });
  assert.deepEqual(events.map((event) => [event.eventType, event.activeSeconds]), [
    ["level_started", null], ["active_time_recorded", 30],
  ]);
});

test("stale, zero, negative, and retried timer synchronizations add no duplicate event", async () => {
  const row = progressRow({
    activeSessionId: "session_one",
    lastHeartbeatAt: new Date("2026-09-21T00:00:00Z"),
  });
  await heartbeatProgressSession(row, "session_one", new Date("2026-09-21T00:01:00Z"), {
    ...context, syncId: "timer_sync_456",
  });
  assert.equal(row.timeSpentSeconds, 0);
  assert.equal(events.length, 0);
});
```

- [x] **Step 2: Add failing hint tests**

Extend the detailed-purchase test to assert one `hint_used` event with `hintType=detailed` and `hintPurchased=true` across retries. Add a basic-hint route/service test asserting the event exists only for the first persisted use.

- [x] **Step 3: Run timer and hint tests and confirm RED**

Run: `node --test test/levelTimingAndDeadline.test.js test/hintSystem.test.js test/learningAnalyticsEvents.test.js` from `backend`.

- [x] **Step 4: Persist start/time events with existing safeguards**

Add an optional trusted analytics context to timer functions. Persist each progress timer mutation and event in one transaction when context is present; keep pure/unit behavior compatible when it is absent. Create time events only when `addConfirmedTime()` returns a positive integer. Frontend heartbeat/end calls provide a stable per-request `syncId`; replacement and stale checks remain unchanged.

- [x] **Step 5: Persist hint events on state transitions**

Wrap first basic-hint mutation and event in a locked transaction. In `purchaseDetailedHint()`, append the detailed hint event before the existing transaction commits. Existing state flags and XP uniqueness provide a second idempotency barrier.

- [x] **Step 6: Verify classroom and replay semantics**

Test that event classroom ID equals the membership passed to the access check, multiple memberships do not cause fan-out events, completed replay start is ephemeral and records no start/time event, and the disabled-level access rejection records nothing.

- [x] **Step 7: Run timer/hint/event tests until GREEN**

Run: `node --test test/levelTimingAndDeadline.test.js test/hintSystem.test.js test/learningAnalyticsEvents.test.js` from `backend`.

### Task 4: Bounded Historical Aggregation and Authorization

**Files:**
- Create: `backend/src/services/learningAnalyticsHistoryService.js`
- Modify: `backend/src/services/teacherAnalyticsService.js`
- Modify: `backend/test/teacherAnalytics.test.js`
- Modify: `backend/test/learningAnalyticsEvents.test.js`

**Interfaces:**
- Consumes: authorized classroom/student IDs, `enabledLevelKeysByStudent`, selected lesson/date filters, `LearningAnalyticsEvent`.
- Produces: `buildHistoricalEventWhere({ classroomIds, studentIdsByLevel, filters })`, `selectHistoryBucket(filters, trackingSince)`, `getHistoricalLearningAnalytics(scope)`, and public `historical` payload.

- [x] **Step 1: Add failing aggregation/filter tests**

Cover actual failed/successful attempts, completions, first-attempt successes, active seconds, hint uses, failure categories, `occurredAt` date filtering, curriculum lesson filtering, classroom filtering, unauthorized classroom/student isolation, empty history, and tracking start.

```js
assert.deepEqual(payload.historical.series[0], {
  periodStart: "2026-09-21T00:00:00.000Z",
  attempts: 2,
  successfulAttempts: 1,
  failedAttempts: 1,
  completions: 1,
  activeSeconds: 30,
  hintUses: 1,
  firstAttemptSuccesses: 0,
});
assert.equal(payload.historical.failures[0].count, 1);
assert.equal(payload.failurePatterns.unresolved.signalCount, 1);
```

- [x] **Step 2: Run analytics tests and confirm RED**

Run: `node --test test/teacherAnalytics.test.js test/learningAnalyticsEvents.test.js` from `backend`  
Expected: `historical` and aggregate-query assertions fail.

- [x] **Step 3: Build current-eligibility event predicates**

Create at most 29 level clauses pairing each level with the scoped students for whom it is currently enabled. Combine these with authorized classroom IDs, authorized students, academic event types, `occurredAt`, and an optional curriculum lesson key. A disabled historical student-level pair must not enter the query.

- [x] **Step 4: Aggregate in PostgreSQL**

Use grouped Sequelize/PostgreSQL expressions for period counts and sums plus a grouped failure-category query and one bounded `MIN(occurredAt)` query. Daily buckets cover 7d, 30d, and custom ranges up to 93 days; longer custom and all-time ranges use month buckets. Return raw aggregates only, never event rows.

- [x] **Step 5: Integrate without weakening Phase 1/2**

Call the history service only after classroom, membership, student, lesson, and eligibility authorization is established. Add `historical` to normal and empty payloads. Keep existing current-state date logic and Current Failure Patterns unchanged; extend metadata to distinguish event-backed history.

- [x] **Step 6: Assert bounded queries and current behavior**

Count exactly three history queries regardless of students, lessons, levels, days, or categories. Re-run disabled-level, multi-classroom union, unauthorized filter, funnel, and latest-failure assertions unchanged.

- [x] **Step 7: Run analytics/event tests until GREEN**

Run: `node --test test/teacherAnalytics.test.js test/learningAnalyticsEvents.test.js` from `backend`.

### Task 5: Concise Learning Trends UI

**Files:**
- Modify: `frontend/src/pages/teacher/TeacherAnalyticsPage.jsx`
- Modify: `frontend/src/pages/teacher/TeacherAnalyticsPage.module.css`

**Interfaces:**
- Consumes: `historical.trackingSince`, `hasData`, `bucket`, `series`, `failures`, and `semantics`.
- Produces: accessible `LearningTrends` component with a single selected metric and CSS bars.

- [x] **Step 1: Add null-safe presentation helpers**

Define the five metric descriptors and format active seconds as a duration. Add the empty historical shape to `EMPTY_DATA`. Metric selection remains local UI state and does not trigger another request.

- [x] **Step 2: Render one compact trend visualization**

```jsx
<div className={pgStyles.trendMetricPicker} role="group" aria-label="Learning trend metric">
  {metrics.map((metric) => (
    <button type="button" aria-pressed={selectedMetric === metric.key}>
      {metric.label}
    </button>
  ))}
</div>
```

Each period row shows a date/month label, proportional CSS bar, and exact text value. Add accessible labels, keyboard focus styles, and a non-color value column.

- [x] **Step 3: Render tracking and empty states honestly**

When `hasData=false`, show “No historical activity has been recorded yet.” When data exists, show “Historical activity is available from [trackingSince] onward.” Do not render pre-tracking zero buckets. Label failure trends as actual recorded failure events and leave Current Failure Patterns intact.

- [x] **Step 4: Add responsive styling**

Keep metric controls wrapping, long period labels readable, bars usable at 320px width, and the card aligned with existing analytics typography. Add no dependency.

- [x] **Step 5: Run frontend verification**

Run from `frontend`:

```text
npm run lint
npm run build
npm test
```

Expected: all commands pass; the existing large-bundle advisory may remain but no new error/warning is introduced by this component.

### Task 6: Documentation, Migration Exercise, and Whole-System Verification

**Files:**
- Modify: `docs/TEACHER_ANALYTICS_AUDIT.md`
- Modify: `docs/superpowers/plans/2026-09-21-learning-analytics-event-history.md`

**Interfaces:**
- Consumes: final implementation and validation evidence.
- Produces: authoritative semantics, deployment instructions, retention note, and completed execution ledger.

- [x] **Step 1: Document final semantics**

Add the event schema/taxonomy, exact recording points, classroom context, replay exclusion, delta-time behavior, hint behavior, privacy field exclusions, action/sync idempotency, transaction boundaries, tracking-start/no-backfill limitation, current-state versus history distinction, PostgreSQL bucketing, and unlimited-current-retention recommendation.

- [x] **Step 2: Exercise the migration safely**

Create a disposable local PostgreSQL database, run the repository migration runner against it, inspect `LearningAnalyticsEvents` columns/checks/indexes/RLS, verify `UserProgresses` contains no Phase 3 mutation, run the registered migration a second time to confirm idempotence, and destroy only the explicitly named disposable database. If local credentials prevent this, run the SQL/model agreement tests and report the exact blocked command.

- [x] **Step 3: Run focused and full backend verification**

Run from `backend`:

```text
node --test test/learningAnalyticsEvents.test.js
node --test test/teacherAnalytics.test.js test/hintSystem.test.js test/levelTimingAndDeadline.test.js test/apiRoutes.integration.test.js test/securityRegression.test.js
npm test
```

- [x] **Step 4: Run frontend verification again after final edits**

Run `npm run lint`, `npm run build`, and `npm test` from `frontend`.

- [x] **Step 5: Perform security and performance diff audit**

Search changed event code for `sourceCode`, `stdout`, `stderr`, `latestFailureMetadata`, raw request objects, and JSON metadata writes; every match must be a test asserting absence or an unrelated validation input that never reaches events. Confirm no route accepts `eventType`. Confirm history reads use aggregates, authorized IDs, date predicates when selected, and no per-student/level/category query loop.

- [x] **Step 6: Perform final repository audit**

Run `git diff --check`, inspect `git status --short`, review the complete diff against the spec, and verify that only the intended migration was added. Mark completed plan steps with evidence. Do not commit or push.
