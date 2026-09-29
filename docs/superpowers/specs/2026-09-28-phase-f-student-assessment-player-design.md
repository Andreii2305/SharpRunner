# Phase F Student Assessment Player and Results UI — Design Specification

**Status:** Approved; Checkpoint F-A backend contract closure implemented and verified locally
**Date:** 2026-09-28
**Baseline:** `f4da8e0b5abf8ce9765f77b703237ab245001f59` on synchronized `main`
**Scope:** Student discovery, attempt play, autosave, submission, results, and retakes for existing PRE and POST assessments
**Out of scope:** Phase G map/game integration, teacher assessment authoring, analytics, grading changes, persistence changes, migrations, XP, hints, rewards, protected module content, and game progression redesign

## Executive summary

Phase F will add one reusable student assessment experience for both PRE and POST assessments. The backend created in Phases B–D remains authoritative for exact-classroom authorization, progression gates, stable shuffled order, one-active-attempt locking, response validation, grading, attempt limits, submission idempotency, score visibility, answer-review visibility, and canonical lesson progression. React will render only server-provided data and will never grade, infer completion, reshuffle questions, or reconstruct hidden scores.

The recommended browser route is:

```text
/classrooms/:classroomId/lessons/:lessonKey/assessment/:type
```

`classroomId`, `lessonKey`, and `type` make the route unambiguous for students with more than one active classroom. The page first calls the existing classroom-scoped discovery endpoint and obtains the server assessment ID. It starts or resumes through the existing attempt endpoints. An optional server-issued `attemptId` query parameter may preserve an active or submitted view across refresh, but the page accepts it only when discovery confirms that it belongs to the current assessment state.

The audit found two backend contract gaps that prevented the complete requested UX for every active classroom:

1. `GET /api/progress/me` always selects the newest active membership. It cannot refresh canonical progression for an explicitly routed non-primary classroom.
2. Discovery reports that a submission exists but does not return the latest submitted attempt ID. A result returned by submit survives in memory, but a later direct revisit cannot retrieve its detailed result or permitted answer review.

Checkpoint F-A approved and closed both gaps with a backward-compatible optional `classroomId` query on `/api/progress/me` and a safe `status.latestSubmittedAttemptId` field in discovery. Both remain backend-authoritative and reveal no grading data. Frontend implementation remains deferred to later Phase F checkpoints.

## 1. Repository baseline

The design audit began from:

| Check | Result |
| --- | --- |
| Branch | `main` |
| HEAD | `f4da8e0b5abf8ce9765f77b703237ab245001f59` |
| `origin/main...main` | `0 0` |
| Worktree | Clean |

Phase E is present at this baseline. Protected module delivery, Phase D progression, and Phase C student assessment APIs are production code. There is no student assessment frontend yet. The only frontend assessment references are protected-module lock messaging.

### 1.1 Product intent

The required curriculum remains:

```text
PRE → protected module → game levels → POST → canonical lesson complete
```

Phase F owns the reusable student route, API client, attempt UI, autosave, submission confirmation, results, retake UX, accessibility, and responsive behavior. Phase G will connect these primitives broadly to LessonMap and GamePage.

### 1.2 Non-negotiable boundaries

- Phase B grading and attempt services remain authoritative.
- Phase C student serializers remain the security boundary.
- Phase D progression remains the sole completion and next-action state machine.
- Phase E protected module delivery remains unchanged.
- No database model or migration change is needed.
- No teacher builder, analytics, XP, hint, reward, scene, validator, or content-package change belongs in Phase F.

## 2. Existing student assessment API audit

All seven routes are mounted below `/api/assessments`. The router applies `authMiddleware` and `requireRole("student")` to every route.

Shared authentication behavior:

- Missing bearer token: `401` with a message.
- Invalid, expired, or revoked token: `401` with a message.
- Inactive account: `403` with a message.
- Non-student role: `403` with a message.
- Unaccepted current policies: `428 POLICY_ACCEPTANCE_REQUIRED`.
- Auth and role middleware responses do not consistently include a `code`; the frontend must normalize by status as a fallback.

### 2.1 Endpoint summary

| Endpoint | Request | Success | Purpose |
| --- | --- | --- | --- |
| `GET /classrooms/:classroomId/lessons/:lessonKey/:type` | Positive classroom ID; academic lesson key; case-insensitive PRE/POST | `200` discovery envelope | Status only; never a question graph |
| `GET /:assessmentId` | Positive assessment ID | `200 { assessment }` | Published player-safe graph after exact membership and progression authorization |
| `POST /:assessmentId/attempts` | Exactly empty body; no query | `201` new or `200` resumed | Atomically start or resume one active attempt |
| `GET /attempts/:attemptId` | Positive attempt ID | `200` active attempt envelope | Resume an owned in-progress attempt |
| `PUT /attempts/:attemptId/responses/:questionId` | Exactly `{ selectedChoiceId }`; positive integer or `null`; no query | `200 { response }` | Replace or clear one response |
| `POST /attempts/:attemptId/submit` | Exactly empty body; no query; one valid `Idempotency-Key` header | `200` result envelope | Grade and immutably submit |
| `GET /attempts/:attemptId/result` | Positive attempt ID | `200` result envelope | Read an owned submitted result |

### 2.2 Discovery contract

```http
GET /api/assessments/classrooms/:classroomId/lessons/:lessonKey/:type
```

Validation and authorization order:

1. Authenticate and require student role.
2. Parse a positive safe-integer classroom ID.
3. Normalize `type` to `PRE` or `POST`.
4. Require active membership in that exact classroom.
5. Validate the lesson key against `arrays`, `functions`, `functions-with-arrays`, and `final`.
6. Find a published assessment for the exact classroom, lesson, and type.
7. If present, load the Phase D lesson state and evaluate assessment interaction.
8. Query only that student's attempts for the assessment.

Unavailable assessments return `200`, not `404`:

```json
{
  "assessment": null,
  "status": {
    "available": false,
    "lessonKey": "arrays",
    "type": "PRE",
    "attemptStatus": "NOT_AVAILABLE",
    "attemptsUsed": 0,
    "hasSubmittedAttempt": false,
    "diagnosticCompleted": false,
    "unlocked": false,
    "lockReason": null
  }
}
```

Available assessment metadata is limited to:

```json
{
  "assessment": {
    "id": 12,
    "lessonKey": "arrays",
    "type": "POST",
    "title": "Arrays post-test",
    "instructions": "Choose one answer.",
    "required": true,
    "maxAttempts": 3
  }
}
```

The status object may contain:

- `available`
- `lessonKey`
- `type`
- `attemptStatus`: `NOT_AVAILABLE`, `NOT_STARTED`, `IN_PROGRESS`, or `SUBMITTED`
- `attemptsUsed`: submitted attempts only
- `attemptsRemaining`: configured maximum minus submitted attempts
- `hasSubmittedAttempt`
- `diagnosticCompleted` for PRE only
- `unlocked`
- `lockReason`: `LESSON_PREREQUISITE_REQUIRED`, `PRE_ASSESSMENT_REQUIRED`, `GAME_INCOMPLETE`, or `null`
- `activeAttemptId` when an in-progress attempt exists
- `latestSubmittedAttemptId`: the latest submitted attempt ID for the exact authorized assessment context, or `null`; independent of score and review visibility
- `latestSubmitted` only when scores are visible; contains `attemptNumber`, `percentage`, and POST `passed` when applicable
- `officialPost` only for visible-score POST; contains `attemptNumber` and `percentage`

