# Coding assessments

CODING questions are part of the existing PRE/POST assessment domain and use an explicit execution format. `METHOD` preserves the original required `public static` method contract and deterministic type allowlist. `PROGRAM` accepts a complete C# console program with an entry point and grades bounded standard input to normalized standard output. Existing coding rows are additively backfilled as `METHOD`.

Starter code is optional scaffolding, and the teacher-only reference solution is optional metadata rather than grading authority. An omitted value is normalized to the canonical empty string. Every published CODING question requires at least one valid test case. PUBLIC cases are student-visible examples used by Run Code, while HIDDEN cases are optional server-only grading cases.

PROGRAM output comparison normalizes CRLF and CR to LF, removes trailing whitespace from each line, and ignores blank lines only at the end. It preserves line order, case, internal spaces, and all other meaningful content. Each stdin value is limited to 4 KB, expected output to 8 KB, aggregate inputs to 16 KB, source to 16 KB, and a request to ten cases.

## METHOD authoring

Teachers give each METHOD parameter a C# identifier name as well as a type. For example, a `SumArray` question uses `numbers : int[]`, shows the required signature `public static int SumArray(int[] numbers)`, and stores its test input as a structured array. The teacher adds the values `1`, `2`, and `3` with the individual array controls, sees the display-only preview `[1, 2, 3]`, and enters `6` as the expected return value.

The notation `[1, 2, 3] -> 6` is only conceptual shorthand. Teachers do not type the arrow or a manually parsed array string: inputs remain typed structured values, and the expected return is a separate typed field. Parameter names are authoring/display metadata; execution still pairs each test input with its parameter type by array index. Reordering or deleting a parameter therefore moves its name, type, and corresponding value in every existing test together.

Historical METHOD questions whose stored parameter-name field is missing or `NULL` display deterministic names `arg1`, `arg2`, and so on. They remain valid without a destructive backfill or a write merely from being read. A newly added parameter instead starts with an explicit empty name and must receive a valid, unique, non-keyword C# identifier before publication.

## Release gates

The student implementation is present, but `CODING_ASSESSMENT_PLAYER_ENABLED` remains default OFF. A deliberate deployment or development environment may set it to `true`; doing so only permits the student CODING graph and player. It does not enable execution.

Authoritative coding execution is independently default OFF and must pass the K2A secure-capability check. Docker secure-runner mode and the dedicated runner role are required. Direct mode, including the current Render web-service configuration, is ineligible. `render.yaml` is intentionally unchanged.

## Student data and saves

Student graph DTOs contain the starter source, execution mode, the METHOD contract when applicable, and PUBLIC examples only. HIDDEN inputs, expected outputs, weights, counts, reference solutions, grading leases, harness details, and runner configuration remain server-only.

Source is stored only in `AssessmentResponse.sourceCode`. The browser does not persist it. A source response and a choice response are mutually exclusive on both request and response DTOs. Intentionally empty persisted source is restored as empty; starter code is used only when no response exists. A CODING question is considered answered in the review UI only after a server-saved, non-whitespace source response exists.

## Run Code

`POST /api/assessments/attempts/:attemptId/questions/:questionId/run` accepts an empty body. It verifies the authenticated student, active owned attempt, player gate, assessment version, CODING question, and secure execution capability. It executes the server-saved source against PUBLIC cases only through K2A. It never grades, mutates points, finalizes the response, submits the attempt, consumes a POST attempt, or reveals hidden-case counts.

Run Code is limited to 10 requests per minute for each student/attempt pair. Run Code and authoritative grading currently share K2A secure-runner capacity; K4 does not add a queue. Safe results can include bounded diagnostics and public input, expected output, actual output, status, and pass/fail. Infrastructure failures are reported as unavailable, never as a wrong answer.

## Authoritative submission

Submission uses three phases:

1. A short database transaction validates authority and the immutable graph/response snapshot, then reserves a `GRADING` lease.
2. K2A executes all authoritative PUBLIC and HIDDEN cases outside any database transaction. METHOD uses the trusted reflection harness; PROGRAM compiles an executable once and launches a fresh isolated container for each stdin value.
3. A short transaction verifies the lease and unchanged snapshot, then atomically persists response grades and the final attempt aggregate.

The same submission key observes an active lease without launching duplicate execution. A competing key cannot double-grade. An expired lease can be replaced, while a stale worker cannot finalize or release its replacement. Infrastructure failure releases only the owned lease, returns the attempt to `IN_PROGRESS`, preserves source, and commits no partial score. Student-code outcomes retain K2B grading semantics; infrastructure failure never becomes student zero.

