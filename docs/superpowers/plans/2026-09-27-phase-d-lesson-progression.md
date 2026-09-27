# Phase D Central Lesson Progression and Assessment Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the backend the authoritative source for PRE -> module/game -> POST lesson progression, preserve legacy progress consumers, and provide a safe teacher recovery action after a student exhausts a required passing POST.

**Architecture:** Add a batched `lessonProgressionService` that derives canonical state from existing classroom-scoped assessments/attempts and account-global game progress. Compose that state through `levelAccessService`, the existing progress summary, and Phase C assessment services; keep Phase B attempt grading, ordering, locking, idempotency, and official-grade selection authoritative. Extend the existing thin teacher router/service with one locked, append-only recovery-attempt action.

**Tech Stack:** Node.js, Express 5, Sequelize 6, PostgreSQL/Supabase schema already committed in Phase B, Node built-in test runner, existing SharpRunner HTTP test harnesses.

**Spec:** `docs/superpowers/specs/2026-09-27-phase-d-lesson-progression-design.md`

## Global Constraints

- Execute Tasks 1-8 sequentially. Do not modify shared route/service/test files concurrently.
- Every feature task follows RED -> minimal implementation -> focused GREEN before the next task starts.
- Do not add or modify database models or migrations. Stop for review if the existing schema cannot support the approved contract.
- Do not modify frontend, built-in module bundles, game/map UI, XP policy, hints, progression persistence, or teacher analytics.
- Phase B remains authoritative for score calculation, PRE/POST rules, attempt ordering, official POST selection, learning gain, assessment locks, attempt concurrency, grading, and submission idempotency.
- Phase C remains authoritative for exact-class authorization, student/teacher serializer separation, answer-review policy, attempted-assessment immutability, and teacher mutation lock order.
- Only published assessments gate students. Absent, draft, and unpublished assessments behave as absent.
- Tutorial is assessment-exempt. Arrays, Functions, and Functions with Arrays use canonical assessment gates. Final unlocks from Functions with Arrays canonical completion but remains game-completed in Phase D.
- Functions completion uses its 11 playable route keys. `functions-level-12` remains a legacy progress row and never becomes a playable requirement.
- Canonical curriculum order owns cross-lesson prerequisites. Teacher `displayOrder` creates predecessor edges only among enabled playable levels within the target lesson.
- Existing completed levels remain replayable. Replay cannot change completion, duplicate first-completion rewards, satisfy a late PRE, unlock incomplete later levels, or bypass canonical prerequisite-lesson completion.
- Keep legacy `lesson.isCompleted`, `summary.completedLessons`, game progress percentages, and current-level fields; add explicit canonical fields without renaming/removing old ones.
- The recovery action creates one additional active POST attempt without changing `maxAttempts`; all prior attempts/results remain append-only.
- Do not commit or push until the user separately authorizes integration.

## File Structure

### Add

- `backend/src/constants/lessonProgressionConfig.js` - canonical lesson order/scope, next actions, and safe denial reasons.
- `backend/src/services/lessonProgressionService.js` - pure state reducer, batched data loader, exact-class state reads, and assessment-stage policy.
- `backend/test/lessonProgressionService.test.js` - pure state, batching, query-bound, scope, Functions, final/tutorial, and transfer-student tests.
- `backend/test/lessonProgressionRoutes.integration.test.js` - progress payload, game gates, replay, cycle prevention, assessment stages, and concurrency contracts.

### Modify

- `backend/src/services/progressService.js` - optional canonical progression overlay and compatibility counts.
- `backend/src/routes/progress.js` - load one state map per `/me` request and reuse it for all level rows.
- `backend/src/services/levelAccessService.js` - canonical prerequisite/PRE gates and within-lesson previous-level sequencing.
- `backend/src/services/assessmentReadService.js` - progression-aware discovery and player graph reads.
- `backend/src/services/assessmentAttemptService.js` - progression guards on active interactions and teacher-created recovery attempts.
- `backend/src/services/assessmentSerializationService.js` - safe discovery unlock fields and teacher recovery response.
- `backend/src/services/assessmentErrorService.js` - progression and recovery conflict mapping.
- `backend/src/services/teacherAssessmentService.js` - authorized transactional recovery orchestration.
- `backend/src/routes/teacherAssessments.js` - thin additional-attempt action.
- `backend/test/levelTimingAndDeadline.test.js` - access precedence, within-lesson sequencing, and interleaving regression.
- `backend/test/assessmentAttemptService.test.js` - stage-guard and recovery-domain unit/concurrency tests.
- `backend/test/assessmentRoutes.integration.test.js` - discovery/player/active interaction stage gates.
- `backend/test/teacherAssessmentRoutes.integration.test.js` - teacher recovery HTTP, authorization, lock, rollback, and safety tests.
- `backend/test/apiRoutes.integration.test.js` - progress compatibility and game endpoint regressions.
- `backend/test/securityRegression.test.js` - cross-class, former-member, direct-route, serializer, and replay security regressions.
- `backend/test/runTests.js` - register the two new Phase D suites.

