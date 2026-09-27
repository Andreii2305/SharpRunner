# Phase C Secure Assessment APIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the committed Phase B assessment domain through secure student and teacher HTTP APIs with exact-classroom authorization, server-authoritative grading, idempotent submission, immutable attempted assessments, and policy-safe response serialization.

**Architecture:** Mount separate thin student and teacher routers over focused authorization, read, serialization, error, attempt, and teacher-management services. Keep Phase B policy and attempt services authoritative for grading and attempt concurrency, use explicit student and teacher allowlist serializers, and contain every teacher graph mutation in a locked Sequelize transaction.

**Tech Stack:** Node.js, Express 5, Sequelize 6, PostgreSQL/Supabase schema already committed in Phase B, Node built-in test runner, JSON HTTP APIs.

**Spec:** `docs/superpowers/specs/2026-09-25-phase-c-assessment-apis-design.md`

## Global Constraints

- Do not add or modify database models or migrations; stop for review if the Phase B schema cannot support an approved contract.
- PRE remains diagnostic with one attempt, `FIRST`, no passing threshold, no pass/fail result, and default answer review `NEVER`.
- POST defaults to a 75% passing threshold, three attempts, `HIGHEST`, and first-POST-minus-PRE learning gain in percentage points.
- `AFTER_FINAL_ATTEMPT` means exhaustion: review is available only when `submittedAttempts >= maxAttempts` and no active attempt exists.
- Discovery emits assessment state only: use `hasSubmittedAttempt` and PRE-only `diagnosticCompleted`; never emit or define `lessonCompleted`.
- A hidden-score POST result retains `passed` and omits `pointsEarned`, `maxPoints`, `percentage`, `officialGrade`, `firstPost`, `prePercentage`, and `learningGain` as absent keys.
- Student and teacher serializers remain separate allowlists; no student response may be derived by deleting fields from a teacher payload.
- Require active membership in the exact classroom persisted on the requested assessment or attempt.
- Treat every assessment setting and graph field as immutable after the first attempt; allow unpublish/delete only with zero attempts.
- For teacher save/publish/unpublish/delete mutations, acquire the assessment row lock before any assessment-attempt query or count. The assessment row is the common lock root shared with Phase B attempt creation.
- Use only the `Idempotency-Key` request header for submission and forward it as Phase B `submissionKey`.
- Do not activate PRE, lesson, module, or game progression gates; do not change frontend, XP, hint, map, or game code.
- Do not commit or push until the user separately authorizes integration.

## File Structure

### Add

- `backend/src/routes/assessments.js` — student route parsing, role middleware, service calls, and response status selection.
- `backend/src/routes/teacherAssessments.js` — teacher/admin route parsing, role middleware, service calls, and response status selection.
- `backend/src/services/assessmentAuthorizationService.js` — exact classroom membership and teacher/admin classroom scope checks.
- `backend/src/services/assessmentReadService.js` — discovery, safe graph/attempt reads, result composition, and review eligibility.
- `backend/src/services/assessmentSerializationService.js` — independent student and teacher allowlist serializers.
- `backend/src/services/assessmentErrorService.js` — stable API errors and centralized translation to safe HTTP responses.
- `backend/src/services/teacherAssessmentService.js` — teacher CRUD, publication lifecycle, warnings, and raw results.
- `backend/test/assessmentSerialization.test.js` — serializer allowlist and policy unit tests.
- `backend/test/assessmentRoutes.integration.test.js` — authenticated student HTTP contract tests.
- `backend/test/teacherAssessmentRoutes.integration.test.js` — authenticated teacher/admin HTTP contract tests.

### Modify

- `backend/src/constants/assessmentConfig.js` — add `OBJECTIVE_KEY_PATTERN`.
- `backend/src/services/assessmentPolicyService.js` — add draft validation and objective-key checks while retaining full publish validation.
- `backend/src/services/assessmentAttemptService.js` — return saved selections and expose safe active-attempt retrieval.
- `backend/src/app.js` — mount both routers and map malformed JSON before the generic error response.
- `backend/test/assessmentPolicyService.test.js` — draft/publish and objective-key cases.
- `backend/test/assessmentAttemptService.test.js` — response recovery and active-attempt cases.
- `backend/test/securityRegression.test.js` — recursive answer-key and cross-scope regressions.
- `backend/test/runTests.js` — register all new suites.

## Review Focus

