# Leveling Context (Checkpoint)

Last updated: 2026-03-16

## Current Direction

- We are using a level-driven architecture (config + validator + scene behavior).
- We can continue building Teacher Dashboard now and return to levels later.
- No need to finish all levels first before teacher features.

## Implemented So Far

- `GamePage` loads behavior from level config (not hardcoded per level).
- Generic game events are in place for scalable level handling.
- Level 1 was shifted to step-based movement:
  - Student goal uses one integer variable: `int steps = <number>;`
  - Movement method is treated as predefined for this lesson.
  - Wrong step count: idle failure behavior.
  - Instruction/format errors: death failure behavior.

## Agreed Content Structure

- 4 lessons:
  - Variables and Data Types
  - Operators
  - Conditional Statements
  - Loops
- 10 levels per lesson.
- Suggested per-level storyline and output plan is stored in:
  - `LEVEL_DESIGN_SUGGESTION.md`

## Pending for Leveling (When We Return)

- Finalize exact per-level objectives and validation rules.
- Define method-call progression for higher levels (`walk()`, `run()`, loop usage, arguments).
- Define variable-to-world interactions (dialogue, NPC reactions, world state updates).
- Decide if/when to move from regex-only checks to parser/interpreter for advanced lessons.

## Next Focus

- Proceed with Teacher Dashboard implementation.
- Keep leveling data model/config ready for later integration.
- Teacher Dashboard content seed is now available in backend:
  - Seed file: `backend/src/data/lessonContent.seed.json`
  - API: `GET /api/lesson-content`
  - API by lesson: `GET /api/lesson-content/:lessonKey`