No change is expected in `backend/src/routes/lessonContent.js`, `backend/src/models/**`, `supabase/migrations/**`, or `frontend/**`.

## Review Focus

- A completed-level replay after late PRE publication stays replayable but neither changes completion/rewards nor opens any new incomplete progression; Task 4 pins all five replay invariants.
- Concurrent teacher recovery, repeated recovery, and ordinary student start must use the assessment row as the common lock root and leave at most one active attempt; Task 7 pins each interleaving.
- A transfer student's account-global game rows may carry forward, but only assessments and attempts from the exact selected classroom affect gates; Task 2 pins both halves.
- Functions is complete with all 11 playable keys even when `functions-level-12` is incomplete, and incomplete with only 10 playable keys even if row 12 is complete; Task 1 pins both directions.
- Discovery, progression, and teacher recovery responses must never expose question graphs, correct IDs, explanations, response grading, numeric hidden scores, ordering internals, or submission keys; Tasks 3, 5, and 7 pin the relevant allowlists.

---

### Task 1: Canonical Progression Configuration and Pure State Reducer

**Files:**

- Create: `backend/src/constants/lessonProgressionConfig.js`
- Create: `backend/src/services/lessonProgressionService.js`
- Create: `backend/test/lessonProgressionService.test.js`

**Interfaces:**

- Consumes: `PLAYABLE_LEVEL_KEYS`, published assessment-like objects, attempt-like objects, `UserProgress`-like rows, classroom level settings, and `assessmentPolicyService.selectOfficialPostAttempt`.
- Produces: `CANONICAL_LESSON_ORDER`, `ASSESSMENT_GATED_LESSON_KEYS`, `LESSON_NEXT_ACTIONS`, `PROGRESSION_DENIAL_REASONS`, `buildLessonProgressionStates({ publishedAssessments, attempts, progressRows, levelSettings })`, and `evaluateAssessmentInteraction({ assessment, state })`.
- `buildLessonProgressionStates` returns a `Map<string, LessonProgressionState>` containing every field and exact meaning in spec Sections 5-6.

- [ ] **Step 1: Write failing pure-state tests**

Add named tests proving:

```js
test("absent draft and unpublished assessments do not gate legacy progression", () => {});
test("required PRE is satisfied only by a submitted diagnostic attempt", () => {});
test("required passing POST distinguishes submitted failed passed and exhausted states", () => {});
test("passing-not-required POST is satisfied by any submitted attempt", () => {});
test("teacher-created active recovery reports zero remaining and RESUME_POST", () => {});
test("official POST pass uses the Phase B highest-attempt selector", () => {});
test("Functions completion uses 11 playable keys and ignores progress row 12", () => {});
test("tutorial and final remain assessment-exempt with approved completion semantics", () => {});
test("all disabled playable keys form an intentionally complete empty game requirement", () => {});
```

Minimum assertions include:

- required PRE without `SUBMITTED` -> `preCompleted: false`, `moduleUnlocked: false`, `gameUnlocked: false`, `nextAction: TAKE_PRE` or `RESUME_PRE`;
- failed POST with attempts left -> `postCompleted: true`, `postPassed: false`, `lessonCompleted: false`, `nextAction: RETRY_POST`;
- active attempt after ordinary exhaustion -> `postAttemptsRemaining: 0`, `postAttemptInProgress: true`, `postAttemptsExhausted: false`, `nextAction: RESUME_POST`;
- 11 completed playable Functions rows plus incomplete row 12 -> `gameCompleted: true`;
- 10 completed playable Functions rows plus completed row 12 -> `gameCompleted: false`;
- final assessment rows do not change final's Phase D IDs, requirements, or completion.

- [ ] **Step 2: Run the new unit suite and confirm RED**

Run from `backend`:

```text
node --test test/lessonProgressionService.test.js
```

Expected: FAIL because the new constants/service and reducer do not exist.

- [ ] **Step 3: Add the progression constants**

Create `lessonProgressionConfig.js` with exact exported constants:

```js
CANONICAL_LESSON_ORDER
ASSESSMENT_GATED_LESSON_KEYS
LESSON_NEXT_ACTIONS
PROGRESSION_DENIAL_REASONS
```

Use canonical order `tutorial`, `arrays`, `functions`, `functions-with-arrays`, `final`. The gated set contains only the three approved academic lessons.

- [ ] **Step 4: Implement the pure reducer and assessment decision**

Add to `lessonProgressionService.js`:

```js
buildLessonProgressionStates({
  publishedAssessments,
  attempts,
  progressRows,
  levelSettings,
})

evaluateAssessmentInteraction({ assessment, state })
```

Filter student gating to `isPublished === true`; derive game requirements from enabled `PLAYABLE_LEVEL_KEYS`; calculate lessons in canonical order; use the Phase B official selector; never copy score/percentage/question/answer fields into returned state.

- [ ] **Step 5: Run the pure-state suite until GREEN**

Run:

```text
node --test test/lessonProgressionService.test.js
```

Expected: all Task 1 tests pass with zero failures.

---

### Task 2: Exact-Class Batched State Loading and Bounded Queries

**Files:**

- Modify: `backend/src/services/lessonProgressionService.js`
- Modify: `backend/test/lessonProgressionService.test.js`

**Interfaces:**

- Consumes: Task 1 reducer, existing models, `assessmentAuthorizationService.requireActiveStudentMembership`, and `getClassroomLevelSettings`.
- Produces: `createLessonProgressionService(dependencies?)`, `getLessonProgressionStates(input)`, `getLessonProgressionState(input)`, and `assertAssessmentInteractionAllowed(input)` on the default/factory service.

Exact signatures:

```js
getLessonProgressionStates({
  classroomId,
  studentId,
  authorizedMembership = null,
  progressRows = null,
  levelSettings = null,
  transaction = null,
})

getLessonProgressionState({
  classroomId,
  studentId,
  lessonKey,
  authorizedMembership = null,
  progressRows = null,
  levelSettings = null,
  transaction = null,
})

assertAssessmentInteractionAllowed({
  assessment,
  studentId,
  authorizedMembership = null,
  transaction = null,
})
```

- [ ] **Step 1: Add failing authorization and query-bound tests**

Add model-spy tests proving:

- exact active membership is required when no authorized membership is supplied;
- a supplied membership is accepted only when classroom, student, and active status match;
- the full map performs one published-assessment query and at most one attempt query;
- no attempt query occurs when no published assessment IDs exist;
- preloaded progress/settings prevent duplicate reads;
- a one-lesson lookup loads its canonical prefix with one set query per category, not recursively;
- attempts are constrained by exact `classroomId`, `studentId`, and returned assessment IDs;
- question/choice/response associations and answer columns are never requested;
- a transfer student's account-global completed game rows are retained, while a different classroom's assessment/attempt rows are ignored.

- [ ] **Step 2: Run the service suite and confirm RED**

Run:

```text
node --test test/lessonProgressionService.test.js
```

Expected: new loader/factory/query assertions fail.

- [ ] **Step 3: Implement the service factory and batched I/O**

Implement `createLessonProgressionService` with injectable `models`, `authorizationService`, and level-settings loader. Select only assessment policy columns and attempt identity/status/result columns needed for state; do not include questions, choices, or responses.

`getLessonProgressionState` must set-query the target's canonical prefix. `assertAssessmentInteractionAllowed` loads that state, applies Task 1's decision, and throws a safe progression error containing only `code`, `message`, `lessonKey`, optional assessment/prerequisite ID, and `nextAction`.

- [ ] **Step 4: Run the service suite until GREEN**

Run:

```text
node --test test/lessonProgressionService.test.js
```

Expected: all Task 1-2 service tests pass and query spies show bounded reads.

---

### Task 3: Progress Summary Compatibility and `/api/progress/me`

**Files:**

- Modify: `backend/src/services/progressService.js`
- Modify: `backend/src/routes/progress.js`
- Create: `backend/test/lessonProgressionRoutes.integration.test.js`
- Modify: `backend/test/apiRoutes.integration.test.js`

**Interfaces:**

