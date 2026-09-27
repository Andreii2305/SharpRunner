# Phase C Secure Assessment APIs — Design Specification

**Status:** Proposed for review

**Date:** 2026-09-25

**Scope:** Student and teacher HTTP APIs over the committed Phase B assessment domain

**Out of scope:** Progression gates, lesson completion changes, frontend work, analytics aggregation, XP, deadlines, and time limits

## 1. Purpose and invariants

Phase C exposes the Phase B assessment foundation through secure, cohesive HTTP APIs. It must preserve these domain invariants:

- PRE is diagnostic, has one attempt, uses `FIRST`, has no passing threshold, and never produces a pass/fail outcome.
- POST defaults to a 75% passing threshold, three attempts, and `HIGHEST` grading.
- The official POST grade is the highest submitted POST percentage, with the earlier submission winning ties.
- Learning gain is the first submitted POST percentage minus the PRE percentage and is reported in percentage points.
- Assessment scores are calculated only by the server from persisted question, choice, and response records.
- Every student query is scoped through an exact active classroom membership.
- Every teacher query is scoped through the exact classroom and assessment relationship.
- Student serializers and teacher serializers are separate allowlists. Student payloads never derive from teacher payloads by deleting properties.
- All assessment settings and structural content are immutable after the first attempt in V1.
- Unpublishing and deletion are allowed only while no attempt exists.
- No Phase C code changes lesson or game access, completion, XP, hints, maps, or frontend behavior.

## 2. Architecture decision

Use thin dedicated routers backed by focused services.

```text
HTTP request
  -> authentication and role middleware
  -> route parameter/body parsing
  -> assessment authorization/query/management service
  -> Phase B policy and attempt services
  -> explicit student or teacher serializer
  -> centralized assessment error mapping
  -> HTTP response
```

The routers contain route declarations, primitive request parsing, and response status selection only. They do not query Sequelize models directly except through the services defined below.

## 3. Files

### 3.1 Files to add

| File | Responsibility |
|---|---|
| `backend/src/routes/assessments.js` | Student route declarations and student-role middleware. |
| `backend/src/routes/teacherAssessments.js` | Teacher/admin route declarations and management-role middleware. |
| `backend/src/services/assessmentAuthorizationService.js` | Exact classroom membership, classroom ownership/admin scope, and assessment-to-classroom checks. |
| `backend/src/services/assessmentReadService.js` | Student discovery, safe graph retrieval, active-attempt recovery, result composition, and review-policy evaluation. |
| `backend/src/services/assessmentSerializationService.js` | Independent student/player and teacher/editor allowlist serializers. |
| `backend/src/services/assessmentErrorService.js` | Stable assessment error type, Phase B error translation, safe HTTP status/code/message mapping, and Sequelize conflict translation. |
| `backend/src/services/teacherAssessmentService.js` | Teacher list/create/editor/update/publish/unpublish/delete/results operations and their transaction boundaries. |
| `backend/test/assessmentSerialization.test.js` | Recursive player-data leak tests and review-policy serializer tests. |
| `backend/test/assessmentRoutes.integration.test.js` | Student assessment HTTP behavior and authorization tests. |
| `backend/test/teacherAssessmentRoutes.integration.test.js` | Teacher assessment management and result-query tests. |

### 3.2 Files to modify

| File | Change |
|---|---|
| `backend/src/app.js` | Mount `/api/assessments` and `/api/teacher` assessment routers, and normalize malformed JSON to the safe 400 contract. |
| `backend/src/constants/assessmentConfig.js` | Add the minimal optional objective-key format contract. |
| `backend/src/services/assessmentPolicyService.js` | Add draft graph validation and objective-key validation without weakening publish validation. |
| `backend/src/services/assessmentAttemptService.js` | Return safe saved responses on start/resume and add safe active-attempt retrieval support. |
| `backend/test/assessmentPolicyService.test.js` | Cover draft-versus-publish rules and objective-key format. |
| `backend/test/assessmentAttemptService.test.js` | Cover saved response recovery and active-attempt retrieval. |
| `backend/test/securityRegression.test.js` | Add cross-student, cross-classroom, answer-key, and malformed-input regressions. |
| `backend/test/runTests.js` | Register the new Phase C suites. |

No model or migration change is expected. If implementation reveals a persistence requirement not expressible with the Phase B schema, implementation stops for review rather than silently expanding the database scope.

## 4. Service responsibilities and function boundaries

### 4.1 `assessmentAuthorizationService`

Exports:

- `requireActiveStudentMembership({ classroomId, studentId, transaction? })`
  - Requires an exact `ClassroomMembership` row with `status = active`.
  - Never falls back to a primary or arbitrary classroom.
- `requireManagedClassroom({ classroomId, actorId, actorRole, transaction?, lock? })`
  - Loads the classroom.
  - Teachers must own it through `Classroom.teacherId`.
  - Admins retain the existing teacher-router ability to manage any classroom; no new admin capability is added.
- `requireAssessmentInClassroom({ classroomId, assessmentId, transaction?, lock? })`
  - Loads by both IDs so guessed assessment IDs cannot cross classroom boundaries.
- `assertAcademicLessonKey(lessonKey)`
  - Uses `ACADEMIC_LESSON_KEYS`; tutorial remains excluded.

