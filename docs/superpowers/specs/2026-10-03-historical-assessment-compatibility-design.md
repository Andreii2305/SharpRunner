# Historical Assessment Compatibility Design Specification

**Status:** Proposed; awaiting explicit specification approval

**Date:** 2026-10-03

**Repository baseline:** `aaa3a3fe793240f08260f0c365e9594f372d899e`

**Scope:** Historical game progress interacting with newly published required PRE/POST assessments, PRE baseline validity, level navigation, and assessment analytics

**Out of scope:** Assessment grading changes, coding runner changes, classroom-scoping `UserProgress`, destructive history repair, and implementation planning

## 1. Purpose and success criteria

SharpRunner already derives assessment completion from submitted `AssessmentAttempt` rows and game completion from account-global `UserProgress`. A teacher can publish required assessments after a student has partially or fully completed a lesson's game levels. The current completed-level replay rule then allows a completed same-lesson level to bypass the new assessment requirement.

This design makes a required published assessment debt for the **target level's own lesson** authoritative before completed replay, without erasing historical game work or allowing unrelated earlier-lesson debt to hijack completed work in a later lesson.

The change is successful when all of the following are true:

- assessment completion still comes only from authoritative submitted attempts;
- historical game progress is never reset, deleted, rewritten, or converted into fake attempts;
- same-lesson required PRE/POST debt intercepts enabled level entry, including completed levels;
- unrelated earlier-lesson debt does not revoke the narrow replay privilege for already-completed later-lesson levels;
- unfinished later-lesson progression remains blocked by canonical curriculum prerequisites;
- a PRE taken after meaningful game activity satisfies progression but is excluded from genuine-baseline analytics;
- direct routes, map clicks, and stale gameplay requests apply the same server-owned policy;
- missing, draft, and optional assessments do not hijack game navigation;
- tutorial, final challenge, assessment security, grading, and all coding execution modes remain unchanged.

This specification supersedes only the narrow completed-replay policy in section 7 of `2026-09-27-phase-d-lesson-progression-design.md`: for an enabled target level, unresolved required assessment debt from that same lesson now precedes completed replay. All other Phase D contracts remain in force.

## 2. Current behavior established by the audit

`lessonProgressionService` already builds canonical lesson state from the exact classroom's published assessments and submitted attempts plus account-global game progress. It correctly keeps `preCompleted` and `postCompleted` false when game levels are complete but assessment attempts are absent. Draft assessments are absent from student progression, optional assessments do not gate it, and POST pass/retry/recovery semantics are already authoritative.

The compatibility defect is in level entry. `levelAccessService.evaluateStudentLevelAccess` currently returns `COMPLETED` before checking required PRE state. A completed level is therefore replayable even when its own lesson's newly published PRE or POST is required and unsatisfied. POST debt is not checked at level entry at all.

The global progression summary cannot safely repair this. Its `nextAction` describes the earliest canonical curriculum action, which can belong to another lesson. Using it for every click would incorrectly redirect a completed Functions level to an outstanding Arrays assessment.

The frontend also assumes completion wins:

- `LessonMapPage` assigns completed visual status before access metadata;
- `LevelRoutePage` permits `isAccessible || isCompleted`;
- `GamePage` can receive a later 403 after its initial route check but has no canonical assessment-action recovery path;
- a PRE result derives its continuation primarily from global `summary.nextAction`, and the rendered PRE actions do not offer the same-lesson POST continuation.

Analytics currently treats the first submitted PRE as a valid baseline without knowing whether game activity preceded it. Teacher Average PRE includes every PRE score, and student POST results can show learning gain for a retroactive PRE.

## 3. Chosen architecture and rejected alternatives

### 3.1 Chosen approach

The implementation will add four focused concepts:

1. a pure backend resolver for required assessment debt from one canonical lesson state;
2. target-lesson debt metadata on each `/api/progress/me` level and on gameplay restriction responses;
3. a server-owned nullable `AssessmentAttempt.preBaselineStatus` classification with transactionally rechecked activity evidence;
4. shared frontend interpretation of allowlisted assessment actions, never backend-provided URLs.

This approach reuses canonical progression rather than creating another completion model. The same resolver feeds level access, progress serialization, and restriction payloads, so map, direct route, and stale-request behavior cannot define competing policies.

### 3.2 Rejected: use global `summary.nextAction`

This is rejected because the summary is curriculum-wide. It would let Arrays debt hijack completed Functions replay and violate the approved cross-lesson grandfathering rule.

### 3.3 Rejected: mark assessments complete from game history

This is rejected because game history is not an assessment submission. It would fabricate academic evidence, bypass grading policy, and make audit history unreliable.

### 3.4 Rejected: destructive backfill or timestamp guesses

