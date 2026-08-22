# SharpRunner Feature Requirements

> Last updated: 2026-08-22
> Source: Panel review feedback and current project implementation
> Status: Living project reference

This document tracks the main panel-requested features and their current implementation status.

## Curriculum Pivot Note

The project has a new proposed curriculum and story direction documented in `NEW_CURRICULUM_STORY_PLAN.md`.

The technical migration plan is documented in `CURRICULUM_MIGRATION_PLAN.md`.

The current plan keeps the first 5 implemented levels as a tutorial/prologue, then introduces a 25-level Filipino myth horror main story covering:

- Arrays
- Functions/Methods
- Functions/Methods with Arrays
- Final combined boss level

This plan is pending review/approval before implementation.

## Requirement 1 - Teacher-Controlled Level Settings

**Status: Implemented with a deliberately limited editing scope**

Teachers can configure the supported per-classroom level settings from the teacher level editor route. Teachers cannot currently rewrite curriculum text, starter code, dialogue, result messages, or validator behavior through the UI.

- Frontend: `frontend/src/pages/teacher/TeacherLevelEditorPage.jsx`
- Backend route: `backend/src/routes/teacher.js`
- Model: `backend/src/models/LevelContentOverride.js`
- Schema service: `backend/src/services/levelContentSchemaService.js`

Current teacher-editable settings:

- level availability
- display order
- unlock date and time
- due date and time
- hints enabled/disabled
- hint unlock threshold (1–10 failed attempts; default 3)
- points deducted per wrong attempt
- points deducted per late day

Teacher UI API endpoints:

- `GET /api/teacher/classrooms/:classroomId/level-overrides`
- `PUT /api/teacher/classrooms/:classroomId/level-settings`
- `DELETE /api/teacher/classrooms/:classroomId/level-settings`

The `LevelContentOverrides` model also contains older content and validator columns. Those columns and the per-level content override endpoints are not exposed by the current teacher UI and must not be presented as completed teacher functionality.

Settings used by the current teacher UI:

```text
LevelContentOverrides
  classroomId
  levelKey
  isEnabled
  displayOrder
  unlockAt
  dueAt
  hintsEnabled
  wrongAttemptDeduction
  lateDeductionPerDay
```

Out of scope for the current teacher editor:

- lesson, goal, and instruction text editing
- starter-code editing
- validator configuration
- NPC dialogue and result-message editing
- configurable par time (due dates are already supported)

## Requirement 2 - Teacher-Editable Boss Levels

**Status: Not implemented / stretch goal**

The app does not yet have boss-level scenes or a boss-level override model.

Suggested future model:

```text
BossLevelOverride
  classroomId
  levelKey
  phases
  updatedByTeacherId
```

Suggested phase structure:

```json
{
  "phaseNumber": 1,
  "challengeType": "variable",
  "challengePrompt": "Declare the required variable.",
  "expectedAnswer": "int crystals = 4;",
  "hintText": "Use an integer declaration."
}
```

Recommended approach:

1. Finish normal Lesson 1 levels 6-10 first.
2. Implement Level 10 as the first boss-level scene.
3. Add boss overrides only after the default boss flow is stable.

## Requirement 3 - Full Game-Controlled Code Execution

**Status: Not implemented**

The current game does not execute C# code. It validates submitted code through JavaScript validators and emits game events to Phaser scenes.

Current validator approach:

- `frontend/src/pages/game/levels/validators.js`
- `frontend/src/pages/game/levels/buildValidator.js`
- `frontend/src/pages/game/levels/levelConfigs.js`

Implemented validator types:

- `singleInteger`
- `exactGoal`
- `multiString`

Current behavior:

- Student submits C#-style code in Monaco.
- Validator checks declarations and values.
- Game events tell the active Phaser scene whether the code is correct.
- The scene animates success or failure.

Future command-queue approach:

```csharp
static void Main(string[] args) {
  WalkToPortal(3);
  AttackEnemy(2);
}
```

Planned architecture:

1. Parse allowed method calls from `Main`.
2. Convert calls into a command queue.
3. Validate the queue against the level objective.
4. Let Phaser consume the queue and animate each command.

This is high effort and should come after one complete playable lesson exists.

## Requirement 4 - Student Grading Per Level

