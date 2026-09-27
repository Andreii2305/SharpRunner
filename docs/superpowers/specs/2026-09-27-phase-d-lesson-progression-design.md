# Phase D Central Lesson Progression and Assessment Gating - Design Specification

**Status:** Architecture approved; review decisions resolved; implementation plan proposed separately

**Date:** 2026-09-27

**Scope:** Backend lesson-progression state and server-enforced PRE/game/POST gates

**Out of scope:** Phase E protected built-in content delivery, Phase F assessment player UI, Phase G map/game transitions, Phase H teacher builder UI, Phase I analytics UI, and any Phase B/C grading or persistence redesign

## 1. Repository baseline

The design audit was performed against the actual committed repository, not only the Phase B/C design documents.

| Check | Result |
|---|---|
| Branch | `main` |
| HEAD | `ce27e4e91f97e079f7b8c09aebc0d7fe5f97bcad` (`feat: add secure lesson assessment APIs`) |
| Phase B commit | `bc50d8a65779f2ea3d4cc408dc255bb2269bb0e1` (`feat: add lesson assessment domain and grading foundation`) |
| Local versus `origin/main` | `0 0` from `git rev-list --left-right --count`; live `git ls-remote` also resolved `origin/main` to the HEAD above |
| Worktree before this specification | Clean; `git status --short` and the index were empty |

Phase B added the assessment schema, models, grading/policy logic, attempt concurrency, submission idempotency, and migrations. Phase C added the student and teacher APIs, exact-class authorization, separate serializers, review-policy enforcement, teacher mutation locking, and API/security tests. Phase D must reuse those committed services and models.

No repository discrepancy blocked design work.

## 2. Current progression architecture

### 2.1 Persisted progress and curriculum constants

`UserProgress` is keyed uniquely by `(userId, levelKey)`. It stores game-level progress, completion, score, timing, attempt, hint, and XP-award data. It is **not classroom-scoped**. A student's game progress therefore follows that account across classroom memberships.

`ClassroomLessonProgress` is a separate model keyed by `(classroomId, lessonId, studentId)`. It records viewed/completed timestamps for teacher-authored `ClassroomLesson` content. It is not the built-in academic curriculum progression model and must not be reused for Phase D.

`backend/src/constants/progressDefaults.js` defines:

| Lesson | Default progress rows | Playable route keys |
|---|---:|---:|
| Tutorial | 5 | 5 |
| Arrays | 8 | 8 |
| Functions and Methods | 12 | 11 |
| Functions with Arrays | 4 | 4 |
| Final challenge | 1 | 1 |

The Functions discrepancy is intentional: `functions-level-11` represents the final game scene covering curriculum levels 11 and 12. `functions-level-12` is a legacy/default progress row and is not a playable route key. Phase D game-completion calculations must use `PLAYABLE_LEVEL_KEYS`, never the raw default-row count, so Functions requires 11 playable completions.

`ensureProgressRowsForUser` creates all 30 default rows. `progress.js` then builds its active rows from classroom settings, whose defaults contain only the 29 playable keys. This is why the current `/api/progress/me` response ordinarily reports 11 Functions levels despite the stored twelfth row.

### 2.2 Classroom context

The progress router uses authentication plus `requireActiveClassMembership`. Individual operations then call `findPrimaryActiveMembership`, which selects the most recently joined/updated active membership whose classroom is active. Level APIs do not accept an explicit classroom ID.

By contrast, Phase C assessment discovery accepts an explicit classroom ID and verifies membership against that exact classroom. Assessment attempts also persist `classroomId`.

Phase D will not invent classroom-scoped game progress or change this existing route contract. For `/api/progress/me` and level operations, the server-selected primary membership is the exact classroom context. The response will expose that selected `classroomId`. All assessment state joined into that response must be queried only for that exact classroom. A foreign or inactive membership cannot contribute assessment state.

The account-global `UserProgress` versus classroom-scoped assessment distinction is a known architectural limitation, not something Phase D can eliminate without a migration and a larger product decision.

### 2.3 Current level access

`getStudentLevelAccess` currently loads:

1. the primary active membership;
2. all classroom level settings;
3. all of the student's `UserProgress` completion flags;
4. an optional per-student due-date extension for the target level.

`evaluateStudentLevelAccess` applies these rules in order:

1. an already-completed level is permanently replayable;
2. a disabled level is denied;
3. the previous enabled setting in global `displayOrder` must be complete;
4. a future `unlockAt` denies access;
5. an expired effective deadline denies access;
6. otherwise access is allowed.

The first level of a lesson is therefore currently unlocked by completion of whichever enabled level immediately precedes it in global classroom display order. There is no assessment gate.

Later levels use that same previous-enabled-level rule. Teacher enable/disable, display order, schedules, deadlines, and student extensions participate in access.

### 2.4 Backend-authoritative game boundaries

The following `/api/progress/level/:levelKey` operations call the level-access service before meaningful game access or mutation:

- `POST /start`
- `POST /heartbeat`
- `POST /end`
- `POST /attempt`
- `POST /hint-use`
- `POST /detailed-hint-purchase`
- `PUT /level/:levelKey` for progress/completion
- `GET /content` for the classroom level override

Completion additionally runs server-side source validation and rechecks access before the transaction that locks and completes the `UserProgress` row. XP is awarded only on first persisted completion. The generic `/activity` presence heartbeat and hint-feedback endpoint do not unlock or complete levels.

These backend checks are authoritative. `LevelRoutePage` also reads `/api/progress/me`, but its redirect/locked rendering is only a user-experience layer. A direct game URL cannot successfully start, heartbeat, record attempts, buy/use gated hints, fetch the override, or complete a denied level through the backend.

### 2.5 Current lesson completion inference

`buildProgressSummary(rows)` groups active level rows by lesson and currently sets:

```text
lesson.isCompleted = lesson.completedLevels === lesson.totalLevels
summary.completedLessons = count(lesson.isCompleted)
```

This is game-level completion only. It has no assessment input.

Equivalent game-completion assumptions also appear in:

- `teacherAnalyticsService`, where a curriculum state is completed when completed level rows meet the expected active-level count;
- `LessonSection.jsx`, which treats lesson progress at 100 percent as completed and visually unlocks the next built-in lesson;
- `Dashboard.jsx`, which marks a region done when cleared levels meet its configured total;
- map/game components, which use per-level `isCompleted` for node and continuation state.

The only direct backend callers of `buildProgressSummary` are `progress.js` and `notifications.js`. Notifications use its aggregate game data; they do not currently apply assessment completion.

### 2.6 Module and direct-URL behavior

`/lesson` and `/lesson/built-in/:moduleId` are outside `ProtectedRoute` in `App.jsx`. `BuiltInModulePage` imports content from `frontend/src/builtInModules`, reads/writes quick-check progress in browser `localStorage`, and does not ask the backend for authorization. All module sections can be opened directly. Its CTA navigates to the game but does not create a server-side module-completion record.

`GET /api/lesson-content` returns the built-in seed plus classroom content, and `GET /api/lesson-content/:lessonKey` returns a built-in seed lesson to any authenticated caller. The aggregate seed and the frontend bundle mean the present architecture has no secure content-delivery boundary for built-in modules.