Authorization errors are deliberately indistinguishable where revealing resource existence would create an enumeration risk. For example, a student requesting an unpublished or out-of-class assessment receives an assessment-not-available/not-found response without teacher-only details.

### 4.2 `assessmentSerializationService`

Exports distinct functions rather than a shared serializer with flags:

- `serializeDiscoveryStatus(input)`
- `serializePlayerAssessment(assessment)`
- `serializePlayerAttempt({ assessment, attempt, responses, attemptsUsed, maxAttempts })`
- `serializeStudentResult(input)`
- `serializeAllowedReview(input)`
- `serializeTeacherSummary(input)`
- `serializeTeacherEditor(assessment, metadata)`
- `serializeTeacherResults(input)`

Student functions are allowlists and never accept arbitrary `...model.toJSON()` output. Teacher functions may expose answer keys only after teacher/classroom authorization succeeds.

### 4.3 `assessmentReadService`

Exports:

- `discoverAssessment({ classroomId, lessonKey, type, studentId })`
  - Validates exact active membership.
  - Looks up only the unique published assessment for the classroom/lesson/type.
  - Returns status metadata only; it never returns questions or choices.
  - Uses submitted attempts to derive attempts used, remaining attempts, latest visible score, and official POST metadata.
- `getPlayerAssessment({ assessmentId, studentId })`
  - Loads a published graph and validates membership against the graph's classroom.
  - Returns only `serializePlayerAssessment` output in deterministic display order.
- `getActiveAttempt({ attemptId, studentId })`
  - Verifies ownership, active membership, publication, `IN_PROGRESS`, and assessment version.
  - Returns stable persisted question/choice order plus safe selected-choice recovery.
- `getStudentResult({ attemptId, studentId })`
  - Verifies ownership and exact membership.
  - Requires `SUBMITTED`.
  - Loads the assessment, current student's submitted attempts for that assessment, the matching PRE assessment/attempt when the requested result is POST, and responses needed for permitted review.
  - Uses Phase B official-grade, first-POST, and learning-gain helpers rather than reimplementing formulas.
- `canExposeAnswerReview({ assessment, submittedAttempts, activeAttempt })`
  - Implements the policy described in section 11.

Student read operations use a bounded number of queries. A POST result may use separate bounded queries for the requested attempt graph, sibling POST attempts, matching PRE attempt, and review responses; it never queries once per question or attempt.

### 4.4 `assessmentAttemptService` extensions

Existing Phase B operations remain authoritative:

- `startOrResumeAttempt`
- `saveResponse`
- `submitAttempt`
- `getAttemptResult`

Phase C extends start/resume output with:

```json
{
  "responses": [
    { "questionId": 101, "selectedChoiceId": 1001 }
  ]
}
```

The response list contains no correctness or awarded-point fields. The service also exposes a safe active-attempt retrieval primitive used by `assessmentReadService`; it performs the same ownership, membership, publication, and version checks as mutation operations.

### 4.5 `teacherAssessmentService`

Exports:

- `listAssessments({ classroomId, lessonKey, actorId, actorRole })`
- `createAssessment({ classroomId, actorId, actorRole, input })`
- `getEditorAssessment({ classroomId, assessmentId, actorId, actorRole })`
- `saveAssessmentGraph({ classroomId, assessmentId, actorId, actorRole, input })`
- `publishAssessment({ classroomId, assessmentId, actorId, actorRole, version })`
- `unpublishAssessment({ classroomId, assessmentId, actorId, actorRole, version })`
- `deleteAssessment({ classroomId, assessmentId, actorId, actorRole })`
- `getAssessmentResults({ classroomId, assessmentId, actorId, actorRole })`

All methods cross-check classroom ownership and assessment classroom identity internally even though the router already enforces the teacher/admin role.

### 4.6 `assessmentErrorService`

Exports:

- `AssessmentApiError`
- `translateAssessmentError(error)`
- `sendAssessmentError(res, error)`

It translates Phase B codes, policy `TypeError`s raised through known validation boundaries, and Sequelize unique/foreign-key errors into the contract in section 13. Unknown errors are logged server-side and become a generic 500 response.

## 5. Exact student route contracts

All student routes use `authMiddleware` followed by the existing student-role policy. IDs must be positive base-10 integers with no trailing characters. Unknown body/query properties are rejected on security-critical mutation routes.

### 5.1 Discovery/status

`GET /api/assessments/classrooms/:classroomId/lessons/:lessonKey/:type`

Path:

- `classroomId`: positive integer
- `lessonKey`: one of the academic lesson keys
- `type`: `PRE` or `POST`, case-normalized

The service first validates the student's active membership in that exact classroom. If no published assessment exists, return 200:

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
    "diagnosticCompleted": false
  }
}
```

If one exists, return 200:

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
  },
  "status": {
    "available": true,
    "attemptStatus": "IN_PROGRESS",
    "activeAttemptId": 44,
    "attemptsUsed": 1,
    "attemptsRemaining": 2,
    "hasSubmittedAttempt": true,
    "latestSubmitted": {
      "attemptNumber": 1,
      "percentage": 70,
      "passed": false
    },
    "officialPost": {
      "attemptNumber": 1,
      "percentage": 70
    }
  }
}
```