Discovery deliberately omits questions, choices, answer keys, passing threshold, passing requirement, review policy, grading calculation, lesson completion, and canonical next action. Checkpoint F-A added only the safe `latestSubmittedAttemptId`; result/review authorization remains authoritative.

### 2.3 Player graph contract

```http
GET /api/assessments/:assessmentId
```

The backend loads the graph, requires publication, requires active membership in the assessment's exact classroom, and applies Phase D assessment interaction authorization. It returns:

```json
{
  "assessment": {
    "id": 12,
    "lessonKey": "arrays",
    "type": "POST",
    "title": "Arrays post-test",
    "instructions": "Choose one answer.",
    "version": 3,
    "questions": [
      {
        "id": 101,
        "questionText": "Which declaration is valid?",
        "questionType": "MULTIPLE_CHOICE",
        "points": 2,
        "objectiveKey": "array-declaration",
        "choices": [
          { "id": 1001, "choiceText": "int[] values" },
          { "id": 1002, "choiceText": "int values[]()" }
        ]
      }
    ]
  }
}
```

This graph is player-safe but is not attempt-shuffled. Phase F must not use it as the active player source. Active play must use the graph returned by start/resume, whose array order reflects the persisted attempt order. The standalone graph is useful only for pre-start metadata or reconstructing permitted review labels on a later result revisit.

### 2.4 Start or resume contract

```http
POST /api/assessments/:assessmentId/attempts
Content-Type: application/json

{}
```

Unknown body fields, query parameters, arrays, malformed JSON, and nonempty unparsed bodies are rejected. Within one transaction, the service locks the assessment, validates publication and graph integrity, requires exact active membership, applies the Phase D gate, resumes an existing active attempt if present, otherwise locks sibling attempts, enforces `maxAttempts`, persists question/choice order, and creates one attempt.

New attempts return `201`; resumed attempts return `200`. Both return:

```json
{
  "attempt": {
    "attemptId": 44,
    "attemptNumber": 2,
    "assessmentVersion": 3,
    "status": "IN_PROGRESS",
    "startedAt": "2026-09-25T12:00:00.000Z",
    "resumed": true,
    "attemptsUsed": 1,
    "attemptsRemaining": 1,
    "responses": [
      { "questionId": 102, "selectedChoiceId": 2001 },
      { "questionId": 101, "selectedChoiceId": null }
    ]
  },
  "assessment": { "...player-safe attempt-ordered graph...": true }
}
```

For an active envelope, `attemptsRemaining` means retakes remaining after the current active attempt is submitted. Discovery's field means unconsumed submitted-attempt slots and therefore includes the active slot. Phase F must normalize these under distinct internal names and must not display them as though they were identical.

PRE is constrained by persisted configuration to one attempt. POST defaults to three but is configurable. Teacher-granted recovery can create an attempt number above the ordinary configured maximum.

### 2.5 Active attempt contract

```http
GET /api/assessments/attempts/:attemptId
```

The backend locks and verifies the owned attempt, requires `IN_PROGRESS`, reloads the published assessment, checks the assessment version, requires current exact-classroom membership, reapplies the Phase D interaction gate, then returns the same attempt envelope as start/resume with `resumed: true`.

It returns `409 ATTEMPT_ALREADY_SUBMITTED` for a submitted attempt. It never returns another student's selections.

### 2.6 Response replacement contract

```http
PUT /api/assessments/attempts/:attemptId/responses/:questionId
Content-Type: application/json

{ "selectedChoiceId": 1001 }
```

`selectedChoiceId` may be a positive safe integer or `null`. It is the only accepted body key. The backend:

- locks and verifies the owned attempt;
- rejects submitted attempts;
- checks publication and assessment version;
- requires current exact-classroom membership;
- reapplies the Phase D gate;
- verifies that the question was presented in this attempt;
- verifies that the choice belongs to that question;
- replaces or creates the response;
- resets server grading fields until submission.

Success is exactly:

```json
{
  "response": {
    "attemptId": 44,
    "questionId": 101,
    "selectedChoiceId": 1001
  }
}
```

Repeated saves are safe replacements, but the contract has no response revision, ETag, or conditional-write token. Across concurrent tabs, the last transaction committed wins.

### 2.7 Submit contract

```http
POST /api/assessments/attempts/:attemptId/submit
Idempotency-Key: <8-96 URL-safe A-Z/a-z/0-9/_/->
Content-Type: application/json

{}
```

Exactly one `Idempotency-Key` header is required. The router maps it to the Phase B `submissionKey`. The backend locks the attempt, verifies ownership, checks key reuse, validates membership and progression, validates every persisted response, grades all presented questions including unanswered questions, persists immutable grading fields, and marks the attempt `SUBMITTED`.

- Retrying the same attempt with the same key returns `200` and the same immutable result.
- Retrying the submitted attempt with a different key returns `409 ATTEMPT_ALREADY_SUBMITTED`.
- Reusing a key for another attempt returns `409 SUBMISSION_CONFLICT`.
- Concurrent same-key submits converge on the same result.
- Concurrent different-key submits yield one `200` and one conflict.

The response is the same result envelope returned by the result endpoint.

### 2.8 Result contract

```http
GET /api/assessments/attempts/:attemptId/result
```

Authorization happens before score or answer graph reads. The backend verifies attempt existence, owner, current active membership in the persisted classroom, submitted status, assessment existence, and exact assessment/attempt classroom identity. A former classroom member cannot retrieve a prior result or review.

Core result shape:

```json
{
  "result": {
    "attemptId": 44,
    "type": "POST",
    "status": "SUBMITTED",
    "attemptNumber": 1,
    "submittedAt": "2026-09-25T12:10:00.000Z",
    "scoreVisible": true,
    "pointsEarned": 8,
    "maxPoints": 10,
    "percentage": 80,
    "passed": true
  },
  "attempts": { "used": 1, "max": 3, "remaining": 2 },
  "reviewAvailable": false
}
```

PRE adds `diagnosticCompleted: true` and omits `passed`. POST always exposes `passed` when persisted, including when numeric scores are hidden. When scores are visible, POST may add:

- `officialGrade`: highest submitted POST, including attempt ID, attempt number, percentage, and submitted timestamp;
- `firstPost`: first submitted POST, including attempt ID, attempt number, and percentage;
- `prePercentage` and `learningGain` only when both PRE and POST score policies permit calculation.

`correctCount` and `questionCount` are not present in the HTTP result even though internal serializers can represent them. Phase F must not assume them.

When review is permitted, the envelope adds:

```json
{
  "reviewAvailable": true,
  "review": [
    {
      "questionId": 101,
      "selectedChoiceId": 1001,
      "correctChoiceId": 1001,
      "isCorrect": true,
      "pointsAwarded": 2,
      "explanation": "Arrays use brackets."
    }
  ]
}
```

The result review does not currently include question or choice text. The UI can join permitted review IDs to the in-memory player-safe graph. On a result revisit it may fetch the player-safe graph after `reviewAvailable` is true. It must never fetch or synthesize teacher/editor data.

### 2.9 Error contract