Existing submitted PRE attempts will not be guessed `VALID` from missing evidence. They resolve to `UNKNOWN`. Existing game progress and attempts remain untouched.

### 3.5 Rejected: arbitrary redirect URLs

The backend returns structured lesson/type/action metadata. The frontend constructs only known SharpRunner routes from an action allowlist. Neither stored nor request-supplied return URLs participate.

## 4. Non-negotiable domain invariants

1. `preCompleted` means a valid PRE attempt row has `status === SUBMITTED`; baseline status does not affect progression completion.
2. `postCompleted`, `postPassed`, official POST, first POST, retry capacity, and recovery state retain their existing policy definitions.
3. `gameCompleted` never implies PRE or POST completion.
4. `UserProgress` rows are not reset, deleted, backfilled, or synthesized.
5. Only a published, required assessment can become level-entry debt.
6. Debt must belong to the target level's lesson.
7. Optional and unpublished assessments never override a level click.
8. `RETROACTIVE` and `UNKNOWN` PRE attempts satisfy progression after submission but are not genuine analytics baselines.
9. The backend remains authoritative when frontend progress metadata is stale.
10. Tutorial/prologue and the final assessment-exempt challenge retain their existing Phase D exceptions.

## 5. Target-lesson required assessment debt

### 5.1 Central resolver

`lessonProgressionService` will export a pure helper conceptually named `resolveRequiredAssessmentDebt(lessonState)`. It accepts exactly one canonical lesson state and returns one of three outcomes: `null` when no debt exists, a validated debt object, or an internal invalid-state sentinel when required unsatisfied state is contradictory. A valid debt object is:

```js
{
  lessonKey: "arrays",
  assessmentType: "PRE", // PRE | POST
  assessmentId: 31,
  assessmentAction: "TAKE_PRE",
  accessReason: "PRE_ASSESSMENT_REQUIRED",
  routable: true
}
```

The action mapping is closed:

| Canonical `nextAction` | Additional required state | Debt type | Routable |
|---|---|---|---:|
| `TAKE_PRE` | `preRequired`, unsatisfied, published ID present | PRE | yes |
| `RESUME_PRE` | `preRequired`, unsatisfied, published ID present | PRE | yes |
| `TAKE_POST` | `postRequired`, unsatisfied, published ID present | POST | yes |
| `RESUME_POST` | `postRequired`, unsatisfied, published ID present | POST | yes |
| `RETRY_POST` | `postRequired`, unsatisfied, published ID present | POST | yes |
| `POST_RECOVERY_REQUIRED` | `postRequired`, unsatisfied, published ID present | POST | no |

Every other action returns `null` only when the lesson state consistently has no currently actionable required debt. The resolver validates that action, requirement flag, completion fields, type, and assessment ID agree. Contradictory state returns the invalid-state sentinel. Level access denies that sentinel with generic `ASSESSMENT_STATE_INVALID` metadata and no assessment route; it never falls through to gameplay or constructs a guessed route.

The resolver does not read `summary.nextAction`. Callers must first choose the state using the target level's canonical `lessonKey`.

### 5.2 Meaning of "missing"

This specification distinguishes an absent assessment definition from a missing completion:

- no published PRE/POST row: the assessment is absent and creates no debt;
- published optional PRE/POST: available under existing assessment discovery rules, but creates no debt;
- published required PRE/POST with no satisfying submitted attempt: required assessment debt exists.

## 6. Authoritative level-access precedence

Membership checks, exact-classroom authorization, and the playable level-key allowlist remain outside and before the pure evaluator. For a known target level, `evaluateStudentLevelAccess` applies this exact order:

1. Locate the target classroom setting, target lesson state, progress row, and deadline fields.
2. **If the target setting is enabled**, resolve target-lesson required assessment debt.
   - Routable PRE debt returns denied `PRE_ASSESSMENT_REQUIRED`.
   - Routable POST debt returns denied `POST_ASSESSMENT_REQUIRED`.
   - `POST_RECOVERY_REQUIRED` returns denied `POST_ASSESSMENT_REQUIRED` with that non-routable action.
   - Contradictory required state returns denied `ASSESSMENT_STATE_INVALID` with no route metadata.
3. If the progress row is completed, allow permanent replay with reason `COMPLETED`.
4. If the target setting is missing or disabled, deny `LEVEL_DISABLED`.
5. If the canonical prior lesson is incomplete, deny `LESSON_PREREQUISITE_REQUIRED`.
6. Apply the existing within-lesson enabled-level predecessor rule and deny `LEVEL_LOCKED` when necessary.
7. Apply the existing `unlockAt` rule and deny `LEVEL_SCHEDULED` when necessary.
8. Apply the effective deadline/extension rule and deny `DEADLINE_PASSED` when necessary.
9. Otherwise allow access.

