# Leveling Context

Last updated: 2026-05-27

## Current Direction

SharpRunner uses a level-driven architecture. Each playable level is built from a config, a validator, game events, and a Phaser scene.

The current backend progress model still supports the older 4 lessons with 10 levels each, but the frontend currently has playable configs/scenes for Lesson 1 levels 1-5 only.

A new curriculum/story plan is now being reviewed in `NEW_CURRICULUM_STORY_PLAN.md`. The proposed direction keeps the first 5 playable levels as a tutorial/prologue, then adds a 25-level Filipino myth horror main story focused on Arrays, Functions/Methods, and Functions/Methods with Arrays.

The code migration path for that curriculum pivot is documented in `CURRICULUM_MIGRATION_PLAN.md`.

## Lesson Structure

- Lesson 1: Variables and Data Types
- Lesson 2: Operators
- Lesson 3: Conditional Statements
- Lesson 4: Loops

Each lesson is planned for 10 levels.

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

## Current Playable Levels

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

- Attempts are incremented after failed outcomes.
- Timer starts through the backend when a level begins.
- Completion is saved with `progressPercent: 100`.
- Backend computes and stores `finalScore`.
- Backend derives `grade` from `finalScore` in the progress payload.
- The game completion modal uses the backend-saved score and grade.

Relevant files:

- `backend/src/routes/progress.js`
- `backend/src/services/progressService.js`
- `backend/src/models/UserProgress.js`
- `frontend/src/pages/game/GamePage.jsx`

## Teacher Overrides

Teachers can override selected level content per classroom:

- lesson title/description
- goal title/description
- instruction items
- starter code
- validator config

Relevant files:

- `backend/src/models/LevelContentOverride.js`
- `backend/src/routes/teacher.js`
- `frontend/src/pages/teacher/TeacherLevelEditorPage.jsx`

## Pending Leveling Work

1. Build Lesson 1 levels 6-10.
2. Decide whether Level 10 is a boss level.
3. Add map art/node behavior for completed Lesson 1.
4. Expand validators as levels become more advanced.
5. Add command-queue execution if the game needs direct method-call animation.
6. Add teacher-editable dialogue and result message overrides.
7. Add full level content for Lessons 2-4 after Lesson 1 is complete.

## Suggested Next Focus

Complete Lesson 1 levels 6-10 first. This gives SharpRunner one complete playable module and makes the teacher dashboard, scoring, map, and progress systems easier to demonstrate end to end.