| Status | Code | Meaning and UI disposition |
| ---: | --- | --- |
| 400 | `INVALID_REQUEST` | Malformed ID/body/query/direct route; show invalid request or fail closed |
| 400 | `INVALID_ASSESSMENT_TYPE` | Type is not PRE/POST |
| 400 | `INVALID_LESSON_KEY` | Nonacademic lesson key |
| 400 | `INVALID_SUBMISSION_KEY` | Missing, duplicated, or malformed idempotency key; client defect/retry setup |
| 400 | `INVALID_QUESTION` | Question not presented in this attempt; refresh attempt |
| 400 | `INVALID_CHOICE` | Choice does not belong to question; refresh attempt |
| 401 | no stable code | Sign-in/session failure |
| 403 | `FORBIDDEN` or no code | Wrong classroom, inactive membership/account, foreign attempt, or wrong role |
| 403 | `LESSON_PREREQUISITE_REQUIRED` | Previous canonical lesson is incomplete |
| 403 | `PRE_ASSESSMENT_REQUIRED` | Required PRE must be completed |
| 403 | `POST_ASSESSMENT_LOCKED` | Game progression is incomplete |
| 404 | `ASSESSMENT_NOT_FOUND` | Missing assessment; do not reveal cross-classroom existence |
| 404 | `ASSESSMENT_NOT_PUBLISHED` | Unpublished assessment |
| 404 | `ATTEMPT_NOT_FOUND` | Missing attempt |
| 409 | `ATTEMPT_IN_PROGRESS` | Result requested before submission; resume active attempt |
| 409 | `ATTEMPT_ALREADY_SUBMITTED` | Mutation after submit or different-key duplicate; load result |
| 409 | `MAX_ATTEMPTS_REACHED` | No ordinary attempt may be started |
| 409 | `ACTIVE_ATTEMPT_EXISTS` | Concurrent attempt creation; rediscover and resume |
| 409 | `ASSESSMENT_VERSION_CONFLICT` | Attempt graph no longer matches assessment; fail closed |
| 409 | `SUBMISSION_CONFLICT` | Idempotency key belongs to another attempt; generate only for a new attempt |
| 422 | `ASSESSMENT_INVALID` | Published graph is not gradable; unavailable/server support state |
| 428 | `POLICY_ACCEPTANCE_REQUIRED` | Existing route guard should take over |
| 500 | `SERVER_ERROR` or message only | Retryable generic failure; never show internals |

Progression error details such as `lessonKey`, `assessmentId`, `prerequisiteLessonKey`, and `nextAction` are flattened at the top level of the error body. The frontend error normalizer must not expect a nested `details` object only.

## 3. Existing serialization and security contract

### 3.1 Before submission

The discovery endpoint returns only assessment metadata and status. It never returns a graph.

The player-safe graph returns:

- assessment ID, lesson key, type, title, nullable instructions, and version;
- question ID, text, type, points, nullable objective key, and array order;
- choice ID, text, and array order.

The active attempt adds:

- attempt ID, number, assessment version, `IN_PROGRESS`, and `startedAt`;
- resumed flag;
- submitted-attempt usage and remaining-after-current counts;
- saved `{ questionId, selectedChoiceId }` values.

It does not expose:

- `isCorrect`;
- `correctChoiceId`;
- `pointsAwarded`;
- question explanation;
- passing percentage or applied threshold;
- grading calculation;
- answer-review policy;
- `createdBy`, student ID, or submission key;
- teacher/editor ordering fields;
- persisted grading totals.

Array position is authoritative. Although persistence has `displayOrder`, player serializers intentionally omit it.

### 3.2 After submission

The result endpoint always exposes attempt identity/status, attempt number, submitted time, score visibility, attempt counts, and review availability. PRE exposes diagnostic completion. POST exposes the server `passed` boolean.

Numeric score fields and comparison fields exist only when `showScoreAfterSubmission` is true. Review grading keys exist only when `reviewAvailable` is true under the persisted policy.

The frontend must apply presence checks, not default missing values to zero. Absence is a security policy outcome, not missing data.

### 3.3 Rendering rule

All question, choice, instruction, and explanation strings render as React text nodes. Phase F will not use `dangerouslySetInnerHTML`, Markdown HTML injection, or browser-evaluated content.

## 4. Attempt lifecycle

The authoritative lifecycle is:

```text
discovery
  ├─ unavailable/locked → status UI
  ├─ activeAttemptId → GET active attempt → IN_PROGRESS
  ├─ submitted and no active → result summary/revisit or retake
  └─ ready → POST start → IN_PROGRESS

IN_PROGRESS
  ├─ PUT response replacement/clear
  ├─ GET active attempt on refresh/resume
  └─ POST submit with stable idempotency key

SUBMITTED
  ├─ GET result
  ├─ POST start next POST attempt when allowed
  └─ immutable; response PUT rejected
```

Backend-authoritative guarantees:

- at most one active attempt for a student and assessment;
- assessment row lock is the common start/mutation root;
- PRE has one ordinary attempt and no passing requirement;
- POST obeys configured maximum attempts plus explicit teacher recovery;
- persisted question and choice order is stable for an attempt;
- response question/choice membership is validated;
- submitted attempts are immutable;
- grading is transactional and server-only;
- same-key submit retry is idempotent;
- ownership and current membership are rechecked;
- direct assessment access cannot bypass Phase D gates.

Frontend responsibilities are presentation, ordered save delivery within one tab, recoverable error handling, and authoritative refetch. It must not reproduce these rules as security checks.

## 5. Phase D progression integration

`lessonProgressionService` produces the canonical per-lesson fields:

- `preRequired`, `preAssessmentId`, `preUnlocked`, `preAttemptInProgress`, `preCompleted`
- `moduleUnlocked`, `gameUnlocked`, `gameStarted`, `gameCompleted`
- `postRequired`, `postAssessmentId`, `postUnlocked`, `postAttemptInProgress`, `postCompleted`
- `postPassingRequired`, `postPassed`, `postAttemptsUsed`, `postAttemptsRemaining`, `postAttemptsExhausted`
- `assessmentCompleted`, `lessonCompleted`, `nextAction`

`GET /api/progress/me` projects these fields into each canonical lesson and adds summary `nextAction` and `nextActionLessonKey`. Legacy `isCompleted` remains game-only; Phase F must use `lessonCompleted` for canonical completion.

The current endpoint always selects `findPrimaryActiveMembership`. The membership model allows one active row per classroom/student pair, not one active classroom total, and `/api/classrooms/me` returns multiple active classrooms. Therefore `/api/progress/me` cannot safely answer an explicit non-primary Phase F route.

Recommended contract closure:

```http
GET /api/progress/me?classroomId=:positiveId
```

- An omitted query preserves current primary-classroom behavior byte-for-byte.
- A supplied ID is strictly parsed and requires current exact active membership before classroom-specific reads.
- The existing response shape is retained, with `classroomId` equal to the requested classroom.
- The page selects the routed lesson from `lessons` and consumes the existing summary.
- Invalid IDs return safe `400 INVALID_REQUEST`; nonmembership returns safe `403 FORBIDDEN`.

This extends the existing projection rather than creating a second progression state machine or embedding progression rules in React.

## 6. Frontend architecture audit

### 6.1 Routing and guards

`frontend/src/App.jsx` uses lazy page imports, React Router, `Suspense`, and `ProtectedRoute`. Student routes generally use `requireClassMembership`; the new route should additionally set `allowedRoles={["student"]}` for explicit role intent.