Step 2 replaces the separate PRE-only branch; it is not an additional inconsistent gate.

The enabled-level qualification is deliberate. An incomplete disabled level remains `LEVEL_DISABLED` and does not disclose or redirect to an assessment merely because its lesson has debt. A historically completed disabled level retains the existing permanent replay exception because step 3 still precedes step 4. This preserves current disabled-level semantics while enforcing the approved behavior for enabled target levels.

Same-lesson debt precedes deadlines and schedules because the game is academically unavailable regardless of its timing window. No timer/session mutation starts for a denied request.

## 7. Cross-lesson grandfathering

Grandfathering is narrow and based on the clicked target lesson:

- Arrays debt overrides clicks on enabled Arrays levels, including completed Arrays levels.
- Arrays debt does not itself become Functions debt.
- A completed historical Functions level remains replayable while Arrays is canonically incomplete because Functions state reports `COMPLETE_PREREQUISITE_LESSON`, not a Functions assessment action; completed replay therefore wins at step 3.
- An incomplete Functions level remains denied by `LESSON_PREREQUISITE_REQUIRED` at step 5.
- After Arrays becomes canonically complete, a required unsatisfied Functions PRE makes Functions state `TAKE_PRE` or `RESUME_PRE`. That is now target-lesson debt and precedes replay for enabled Functions levels.

No progress row is changed by this policy. Grandfathering affects access only. Global `summary.nextAction` remains useful for curriculum-wide "continue" UI, but must not drive target-level redirects.

## 8. PRE baseline classification model

### 8.1 Persisted field

`AssessmentAttempt` gains nullable `preBaselineStatus VARCHAR(16)` with allowed non-null values:

- `VALID`: the server serialized PRE start and submission before meaningful lesson game activity;
- `RETROACTIVE`: meaningful lesson game activity was observed before the PRE was finalized;
- `UNKNOWN`: the server cannot establish baseline validity safely.

`NULL` has two backward-compatible meanings only:

- a legacy submitted PRE has no stored classification and resolves to effective `UNKNOWN` at read time;
- a legacy/in-flight row has not yet received a final classification.

All newly created PRE attempts receive a non-null initial classification. POST attempts always keep this field `NULL`. Application validation enforces the PRE-only rule because a row-local SQL check cannot inspect the related assessment type without a trigger. The database check enforces only `NULL` or the three allowed values.

The client cannot send, patch, or select this field. Player request schemas ignore or reject any such input, and serializers derive their output from the persisted server value.

### 8.2 Progression and analytics are separate

Any submitted PRE—`VALID`, `RETROACTIVE`, or effective `UNKNOWN`—satisfies the existing PRE progression requirement. Classification controls analytics interpretation only. It never changes the score, response history, attempt status, or assessment completion.

## 9. Meaningful game activity

A shared backend helper will inspect all canonical playable `UserProgress` rows belonging to the assessment lesson, regardless of the current classroom's enabled settings. It excludes the non-playable legacy `functions-level-12` row.

A lesson has meaningful game activity when any included row has any of this authoritative persisted evidence:

- `startedAt`, `activeSessionId`, `activeSessionStartedAt`, or `lastHeartbeatAt`;
- `progressPercent > 0`;
- `attemptCount > 0`;
- `timeSpentSeconds > 0`;
- `isCompleted === true`, `completedAt`, or non-null `finalScore`;
- `hintUsed`, `hintUsedAt`, non-null `hintType`, or `attemptCountAtHintUnlock`;
- `detailedHintUnlocked`, `detailedHintPurchasedAt`, `detailedHintUsedAt`, non-null `detailedHintXpCost`, or `detailedHintAttemptCount`;
- `latestFailureAt`, non-null failure code/category, a non-empty failure metadata object, or `latestFailureAttemptCount`;
- `xpAwarded > 0` or `xpAwardedAt`.

Default row metadata such as `lessonTitle`, `orderIndex`, zero values, false flags, and an empty failure metadata object is not activity. Merely retrieving module or level content is not counted because the current server stores no authoritative instruction-view event suitable for this classification.

`UserProgress` is account-global. Therefore activity in any classroom counts as prior activity for a PRE in every classroom. This is intentionally conservative: the server must not claim a clean baseline when it knows the student already played the lesson elsewhere. This design does not attempt to make game progress classroom-scoped.

For legacy submitted PRE rows, absence of these signals is insufficient to prove validity; effective status remains `UNKNOWN`.

## 10. Classification timing and concurrency

### 10.1 New attempt creation

Before creating a new PRE attempt, the service ensures the user's canonical progress rows exist, then locks the lesson's playable `UserProgress` rows in canonical key order inside the existing attempt-creation transaction.