The player treats `GRADING` as immutable and polls authoritative result state on a bounded backoff. Refresh/revisit restores the same grading state. If the lease is released after an infrastructure failure, the attempt becomes retryable with the same opaque submission key.

PRE remains diagnostic and completes after successful authoritative submission regardless of score. POST continues to use existing passing, attempt-limit, official-best, first-submitted learning-gain, exhaustion, and recovery rules. Coding does not introduce a separate progression rule.

## Result and review

When the existing answer-review policy allows review, a student can see their submitted source in a read-only editor. Correctness, points, and explanations remain conditional on the existing score-visibility policy. Reference solutions and all HIDDEN material are never returned. Run Code feedback is non-authoritative and is not reused as the submitted grade.

## Coding-aware teacher analytics

The existing assessment analytics results contract includes a question-performance breakdown for each CODING question. It is calculated from submitted attempts only and contains the question order/label, submitted-response count, fully-correct count/rate, average awarded points, maximum points, and average percentage of question points earned. The query selects only persisted grading fields (`questionId`, `isCorrect`, and `pointsAwarded`); it does not load student source.

PRE question performance remains diagnostic and is not described as passing or failing. POST question performance is explicitly separate from the backend-selected official assessment grade. The UI does not rank students, infer per-test outcomes, or expose source, reference solutions, HIDDEN definitions/counts/weights, lease data, or runner details.

## Feature-gate matrix

| Player gate | Execution gate / runner | Teacher behavior | Student access | Run Code | Coding submission and safe failure |
| --- | --- | --- | --- | --- | --- |
| OFF | OFF | CODING drafts can be saved; CODING publication is blocked. | CODING graph/player is unavailable. | Unavailable. | Unavailable; no attempt is graded or consumed. |
| ON | OFF | Complete CODING assessments can be published. | Player, autosave, review, and recovery are available. | Fails closed as temporarily unavailable. | Fails closed before authoritative grading; saved source and the in-progress attempt remain retryable. |
| ON | ON, runner ineligible | Publication and player behavior are the same as above. | Player remains available. | Secure-capability check rejects the run. | Secure-capability check rejects grading; no partial grade or student zero is persisted. |
| ON | ON, eligible authenticated Docker runner | Publication and player are available. | Full CODING experience is available. | Executes server-saved source against PUBLIC cases only. | Three-phase lease/fencing flow executes PUBLIC and HIDDEN cases through K2A and atomically finalizes the authoritative grade. |

Feature gating is not sandboxing. It prevents entry to an unsafe capability; only an eligible runner supplies the required isolation.

## Production enablement checklist

`CODING_ASSESSMENT_PLAYER_ENABLED` may be enabled only after all of these are complete:

- [ ] K3, K4, and K5 are deployed together.
- [ ] The complete assessment migration chain has been applied successfully to the production-compatible database.
- [ ] Production teacher and student routes have been verified in their explicit classroom scope.
- [ ] Recursive DTO leak tests pass in the deployed revision.
- [ ] An authenticated teacher/student smoke test covers create, publish, autosave, revisit, result, and review behavior.

Authoritative coding execution may be enabled only after the player checklist and every item below are complete:

- [ ] An eligible secure runner is deployed with an authenticated API-to-runner transport and is not an open public compiler.
- [ ] The immutable/trusted sandbox image identity is recorded and deployed.
- [ ] Per-job containers have network disabled, a read-only root, isolated bounded temporary filesystems, non-root execution, dropped capabilities, and `no-new-privileges`.
- [ ] Hard memory/swap, CPU, PID, wall-clock, and output limits are verified against the live kernel/runtime.
- [ ] Timeout/cancellation/output-limit paths kill the complete process tree and clean job files/containers.
- [ ] The job environment contains no application secrets and the job has no host-filesystem access beyond its isolated mounts.
- [ ] Fresh compile/invocation environments behave as designed and live containment tests pass without mocks or weakened assertions.
- [ ] Live clean-install and upgrade migration verification passes on a disposable PostgreSQL/Supabase-compatible database.
- [ ] Authenticated Run Code, authoritative grading, and infrastructure-failure retry smoke tests pass.
- [ ] Runner capacity, monitoring, saturation behavior, and incident response are understood.

Both coding gates remain default OFF until these checklists are complete and an explicit deployment decision enables them.

## Current Render limitation