Existing built-in module routing uses a lesson-key path plus `?classroomId=`. `BuiltInModulePage` validates an explicit positive classroom ID, falls back to the primary classroom only when none is supplied, uses `AbortController`, guards stale route responses with a request generation, and renders distinct safe states. These are the closest conventions for Phase F.

### 6.2 API conventions

The frontend uses Axios with `buildApiUrl()` and `getAuthHeaders()`. Most pages call Axios directly, while Phase E introduced a focused service with normalized safe errors and AbortSignal support. Phase F should follow the Phase E service boundary rather than spread assessment requests through components.

### 6.3 State and testing conventions

There is no Redux or query-cache library. Components use React state/reducers and pure helper modules. Tests use Node's built-in test runner. Render tests use Vite SSR plus `renderToStaticMarkup`; no DOM testing dependency is installed. Phase F should remain dependency-free and make behavior testable through pure reducers/save coordination plus semantic SSR output.

### 6.4 Existing quiz components

The protected module has a local `CheckBlock`, but it reveals client-held correct answers and is intentionally non-graded. It must not be reused for secure assessments. There is no reusable secure quiz/player component.

### 6.5 Existing map/game boundary

LessonMapPage loads `/api/progress/me` once and currently navigates directly to game routes. GamePage and LevelRoutePage use server access checks but do not expose a student assessment player. Phase G owns broad map/game transition changes, so Phase F will not modify these files.

## 7. Routing decision

### 7.1 Considered routes

1. **Recommended: class/lesson/type route** — `/classrooms/:classroomId/lessons/:lessonKey/assessment/:type`. It is explicit, bookmarkable, maps directly to discovery, and cannot silently select the wrong classroom.
2. **Assessment-ID-only route** — `/assessment/:assessmentId`. It is shorter but hides classroom context, forces an ID-first flow, and is ambiguous for post-result navigation.
3. **Attempt-first route** — `/assessment-attempts/:attemptId`. It refreshes active/result views but cannot represent discovery, unavailable, locked, or new-attempt states and makes context reconstruction harder.

The first route is selected. One page handles PRE and POST; there will not be separate `PreTestPlayer` and `PostTestPlayer` implementations.

### 7.2 Canonical parameters

- `classroomId`: required positive safe integer.
- `lessonKey`: required backend academic key.
- `type`: canonical lowercase `pre` or `post` in generated links; service sends uppercase to internal normalization only where needed.
- Optional `attemptId` query: server-issued positive ID used for refresh continuity. It is never treated as authorization or assessment identity.

### 7.3 Direct access and refresh

1. Validate route syntax locally to avoid malformed requests.
2. Call exact-classroom discovery.
3. Treat discovery assessment ID/type/lesson as canonical.
4. If an optional `attemptId` equals `activeAttemptId`, load the active attempt.
5. If it equals discovery's `latestSubmittedAttemptId`, load the result.
6. Otherwise remove/ignore it and follow discovery state.
7. Cross-check every loaded assessment graph against the discovery ID, lesson key, and type; fail closed on mismatch.

Wrong-classroom and inactive membership errors use a generic unavailable state. Locked routes show the safe backend reason and return navigation. Refresh of an active attempt restores persisted selections and attempt order from the server.

## 8. Player UX

`AssessmentPlayer` renders one server-ordered question per page.

Header:

- PRE diagnostic or POST mastery label;
- assessment title;
- optional instructions;
- attempt number, using “Additional attempt” when a teacher recovery exceeds configured ordinary attempts;
- question `n of total` progress.

Question body:

- question text in a `<legend>`;
- `MULTIPLE_CHOICE` and `TRUE_FALSE` both use a semantic radio group;
- choice IDs are values internal to the event handler, never displayed;
- points may be displayed as server-provided workload information, but the UI never sums them or derives a score;
- objective keys remain undisplayed implementation metadata;
- saved choice restoration is driven by server responses.

Navigation:

- Previous and Next buttons;
- a question navigator/review list showing answered versus unanswered only;
- selecting an answer triggers immediate queued save;
- navigation may continue while a save is pending, but persistent save state remains visible;
- submit is reached through a final review screen, not directly from a choice click;
- unanswered questions are allowed by the backend but require explicit confirmation.

No correctness, explanation, pass/fail, or grading feedback appears while active.

## 9. Autosave and concurrency

### 9.1 Strategy

Use optimistic selection with immediate, per-question serialized persistence. Radio selection is infrequent, so no debounce is needed.

For each question the coordinator tracks:

- latest desired choice ID;
- monotonically increasing local revision;
- one in-flight PUT at most;
- last acknowledged revision and choice;
- pending, saved, or failed status.

If a student changes a choice while a PUT is in flight, the coordinator does not send a parallel request. After the first request settles, it sends the newest desired choice if it differs. This prevents an older same-tab request from arriving after a newer one and overwriting it.

The UI updates selection immediately and announces “Saving”, “Saved”, or “Save failed — retry”. Failed saves remain dirty. Submit waits for all queues to flush and is blocked while any response remains failed. A `beforeunload` warning is installed only while unsaved/failed work exists.

Retries send the same selected choice and are safe because PUT is replacement semantics. Refresh discards unsaved local guesses and restores server responses.

### 9.2 Multiple tabs

The backend has no response revision token, so cross-tab writes are last-commit-wins. Phase F cannot promise merge semantics.

V1 behavior:

- Use `BroadcastChannel` when available, scoped by attempt ID, to announce successful saves and submission.
- A receiving tab with no dirty save refetches the active attempt and announces that answers were refreshed.
- A receiving tab with dirty work first surfaces a conflict banner and requires a server refresh before further submission.
- On window focus or visibility regain, refetch the active attempt when no save is pending.
- If another tab submits, a stale PUT receives `ATTEMPT_ALREADY_SUBMITTED`; transition by fetching the result.
- If duplicate submit keys differ across tabs, the losing tab handles the conflict by fetching the result.
- Backend state always wins; the frontend never marks an attempt submitted solely from a broadcast message.

True cross-device stale-write prevention would require backend conditional response versions and is classified Important, not blocking for V1.

### 9.3 Submission idempotency

Generate one `crypto.randomUUID()` per attempt and store it in `sessionStorage` under an attempt-scoped key. UUID hyphens satisfy the header pattern. Reuse the same key for network retries and double-click recovery. Disable the submit action while its request is active. A new attempt receives a new key. No answer, score, graph, or result is stored in browser storage.

## 10. PRE behavior

PRE is always diagnostic:

- one ordinary attempt;
- no passing threshold and no `passed` field;
- submission satisfies the diagnostic requirement;
- low score is never framed as failure;
- no XP, correctness reward, or punishment;
- required PRE gates module/game through Phase D, not React.

Result wording:

- Primary heading: “Diagnostic complete”.
- Supporting text: “Your starting point has been recorded. This helps show your learning progress after the lesson.”
- If score is visible, show the returned percentage and points neutrally as baseline information.
- If score is hidden, show completion only.
- Never show “failed”, red failure treatment, or retake affordance.
- Render answer review only when the backend returns `reviewAvailable: true`.

After submission, refresh exact-classroom progression. Offer “Continue to module” only when the returned lesson has `moduleUnlocked: true`; otherwise offer the safe return action supplied by progression context.

