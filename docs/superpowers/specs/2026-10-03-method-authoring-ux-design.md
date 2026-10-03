# METHOD Authoring UX Design

## Goal

Make METHOD coding questions understandable to teachers by giving every parameter a meaningful display name and by separating typed inputs from expected return values in the test-case editor. Preserve the existing positional execution, grading, security, publication, and PROGRAM contracts.

## Baseline and audited contract

The synchronized baseline is `102d15fe7caaf9757443144e0bd4a8e3e441739b` on clean `main`, matching `origin/main` with `0 0` divergence.

METHOD parameters currently persist only as `AssessmentQuestions.codingParameterTypes` JSONB. Teacher and student UIs synthesize `argN` or `valueN` labels. The teacher payload, backend policy, teacher serializer, player serializer, Run Code path, authoritative submission path, secure execution contract, and .NET reflection host all use an ordered type array. Test inputs are ordered arrays at the same indexes. The reflection host selects a public static method by type/class, method name, return type, and ordered parameter types; parameter names are not execution authority.

No existing field contains parameter names. Durable teacher save/reload and student signature display therefore require one additive persisted field. Replacing `codingParameterTypes` with structured objects would disturb the established execution boundary and is rejected.

## Persistence and compatibility

Add nullable JSONB `AssessmentQuestions.codingParameterNames`, modeled as `codingParameterNames` in Sequelize and exposed as `methodContract.parameterNames` only on METHOD teacher/player DTOs. The teacher DTO preserves `NULL` so hydration can identify a legacy contract; the student DTO always contains resolved safe names.

The migration is additive and performs no backfill:

- Existing METHOD rows retain `codingParameterNames = NULL`.
- PROGRAM, MULTIPLE_CHOICE, and TRUE_FALSE rows remain unchanged.
- A clean install receives the column through the registered migration sequence.
- An upgrade adds the column without rewriting assessment rows.
- `codingParameterTypes` remains unchanged and authoritative for execution.

For an explicit names array, `codingParameterNames.length` must equal `codingParameterTypes.length`. Each pair at an index describes one display parameter. Names preserve array order.

### Legacy fallback

A shared conceptual resolver returns the display name at each type index:

1. If a persisted explicit name exists at that index, use it.
2. If the entire names field is missing or `NULL`, return `arg${index + 1}`.

The resolver does not mutate the row and serializers do not persist their derived result. Merely reading a historical assessment never rewrites it. Existing published assessments with `NULL` names remain valid and executable.

Teacher hydration maps a legacy `NULL` response to controlled `argN` values. Those populated fallback values are valid form state, unlike an explicit empty name added by the teacher. If the teacher later edits and saves that question, the normal save graph may persist the currently controlled fallback names. There is no bulk migration or read-time write, and a GET alone cannot change persistence.

### New versus legacy empty state

New METHOD questions begin with `parameterNames: []`. Adding a parameter appends its type, a structured default test input, and the explicit controlled name `""`. The name field uses an example-like `parameterName` placeholder; the placeholder is never data.

This yields an intentional distinction:

- Missing/`NULL` persisted names: legacy contract, valid `argN` fallback.
- Explicit names array with an empty item: newly authored incomplete contract, invalid for publication and shown after touch or a validation attempt.

No code silently converts an explicit empty item to `argN` when saving or validating. Signature preview may render `<parameter name>` for that incomplete item.

## Validation

Explicit parameter names use bounded ordinary C# identifier validation:

- Required and non-whitespace.
- Match `[A-Za-z_][A-Za-z0-9_]*`.
- Maximum length 64 characters, matching the bounded method-name scale.
- Reject C# reserved keywords such as `class`, `return`, `int`, and `public`.
- Reject duplicate names using C#'s case-sensitive identifier semantics.
- Require the explicit name count to match the type count.

The implementation does not silently trim, sanitize, escape with `@`, or rewrite names. Contextual keywords are not added to the reserved-keyword rejection set unless they are ordinary reserved keywords; the feature is intentionally not a full C# lexer.

Frontend errors are:

- `Parameter name is required.`
- `Use a valid C# parameter name.`
- `Parameter names must be unique.`

Each field uses `aria-invalid` and `aria-describedby`. Errors appear after the individual field is touched or after the existing save/publish validation attempt, consistent with the current type/method field behavior. Duplicate errors identify every conflicting explicit name. Legacy fallback values do not produce errors.

The backend independently validates explicit arrays at the teacher boundary and domain layer. Missing/`NULL` names remain accepted for legacy METHOD questions. PROGRAM must not accept or persist METHOD names.

## Teacher state and atomic parameter operations