- A discovery response after one POST submission must say `hasSubmittedAttempt: true` without any `completed` or `lessonCompleted` property.
- A student's latest POST submission must not unlock `AFTER_FINAL_ATTEMPT` review while an allowed attempt remains; only exhaustion with no active attempt unlocks it.
- A hidden-score POST must retain boolean `passed` while every approved numeric score/comparison field is absent, not `null` or zero.
- Repeated or comma-joined `Idempotency-Key` headers must be rejected before Phase B submission runs.
- A stale teacher version or newly-created attempt observed after the initial authorization check must be rechecked under the assessment row lock before graph replacement or publication changes.
- A former classroom member must not retrieve a previously submitted result or any answer review, even when the attempt still belongs to that student.

---

### Task 1: Draft Policy, Objective Keys, and Serialization Boundary

**Files:**
- Modify: `backend/src/constants/assessmentConfig.js`
- Modify: `backend/src/services/assessmentPolicyService.js`
- Create: `backend/src/services/assessmentSerializationService.js`
- Create: `backend/src/services/assessmentErrorService.js`
- Modify: `backend/test/assessmentPolicyService.test.js`
- Create: `backend/test/assessmentSerialization.test.js`

**Interfaces:**
- Consumes: Phase B assessment enums/defaults/limits and plain Sequelize-like objects.
- Produces: `OBJECTIVE_KEY_PATTERN`, `validateObjectiveKey(value)`, `validateAssessmentDraft({ assessment, questions })`, `serializeDiscoveryStatus(input)`, `serializePlayerAssessment(assessment)`, `serializePlayerAttempt(input)`, `serializeStudentResult(input)`, `serializeAllowedReview(input)`, `serializeTeacherSummary(input)`, `serializeTeacherEditor(assessment, metadata)`, `serializeTeacherResults(input)`, `AssessmentApiError`, `translateAssessmentError(error)`, and `sendAssessmentError(res, error)`.

- [ ] **Step 1: Add failing draft and objective-key policy tests**

Add named tests to `assessmentPolicyService.test.js` which prove:

```js
test("draft validation permits incomplete graphs but enforces persistence-safe fields", () => {
  assert.doesNotThrow(() => policy.validateAssessmentDraft({
    assessment: { lessonKey: "arrays", type: "POST", title: "Draft" },
    questions: [],
  }));
  assert.doesNotThrow(() => policy.validateAssessmentDraft({
    assessment: { lessonKey: "arrays", type: "POST", title: "Draft" },
    questions: [{
      questionText: "Work in progress",
      questionType: "MULTIPLE_CHOICE",
      points: 1,
      objectiveKey: "array-declaration",
      choices: [{ choiceText: "Only choice", isCorrect: false }],
    }],
  }));
});

test("objective keys use the minimal lowercase kebab-case contract", () => {
  assert.equal(policy.validateObjectiveKey(null), null);
  assert.equal(policy.validateObjectiveKey("array-declaration-2"), "array-declaration-2");
  for (const value of ["Array", "array key", "array_key", "-array", "array-", "array--key"]) {
    assert.throws(() => policy.validateObjectiveKey(value), /objective key/i);
  }
});
```

Also assert that `validateAssessmentForPublish` still rejects zero questions, incomplete choices, multiple/no correct choices, and invalid TRUE/FALSE semantics.

- [ ] **Step 2: Run policy tests and confirm RED**

Run from `backend`:

```text
node --test test/assessmentPolicyService.test.js
```

Expected: failure because `validateAssessmentDraft` and `validateObjectiveKey` are not exported.

- [ ] **Step 3: Implement minimal draft and objective-key validation**

Add:

```js
const OBJECTIVE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const validateObjectiveKey = (value) => {
  if (value == null || value === "") return null;
  const normalized = String(value);
  if (normalized.length > ASSESSMENT_LIMITS.objectiveKeyLength
    || !OBJECTIVE_KEY_PATTERN.test(normalized)) {
    throw new TypeError("Objective key must use lowercase kebab-case");
  }
  return normalized;
};
```

`validateAssessmentDraft` must call `validateAssessmentConfiguration`, require a nonblank bounded title, validate optional instructions length, enforce the question/choice count ceilings, and validate every included row's text/type/positive bounded points/boolean correctness/objective key. It must not require two choices, one correct choice, any question, or complete TRUE/FALSE semantics. Refactor shared row checks so publish validation calls the same persistence-safe checks before applying its stricter gradability rules.

- [ ] **Step 4: Add failing serializer and error-translation tests**

In `assessmentSerialization.test.js`, create a recursive `findForbiddenKey(value, keys)` helper and tests named:

- `player serializers recursively exclude answer and teacher configuration fields`
- `teacher editor serializer includes answer keys only after authorization`
- `discovery uses assessment-state names and never lesson completion names`
- `PRE student results omit passed`
- `hidden-score POST retains passed and omits every score and comparison field`
- `review serialization emits keys only for an explicitly allowed review`
- `assessment errors translate Phase B and Sequelize conflicts without leaking internals`