- activity present: create with `RETROACTIVE`;
- no activity present: create with provisional `VALID`;
- POST attempt: create with `NULL`.

The persisted initial value distinguishes new attempts from legacy null rows. Creating the attempt remains subject to existing exact-classroom membership, publication, progression, attempt-limit, version, and one-active-attempt checks.

### 10.2 Submission finalization

Grading reservation, the `GRADING` lease, secure grading, and idempotency remain unchanged. In the final submission transaction, immediately before the attempt becomes `SUBMITTED`, the service locks the same lesson progress rows in canonical order and recomputes baseline status:

| Existing status | Activity at finalization | Final status |
|---|---:|---|
| `RETROACTIVE` | either | `RETROACTIVE` |
| `VALID` | no | `VALID` |
| `VALID` | yes | `RETROACTIVE` |
| `NULL` legacy | no | `UNKNOWN` |
| `NULL` legacy | yes | `RETROACTIVE` |
| `UNKNOWN` | no | `UNKNOWN` |
| `UNKNOWN` | yes | `RETROACTIVE` |

`RETROACTIVE` is monotonic and can never return to `VALID`. A new PRE cannot become submitted with `NULL`. A classification/query failure aborts finalization rather than producing a submitted attempt with guessed validity.

The progress-row locks serialize the final classification against gameplay mutations that lock and update those same rows. If a game mutation commits first, the PRE observes activity and becomes `RETROACTIVE`. If PRE finalization owns the row locks first, the game mutation waits until the PRE submission commits; the authoritative order is PRE before activity. Deadlock or serialization failures are retried around the final transaction using a small bounded retry policy without rerunning secure grading and without changing the grading lease token.

This also handles separate browser tabs and separate classrooms because the locked progress rows are account-global. Frontend route guards improve UX but are not part of classification authority.

### 10.3 Resume and legacy rows

Resuming an active attempt never overwrites its classification. A legacy active PRE with `NULL` is classified conservatively only at successful submission. Existing submitted `NULL` rows are never updated merely by reading analytics or results.

## 11. Analytics semantics

### 11.1 Existing POST selectors remain authoritative

- official POST remains the existing highest/best POST selector;
- first POST remains the existing first-submitted selector;
- POST grading, pass state, retries, partial credit, and attempt history do not change.

### 11.2 Teacher results and metrics

Teacher result serialization adds `preBaselineStatus` to PRE attempt rows only. A persisted null submitted PRE is serialized as `UNKNOWN`; POST rows omit the field.

The teacher analytics UI replaces the ambiguous single "Average PRE" presentation with two explicit metrics:

- **All submitted PRE average**: all first/submitted PRE scores, including `VALID`, `RETROACTIVE`, and `UNKNOWN`;
- **Valid baseline PRE average**: only `VALID` PRE scores.

It also reports valid-baseline and excluded-baseline student counts. This preserves diagnostic score visibility while preventing the all-PRE aggregate from being misread as a clean baseline.

Per-student PRE rows carry one of these accessible labels:

- `Valid baseline`;
- `Retroactive — game activity preceded PRE`;
- `Unknown — legacy baseline timing`.

Only a `VALID` PRE pairs with the first submitted POST for learning gain. `RETROACTIVE` and `UNKNOWN` retain their scores and history but yield `learningGain: null` and are excluded from paired-student counts and average learning gain.

The policy-layer `calculateLearningGain` contract itself enforces this rule by resolving null submitted PRE status to `UNKNOWN` and refusing to calculate unless the effective status is `VALID`. Callers and serializers do not reproduce the eligibility decision.

### 11.3 Student results

Student result serialization never sends learning gain or `prePercentage` unless the paired PRE is `VALID`. POST results still show latest, official-best, and first-POST information under existing score-visibility policy.

For a PRE result, the student-safe payload may include only `baselineEligible: true|false`; it does not need the teacher-facing reason. The UI uses "Baseline score" and starting-point copy only when true. Retroactive or unknown rows use neutral "Diagnostic score" / "Diagnostic complete" language. Scores remain governed by `showScoreAfterSubmission`.

## 12. Additive migration design

Create:

`supabase/migrations/20261003010000_historical_assessment_baseline_status.sql`

The migration will:

1. `ADD COLUMN IF NOT EXISTS "preBaselineStatus" VARCHAR(16)` to `AssessmentAttempts`;
2. defensively add `assessment_attempt_pre_baseline_status_valid` when absent;
3. constrain non-null values to `VALID`, `RETROACTIVE`, or `UNKNOWN`;
4. perform no `UPDATE`, backfill, delete, truncate, drop, or fake-attempt insertion.

There is no default and no index. Result queries already narrow by assessment/classroom/student and the field has only three values, so a standalone low-cardinality index is not justified.