Teacher-authored classroom lessons have their own authenticated placement/membership rules and `ClassroomLessonProgress`. They are not the built-in Arrays/Functions curriculum and remain outside Phase D academic gates.

## 3. Current assessment architecture

### 3.1 Persisted domain and rules

`LessonAssessment` is unique by `(classroomId, lessonKey, type)` and stores publication, requirement, passing, attempt, grading, review, and shuffle settings. `AssessmentAttempt` is classroom- and student-scoped and has indexes for one active attempt, attempt numbering, idempotent submission keys, and result queries.

The committed assessment constants and policy service establish:

- PRE is diagnostic, has one attempt, uses `FIRST`, and has no pass/fail requirement;
- POST defaults to 75 percent, three attempts, `HIGHEST`, and passing required for completion;
- the official POST is the highest submitted percentage, with the earlier submission/attempt winning ties;
- learning gain is first submitted POST percentage minus PRE percentage;
- `AFTER_FINAL_ATTEMPT` review means submitted attempts are at least `maxAttempts` and no active attempt exists.

`ACADEMIC_LESSON_KEYS` currently includes `final` because Phase C permits a final assessment to be authored. That authorability does not require Phase D to apply the ordinary academic PRE/game/POST progression policy to the final challenge.

### 3.2 Functions Phase D must reuse

Phase D must reuse rather than reproduce:

- `assessmentAuthorizationService.requireActiveStudentMembership` for exact classroom membership;
- `assessmentPolicyService.selectOfficialPostAttempt` for the official POST result;
- `assessmentPolicyService.selectFirstSubmittedPostAttempt` and `calculateLearningGain` wherever result composition needs them; progression itself does not recalculate learning gain;
- persisted `AssessmentAttempt.status === SUBMITTED` to determine PRE diagnostic completion and POST submission;
- persisted `passed` from Phase B server grading to determine whether the official POST passed;
- `assessmentAttemptService` for locks, attempt limits, versioning, grading, and submission idempotency;
- Phase C player/discovery serializers so progression never serializes assessment graphs or answer material.

Only published assessments participate in student progression. Draft or unpublished rows are teacher state and are treated as absent by the progression service.

### 3.3 Current API behavior relevant to Phase D

Student assessment discovery is status-only and exact-class scoped. Player graph retrieval and attempt start require publication and exact active membership. Active attempt retrieval, response saving, submission, result, and review use ownership plus exact current membership.

Today, a published POST can be discovered, opened, and started before game completion. Phase D must close that backend gap. The guard must cover player graph retrieval, start/resume, active-attempt retrieval, response saves, and submission; guarding only the initial start would leave pre-Phase-D or concurrently opened active attempts able to continue out of sequence. Submitted result/review reads remain available subject to ownership and exact active membership.

Teacher mutations already lock the assessment row before counting attempts. Once an attempt exists, structural settings are immutable and unpublish/delete are denied. Phase D must not change that lock root or mutation policy.

## 4. Identified integration problems

1. Game completion is currently named and consumed as lesson completion.
2. Assessment and progress data use different classroom scopes: assessments are exact-class; game progress is account-global and level APIs select a primary class.
3. No backend gate connects a required PRE to game access.
4. Published POST graphs and attempts can be opened before game completion.
5. The next lesson can become playable after the prior lesson's last game level even when the prior required POST is incomplete.
6. Built-in module content is frontend-bundled and directly routable; Phase D cannot make it confidential.
7. Built-in module quick-check completion is local-only, so the backend cannot prove that module content was viewed before game play.
8. Functions has 12 rows but only 11 playable keys; raw row counts would deadlock it.
9. Global teacher `displayOrder` can interleave lessons. Phase D resolves the possible cycle by limiting display-order predecessor edges to enabled playable levels within the same lesson; canonical lesson completion owns cross-lesson entry.
10. A mandatory pass-gated POST can exhaust all ordinary attempts. Phase D resolves this with an explicit, one-at-a-time teacher-created recovery attempt that preserves the ordinary cap and attempt history.
11. Existing frontend and analytics consumers still interpret legacy game percentages/counts as lesson completion.
12. A teacher can publish a required assessment after students have game history, so Phase D must define retroactive behavior without deleting that history.

## 5. Canonical Phase D progression state

The authoritative state is derived, not stored. For each lesson it is computed from the exact classroom's published assessments and attempts, the student's existing `UserProgress`, and the classroom's enabled playable-level settings.

The proposed serialized state is:

```json
{
  "lessonKey": "arrays",
  "curriculumPrerequisiteSatisfied": true,
  "prerequisiteLessonKey": "tutorial",
  "preRequired": true,
  "preAssessmentId": 31,
  "preUnlocked": true,
  "preAttemptInProgress": false,
  "preCompleted": true,
  "moduleUnlocked": true,
  "gameUnlocked": true,
  "gameStarted": true,
  "gameCompleted": true,
  "postRequired": true,
  "postAssessmentId": 32,
  "postUnlocked": true,
  "postAttemptInProgress": false,
  "postCompleted": true,
  "postPassingRequired": true,
  "postPassed": false,
  "postAttemptsUsed": 1,
  "postAttemptsRemaining": 2,
  "postAttemptsExhausted": false,
  "assessmentCompleted": false,
  "lessonCompleted": false,
  "nextAction": "RETRY_POST"
}
```

No score, percentage, correct-answer ID, answer-review data, passing threshold, explanation, question graph, or hidden teacher setting appears in this state. `postPassed` remains safe and available even when `showScoreAfterSubmission` is false, consistent with the approved Phase C result contract.

## 6. Exact field semantics