The hidden-score assertion must be exact:

```js
assert.equal(result.result.passed, true);
for (const key of ["pointsEarned", "maxPoints", "percentage"]) {
  assert.equal(key in result.result, false);
}
for (const key of ["officialGrade", "firstPost", "prePercentage", "learningGain"]) {
  assert.equal(key in result, false);
}
```

For discovery, assert `hasSubmittedAttempt` and PRE-only `diagnosticCompleted`, then recursively reject `completed` and `lessonCompleted`.

- [ ] **Step 5: Run serializer tests and confirm RED**

Run:

```text
node --test test/assessmentSerialization.test.js
```

Expected: module-not-found failures for the two new services.

- [ ] **Step 6: Implement independent allowlist serializers and safe errors**

Implement every exported serializer as a fresh object projection. Do not spread model JSON into output and do not implement the player serializer by deleting teacher keys. `serializeStudentResult` must conditionally attach score/comparison properties only when `showScoreAfterSubmission === true`, but attach POST `passed` whenever it is non-null. `serializeDiscoveryStatus` must emit `hasSubmittedAttempt`; for PRE only, it must also emit `diagnosticCompleted` with the same submitted-attempt truth value.

Implement:

```js
class AssessmentApiError extends Error {
  constructor(status, code, message, details = {}) { /* assign safe fields */ }
}

const translateAssessmentError = (error) => { /* exact section 13 mapping */ };
const sendAssessmentError = (res, error) => { /* status + code/message/safe details */ };
```

Map Sequelize unique errors to `ASSESSMENT_TYPE_EXISTS` unless the constraint/index is the submission-key index, which maps to `SUBMISSION_CONFLICT`. Return `null` from translation for unknown errors so the sender logs server-side and emits `{ code: "SERVER_ERROR", message: "Server error" }`.

- [ ] **Step 7: Run both unit suites until GREEN**

Run:

```text
node --test test/assessmentPolicyService.test.js test/assessmentSerialization.test.js
```

Expected: all tests pass.

### Task 2: Safe Attempt Recovery and Phase B Service Extensions

**Files:**
- Modify: `backend/src/services/assessmentAttemptService.js`
- Modify: `backend/test/assessmentAttemptService.test.js`

**Interfaces:**
- Consumes: existing `startOrResumeAttempt`, model graph includes, membership/version checks, and persisted `AssessmentResponse` rows.
- Produces: `getActiveAttempt({ attemptId, studentId })`; start/resume and active retrieval return `{ attempt, assessment, resumed, responses }`, where responses contain only `{ questionId, selectedChoiceId }`.

- [ ] **Step 1: Extend the fake store and add failing recovery tests**

Update the existing harness only as needed for unlocked read options, then add tests named:

- `new attempts include an empty safe response list`
- `resumed attempts recover selected choices without grading fields`
- `active attempt retrieval preserves persisted order and selections`
- `active attempt retrieval rejects foreign ownership and inactive membership`
- `active attempt retrieval rejects submitted and version-mismatched attempts`

Core assertion:

```js
assert.deepEqual(resumed.responses, [
  { questionId: 101, selectedChoiceId: 1001 },
]);
assert.equal(JSON.stringify(resumed).includes("isCorrect"), false);
assert.equal(JSON.stringify(resumed).includes("pointsAwarded"), false);
assert.equal(JSON.stringify(resumed).includes("explanation"), false);
```

- [ ] **Step 2: Run attempt-service tests and confirm RED**

Run:

```text
node --test test/assessmentAttemptService.test.js
```

Expected: response-list assertions fail and `getActiveAttempt` is undefined.

- [ ] **Step 3: Add shared safe response loading**

Add private:

```js
const safeSavedResponses = (rows = []) => rows.map((rowInput) => {
  const row = plain(rowInput);
  return { questionId: row.questionId, selectedChoiceId: row.selectedChoiceId ?? null };
});

const loadSafeResponses = async (attemptId, transaction) => safeSavedResponses(
  await AssessmentResponse.findAll({ where: { attemptId }, transaction }),
);
```

Use it in both the active-resume path and `getActiveAttempt`. A new attempt returns `responses: []` without another query.

- [ ] **Step 4: Implement `getActiveAttempt` with the mutation-equivalent checks**

Within the existing transaction pattern: require owned attempt; require `IN_PROGRESS`; load published graph; require matching version; require exact active membership; load safe selections; return the persisted ordered player graph. Reuse existing private guards rather than duplicating authorization logic.

- [ ] **Step 5: Run the attempt suite until GREEN**

Run:

```text
node --test test/assessmentAttemptService.test.js
```

Expected: all existing Phase B and new recovery tests pass.

### Task 3: Authorization and Student Read APIs

**Files:**
- Create: `backend/src/services/assessmentAuthorizationService.js`
- Create: `backend/src/services/assessmentReadService.js`
- Create: `backend/src/routes/assessments.js`
- Create: `backend/test/assessmentRoutes.integration.test.js`

**Interfaces:**
- Consumes: models, `ACADEMIC_LESSON_KEYS`, Phase B selectors, attempt service, student serializers, and `AssessmentApiError`.
- Produces: `requireActiveStudentMembership`, `requireManagedClassroom`, `requireAssessmentInClassroom`, `assertAcademicLessonKey`, `createAssessmentReadService(dependencies)`, default `discoverAssessment`, `getPlayerAssessment`, `getActiveAttempt`, `getStudentResult`, `canExposeAnswerReview`, and the student router.

- [ ] **Step 1: Create the student integration harness and failing read-route tests**

Start an ephemeral server around `app`, use the repository JWT helper pattern, stub model/service calls with restoration in `afterEach`, and add tests named:

- `student assessment routes require authentication and student role`
- `discovery requires membership in the exact classroom`
- `discovery returns unavailable assessment state without a graph`
- `discovery returns hasSubmittedAttempt and PRE diagnosticCompleted without lesson completion fields`
- `discovery never exposes questions choices or grading configuration`
- `published player graph is available only to an exact classroom member`
- `unpublished and missing player graphs use safe 404 responses`
- `active-attempt GET returns stable order and safe saved selections`
- `another student cannot read an active attempt`

The available POST discovery test must assert:

```js
assert.equal(payload.status.hasSubmittedAttempt, true);
assert.equal("completed" in payload.status, false);
assert.equal("lessonCompleted" in payload.status, false);
assert.equal("questions" in payload.assessment, false);
```

- [ ] **Step 2: Run the student read tests and confirm RED**

Run:

```text
node --test test/assessmentRoutes.integration.test.js
```

Expected: 404/module failures because the router and read services do not exist.

- [ ] **Step 3: Implement authorization primitives**

`requireActiveStudentMembership` queries exactly `{ classroomId, studentId, status: "active" }`. `requireManagedClassroom` loads the classroom, permits admins under the existing policy, and requires `Classroom.teacherId === actorId` for teachers. `requireAssessmentInClassroom` queries both IDs in one `where`. `assertAcademicLessonKey` throws `INVALID_LESSON_KEY` for tutorial/unknown values. Export a `createAssessmentAuthorizationService({ models })` factory plus default methods for isolated tests.

- [ ] **Step 4: Implement bounded discovery and safe graph reads**

`discoverAssessment` must authorize membership first, query the published classroom/lesson/type assessment, query that student's attempts for only that assessment, derive active/submitted counts and official POST using `selectOfficialPostAttempt`, and call `serializeDiscoveryStatus`. It must never include the question graph.

`getPlayerAssessment` loads the published graph in display order, authorizes against its persisted classroom ID, and calls only `serializePlayerAssessment`. `getActiveAttempt` delegates to the Phase B safe retrieval function and adapts its result through `serializePlayerAttempt`.

- [ ] **Step 5: Implement the thin read routes**

Mount `authMiddleware` and `requireRole("student")` once. Add strict positive-base-10 ID parsing and type normalization. Declare the discovery route before `/:assessmentId` so `classrooms` cannot be consumed as an assessment ID. Route handlers call one service function, select 200, and pass caught errors to `sendAssessmentError`.

- [ ] **Step 6: Run read-route and serializer tests until GREEN**

Run:

```text
node --test test/assessmentSerialization.test.js test/assessmentRoutes.integration.test.js
```

Expected: all read, membership, role, and leak assertions pass.

### Task 4: Student Attempt Mutations, Results, Review Policy, and Idempotency

**Files:**
- Modify: `backend/src/services/assessmentReadService.js`
- Modify: `backend/src/routes/assessments.js`
- Modify: `backend/test/assessmentRoutes.integration.test.js`

**Interfaces:**
- Consumes: Phase B `startOrResumeAttempt`, `saveResponse`, `submitAttempt`, official/first selectors, `calculateLearningGain`, persisted response graph, and serializers.
- Produces: start/resume, autosave/clear, submit, submitted-result endpoints; `getStudentResult`; exhaustion-based `canExposeAnswerReview`.

- [ ] **Step 1: Add failing mutation and request-contract tests**

Add tests named:

- `start returns 201 and resume returns 200 with the same attempt and order`
- `autosave accepts one selectedChoiceId or null and returns no grading fields`
- `mutation bodies reject unknown and score-like fields`
- `submission requires one valid Idempotency-Key header`
- `submission maps the header to Phase B submissionKey and returns the result envelope`
- `same-key retry returns 200 with the immutable result`
- `different-key retry and cross-attempt key reuse return distinct 409 codes`
- `PRE result is diagnostic and omits passed`
- `POST result marks highest official attempt and computes gain from first POST`
- `hidden-score POST keeps passed and omits every score and comparison field`
- `former classroom member cannot retrieve a submitted result or answer review`

For the required hidden-score integration contract:

```js
assert.equal(payload.result.scoreVisible, false);
assert.equal(payload.result.passed, true);
for (const key of ["pointsEarned", "maxPoints", "percentage"]) {
  assert.equal(key in payload.result, false);
}
for (const key of ["officialGrade", "firstPost", "prePercentage", "learningGain"]) {
  assert.equal(key in payload, false);
}
```

- [ ] **Step 2: Add failing review-exhaustion tests**

Add separate tests for `NEVER`, `AFTER_SUBMISSION`, and `AFTER_FINAL_ATTEMPT`. The exhaustion test must cover all three states:

```js
assert.equal(canExposeAnswerReview({
  assessment: { answerReviewPolicy: "AFTER_FINAL_ATTEMPT", maxAttempts: 3 },
  submittedAttempts: [{ id: 1 }],
  activeAttempt: null,
}), false);
assert.equal(canExposeAnswerReview({
  assessment: { answerReviewPolicy: "AFTER_FINAL_ATTEMPT", maxAttempts: 3 },
  submittedAttempts: [{ id: 1 }, { id: 2 }, { id: 3 }],
  activeAttempt,
}), false);
assert.equal(canExposeAnswerReview({
  assessment: { answerReviewPolicy: "AFTER_FINAL_ATTEMPT", maxAttempts: 3 },
  submittedAttempts: [{ id: 1 }, { id: 2 }, { id: 3 }],
  activeAttempt: null,
}), true);
```

Also exercise the result endpoint after the student's latest-but-not-exhausted submission and assert that `reviewAvailable` remains false and no `review` property exists.

- [ ] **Step 3: Run student mutation tests and confirm RED**

Run:

```text
node --test test/assessmentRoutes.integration.test.js
```

Expected: mutation routes are missing and result/review cases fail.

- [ ] **Step 4: Implement result composition and exhaustion semantics**

`canExposeAnswerReview` must return true only for:

```js
policy === "AFTER_SUBMISSION"
|| (policy === "AFTER_FINAL_ATTEMPT"
  && submittedAttempts.length >= Number(assessment.maxAttempts)
  && !activeAttempt)
```

`getStudentResult` must verify ownership, exact active membership in the classroom persisted on the attempt/assessment, and submitted status before loading or serializing any result or review data; load sibling attempts in a bounded query; select official and first POST through Phase B helpers; load the matching submitted PRE only for POST; compute gain through `calculateLearningGain`; and load response/question/choice answer data only when review is available. Pass explicit values to `serializeStudentResult` and `serializeAllowedReview`.

- [ ] **Step 5: Implement exact mutation parsing and header handling**

Add routes from sections 5.3–5.7. Reject bodies whose keys differ from the exact route allowlist. Read `req.rawHeaders` to detect repeated `Idempotency-Key` instances; reject arrays, comma-joined values, or values not matching `/^[A-Za-z0-9_-]{8,96}$/`. Forward only `{ attemptId, studentId: req.userId, submissionKey }` to Phase B. After submit commits, call `getStudentResult`; return 201 only for newly started attempts and 200 for resume/retry/results.

- [ ] **Step 6: Add concurrency and attempt-limit integration cases**

Cover PRE second-attempt exhaustion, allowed POST retries through attempt three, fourth POST start rejection, same-key concurrent submit, and different-key concurrent submit. Assert one immutable persisted result and the exact `MAX_ATTEMPTS_REACHED`, `ATTEMPT_ALREADY_SUBMITTED`, or `SUBMISSION_CONFLICT` mapping.

- [ ] **Step 7: Run all student-focused suites until GREEN**

Run:

```text
node --test test/assessmentPolicyService.test.js test/assessmentAttemptService.test.js test/assessmentSerialization.test.js test/assessmentRoutes.integration.test.js
```

Expected: all student API, Phase B regression, hidden-score, and review-exhaustion tests pass.

### Task 5: Teacher List, Create, Editor, and Atomic Draft Save

**Files:**
- Create: `backend/src/services/teacherAssessmentService.js`
- Create: `backend/src/routes/teacherAssessments.js`
- Create: `backend/test/teacherAssessmentRoutes.integration.test.js`