- Consumes: Task 2 `getLessonProgressionStates` and existing `buildProgressSummary` inputs.
- Produces: extended `buildProgressSummary(rows, { classRank, classSize, xpTotal, lessonProgressionByKey })` and enriched `/api/progress/me` response.
- Existing callers that omit `lessonProgressionByKey` retain their current payload.

- [ ] **Step 1: Add failing summary compatibility tests**

Add tests proving:

```js
test("game-complete required-POST-pending lesson preserves isCompleted but is not lessonCompleted", () => {});
test("summary exposes separate game assessment and canonical completion counts", () => {});
test("legacy summary call without progression state remains byte-shape compatible", () => {});
test("progress me reports selected classroom and canonical lesson states without score leaks", () => {});
test("progress me batches one state map instead of querying assessments per level", () => {});
```

Assert the intentional compatibility case:

```js
assert.equal(arrays.isCompleted, true);
assert.equal(arrays.gameCompleted, true);
assert.equal(arrays.assessmentCompleted, false);
assert.equal(arrays.lessonCompleted, false);
```

Also assert no `percentage`, `pointsEarned`, `correctChoiceId`, `isCorrect`, `explanation`, `questions`, or `choices` key exists anywhere in the canonical state envelope.

- [ ] **Step 2: Run progress-focused tests and confirm RED**

Run:

```text
node --test test/lessonProgressionRoutes.integration.test.js test/apiRoutes.integration.test.js
```

Expected: FAIL because canonical summary fields/classroom state are not wired.

- [ ] **Step 3: Extend `buildProgressSummary` additively**

Accept `lessonProgressionByKey` as an optional argument. Preserve `isCompleted`, `progressPercent`, `completedLessons`, `completedLevels`, `totalLevelsCleared`, and current-level fields. Add per-lesson canonical fields and summary `gameCompletedLessons`, `assessmentCompletedLessons`, `lessonCompletedLessons`, `nextAction`, and `nextActionLessonKey`.

- [ ] **Step 4: Batch progression state in `buildProgressPayloadForUser`**

After selecting the exact primary membership and loading progress/settings, call `getLessonProgressionStates` once with those preloaded values. Add top-level `classroomId`; pass the map to `buildProgressSummary`; retain the map for Task 4 level access so no per-level state query is introduced.

- [ ] **Step 5: Run summary and route tests until GREEN**

Run:

```text
node --test test/lessonProgressionService.test.js test/lessonProgressionRoutes.integration.test.js test/apiRoutes.integration.test.js
```

Expected: all Task 1-3 tests pass; legacy notification-style calls remain unchanged.

---

### Task 4: Canonical Game Access, Cycle Prevention, and Replay Invariants

**Files:**

- Modify: `backend/src/services/levelAccessService.js`
- Modify: `backend/src/routes/progress.js`
- Modify: `backend/test/levelTimingAndDeadline.test.js`
- Modify: `backend/test/lessonProgressionRoutes.integration.test.js`
- Modify: `backend/test/apiRoutes.integration.test.js`
- Modify: `backend/test/securityRegression.test.js`

**Interfaces:**

- Consumes: Task 2 state lookup and Task 3 preloaded state map.
- Produces: progression-aware `evaluateStudentLevelAccess(input)`, `getStudentLevelAccess(input)`, and `restrictionPayload(access)` while preserving all existing access fields.
- Add optional preloaded inputs to `getStudentLevelAccess`: `lessonProgressionState`, `levelSettings`, and `progressRows`.

- [ ] **Step 1: Add failing access-policy tests**

In `levelTimingAndDeadline.test.js`, add named cases for:

- required PRE blocks first and later incomplete levels;
- submitted PRE permits existing sequencing to decide;
- prior canonical lesson incomplete blocks entry with `LESSON_PREREQUISITE_REQUIRED`;
- teacher `displayOrder` selects the previous enabled level only inside the target lesson;
- cross-lesson interleaving cannot create a cycle;
- completed level replay wins before new PRE/prerequisite gates;
- disabled, scheduled, deadline, extension, and completion precedence remain unchanged;
- tutorial has no assessment gate and final has only the prior-lesson gate.

- [ ] **Step 2: Add failing HTTP replay regressions**

In route/security suites, create a completed Arrays level, then publish a required PRE with no submitted attempt. Prove:

1. replay/start remains allowed and the persisted completion fields do not change;
2. replay completion returns no new `xpAward` and does not change user XP or `xpAwarded` fields;
3. no PRE attempt is created or marked submitted;
4. an incomplete later Arrays level returns `PRE_ASSESSMENT_REQUIRED`;
5. new/incomplete progression in a later lesson still returns `LESSON_PREREQUISITE_REQUIRED` when the previous canonical lesson is incomplete.

- [ ] **Step 3: Run focused access tests and confirm RED**

Run:

```text
node --test test/levelTimingAndDeadline.test.js test/lessonProgressionRoutes.integration.test.js test/apiRoutes.integration.test.js test/securityRegression.test.js
```

Expected: new PRE/prerequisite/cycle/replay assertions fail.

- [ ] **Step 4: Compose progression into `levelAccessService`**

Apply exact precedence:

```text
COMPLETED
LEVEL_DISABLED
LESSON_PREREQUISITE_REQUIRED
PRE_ASSESSMENT_REQUIRED
same-lesson previous enabled playable level
LEVEL_SCHEDULED
DEADLINE_PASSED
allowed
```

Filter predecessor candidates by the target state's `lessonKey` before applying teacher `displayOrder`. `getStudentLevelAccess` loads one target/prefix state only when the caller has not supplied it. Add safe restriction payloads without assessment scores/settings.

- [ ] **Step 5: Reuse the state map across `/api/progress/me` level rows**

Pass each level's lesson state into `evaluateStudentLevelAccess`. Do not add model queries inside the level-mapping loop. Leave existing level start/heartbeat/end/attempt/hint/completion/content handlers calling the same `getStudentLevelAccess` boundary.

- [ ] **Step 6: Run all access/replay tests until GREEN**

Run:

```text
node --test test/lessonProgressionService.test.js test/levelTimingAndDeadline.test.js test/lessonProgressionRoutes.integration.test.js test/apiRoutes.integration.test.js test/securityRegression.test.js
```

Expected: all access, interleaving, Functions, and replay regressions pass with unchanged first-completion reward behavior.

---

### Task 5: Assessment Discovery, Player Graph, and Attempt-Start Gates

**Files:**

- Modify: `backend/src/services/assessmentReadService.js`
- Modify: `backend/src/services/assessmentAttemptService.js`
- Modify: `backend/src/services/assessmentSerializationService.js`
- Modify: `backend/src/services/assessmentErrorService.js`
- Modify: `backend/test/assessmentAttemptService.test.js`
- Modify: `backend/test/assessmentSerialization.test.js`
- Modify: `backend/test/assessmentRoutes.integration.test.js`
- Modify: `backend/test/securityRegression.test.js`

**Interfaces:**

- Consumes: Task 2 `getLessonProgressionState`/`assertAssessmentInteractionAllowed` and existing Phase C read/attempt factories.
- Produces: discovery `status.unlocked`/`status.lockReason`, safe stage-denial translation, and guarded player graph/start behavior.
- Add injectable `progressionService` to `createAssessmentReadService` and `createAssessmentAttemptService`. Existing isolated Phase B tests inject an explicit allow-all guard unless the test exercises Phase D.

- [ ] **Step 1: Add failing discovery and serializer tests**

Prove:

- published POST before game completion remains `available: true` but has `unlocked: false`, `lockReason: GAME_INCOMPLETE`;
- published required PRE before its canonical prerequisite has `LESSON_PREREQUISITE_REQUIRED`;
- unlocked status is true only at the approved stage;
- unavailable/draft assessment remains unavailable rather than becoming a progression resource;
- discovery remains graph-free and contains none of the forbidden answer/result keys;
- hidden-score POST may expose boolean `postPassed` through progression state but no numeric result fields.

- [ ] **Step 2: Add failing player/start gate tests**

Add unit and HTTP cases proving direct `GET /api/assessments/:id` and `POST /:id/attempts` cannot bypass POST-before-game or PRE-before-prerequisite gates, and create no attempt on denial. Prove tutorial/final standalone assessment behavior remains Phase C-compatible.

- [ ] **Step 3: Run assessment read/start tests and confirm RED**

Run:

```text
node --test test/assessmentSerialization.test.js test/assessmentAttemptService.test.js test/assessmentRoutes.integration.test.js test/securityRegression.test.js
```

Expected: new unlock/status/player/start assertions fail.

- [ ] **Step 4: Extend discovery serialization and error mapping**