The repository's current Render runner uses direct execution mode. It does not provide the K2A per-job Docker/OCI boundary and is therefore **not eligible** for authoritative assessment execution. `render.yaml` keeps the player and execution gates off. Switching a feature flag does not add containment and must not be treated as a substitute for it.

Production execution requires a separate authenticated runner host/service that can launch the trusted sandbox image as a fresh constrained container for each compile and invocation, or an equivalently isolated execution service whose controls pass the same live containment tests. The present repository evidence does not establish that capability on the current Render service.

## Migration and direct-database readiness

The schema evolves additively from the base PRE/POST assessment tables through CODING question/test/response columns, teacher reference solutions, the nullable METHOD `codingParameterNames` JSONB metadata column, and the K4 `GRADING` lease fields/status constraint. The parameter-name migration performs no historical-row backfill; `NULL` remains the legacy `argN` signal. Foreign keys, assessment/question ordering uniqueness, response attempt/question uniqueness, choice/source exclusivity, points precision, lease-state checks, and supporting indexes are defined in the migration chain. The application remains the only assessment data authority exposed to students; assessment tables are not granted through a student-facing direct-database contract, and API serializers/authorization keep classroom, ownership, hidden grading data, reference solutions, and lease tokens scoped server-side.

SQL inspection and automated migration-contract tests do not replace a live database exercise. A clean install and a representative upgrade on disposable PostgreSQL/Supabase-compatible infrastructure remain mandatory deployment QA before either coding gate is enabled.

## Final threat review

| Threat | Code-level mitigation | Remaining deployment dependency |
| --- | --- | --- |
| Infinite loop | Per-invocation wall deadline and forced container removal. | Verify complete process-tree termination live. |
| Fork/process bomb | PID limit, dropped capabilities, non-root job. | Verify the host enforces PID/cgroup limits. |
| Memory exhaustion | Hard memory/swap and tmpfs limits. | Verify live kernel/cgroup enforcement. |
| Huge output | Combined bounded output and forced termination. | Verify live output-limit containment. |
| Filesystem read/write | Read-only root and isolated bounded job/tmpfs mounts. | Verify mount and host-path isolation live. |
| Environment-secret access | Environment is rebuilt from an allowlist; application secrets are not inherited. | Inspect the deployed job environment. |
| Network access | Per-job network is disabled. | Verify network denial in live containment tests. |
| Reflection | Source policy rejects reflection APIs; trusted host performs only the fixed method lookup. | Keep the policy/host image immutable and retest it. |
| Unsafe/PInvoke | Source policy rejects unsafe/native interop and the compiler contract disallows it. | Verify the deployed image has no bypass path. |
| Child process | Source policy rejects process APIs; non-root, capabilities, PID, and container limits provide defense in depth. | Verify child/process-tree behavior live. |
| HIDDEN-test extraction | HIDDEN definitions/counts/weights never enter student DTOs; each invocation is isolated. | Monitor deployed DTO contracts and runner logs. |
| Reference-solution extraction | Reference source is accepted/serialized only on teacher-authorized paths and is never sent to execution or student DTOs. | Preserve classroom-scoped teacher authorization. |
| DTO probing | Explicit allowlist serializers and recursive forbidden-key tests. | Repeat deployed route smoke/leak tests. |
| IDOR | Explicit classroom, assessment, attempt, question, and student ownership checks; no primary-classroom fallback. | Retain authorization regression coverage. |
| Replay/double submit | Opaque submission key, persistent lease, snapshot/version checks, and atomic finalization. | Use a shared durable production database. |
| Stale lease | Expiry recovery plus token ownership/fencing prevents stale finalization or release. | Keep worker clocks and database availability reliable. |
| Rate-limit abuse | Attempt/student Run Code limiter and bounded runner capacity. | Configure monitoring and capacity response. |
| Malformed runner response | Execution contract validates and bounds runner results, then fails closed as infrastructure unavailable. | Authenticate and monitor the deployed runner. |
| Runner impersonation | Shared authenticated transport and capability attestation are required. | Deploy/rotate protected credentials and restrict runner exposure. |
| Browser-storage leakage | Source, HIDDEN/reference/lease/runner data are not persisted; only the opaque submission key may use session storage. | Re-run storage audits on frontend changes. |

## Readiness classification

Passing repository tests can establish implementation readiness while production execution remains blocked. Production execution is not ready until live database migrations, live kernel containment, authenticated smoke tests, and operational readiness all pass on the intended deployment.