**Interfaces:**
- Consumes: authorization service, draft policy, teacher serializers, Phase B defaults, models, and Sequelize transaction/locks.
- Produces: `createTeacherAssessmentService(dependencies)`, default `listAssessments`, `createAssessment`, `getEditorAssessment`, `saveAssessmentGraph`, plus teacher list/create/editor/save routes.

- [ ] **Step 1: Create the teacher integration harness and failing scope/list tests**

Add tests named:

- `teacher assessment routes require authentication and teacher or admin role`
- `teacher cannot access another teacher classroom`
- `admin uses the existing teacher-router classroom scope policy`
- `assessment IDs are cross-checked against the path classroom`
- `lesson assessment list returns PRE and POST slots with bounded counts`
- `tutorial and unknown lesson keys are rejected`

Instrument model calls and assert list query count is fixed when more assessments/attempts are added.

- [ ] **Step 2: Add failing create/editor/draft-save tests**

Add tests named:

- `PRE draft creation applies diagnostic invariants`
- `POST draft creation applies 75 percent three-attempt highest defaults`
- `creation is always unpublished version one`
- `duplicate classroom lesson type maps to ASSESSMENT_TYPE_EXISTS`
- `teacher editor exposes settings answers explanations and lock state`
- `incomplete graph saves as a draft and array position defines order`
- `client IDs displayOrder and unknown fields are rejected`
- `valid objective keys save and malformed keys fail`
- `draft save increments version and rejects stale versions before deletion`
- `failed replacement rolls back settings graph and version`

- [ ] **Step 3: Run teacher tests and confirm RED**

Run:

```text
node --test test/teacherAssessmentRoutes.integration.test.js
```

Expected: routes/services are missing.

- [ ] **Step 4: Implement list/create/editor operations**

Each public service method must call `requireManagedClassroom`; assessment-specific methods must then call `requireAssessmentInClassroom`. Create applies `normalizeAssessmentConfiguration`, validates the draft, forces `isPublished: false`, `publishedAt: null`, `version: 1`, and records `createdBy: actorId`. Translate the unique classroom/lesson/type index race to `ASSESSMENT_TYPE_EXISTS`.

List performs one assessment query with aggregate attempt/question metadata, fills explicit `{ PRE, POST }` slots, and calls `serializeTeacherSummary`. Editor loads ordered questions/choices plus one attempt-existence count and calls `serializeTeacherEditor`.

- [ ] **Step 5: Implement atomic whole-graph replacement**

Inside one Sequelize transaction:

1. Re-authorize the managed classroom.
2. Lock the assessment row loaded by `{ id: assessmentId, classroomId }`; this must occur before any query or count against `AssessmentAttempt`.
3. Compare numeric `input.version` and throw `ASSESSMENT_VERSION_CONFLICT` with `currentVersion` before destructive writes.
4. Only after the assessment lock is held, count attempts and throw `ASSESSMENT_LOCKED` when nonzero.
5. Reject unknown/server-owned fields and validate the complete incoming draft in memory.
6. If currently published, additionally call `validateAssessmentForPublish`.
7. Delete existing choices through the existing questions, then delete questions.
8. Create questions and choices sequentially with array-index `displayOrder`.
9. Update only approved settings, increment version once, save, and reload editor data within the transaction.

- [ ] **Step 6: Implement thin teacher routes and exact request allowlists**

Mount `authMiddleware` and `requireRole("teacher", "admin")`. Parse positive IDs and exact query/body keys. Return 201 for create and 200 for list/editor/save. Catch every service error through `sendAssessmentError`; no route may query a model.

- [ ] **Step 7: Run teacher draft suites until GREEN**

Run:

```text
node --test test/assessmentPolicyService.test.js test/assessmentSerialization.test.js test/teacherAssessmentRoutes.integration.test.js
```

Expected: list/create/editor/save, isolation, version, and rollback tests pass.

### Task 6: Publish, Unpublish, Delete, and Attempt Immutability

**Files:**
- Modify: `backend/src/services/teacherAssessmentService.js`
- Modify: `backend/src/routes/teacherAssessments.js`
- Modify: `backend/test/teacherAssessmentRoutes.integration.test.js`

**Interfaces:**
- Consumes: full publish validator, `LESSON_DEFINITIONS`/playable level keys, `UserProgress`, locked assessment scope, and attempt counts.
- Produces: `publishAssessment`, `unpublishAssessment`, `deleteAssessment`; explicit lifecycle routes and publication warnings.

- [ ] **Step 1: Add failing publication tests**

Add tests named:

- `valid complete graph publishes and increments version`
- `invalid graph returns ASSESSMENT_INVALID 422 without partial publication`
- `stale publish and unpublish versions return currentVersion`
- `PRE publication reports distinct active students with server progress evidence`
- `publication warning does not activate a progression gate`

Build warning fixtures covering `startedAt`, positive `progressPercent`, positive `attemptCount`, `isCompleted`, and positive `timeSpentSeconds`; count each active classroom student once for level keys belonging to the lesson.

- [ ] **Step 2: Add failing immutability/unpublish/delete tests**

Add tests named:

- `unpublish with zero attempts clears publishedAt and increments version`
- `already-unpublished action is idempotent without a version increment`
- `any attempt locks every settings and graph edit`
- `unpublish after any attempt returns ASSESSMENT_LOCKED`
- `unpublished untouched assessment deletes with 204`
- `published untouched assessment returns ASSESSMENT_PUBLISHED`
- `attempted assessment cannot be deleted`
- `concurrent start versus teacher mutation is resolved by the assessment lock`
- `save publish unpublish and delete never query attempts before acquiring the assessment lock`

- [ ] **Step 3: Run lifecycle tests and confirm RED**

Run:

```text
node --test test/teacherAssessmentRoutes.integration.test.js
```

Expected: lifecycle routes are missing or lifecycle assertions fail.

- [ ] **Step 4: Implement publish and warning calculation**

In one transaction, re-authorize, lock the assessment row as the first mutation lock, and only then perform any `AssessmentAttempt` query/count. After the lock is held, verify version, reject existing attempts, load the graph, call `validateAssessmentForPublish`, calculate warning metadata, then set `isPublished`, `publishedAt`, and increment version once. The warning query must restrict to active membership student IDs and lesson level keys, and match only rows with at least one server evidence field; it never blocks publishing.

- [ ] **Step 5: Implement unpublish and delete under the same lock order**

Unpublish and delete both acquire the assessment row lock before issuing any attempt lookup or count. Unpublish then verifies the supplied version and rejects any attempt; if already unpublished, return the current editor-safe state unchanged. Delete has no version body, but after the same lock requires unpublished plus zero attempts before `destroy({ transaction })`. Do not manually cascade attempted/history rows. Preserve the common assessment-lock root so Phase B student start and every teacher mutation serialize against the same row.

- [ ] **Step 6: Add explicit routes and run lifecycle tests until GREEN**

Add `POST /:assessmentId/publish`, `POST /:assessmentId/unpublish`, and `DELETE /:assessmentId` beneath the classroom assessment prefix. Require exact `{ version }` for actions and no body for delete. Run:

```text
node --test test/teacherAssessmentRoutes.integration.test.js test/assessmentAttemptService.test.js
```

Expected: lifecycle, race, immutability, and Phase B attempt tests pass.

### Task 7: Bounded Teacher Results Query

**Files:**
- Modify: `backend/src/services/teacherAssessmentService.js`
- Modify: `backend/src/routes/teacherAssessments.js`
- Modify: `backend/test/teacherAssessmentRoutes.integration.test.js`

**Interfaces:**
- Consumes: authorized assessment scope, one submitted-attempt query, student projection, and Phase B POST selectors.
- Produces: `getAssessmentResults({ classroomId, assessmentId, actorId, actorRole })` and `GET /api/teacher/classrooms/:classroomId/assessments/:assessmentId/results`.

- [ ] **Step 1: Add failing result-query tests**

Add tests named:

- `teacher results enforce classroom ownership and assessment classroom identity`
- `results query requests only submitted attempts and allowed student columns`
- `POST rows mark official highest and first submitted independently`
- `PRE rows never receive an official highest marker`
- `result payload excludes responses submission keys and private account fields`
- `result query count is constant as student and attempt counts grow`

Inspect the `findAll` options and require:

```js
assert.deepEqual(options.where, {
  assessmentId: 12,
  classroomId: 7,
  status: "SUBMITTED",
});
assert.deepEqual(options.include[0].attributes, ["id", "firstName", "lastName", "username"]);
```

- [ ] **Step 2: Run teacher result tests and confirm RED**

Run:

```text
node --test test/teacherAssessmentRoutes.integration.test.js
```

Expected: results route/function is missing.

- [ ] **Step 3: Implement one-query results composition**

After authorization, issue one ordered `AssessmentAttempt.findAll` with the exact assessment/classroom/submitted predicate, explicit result attributes, and student include projection. Group rows by student ID in memory. For POST only, call `selectOfficialPostAttempt` and `selectFirstSubmittedPostAttempt` per group to set `isOfficial` and `isFirstSubmittedPost`; do not fetch responses. Pass the final rows through `serializeTeacherResults`.

