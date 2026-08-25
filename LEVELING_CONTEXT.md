# Leveling Context

Last updated: 2026-08-22

## Current Curriculum

SharpRunner uses a level-driven architecture. Each playable level is built from a config, a validator, game events, and a Phaser scene.

The backend now uses the 30-row tutorial/Arrays/Functions/Functions-with-Arrays/final curriculum. The frontend exposes 29 playable routes; one Functions scene covers curriculum levels 24–25.

The curriculum/story plan in `NEW_CURRICULUM_STORY_PLAN.md` is implemented. `CURRICULUM_MIGRATION_PLAN.md` remains as historical migration context rather than a list of pending work.

## Lesson Structure

- Tutorial / Prologue: 5 levels.
- Arrays: 8 levels.
- Functions and Methods: 12 progress slots across 11 routes; the level 24 scene covers curriculum levels 24–25.
- Functions with Arrays: 4 levels.
- Final combined Bakunawa challenge: 1 level.

Backend default progress rows are defined in:

- `backend/src/constants/progressDefaults.js`
- `backend/src/services/progressService.js`

## Implemented Game Architecture

- `frontend/src/pages/game/GamePage.jsx`
  - Loads level config.
  - Shows Monaco C# editor.
  - Handles timer, attempts, hints, dialogue overlay, result messages, and completion modal.
  - Saves completion through the backend.
- `frontend/src/pages/game/Game.jsx`
  - Mounts the Phaser game.
- `frontend/src/pages/game/gameEvents.js`
  - Shared event bridge between React and Phaser scenes.
- `frontend/src/pages/game/levels/levelConfigs.js`
  - Main level content/config source for currently playable levels.
- `frontend/src/pages/game/levels/validators.js`
  - Validator implementations.
- `frontend/src/pages/game/levels/buildValidator.js`
  - Builds validators from teacher override config.
- `frontend/src/pages/game/scenes/`
  - Phaser scenes for current levels.

## Current Playable Curriculum

- Tutorial / Prologue: 5 levels.
- Arrays: 8 levels.
- Functions and Methods: 12 progress rows across 11 routes.
- Functions with Arrays: 4 levels.
- Final Bakunawa challenge: 1 level.

The legacy five-level descriptions below describe only the tutorial/prologue.

### Level 1 - The Awakening

- Concept: integer variables.
- Goal: declare `int steps = <number>;`.
- Game reaction: move to portal based on step count.

### Level 2 - What Is Your Name?

- Concept: string variables.
- Goal: declare `string myName = "Kai";`.
- Game reaction: introduce the player to the NPC.

### Level 3 - Voices of the Village

- Concept: multiple string variables.
- Goal: declare `voice1`, `voice2`, and `voice3` as non-empty strings.
- Game reaction: restore villagers' voices.

### Level 4 - The Coin Keeper

- Concept: integer values as quantities.
- Goal: declare `int coins = 20;`.
- Game reaction: pay toll and lower bridge.

### Level 5 - Potion Measure

- Concept: decimal variables.
- Goal: declare `double measurement = 4.5;`.
- Game reaction: shatter seal and activate cauldron.

## Current Validation Types

- `singleInteger`
  - Requires one integer declaration with a configured variable name and min/max value.
- `exactGoal`
  - Requires exact declaration name, type, and assigned value.
- `multiString`
  - Requires multiple non-empty string declarations.

## Grading And Progress

- `attemptCount` stores failed submissions only and is incremented after an incorrect outcome. A correct first submission therefore has `attemptCount === 0`; the dashboard uses that definition for first-attempt completions.
- Timer starts through the backend when a level begins.
- Completion is saved with `progressPercent: 100`.
- Backend computes and stores `finalScore`.
- Backend derives `grade` from `finalScore` in the progress payload.
- The game completion modal uses the backend-saved score and grade.
- The default Basic Hint unlock is three failed attempts; teachers may configure 1–10 or disable both hint tiers.
- Once unlocked, the Basic Hint is free and a protected Detailed Hint can be purchased once for 15 XP.
- Hint use/purchase metadata and one-time first-completion XP are saved centrally. Detailed-hint text is returned only after authorization confirms purchase.
- XP is separate from score. Completion is +20 XP, first attempt +10, and no hint +5.
- Replay remains available but does not overwrite the original score/attempt record or award XP again.

