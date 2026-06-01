# SharpRunner Feature Requirements

> Last updated: 2026-05-27  
> Source: Panel review feedback and current project implementation  
> Status: Living project reference

This document tracks the main panel-requested features and their current implementation status.

## Curriculum Pivot Note

The project has a new proposed curriculum and story direction documented in `NEW_CURRICULUM_STORY_PLAN.md`.

The current plan keeps the first 5 implemented levels as a tutorial/prologue, then introduces a 25-level Filipino myth horror main story covering:

- Arrays
- Functions/Methods
- Functions/Methods with Arrays
- Final combined boss level

This plan is pending review/approval before implementation.

## Requirement 1 - Teacher-Editable Lesson Content Per Level

**Status: Partially implemented**

Teachers can edit per-classroom level content from the teacher level editor route:

- Frontend: `frontend/src/pages/teacher/TeacherLevelEditorPage.jsx`
- Backend route: `backend/src/routes/teacher.js`
- Model: `backend/src/models/LevelContentOverride.js`
- Schema service: `backend/src/services/levelContentSchemaService.js`

Current editable fields:

- lesson card title
- lesson card description
- goal title
- goal description
- instruction items
- starter/default code
- validator configuration

Current API endpoints:

- `GET /api/teacher/classrooms/:classroomId/level-overrides`
- `PUT /api/teacher/classrooms/:classroomId/level-overrides/:levelKey`
- `DELETE /api/teacher/classrooms/:classroomId/level-overrides/:levelKey`
- `GET /api/progress/level/:levelKey/content` for students to load their classroom override

Current data model:

```text
LevelContentOverrides
  classroomId
  levelKey
  lessonCardTitle
  lessonCardDescription
  goalTitle
  goalDescription
  instructionItems
  defaultCode
  validatorConfig
```

Remaining gaps:

- NPC dialogue override is not yet editable.
- Idle, success, and error result messages are not yet stored as override fields.
- Par time/deadline configuration is not yet exposed in the teacher level editor.
- The game currently uses level configs for Lesson 1 levels 1-5 only.

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

- No hint penalty is saved yet.
- No grade database column exists; grade is derived from score.
- Score breakdown is not yet shown in detail.
- Retrying a completed level does not overwrite the first saved score.

## Current Implementation Priority

| Priority | Work Item | Reason |
|---|---|---|
| 1 | Finish Lesson 1 levels 6-10 | Gives the project one complete playable module |
| 2 | Add demo/manual QA checklist | Helps capstone presentation and regression checks |
| 3 | Add automated API tests | Protects auth, progress, classroom, and teacher flows |
| 4 | Add score breakdown UI | Makes grading easier for students and teachers to understand |
| 5 | Add command-queue execution | Makes coding feel more directly game-controlled |
| 6 | Add boss-level editing | Stretch goal after boss level defaults exist |

## Notes For Panel Explanation

SharpRunner currently prioritizes a stable classroom-based learning loop:

1. Student joins a class.
2. Student plays a level.
3. Backend records attempts, time, completion, score, and grade.
4. Student sees progress and score.
5. Teacher sees class and student performance.
6. Admin manages system users.

The next strongest improvement is completing the remaining Lesson 1 levels so the app can demonstrate a full start-to-finish learning chapter.
