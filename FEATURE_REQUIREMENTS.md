# SharpRunner — Feature Requirements (Panel-Requested)

> Last updated: 2026-04-18
> Source: Panel review feedback during capstone development
> Status: Design phase — not yet implemented

---

## Requirement 1 — Teacher-Editable Lesson Content Per Level

**What the panel wants:**
Teachers should be able to edit the lesson content for each level from within the teacher dashboard — without touching source code.

**What "lesson content" means in SharpRunner's context:**
- NPC dialogue lines (intro, success, hint)
- Coding objective description (the "Goal" card text)
- Instructions / checklist items (the "Instruction" card)
- Lesson card text (the mini-lesson explanation shown below the game)
- Idle / success / error result messages

**Design approach:**
- Store level content in the database (`LevelContent` table or inside `UserProgress`-adjacent config) instead of hardcoding it in `levelConfigs.js`
- Teacher dashboard gets a "Level Content Editor" section — a form per level that saves to the backend
- The frontend fetches level content dynamically from `/api/lesson-content/:levelKey` at game load time
- The hardcoded `levelConfigs.js` values become the **default seed** — used when no teacher override exists

**Tables needed:**
```
LevelContentOverride
  id
  classroomId        → scoped per classroom (teacher's class)
  levelKey           → e.g. "variables-and-data-types-level-3"
  goalDescription
  instructionItems   → JSON array of strings
  lessonCardTitle
  lessonCardBody
  dialogueOverride   → JSON (optional — replaces intro dialogue)
  updatedAt
  updatedByTeacherId
```

**Notes:**
- Overrides are per-classroom so different teachers can customize for their class
- If no override exists, fall back to the default config in `levelConfigs.js`
- The existing `/api/lesson-content` route may already be the right place to extend this

---

## Requirement 2 — Teacher-Editable Boss Levels

**What the panel wants:**
Boss levels (1-10, 2-10, 3-10, 4-10) should have configurable parameters that teachers can adjust.

**What "boss level editable" means:**
- Number of phases / corruption panels
- The expressions, variable names, or conditions presented on each panel
- Success criteria for each phase
- Optional: boss difficulty modifier (time limit, error tolerance)

**Design approach:**
- Boss levels use a `BossLevelConfig` structure (separate from regular level content)
- Teacher can set the challenge content for each phase via a form in the teacher dashboard
- Each phase has: `phaseNumber`, `challengeType` (variable/operator/conditional/loop), `challengePrompt`, `expectedAnswer`, `hintText`
- The frontend boss scene reads phase configs from the API instead of hardcoded arrays

**Tables needed:**
```
BossLevelOverride
  id
  classroomId
  levelKey            → e.g. "variables-and-data-types-level-10"
  phases              → JSON array of phase configs
  updatedAt
  updatedByTeacherId
```

**Notes:**
- This is "if possible" per panel — treat as stretch goal
- Start with Requirement 1 first; boss editing shares the same override architecture
- Default boss content (in code) is the fallback if no override is set

---

## Requirement 3 — Full Game-Controlled Code Execution

**What the panel wants:**
The student's code should **directly drive** game character actions — like `walk()`, `attack()`, `jump()` — rather than just being validated for correct declaration patterns.

**What this means:**
Currently the game validates student code as a *static check* (regex/parsing).
The panel wants the code to be *executed* — calling predefined methods that produce visible in-game effects in real time.

**How it should work:**
```csharp
// Student writes:
static void Main(string[] args) {
  Walk(3);
  Attack();
  Walk(2);
}
```
Each method call in `Main` triggers a corresponding Phaser animation in sequence.

**Predefined method library (by lesson):**
| Lesson | Available Methods |
|---|---|
| Variables | `WalkToPortal(int steps)`, `IntroduceToNpc(string name)` |
| Operators | `CrossPlatforms(int steps)`, `AttackEnemy(int damage)`, `ActivateScanner(bool result)` |
| Conditionals | `OpenGate(string side)`, `CrossBridge()`, `HoldBack()`, `EnterVault()` |
| Loops | `MarchStep()`, `MoveForward()`, `HitSwitch()`, `CollectCrystal()`, `ClearWave()`, `Walk()`, `Run(string dir)` |

**Implementation approach:**
- Parse the student's `Main` method to extract the sequence of method calls (AST-lite or regex-based)
- Build a "command queue" — ordered list of `{ method, args }` objects
- The Phaser scene consumes the command queue frame by frame, animating each call
- Validators still run to check correctness before the animation plays

**Why this is important:**
- Makes the game feel like actual programming (cause → visual effect)
- Replaces the current "run + fail animation" loop with a true execution trace
- Supports future extensions like error highlighting mid-execution

**Implementation effort:** High — requires a C# method-call parser (or a simplified DSL parser) and a command queue system in Phaser scenes.

---

## Requirement 4 — Student Grading Per Level

**What the panel wants:**
Each level should produce a grade for the student. Grading should reflect not just *pass/fail* but *how well* the student solved it.

**Proposed grading model (CodeChum-inspired):**

```
Base score:         100 points

Deductions:
  Per failed attempt:   -10 points  (capped at -50)
  Per hint used:        -10 points  (if hint system is added)
  Time penalty:         -0.5 points per minute over the "par time"

Minimum score:      50 points (must still pass to proceed)
Grade thresholds:
  90–100  →  S  (Perfect)
  75–89   →  A
  60–74   →  B
  50–59   →  C  (Minimum pass)
  < 50    →  F  (Cannot proceed — must retry)
```

**What needs to be tracked per attempt:**
- `attemptCount` — number of times "Run" was clicked before success
- `timeSpentSeconds` — from level load to first successful submission
- `hintsUsed` — 0 for now (hint system TBD)
- `finalScore` — computed on success and saved to `UserProgress`

**Changes to `UserProgress` table:**
```
Add columns:
  attemptCount        integer   default 0
  timeSpentSeconds    integer   default 0
  finalScore          integer   default null
  grade               varchar   default null  -- "S", "A", "B", "C", "F"
```

**Teacher visibility:**
- Teacher analytics page shows per-student, per-level: score, grade, attempts, time
- Class average per level shown in teacher dashboard

**Student visibility:**
- After level completion, show score breakdown: base, deductions, final grade
- Map node shows grade badge (S/A/B/C) once completed

**Notes:**
- Grading should not block the learning loop — a C is still a pass
- Teacher can optionally configure the par time per level (ties into Requirement 1)
- Score is saved once on first completion; retrying a level does not overwrite the grade (or optionally allows "best score" tracking)

---

## Implementation Priority (Suggested)

| Priority | Requirement | Effort |
|---|---|---|
| 1 | Grading system (Req 4) | Medium |
| 2 | Teacher-editable lesson content (Req 1) | Medium–High |
| 3 | Full code execution / command queue (Req 3) | High |
| 4 | Teacher-editable boss levels (Req 2) | High (stretch goal) |

---

*This document captures panel-requested features for the SharpRunner capstone.*
*Use as a reference when planning sprints or responding to panel questions.*