Relevant files:

- `backend/src/routes/progress.js`
- `backend/src/services/progressService.js`
- `backend/src/models/UserProgress.js`
- `frontend/src/pages/game/GamePage.jsx`

## Playable-Level Hint Audit

The authoritative Basic and Detailed Hint text is stored server-side in `backend/src/constants/levelHintCatalog.js`. It is deliberately not reproduced in this public-facing document. Automated tests require a unique objective, Basic Hint, and Detailed Hint for every playable key and reject missing, shallow, duplicate, or copy-ready entries.

| SharpRunner level | Playable key | Audited learning objective |
| --- | --- | --- |
| 1 | `tutorial-level-1` | Integer variable controlling portal distance |
| 2 | `tutorial-level-2` | Exact string declaration for the hero name |
| 3 | `tutorial-level-3` | Three non-empty string variables |
| 4 | `tutorial-level-4` | Integer quantity matching the bridge toll |
| 5 | `tutorial-level-5` | Double value matching a decimal measurement |
| 6 | `arrays-level-1` | Ordered integer-array declaration |
| 7 | `arrays-level-2` | Ordered string-array declaration |
| 8 | `arrays-level-3` | Zero-based selection of the boss flame |
| 9 | `arrays-level-4` | Zero-based inventory selection |
| 10 | `arrays-level-5` | 3-by-3 rectangular ward array |
| 11 | `arrays-level-6` | Rectangular checkpoint/path representation |
| 12 | `arrays-level-7` | Complete string-array traversal |
| 13 | `arrays-level-8` | Element-by-element jar scanning |
| 14 | `functions-level-1` | Define and call a no-parameter void method |
| 15 | `functions-level-2` | Call a predefined method |
| 16 | `functions-level-3` | Define and call `LightFlame` |
| 17 | `functions-level-4` | Define and call `SealShrine` |
| 18 | `functions-level-5` | Return and store an integer method result |
| 19 | `functions-level-6` | Return and store a string method result |
| 20 | `functions-level-7` | Pass a string argument to a predefined method |
| 21 | `functions-level-8` | Pass an integer argument to a predefined method |
| 22 | `functions-level-9` | Add parameters and return calculated power |
| 23 | `functions-level-10` | Multiply parameters and return healing |
| 24–25 | `functions-level-11` | Recursive base case, smaller call, and unwind order |
| 26 | `functions-with-arrays-level-1` | Pass an integer array to a method |
| 27 | `functions-with-arrays-level-2` | Traverse, conditionally count, and return |
| 28 | `functions-with-arrays-level-3` | Pass a rectangular array to a method |
| 29 | `functions-with-arrays-level-4` | Nested traversal and conditional 2D count |
| 30 | `final-level-1` | Combined arrays, methods, traversal, return values, 2D arrays, and recursion |

Each entry was checked against the live goal, instructions, starter-code structure, curriculum concept, and validator expectations. Hints use identifiers students already see but do not include a complete ready-to-submit solution.

## Teacher Level Settings

Teachers can currently configure these per-classroom level settings:

- availability and display order
- unlock date and time
- due date and time
- hints enabled/disabled
- hint unlock threshold
- wrong-attempt and late-day grading deductions

The current teacher UI does not edit lesson text, goals, instructions, starter code, dialogue, result messages, or validator configuration. Although the backend model retains older content-override columns, they are not supported teacher-facing functionality.

Relevant files:

- `backend/src/models/LevelContentOverride.js`
- `backend/src/routes/teacher.js`
- `frontend/src/pages/teacher/TeacherLevelEditorPage.jsx`

## Pending Leveling Work

1. Add disposable PostgreSQL tests for migration constraints and XP transaction locking.
2. Improve academic score breakdown presentation.
3. Reduce the production Phaser/config bundle size.
4. Keep curriculum text, dialogue, starter code, maps, and validators system-managed.

## Suggested Next Focus

Complete Lesson 1 levels 6-10 first. This gives SharpRunner one complete playable module and makes the teacher dashboard, scoring, map, and progress systems easier to demonstrate end to end.