- [ ] **Step 4: Add the thin GET route and run tests until GREEN**

Return 200 with `{ assessment, results }`; use the common error mapper. Run:

```text
node --test test/teacherAssessmentRoutes.integration.test.js
```

Expected: all authorization, projection, selector, and bounded-query tests pass.

### Task 8: App Registration, Malformed JSON, Security Regression, and Full Verification

**Files:**
- Modify: `backend/src/app.js`
- Modify: `backend/test/securityRegression.test.js`
- Modify: `backend/test/runTests.js`
- Modify: `backend/test/assessmentRoutes.integration.test.js`
- Modify: `backend/test/teacherAssessmentRoutes.integration.test.js`

**Interfaces:**
- Consumes: completed student/teacher routers and centralized error contract.
- Produces: mounted production routes, safe malformed-JSON handling, registered suites, and full Phase C regression evidence.

- [ ] **Step 1: Add failing app/error and recursive security tests**

Add malformed JSON HTTP cases expecting exactly status 400 plus `INVALID_REQUEST`. Extend `securityRegression.test.js` with a recursive forbidden-key walker over fixtures for discovery, player graph, start, resume, active attempt, autosave, PRE `NEVER`, non-exhausted POST `AFTER_FINAL_ATTEMPT`, and malicious bodies containing grading-key names.

Add cross-scope HTTP tests proving:

- student A cannot read student B's attempt, selections, or result;
- a student who owns a submitted attempt but whose membership is now removed cannot retrieve its result or answer review;
- path/body classroom substitution cannot override persisted classroom identity;
- teacher A cannot read or mutate teacher B's assessment/results by guessed IDs;
- translated database errors never expose SQL, constraint names, stack traces, or raw messages.

- [ ] **Step 2: Run app/security suites and confirm RED**

Run:

```text
node --test test/securityRegression.test.js test/assessmentRoutes.integration.test.js test/teacherAssessmentRoutes.integration.test.js
```

Expected: production route mounts and malformed-JSON mapping are not yet present.

- [ ] **Step 3: Mount routers and normalize malformed JSON**

In `app.js`, mount:

```js
app.use("/api/assessments", require("./routes/assessments"));
app.use("/api/teacher", require("./routes/teacherAssessments"));
```

Place the assessment teacher router alongside the existing teacher router without modifying existing teacher endpoints. In the final error middleware, detect Express body-parser syntax errors before logging/returning the generic 500 and respond with:

```json
{ "code": "INVALID_REQUEST", "message": "Malformed JSON request body" }
```

- [ ] **Step 4: Register all new test suites**

Append these requires to `backend/test/runTests.js` after the Phase B assessment suites:

```js
require("./assessmentSerialization.test");
require("./assessmentRoutes.integration.test");
require("./teacherAssessmentRoutes.integration.test");
```

- [ ] **Step 5: Run focused Phase C verification**

Run from `backend`:

```text
node --test test/assessmentPolicyService.test.js test/assessmentAttemptService.test.js test/assessmentSerialization.test.js test/assessmentRoutes.integration.test.js test/teacherAssessmentRoutes.integration.test.js test/securityRegression.test.js
```

Expected: all focused tests pass with no open handles or unhandled rejections.

- [ ] **Step 6: Run the full backend regression suite**

Run from `backend`:

```text
npm test
```

Expected: the Phase B baseline of 160 tests increases and every test passes, including the compiler-host build prerequisite.

- [ ] **Step 7: Verify formatting and scope**

Run from the repository root:

```text
git diff --check
git status --short
git diff --name-only
git ls-files --others --exclude-standard
```

Confirm the changed paths are limited to the approved backend Phase C files plus this specification and plan. Confirm there are no changes under `frontend`, progression/access services, game/map code, XP, hint code, models, or migrations. Do not stage, commit, or push.

## Completion Criteria

- Every route and payload in the approved specification has a passing contract test.
- Discovery uses only `hasSubmittedAttempt` and PRE-only `diagnosticCompleted`, with no lesson-completion semantics.
- `AFTER_FINAL_ATTEMPT` is tested as exhaustion plus no active attempt, not latest-submission behavior.
- Hidden-score POST integration coverage proves `passed` remains present and all seven approved score/comparison fields remain absent.
- Student payloads pass recursive forbidden-key checks before review is permitted.
- Teacher graph mutations recheck version and attempt immutability under the assessment row lock.
- Submission retries preserve the Phase B idempotency and conflict semantics.
- Teacher results use a bounded query and explicit student/result projections.
- The full backend suite and `git diff --check` pass, and no Phase C frontend or progression changes exist.