The teacher METHOD contract adds `parameterNames` alongside `parameterTypes`. State helpers treat a parameter as three aligned positional values: name, type, and each test case's input item.

- Add appends `""`, the selected type, and the type's structured default input.
- Rename changes only the name at the selected index.
- Change type changes the type and resets only the corresponding structured test input.
- Reorder moves the name and type together and applies the same move to every test input array.
- Delete removes the name and type together and removes the same input index from every test case.
- METHOD to PROGRAM retains the existing destructive-switch confirmation and resets METHOD names, types, and typed tests instead of leaking them into PROGRAM.
- PROGRAM to METHOD retains the existing safe reset and never reinterprets stdin/stdout as typed values.

Save serialization carries explicit `parameterNames` only for METHOD. Hydration copies explicit names and resolves legacy missing names for controlled display without a database write. Save/reload must preserve names, types, arrays, expected returns, and order.

## Teacher parameter editor and signature preview

Each parameter row displays a compact `Parameter N` heading, a visible `Parameter name` text input, a visible `Type` select, and the existing reorder/delete actions. Desktop/laptop layouts may place name and type side by side. Tablet/mobile layouts stack fields and keep actions reachable without horizontal overflow.

The signature preview derives only from controlled state:

```csharp
public static int SumArray(int[] numbers)
public static int CountAbove(int[] numbers, int limit)
```

An explicit empty name displays `<parameter name>` in the preview. A legacy missing-name contract displays `argN`. Starter code stays optional and is never rewritten when names change. The required signature preview remains visually adjacent to the METHOD contract and authoritative copy explains that students must implement it.

Locked/published behavior continues to disable all fields and controls through the existing fieldsets and editor read-only settings.

## METHOD test-case authoring

METHOD cards visually separate inputs, expected result, and metadata while retaining the current visibility, weight, ordering, and deletion behavior.

For each positional parameter, use its resolved safe name:

- Heading: `Input for numbers` with the name visually formatted as code.
- Type copy: `int[] array` for arrays or `int` for a scalar.
- Scalar controls retain existing typed input behavior.
- Array controls retain the existing structured typed array as authority.
- Array item action copy becomes `Add value`.
- Each array shows a display-only `Array preview: [...]` that updates from controlled values.

Preview formatting uses JSON-compatible values for supported one-dimensional types:

- `int[]`: `[1, 2, 3]`
- `long[]`: `[-5, 5, 10]`
- `string[]`: `["Ana", "Ben"]`
- `bool[]`: `[true, false]`
- Empty array: `[]`

The preview is never parsed back into data. Teachers edit individual structured controls and never type conceptual arrow notation.

The METHOD expected field is labeled `Expected return value`, followed by its return type. PROGRAM retains `Expected output`, stdin/stdout explanatory text, and all existing behavior. A separate arrow summary is omitted because the labeled input/return sections and array preview already communicate the relationship without adding card noise.

Multiple parameters render in order and remain visually distinct. For `CountAbove(int[] numbers, int limit)`, one test contains an array editor/preview for `numbers`, a scalar editor for `limit`, and one expected return editor. Labels fall back to `argN` only for legacy contracts.

PUBLIC/HIDDEN copy keeps the current policy: PUBLIC is a student-visible example used by Run Code; HIDDEN is optional server-only grading. Validation semantics do not change.

## Student METHOD contract

The teacher serializer includes the persisted nullable `parameterNames` value in METHOD `methodContract`, allowing teacher hydration to distinguish a legacy row from an explicit array. The player serializer includes resolved `parameterNames`. The player signature pairs the resolved name and type at each index, producing meaningful signatures and deterministic `argN` signatures for legacy questions.

The player receives only resolved names needed for display. Existing recursive allowlists continue to exclude reference solutions, HIDDEN definitions/counts/inputs/expected values/weights, grading leases, runner configuration, and other teacher-only fields. Public examples remain unchanged.

Student starter code is not rewritten. The displayed required signature is authoritative. Student METHOD examples and Run Code feedback can retain their existing public value formatting; this task changes the contract name display without widening exposed grading data.

## Execution and grading boundary

`codingAssessmentService.contractForQuestion` continues returning only:

- `typeName`
- `methodName`
- `parameterTypes`
- `returnType`

`secureCodingExecutionContract`, secure execution services, Docker runner requests, the .NET `MethodContract`, reflection selection, input deserialization, and method invocation remain unchanged. Test values remain positional. Parameter names are never sent to or required by the runner, never select inputs, and never affect comparison, weights, partial credit, rounding, leases, or transaction boundaries.

