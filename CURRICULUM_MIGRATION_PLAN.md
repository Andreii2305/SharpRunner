# SharpRunner Curriculum Migration Plan

Last updated: 2026-06-01

## Purpose

This document describes how to migrate SharpRunner from the old curriculum:

- Variables and Data Types
- Operators
- Conditional Statements
- Loops

to the new approved/planned curriculum:

- Tutorial/Prologue
- Arrays
- Functions/Methods
- Functions/Methods with Arrays
- Final combined boss level

The story and level design are documented in `NEW_CURRICULUM_STORY_PLAN.md`.

## Current Technical State

The current backend progress system is defined in:

- `backend/src/constants/progressDefaults.js`
- `backend/src/services/progressService.js`
- `backend/src/routes/progress.js`
- `backend/src/routes/teacher.js`

The current frontend playable level config is defined in:

- `frontend/src/pages/game/levels/levelConfigs.js`
- `frontend/src/pages/game/levels/validators.js`
- `frontend/src/pages/game/levels/buildValidator.js`
- `frontend/src/pages/game/scenes/`

The current map is defined in:

- `frontend/src/pages/map/LessonMapPage.jsx`
- `frontend/src/pages/map/lessonOneMapConfig.js`
- `frontend/src/Components/LessonMap/LessonMap.jsx`

Important current assumptions:

- Progress keys use the pattern `<lesson-key>-level-<number>`.
- `progressService.parseLevelKey()` depends on the `-level-` pattern.
- Teacher analytics and dashboard routes use `DEFAULT_LEVEL_PROGRESS`.
- Teacher level overrides are keyed by `levelKey`.
- Existing playable levels 1-5 use progress keys like `variables-and-data-types-level-1`.

## Target Level Count

The proposed structure has:

- Tutorial/Prologue: 5 existing levels
- Main curriculum: 25 new levels

Target total:

```text
5 tutorial levels + 25 main levels = 30 total levels
```

If the panel requires exactly 25 total playable levels, this plan must be revised before implementation. The current recommendation is to keep the existing 5 levels as a separate tutorial and build 25 new main levels.

## Target Lesson Definitions

Use these backend lesson definitions:

```js
const LESSON_DEFINITIONS = [
  {
    lessonKey: "tutorial",
    lessonTitle: "Tutorial: First Compile Trial",
    totalLevels: 5,
  },
  {
    lessonKey: "arrays",
    lessonTitle: "Arrays",
    totalLevels: 8,
  },
  {
    lessonKey: "functions",
    lessonTitle: "Functions and Methods",
    totalLevels: 12,
  },
  {
    lessonKey: "functions-with-arrays",
    lessonTitle: "Functions with Arrays",
    totalLevels: 4,
  },
  {
    lessonKey: "final",
    lessonTitle: "Final: Bakunawa Eclipse",
    totalLevels: 1,
  },
];
```

This keeps the `-level-` progress key pattern:

```text
tutorial-level-1
...
tutorial-level-5
arrays-level-1
...
arrays-level-8
functions-level-1
...
functions-level-12
functions-with-arrays-level-1
...
functions-with-arrays-level-4
final-level-1
```

## Target Order Indexes

Order indexes should be global and continuous:

| Order Index | Level Key | Display Label |
|---:|---|---|
| 1 | `tutorial-level-1` | Tutorial 1 |
| 2 | `tutorial-level-2` | Tutorial 2 |
| 3 | `tutorial-level-3` | Tutorial 3 |
| 4 | `tutorial-level-4` | Tutorial 4 |
| 5 | `tutorial-level-5` | Tutorial 5 |
| 6 | `arrays-level-1` | Arrays 1 |
| 7 | `arrays-level-2` | Arrays 2 |
| 8 | `arrays-level-3` | Arrays 3 |
| 9 | `arrays-level-4` | Arrays 4 |
| 10 | `arrays-level-5` | Arrays 5 |
| 11 | `arrays-level-6` | Arrays 6 |
| 12 | `arrays-level-7` | Arrays 7 |
| 13 | `arrays-level-8` | Arrays 8 |
| 14 | `functions-level-1` | Functions 1 |
| 15 | `functions-level-2` | Functions 2 |
| 16 | `functions-level-3` | Functions 3 |
| 17 | `functions-level-4` | Functions 4 |
| 18 | `functions-level-5` | Functions 5 |
| 19 | `functions-level-6` | Functions 6 |
| 20 | `functions-level-7` | Functions 7 |
| 21 | `functions-level-8` | Functions 8 |
| 22 | `functions-level-9` | Functions 9 |
| 23 | `functions-level-10` | Functions 10 |
| 24 | `functions-level-11` | Functions 11 |
| 25 | `functions-level-12` | Functions 12 |
| 26 | `functions-with-arrays-level-1` | Functions with Arrays 1 |
| 27 | `functions-with-arrays-level-2` | Functions with Arrays 2 |
| 28 | `functions-with-arrays-level-3` | Functions with Arrays 3 |
| 29 | `functions-with-arrays-level-4` | Functions with Arrays 4 |
| 30 | `final-level-1` | Final |