`hasSubmittedAttempt` means that this student has at least one submitted attempt for this assessment; it is not lesson completion. PRE summaries additionally include `diagnosticCompleted`, which is true exactly when the PRE has a submitted attempt, and omit `passed` and `officialPost`. The discovery contract does not define or emit `lessonCompleted`; canonical lesson-completion semantics remain deferred to the progression phase. `latestSubmitted` and `officialPost` numeric score fields are omitted when `showScoreAfterSubmission` is false. This endpoint never includes `questions`, `choices`, responses, explanations, correct IDs, or grading configuration.

### 5.2 Safe player graph

`GET /api/assessments/:assessmentId`

Returns 200:

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
          { "id": 1001, "choiceText": "int[] values" }
        ]
      }
    ]
  }
}
```

The graph uses normal display order. It does not create an attempt or consume an attempt. It never exposes `displayOrder` as a grading key, `isCorrect`, `correctChoiceId`, explanations, passing thresholds, answer-review policies, or other students' data.

### 5.3 Start or resume

`POST /api/assessments/:assessmentId/attempts`

Request body: absent or exactly `{}`.

Returns 201 for a new attempt or 200 for a resumed attempt:

```json
{
  "attempt": {
    "attemptId": 44,
    "attemptNumber": 2,
    "assessmentVersion": 3,
    "status": "IN_PROGRESS",
    "startedAt": "2026-09-25T12:00:00.000Z",
    "resumed": false,
    "attemptsUsed": 1,
    "attemptsRemaining": 1,
    "responses": []
  },
  "assessment": {
    "id": 12,
    "lessonKey": "arrays",
    "type": "POST",
    "title": "Arrays post-test",
    "instructions": "Choose one answer.",
    "version": 3,
    "questions": []
  }
}
```

The question and choice arrays follow persisted attempt order. Existing responses contain only question and selected-choice IDs.

### 5.4 Retrieve active attempt

`GET /api/assessments/attempts/:attemptId`

Returns the same safe shape as start/resume with `resumed: true`. Submitted attempts return 409 `ATTEMPT_ALREADY_SUBMITTED`; clients use the result endpoint instead. Refresh never recalculates or reshuffles order.

### 5.5 Autosave or clear response

`PUT /api/assessments/attempts/:attemptId/responses/:questionId`

Request body must contain exactly:

```json
{ "selectedChoiceId": 1001 }
```

or:

```json
{ "selectedChoiceId": null }
```

Returns 200:

```json
{
  "response": {
    "attemptId": 44,
    "questionId": 101,
    "selectedChoiceId": 1001
  }
}
```

No correctness, points, or explanation fields are returned.

### 5.6 Submit attempt

`POST /api/assessments/attempts/:attemptId/submit`

Required header:

```text
Idempotency-Key: URL-safe-key_123
```

The body must be absent or exactly `{}`. Score-like or unknown properties cause 400 `INVALID_REQUEST`; they are never forwarded to the Phase B service. The header maps directly to Phase B `submissionKey`.

After Phase B submission succeeds (or returns the stored same-key result), the route calls `getStudentResult` and returns the same policy-safe envelope as section 5.7. This keeps score visibility and answer review identical between submit and later result retrieval. A shortened example is:

```json
{
  "result": {
    "attemptId": 44,
    "type": "POST",
    "status": "SUBMITTED",
    "attemptNumber": 2,
    "submittedAt": "2026-09-25T12:10:00.000Z",
    "scoreVisible": true,
    "pointsEarned": 8,
    "maxPoints": 10,
    "percentage": 80,
    "passed": true
  }
}
```

The route does not accept an answer key or grading outcome. The additional read happens after the submission transaction commits; a serialization/read failure cannot roll back or re-grade the immutable submitted attempt, and a retry with the same key safely retrieves it.

### 5.7 Submitted result

`GET /api/assessments/attempts/:attemptId/result`

PRE response:

```json
{
  "result": {
    "attemptId": 20,
    "type": "PRE",
    "status": "SUBMITTED",
    "attemptNumber": 1,
    "submittedAt": "2026-09-25T11:00:00.000Z",
    "diagnosticCompleted": true,
    "scoreVisible": true,
    "pointsEarned": 4,
    "maxPoints": 10,
    "percentage": 40
  },
  "attempts": { "used": 1, "max": 1, "remaining": 0 },
  "reviewAvailable": false
}
```

The PRE result omits `passed` entirely.

POST response:

```json
{
  "result": {
    "attemptId": 44,
    "type": "POST",
    "status": "SUBMITTED",
    "attemptNumber": 2,
    "submittedAt": "2026-09-25T12:10:00.000Z",
    "scoreVisible": true,
    "pointsEarned": 8,
    "maxPoints": 10,
    "percentage": 80,
    "passed": true
  },
  "attempts": { "used": 2, "max": 3, "remaining": 1 },
  "officialGrade": {
    "attemptId": 44,
    "attemptNumber": 2,
    "percentage": 80,
    "submittedAt": "2026-09-25T12:10:00.000Z"
  },
  "firstPost": {
    "attemptId": 40,
    "attemptNumber": 1,
    "percentage": 70
  },
  "prePercentage": 40,
  "learningGain": {
    "value": 30,
    "unit": "percentage points",
    "label": "+30 percentage points",
    "prePercentage": 40,
    "firstPostPercentage": 70
  },
  "reviewAvailable": false
}
```

When `showScoreAfterSubmission` is false, `scoreVisible` is false and POST `passed` remains available as the assessment outcome; it is not an answer key. The response must omit `pointsEarned`, `maxPoints`, `percentage`, `officialGrade`, `firstPost`, `prePercentage`, and `learningGain` entirely rather than returning them as `null` or zero.

When review is allowed, append:

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
      "explanation": "Arrays use brackets after the type."
    }
  ]
}
```