| Field | Exact meaning |
|---|---|
| `lessonKey` | Canonical built-in lesson key. |
| `prerequisiteLessonKey` | Previous lesson in canonical curriculum order, or `null` for tutorial. |
| `curriculumPrerequisiteSatisfied` | The prerequisite lesson's canonical `lessonCompleted` is true. Tutorial is always true. |
| `preRequired` | A published PRE exists and `isRequired` is true for a Phase-D-gated academic lesson. Draft/unpublished/absent PRE is false. |
| `preAssessmentId` | ID of the published PRE, required or optional; otherwise `null`. For tutorial/final Phase D state, `null`. |
| `preUnlocked` | A published PRE exists and the curriculum prerequisite is satisfied. It does not mean submitted. |
| `preAttemptInProgress` | The student has an `IN_PROGRESS` attempt for the published PRE. |
| `preCompleted` | At least one valid PRE attempt is `SUBMITTED`. It describes submission, not requirement satisfaction. |
| `moduleUnlocked` | The curriculum prerequisite is satisfied and the required PRE condition is satisfied. It is authoritative progression state, not a claim that bundled frontend content is secret. |
| `gameUnlocked` | The same lesson-level gate as `moduleUnlocked`. Individual levels must still pass enabled, predecessor, schedule, deadline, and extension rules. |
| `gameStarted` | At least one required playable row for this lesson shows persisted start/progress/attempt/completion activity. It is informational and does not gate access. |
| `gameCompleted` | Every enabled playable key belonging to the lesson is complete. Disabled keys and `functions-level-12` are excluded. If a teacher disables all playable keys for a lesson, the empty required set is intentionally complete so the student is not deadlocked. |
| `postRequired` | A published POST exists and `isRequired` is true for a Phase-D-gated academic lesson. Draft/unpublished/absent POST is false. |
| `postAssessmentId` | ID of the published POST, required or optional; otherwise `null`. For tutorial/final Phase D state, `null`. |
| `postUnlocked` | A published POST exists, the curriculum and required PRE conditions are satisfied, and `gameCompleted` is true. |
| `postAttemptInProgress` | The student has an `IN_PROGRESS` attempt for the published POST. |
| `postCompleted` | At least one POST attempt is `SUBMITTED`, whether it passed or failed. |
| `postPassingRequired` | `postRequired && requirePassingForCompletion`. This is a progression requirement, not exposure of the numeric threshold. |
| `postPassed` | The Phase B official POST attempt exists and its persisted `passed` value is true. False covers absent/not-submitted/failed. Selection is delegated to `selectOfficialPostAttempt`. |
| `postAttemptsUsed` | Count of submitted POST attempts, matching Phase B attempt-limit semantics. |
| `postAttemptsRemaining` | `max(0, maxAttempts - postAttemptsUsed)` for a published POST; otherwise `0`. An active attempt is not used until submission. |
| `postAttemptsExhausted` | A published POST has `submittedAttempts >= maxAttempts` and no active attempt. This deliberately matches the approved `AFTER_FINAL_ATTEMPT` exhaustion meaning. |
| `assessmentCompleted` | Both required assessment conditions are satisfied. It is vacuously true when neither published assessment is required. Game completion is not part of this field. |
| `lessonCompleted` | For gated academic lessons: required PRE satisfied **and** `gameCompleted` **and** required POST completion condition satisfied. For tutorial/final in Phase D: `gameCompleted`. |
| `nextAction` | One enum value below, computed only from server state. |

Requirement helpers are defined as:

```text
preSatisfied = !preRequired || preCompleted

postSatisfied = !postRequired
             || (postCompleted && (!postPassingRequired || postPassed))

assessmentCompleted = preSatisfied && postSatisfied

lessonCompleted = preSatisfied && gameCompleted && postSatisfied
```

`nextAction` values are:

- `COMPLETE_PREREQUISITE_LESSON`
- `TAKE_PRE`
- `RESUME_PRE`
- `PLAY_GAME`
- `TAKE_POST`
- `RESUME_POST`
- `RETRY_POST`
- `POST_RECOVERY_REQUIRED`
- `LESSON_COMPLETE`

Module reading is not persisted by the backend, so Phase D cannot reliably distinguish "read module" from "did not read module." After the PRE gate, `PLAY_GAME` is the next enforceable action; later frontend phases may present the unlocked module first.

## 7. PRE gating rules

Phase D gating applies to Arrays, Functions and Methods, and Functions with Arrays.

For those lessons:

1. An absent, draft, unpublished, or published-but-optional PRE does not block module/game progression.
2. A published required PRE blocks module and incomplete game-level access until a valid submitted PRE attempt exists.
3. PRE is satisfied by submission; score and pass are irrelevant.
4. The PRE itself becomes interactable only when the previous canonical lesson is complete.
5. A completed game level remains replayable under the existing permanent-completion rule even if a PRE is published later. Incomplete/new levels are gated. Existing completion is not revoked.
6. A required PRE published after a student has partially progressed pauses further incomplete-level progress until PRE submission.
7. A required PRE published after game completion makes the lesson canonically incomplete until PRE and any required POST conditions are satisfied, but it does not delete or uncomplete game rows.

Direct URL/API behavior before PRE submission:

| Attempt | Phase D behavior |
|---|---|
| Direct first-level URL | Frontend can route, but `/api/progress/me` marks the incomplete level inaccessible and backend game operations return `PRE_ASSESSMENT_REQUIRED`. |
| Direct later-level URL | Same PRE denial takes precedence over ordinary within-lesson predecessor checks. |
| Built-in module URL | `moduleUnlocked` is false, but frontend-bundled content remains technically readable until Phase E. |
| Game start/heartbeat/attempt/hint/completion/content override | Denied by the centralized level-access integration. |
| `GET /api/lesson-content` or `/:lessonKey` | Not claimed as protected in Phase D because the aggregate seed and frontend bundle already expose the content. Phase E replaces this boundary. |
| Teacher-authored classroom lesson | Unchanged; it is not the built-in academic module. |

There is one canonical lesson gate calculation. Routes consume the result through `levelAccessService`; they do not query assessment models themselves.

## 8. Game access integration

`levelAccessService` remains the single game-access entry point. It receives or loads one canonical lesson state and combines it with existing level policy.

Approved evaluation order:

1. completed level replay -> allowed as `COMPLETED`;
2. disabled target -> `LEVEL_DISABLED`;
3. incomplete prerequisite lesson -> `LESSON_PREREQUISITE_REQUIRED`;
4. required PRE incomplete -> `PRE_ASSESSMENT_REQUIRED`;
5. prior enabled playable level **within the same lesson** incomplete -> `LEVEL_LOCKED`;
6. scheduled unlock -> `LEVEL_SCHEDULED`;
7. expired effective deadline -> `DEADLINE_PASSED`;
8. otherwise allowed.

The within-lesson predecessor rule is the approved narrow adjustment needed to combine canonical lesson order with assessments. Cross-lesson sequencing is owned by `curriculumPrerequisiteSatisfied`, so a prior lesson's required POST cannot be bypassed. Enable/disable, within-lesson teacher ordering, schedules, deadlines, extensions, hints, completion permanence, validation, XP, and timing remain unchanged.

Using the old global predecessor rule together with canonical lesson prerequisites would be unsafe when a teacher interleaves lessons in `displayOrder`: each lesson could wait on the other. Phase D therefore filters predecessor candidates to the target lesson before applying teacher `displayOrder`; interleaving cannot create cross-lesson edges.

Completion permanence is deliberately narrow. A completed level remains replayable after a late required-PRE publication, but replay does not mutate its completion, cannot award first-completion XP/rewards again, cannot satisfy the PRE, cannot unlock an incomplete later level while that PRE remains incomplete, and cannot bypass a prerequisite lesson for any new/incomplete progression. No first-completion reward logic is redesigned unless a regression demonstrates an integration defect.

All game route handlers continue calling `getStudentLevelAccess`; `progress.js` must not contain direct `LessonAssessment` or `AssessmentAttempt` queries.

## 9. POST unlock and completion rules

A published POST, required or optional, is interactable only when:

```text
curriculumPrerequisiteSatisfied
&& preSatisfied
&& gameCompleted
```

Discovery remains status-only and may reveal that the published assessment exists, but reports `unlocked: false` and a safe lock reason. The player graph and every active-attempt interaction are denied until unlocked.

Phase D does not automatically start, navigate to, or submit POST from `GamePage`. After the last required playable game level commits, a fresh progression read reports `postUnlocked: true` and the relevant next action.

Completion cases:

| Configuration/state | `postCompleted` | `postPassed` | `assessmentCompleted` | `lessonCompleted` | `nextAction` |
|---|---:|---:|---:|---:|---|
| Required POST, no attempt | false | false | false | false | `TAKE_POST` |
| Required pass, submitted 60/75, attempts remain | true | false | false | false | `RETRY_POST` |
| Required pass, later official attempt passes | true | true | true | true (if PRE/game satisfied) | `LESSON_COMPLETE` |
| Required POST, passing not required, any submission | true | value retained | true | true (if PRE/game satisfied) | `LESSON_COMPLETE` |
| Optional POST, no submission | false | false | true with respect to POST | game/PRE determine completion | no required POST action |

Official-grade selection stays in `assessmentPolicyService`. Phase D must not reimplement highest-grade or tie-breaking logic.

## 10. No-assessment compatibility

Student gating considers only published rows.

| Assessment state | Progression effect |
|---|---|
| No row | No assessment gate. |
| Draft row | No assessment gate. |
| Unpublished row | No assessment gate. |
| Published, `isRequired: false` | Discoverable at the proper stage but does not block module/game/lesson completion. |
| Published, `isRequired: true` | Enforces the corresponding PRE or POST condition. |

If a classroom has no published assessments, the required PRE/POST predicates are vacuously satisfied and existing game progression continues. Phase D must not lock legacy classrooms merely because teachers have not authored assessments.

## 11. Tutorial and final challenge behavior

| Lesson | Phase D policy |
|---|---|
| Tutorial/prologue | Assessment-exempt. `preRequired` and `postRequired` false; IDs null; module/game use existing behavior; `lessonCompleted = gameCompleted`. |
| Arrays | Full Phase D PRE -> module/game -> POST policy. Tutorial completion is its curriculum prerequisite. |
| Functions and Methods | Full Phase D policy. Arrays canonical lesson completion is its prerequisite. Exactly 11 playable keys determine `gameCompleted`; the twelfth progress row is ignored. |
| Functions with Arrays | Full Phase D policy. Functions canonical lesson completion is its prerequisite. |
| Final challenge | Not forced into the academic PRE/POST policy. Its game unlocks after Functions with Arrays canonical lesson completion, and its own `lessonCompleted = gameCompleted`. Published final assessments remain usable under the Phase C standalone assessment API but do not gate Phase D final progression. |

This separates Phase C authorability of a final assessment from Phase D progression policy. A future final-assessment product decision can add a dedicated policy without changing the meaning of ordinary lesson PRE/POST gates.

## 12. Exhausted mandatory POST attempts

When `requirePassingForCompletion` is true and all ordinary POST attempts are submitted without a pass, Phase B correctly rejects another student self-service start with `MAX_ATTEMPTS_REACHED`. Phase D does not silently pass the student, reinterpret "final" as latest, delete attempts, increase an immutable assessment setting, or mark the lesson complete. The derived state before intervention is:

```text
postCompleted = true
postPassed = false
postAttemptsExhausted = true
assessmentCompleted = false
lessonCompleted = false
nextAction = POST_RECOVERY_REQUIRED
```

The approved recovery is an explicit teacher action that creates exactly one additional `IN_PROGRESS` POST attempt. It is an exception to the student's ordinary self-service cap, not a change to `maxAttempts`.

Eligibility is checked atomically:

- assessment type is POST;
- assessment is published and its graph remains publish-valid;
- `requirePassingForCompletion` is true;
- the actor manages the exact classroom under existing teacher/admin conventions;
- the target student has an exact active membership in that classroom;
- submitted attempts are at least `maxAttempts`;
- `selectOfficialPostAttempt` does not identify a passing official attempt;
- no `IN_PROGRESS` attempt exists.

The action preserves every prior attempt/result, allocates `max(existing attemptNumber) + 1`, snapshots the current immutable assessment version and randomized question/choice order exactly as ordinary attempt creation does, and appends the new attempt. It does not change assessment settings or grades. The student retrieves, answers, and submits it through the normal Phase B/C active-attempt, response, `Idempotency-Key`, grading, and result pipeline.

While the teacher-created attempt is active, progression intentionally may report:

```text
postAttemptsUsed >= maxAttempts
postAttemptsRemaining = 0
postAttemptInProgress = true
postAttemptsExhausted = false
nextAction = RESUME_POST
```

`postAttemptsRemaining` describes ordinary self-service capacity; it is not a count of teacher exceptions. `postAttemptsExhausted` retains the approved exhaustion meaning of submitted attempts at/above the cap **and no active attempt**. If the recovery attempt passes, the ordinary official-grade selector makes the lesson complete. If it fails, the state returns to `POST_RECOVERY_REQUIRED`; a teacher may explicitly grant one further attempt, but never while another is active.

The existing `AFTER_FINAL_ATTEMPT` review rule follows the same exhaustion semantics: review is unavailable again while the teacher-created attempt is active and is recalculated after it is submitted. No separate review exception is added.

The no-migration V1 design has no separate reusable entitlement and no persistent `grantedBy` column. Its audit-safe property is append-only preservation: the prior rows, scores, attempt numbers, assessment version, and immutable settings remain unchanged, and the new numbered attempt is the durable evidence of the action. Existing authenticated request logs can identify the actor operationally. A durable database audit record of the granting actor would require a separately approved migration.

## 13. `buildProgressSummary` compatibility plan

`buildProgressSummary` remains a deterministic formatter. It accepts an optional `lessonProgressionByKey` input produced by the centralized service; it does not query the database.

Per-lesson additions:

- all fields in Sections 5-6;
- `gameCompleted`, computed from the active playable rows and expected to equal the old completion calculation;
- `assessmentCompleted`;
- `lessonCompleted`.

Temporary compatibility fields:

| Existing field | Phase D behavior |
|---|---|
| `lesson.isCompleted` | Retained as a deprecated alias of legacy `gameCompleted` so current frontend consumers do not silently break before Phase G. It is not canonical lesson completion. |
| `lesson.progressPercent` | Retained as game progress percentage. It is not assessment/lesson completion percentage. |
| `summary.completedLessons` | Retained as legacy game-completed lesson count. |
| `summary.completedLevels` / `totalLevelsCleared` | Unchanged game-level counts. |
| `summary.currentLevelKey` | Remains the first incomplete game row for compatibility, even if access is gated. |

New unambiguous summary fields:

- `gameCompletedLessons`
- `assessmentCompletedLessons`
- `lessonCompletedLessons`
- `nextAction`
- `nextActionLessonKey`

`/api/progress/me` passes the canonical state map and adds top-level `classroomId`. `notifications.js` may continue calling without progression state because it consumes game aggregates only; the default path preserves all old fields. Tests must prove both call forms.

Known deferred consumers:

- `LessonSection`, `Dashboard`, and current map labels continue displaying legacy game completion until Phase G.
- teacher analytics continues reporting game curriculum completion until Phase I.

The backend will nevertheless enforce canonical gates immediately. Documentation/comments must label legacy fields so new code does not adopt them as canonical.

## 14. Service and module architecture

### 14.1 New configuration

`backend/src/constants/lessonProgressionConfig.js` defines:

- canonical curriculum order;
- `ASSESSMENT_GATED_LESSON_KEYS = ["arrays", "functions", "functions-with-arrays"]`;
- next-action values;
- safe progression denial reasons.