`serializeDiscoveryStatus` allowlists only `unlocked` and `lockReason` in addition to existing status. Extend `assessmentErrorService` to translate safe progression errors while retaining Phase B/C mappings and generic 500 behavior. Extend `AssessmentApiError` details only for `lessonKey`, `assessmentId`, `prerequisiteLessonKey`, and `nextAction`; add a test proving arbitrary error details are still discarded.

- [ ] **Step 5: Gate discovery, player graph, and start/resume**

- `discoverAssessment` loads canonical state after exact membership and passes the decision to the serializer.
- `getPlayerAssessment` calls `assertAssessmentInteractionAllowed` after publication and exact membership but before returning the graph.
- `startOrResumeAttempt` retains the assessment row lock root, exact membership, and Phase B ordering; call the injected progression guard before reading/creating the active attempt.

Do not move grading, max-attempt, active-attempt, or ordering logic out of `assessmentAttemptService`.

- [ ] **Step 6: Run read/start suites until GREEN**

Run:

```text
node --test test/lessonProgressionService.test.js test/assessmentSerialization.test.js test/assessmentAttemptService.test.js test/assessmentRoutes.integration.test.js test/securityRegression.test.js
```

Expected: all discovery/player/start gates pass and student payload leak assertions remain green.

---

### Task 6: Active Assessment Interaction Gates and Commit Races

**Files:**

- Modify: `backend/src/services/assessmentAttemptService.js`
- Modify: `backend/test/assessmentAttemptService.test.js`
- Modify: `backend/test/assessmentRoutes.integration.test.js`
- Modify: `backend/test/lessonProgressionRoutes.integration.test.js`
- Modify: `backend/test/securityRegression.test.js`

**Interfaces:**

- Consumes: Task 5 injected progression guard and existing attempt transactions.
- Produces: stage-guarded `getActiveAttempt`, `saveResponse`, and `submitAttempt` without changing their request/response or grading/idempotency contracts.

- [ ] **Step 1: Add failing active-attempt gate tests**

Cover an old/existing active POST created before its game gate is satisfied. Assert active retrieval, response save, and first submission all return `POST_ASSESSMENT_LOCKED`; no response/result row mutates. After committed game completion, the same operations use the normal pipeline.

Add a PRE equivalent where the canonical prerequisite is incomplete.

- [ ] **Step 2: Add failing commit-race and idempotency tests**

Prove:

- PRE submission versus immediate Level 1 start is denied before commit and allowed after commit;
- final required game completion versus immediate POST discovery/start is denied before commit and allowed after commit;
- a repeated already-submitted request with the same `Idempotency-Key` preserves Phase B recovery behavior;
- a former member still cannot retrieve the resulting submitted result/review even though the attempt is owned.

- [ ] **Step 3: Run active/race tests and confirm RED**

Run:

```text
node --test test/assessmentAttemptService.test.js test/assessmentRoutes.integration.test.js test/lessonProgressionRoutes.integration.test.js test/securityRegression.test.js
```

Expected: active attempts can still bypass the stage or race assertions fail.

- [ ] **Step 4: Add the shared guard to active interactions**

After attempt ownership, assessment publication/version, and exact membership checks, call `assertAssessmentInteractionAllowed` in `getActiveAttempt`, `saveResponse`, and first-time `submitAttempt`. Preserve the existing early same-key return for an already-submitted attempt and the route's subsequent exact-membership result read.

- [ ] **Step 5: Run active/race suites until GREEN**

Run:

```text
node --test test/lessonProgressionService.test.js test/assessmentAttemptService.test.js test/assessmentRoutes.integration.test.js test/lessonProgressionRoutes.integration.test.js test/securityRegression.test.js
```

Expected: active interactions cannot bypass progression, committed-state handoffs are deterministic, and Phase B idempotency remains green.

---

### Task 7: Teacher-Granted Additional POST Attempt

**Files:**

- Modify: `backend/src/services/assessmentAttemptService.js`
- Modify: `backend/src/services/teacherAssessmentService.js`
- Modify: `backend/src/routes/teacherAssessments.js`
- Modify: `backend/src/services/assessmentSerializationService.js`
- Modify: `backend/src/services/assessmentErrorService.js`
- Modify: `backend/test/assessmentAttemptService.test.js`
- Modify: `backend/test/assessmentSerialization.test.js`
- Modify: `backend/test/teacherAssessmentRoutes.integration.test.js`
- Modify: `backend/test/assessmentRoutes.integration.test.js`
- Modify: `backend/test/lessonProgressionService.test.js`