`AssessmentAttempt.js` adds the nullable field and an `isIn` validator backed by a frozen `PRE_BASELINE_STATUSES` constant in `assessmentConfig.js`. `migrationService.js` registers `20261003010000_historical_assessment_baseline_status` immediately after `20261003000000_method_parameter_names`.

Clean installation remains safe because `sequelize.sync()` creates the modeled nullable column before the SQL migration applies the defensive constraint. Upgrade installation adds the column and constraint while leaving every existing value null. Re-running the SQL is idempotent.

## 13. Progress and restriction DTOs

Each `/api/progress/me` level keeps its existing fields and receives a stable shape:

```json
{
  "lessonKey": "arrays",
  "isCompleted": true,
  "isAccessible": false,
  "accessReason": "POST_ASSESSMENT_REQUIRED",
  "assessmentRequired": true,
  "assessmentType": "POST",
  "assessmentId": 32,
  "assessmentAction": "TAKE_POST"
}
```

For a level without same-lesson required debt:

```json
{
  "assessmentRequired": false,
  "assessmentType": null,
  "assessmentId": null,
  "assessmentAction": null
}
```

`assessmentRequired` means the target level is currently intercepted by its lesson's required assessment state; it is not a general statement that the lesson has assessment definitions. `assessmentAction` is one of the six closed debt actions. `POST_RECOVERY_REQUIRED` remains non-routable. `assessmentId` is safe because published assessment IDs are already exposed in student discovery and progression; no graph, response, correct answer, hidden test, or teacher setting is added.

Gameplay 403 payloads use the same names plus `code` and a generic message. The two access codes are `PRE_ASSESSMENT_REQUIRED` and `POST_ASSESSMENT_REQUIRED`; recovery is distinguished by `assessmentAction`, not message parsing. The backend sends no URL.

The response remains exact-classroom scoped. The explicit `classroomId` query is validated against active membership and echoed at the progress-envelope level. Stale metadata cannot authorize gameplay because every protected gameplay endpoint reuses `getStudentLevelAccess`.

## 14. Frontend navigation and recovery

### 14.1 Shared action interpreter

`lessonProgressionNavigation.js` gains a pure helper that accepts the exact classroom ID plus the target level DTO. It validates:

- `assessmentRequired === true`;
- action is one of the closed PRE/POST debt actions;
- action and `assessmentType` agree;
- classroom ID is a positive safe integer;
- `lessonKey` is the target level's known academic lesson key.

For routable actions it returns a canonical route made by `buildAssessmentHref`. For `POST_RECOVERY_REQUIRED` it returns a non-routable recovery view model. Unknown or inconsistent metadata returns no navigation action. It never consumes a URL from the response.

### 14.2 Lesson map

Map status precedence becomes assessment debt before completion. A completed level keeps `isCompleted: true` for progress display but receives an assessment-required visual/action state when its own lesson has debt.

- routable debt: the node remains keyboard/click accessible and opens the canonical PRE/POST route;
- recovery debt: the node is not playable and exposes "Post-Test attempts exhausted — contact your teacher" through visible text and accessible labeling;
- no debt: existing completed/current/locked/expired behavior remains.

Optional/draft/absent assessments produce no debt metadata and do not change node routes.

### 14.3 Direct level URL

`LevelRoutePage` always loads exact-classroom `/api/progress/me`. It evaluates target-level assessment metadata before `isCompleted` and before rendering `GamePage`.

- routable same-lesson debt: `<Navigate replace>` to the canonical assessment route;
- recovery debt: render a focused, accessible recovery panel with map navigation and no gameplay mount;
- no debt and `isAccessible`: render gameplay;
- ordinary denial: preserve disabled, prerequisite, schedule, and deadline handling.

The existing `level?.isAccessible || level?.isCompleted` shortcut is removed; the backend's `isAccessible` already incorporates the completed replay decision.

`LevelRoutePage` passes the verified classroom ID to `GamePage`, ensuring subsequent calls remain in the same classroom context.

### 14.4 Stale GamePage state

Every protected content/start/heartbeat/attempt/hint/completion request continues to include the exact classroom ID. A shared response interpreter handles structured 403 payloads:

- PRE/POST routable action: stop/pause client gameplay activity, leave game audio, and replace-navigate to the allowlisted assessment route;
- `POST_RECOVERY_REQUIRED`: stop interaction and render the same non-playable recovery state with a map action;
- inconsistent/unknown assessment metadata: fail closed to a generic access-changed panel and exact-classroom map action;
- other access codes: preserve their existing specialized handling.

The client never parses message text, trusts a response URL, or treats the 403 as a successful mutation.

### 14.5 Responsive and accessible states

