# Coding assessments

CODING questions are part of the existing PRE/POST assessment domain. Version 1 accepts C# source for one required `public static` method using the K2A METHOD contract and its deterministic type allowlist. Teachers configure starter source, the method contract, and weighted PUBLIC/HIDDEN cases. Executable teacher-authored harness code is not supported.

## Release gates

The student implementation is present, but `CODING_ASSESSMENT_PLAYER_ENABLED` remains default OFF. A deliberate deployment or development environment may set it to `true`; doing so only permits the student CODING graph and player. It does not enable execution.

Authoritative coding execution is independently default OFF and must pass the K2A secure-capability check. Docker secure-runner mode and the dedicated runner role are required. Direct mode, including the current Render web-service configuration, is ineligible. `render.yaml` is intentionally unchanged.

## Student data and saves

Student graph DTOs contain the starter source, fixed method contract, and PUBLIC examples only. HIDDEN inputs, expected outputs, weights, counts, reference solutions, grading leases, harness details, and runner configuration remain server-only.

Source is stored only in `AssessmentResponse.sourceCode`. The browser does not persist it. A source response and a choice response are mutually exclusive on both request and response DTOs. Intentionally empty persisted source is restored as empty; starter code is used only when no response exists. A CODING question is considered answered in the review UI only after a server-saved, non-whitespace source response exists.

## Run Code

`POST /api/assessments/attempts/:attemptId/questions/:questionId/run` accepts an empty body. It verifies the authenticated student, active owned attempt, player gate, assessment version, CODING question, and secure execution capability. It executes the server-saved source against PUBLIC cases only through K2A. It never grades, mutates points, finalizes the response, submits the attempt, consumes a POST attempt, or reveals hidden-case counts.

Run Code is limited to 10 requests per minute for each student/attempt pair. Run Code and authoritative grading currently share K2A secure-runner capacity; K4 does not add a queue. Safe results can include bounded diagnostics and public input, expected output, actual output, status, and pass/fail. Infrastructure failures are reported as unavailable, never as a wrong answer.

## Authoritative submission

Submission uses three phases:

1. A short database transaction validates authority and the immutable graph/response snapshot, then reserves a `GRADING` lease.
2. K2A executes all authoritative PUBLIC and HIDDEN inputs outside any database transaction.
3. A short transaction verifies the lease and unchanged snapshot, then atomically persists response grades and the final attempt aggregate.

The same submission key observes an active lease without launching duplicate execution. A competing key cannot double-grade. An expired lease can be replaced, while a stale worker cannot finalize or release its replacement. Infrastructure failure releases only the owned lease, returns the attempt to `IN_PROGRESS`, preserves source, and commits no partial score. Student-code outcomes retain K2B grading semantics; infrastructure failure never becomes student zero.

The player treats `GRADING` as immutable and polls authoritative result state on a bounded backoff. Refresh/revisit restores the same grading state. If the lease is released after an infrastructure failure, the attempt becomes retryable with the same opaque submission key.

PRE remains diagnostic and completes after successful authoritative submission regardless of score. POST continues to use existing passing, attempt-limit, official-best, first-submitted learning-gain, exhaustion, and recovery rules. No coding-specific progression or analytics UI is introduced.

## Result and review

When the existing answer-review policy allows review, a student can see their submitted source in a read-only editor. Correctness, points, and explanations remain conditional on the existing score-visibility policy. Reference solutions and all HIDDEN material are never returned. Run Code feedback is non-authoritative and is not reused as the submitted grade.