Run Code remains PUBLIC-only. Authoritative submission continues using PUBLIC and HIDDEN cases through the existing three-phase lease flow. PROGRAM execution and comparison remain unchanged.

## Security

Parameter names are validated at browser/domain boundaries before display in trusted signature text. React text rendering and `<code>` content provide normal escaping. Names are not interpolated into shell commands, Docker arguments, generated executable commands, or trusted source. No `eval`, source refactoring, dynamic shell composition, or name-based invocation is introduced.

The additive serializer field is reviewed against recursive disclosure tests. The change does not expose reference solutions or any hidden-test material. Feature-gate defaults, K2A eligibility, and Render limitations remain unchanged.

## Test-first implementation

Every production change follows a red-green-refactor cycle. Focused tests are added before implementation.

### Backend/domain and API

- Model/migration includes nullable `codingParameterNames` and no destructive backfill.
- Explicit names persist and serialize in teacher save/reload.
- Count mismatch is rejected.
- Valid identifiers including `_numbers` and `value1` pass.
- empty, whitespace, digit-leading, spaces, punctuation, reserved keywords, and duplicates fail.
- Missing/`NULL` names resolve to `argN` and remain accepted for historical published questions.
- Player DTO includes resolved names and excludes hidden/reference material recursively.
- Teacher DTO includes names without arbitrary nested fields.
- Run Code still supplies a name-free execution contract and PUBLIC cases only.
- Authoritative grading still supplies a name-free execution contract and preserves weighted results.
- PROGRAM, MULTIPLE_CHOICE, and TRUE_FALSE reject or omit METHOD-only name configuration as appropriate.

### Teacher frontend

- New name and type fields render with correct accessible associations.
- SumArray and CountAbove signatures use controlled meaningful names in order.
- untouched empty names do not show premature errors; touch/validation attempt does.
- invalid, reserved, duplicate, and count-mismatch states are rejected.
- reorder keeps name/type/test input aligned.
- delete removes the aligned name/type/input.
- save normalization and hydration retain explicit names.
- legacy missing names display `argN` without invalid state.
- METHOD input labels use resolved names.
- arrays say `Add value` and preview supported values immediately.
- METHOD says `Expected return value`; PROGRAM still says `Expected output`.
- scalar and multiple-parameter tests remain editable.
- locked fields stay disabled.
- CSS assertions or structural render tests cover stackable responsive grids and non-overflow control groups.

### Student frontend

- Meaningful names render in METHOD signatures.
- missing names render deterministic `argN` signatures.
- METHOD instructions and public examples remain present.
- PROGRAM signature behavior remains unchanged.
- rendered output contains no reference solution or hidden material.

### Migration

- Migration registration follows the current latest migration.
- SQL is additive, contains `ADD COLUMN IF NOT EXISTS ... JSONB`, and contains no destructive backfill/drop/truncate/delete.
- Model field supports clean-schema creation.
- Legacy NULL, non-coding question types, and PROGRAM compatibility are verified structurally and through domain tests.

## Documentation and verification

Update `docs/CODING_ASSESSMENTS.md` with the concrete `SumArray` authoring example and clarify that `[1, 2, 3] -> 6` is conceptual shorthand while teachers use structured controls.

Verification includes focused teacher, student, backend domain/API, migration, serialization, Run Code, grading, and security tests; full backend and frontend suites; frontend lint; frontend production build; applicable host/security checks; `git diff --check`; and final Git status/name/status/stat inspection. Browser QA covers SumArray and CountAbove at desktop, laptop, tablet, and mobile when the local app and browser tooling are available; otherwise the limitation is reported explicitly.

## Out of scope and stop conditions

Do not change secure execution architecture, METHOD positional invocation, historical rows destructively, grading semantics, PROGRAM execution/UI semantics, PRE/POST behavior, progression, analytics, feature-gate defaults, or Render eligibility. Do not expose hidden tests or reference solutions. Discovery of a required change in any of those areas stops implementation for renewed approval.

No files are staged, committed, or pushed during this work.

## Acceptance examples

`SumArray` saves and reloads with `parameterNames: ["numbers"]`, `parameterTypes: ["int[]"]`, structured input `[[1, 2, 3]]`, expected return `6`, and preview `public static int SumArray(int[] numbers)`.

`CountAbove` saves and reloads with aligned pairs `numbers/int[]` and `limit/int`, structured positional input `[[10, 20, 30, 40], 20]`, expected return `2`, and preview `public static int CountAbove(int[] numbers, int limit)`.

A legacy row with `codingParameterTypes: ["int[]", "int"]` and `codingParameterNames: NULL` loads and displays `arg1` and `arg2`, remains executable without modification, and does not acquire persisted names merely by being read.