Assessment-required and recovery states use the existing responsive card/map patterns, preserve visible keyboard focus, and do not depend on color alone. Redirect/loading changes announce through the existing status region; non-routable recovery and access-changed failures use `role="alert"` or an equivalent assertive status and place focus on their heading. Node accessible names include the required action, such as "Arrays level 3 — Pre-Test required." All links and buttons retain a usable touch target at the repository's supported mobile breakpoints.

## 15. PRE result continuation

After PRE submission, the existing result flow refreshes exact-classroom canonical progression. PRE continuation must use the target lesson state, not the global summary.

| Refreshed target-lesson action | PRE result action |
|---|---|
| `TAKE_POST` | `Continue to Post-Test` |
| `RESUME_POST` | `Continue Post-Test` |
| `RETRY_POST` | `Retry Post-Test` |
| `PLAY_GAME` | preserve ordinary module/game continuation |
| `POST_RECOVERY_REQUIRED` | non-routable teacher-help state |
| anything else | exact-classroom map fallback |

Thus a historical student whose game is already complete follows PRE → POST. An ordinary new student whose game remains incomplete follows PRE → module/game. The result page does not hard-code that all PRE attempts lead to POST.

If the progression refresh fails, the saved result remains visible and the existing retry-refresh control remains; no speculative route is shown.

## 16. POST failure and recovery

Existing POST policy is unchanged:

- failed mandatory POST with ordinary attempts remaining → `RETRY_POST` and a routable retry;
- active POST attempt → `RESUME_POST`;
- exhausted mandatory POST with no active attempt → `POST_RECOVERY_REQUIRED`;
- teacher-created recovery attempt → existing `RESUME_POST` behavior;
- satisfied POST condition → debt disappears and normal completed replay returns.

Because same-lesson POST debt precedes completed replay, a completed game level cannot bypass retry or recovery. Recovery never auto-passes, creates an automatic attempt, or weakens teacher control.

## 17. Missing, draft, optional, tutorial, and final behavior

| State | Level-click behavior for historical game completion |
|---|---|
| no published PRE and no published POST | normal replay |
| draft PRE/POST only | normal replay |
| optional PRE/POST only | normal replay; manual assessment availability unchanged |
| required published PRE unsatisfied, no required POST | PRE, then replay |
| PRE satisfied, required published POST unsatisfied | POST, then replay when satisfied |
| required published PRE and POST both unsatisfied | PRE → refreshed state → POST → replay |
| both required conditions satisfied | normal replay |

Tutorial/prologue remains assessment-exempt under canonical progression. The final challenge remains assessment-exempt even if Phase C permits an assessment record to exist. Neither lesson produces target-level debt, baseline gating, or altered replay behavior from this feature.

## 18. Security and regression boundaries

The change preserves:

- exact-classroom active membership for progress and assessments;
- published-only student discovery and player access;
- submitted-attempt assessment completion authority;
- student-safe serializers and answer-review policy;
- PUBLIC/HIDDEN coding-test separation;
- teacher/server-only reference solutions;
- MCQ, TRUE_FALSE, METHOD, and PROGRAM grading;
- METHOD Run Code, positional parameters, structured test inputs, secure execution, partial credit, and grading leases;
- PROGRAM stdin/stdout execution;
- official POST and first-POST selection;
- transaction/idempotency rules except for the narrowly added progress-row lock and classification write during PRE creation/finalization;
- no arbitrary redirect URLs.

`preBaselineStatus` is server-owned metadata. It is not accepted in student or teacher mutation payloads. It is exposed exactly only in authorized teacher results; student serialization receives at most the derived `baselineEligible` boolean needed for honest wording.

## 19. Expected implementation surface

The implementation plan should confirm exact files, but the likely production surface is:

### Database and backend domain

- `supabase/migrations/20261003010000_historical_assessment_baseline_status.sql` (new)
- `backend/src/services/migrationService.js`
- `backend/src/models/AssessmentAttempt.js`
- `backend/src/constants/assessmentConfig.js`
- `backend/src/services/lessonProgressionService.js`
- `backend/src/services/levelAccessService.js`
- `backend/src/routes/progress.js`
- `backend/src/services/assessmentAttemptService.js`
- a focused new baseline-classification service, if extraction keeps attempt service cohesive
- `backend/src/services/assessmentPolicyService.js`
- `backend/src/services/assessmentReadService.js`
- `backend/src/services/assessmentSerializationService.js`
- `backend/src/services/teacherAssessmentService.js`

### Frontend