**Status: Implemented, with room for refinement**

The backend stores grading data in `UserProgress` and computes `finalScore` when a level is completed.

Current tracked fields:

```text
attemptCount
timeSpentSeconds
finalScore
startedAt
completedAt
```

Current scoring source:

- `backend/src/services/progressService.js`

Current score rules:

- Base score: 100
- Failed attempt deduction: 5 points per failed attempt
- Deadline deduction: 3 points per day late when a deadline exists
- Overtime deduction: 0.05 points per minute over par time when no deadline exists
- Minimum saved score: 75

Current grade labels:

```text
S = 90+
A = 80-89
B = below 80
```

The grade label is computed from `finalScore` in the progress payload. It is not currently stored as a separate database column.

Student visibility:

- Completion modal uses the backend-saved score and grade.
- Dashboard and map display saved level scores.

Teacher visibility:

- Teacher student views show per-level scores, attempts, time spent, and completion data.

Remaining gaps:

- No grade database column exists; grade is derived from score.
- Score breakdown is not yet shown in detail.
- Retrying a completed level does not overwrite the first saved score.

## Requirement 5 - Three-Failure Hint Access

**Status: Implemented**

- Failed attempts persist on `UserProgress`.
- A free basic hint unlocks after three failures by default and updates immediately without refresh.
- Teachers retain a master enable/disable switch and may configure a threshold from 1–10.
- Hint use, timestamp, type, and attempt count at unlock are recorded.
- Completed-level replay preserves the original attempt/score record and permits review of previously unlocked hints.

## Requirement 6 - XP And Motivation

**Status: Implemented**

- First completion: +20 XP.
- First-attempt bonus: +10 XP.
- No-hint bonus: +5 XP.
- Values are centralized in `backend/src/constants/gamificationConfig.js`.
- XP transactions are unique per user/level completion and server-validated. Replay and refresh cannot farm XP.
- XP is displayed on the dashboard, leaderboard, and completion result, with reward breakdown.
- XP never changes academic score or grade.
- The free basic hint has no XP cost; a paid detailed hint is not currently implemented.

## Requirement 7 - Self-Paced Classroom Learning

**Status: Implemented within teacher availability controls**

Students can revisit published modules and lessons, retry incomplete game levels, replay completed levels, review saved score/attempt/completion data, and review already-unlocked hints. Teachers continue to control publication, scheduling, deadlines, sequence, game availability, hints, and grading settings.

## Requirement 8 - Teacher Modules And Multimedia Resources

**Status: Implemented**

The existing Classwork system supports standalone modules, module-associated lessons/assignments, publication schedules, optional due dates, external links, and secure attachments. Supported educational uploads include PDFs, images, Office/OpenDocument files, text/spreadsheets, audio, and size-limited video. File extension, MIME category, dangerous signature, size, ownership, and classroom access are checked.

Teachers cannot create or modify Phaser maps, collision data, validators, game events, or level implementations.

## Requirement 9 - Preferences And Curriculum Traceability

**Status: Implemented**

Students can optionally save a motivation preference and learning-game interest. Dashboard feedback reflects the motivation focus without hiding educational information. Teachers receive aggregate motivation counts only. `curriculumMetadata.js` traces playable configs to CodeChum, module, lesson, objective, conceptual difficulty, and a nullable restricted reference URL policy.

## Current Implementation Priority

| Priority | Work Item | Reason |
|---|---|---|
| 1 | Run the demo/manual QA checklist on each presentation build | Confirms real persistence, uploads, and role access |
| 2 | Add disposable-database integration tests | HTTP fixtures cannot verify PostgreSQL locks and constraints |
| 3 | Improve academic score breakdown UI | Makes grading deductions easier to understand |
| 4 | Reduce production bundle size | Phaser and level configuration chunks remain large |

## Notes For Panel Explanation

SharpRunner currently prioritizes a stable classroom-based learning loop:

1. Student joins a class.
2. Student plays a level.
3. Backend records attempts, time, completion, score, and grade.
4. Student sees progress and score.
5. Teacher sees class and student performance.
6. Admin manages system users.

The next strongest improvement is completing the remaining Lesson 1 levels so the app can demonstrate a full start-to-finish learning chapter.