The configured policy string itself is not exposed as a teacher-only setting.

## 6. Exact teacher route contracts

All routes use `authMiddleware` and the existing teacher/admin role policy. Every operation then calls `requireManagedClassroom` and cross-checks `assessmentId` against `classroomId`.

### 6.1 List lesson assessments

`GET /api/teacher/classrooms/:classroomId/assessments?lessonKey=arrays`

`lessonKey` is required and must be academic. Returns 200:

```json
{
  "lessonKey": "arrays",
  "assessments": {
    "PRE": {
      "exists": true,
      "id": 11,
      "published": true,
      "questionCount": 10,
      "attemptsExist": true
    },
    "POST": {
      "exists": false
    }
  }
}
```

POST summaries additionally include passing percentage, max attempts, and `requirePassingForCompletion`. The query uses a bounded aggregate/include strategy rather than per-assessment count queries.

### 6.2 Create draft

`POST /api/teacher/classrooms/:classroomId/assessments`

Request:

```json
{
  "lessonKey": "arrays",
  "type": "POST",
  "title": "Arrays post-test",
  "instructions": "Choose one answer.",
  "isRequired": true,
  "passingPercentage": 75,
  "maxAttempts": 3,
  "requirePassingForCompletion": true,
  "showScoreAfterSubmission": true,
  "answerReviewPolicy": "AFTER_FINAL_ATTEMPT",
  "shuffleQuestions": true,
  "shuffleChoices": true
}
```

The service applies Phase B defaults before validation and always creates `isPublished = false`, `publishedAt = null`, and `version = 1`. PRE invariants override/reject incompatible input. Returns 201 with the teacher editor serializer and an empty question array. A duplicate classroom/lesson/type returns 409 `ASSESSMENT_TYPE_EXISTS`.

### 6.3 Get editor data

`GET /api/teacher/classrooms/:classroomId/assessments/:assessmentId`

Returns 200:

```json
{
  "assessment": {
    "id": 12,
    "classroomId": 7,
    "lessonKey": "arrays",
    "type": "POST",
    "title": "Arrays post-test",
    "instructions": "Choose one answer.",
    "isRequired": true,
    "isPublished": false,
    "publishedAt": null,
    "passingPercentage": 75,
    "maxAttempts": 3,
    "gradeCalculation": "HIGHEST",
    "requirePassingForCompletion": true,
    "showScoreAfterSubmission": true,
    "answerReviewPolicy": "AFTER_FINAL_ATTEMPT",
    "shuffleQuestions": true,
    "shuffleChoices": true,
    "version": 3,
    "attemptsExist": false,
    "structureLocked": false,
    "questions": [
      {
        "id": 101,
        "questionText": "Which declaration is valid?",
        "questionType": "MULTIPLE_CHOICE",
        "displayOrder": 0,
        "points": 2,
        "explanation": "Arrays use brackets after the type.",
        "objectiveKey": "array-declaration",
        "choices": [
          {
            "id": 1001,
            "choiceText": "int[] values",
            "displayOrder": 0,
            "isCorrect": true
          }
        ]
      }
    ]
  }
}
```

### 6.4 Atomic draft graph save

`PUT /api/teacher/classrooms/:classroomId/assessments/:assessmentId`

Request:

```json
{
  "version": 3,
  "settings": {
    "title": "Arrays post-test",
    "instructions": "Choose one answer.",
    "isRequired": true,
    "passingPercentage": 75,
    "maxAttempts": 3,
    "requirePassingForCompletion": true,
    "showScoreAfterSubmission": true,
    "answerReviewPolicy": "AFTER_FINAL_ATTEMPT",
    "shuffleQuestions": true,
    "shuffleChoices": true
  },
  "questions": [
    {
      "questionText": "Which declaration is valid?",
      "questionType": "MULTIPLE_CHOICE",
      "points": 2,
      "explanation": "Arrays use brackets after the type.",
      "objectiveKey": "array-declaration",
      "choices": [
        { "choiceText": "int[] values", "isCorrect": true },
        { "choiceText": "int values", "isCorrect": false }
      ]
    }
  ]
}
```

Array position defines display order; client-supplied server IDs and display-order fields are rejected. The operation replaces the complete graph atomically and returns the editor payload with `version = 4`.

Draft validation permits:

- zero questions;
- questions with zero or incomplete choice sets;
- no correct answer or multiple marked answers while authoring;
- incomplete TRUE/FALSE answer semantics.

Every persisted draft row must still satisfy database-safe minimums:

- nonblank title and included question/choice text;
- recognized question type;
- positive bounded points;
- maximum question/choice counts;
- boolean `isCorrect` when provided;
- valid optional objective key.

If the assessment is currently published, graph save uses full publish validation. A teacher must explicitly unpublish an untouched assessment before saving an incomplete graph.