- `frontend/src/utils/lessonProgressionNavigation.js`
- `frontend/src/pages/map/LessonMapPage.jsx`
- map/tiled-map components and styles only as needed for the new state
- `frontend/src/pages/game/LevelRoutePage.jsx`
- `frontend/src/pages/game/LevelRoutePage.module.css`
- `frontend/src/pages/game/GamePage.jsx`
- `frontend/src/pages/game/GamePage.module.css`
- `frontend/src/pages/student/assessment/assessmentResultModel.js`
- `frontend/src/pages/student/assessment/AssessmentResult.jsx`
- `frontend/src/pages/teacher/assessment/teacherAssessmentAnalyticsState.js`
- `frontend/src/pages/teacher/assessment/TeacherAssessmentAnalyticsPanel.jsx`

### Tests

- `backend/test/assessmentMigration.test.js`
- `backend/test/lessonProgressionService.test.js`
- `backend/test/lessonProgressionRoutes.integration.test.js`
- `backend/test/assessmentAttemptService.test.js`
- `backend/test/assessmentSerialization.test.js`
- `backend/test/securityRegression.test.js`
- a focused backend baseline-classification test file if the helper is extracted
- `frontend/src/utils/lessonProgressionNavigation.test.js`
- `frontend/src/pages/game/gameCompletionNavigation.test.js` or a focused level-entry navigation test
- focused `LevelRoutePage` and `GamePage` render/behavior tests if introduced
- `frontend/src/pages/student/assessment/assessmentResultModel.test.js`
- `frontend/src/pages/student/assessment/AssessmentResult.render.test.mjs`
- `frontend/src/pages/teacher/assessment/teacherAssessmentAnalyticsState.test.js`
- `frontend/src/pages/teacher/assessment/TeacherAssessmentAnalyticsPanel.render.test.mjs`

No broad refactor is part of this feature.

## 20. RED/GREEN test matrix

Tests must be written to fail for the missing behavior before production changes. The implementation plan may split a row into multiple assertions but must preserve every scenario.

| # | RED/GREEN scenario | Required assertion and likely layer |
|---:|---|---|
| 1 | historical complete + required PRE/POST unsatisfied | Progression keeps both incomplete; every enabled same-lesson level reports PRE debt; after PRE, POST debt; after POST, replay. Backend service/integration. |
| 2 | historical complete + PRE done + POST unsatisfied | Same-lesson level denied with routable POST metadata. Backend service/integration. |
| 3 | historical complete + both satisfied | No debt metadata; completed replay allowed. Backend service/integration. |
| 4 | partial game + required PRE unsatisfied | Any enabled same-lesson level routes to PRE; after PRE ordinary sequence resumes; POST stays locked. Backend/frontend. |
| 5 | completed same-lesson replay + PRE unsatisfied | PRE debt wins over `COMPLETED`. Unit test exact precedence. |
| 6 | completed same-lesson replay + POST unsatisfied | POST debt wins over `COMPLETED`. Unit test exact precedence. |
| 7 | unrelated later completed-level grandfathering | Arrays debt does not hijack completed Functions replay. Unit/integration/frontend navigation. |
| 8 | unfinished later progression | Incomplete Functions remains `LESSON_PREREQUISITE_REQUIRED` until Arrays canonical completion. Backend integration. |
| 9 | direct level URL | Exact-classroom load redirects target debt to allowlisted assessment route before mounting game. Frontend behavior/render. |
| 10 | stale GamePage request | Structured 403 produces canonical assessment redirect or recovery panel; message/URL is ignored. Frontend behavior. |
| 11 | exact-classroom isolation | Debt/attempt from classroom A cannot affect B; inactive/foreign classroom remains rejected. Account-global game evidence may still conservatively affect B's baseline classification as explicitly designed. Backend integration/security. |
| 12 | missing PRE definition | No PRE debt is synthesized. Backend progression/access. |
| 13 | draft PRE | Draft is absent and cannot hijack clicks. Backend integration. |
| 14 | optional PRE | Discoverable under existing rules but never level-entry debt. Backend/frontend. |
| 15 | missing POST definition | After game/PRE conditions, no POST debt; replay follows existing rules. Backend. |
| 16 | draft POST | Draft is absent and cannot hijack clicks. Backend. |
| 17 | optional POST | Optional POST never intercepts level clicks. Backend/frontend. |
| 18 | failed POST with retry | `RETRY_POST` stays routable and blocks completed replay. Backend/frontend. |
| 19 | POST recovery required | `POST_RECOVERY_REQUIRED` blocks replay, creates no automatic attempt, and renders non-routable help. Backend/frontend. |
| 20 | PRE result → POST for historical completion | Refreshed same-lesson `TAKE_POST` renders `Continue to Post-Test`. Model/render test. |
| 21 | PRE result → game for ordinary student | Same-lesson `PLAY_GAME` retains module/game path and does not force POST. Model/render test. |
| 22 | VALID PRE | New PRE with no activity remains `VALID` after locked submission recheck. Backend domain/integration. |
| 23 | RETROACTIVE PRE | Existing meaningful activity creates/finalizes `RETROACTIVE`; submission still satisfies progression. Backend. |
| 24 | UNKNOWN legacy PRE | Submitted null reads as `UNKNOWN` without write-back. Migration/read/analytics. |
| 25 | concurrent activity during PRE | Serialized activity before finalization flips `VALID` to `RETROACTIVE`; activity after PRE commit leaves `VALID`; no reverse transition. Backend concurrency. |
| 26 | retroactive PRE excluded from gain | First POST and official POST remain selected, but gain/paired count are absent. Backend/frontend analytics. |
| 27 | unknown PRE excluded from gain | Legacy PRE score remains visible, gain absent. Backend/frontend analytics. |
| 28 | valid PRE included in gain | Existing first-POST calculation is preserved for `VALID`. Backend/frontend analytics. |
| 29 | teacher labeling | Valid/retroactive/unknown labels and the two PRE averages/counts are accurate and accessible. Frontend state/render. |
| 30 | student gain suppression | POST envelope/model omits gain and `prePercentage` for non-valid PRE; PRE wording is neutral. Serialization/render. |
| 31 | tutorial regression | No assessment debt or baseline gate is introduced; access behavior unchanged. Backend/frontend. |
| 32 | final exemption regression | Final remains assessment-exempt and playable under existing policy. Backend/frontend. |
| 33 | no-assessment graph | Current no-assessment progression, map, replay, schedules, and deadlines remain unchanged. Integration. |
| 34 | METHOD regression | Run Code, positional execution, typed inputs, hidden tests, grading, partial credit, and names remain unchanged. Existing coding suites. |
| 35 | PROGRAM regression | stdin/stdout execution and grading remain unchanged. Existing coding suites. |
| 36 | serializer/security regression | No answer key, hidden test, reference solution, foreign classroom data, or arbitrary URL leaks through new DTOs. Backend security/source tests. |