## 11. POST behavior

POST access remains backend-gated until the required game progression is complete. The frontend uses canonical progression for policy-specific result states:

| State | Condition | Primary actions |
| --- | --- | --- |
| PASS | `postPassingRequired && postPassed` | Continue according to progression; return to map |
| NOT PASSED — RETAKES AVAILABLE | passing required, not passed, `postAttemptsRemaining > 0`, no active attempt | Retake; return to map |
| NOT PASSED — ATTEMPTS EXHAUSTED | passing required, not passed, `postAttemptsExhausted` | Return to map; explain teacher recovery without promising it |
| COMPLETED — PASSING NOT REQUIRED | `postCompleted && !postPassingRequired` | Continue according to progression; return to map |
| RESUME POST | `postAttemptInProgress` | Resume the server active attempt |

The result's `passed` boolean is server authoritative, including when scores are hidden. The official grade is the highest POST. Learning gain uses the first submitted POST and must be labelled accordingly; the UI must not subtract percentages itself.

Retake starts through the same POST start endpoint. Previous attempts remain immutable and are never overwritten. When teacher recovery creates an active attempt after ordinary exhaustion, discovery and start/resume remain authoritative.

## 12. Result behavior

`AssessmentResult` is reusable but takes an explicit PRE/POST presentation mode.

Common fields:

- attempt number and submitted timestamp;
- attempt usage from `attempts`;
- numeric score only when `result.scoreVisible` and fields are present;
- answer review only when `reviewAvailable` and `review` are present;
- canonical navigation from the refreshed progression response.

PRE presentation:

- diagnostic completion;
- optional baseline score;
- no pass/fail language;
- no retake.

POST presentation:

- passed state even if numeric score is hidden;
- latest viewed attempt score from `result` when visible;
- official highest score from `officialGrade` when present;
- first POST labelled “Learning-gain comparison attempt” when present;
- backend-supplied learning-gain label when present;
- retake/exhaustion determined from canonical progression, not arithmetic in React.

When review is allowed, join review entries to the safe graph by question and choice ID. Render only returned grading fields. Missing explanation stays absent. A missing choice ID is “Unanswered”, not an inferred incorrect choice. If graph labels cannot be loaded on a revisit, show a bounded correctness summary by question number rather than exposing or guessing content.

## 13. Visibility and review policy

Actual persisted enum values are:

- `NEVER`
- `AFTER_SUBMISSION`
- `AFTER_FINAL_ATTEMPT`

The frontend never receives the enum in player DTOs. It reacts only to `reviewAvailable`.

Backend semantics:

- `NEVER`: no review, including after exhaustion.
- `AFTER_SUBMISSION`: review is available after that attempt is submitted.
- `AFTER_FINAL_ATTEMPT`: review is available only when submitted attempts are at least `maxAttempts` and no active attempt exists.
- A teacher-granted recovery attempt temporarily hides final-attempt review while it is active and makes review available again after submission.

Score policy:

- `scoreVisible: true`: show only returned score/comparison fields.
- `scoreVisible: false`: do not sum points, count review correctness, calculate percentages, derive thresholds, or show official/first/gain placeholders.
- POST `passed` remains displayable because the backend intentionally exposes it.
- PRE diagnostic completion remains displayable.

## 14. Error and empty states

| UI state | Trigger | Behavior |
| --- | --- | --- |
| Loading | Discovery/attempt/result request active | Accessible status; no prior graph remains visible |
| Not available | Discovery `available: false` | Explain no published assessment is available; return action |
| Prerequisite locked | Discovery lock reason or 403 code | Explain previous lesson requirement without assessment details |
| PRE required | 403 `PRE_ASSESSMENT_REQUIRED` | Link to routed PRE when assessment ID/context is valid |
| POST locked | `GAME_INCOMPLETE` or `POST_ASSESSMENT_LOCKED` | Return to lesson map/game |
| Wrong classroom/inactive membership | Generic 403 | Generic unavailable message; no existence disclosure |
| Unauthorized role | Route guard or 403 | Return to role home/sign-in as appropriate |
| No active attempt | Stale active ID/404 | Rediscover; offer start only if discovery permits |
| Attempts exhausted | `MAX_ATTEMPTS_REACHED` | Rediscover and show result/exhausted state |
| Already submitted | `ATTEMPT_ALREADY_SUBMITTED` | Fetch result, never retry save |
| Save failure | Network/5xx | Keep dirty selection visibly unsaved; retry; block submit |
| Submit failure | Network/5xx | Keep stable idempotency key; allow retry |
| Version conflict | `ASSESSMENT_VERSION_CONFLICT` | Fail closed; return/refresh; do not merge graphs |
| Invalid question/choice | 400 validation code | Refetch active attempt; report safe synchronization error |
| Malformed direct URL | Local validation failure | Do not issue API call; show invalid assessment link |
| Server invalid graph | 422 | Unavailable/support state; do not render partial graph |

Every route-context change immediately clears prior assessment content, aborts requests, increments the request generation, and renders loading. Stale responses cannot repopulate a different classroom, lesson, type, or attempt.

## 15. Navigation

After submit, the page remains on the result so the student can read it.

Canonical actions derive from the exact-classroom progression response:

- `TAKE_PRE` / `RESUME_PRE`: current lesson PRE route.
- `PLAY_GAME`: lesson map route; Phase G will select the exact region/node.
- `TAKE_POST` / `RESUME_POST` / `RETRY_POST`: current lesson POST route.
- `POST_RECOVERY_REQUIRED`: return to map with explanatory text.
- `COMPLETE_PREREQUISITE_LESSON`: return to map/lesson list; Phase G will deep-link the prerequisite.
- `LESSON_COMPLETE`: acknowledge completion and return to map/lessons.

For PRE, “Continue to module” uses:

```text
/lesson/built-in/:lessonKey?classroomId=:classroomId
```

and is rendered only when canonical `moduleUnlocked` is true. The module endpoint independently reauthorizes access.

Phase F may preserve `classroomId` in map query strings, but LessonMap/GamePage interpretation and automated PRE/module/game/POST transitions are deferred to Phase G.

## 16. Component architecture

Recommended frontend units:

| File | Responsibility |
| --- | --- |
| `pages/student/assessment/AssessmentPage.jsx` | Thin route orchestrator, request lifecycle, service calls, reducer dispatch, authoritative refresh |
| `pages/student/assessment/AssessmentPlayer.jsx` | Header, one-question flow, navigation, save status, review-entry transition |
| `pages/student/assessment/AssessmentQuestion.jsx` | Semantic fieldset/radio rendering for MCQ and TRUE_FALSE |
| `pages/student/assessment/AssessmentSubmitReview.jsx` | Answered/unanswered summary and accessible confirmation dialog |
| `pages/student/assessment/AssessmentResult.jsx` | PRE/POST policy-aware result presentation using only returned fields |
| `pages/student/assessment/AssessmentStatusView.jsx` | Loading, locked, unavailable, and safe error states |
| `pages/student/assessment/assessmentPlayerState.js` | Pure reducer, route validation, stale-generation rules, result classification |
| `pages/student/assessment/assessmentSaveQueue.js` | Per-question single-flight save coordination and flush semantics |
| `pages/student/assessment/AssessmentPage.module.css` | Responsive, focus-visible, non-color-only styling |
| `services/studentAssessmentService.js` | Seven assessment operations plus exact progression refresh and normalized errors |