This is separate from `assessmentConfig.ACADEMIC_LESSON_KEYS`, which describes assessment authorability and currently includes `final`.

### 14.2 `lessonProgressionService`

Proposed public boundaries:

```js
buildLessonProgressionStates({
  publishedAssessments,
  attempts,
  progressRows,
  levelSettings,
})
```

Pure reducer. It groups batched data, processes lessons in canonical order, uses `PLAYABLE_LEVEL_KEYS`, delegates official POST selection to `assessmentPolicyService`, and returns a map by lesson key.

```js
getLessonProgressionStates({
  classroomId,
  studentId,
  authorizedMembership,
  progressRows,
  levelSettings,
  transaction,
})
```

I/O coordinator for the whole map. It validates or accepts an already-validated exact membership, reuses caller-provided progress/settings, batches published assessments and attempts, then invokes the pure reducer.

```js
getLessonProgressionState({
  classroomId,
  studentId,
  lessonKey,
  authorizedMembership,
  progressRows,
  levelSettings,
  transaction,
})
```

Returns one state while loading the canonical prefix needed to calculate its prerequisite; it still uses bounded set queries rather than recursive per-lesson queries.

```js
evaluateAssessmentInteraction({ assessment, state })
```

Returns a safe allow/deny decision. PRE requires its curriculum prerequisite. POST requires curriculum prerequisite, required PRE satisfaction, and game completion. Tutorial/final assessment interactions retain Phase C standalone behavior.

```js
assertAssessmentInteractionAllowed({
  assessment,
  studentId,
  authorizedMembership,
  transaction,
})
```

Loads the bounded state needed for that persisted assessment, applies `evaluateAssessmentInteraction`, and either returns the state/decision or throws a safe progression error consumed by the assessment error mapper. Student services call this boundary rather than reproducing stage logic.

### 14.3 Integrations

```text
GET /api/progress/me
  -> load membership/settings/progress once
  -> lessonProgressionService (two batched assessment reads)
  -> buildProgressSummary(..., lessonProgressionByKey)
  -> levelAccessService evaluation using the same state map
```

```text
game operation
  -> levelAccessService
  -> lessonProgressionService for target/prefix
  -> existing level settings, predecessor, schedule, deadline policy
```

```text
assessment graph or active-attempt operation
  -> existing exact membership and assessment ownership checks
  -> lessonProgressionService.assertAssessmentInteractionAllowed
  -> existing Phase B/C attempt/read behavior
```

Routes stay thin. `progress.js` never imports assessment models, and assessment routes never calculate game completion.

The progression guard is added to `assessmentAttemptService` through its existing dependency-injection factory so start/resume, active read, save, and submit share the same policy. Repeated submission with the same idempotency key remains recoverable before any active-only gate, preserving Phase B idempotency.

### 14.4 Teacher-granted recovery attempt

The recovery path follows the existing Phase C teacher architecture:

```text
teacher HTTP action
  -> teacherAssessmentService.grantAdditionalPostAttempt
  -> exact managed-classroom authorization
  -> one Sequelize transaction
  -> assessmentAttemptService.createTeacherGrantedPostAttempt
  -> assessment row lock (common root)
  -> exact student membership and eligibility checks
  -> append one IN_PROGRESS attempt
  -> teacher allowlist serializer
```

`teacherAssessmentService` gains an injected `attemptService` dependency and remains responsible for actor/classroom authorization and response composition:

```js
grantAdditionalPostAttempt({
  classroomId,
  assessmentId,
  studentId,
  actorId,
  actorRole,
})
```

`assessmentAttemptService` owns the attempt-domain operation so it can reuse `requirePublishedGraph`, `requireMembership`, `buildOrder`, the clock/random dependencies, and normal attempt numbering:

```js
createTeacherGrantedPostAttempt({
  classroomId,
  assessmentId,
  studentId,
  transaction,
})
```

The caller-supplied transaction is mandatory. The attempt service locks the assessment row and verifies its classroom identity **before any attempt query**. It then validates the POST/published/passing policy, exact active membership, exhaustion, official non-pass, and absence of an active attempt; locks the student's assessment attempts; and creates one row. The assessment lock serializes repeated and concurrent grants and also remains the common root shared with ordinary student start and teacher mutations. The existing partial unique index allowing one active attempt is defense in depth.

`assessmentSerializationService.serializeTeacherGrantedAttempt(attempt)` returns only `id`, `assessmentId`, `classroomId`, `studentId`, `attemptNumber`, `status`, `assessmentVersion`, and `startedAt`. It excludes ordering internals, responses, scores, submission keys, questions, choices, and answer material.

## 15. Route and API changes

No new top-level router is required. Phase D enriches existing contracts and enforces gates at existing boundaries.

### 15.1 `GET /api/progress/me`

Existing fields remain. Add:

```json
{
  "classroomId": 7,
  "summary": {
    "completedLessons": 2,
    "gameCompletedLessons": 2,
    "assessmentCompletedLessons": 1,
    "lessonCompletedLessons": 1,
    "nextAction": "RETRY_POST",
    "nextActionLessonKey": "arrays"
  },
  "lessons": [
    {
      "lessonKey": "arrays",
      "progressPercent": 100,
      "isCompleted": true,
      "gameCompleted": true,
      "assessmentCompleted": false,
      "lessonCompleted": false,
      "preRequired": true,
      "preAssessmentId": 31,
      "preCompleted": true,
      "moduleUnlocked": true,
      "gameUnlocked": true,
      "postRequired": true,
      "postAssessmentId": 32,
      "postUnlocked": true,
      "postCompleted": true,
      "postPassingRequired": true,
      "postPassed": false,
      "postAttemptsUsed": 1,
      "postAttemptsRemaining": 2,
      "postAttemptsExhausted": false,
      "nextAction": "RETRY_POST"
    }
  ]
}
```

The apparent `isCompleted: true` / `lessonCompleted: false` combination is intentional temporary compatibility and must be documented in tests.

Each level continues exposing `isAccessible` and `accessReason`. New reasons may be `LESSON_PREREQUISITE_REQUIRED` or `PRE_ASSESSMENT_REQUIRED`.

### 15.2 Existing game endpoints

No request shape changes. A progression denial uses HTTP 403 with the stable body described in Section 18. Completed-level replays retain the current success behavior.

### 15.3 Assessment discovery

`GET /api/assessments/classrooms/:classroomId/lessons/:lessonKey/:type` retains `available` as "published assessment exists" and adds:

```json
{
  "status": {
    "available": true,
    "unlocked": false,
    "lockReason": "GAME_INCOMPLETE"
  }
}
```

Safe lock reasons are:

- `LESSON_PREREQUISITE_REQUIRED`
- `PRE_ASSESSMENT_REQUIRED`
- `GAME_INCOMPLETE`
- `null` when unlocked

Discovery remains status-only; it never becomes a second graph endpoint.

### 15.4 Assessment player/attempt endpoints

Progression checks apply to:

- `GET /api/assessments/:assessmentId`
- `POST /api/assessments/:assessmentId/attempts`
- `GET /api/assessments/attempts/:attemptId` for active attempts
- `PUT /api/assessments/attempts/:attemptId/responses/:questionId`
- `POST /api/assessments/attempts/:attemptId/submit`

