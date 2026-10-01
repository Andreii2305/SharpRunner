# Coding assessment domain

K2B adds `CODING` to the existing PRE/POST assessment domain. Version 1 accepts C# source for one required `public static` method using the K2A METHOD contract and its deterministic type allowlist. Teachers configure starter source, a type and method name, ordered parameter types, a return type, and weighted PUBLIC/HIDDEN test cases. Executable teacher-authored harness code is not supported.

Student DTOs contain the starter source, method contract, and PUBLIC examples only. HIDDEN inputs, expected outputs, weights, counts, and runner details remain server-only. Source is autosaved in `AssessmentResponse.sourceCode`; choice and source answers are mutually exclusive, and autosave never grades.

At submission, every authoritative PUBLIC and HIDDEN input is executed through K2A. K2A creates a fresh isolated execution context per input. The server compares typed outputs and awards:

`question points × (passed test weight / total test weight)`

Points use the assessment domain's two-decimal precision. `isCorrect` is true only when all authoritative weight passes. Compile, signature, runtime, output, timeout, and resource outcomes caused by submitted code receive zero for the affected tests. Partial successful invocations retain their proportional credit.

An infrastructure error, unavailable secure capability, or malformed secure-runner result aborts the submission transaction. The attempt remains `IN_PROGRESS`, its idempotency key is not consumed, and no response grading or partial assessment result is committed. Current deployment configuration keeps authoritative execution disabled; Render direct mode is not eligible because capability requires Docker mode and the dedicated runner role.

`CODING_ASSESSMENT_PLAYER_ENABLED` is a separate default-off release gate. While K3/K4 UI is absent, CODING graphs cannot be published or opened/started through student APIs. Enabling the player later does not enable execution; both gates remain independent and authoritative submission still requires K2A's secure capability.

PRE remains diagnostic: coding points affect the diagnostic percentage but never create pass/fail state. POST uses the same passing percentage, attempt limits, official-highest selection, first-POST learning gain, exhaustion, and recovery behavior as choice questions.