`AssessmentPage` owns effects but not markup-heavy question/result details. Presentational components receive callbacks and DTOs. API code never lives in question components. The reducer contains no Axios calls and no grading logic.

## 17. Frontend state model

Use one reducer with a small screen state and orthogonal operation metadata.

Screens:

- `loading`
- `ready`
- `active`
- `result`
- `locked`
- `unavailable`
- `error`

Orthogonal fields:

- `routeKey` and `requestGeneration`
- `discovery`
- `assessment`
- `attempt`
- `selectedByQuestion`
- `currentQuestionIndex`
- `saveStateByQuestion`
- `submitReviewOpen`
- `submitStatus`
- `result`
- `progression`
- normalized `error`

Core events:

- `ROUTE_CHANGED`
- `DISCOVERY_SUCCEEDED` / `DISCOVERY_FAILED`
- `START_REQUESTED` / `ATTEMPT_LOADED`
- `CHOICE_SELECTED`
- `SAVE_STARTED` / `SAVE_SUCCEEDED` / `SAVE_FAILED`
- `QUESTION_CHANGED`
- `SUBMIT_REVIEW_OPENED` / `SUBMIT_REVIEW_CLOSED`
- `SUBMIT_STARTED` / `SUBMIT_SUCCEEDED` / `SUBMIT_FAILED`
- `RESULT_LOADED`
- `PROGRESSION_REFRESHED`
- `SERVER_STATE_INVALIDATED`

Invariants:

- Only actions matching the current route key and generation can mutate state.
- `active` requires a server `IN_PROGRESS` attempt and matching graph.
- Selected choice IDs must occur in the current safe question graph before being queued.
- A save acknowledgment marks a question saved only if it matches the latest local revision.
- Submit cannot begin until all saves are acknowledged and no save has failed.
- `result` requires a server result envelope; the reducer never constructs one.
- Route change removes the prior graph, selections, review keys, and result immediately.
- The reducer does not duplicate backend attempt status or Phase D transition rules.

## 18. Accessibility and responsive design

- Each question is a `<fieldset>` with its text in `<legend>`.
- Choices are native radios sharing an attempt/question-specific name.
- Labels provide at least 44-by-44-pixel tap targets.
- Question position and save status use polite live regions.
- Network/save errors use an error summary with programmatic focus.
- Next-question navigation focuses the new question heading/legend.
- The final confirmation has `role="dialog"`, `aria-modal="true"`, labelled title/description, initial focus, focus containment, Escape handling, and focus restoration.
- Pass, not-passed, exhausted, saved, and error states include text/icons; color is never the only signal.
- Visible `:focus-visible` styles match existing SharpRunner blue focus treatment.
- Desktop uses a constrained reading column with a progress/sidebar summary; tablet/mobile collapse to one column.
- Long question/choice/instruction text wraps without horizontal page scrolling.
- Reduced-motion preferences disable nonessential transitions.
- Loading state uses `role="status"`; blocking errors use `role="alert"`.

No accessibility claim depends on an uninstalled test library. Pure/SSR tests assert semantic markup; keyboard and focus behavior receive a documented manual browser checklist until the project adopts a DOM interaction runner.

## 19. Security threat model

| Threat | Existing backend enforcement | Phase F responsibility |
| --- | --- | --- |
| Answer-key leakage before submission | Player serializers omit correctness, explanation, grading configuration | Use student service only; recursive forbidden-key fixture; never log/cache graphs persistently |
| Manipulated choice ID | Save verifies choice belongs to question | Send only canonical ID from current graph; normalize `INVALID_CHOICE` |
| Answer submitted for another question | Attempt order and assessment membership are validated | Bind handlers to server question ID; never trust DOM name/value alone |
| Attempt IDOR | Owner plus current membership checks | Treat URL attempt ID as a hint; confirm against discovery; generic forbidden UI |
| Classroom IDOR | Exact active membership before discovery; attempt carries persisted classroom | Keep classroom explicit and encoded; never substitute primary identity silently |
| Submitted-attempt mutation | Backend rejects with 409 | Stop queues and transition to result on immutable conflict |
| Client score tampering | Server calculates/persists result | No client grading or completion mutation |
| Client attempt-count tampering | Backend locks/counts attempts | Display server counts only; start endpoint decides eligibility |
| Direct PRE/POST gate bypass | Graph/start/get/save/submit apply Phase D gate | Route visibility is convenience only; render backend lock responses |
| Stale tab | Attempt lock and submitted immutability; no response revision | Single-flight same-tab saves, focus refresh, broadcast invalidation, conflict recovery |
| Hidden-score reconstruction | Serializer omits score/comparison fields | Never sum points or correctness; presence-check all fields |
| Cross-site script through content | React text escaping | No raw HTML/Markdown execution |
| Replay/duplicate submit | Required idempotency key and immutable attempt | Stable per-attempt key; disable duplicate click; same-key retry |

## 20. Performance and request flows

There is no per-question GET. One graph and one response list arrive with start/resume. PUT count is bounded by actual answer changes. Result performs backend set queries, not N+1 reads.

### 20.1 First PRE attempt

1. `GET` discovery.
2. `POST` start (`201`) returning ordered graph.
3. One serialized `PUT` per changed response.
4. `POST` submit with stable key, returning result.
5. `GET /api/progress/me?classroomId=...` once after commit.

### 20.2 Resumed PRE

1. `GET` discovery.
2. `GET` `activeAttemptId`, returning graph and saved selections.
3. Changed-response PUTs, submit, then one progression refresh.

### 20.3 First POST

Same as first PRE. Discovery returns `GAME_INCOMPLETE` without starting when locked.

### 20.4 POST retake

1. `GET` discovery.
2. Optional `GET` latest result only when the result view is requested.
3. `POST` start for the next attempt.
4. Changed-response PUTs, submit, then one progression refresh.

### 20.5 Result revisit

1. `GET` discovery.
2. `GET` the `latestSubmittedAttemptId` result.
3. In parallel after authorization, `GET` exact progression.
4. Only when `reviewAvailable` and the graph is not in memory, `GET` player-safe graph once to label review IDs.

The page must not call both `GET /:assessmentId` and start/resume for initial play. It must not poll progression, refetch result after a successful submit response, or send parallel saves for one question.

## 21. Test matrix

All implementation follows RED → GREEN. Tests use Node's test runner and existing Vite SSR conventions without adding dependencies.

### 21.1 API service

- Builds exact encoded discovery URL.
- Fetches player graph.
- Starts with exactly `{}` and returns new/resumed status.
- Loads active attempt.
- Saves positive choice ID and `null` only.
- Submits exactly `{}` with one stable `Idempotency-Key`.
- Loads result.
- Loads explicit-classroom progression.
- Forwards AbortSignal to every request.
- Normalizes cancellation distinctly.
- Normalizes status/code plus flattened safe details.
- Replaces 5xx/internal messages with a generic message.

### 21.2 Reducer and route helpers