Additional migration assertions cover nullable/additive SQL, exact check values, absence of destructive statements/backfill/default/index, model registration, and last-position `migrationService` registration.

## 21. Verification strategy after implementation

Focused commands should be specified exactly in the implementation plan. The expected final verification set is:

```powershell
Set-Location C:\dev\SharpRunner\backend
node --test --test-concurrency=1 test/assessmentMigration.test.js test/lessonProgressionService.test.js test/lessonProgressionRoutes.integration.test.js test/assessmentAttemptService.test.js test/assessmentSerialization.test.js test/securityRegression.test.js
npm test

Set-Location C:\dev\SharpRunner\frontend
node src/utils/lessonProgressionNavigation.test.js
node src/pages/game/gameCompletionNavigation.test.js
node src/pages/student/assessment/assessmentResultModel.test.js
node src/pages/student/assessment/AssessmentResult.render.test.mjs
node src/pages/teacher/assessment/teacherAssessmentAnalyticsState.test.js
node src/pages/teacher/assessment/TeacherAssessmentAnalyticsPanel.render.test.mjs
npm test
npm run lint
npm run build

Set-Location C:\dev\SharpRunner
git diff --check
git status --short --branch
```

Any newly created focused test files must be added to the focused command and the appropriate aggregate frontend script or backend runner. Secure coding runner suites remain part of backend `npm test`; if environment cost requires a split during development, the implementation may run focused JavaScript tests first but cannot omit the full final suite.

## 22. Rollout and compatibility

The rollout is additive. Deployment order is migration/model/backend before frontend. An older frontend ignores new DTO fields and receives denied access rather than unauthorized gameplay; it may show a generic lock until refreshed. A new frontend against an older backend sees no debt metadata and retains old behavior, so coordinated deployment is preferred.

No historical data repair job is required. Existing null PRE classifications become `UNKNOWN` at read time. New classification begins only after the backend change. Publishing required assessments continues to produce existing teacher warnings; changing warning copy or adding baseline counts to publication warnings is not required by this feature.

## 23. Unresolved questions

None. The approved audit resolves the product-policy choices. The implementation plan must preserve the exact precedence, DTO shape, baseline classification rules, and 36-case test coverage defined here.

## 24. Specification self-review

- Placeholder scan: no placeholder marker or deferred product choice remains.
- Internal consistency: same-lesson debt is distinct from global next action in backend and frontend; baseline status affects analytics but not progression.
- Scope: one migration and focused progression/navigation/analytics changes; no grading or runner redesign.
- Ambiguity: absent assessment definitions, missing submissions, disabled targets, recovery, legacy nulls, and concurrent activity each have an explicit rule.
- Security: exact classroom, published-only discovery, student-safe serialization, and allowlisted routing remain authoritative.
