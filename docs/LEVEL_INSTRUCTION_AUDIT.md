# Playable Level Instruction Audit

This audit covers the 29 playable SharpRunner configurations. Level 24 represents curriculum levels 24–25, so there is no separate playable level 25. The live validator and starter code in `frontend/src/pages/game/levels/levelConfigs.js` were treated as the source of truth.

Every lesson card now uses the same student-facing structure: **Goal**, **Your Task**, **Important**, and **Success**. Story dialogue remains separate and unchanged.

| Level | Concept | Previous clarity issue | Rewritten task summary | Validator | Starter |
| --- | --- | --- | --- | --- | --- |
| 1 | Integer variable | Said to declare a variable already present | Change existing `steps`; keep prepared call | Checked | Checked |
| 2 | String variable | Said to declare `myName` again | Replace existing empty name with required text | Checked | Checked |
| 3 | Multiple strings | Said to redeclare three existing variables | Fill all three existing strings with non-empty text | Checked | Checked |
| 4 | Integer variable | Said to declare existing `coins` | Set existing coin count from the sign | Checked | Checked |
| 5 | Decimal variable | Said to declare existing `measurement` | Set the existing `double` from the seal | Checked | Checked |
| 6 | Integer array | Task and result were split across bullets | Create `lanterns` in visible marker order | Checked | Checked |
| 7 | String array | Result was not part of the instruction card | Create `supplies` in crate order | Checked | Checked |
| 8 | Array indexing | Zero-based requirement was indirect | Build `flames`; select the third element by index | Checked | Checked |
| 9 | Array indexing | Key index reminder was outside the task structure | Build `inventory`; select its second element by index | Checked | Checked |
| 10 | 2D array | Grid form and visible result were dispersed | Encode the 3-by-3 `ward` row by row | Checked | Checked |
| 11 | 2D array as map | Row/column roles needed a shorter statement | Encode safe checkpoint heights in `pathMap` | Checked | Checked |
| 12 | Array traversal | Too many line-by-line loop bullets | Traverse every `names` element and call `CheckName` | Checked | Checked |
| 13 | Array traversal | Task mixed mechanics with mystery explanation | Traverse every `jars` element and call `ScanJar` | Checked | Checked |
| 14 | Define and call method | Definition/call distinction was buried | Define and call `StartRitual` | Checked | Checked |
| 15 | Call prepared method | Task repeated lesson prose | Call prepared `RingBell` once | Checked | Checked |
| 16 | No-parameter void method | Goal, task, and reminder overlapped | Define and call `LightFlame` | Checked | Checked |
| 17 | No-parameter void method | Success was separate from coding task | Define and call `SealShrine` | Checked | Checked |
| 18 | Integer return value | Printing-versus-returning was not explicit | Return oracle count from `GetCode`; store in `code` | Checked | Checked |
| 19 | String return value | Printing-versus-returning was not explicit | Return direction from `GetSafePath`; store in `path` | Checked | Checked |
| 20 | String argument | Task contained more prose than action | Pass the requested string to prepared `PlaceOffering` | Checked | Checked |
| 21 | Integer argument | Required value source needed emphasis | Pass marker distance to prepared `ThrowSalt` | Checked | Checked |
| 22 | Parameters and return | Complete lines obscured the underlying task | Add parameters, return their sum, store in `power` | Checked | Checked |
| 23 | Parameters and return | Complete lines obscured the underlying task | Multiply parameters and store returned `healing` | Checked | Checked |
| 24–25 | Recursion | Steps existed but lacked the standard structure | Add base case, smaller call, unwind action, and initial call | Checked | Checked |
| 26 | Array parameter | Task was longer than needed | Create `LightLanterns`, then pass one whole array | Checked | Checked |
| 27 | Array traversal method | Existing array could be mistaken for student work | Process the existing `charms` array and return its count | Checked | Checked |
| 28 | 2D array parameter | Required dimensions were not stated in the task | Build a 2-by-2 `grid` and pass it once | Checked | Checked |
| 29 | Nested traversal | Long task list blurred the two loop bounds | Traverse all existing grave cells and return the count | Checked | Checked |
| 30 | Combined final | Six concepts appeared in one undifferentiated list | Present six labeled phases in validator order | Checked | Checked |

## Exact identifiers required by validators

- Variables and arrays: `steps`, `myName`, `voice1`, `voice2`, `voice3`, `coins`, `measurement`, `lanterns`, `supplies`, `flames`, `attack`, `inventory`, `selectedItem`, `ward`, `pathMap`, `names`, `jars`, `code`, `path`, `power`, `healing`, `count`, `cursedCount`, `grid`, `graves`, and `blessed` where their levels require them.
- Methods: `CheckName`, `ScanJar`, `StartRitual`, `RingBell`, `LightFlame`, `SealShrine`, `GetCode`, `GetSafePath`, `PlaceOffering`, `ThrowSalt`, `CalculatePower`, `Heal`, `BuildStairs`, `CreateStep`, `LightLanterns`, `CountCursed`, `RestoreGrid`, `CountBlessedGraves`, `CountCorrupted`, `RepairSymbol`, `CalculateWard`, `CountMoonCells`, and `BreakEclipse` where their levels require them.

Basic and Detailed Hints were checked in `backend/src/constants/levelHintCatalog.js`. They remain consistent with the rewritten instructions, so no hint text or hint mechanics needed changes.