Submitted result/review reads are not blocked by later progression changes, but still require ownership and active exact-class membership as Phase C does.

### 15.5 Teacher recovery action

```text
POST /api/teacher/classrooms/:classroomId/assessments/:assessmentId/students/:studentId/additional-attempt
```

The route uses the existing teacher/admin role middleware and positive-ID parser. It accepts no query string and no request body. Success is HTTP 201:

```json
{
  "attempt": {
    "id": 48,
    "assessmentId": 32,
    "classroomId": 7,
    "studentId": 42,
    "attemptNumber": 4,
    "status": "IN_PROGRESS",
    "assessmentVersion": 2,
    "startedAt": "2026-09-27T08:00:00.000Z"
  }
}
```

The action is intentionally non-idempotent after the granted attempt has been submitted: each later eligible call grants one further attempt. A repeated or concurrent request while an active attempt exists returns a conflict and never creates another active row.

## 16. Query and performance strategy

Only columns needed for progression are selected. No question, choice, response, explanation, or answer-key association is loaded.

### 16.1 Whole progress/map response

Reuse the existing one progress-row read and one classroom-settings read. Add at most:

1. one `LessonAssessment.findAll` for published PRE/POST rows in the exact classroom and relevant lesson keys;
2. one `AssessmentAttempt.findAll` for the student, exact classroom, and returned assessment IDs.

The reducer groups everything in memory. There is no assessment query per lesson or progress query per level.

### 16.2 One-lesson lookup

Because curriculum prerequisite state can depend on prior lessons, the lookup loads the target's canonical prefix in one published-assessment query and one attempt query. It uses one progress query and one settings query only when the caller has not already supplied them. The curriculum is fixed and small; the query count is bounded independently of lesson count.

### 16.3 Level access check

Retain current membership/settings/progress/optional-extension reads. Add one published-assessment set read and, only when IDs exist, one attempt set read for the target's canonical prefix. Callers building `/me` pass preloaded data to avoid repeating those reads for each level.

### 16.4 Assessment interaction

Reuse the already-loaded assessment and exact membership. Load progress/settings once plus the bounded published assessment/attempt sets needed for its prefix. Do not invoke the HTTP discovery service or serializer internally.

### 16.5 Teacher recovery

After managed-classroom authorization, recovery performs one locked assessment-graph read and one locked attempt-set read for the exact `(assessmentId, studentId)`. Active, exhausted, next-number, and official-pass decisions are made from that one attempt set. Exact membership is one indexed lookup. It must not issue one query per attempt and must not load response or answer-review rows.

No caching is introduced. Publication, submission, and level completion must be visible on the next committed read.

## 17. Concurrency and consistency

Progression is always derived from committed database rows. No client unlock flag is accepted.

### PRE submission and immediate game start

Submission commits the attempt before its HTTP response. A game-start request after that response sees `SUBMITTED` and can proceed. A genuinely concurrent start that reads before commit receives `PRE_ASSESSMENT_REQUIRED` and may retry; it cannot create an unlock flag.

### Final game completion and immediate POST access

Level completion commits `UserProgress` before returning. Discovery/start after the response sees `gameCompleted`. A concurrent POST request that reads before commit receives `POST_ASSESSMENT_LOCKED`/`GAME_INCOMPLETE` and may retry.

### Teacher publication during progress

Teacher publish continues locking the assessment row and is atomic. A level request observes either the committed unpublished state or committed published state. If an existing game session predates publication, its next heartbeat/attempt/completion access check applies the new gate and pauses/denies further incomplete-level activity. Already-completed levels remain replayable.

### Assessment interactions

`startOrResumeAttempt` retains the assessment row as the common lock root with teacher mutations. The progression check occurs after the assessment and exact membership are known and before a new attempt is created. Phase B attempt numbering, one-active-attempt uniqueness, version matching, grading, and idempotency remain authoritative.

Active-attempt read/save/submit re-evaluate the gate so an old POST attempt cannot bypass a newly enforced stage. Idempotent recovery of an already-submitted attempt remains available and is not converted into a progression failure.

### Teacher recovery requests

The teacher service opens one transaction, performs managed-classroom authorization inside it, and then delegates. `createTeacherGrantedPostAttempt` acquires the assessment row lock before reading attempts. Concurrent grant calls therefore serialize: the first creates one active attempt; the second observes it and returns `ACTIVE_ATTEMPT_EXISTS`. A concurrent ordinary student start uses the same assessment lock. If the teacher grant wins, the student start resumes the new active attempt; if the student has no capacity and wins first, it returns `MAX_ATTEMPTS_REACHED` without creating a row and the teacher action can proceed afterward.

The precondition and insert occur in the same transaction. A rollback leaves prior attempts, `maxAttempts`, assessment version, and official results unchanged. A unique-active-attempt constraint violation is translated to the same active-attempt conflict rather than the unrelated duplicate-assessment-type error.

### No cross-domain distributed transaction

Phase D does not hold a game-progress row lock while locking assessment rows, and level completion does not create a POST attempt in the same transaction. This avoids a new lock cycle and matches the requested explicit-state handoff: commit game completion, then expose POST on the next request.

## 18. Error behavior and security

### 18.1 Progress/game denial

HTTP 403:

```json
{
  "code": "PRE_ASSESSMENT_REQUIRED",
  "message": "Complete the required pre-test before opening this lesson.",
  "lessonKey": "arrays",
  "assessmentId": 31,
  "nextAction": "TAKE_PRE"
}
```

or:

```json
{
  "code": "LESSON_PREREQUISITE_REQUIRED",
  "message": "Complete the prerequisite lesson before opening this lesson.",
  "lessonKey": "functions",
  "prerequisiteLessonKey": "arrays",
  "nextAction": "COMPLETE_PREREQUISITE_LESSON"
}
```

Existing `LEVEL_DISABLED`, `LEVEL_LOCKED`, `LEVEL_SCHEDULED`, and `DEADLINE_PASSED` contracts remain.

### 18.2 Assessment-stage denial

HTTP 403:

```json
{
  "code": "POST_ASSESSMENT_LOCKED",
  "message": "Complete the lesson game progression before opening the post-test.",
  "lessonKey": "arrays",
  "nextAction": "PLAY_GAME"
}
```

PRE may use `LESSON_PREREQUISITE_REQUIRED`; POST may use `PRE_ASSESSMENT_REQUIRED` if a required PRE is newly incomplete. Existing authentication, forbidden, not-found, version-conflict, attempt-limit, and submission-conflict mappings are unchanged.

`AssessmentApiError` currently retains only `currentVersion` details. Phase D may extend its detail allowlist only with `lessonKey`, `assessmentId`, `prerequisiteLessonKey`, and `nextAction` for these progression denials. Arbitrary source-error details must still be discarded.

### 18.3 Exhaustion

Student start continues returning Phase B's HTTP 409 `MAX_ATTEMPTS_REACHED`. Progression state additionally reports `postAttemptsExhausted: true` and `nextAction: POST_RECOVERY_REQUIRED`. No answer or numeric score is exposed by that state.

### 18.4 Teacher recovery errors

The teacher action uses existing 400/401/403/404 conventions and these stable conflicts:

| Condition | Status/code | Message |
|---|---|---|
| Malformed ID, body, or query | 400 `INVALID_REQUEST` | `Invalid request` |
| Missing/invalid authentication | Existing 401 contract | Existing authentication message |
| Wrong role, unmanaged classroom, or inactive/foreign target student | 403 `FORBIDDEN` | `Forbidden` |
| Assessment absent from exact classroom | 404 `ASSESSMENT_NOT_FOUND` | `Assessment was not found` |
| Not POST, unpublished, or passing not required | 409 `POST_RECOVERY_NOT_ALLOWED` | `An additional POST attempt cannot be granted for this assessment` |
| Submitted attempts below `maxAttempts` | 409 `POST_ATTEMPTS_NOT_EXHAUSTED` | `Ordinary POST attempts are not exhausted` |
| Official POST already passed | 409 `POST_ALREADY_PASSED` | `The student already has a passing POST result` |
| An active attempt exists, including a concurrent winner | 409 `ACTIVE_ATTEMPT_EXISTS` | `The student already has an active assessment attempt` |
| Unexpected database failure | 500 `SERVER_ERROR` | `Server error` |

Eligibility checks use the precedence shown: assessment policy, membership, attempt exhaustion, official pass, active attempt. The assessment is locked before every attempt-related check. No conflict response includes scores, answer material, submission keys, or other students' state.

### 18.5 Security invariants

- Every assessment join is constrained by exact `classroomId`, `studentId`, and published status.
- Inactive or foreign membership returns the existing safe forbidden contract.
- Progression responses use an allowlist and never serialize model instances wholesale.
- Passing percentage, percentages/scores hidden by policy, grade references, question IDs/graphs, correct choices, correctness flags, and explanations are absent.
- `postPassed` is a boolean progression fact, consistent with Phase C's hidden-score contract.
- Discovery remains graph-free.
- The teacher recovery response is a dedicated allowlist and cannot expose question order, response rows, score fields, submission keys, or answer material.
- Frontend route state and localStorage never authorize backend game or assessment actions.

## 19. Test matrix

All Phase D work follows test-first development. The matrix below is required before implementation is considered complete.

### 19.1 Pure progression state

| Case | Expected assertion |
|---|---|
| No published assessments | PRE/POST not required; assessment complete; game alone determines lesson completion. |
| Draft/unpublished assessments | Same as absent. |
| Published optional PRE/POST | IDs/status visible; neither blocks completion. |
| Required PRE, no attempt | PRE incomplete; module/game locked; next action PRE. |
| Required PRE, in progress | Still incomplete; next action resume PRE. |
| Submitted PRE | Diagnostic complete regardless of score; module/game gate satisfied. |
| Game rows partially complete | `gameStarted` true, `gameCompleted` false. |
| All enabled playable rows complete | `gameCompleted` true. |
| All lesson keys disabled | Empty required game set completes without deadlock. |
| Functions 11 playable complete, row 12 incomplete | Functions `gameCompleted` true. |
| Functions 10 playable complete, row 12 complete | Functions `gameCompleted` false. |
| POST before game completion | Published but locked. |
| Required POST failed, attempts remain | Submitted true, passed false, lesson incomplete, retry action. |
| Later passing POST | Official result selected by Phase B; lesson complete. |
| Passing not required | Any valid submitted POST satisfies POST condition. |
| Highest versus latest result | Progression uses policy selector, not latest attempt. |
| Hidden-score assessment | `postPassed` present; no numeric result fields leak. |
| Exhausted failed POST | Explicit exhausted/recovery state; no silent completion. |

### 19.2 Level access

| Case | Expected assertion |
|---|---|
| No/draft PRE | Legacy access subject to normal predecessor/schedule/deadline rules. |
| Required PRE incomplete, first level | 403 `PRE_ASSESSMENT_REQUIRED`. |
| Required PRE incomplete, later direct level | Same gate; direct URL/start cannot bypass. |
| Submitted PRE, first level | Allowed if other existing rules pass. |
| Submitted PRE, later level missing predecessor | Existing `LEVEL_LOCKED`. |
| Completed level after late PRE publication | Replay remains allowed and existing completion is unchanged. |
| Replay after late PRE publication | No duplicate first-completion XP/reward is awarded. |
| Replay while late PRE is incomplete | PRE remains incomplete and the replay does not satisfy it. |
| Replay followed by incomplete later level | Later level remains `PRE_ASSESSMENT_REQUIRED`. |
| Replay with prior canonical lesson incomplete | New/incomplete progression remains `LESSON_PREREQUISITE_REQUIRED`. |
| Prior lesson POST incomplete | Next lesson level denied as prerequisite incomplete. |
| Tutorial | No assessment gate. |
| Final challenge | Requires prior canonical lesson completion but no own PRE/POST gate. |
| Disabled/scheduled/deadline/extension | Existing precedence and payloads preserved. |
| Cross-lesson interleaved display order | No cyclic lock under the approved within-lesson predecessor rule. |

### 19.3 Assessment HTTP integration

| Case | Expected assertion |
|---|---|
| PRE discovery before prerequisite | Published/locked status only; no graph. |
| POST discovery before game completion | `available: true`, `unlocked: false`, safe reason. |
| Direct POST graph before game completion | 403; no questions returned. |
| Direct POST start before game completion | 403; no attempt created. |
| Existing active POST before unlock | get/save/submit denied until unlock. |
| POST after final game commit | Graph/start allowed. |
| Submitted result after progression change | Still readable with active exact membership. |
| Foreign classroom/student | Forbidden without state or resource leakage. |
| Inactive former member | Cannot discover, interact, read result, or review. |
| Duplicate/idempotent submission | Existing Phase B behavior unchanged. |
| Max attempts | Existing 409 plus exhausted progression state. |

### 19.4 Teacher recovery action

| Case | Expected assertion |
|---|---|
| Valid teacher recovery | One new `IN_PROGRESS` POST attempt with next normal number; HTTP 201 allowlist. |
| PRE assessment | 409 `POST_RECOVERY_NOT_ALLOWED`; no row. |
| Unpublished POST | Same recovery-not-allowed conflict; no row. |
| Passing not required | Same recovery-not-allowed conflict; no row. |
| Foreign teacher/classroom/assessment | Existing forbidden/not-found scope contract; no row. |
| Inactive or foreign target student | 403 `FORBIDDEN`; no row. |
| Ordinary attempts remain | 409 `POST_ATTEMPTS_NOT_EXHAUSTED`; no row. |
| Official passing attempt exists | 409 `POST_ALREADY_PASSED`; no row. |
| Active attempt exists | 409 `ACTIVE_ATTEMPT_EXISTS`; no row. |
| Two concurrent recovery requests | Exactly one created; the other receives active-attempt conflict. |
| Concurrent student start/recovery | Shared assessment lock produces at most one active attempt; student can resume a teacher-created attempt. |
| Recovery creation fails | Transaction rolls back without modifying prior attempts, results, assessment version, or `maxAttempts`. |
| Recovery attempt active | Progression reports remaining 0, active true, exhausted false, `RESUME_POST`. |
| Recovery attempt submitted | Normal response/save/submit/idempotency and official-grade logic applies. |
| Recovery attempt fails | Prior history preserved; state returns to `POST_RECOVERY_REQUIRED`. |
| Recovery attempt passes | Official Phase B selector determines pass and lesson completion. |
| Teacher response | No question/choice order, responses, scores, submission key, or answer material. |