## Progress Migration Decision

There are two options.

### Option A - Preserve Tutorial Progress

Map old completed levels 1-5 to the new tutorial keys:

| Old Key | New Key |
|---|---|
| `variables-and-data-types-level-1` | `tutorial-level-1` |
| `variables-and-data-types-level-2` | `tutorial-level-2` |
| `variables-and-data-types-level-3` | `tutorial-level-3` |
| `variables-and-data-types-level-4` | `tutorial-level-4` |
| `variables-and-data-types-level-5` | `tutorial-level-5` |

Pros:

- Existing student progress on playable levels is not lost.
- Good if this app already has demo/test users.

Cons:

- Needs a small data migration script or compatibility logic.
- Existing teacher overrides for old level keys need mapping if they matter.

### Option B - Reset Progress

Leave old rows in the database but filter them out by replacing `DEFAULT_LEVEL_PROGRESS`.

Pros:

- Simpler.
- Cleaner for a curriculum pivot.

Cons:

- Existing users lose visible progress.
- Demo data may look empty until students replay the tutorial.

### Recommendation

For capstone/demo development, use **Option B** unless there is important real student data. If demo continuity matters, use Option A.

No destructive database deletion is required for either option. The progress service already filters rows by `DEFAULT_LEVEL_KEY_SET`, so old rows can remain hidden.

## Backend Changes

### 1. Update `backend/src/constants/progressDefaults.js`

Replace the old `DEFAULT_LEVELS_PER_LESSON = 10` model with explicit lesson definitions and global order indexing.

Important:

- Keep `DEFAULT_LEVEL_PROGRESS`.
- Keep `LESSON_DEFINITIONS`.
- Export any helper constants only if existing imports require them.

Suggested implementation:

```js
const LESSON_DEFINITIONS = [
  { lessonKey: "tutorial", lessonTitle: "Tutorial: First Compile Trial", totalLevels: 5 },
  { lessonKey: "arrays", lessonTitle: "Arrays", totalLevels: 8 },
  { lessonKey: "functions", lessonTitle: "Functions and Methods", totalLevels: 12 },
  { lessonKey: "functions-with-arrays", lessonTitle: "Functions with Arrays", totalLevels: 4 },
  { lessonKey: "final", lessonTitle: "Final: Bakunawa Eclipse", totalLevels: 1 },
];

const DEFAULT_LEVEL_PROGRESS = [];
let orderIndex = 1;

for (const lesson of LESSON_DEFINITIONS) {
  for (let levelNumber = 1; levelNumber <= lesson.totalLevels; levelNumber += 1) {
    DEFAULT_LEVEL_PROGRESS.push({
      levelKey: `${lesson.lessonKey}-level-${levelNumber}`,
      lessonTitle: lesson.lessonTitle,
      orderIndex,
    });
    orderIndex += 1;
  }
}
```

### 2. Update `backend/src/services/progressService.js`

Likely changes:

- `parseLevelKey()` can stay because it supports any `<lesson-key>-level-N`.
- `formatCurrentLevelName()` currently formats `Level lessonOrder+1-levelNumber`; this should change to friendlier labels.
- `getParTimeSeconds()` currently treats levels 10/20/30/40 as boss levels. Update for 30 levels.

Suggested boss/final handling:

```js
const BOSS_ORDER_INDEXES = new Set([30]);
```

Possible par time:

- Tutorial: 15 minutes
- Arrays: 20 minutes
- Functions: 25 minutes
- Functions with Arrays: 30 minutes
- Final: 45 minutes