- Valid and malformed classroom/lesson/type/attempt parsing.
- Route change clears every prior graph/result immediately.
- Stale discovery, attempt, save, result, and progression actions are ignored.
- Discovery selects ready, active, result-summary, locked, or unavailable.
- Resume restores choices by ID without reordering.
- Question navigation clamps indices and preserves selection.
- Choice selection increments only the target revision.
- Latest revision alone becomes saved.
- Failed save remains dirty and blocks submit.
- Confirmation open/close and unanswered confirmation.
- Submitted conflict invalidates active state and requests result.

### 21.3 Save queue

- One in-flight save per question.
- Rapid A→B selection persists A then latest B, never in parallel.
- Retry sends latest desired value.
- `null` clear is persisted.
- `flushAll` waits for all queues.
- Failure rejects flush and preserves dirty state.
- Disposal prevents late callbacks after route change.
- Submission/immutable conflict stops pending follow-up saves.

### 21.4 Player rendering

- MCQ and TRUE_FALSE use fieldset, legend, radio, and label semantics.
- Exactly one question body is rendered per page.
- Server order is preserved; browser does not shuffle.
- Saved answer is checked after resume.
- Progress and save status have accessible announcements.
- Previous/next and review navigation expose clear labels.
- Unanswered review is textual and non-color-only.
- Pre-submit fixture recursively contains no correctness/review keys.
- Long text/mobile class structure remains bounded.

### 21.5 PRE

- Diagnostic completion never renders fail wording.
- Visible score is neutral baseline information.
- Hidden score renders no numeric placeholder or derived total.
- No retake action.
- Continue-to-module requires authoritative `moduleUnlocked`.
- Review appears only when returned.

### 21.6 POST

- Passed state.
- Not passed with retakes available.
- Not passed and exhausted.
- Passing-not-required completed state.
- Active recovery attempt resume.
- Official highest and latest viewed attempt are labelled separately.
- First POST and supplied learning gain are not recalculated.
- Hidden score still renders server `passed` without numeric fields.

### 21.7 Security and conflicts

- Malicious choice ID is not accepted into client state and backend 400 is normalized.
- Direct locked route never renders a graph.
- Wrong classroom and foreign attempt use generic unavailable UI.
- Save after submit transitions to result recovery.
- Duplicate submit uses one key; different-key conflict fetches result.
- No localStorage persistence of graph, selections, review, or result.
- Review grading keys are absent when `reviewAvailable` is false.

### 21.8 Backend contract closure tests

- `/api/progress/me` without query remains byte-shape compatible.
- Explicit classroom requires exact current membership and uses its settings/assessments.
- Multiple memberships cannot substitute the primary classroom.
- Invalid explicit classroom ID is rejected before data reads.
- Discovery exposes only the current student's latest submitted attempt ID.
- Hidden score still exposes the safe attempt ID but no numeric score.
- Unavailable/no-submission discovery returns `latestSubmittedAttemptId: null`.
- Former membership cannot use the ID to retrieve a result.

### 21.9 Full regression

- Focused assessment player command.
- Complete frontend `npm test`.
- Frontend lint and build.
- Phase E source and dist protected-content audits.
- Complete backend `npm test`.
- `git diff --check` and exact scope audit.

## 22. Backend gaps

### 22.1 RESOLVED IN F-A — exact-classroom progression projection

**Evidence:** `/api/progress/me` calls `findPrimaryActiveMembership`; the model and `/api/classrooms/me` support multiple active classroom memberships. Phase F's route must carry an explicit classroom, and required result/navigation states need `moduleUnlocked`, `postPassingRequired`, `lessonCompleted`, and `nextAction` for that exact classroom.

**Implemented fix:** Added optional `?classroomId=` to the existing progress endpoint with strict parsing and `requireExactActiveMembership`. No-query behavior remains unchanged, and the exact authorized membership is passed through the existing bounded Phase D progression path.

**Resolution evidence:** Focused HTTP tests cover primary/no-query compatibility, two explicit active memberships, non-member/former/inactive-classroom denial, malformed IDs, exact progression fields, and fixed query counts.

### 22.2 RESOLVED IN F-A — durable submitted-result identity

**Evidence:** Discovery knows `latestSubmitted.id` internally but omits it. Result retrieval requires an attempt ID. After a result-page refresh or later entry, the browser cannot retrieve the detailed result/review from current contracts.

**Implemented fix:** Added `status.latestSubmittedAttemptId` from the discovery path's already-loaded canonical latest submitted attempt, independent of score visibility. It is `null` when no submitted attempt exists, and all numeric visibility rules remain unchanged.

**Resolution evidence:** Focused serializer and HTTP tests cover PRE, POST retakes, an active newer attempt, hidden and visible scores, recursive leak checks, and authorized discovery-to-result revisit with owner and current-membership enforcement.

### 22.3 IMPORTANT — cross-tab conditional response writes

**Evidence:** Response PUT has replacement semantics but no revision/ETag. Attempt locking serializes writes but cannot distinguish an older tab's later write.

**Recommendation:** Use the frontend mitigation in V1. Consider an attempt/response revision in a later backend phase if cross-device concurrent editing must be loss-detecting.

**Consequence:** Last committed response wins across tabs/devices until submit. This does not permit grading or authorization bypass.

### 22.4 IMPORTANT — attempts-remaining semantic mismatch

**Evidence:** Discovery subtracts submitted attempts; the active envelope additionally reserves the active attempt. The same field name therefore has two contexts.

**Recommendation:** Normalize to distinct frontend names and document labels. A future API version can rename them.

### 22.5 OPTIONAL — self-contained review labels

**Evidence:** Result review omits question and choice text, though the serializer computes question text before the read service projects it away.

**Recommendation:** Do not expand the result in Phase F. Reuse the player-safe graph only when review is allowed and not already cached. Consider a self-contained safe review DTO later if request volume becomes material.

### 22.6 OPTIONAL — correct/question counts

**Evidence:** HTTP results omit `correctCount` and `questionCount`.

**Recommendation:** Do not show them. No backend change is justified for V1.

No schema or migration gap was found.

## 23. Exact proposed file inventory

### 23.1 Add

- `frontend/src/services/studentAssessmentService.js`
- `frontend/src/services/studentAssessmentService.test.js`
- `frontend/src/pages/student/assessment/AssessmentPage.jsx`
- `frontend/src/pages/student/assessment/AssessmentPlayer.jsx`
- `frontend/src/pages/student/assessment/AssessmentQuestion.jsx`
- `frontend/src/pages/student/assessment/AssessmentSubmitReview.jsx`
- `frontend/src/pages/student/assessment/AssessmentResult.jsx`
- `frontend/src/pages/student/assessment/AssessmentStatusView.jsx`
- `frontend/src/pages/student/assessment/AssessmentPage.module.css`
- `frontend/src/pages/student/assessment/assessmentPlayerState.js`
- `frontend/src/pages/student/assessment/assessmentPlayerState.test.js`
- `frontend/src/pages/student/assessment/assessmentSaveQueue.js`
- `frontend/src/pages/student/assessment/assessmentSaveQueue.test.js`
- `frontend/src/pages/student/assessment/AssessmentPage.render.test.mjs`

### 23.2 Modify

Frontend:

- `frontend/src/App.jsx` — lazy student route only.
- `frontend/package.json` — focused test command and aggregate registration only; no dependency change.

Approved Checkpoint F-A backend contract closure:

- `backend/src/routes/progress.js` — optional exact-classroom query and membership selection.
- `backend/src/services/assessmentSerializationService.js` — safe latest submitted attempt ID.
- `backend/test/lessonProgressionRoutes.integration.test.js` — exact-classroom query regression.
- `backend/test/assessmentSerialization.test.js` — ID allowlist/hidden-score regression.
- `backend/test/assessmentRoutes.integration.test.js` — HTTP discovery and former-member regressions.

### 23.3 Explicitly unchanged

- `backend/src/models/**`
- `supabase/migrations/**`
- grading and scoring policy services
- attempt locking/idempotency implementation
- `frontend/src/pages/map/LessonMapPage.jsx`
- `frontend/src/pages/game/GamePage.jsx`
- game scenes and level validators
- XP, hints, and rewards
- teacher assessment builder and teacher analytics
- `backend/src/data/builtInLessonContent.v1.json`
- Phase E source/dist leak scanner
- protected module renderer/content service
- package lockfiles and dependencies

## 24. Implementation checkpoints

These checkpoints are design boundaries, not authorization to implement. Execute sequentially after the specification and a later implementation plan are approved.

### F-A — Close approved backend contracts

**Files:** `backend/src/routes/progress.js`, `backend/src/services/assessmentSerializationService.js`, and the three backend tests listed above.

**RED:** Exact-classroom progress query fails; discovery lacks safe latest attempt ID; hidden-score and former-member regressions assert no extra leakage.

**Implementation:** Add strict optional classroom selection using the existing exact membership helper; add only `latestSubmittedAttemptId` to discovery status.

**GREEN:** Focused progression/assessment tests, then full backend suite.

**Stop conditions:** Any need for model/migration change, weakening exact membership, exposure of grading keys, or change to primary no-query semantics.

### F-B — Student API service and pure state primitives

**Files:** Add service, reducer, save queue, and their unit tests; modify `frontend/package.json` for the focused command.

**RED:** URL/body/header, AbortSignal, normalization, route reset, stale generation, save serialization, and submit-flush tests.

**Implementation:** Axios service, normalized safe error class, reducer helpers, and injectable single-flight save coordinator.

**GREEN:** `npm run test:assessment-player`.

**Stop conditions:** Need for client grading, persisted answer data, or parallel same-question saves.

### F-C — Route shell, discovery, start, and resume

**Files:** Add `AssessmentPage`, `AssessmentStatusView`, CSS, render test; modify `App.jsx`.

**RED:** Protected route declaration, malformed route, loading/unavailable/locked states, new start, active resume, refresh, and stale route response tests.

**Implementation:** Class-scoped route orchestration with AbortController and request generations. No question interaction yet.

**GREEN:** Focused service/state/render tests, lint.

**Stop conditions:** Any direct use of teacher DTO, primary classroom substitution, or question graph from discovery.

### F-D — Question player and autosave

**Files:** Add `AssessmentPlayer`, `AssessmentQuestion`, and `AssessmentSubmitReview`; extend reducer/render tests and CSS.

**RED:** MCQ/TRUE_FALSE semantics, one-question view, saved restoration, unanswered review, pending/error states, navigation flush, and rapid selection ordering.

**Implementation:** Presentational controls plus save queue integration. No result logic.

**GREEN:** Focused test command and lint.

**Stop conditions:** Browser reshuffle, answer-key field in active fixtures, or submit permitted with failed saves.

### F-E — Submission and results

**Files:** Add `AssessmentResult`; extend page/service/state/render tests.

**RED:** Stable idempotency key, duplicate click, network retry, immutable conflict recovery, PRE neutral result, POST pass/retry/exhausted/optional states, hidden-score absence, and answer-review policy.

**Implementation:** Confirmation, flush-before-submit, result display, detailed revisit, and exact progression refresh.

**GREEN:** Focused test command, frontend test suite, backend focused contract tests.

**Stop conditions:** Any locally calculated pass, gain, official grade, remaining attempts, or lesson completion.

### F-F — Accessibility, responsive, and stale-tab hardening

**Files:** Assessment components/state/CSS/tests only.

**RED:** Semantic controls, live status, error focus targets, dialog labelling, non-color wording, route reset, broadcast invalidation, focus refresh, and submitted-tab recovery.

**Implementation:** Focus management, responsive layout, BroadcastChannel enhancement, beforeunload dirty guard, and manual keyboard checklist.

**GREEN:** Focused tests, lint, build, manual narrow/wide viewport and keyboard verification.

**Stop conditions:** New dependency required, unsupported browser feature without fallback, or security authority moved to the client.

### F-G — Full regression and review boundary

**Files:** No planned production additions; test/doc corrections only if verification finds a defect.

**Verification:** Focused Phase F tests, complete frontend `npm test`, lint, build, Phase E source/dist audits, complete backend `npm test`, `git diff --check`, status and exact scope audit.

**Stop conditions:** Any Phase G map/game integration, model/migration change, protected content leakage, dependency/lockfile change, or unrelated artifact.

## 25. Risks and open questions

### 25.1 Risks already resolved by the design

- A route with only assessment ID was rejected because it loses explicit classroom context.
- Separate PRE and POST players were rejected because their mechanics and safe DTO are the same.
- Debounced parallel autosave was rejected because radio changes are low volume and stale writes are harder to control.
- Client grading and progression inference were rejected because they conflict with Phases B and D.
- Browser persistence of answers/results was rejected because the server already supports resume and browser caches increase exposure/staleness.
- Broad LessonMap/GamePage changes were deferred to Phase G.

### 25.2 Approved decision 1 — exact-classroom progression

**Repository evidence:** `/api/progress/me` selects the newest active membership, while a student may have multiple active memberships and the Phase F route must carry one exact classroom.

**Decision:** Approved and implemented backward-compatible `GET /api/progress/me?classroomId=:id` behavior with exact active-membership validation.

**Alternatives:** Restrict Phase F to the primary classroom, or infer result/navigation state from assessment responses.

**Consequences:** The recommendation preserves one progression projection and supports every exact classroom. Primary-only behavior violates the routing requirement. Client inference duplicates Phase D and can be wrong.

### 25.3 Approved decision 2 — submitted result revisit

**Repository evidence:** Discovery has the latest submitted attempt object internally but omits its ID; detailed result and answer review require an attempt ID.

**Decision:** Approved and implemented `status.latestSubmittedAttemptId` in discovery for the authenticated exact-classroom student, regardless of score visibility.

**Alternatives:** Support detailed results only immediately after submit/while the URL is preserved, or add a larger attempt-list endpoint.

**Consequences:** The recommendation is the smallest status-only extension and retains result authorization. Immediate-only behavior fails durable revisit. A list endpoint is unnecessary data and scope.

### 25.4 Approved decision 3 — V1 stale-tab policy

**Repository evidence:** Response PUT has no conditional revision, so backend row locking provides serialization but not stale-write detection across tabs/devices.

**Decision:** V1 accepts last-commit-wins for concurrent unsubmitted response edits. No response revision, conditional PUT, model field, or migration is added. Later frontend checkpoints provide single-flight same-tab saves, focus refetch, BroadcastChannel invalidation, and immutable-submit recovery.

**Alternative:** Add response/attempt revisioning and conditional PUT before the player ships.

**Consequences:** The recommendation requires no schema change and is safe for grading/authorization, but a stale tab can replace an unsubmitted answer. Conditional revisioning is stronger but expands backend/schema scope beyond the approved Phase F boundary.