**Interfaces:**

- Consumes: existing teacher authorization, Sequelize transaction injection, Phase B assessment graph/order helpers, `selectOfficialPostAttempt`, exact membership, and Task 1 recovery state.
- Produces:

```js
assessmentAttemptService.createTeacherGrantedPostAttempt({
  classroomId,
  assessmentId,
  studentId,
  transaction,
})

teacherAssessmentService.grantAdditionalPostAttempt({
  classroomId,
  assessmentId,
  studentId,
  actorId,
  actorRole,
})

assessmentSerializationService.serializeTeacherGrantedAttempt(attempt)
```

- Adds `POST /api/teacher/classrooms/:classroomId/assessments/:assessmentId/students/:studentId/additional-attempt`, no body/query, HTTP 201 on creation.

- [ ] **Step 1: Add failing attempt-domain eligibility tests**

In `assessmentAttemptService.test.js`, prove the new function:

- requires a caller transaction;
- locks the exact assessment before any attempt query;
- accepts only published POST with `requirePassingForCompletion: true`;
- requires exact active classroom membership;
- requires submitted attempts `>= maxAttempts`;
- rejects when the official POST passed;
- rejects when any active attempt exists;
- preserves all prior attempt objects and `maxAttempts`;
- creates attempt number `max(existing attemptNumber) + 1` with current assessment version, `IN_PROGRESS`, timestamp, and the normal shuffled orders;
- performs one locked attempt-set read rather than per-attempt reads;
- rolls back cleanly when creation fails.

- [ ] **Step 2: Add failing teacher route and serializer tests**

Cover:

- unauthenticated/student/wrong-teacher/wrong-class/wrong-assessment/inactive-student denial;
- malformed IDs, nonempty body, or query -> 400 `INVALID_REQUEST`;
- PRE, unpublished POST, and passing-not-required POST -> 409 `POST_RECOVERY_NOT_ALLOWED`;
- attempts remaining -> 409 `POST_ATTEMPTS_NOT_EXHAUSTED`;
- official pass -> 409 `POST_ALREADY_PASSED`;
- active attempt -> 409 `ACTIVE_ATTEMPT_EXISTS`;
- success -> HTTP 201 with only `id`, `assessmentId`, `classroomId`, `studentId`, `attemptNumber`, `status`, `assessmentVersion`, `startedAt`;
- response recursively excludes question/choice order, responses, score fields, submission key, questions, choices, correct IDs, and explanations.

- [ ] **Step 3: Add failing recovery concurrency and pipeline tests**

Use the existing shared-lock test harness to prove:

- two concurrent recovery actions create exactly one active attempt and the loser receives active-attempt conflict;
- recovery versus ordinary student start uses the same assessment lock and creates at most one active attempt;
- no teacher recovery code queries/counts attempts before the assessment lock event;
- the student can resume the teacher-created attempt through normal start/active GET, save a response, and submit with `Idempotency-Key`;
- a failed recovery result returns progression to `POST_RECOVERY_REQUIRED` and another explicit later teacher action can create only one next attempt;
- a passing recovery result participates in normal highest-official selection and completes the lesson condition;
- `postAttemptsRemaining: 0` while active and no `maxAttempts` mutation.
- `AFTER_FINAL_ATTEMPT` review becomes unavailable while the recovery attempt is active and is recalculated after submission under the existing exhaustion rule.

- [ ] **Step 4: Run recovery-focused tests and confirm RED**

Run:

```text
node --test test/assessmentAttemptService.test.js test/assessmentSerialization.test.js test/teacherAssessmentRoutes.integration.test.js test/assessmentRoutes.integration.test.js test/lessonProgressionService.test.js
```

Expected: recovery functions/route/codes do not exist.

- [ ] **Step 5: Implement locked attempt-domain creation**

Add `createTeacherGrantedPostAttempt` inside the existing attempt-service factory. The supplied transaction is mandatory. Lock/load the assessment graph first, verify `classroomId`, validate publication/POST/passing policy, require membership, then lock/read all exact student-assessment attempts once. Reuse `buildOrder`, clock/random injection, normal field snapshots, and `selectOfficialPostAttempt`.

Do not update `maxAttempts`, prior attempts, scores, assessment version, or assessment settings.

- [ ] **Step 6: Implement teacher orchestration and thin route**