### 6.5 Publish

`POST /api/teacher/classrooms/:classroomId/assessments/:assessmentId/publish`

Request:

```json
{ "version": 4 }
```

Inside one transaction the service locks the assessment, rechecks ownership/classroom/version/attempt count, loads the full graph, runs `validateAssessmentForPublish`, and sets `isPublished = true`, `publishedAt = now`, and `version = 5`.

Returns 200:

```json
{
  "assessment": { "id": 12, "isPublished": true, "publishedAt": "2026-09-25T12:00:00.000Z", "version": 5 },
  "warnings": {
    "existingStudentProgressCount": 4,
    "grandfatheringRequiredLater": true
  }
}
```

The warning count is the number of distinct active classroom students with server-side `UserProgress` evidence for a level key belonging to the lesson. Evidence means any of: started timestamp, positive progress, positive attempt count, completion, or recorded time. It does not block publication and does not claim to detect localStorage reading.

### 6.6 Unpublish

`POST /api/teacher/classrooms/:classroomId/assessments/:assessmentId/unpublish`

Request:

```json
{ "version": 5 }
```

The transaction locks the assessment and rejects if any attempt exists. On success it sets `isPublished = false`, `publishedAt = null`, increments the version, and returns the updated publication fields. An already-unpublished assessment returns the current safe editor state without decrementing or duplicating version changes.

### 6.7 Delete untouched draft

`DELETE /api/teacher/classrooms/:classroomId/assessments/:assessmentId`

No body. The service locks and requires both `isPublished = false` and zero attempts. Returns 204. Published assessments or attempted assessments return 409; deletion never cascades historical data.

### 6.8 Raw teacher results

`GET /api/teacher/classrooms/:classroomId/assessments/:assessmentId/results`

Returns 200:

```json
{
  "assessment": {
    "id": 12,
    "lessonKey": "arrays",
    "type": "POST",
    "title": "Arrays post-test",
    "passingPercentage": 75,
    "maxAttempts": 3
  },
  "results": [
    {
      "student": {
        "id": 42,
        "firstName": "Ada",
        "lastName": "Learner",
        "username": "ada"
      },
      "attemptId": 44,
      "attemptNumber": 2,
      "submittedAt": "2026-09-25T12:10:00.000Z",
      "pointsEarned": 8,
      "maxPoints": 10,
      "percentage": 80,
      "passed": true,
      "isOfficial": true,
      "isFirstSubmittedPost": false
    }
  ]
}
```

The query performs one ordered submitted-attempt query with an eager-loaded student projection (`id`, `firstName`, `lastName`, `username`). It groups rows by student in memory and calls the centralized Phase B selectors to mark official and first POST attempts. It does not fetch responses and does not run one query per student.

## 7. Draft, edit, and publication lifecycle

```text
create -> DRAFT version 1
  -> save incomplete or complete draft (version increments)
  -> publish only if fully valid (version increments)
  -> unpublish only if zero attempts (version increments)
  -> delete only if unpublished and zero attempts

first attempt created
  -> all settings and graph content locked permanently in V1
  -> unpublish rejected
  -> deletion rejected
  -> results remain reproducible
```

V1 does not classify any setting as safely mutable after an attempt. Titles, instructions, thresholds, attempt limits, shuffle settings, answer-review settings, question content, choices, answers, points, order, and objectives all remain unchanged. A future versioning phase may add clone-and-republish behavior.

## 8. Validation rules

### 8.1 Draft validation

`validateAssessmentDraft` applies configuration invariants and persistence-safe field validation but does not require a gradable graph. It does not call publish validation internally.

### 8.2 Publish validation

`validateAssessmentForPublish` remains the single full-graph validator. It requires at least one question, positive total points, valid question types, valid choice counts/text, exactly one correct choice, and exact TRUE/FALSE semantics.

### 8.3 Objective keys

`objectiveKey` is optional. When present it must:

- be lowercase;
- use ASCII letters and digits;
- use single hyphens between segments;
- contain no leading/trailing/consecutive hyphen;
- fit the existing 120-character limit.

Pattern:

```regex
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

No curriculum objective registry is introduced in Phase C.

## 9. Transaction and locking boundaries

### Student mutations

- Start/resume retains the Phase B transaction and parent-assessment row lock.
- Autosave retains the Phase B attempt row lock and response upsert transaction.
- Submission retains the Phase B attempt row lock, authoritative grading, all-response persistence, and atomic final attempt save.
- HTTP routes do not wrap these service transactions in another transaction.

### Teacher mutations

- Create uses one transaction and relies on the unique classroom/lesson/type index as the final race-safe duplicate guard.
- Save graph locks the assessment row, rechecks the version and attempt count, validates the entire incoming draft, deletes the old graph, creates the replacement graph, updates settings, and increments version in one transaction.
- Publish locks the assessment row, rechecks version and attempt count, validates the persisted graph, computes warning metadata, and updates publication state in one transaction.
- Unpublish locks the assessment row and rejects any existing attempt before changing publication state.
- Delete locks the assessment row and rechecks draft status and attempt count before deletion.

The assessment row is the lock-order root for every teacher mutation. This prevents update/publish/unpublish/delete races and aligns with Phase B start locking.

## 10. Idempotency behavior

- The HTTP submission idempotency key comes only from `Idempotency-Key`.
- Missing, repeated, comma-joined, malformed, shorter-than-8, or longer-than-96 values return 400 `INVALID_SUBMISSION_KEY`.
- The route forwards the validated string as Phase B `submissionKey`.
- First submission grades and persists atomically.
- Same attempt plus the same key returns the immutable stored result with 200.
- Same attempt plus a different key returns 409 `ATTEMPT_ALREADY_SUBMITTED`.
- A key already used for another attempt returns 409 `SUBMISSION_CONFLICT`.
- Concurrent same-key requests serialize through the attempt lock; the second returns the stored result.
- Concurrent different-key requests serialize; one succeeds and one receives the submitted conflict.

## 11. Answer-review-policy behavior

Review is evaluated only for submitted attempts and never affects scoring.

| Policy | Review availability |
|---|---|
| `NEVER` | Never expose correctness, correct choice IDs, or explanations. |
| `AFTER_SUBMISSION` | Expose review for the requested submitted attempt immediately. |
| `AFTER_FINAL_ATTEMPT` | Expose review only when submitted attempts are at least `maxAttempts` and no active attempt exists. |

`AFTER_FINAL_ATTEMPT` is an exhaustion policy: "final" means all allowed attempts have been consumed, not merely the student's most recent or latest submitted attempt. The persisted enum name remains unchanged to preserve the Phase B schema. PRE defaults to `NEVER`. For unavailable review, the payload contains only `reviewAvailable: false`; it does not include empty review rows carrying selected/correctness metadata. For available review, each row is built by joining persisted responses to the server-loaded question graph. Correct choice IDs are never accepted from request input.

## 12. Authorization flow

### Student

1. `authMiddleware` validates JWT, account status, token version, and policy acceptance.
2. Student-role middleware rejects teachers/admins from student attempt routes.
3. Route validates primitive identifiers.
4. Service derives classroom identity from the requested classroom or persisted assessment/attempt.
5. `requireActiveStudentMembership` checks the exact classroom and student.
6. Assessment/attempt ownership and publication/version checks run in the domain service.

No endpoint uses a client classroom ID to override the classroom stored on an assessment or attempt.

### Teacher/admin

1. `authMiddleware` runs.
2. Existing `requireRole("teacher", "admin")` policy runs.
3. `requireManagedClassroom` requires teacher ownership; admin behavior matches existing teacher routes.
4. `requireAssessmentInClassroom` loads by both classroom and assessment ID.
5. Mutation services repeat scope checks inside their transaction before locking or changing data.

## 13. HTTP and error contract

All assessment-domain errors use:

```json
{ "code": "STABLE_CODE", "message": "Safe user-facing message" }
```

Optional safe metadata such as `currentVersion` may be included. Stack traces, SQL, table names, constraint names, and raw Sequelize messages are never returned.

| Condition | Status | Code |
|---|---:|---|
| Malformed JSON | 400 | `INVALID_REQUEST`; app-level error middleware recognizes the body-parser syntax error before the generic 500 path. |
| Invalid ID, lesson key, type, query, unknown body field | 400 | `INVALID_REQUEST` or the specific `INVALID_LESSON_KEY` / `INVALID_ASSESSMENT_TYPE`. |
| Invalid draft question/choice field | 400 | `INVALID_QUESTION` / `INVALID_CHOICE`. |
| Missing/malformed idempotency key | 400 | `INVALID_SUBMISSION_KEY`. |
| Missing/invalid/expired authentication | 401 | Existing `authMiddleware` message contract. |
| Wrong role or out-of-scope classroom/student | 403 | Existing role middleware response or `FORBIDDEN`. |
| Missing assessment | 404 | `ASSESSMENT_NOT_FOUND`. |
| Unpublished assessment requested by student | 404 | `ASSESSMENT_NOT_PUBLISHED`. |
| Missing attempt | 404 | `ATTEMPT_NOT_FOUND`. |
| Invalid complete graph at publish | 422 | `ASSESSMENT_INVALID`. |
| Duplicate classroom/lesson/type | 409 | `ASSESSMENT_TYPE_EXISTS`. |
| Stale teacher version | 409 | `ASSESSMENT_VERSION_CONFLICT`, with `currentVersion`. |
| Any edit/unpublish/delete after an attempt | 409 | `ASSESSMENT_LOCKED`. |
| Delete of a still-published untouched assessment | 409 | `ASSESSMENT_PUBLISHED`. |
| Submitted attempt mutation/different-key retry | 409 | `ATTEMPT_ALREADY_SUBMITTED`. |
| Submitted-attempt limit reached | 409 | `MAX_ATTEMPTS_REACHED`. |
| Idempotency key used by another attempt | 409 | `SUBMISSION_CONFLICT`. |
| Assessment version changed under an active attempt | 409 | `ASSESSMENT_VERSION_CONFLICT`. |
| Unexpected server/database error | 500 | `SERVER_ERROR` with a generic message. |

Phase B codes are translated at one boundary:

- `ASSESSMENT_UNAVAILABLE` -> `ASSESSMENT_NOT_PUBLISHED`
- `NOT_ENROLLED` and `ATTEMPT_FORBIDDEN` -> `FORBIDDEN`
- `QUESTION_NOT_PRESENTED` -> `INVALID_QUESTION`
- `CHOICE_NOT_IN_QUESTION` / `INVALID_RESPONSE` -> `INVALID_CHOICE`
- `ATTEMPT_SUBMITTED` -> `ATTEMPT_ALREADY_SUBMITTED`
- `MAX_ATTEMPTS` -> `MAX_ATTEMPTS_REACHED`
- `ASSESSMENT_IMMUTABLE` -> `ASSESSMENT_LOCKED`
- `ASSESSMENT_VERSION_MISMATCH` -> `ASSESSMENT_VERSION_CONFLICT`
- `SUBMISSION_KEY_CONFLICT` -> `SUBMISSION_CONFLICT`

## 14. Student and teacher serialization separation

### Student allowlist

Before review is permitted, student output may contain only:

- assessment identity, lesson/type/title/instructions/version;
- question identity/text/type/points/objective key;
- choice identity/text;
- attempt identity/status/order-derived graph/selected choice;
- submitted aggregate score fields when score visibility permits;
- pass outcome for POST;
- attempt counts, official grade, first POST, and learning gain when score visibility permits.

Forbidden recursively:

- `isCorrect`;
- `correctChoiceId`;
- question or choice answer keys;
- explanation;
- `passingPercentage` and `passingPercentageApplied`;
- `gradeCalculation`;
- `answerReviewPolicy`;
- `createdBy`;
- another student's IDs, attempts, responses, or results;
- raw Sequelize association objects.

### Teacher allowlist

After authorization, editor output may include settings, correct-choice flags, explanations, objective keys, version, attempt existence, and lock state. It does not include submission keys or unrelated student/private account data.

## 15. Teacher results-query design

The result endpoint uses one `AssessmentAttempt.findAll` call with:

- `where: { assessmentId, classroomId, status: SUBMITTED }`;
- eager-loaded `student` with only `id`, `firstName`, `lastName`, and `username`;
- deterministic order by student ID, attempt number, and submission timestamp;
- only result columns needed by the endpoint.

The service groups attempts per student in memory and calls `selectOfficialPostAttempt` and `selectFirstSubmittedPostAttempt`. PRE rows never receive an official/highest marker. This is raw management data only; it does not add class aggregates or modify the existing analytics service.

## 16. Security threat cases

The design explicitly addresses:

- **Answer-key enumeration:** all student serializers are recursive allowlists; discovery never returns a graph; unavailable review loads no serialized answer data.
- **Mass assignment:** mutation routes reject unknown keys; score/result fields cannot reach domain services.
- **Classroom-ID substitution:** assessment and attempt classroom IDs come from persisted records and are cross-checked against exact membership.
- **Object-ID guessing:** teacher assessments are loaded by `(assessmentId, classroomId)`; student attempts require ownership.
- **Role confusion:** student and teacher routers have different role policies and serializers.
- **Stale overwrites:** update, publish, and unpublish recheck version under a row lock; delete rechecks current publication and attempt state under the same lock.
- **Historical corruption:** the first attempt locks all settings and graph content; FKs and service checks prevent deletion.
- **Duplicate creation:** unique index plus translated unique-constraint error.
- **Double submit/two tabs:** header idempotency maps to Phase B locks and unique submission keys.
- **Question/choice substitution:** Phase B validates that questions were presented and choices belong to that question.
- **Malformed parameter bypass:** strict positive-integer parsing, enum membership, exact known-body keys, and bounded strings/arrays.
- **Error leakage:** centralized translation returns no SQL, constraints, stacks, or model dumps.
- **N+1 result disclosure/performance:** teacher results use one eager-loaded query and an explicit attribute projection.
- **Late PRE rollout ambiguity:** publish reports server-observable game-progress count as a warning only; no progression rule is activated.

## 17. Complete test matrix

### 17.1 Policy and serializer unit tests

- Draft may contain zero questions.
- Draft may contain incomplete choices/no correct choice.
- Included draft rows must meet persistence-safe minimums.
- Published graph still requires complete valid questions and answers.
- Valid lowercase kebab-case objective key accepted.
- uppercase, whitespace, underscore, leading/trailing/consecutive hyphen objective keys rejected.
- Player serializer recursively contains no forbidden key at any depth.
- Teacher serializer includes correct-choice and explanation fields.
- PRE result omits pass/fail.
- Hidden-score POST result retains `passed` but omits `pointsEarned`, `maxPoints`, `percentage`, `officialGrade`, `firstPost`, `prePercentage`, and `learningGain`.
- Review serializer emits answer data only when explicitly authorized by the read service.

### 17.2 Phase B attempt-service extension tests

- New attempt returns no saved responses.
- Resumed attempt returns selected-choice recovery only.
- Active attempt retrieval preserves question/choice order.
- Active attempt retrieval rejects another student.
- Active attempt retrieval rejects removed/wrong classroom membership.
- Submitted attempt cannot be retrieved through the active endpoint.
- No safe attempt output contains correctness or explanation fields.

### 17.3 Student integration tests

- Unauthenticated requests return 401.
- Teacher/admin on student routes follow the student-role rejection policy.
- Student outside the explicit classroom receives 403.
- Discovery with no published assessment returns explicit 200 unavailable state and no graph.
- Discovery returns status only, never questions/choices.
- Published assessment graph is accessible to an exact member.
- Unpublished assessment graph returns 404.
- Player graph recursively excludes forbidden fields.
- First attempt returns 201.
- Active attempt resumes with 200 and the same ID/order.
- PRE second submitted attempt returns max-attempt conflict.
- POST attempt 2 is allowed and POST max attempts are enforced.
- Refresh returns stable question and choice order.
- Autosave stores a valid choice and returns no correctness.
- Null autosave clears an answer.
- Foreign/not-presented question is rejected.
- Foreign/mismatched choice is rejected.
- Score-like submit body fields are rejected.
- Missing/malformed `Idempotency-Key` is rejected.
- Valid submit returns server score.
- Same-key retry returns the identical stored result.
- Different-key retry returns conflict.
- Two-tab concurrency preserves one immutable result.
- Another student cannot retrieve active attempt, responses, or result.
- PRE result has diagnostic completion and no `passed` key.
- POST result exposes pass outcome.
- Official POST is highest with deterministic tie behavior.
- First POST is distinct from official highest.
- Learning gain uses first POST and percentage-point semantics.
- POST with `showScoreAfterSubmission = false` retains `passed` while omitting `pointsEarned`, `maxPoints`, `percentage`, `officialGrade`, `firstPost`, `prePercentage`, and `learningGain` as absent keys.
- `NEVER` exposes no answer review.
- `AFTER_SUBMISSION` exposes review only after submission.
- `AFTER_FINAL_ATTEMPT` hides review after the student's latest submission while any allowed attempt remains, and exposes it only when `submittedAttempts >= maxAttempts` and no active attempt exists.

### 17.4 Teacher integration tests

- Unauthenticated requests return 401.
- Student role cannot use teacher routes.
- Teacher cannot access another teacher's classroom.
- Admin behavior matches existing teacher route scope.
- Guessed assessment ID from another classroom is rejected.
- List returns PRE/POST existence and bounded counts.
- Create PRE applies diagnostic defaults.
- Create POST applies 75%/3/HIGHEST defaults.
- Creation is always draft.
- Duplicate type returns translated 409.
- Tutorial/unknown lesson key is rejected.
- Editor data includes correct-choice and explanation fields.
- Incomplete draft graph can be saved.
- Draft graph ordering comes from arrays, not injected display-order fields.
- Valid objective key saves; malformed key is rejected.
- Draft version increments.
- Stale version is rejected before graph deletion.
- Concurrent version change is rechecked under lock.
- Published assessment save requires a publishable graph.
- Valid graph publishes and increments version.
- Invalid graph publish returns 422 without partial publication.
- PRE publish returns existing-progress warning count without blocking.
- Unpublish with zero attempts succeeds.
- Unpublish after an attempt is rejected.
- Any settings or structural edit after an attempt is rejected.
- Untouched unpublished draft deletion returns 204.
- Published deletion is rejected.
- Attempted deletion is rejected.
- Failed graph persistence rolls back settings, graph, and version.
- Results endpoint enforces classroom isolation.
- Results contain only allowed student identity fields and result columns.
- Official and first-POST markers use centralized selectors.
- Results query count remains bounded and does not grow with student count.

### 17.5 Security regression additions

Recursively assert no answer keys through:

- discovery;
- normal student assessment GET;
- start response;
- resume response;
- active-attempt GET;
- autosave response;
- PRE result with `NEVER`;
- POST result before `AFTER_FINAL_ATTEMPT` becomes available;
- malformed query/body attempts containing grading-key names.

Also assert:

- student A cannot read student B's attempt, selections, or result;
- student cannot switch classrooms using path/body IDs;
- teacher A cannot access teacher B's assessment or results using guessed IDs;
- raw Sequelize/database errors are translated;
- response objects contain no unexpected nested association keys.

### 17.6 Full regression and scope audit

- Run Phase B policy and attempt suites.
- Run serializer, student route, teacher route, and security suites.
- Run the full `npm test` command; baseline is 160 tests and Phase C must increase it.
- Run `git diff --check`.
- Inspect `git status`, changed paths, staged paths, and untracked paths.
- Assert no changes under frontend, progression/access services, game/map code, XP, or hint code.

## 18. Implementation order

1. Add failing policy/serializer tests for draft validation, objective keys, and recursive data separation.
2. Implement constants, draft policy, serializer, and error contracts.
3. Add failing Phase B service-extension tests, then implement safe response recovery and active-attempt retrieval.
4. Add failing student route tests, then implement authorization/read services and the thin student router.
5. Add failing teacher service/route tests for list/create/editor/draft save and implement those operations.
6. Add failing publish/unpublish/delete/version/rollback tests and implement transactional lifecycle actions.
7. Add failing teacher results tests and implement the bounded result query.
8. Extend security regression tests, register routers and test suites, then run targeted and full verification.

No Phase D progression work begins after step 8.

## 19. Deferred work

- PRE/module/game progression gates and grandfathering policy enforcement.
- Protected built-in lesson delivery and completion semantics.
- React assessment player and teacher builder.
- Assessment analytics integration and class learning-gain dashboards.
- Clone/version-history workflow for attempted assessments.
- Assessment XP, deadlines, and time limits.

Phase C supplies the API and security foundation those later phases require without activating them.