### 3. Update `backend/src/routes/progress.js`

Likely no structural change needed because it uses `DEFAULT_LEVEL_PROGRESS`.

Check:

- `LEVEL_KEYS` should update automatically from new defaults.
- `/api/progress/level/:levelKey/start`
- `/api/progress/level/:levelKey/attempt`
- `/api/progress/level/:levelKey`
- `/api/progress/level/:levelKey/content`

### 4. Update `backend/src/routes/teacher.js`

Likely no structural change needed, but verify:

- `EXPECTED_PROGRESS_ROWS_PER_STUDENT`
- `DEFAULT_LEVEL_KEYS`
- lesson insights grouping
- student grades
- level editor allowed keys

These should update automatically if `DEFAULT_LEVEL_PROGRESS` and `LESSON_DEFINITIONS` are correct.

### 5. Update `backend/src/data/lessonContent.seed.json`

If this seed is used in teacher dashboards or lesson content pages, update it to the new lessons.

## Frontend Changes

### 1. Rename/Reframe Current Level Configs

File:

- `frontend/src/pages/game/levels/levelConfigs.js`

Current playable levels should become tutorial levels:

| Current Level Number | New Progress Key | Current Scene |
|---:|---|---|
| 1 | `tutorial-level-1` | `LevelOneScene` |
| 2 | `tutorial-level-2` | `LevelTwoScene` |
| 3 | `tutorial-level-3` | `LevelThreeScene` |
| 4 | `tutorial-level-4` | `LevelFourScene` |
| 5 | `tutorial-level-5` | `LevelFiveScene` |

Recommended changes:

- `const LESSON_KEY = "tutorial";`
- update title/subtitle/chapter labels to `Tutorial` or `First Compile Trial`
- keep validators and scenes unchanged
- keep route numbers 1-5 for now

Important:

- If existing backend progress is reset/hidden, these new progress keys must exist in backend defaults.
- Teacher override lookup will use new keys.

### 2. Add New Level Metadata Without Making Scenes Playable Yet

We should represent future levels in map/progress, but not route them to playable scenes until implemented.

Options:

- Keep `getLevelConfig()` only returning levels 1-5.
- Add separate `curriculumLevelMetadata.js` for all 30 levels.
- Map uses metadata for all nodes.
- Game route uses `levelConfigs.js` only for playable levels.

Recommendation:

Create:

```text
frontend/src/pages/game/levels/curriculumLevels.js
```

This contains all 30 display levels:

- route number
- level key
- lesson key
- lesson title
- level title
- topic
- playable boolean

### 3. Update Map Config

Current file:

- `frontend/src/pages/map/lessonOneMapConfig.js`

Recommended replacement:

- Rename or replace with `curriculumMapConfig.js`.
- Include tutorial section and main curriculum sections.
- Keep the map UI simple enough to handle 30 nodes.

Potential sections:

- Prologue: First Compile Trial - levels 1-5
- Arrays: Haunted Collections - levels 6-13
- Functions: Ritual Methods - levels 14-25
- Functions with Arrays: Warding Systems - levels 26-29
- Final: Bakunawa Eclipse - level 30

Important:

- Current `LessonMapPage.jsx` filters rows by one lesson key only. It must change to display all curriculum nodes or a selected lesson/section.
- Current `continueRoute` logic should continue to first incomplete available node.

### 4. Update `frontend/src/pages/map/LessonMapPage.jsx`

Current behavior:

- Uses `LESSON_ONE_MAP_CONFIG`.
- Filters progress rows to `variables-and-data-types`.
- Shows one lesson map.

Target behavior:

- Load all progress rows.
- Use curriculum map metadata.
- Show tutorial + curriculum sections.
- Mark nodes:
  - completed
  - current
  - unlocked
  - locked
  - unavailable/planned if no scene exists yet

Important:

- For unavailable future levels, clicking should show the existing "not available yet" page or be disabled.

### 5. Update `frontend/src/pages/game/LevelRoutePage.jsx`

Current:

- If route number has a config, render `GamePage`.
- Otherwise show placeholder.

Target:

- Keep this behavior.
- Update placeholder text to mention future curriculum level title if metadata exists.

### 6. Update Student Dashboard

Current dashboard uses backend progress summary.

Potential changes:

- `currentLevelName` should display clearer names.
- Lesson cards should show Tutorial, Arrays, Functions, Functions with Arrays, Final.
- Scores should still work.

Relevant file:

- `frontend/src/Components/Dashboard/Dashboard.jsx`

### 7. Update Teacher Pages

Teacher pages should mostly work from backend data, but verify display labels and grade tables:

- `frontend/src/pages/teacher/TeacherDashboardPage.jsx`
- `frontend/src/pages/teacher/TeacherStudentsPage.jsx`
- `frontend/src/pages/teacher/TeacherAnalyticsPage.jsx`
- `frontend/src/pages/teacher/TeacherLevelEditorPage.jsx`

Teacher level editor should use the new curriculum metadata, not only existing playable configs, if teachers are expected to edit planned levels.

Recommendation:

- Phase 1: teacher editor only supports playable tutorial levels.
- Phase 2: teacher editor supports all curriculum metadata.

## Suggested Implementation Phases

### Phase 0 - Approval

Confirm:

- Total levels = 30.
- Existing 5 levels become tutorial/prologue.
- Use Option A or Option B for progress migration.
- Filipino myth horror direction is approved.
- Level titles and expected code shapes are approved.

### Phase 1 - Metadata And Docs

1. Keep `NEW_CURRICULUM_STORY_PLAN.md`.
2. Add this migration plan.
3. Update `README.md`, `FEATURE_REQUIREMENTS.md`, and `LEVELING_CONTEXT.md` after approval.

No app behavior changes yet.

### Phase 2 - Backend Defaults

1. Update `progressDefaults.js`.
2. Update `progressService.js` display/par-time helpers.
3. Run backend syntax checks.
4. Manually verify `/api/progress/me` after login.

Risk:

- Existing users may appear to have no progress if old rows are hidden.

### Phase 3 - Frontend Tutorial Reframe

1. Change current level progress keys to `tutorial-level-1` through `tutorial-level-5`.
2. Update labels to tutorial/prologue.
3. Keep existing scenes and validators unchanged.
4. Verify levels 1-5 still save progress.

Risk:

- If backend defaults are not updated first, progress save fails with "Unknown level key."

### Phase 4 - Curriculum Map

1. Add curriculum metadata for all 30 levels.
2. Update map config and `LessonMapPage`.
3. Show future levels as locked/planned.
4. Keep only 1-5 playable.

Risk:

- UI crowding with 30 nodes. May need section tabs or compact node layout.

### Phase 5 - New Validator Helpers

Add validators for:

- arrays
- exact array values
- array indexing
- 2D arrays
- loop traversal
- method declaration/call
- return values
- recursion
- methods with array parameters

Files:

- `frontend/src/pages/game/levels/validators.js`
- `frontend/src/pages/game/levels/buildValidator.js`

### Phase 6 - Main Level 1 Implementation

Implement:

- Main Level 1: `The Lanterns of Malumay`
- Route number: 6, if tutorial uses 1-5
- Progress key: `arrays-level-1`

Required new pieces:

- `LevelSixScene.js` or renamed new scene structure
- array validator
- array-box UI helper
- glowing lantern/orb helper
- map route node playable

This level becomes the template for the new curriculum.

## Testing Checklist

After each phase:

- `npm --prefix frontend run build`
- backend syntax check:
  - `node --check backend/src/constants/progressDefaults.js`
  - `node --check backend/src/services/progressService.js`
- student login still works
- student without class is still redirected to join class
- `/api/progress/me` returns expected levels
- level completion saves progress
- map shows current/completed/locked states
- teacher dashboard loads
- teacher student grades load
- admin dashboard loads

## Open Decisions

Before code implementation, decide:

1. Is the target exactly 30 total levels?
2. Should old progress be reset or mapped into tutorial progress?
3. Should old level docs be archived or replaced?
4. Should teacher level editor support all planned levels immediately?
5. Should the map show all 30 nodes at once, or use lesson tabs/sections?

## Recommended Answer To Open Decisions

For the fastest safe path:

1. Use 30 total levels.
2. Reset visible progress by replacing defaults; do not delete old rows.
3. Keep old docs but mark them as legacy after approval.
4. Teacher editor supports playable levels first.
5. Map uses sections, not one crowded 30-node path.

This gives a clean curriculum pivot without forcing all 25 new levels to be implemented immediately.