### 19.5 Summary and compatibility

| Case | Expected assertion |
|---|---|
| Game complete, required POST pending | Legacy `isCompleted` true, `gameCompleted` true, canonical `lessonCompleted` false. |
| No-assessment lesson game complete | All three completion fields true. |
| `/api/progress/me` | Exact primary `classroomId` and batched lesson state present. |
| Notifications caller without state map | Existing payload remains stable. |
| Frontend-facing level rows | New access reasons appear without removed fields. |

### 19.6 Query regression

Instrument model calls for the whole map and assert one published-assessment query and one attempt query, not one per lesson/level. Assert preloaded progress/settings are reused. A single target lookup must remain bounded to one query per data category. Teacher recovery must use one locked attempt-set read, not one query per attempt.

### 19.7 Concurrency regression

- PRE submit versus game start: start is denied before commit and allowed after commit.
- Final game completion versus POST start: start is denied before commit and allowed after commit.
- Teacher publish versus game request: request observes one committed state; subsequent operation enforces publication.
- Existing concurrent teacher mutation versus student attempt-start lock-order test continues passing.
- Two teacher recovery calls and teacher recovery versus student start use the assessment lock first and create at most one active attempt.
- Existing concurrent attempt creation, submission idempotency, and official-grade tests continue passing.

## 20. Files expected to change

### Add

| File | Purpose |
|---|---|
| `backend/src/constants/lessonProgressionConfig.js` | Canonical lesson scope/order, next actions, and denial reasons. |
| `backend/src/services/lessonProgressionService.js` | Batched I/O coordinator, pure state reducer, and assessment-stage decision. |
| `backend/test/lessonProgressionService.test.js` | State formulas, Functions discrepancy, optional/draft/published behavior, retakes, and exhaustion tests. |
| `backend/test/lessonProgressionRoutes.integration.test.js` | Progress payload, game gates, assessment-stage gates, authorization, concurrency, and query-bound tests. |

### Modify

| File | Purpose |
|---|---|
| `backend/src/services/levelAccessService.js` | Compose centralized lesson state with existing level rules. |
| `backend/src/services/progressService.js` | Add optional canonical state overlay while preserving legacy fields. |
| `backend/src/routes/progress.js` | Batch progression state for `/me`; continue thin delegation for level denials. |
| `backend/src/services/assessmentAttemptService.js` | Enforce the centralized stage gate and add locked teacher-created recovery attempt creation without changing grading/idempotency. |
| `backend/src/services/assessmentReadService.js` | Add discovery/player stage status and gate composition. |
| `backend/src/services/assessmentSerializationService.js` | Allowlist discovery unlock fields and the minimal teacher-granted-attempt response. |
| `backend/src/services/assessmentErrorService.js` | Map centralized stage denials and recovery conflicts to stable assessment HTTP errors. |
| `backend/src/services/teacherAssessmentService.js` | Authorize and transact the one-student recovery action through the attempt service. |
| `backend/src/routes/teacherAssessments.js` | Add the thin no-body additional-attempt endpoint. |
| `backend/test/levelTimingAndDeadline.test.js` | Preserve existing access precedence and add PRE/prerequisite composition cases. |
| `backend/test/assessmentAttemptService.test.js` | Guard injection and active-attempt gate regressions. |
| `backend/test/assessmentRoutes.integration.test.js` | POST-lock/discovery/result authorization contracts. |
| `backend/test/teacherAssessmentRoutes.integration.test.js` | Recovery authorization, eligibility, lock order, rollback, append-only history, response safety, and concurrency. |
| `backend/test/apiRoutes.integration.test.js` | `/api/progress/me` compatibility and direct game endpoint contracts. |
| `backend/test/securityRegression.test.js` | Cross-class, direct-route, graph, and hidden-result leak regressions. |
| `backend/test/runTests.js` | Register Phase D test suites. |

`backend/src/routes/lessonContent.js`, all frontend files, models, and migrations are not expected to change in Phase D. If implementation discovers that these boundaries are insufficient, work stops for review rather than expanding scope.

## 21. Explicit later-phase boundaries

### Phase E - protected built-in content delivery

- Move authoritative built-in module content behind authenticated backend delivery.
- Enforce `moduleUnlocked` at that delivery boundary.
- Remove or reduce frontend-bundled full content and address aggregate seed leakage.
- Phase D only exposes truthful module state; it does not claim content confidentiality.

### Phase F - assessment player UI

- Render assessment graph, active responses, submission, result, and review policies.
- Consume Phase D unlock/denial state.
- No Phase D frontend assessment player work.

### Phase G - map, lesson, and game transitions

- Migrate UI consumers from legacy `isCompleted`/game percentage to `lessonCompleted`.
- Present PRE/module/game/POST cards and next actions.
- Transition from final game completion to available POST without auto-starting it.
- Protect/redirect frontend routes for user experience while retaining backend authority.

### Phase H - teacher builder

- Teacher assessment authoring UI; backend Phase C APIs remain authoritative.

### Phase I - analytics

- Migrate teacher completion metrics from game completion to canonical lesson completion where product definitions require it.
- Add assessment learning/result dashboards without changing Phase B grade rules.

Phase D does not modify frontend, game/map presentation, XP, hints, assessment persistence, grading rules, or database schema.

## 22. Resolved design decisions and known limitations

### Decision 1 - teacher-granted recovery attempt: approved

The explicit endpoint and service flow in Sections 12, 14, 15, and 18 create one additional active POST attempt at a time after ordinary exhaustion. The action preserves history and settings and requires no migration. Persistent grant-actor auditing is not available under the current schema; the numbered attempt plus operational request logs are the V1 audit trail.

### Decision 2 - canonical cross-lesson order: approved

Previous canonical `lessonCompleted` controls entry into the next lesson. Teacher `displayOrder` creates predecessor edges only among enabled playable levels within the target lesson. Interleaving levels from different lessons cannot create an access cycle. Enablement, schedules, deadlines, extensions, completion permanence, hints, validation, XP, and timing otherwise remain unchanged.

### Decision 3 - tutorial and final scope: approved

Tutorial remains assessment-exempt. Arrays, Functions, and Functions with Arrays use PRE -> module/game -> POST progression. The final challenge unlocks from Functions with Arrays canonical completion, but its own Phase D completion remains game-based. Phase C final assessments remain standalone and do not gate it.

### Decision 4 - account-global game progress: approved known limitation

Phase D combines exact-class assessment state with existing account-global game progress. A transfer student may carry game completion into a new classroom while still having to satisfy that classroom's published assessments. No classroom-scoped game-progress persistence or migration is introduced.

### Additional replay rule: approved

Late PRE publication never revokes a completed level or its replay access. Replay remains non-authoritative for all new progression: it cannot create a PRE submission, duplicate first-completion rewards, open incomplete later levels, or bypass canonical prerequisite-lesson completion.

No unresolved blocking design decision remains. Any implementation discovery that requires a model or migration change stops Phase D for review before that change is created.
