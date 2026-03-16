# Level Design Suggestion (4 Lessons x 10 Levels)

Last updated: 2026-03-16

## Lesson 1: Variables and Data Types (The Castle of Syntax)

1. The Awakening: User declares `int steps` to control distance. Output: hero walks toward portal; correct distance clears level.
2. What Is Your Name?: User declares `string myName = "Kai";`. Output: NPC dialogue updates with hero name and checkpoint opens.
3. Voices of the Village: User declares required dialogue strings. Output: conversation cutscene completes and route unlocks.
4. The Coin Keeper: User declares `int` for coin count. Output: bridge toll accepted and bridge appears.
5. Potion Measure: User declares `float`/`double` value. Output: potion event succeeds and obstacle clears.
6. Rune Letter: User declares a `char` value. Output: matching rune activates and door opens.
7. Oath of Truth: User declares `bool` value. Output: guard check passes/fails based on boolean.
8. Pack the Journey: User declares mixed required types in one script. Output: inventory check passes and path unlocks.
9. Gate of Exact Declarations: User provides strict exact declarations only. Output: trap corridor disables.
10. Boss: Archivist of Types: User fixes corrupted type declarations. Output: archive restored and Lesson 2 unlocks.

## Lesson 2: Operators (The Forge of Symbols)

1. Steps and Stones: User uses `+` and `-` to compute target steps. Output: hero moves exact tiles to safe platform.
2. Forge Multipliers: User uses `*`, `/`, `%` in required expression. Output: key mechanism accepts result and door opens.
3. Order of Power: User solves precedence correctly. Output: correct platform rises.
4. Battle Math: User computes attack/defense formula. Output: combat check passes.
5. Experience Burst: User combines arithmetic expressions for target value. Output: exp crystal charges.
6. Eyes of Comparison: User uses `==`, `!=`, `>`, `<`. Output: scanner validates target object.
7. Threshold Trial: User uses `>=`, `<=` in gate rule. Output: checkpoint opens only on valid threshold.
8. Operator Relay: User chains arithmetic and comparison. Output: relay puzzle completes.
9. Arena Calculator: User computes wave values under constraints. Output: mini arena clears.
10. Boss: Iron Colossus: User solves final operator logic. Output: armor core collapses and Lesson 3 unlocks.

## Lesson 3: Conditional Statements (The Branching Keep)

1. Two Roads: User writes basic `if/else`. Output: hero takes safe route.
2. Night Watch: User writes condition from guard requirement. Output: guard gate opens on correct branch.
3. Password at Dawn: User branches on input variable. Output: correct phrase unlocks gate.
4. Weight of the Bridge: User uses threshold condition. Output: bridge stability event resolves.
5. Hall of Many Doors: User uses `if/else if/else`. Output: correct door opens.
6. Nested Decisions: User creates nested branch logic. Output: dual-condition checkpoint passes.
7. Merchant's Deal: User chooses reward/penalty branch. Output: inventory and path vary by branch.
8. Edge of Equality: User handles equality boundary case. Output: trap avoided when exact boundary is met.
9. Judgment Tower: User combines multi-condition chains. Output: tower trial completed.
10. Boss: Judge of Branches: User solves full branching script. Output: boss trial cleared and Lesson 4 unlocks.

## Lesson 4: Loops (The Spiral Citadel)

1. March Pattern: User writes `for` loop for repeated movement. Output: hero walks repeated fixed steps.
2. Endless Hall: User writes `while` with valid stop condition. Output: hero runs until marker reached.
3. Last Checkpoint: User writes `do-while` for at-least-once action. Output: switch sequence succeeds.
4. Crystal Collector: User loops item collection count. Output: required crystals gathered.
5. Wave Runner: User writes nested loops. Output: wave puzzle resolves.
6. Method March: User loops predefined `walk()`/`run()`. Output: distance matches loop execution.
7. Directional Sprint: User passes direction argument (`run("left")`, `run("right")`). Output: character path follows argument.
8. Break the Trap: User uses `break` and `continue`. Output: hazard route is optimized safely.
9. Efficiency Trial: User minimizes loop operations for target. Output: speed challenge clear.
10. Final Boss: The Null King: User combines variables, operators, conditionals, and loops. Output: Compiler Core restored and ending unlocked.

## Notes for Implementation

- Lesson 1 can remain regex-strict for exact declarations.
- Lessons 2-4 should move to parser/interpreter-style validation for reliability.
- Keep per-level objective text in config so Teacher Dashboard can edit goals/instructions/dialogue later.
