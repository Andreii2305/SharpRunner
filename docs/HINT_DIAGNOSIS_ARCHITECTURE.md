# Hint diagnosis architecture

## Ownership

- `frontend/src/pages/game/levels/validators.js` owns deterministic, challenge-specific validation and returns the structured failure contract.
- `backend/src/services/levelCodeValidationService.js` is authoritative for attempts. It compiles first, then runs the matching challenge validator only after successful compilation.
- `backend/src/services/failureClassificationService.js` normalizes compiler diagnostics and structured validator failures. Message-regex classification remains only for legacy compatibility.
- `backend/src/constants/levelHintCatalog.js` owns free/basic hints only.
- `backend/src/constants/levelSituationalHintCatalog.js` owns paid personalized/stronger hints, supported failure codes, and level fallbacks.
- `backend/src/services/hintResolverService.js` enforces `supportedFailureCodes` and renders safe stored metadata where a level-specific hint benefits from it.
- `backend/src/services/gamificationService.js` remains the separate, transactional authority for the one-time 30-XP purchase.

## Data flow

```text
student source
  -> authenticated attempt/completion API
  -> isolated compile-only Roslyn request
     -> compilation failure: normalized COMPILER_* diagnosis
     -> compilation success: server-selected challenge validator
  -> structured failure { code, category, metadata }
  -> latestFailureCode/category/metadata on UserProgress
  -> supported-code-aware hint resolver
  -> level-specific paid hint or level fallback
  -> stronger stage after another failed attempt
```

The client does not submit an authoritative failure code. Compiler output, validator selection, diagnosis persistence, hint ownership, and XP charging all remain server-controlled.

## Failure contract

```js
// Failure
{
  isCorrect: false,
  failure: {
    code: "WRONG_ARRAY_INDEX",
    category: "wrong_logic",
    metadata: {
      arrayName: "names",
      methodName: "CheckName",
      loopVariable: "i",
      actualIndexExpression: "1",
      expectedIndexExpression: "i"
    }
  },
  message: "The loop is present, but CheckName receives the same or wrong array position instead of the current one."
}

// Success
{
  isCorrect: true,
  failure: null,
  message: "Code accepted.",
  payload: {}
}
```

The backend also exposes the existing flat `failureCode`, `category`, and `metadata` fields for API/database compatibility. Metadata is bounded to safe scalar fields before persistence.

## Compatibility and remaining coupling

All 29 playable routes (covering curriculum levels 1–30) use the structured adapter. Existing validator success checks were preserved. The Kapre/jar traversal validator has dedicated checks for array presence and values, loop presence/start/bounds/update, call placement, and current-index usage.

If a validator has no structured failure, the backend retains the old payload/message classifier as a legacy fallback. If Roslyn is unavailable, the lightweight syntax classifier and validator still operate; the service logs that fallback.

The backend still reads validator configuration and imports validator factories from the frontend source tree. That coupling was intentionally not moved during this correctness change. A later refactor should move validator factories/configuration into a shared challenge package without changing the public contract.
