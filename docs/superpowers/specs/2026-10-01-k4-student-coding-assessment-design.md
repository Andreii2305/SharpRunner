# K4 Student Coding Assessment Design

## Goal

Add CODING questions to the existing student PRE/POST assessment experience without exposing teacher-only grading material or weakening the secure-execution boundary.

## Safety architecture

Authoritative submission uses three phases. A short transaction reserves the attempt by moving it from `IN_PROGRESS` to `GRADING`, storing the client submission key, a server-generated opaque lease token, and a lease expiry. The reservation reads and validates the assessment graph and saved responses while locks prevent concurrent mutation. Secure compilation and execution then happen with no database transaction open. A second short transaction re-locks the attempt, verifies the lease, key, status, assessment version, and saved response snapshot, then atomically persists every response grade and the submitted aggregate.

Infrastructure failure never becomes a student result. The owning worker uses a short transaction to return the attempt to `IN_PROGRESS`, clear reservation metadata, preserve responses, and leave all score fields unset. A valid lease blocks duplicate work. The same submission key observes the existing grading reservation. A different key conflicts. An expired lease can be replaced deterministically; a stale worker cannot release or finalize a newer lease.

## Run Code

`POST /api/assessments/attempts/:attemptId/questions/:questionId/run` accepts an empty body. The server authenticates the student, checks exact attempt ownership and active state, validates the player gate and CODING question, loads the student's persisted source, selects only `PUBLIC` cases, and invokes K2A secure execution. A repository-standard bounded rate limiter protects capacity. The response contains only public inputs, public expected outputs, safe actual outputs, pass/fail status, and sanitized bounded diagnostics. It never mutates scores, responses, or attempt state.

## Student state and UI

The existing assessment state and save coordinator become response-type aware. Choice responses serialize only `selectedChoiceId`; CODING responses serialize only `sourceCode`. Source edits are debounced and serialized per question, preserve route/request fencing, and flush before navigation, Run Code, and submission. No student source enters browser persistence.

An absent CODING response displays starter code but remains unanswered. Any persisted source, including an intentionally empty string, is restored exactly. A coding question counts as answered only when the server-saved source contains non-whitespace content.

The existing player renders a shared Monaco C# editor, method signature, public examples, save status, Run Code control, and safe feedback. `GRADING` is a read-only recoverable state with bounded polling. Result/review rendering may show the student's source under the existing review policy and preserves hidden-score behavior.

## Security and deployment

Student serializers recursively exclude reference solutions, hidden test definitions/counts/weights, lease metadata, harness details, runner configuration, and container metadata. `CODING_ASSESSMENT_PLAYER_ENABLED` and authoritative execution remain default OFF. Tests enable them only through injected environments. `render.yaml` is unchanged and direct mode remains ineligible. K5 analytics are out of scope.

## Verification

Focused tests cover lease concurrency and stale recovery, execution outside transactions, atomic failure/finalization, saved-source-only public execution, DTO leak prevention, typed autosave and restore, mixed-question navigation, grading recovery, PRE/POST semantics, result/review policy, accessibility, and responsive structure. Full backend, frontend, lint, build, K2A, K3, progression, analytics, protected-content, practice, and compiler checks run before completion.