- Inject the attempt service into `createTeacherAssessmentService`.
- `grantAdditionalPostAttempt` opens one transaction, authorizes the exact managed classroom inside it, delegates the locked domain operation, and serializes its result.
- Add the no-body route using existing role middleware and positive-ID parser.
- Add exact recovery codes to `assessmentErrorService`; translate the active-attempt unique constraint to `ACTIVE_ATTEMPT_EXISTS` before the generic duplicate-assessment mapping.

- [ ] **Step 7: Implement the teacher recovery allowlist**

Add `serializeTeacherGrantedAttempt(attempt)` with only the eight approved fields. Do not reuse the student player serializer and do not return the graph/order needed internally by the student attempt pipeline.

- [ ] **Step 8: Run recovery and dependent suites until GREEN**

Run:

```text
node --test test/lessonProgressionService.test.js test/assessmentAttemptService.test.js test/assessmentSerialization.test.js test/teacherAssessmentRoutes.integration.test.js test/assessmentRoutes.integration.test.js test/securityRegression.test.js
```

Expected: authorization, eligibility, lock order, concurrency, append-only history, response safety, and normal student submission all pass.

---

### Task 8: Full Contract Registration, Security Audit, and Verification

**Files:**

- Modify: `backend/test/runTests.js`
- Modify only if an uncovered contract needs a regression: `backend/test/securityRegression.test.js`
- Verify all Phase D production/test files listed above.

**Interfaces:**

- Consumes: completed Tasks 1-7.
- Produces: registered full-suite coverage and an evidence-based Phase D verification report. No new product behavior belongs in this task; failures return to the owning earlier task and repeat its RED/GREEN cycle.

- [ ] **Step 1: Register both new Phase D suites**

Require, in deterministic order:

```js
require("./lessonProgressionService.test");
require("./lessonProgressionRoutes.integration.test");
```

- [ ] **Step 2: Run the complete focused Phase D verification**

Run from `backend`:

```text
node --test test/lessonProgressionService.test.js test/lessonProgressionRoutes.integration.test.js test/levelTimingAndDeadline.test.js test/apiRoutes.integration.test.js test/assessmentPolicyService.test.js test/assessmentAttemptService.test.js test/assessmentSerialization.test.js test/assessmentRoutes.integration.test.js test/teacherAssessmentRoutes.integration.test.js test/securityRegression.test.js
```

Expected: all tests pass, zero failures/cancellations/skips unless a pre-existing suite explicitly marks a skip.

- [ ] **Step 3: Run the complete backend suite**

Run from repository root:

```text
npm --prefix backend test
```

Expected: compiler-host build succeeds and the entire backend test suite reports zero failures. Record the exact total test count from fresh output.

- [ ] **Step 4: Run targeted source/security audits**

Run read-only searches confirming:

- no progression source duplicates score calculation or numeric passing-threshold comparison;
- no `questions`, `choices`, `isCorrect`, `correctChoiceId`, `explanation`, or `submissionKey` is included by progression/recovery serializers;
- no assessment model query was added directly to `progress.js`;
- teacher recovery attempts are queried only after the assessment-lock call in the domain function;
- `functions-level-12` is absent from playable requirements;
- no frontend, model, or migration path changed.

If an audit fails, add a focused regression to the owning task, confirm RED, make the smallest fix, and rerun that task's GREEN command before repeating this task.

- [ ] **Step 5: Run whitespace and scope verification**

Run from repository root:

```text
git diff --check
git status --short
git diff --name-only
git ls-files --others --exclude-standard
```

Because `git diff --check` does not inspect untracked files, also scan every untracked Phase D source/test/doc for trailing whitespace before reporting success. Confirm the changed-path audit contains no `frontend/**`, `backend/src/models/**`, `supabase/migrations/**`, build output, dependency/cache files, or Phase E/F/G work.

- [ ] **Step 6: Return the verification report and stop**

Report:

- starting and ending HEAD/status;
- exact files added/modified;
- canonical state and compatibility behavior;
- PRE/prerequisite/game/POST enforcement;
- Functions 11-key result;
- replay/reward invariants;
- assessment interaction/idempotency behavior;
- teacher recovery authorization, lock, concurrency, append-only, and result behavior;
- query-bound evidence;
- exact focused/full-suite counts and any warnings;
- `git diff --check` and final `git status --short`;
- explicit confirmation of no frontend, migration, model, Phase E/F/G, commit, or push.

Do not commit or push. Stop for independent repository review.
