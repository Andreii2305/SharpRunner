# SharpRunner New Curriculum And Story Plan

Last updated: 2026-05-28

## Purpose

This document plans the revised SharpRunner curriculum and game storyline based on the new required lessons:

- Arrays
- Functions/Methods
- Functions/Methods with Arrays

The first 5 existing game levels will remain as a tutorial/prologue. The new main curriculum will contain 25 levels:

- 12 topics x 2 levels each = 24 levels
- 1 final combined level = 25 levels

Total target structure:

- Tutorial/Prologue: 5 existing levels
- Main curriculum: 25 new levels
- Total playable target: 30 levels

## Design Rules

SharpRunner is a 2D pixel side-scroller platformer. Each level must be possible with common free assets plus Phaser-drawn UI/graphics.

Use common assets:

- forest, cave, village, graveyard, shrine, or dark platformer tilesets
- platforms, stairs, gates, doors, portals
- torches, flames, lanterns, crystals, crates, jars, chests, signs
- generic monster, ghost, flying enemy, NPC, or boss sprites

Use Phaser graphics/UI for programming visuals:

- array boxes
- selected index highlights
- 2D array grids
- traversal glow effects
- function call panels
- return value displays
- recursion depth counters
- boss phase indicators

Important principle:

The Filipino cultural touch comes from creature names, dialogue, location names, atmosphere, and story. The actual asset can be generic dark fantasy pixel art if the code concept is clear.

## Story Premise

Working title: **SharpRunner: Gabing Walang Umaga**

Kai escapes the tutorial realm and enters **Barangay Malumay**, a Filipino-inspired barrio trapped in an endless supernatural night. Mythical creatures and corrupted memories haunt the road. Objects are scattered, paths loop, rituals fail, and protective wards no longer work.

To restore dawn, Kai must organize cursed collections with arrays, perform reusable rituals with functions, and combine both ideas to repair the final warding system.

Final boss: **Bakunawa**, the moon-eating serpent.

Ending text:

```text
Compilation successful. Umaga na.
```

## Tutorial / Prologue

The existing first 5 levels stay implemented and serve as onboarding:

1. The Awakening
2. What Is Your Name?
3. Voices of the Village
4. The Coin Keeper
5. Potion Measure

Purpose:

- teach the player how to use the editor
- introduce Run/Submit flow
- teach validation feedback
- show dialogue, animation, scoring, and level completion

These can be framed as Kai's first compile trial before entering Barangay Malumay.

## Main Curriculum Overview

| Main Level | Lesson | Topic |
|---|---|---|
| 1-2 | Arrays | Arrays |
| 3-4 | Arrays | One Dimensional Arrays |
| 5-6 | Arrays | Multi Dimensional Arrays |
| 7-8 | Arrays | Array Traversal |
| 9-10 | Functions | Introduction to Functions/Methods |
| 11-12 | Functions | No Parameters and No Return Values |
| 13-14 | Functions | No Parameters but With Return Values |
| 15-16 | Functions | With Parameters and No Return Values |
| 17-18 | Functions | With Parameters and Return Values |
| 19-20 | Functions | Recursive Functions/Methods |
| 21-22 | Functions With Arrays | Methods with 1D Arrays |
| 23-24 | Functions With Arrays | Methods with 2D Arrays |
| 25 | Final | Combined lesson boss |

## Suggested Level Key Pattern

Use stable level keys that do not depend on old lesson names:

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
functions-arrays-level-1
...
functions-arrays-level-4
final-level-1
```

Implementation can still route by numeric level number, but progress keys should use descriptive keys.

## Lesson 1: Arrays

Theme: cursed collections, haunted objects, grouped memories.

### Level 1 - The Lanterns of Malumay

Topic: Arrays

Story:
Kai enters Barangay Malumay and finds five dead lanterns. The barrio cannot remember its lantern values because the curse scattered them.

Level design:
Build a straight left-to-right village road. Place five lanterns or glowing circles above the path, then a shadow barrier near the exit. Show five array boxes above the lanterns so each value maps to one visible light. Kai starts at the left, stops before the barrier, and only proceeds after all five lights activate.

Setting and feeling:
Night. The road is quiet and foggy, with only faint blue moonlight and dead lanterns. It should feel like Kai has stepped into a barrio where everyone is hiding indoors. The mood is tense but introductory, with low danger and a clear first objective.

Student task:
Declare one integer array named `lanterns` with exactly five values.

Expected code shape:

```csharp
int[] lanterns = { 1, 1, 1, 1, 1 };
```

Validation notes:

- Accept `int[] lanterns = { 1, 1, 1, 1, 1 };`.
- Require exactly 5 integer values.
- Require every value to be `1`.
- Reject extra variable declarations for this level.

Correct outcome:
Five lanterns light from left to right. A shadow barrier fades and Kai walks forward.

Wrong outcome:
Only valid lantern positions flicker. The remaining lanterns stay dark, the barrier stays closed, and an error message explains the missing/wrong array value.

Assets needed:

- dark village or forest tileset
- 5 lantern/fire sprites, or Phaser-drawn glowing circles
- barrier/gate sprite
- optional shadow background sprite

Important implementation notes:

- Use Phaser graphics if no lantern asset is available.
- Render array boxes above the lanterns to connect code values to objects.

### Level 2 - The Aswang's Stolen Supplies

Topic: Arrays

Story:
An aswang has stolen supplies and hidden them in crates. Kai must group the supplies into a single array so the barangay can track them.

Level design:
Use a short road with three crates between Kai and the exit. Put the aswang or a shadow enemy near the final gate. Each crate represents one array element. On success, crates open from left to right and labels appear. On failure, the incorrect crate shakes while the monster remains in place.

Setting and feeling:
Late night. The scene should feel like a raided storage path behind a barrio house. Use dim lantern light, scattered crates, and a watching shadow near the exit. The player should feel observed, but not in direct combat yet.

Student task:
Declare one string array named `supplies` with the required item names.

Expected code shape:

```csharp
string[] supplies = { "rice", "salt", "candle" };
```

Validation notes:

- Require array name `supplies`.
- Require type `string[]`.
- Require exactly `"rice"`, `"salt"`, and `"candle"` in order.
- Reject missing quotes, wrong order, wrong item names, and extra declarations.

Correct outcome:
Three crates open in sequence. Item labels appear above them. The aswang retreats into the dark.

Wrong outcome:
Wrong crates shake or flash red. The aswang stays near the path and blocks progress.

Assets needed:

- crates/boxes/barrels
- item icons optional; text labels are enough
- generic monster/shadow sprite
- village or forest path

Important implementation notes:

- Use crates for all supplies; no special item art required.
- Draw labels with Phaser text.

### Level 3 - Road of Santelmo

Topic: One Dimensional Arrays

Story:
A row of Santelmo flames guards a burning road barrier. None of the flames are safe, but one of them is the boss fire controlling the wall. Kai only has enough power for one attack, so he must use a one-dimensional array to identify which indexed flame to strike.

Level design:
Create one horizontal path with four hovering flames before a fire wall or fog-fire barrier. Add index labels `0`, `1`, `2`, `3` under each flame. The flames should be visual targets, not separate walls Kai must walk through. Keep Kai before the flame row until code is submitted. On success, Kai runs to flame index `2`, attacks the boss fire, and the whole barrier disappears so he can continue to the exit.

Setting and feeling:
Deep night on an empty forest road. The Santelmo flames should feel supernatural, hovering just above the ground like watching spirits. Use warm orange/red for the normal flames, and make the boss fire slightly larger or more intense once revealed. When the boss fire is hit, it should flare blue/white before exploding or vanishing. The feeling is mysterious and dangerous, like the road itself is testing whether Kai understands the indexed order.

Student task:
Declare a string array named `flames`, then declare one string variable named `attack` assigned from index `2`. This represents Kai choosing which Santelmo flame to attack.

Expected code shape:

```csharp
string[] flames = { "normal", "normal", "boss", "normal" };
string attack = flames[2];
```

Validation notes:

- Require `flames` as a string array.
- Require exactly 4 values: `"normal"`, `"normal"`, `"boss"`, `"normal"`.
- Require `attack = flames[2];`.
- The attack value should resolve to `"boss"`.
- Reject hardcoded `"boss"` without array access.
- Reject wrong indexes such as `flames[0]`, `flames[1]`, or `flames[3]`.

Correct outcome:
Kai runs toward the third flame, attacks it, and the boss fire flares blue/white before exploding or disappearing. The other flames die out because the boss was controlling them. The fire wall fades out, then Kai runs through the cleared road to the exit.

Wrong outcome:
Kai attacks a normal flame or the array cannot identify the boss. The flame bursts red, pushes Kai back, and the boss fire keeps the wall closed.

Assets needed:

- fire/flame sprites or glowing orbs
- straight platform path
- simple fire wall, fog wall, or glowing barrier
- optional attack slash effect

Important implementation notes:

- This level teaches zero-based indexing.
- Display index labels under flames: `0`, `1`, `2`, `3`.
- Flame index `2` is the third flame visually, so dialogue should remind students that arrays start counting at zero.
- Kai should only attack one flame per submission.
- If no flame sprite is available, render the Santelmo flames in Phaser using glowing circles and particle-like light effects.

### Level 4 - Midnight Inventory

Topic: One Dimensional Arrays

Story:
A haunted roadside store has corrupted its inventory. Kai must select the correct item from a row of crates.

Level design:
Use an interior or wooden platform area with three crates on a raised platform. Label each crate as `items[0]`, `items[1]`, and `items[2]`. The exit gate is locked until the middle crate opens. Avoid needing a store shelf asset; the "inventory" is represented by labeled crates.

Setting and feeling:
Midnight interior or covered roadside stall. It should feel cramped, abandoned, and dusty, with a faint yellow lamp flickering above the crates. The horror is quieter here: creaking wood, wrong items, and the sense that the store is remembering incorrectly.

Student task:
Declare a string array named `items`, then assign the item at index `1` to `chosenItem`.

Expected code shape:

```csharp
string[] items = { "coin", "key", "stone" };
string chosenItem = items[1];
```

Validation notes:

- Require `items` as a string array.
- Require exactly `"coin"`, `"key"`, `"stone"`.
- Require `chosenItem = items[1];`.
- Reject `items[2]`, `items[0]`, hardcoded `"key"` without array access, and extra variables.

Correct outcome:
The middle crate opens and reveals the key. A locked gate opens.

Wrong outcome:
The wrong crate opens with smoke, then closes. The gate stays locked.

Assets needed:

- wooden platform/interior tiles
- crates/boxes
- item labels drawn with Phaser text
- gate or portal

Important implementation notes:

- No sari-sari shelf asset is required.
- Use a row of crates labeled `items[0]`, `items[1]`, `items[2]`.

### Level 5 - Warding Tile Grid

Topic: Multi Dimensional Arrays

Story:
A floor ward is arranged in rows and columns. The curse scrambled the grid, so spirits can cross it.

Level design:
Create a flat platform with a 3x3 grid drawn directly on the floor using Phaser graphics. Place a ghost/spirit on the opposite side of the grid and a gate behind it. Each cell lights according to the 2D array. Kai does not need to walk on every cell; the grid is a puzzle panel embedded into the level.

Setting and feeling:
Night at an old stone courtyard or shrine floor. The grid should feel ritualistic, like a protective mark drawn in light. Use dark floor tiles, pale mist, and green/blue ward glow. The scene should feel more magical than scary, introducing 2D structure clearly.

Student task:
Declare a 2D integer array named `ward` with a 3x3 pattern.

Expected code shape:

```csharp
int[,] ward = {
  { 1, 0, 1 },
  { 0, 1, 0 },
  { 1, 0, 1 }
};
```

Validation notes:

- Require `int[,] ward`.
- Require 3 rows and 3 columns.
- Require exact values.
- Reject jagged arrays for this level.

Correct outcome:
The 3x3 floor grid lights in the same pattern. Spirits bounce back and the path opens.

Wrong outcome:
Wrong cells flash red. The spirit crosses the grid and pushes Kai back to retry.

Assets needed:

- floor/platform tiles
- Phaser-drawn 3x3 grid
- glow effects
- optional ghost/spirit sprite

Important implementation notes:

- Do not use a banig asset.
- The "warding pattern" is a Phaser-drawn grid overlay.

### Level 6 - Tikbalang's Branching Path

Topic: Multi Dimensional Arrays

Story:
The Tikbalang twists the forest road into branching upper, middle, and lower paths. The safe route is stored as a 2D map.

Level design:
Make a side-scroller "maze" with three short decision points. Each point has upper, middle, and lower platforms or gates, but only one route opens per checkpoint. Show a small 3x3 grid panel beside the path. The diagonal `1` values open the safe route sequence.

Setting and feeling:
Night in a confusing forest. Use layered trees, fog, and repeated-looking platforms so the player feels the Tikbalang has twisted direction. The mood should be disorienting but still readable: the grid panel is the source of truth while the forest lies.

Student task:
Declare a 2D integer array named `pathMap` that marks the safe route with `1`.

Expected code shape:

```csharp
int[,] pathMap = {
  { 1, 0, 0 },
  { 0, 1, 0 },
  { 0, 0, 1 }
};
```

Validation notes:

- Require `int[,] pathMap`.
- Require 3x3 values.
- Require the diagonal safe path shown above.
- Reject all-zero maps and wrong dimensions.

Correct outcome:
Three gates open in sequence: upper, middle, lower. Kai crosses safely.

Wrong outcome:
A dead-end gate opens, the Tikbalang laughs, and Kai is returned to the start point.

Assets needed:

- forest tileset
- platforms at different heights
- 2-3 gates or doors
- optional trickster/shadow monster sprite
- small grid UI panel

Important implementation notes:

- This is not a top-down maze.
- Build it as a side-scroller with vertical route choices.
- The 2D array controls which gates/platforms open.

### Level 7 - Kapre's Name Tags

Topic: Array Traversal

Story:
The Kapre guards hanging name tags in the forest. Kai must inspect every tag until the corrupted one is found.

Level design:
Use a forest path with four hanging plaques or floating labels. Kai stops in front of the plaques while the traversal animation checks them one by one. A Kapre can be represented by a large shadow/NPC near the final gate. The key visual is sequential highlighting, not a custom carved tree.

Setting and feeling:
Very late night under huge trees. The scene should feel heavy, smoky, and still, as if something large is nearby. Use dim amber glow for plaques and a large dark silhouette near the exit. The player should feel watched by an old guardian, not chased.

Student task:
Use a `for` loop to traverse a string array named `names`.

Expected code shape:

```csharp
string[] names = { "Lina", "Tomas", "Mira", "Niko" };
for (int i = 0; i < names.Length; i++) {
  CheckName(names[i]);
}
```

Validation notes:

- Require a `for` loop.
- Require loop initializer `int i = 0`.
- Require condition using `i < names.Length`.
- Require increment `i++`.
- Require access `names[i]`.
- Require call to predefined method `CheckName(names[i])`.

Correct outcome:
Each hanging tag lights one by one. The corrupted tag burns away and the Kapre lets Kai pass.

Wrong outcome:
Traversal stops early or skips a tag. The unvisited tags darken and the path stays blocked.

Assets needed:

- forest tileset
- optional tree sprites
- hanging signs or simple rectangle labels
- Phaser text labels
- smoke/glow effect

Important implementation notes:

- No carved-tree asset needed.
- Use floating/hanging text plaques.

### Level 8 - The Cursed Jars

Topic: Array Traversal

Story:
Four colored jars contain captured guardian spirits. One seal is secretly cursed, but its color does not reveal the corruption. Kai must store the visible jar colors and use the shrine to scan every jar.

Level design:
Place four differently colored jars along a cave, forest, or abandoned village path. A Manananggal guards the exit beyond them with the prompt `Find the cursed seal.` All jars look safe before execution. A progress panel begins at `scanned 0/4` and includes three empty inventory slots. Each iteration advances the count and leaves a persistent `SAFE` or `CURSED` result above the inspected jar. When the scan reaches the hidden cursed jar, its animated dark aura appears, its state changes to `SEALED`, and the exposed Manananggal retreats immediately. The scan still finishes any remaining index. After all four jars are classified, Kai runs continuously through the row. Each safe jar is collected only when Kai passes through its position and fills one inventory slot. Kai briefly looks back at the sealed cursed jar instead of collecting it.

Setting and feeling:
Night inside a cave, storage hut, or abandoned path. The jars/objects should whisper visually through small particle effects or pulsing highlights. The mood is investigative: Kai is checking each object carefully instead of fighting.

Student task:
Declare a string array named `jars` containing the visible jar colors, then traverse it and pass every value to the predefined `ScanJar` method.

Expected code shape:

```csharp
string[] jars = { "blue", "green", "purple", "orange" };

for (int i = 0; i < jars.Length; i++) {
  ScanJar(jars[i]);
}
```

Validation notes:

- Require exactly one `string[] jars`.
- Require the values `"blue"`, `"green"`, `"purple"`, and `"orange"` in visual left-to-right order.
- Require loop initializer `int i = 0`.
- Require traversal with `jars.Length`.
- Require increment `i++`.
- Require `ScanJar(jars[i])` inside the loop.
- Reject skipped indexes, hardcoded individual scan calls, and arrays that encode the curse directly.

Correct outcome:
The progress panel advances from `scanned 0/4` to `scanned 4/4`. Clean jars glow and retain a `SAFE` marker. When the loop reaches the cursed jar, its portal aura appears, it retains a `CURSED` marker, and the Manananggal immediately retreats. The final jar is still scanned. Kai then runs past the row and overlap collection removes each safe jar as he reaches it, leaving the cursed jar sealed before he proceeds to the exit.

Wrong outcome:
Traversal stops at the first missing scan. Unvisited jars dim, the panel displays `SCAN INCOMPLETE`, and the camera shows the Manananggal reacting before returning to Kai. No jars are collected and the exit remains blocked. After the feedback is shown, jars, labels, inventory slots, player, and Manananggal reset to a clear `TRY AGAIN` state.

Assets needed:

- four colored jar sprites
- cave/forest/village tiles
- clean scan glow
- animated cursed portal aura
- Manananggal flying sprite

Important implementation notes:

- The array stores observable identifiers, not the answer. Jar color must not determine whether a jar is cursed.
- `ScanJar` is predefined so this remains an array-traversal lesson rather than a method-definition lesson.
- Keep the cursed aura hidden before execution and reveal it only when the scan reaches the cursed index.
- Use a compact progress UI that displays `scanned n/4` and a final scan state.
- Keep `SAFE` and `CURSED` markers visible after each scan so students can map loop iterations to world objects.
- Separate scanning from collection: classify all jars first, then move Kai to collect only safe jars.
- Fill one compact inventory slot for each safe jar collected.
- Let Kai acknowledge the sealed cursed jar with a short look-back while passing it.
- Restore every visual state after failure so a second attempt begins cleanly.

## Lesson 2: Functions/Methods

Theme: reusable rituals, named actions, protective spells.

### Level 9 - The First Ritual

Topic: Introduction to Functions/Methods

Story:
A diwata teaches Kai that repeated protective actions can be named as methods.

Level design:
Use a small shrine clearing. Kai walks to a ritual circle outline on the ground and stops beside the diwata. The method definition activates the circle, and the method call completes it. Visually separate "define" and "call" by lighting the outer ring first, then the inner symbol.

Setting and feeling:
Pre-dawn darkness, but calmer than earlier levels. The shrine clearing should feel sacred and safe compared with the cursed roads. Use soft green/white light around the diwata and quiet ambient particles. This is a teaching scene.

Student task:
Define one void method named `StartRitual`, then call it from `Main`.

Expected code shape:

```csharp
static void StartRitual() {
}

static void Main(string[] args) {
  StartRitual();
}
```

Validation notes:

- Require method declaration `static void StartRitual()`.
- Require call `StartRitual();` inside `Main`.
- No parameters and no return value yet.

Correct outcome:
A ritual circle appears under Kai and the diwata opens the path.

Wrong outcome:
The circle appears incomplete or flickers out. The diwata explains that a method must be defined and called.

Assets needed:

- shrine/forest tiles
- NPC guide sprite
- Phaser-drawn ritual circle
- glow effect

Important implementation notes:

- This is the first function level, so keep validation forgiving about whitespace.

### Level 10 - Bell of Dawn

Topic: Introduction to Functions/Methods

Story:
Ghosts block the road. Kai must call the Bell of Dawn method to push them back.

Level design:
Use a short path with ghost sprites between Kai and the exit. Place a bell-like object above or beside the path; if no bell asset exists, draw one with simple shapes. Since `RingBell()` is predefined, the level should focus on the call causing a single clear world action.

Setting and feeling:
Night near a small chapel, bell post, or old gate. The ghosts should drift slowly and block the path without feeling too aggressive. The bell action should feel powerful: a bright pulse, brief silence, then ghosts fading.

Student task:
Call a predefined method named `RingBell()` inside `Main`.

Expected code shape:

```csharp
static void Main(string[] args) {
  RingBell();
}
```

Validation notes:

- `RingBell()` is predefined in starter code.
- Require exactly one call to `RingBell();`.
- Reject defining a variable instead of calling the method.

Correct outcome:
The bell rings, ghosts fade, and Kai walks forward.

Wrong outcome:
Ghosts remain solid and push Kai back.

Assets needed:

- bell sprite optional
- ghost sprites or shadow sprites
- hanging object/sign if no bell asset exists
- flash effect

Important implementation notes:

- Bell can be represented by a simple drawn object and sound/flash.

### Level 11 - Light the Warding Flame

Topic: Methods with no parameters and no return values

Story:
A fixed ritual flame must be lit. It needs no input and gives no returned value; it simply performs an action.

Level design:
Place an unlit torch or flame circle before a dark barrier. The level should demonstrate that a no-parameter void method performs a fixed action every time. On success, the torch lights and the barrier burns away. Keep the scene simple and readable.

Setting and feeling:
Night on a narrow path swallowed by darkness. The unlit flame is the only obvious interactable. The mood is focused and ritual-like: one fixed spell, one fixed result. Use strong contrast between darkness and the newly lit flame.

Student task:
Define and call a no-parameter `void` method named `LightFlame`.

Expected code shape:

```csharp
static void LightFlame() {
}

static void Main(string[] args) {
  LightFlame();
}
```

Validation notes:

- Require `static void LightFlame()`.
- Require `LightFlame();` call.
- Reject return type other than `void`.
- Reject parameters in `LightFlame`.

Correct outcome:
The flame lights and burns away a shadow barrier.

Wrong outcome:
The flame sparks but dies out. The barrier remains.

Assets needed:

- flame or torch sprite
- barrier/portal
- dark path tiles

### Level 12 - Seal the Cursed Shrine

Topic: Methods with no parameters and no return values

Story:
A manananggal circles above a cursed shrine breach. Kai must call a fixed sealing ritual.

Level design:
Use a cursed shrine or barrier on the right side of the level and a flying enemy moving above it. The method call triggers a seal animation over the shrine. The flying enemy does not need complex combat behavior; it can swoop once on failure and retreat on success.

Setting and feeling:
Windy midnight near a cursed shrine or rooftop edge. The flying creature should create pressure from above. Use darker sky, quick wing movement, and a tense sound/motion cue. The success should feel like sealing a weak point before something gets in.

Student task:
Define and call a no-parameter `void` method named `SealShrine`.

Expected code shape:

```csharp
static void SealShrine() {
}

static void Main(string[] args) {
  SealShrine();
}
```

Validation notes:

- Require method name `SealShrine`.
- Require return type `void`.
- Require no parameters.
- Require a call from `Main`.

Correct outcome:
The shrine glows, seals, and the flying creature retreats.

Wrong outcome:
The shrine breach flares and the flying creature swoops near Kai.

Assets needed:

- cursed shrine/barrier sprite
- flying monster sprite or shadow sprite
- glow overlay

Important implementation notes:

- Use an existing shrine/seal prop instead of a window.

### Level 13 - Oracle Stone

Topic: Methods with no parameters but with return values

Story:
An oracle stone returns the code needed to unlock the path.

Level design:
Place a glowing stone/crystal at the center and a locked gate on the right. The returned value should appear as floating text above the stone, then travel or flash toward the gate. This makes the idea of "returning a value" visible.

Setting and feeling:
Night at a quiet oracle marker or cave shrine. The area should feel ancient, with one bright stone as the main light source. The mood is curious and puzzle-like: the stone gives something back when the method is correct.

Student task:
Define a method named `GetCode` that returns the integer `7`, then store the result in `code`.

Expected code shape:

```csharp
static int GetCode() {
  return 7;
}

static void Main(string[] args) {
  int code = GetCode();
}
```

Validation notes:

- Require `static int GetCode()`.
- Require `return 7;`.
- Require `int code = GetCode();`.
- Reject `void` method.

Correct outcome:
The number `7` appears above the stone and unlocks the gate.

Wrong outcome:
The stone shows a wrong number or stays dark.

Assets needed:

- crystal/stone sprite
- gate/door
- text panel for return value

### Level 14 - Diwata's Safe Path

Topic: Methods with no parameters but with return values

Story:
The diwata gives Kai a method that returns which route is safe.

Level design:
Create two visible routes: an upper safe path and a lower dangerous water route. The returned string chooses which route glows. Kai should only move after the selected path is shown, reinforcing that the method's return value controls the route.

Setting and feeling:
Night at a forked forest path. One side should look unsafe with red light, thorns, or shadow; the safe side should glow softly after the return value appears. The mood is guided uncertainty: the diwata knows, but Kai must use the returned answer.

Student task:
Define a method named `GetSafePath` that returns `"up"`, then assign it to `path`.

Expected code shape:

```csharp
static string GetSafePath() {
  return "up";
}

static void Main(string[] args) {
  string path = GetSafePath();
}
```

Validation notes:

- Require `static string GetSafePath()`.
- Require `return "up";`.
- Require `string path = GetSafePath();`.

Correct outcome:
The upper path lights green and Kai crosses safely.

Wrong outcome:
The lower water route flashes red and warns Kai away.

Assets needed:

- NPC guide sprite
- upper and lower path platforms
- animated water/waterfall hazard
- path glow

### Level 15 - Shrine Offering

Topic: Methods with parameters and no return values

Story:
A shrine accepts a specific offering. Kai must pass the offering name into the ritual method.

Level design:
Use a shrine/altar with an empty offering spot. Show the parameter value as a floating label over Kai's hand or over the altar. On success, the offering appears on the shrine and the barrier fades. On failure, the altar rejects it with a red flash.

Setting and feeling:
Night at a roadside altar with candles, fog, and a blocked path beyond it. The scene should feel respectful and ritual-based, not combat-heavy. The parameter should feel like the exact offering being handed to the method.

Student task:
Call a predefined void method named `PlaceOffering` with the string `"rice"`.

Expected code shape:

```csharp
static void Main(string[] args) {
  PlaceOffering("rice");
}
```

Validation notes:

- `PlaceOffering(string item)` is predefined.
- Require argument `"rice"`.
- Reject missing argument, wrong string, or return assignment.

Correct outcome:
The offering appears on the shrine and the barrier fades.

Wrong outcome:
The shrine rejects the offering and the barrier stays active.

Assets needed:

- shrine/altar platform
- item icon or crate
- barrier/gate

### Level 16 - Salt Against the Aswang

Topic: Methods with parameters and no return values

Story:
Kai throws a measured amount of salt to repel an aswang.

Level design:
Place the aswang/shadow enemy in front of the exit. The numeric parameter controls how far or how strongly the white particles travel. With the correct value, particles reach the monster exactly. Wrong values should visually fall short or overshoot.

Setting and feeling:
Fast, tense night encounter on a village road or forest edge. The aswang is closer and more threatening here. Use darker red accents, quick particle motion, and a clear sense that the parameter value controls the strength of Kai's action.

Student task:
Call a predefined void method named `ThrowSalt` with the integer `3`.

Expected code shape:

```csharp
static void Main(string[] args) {
  ThrowSalt(3);
}
```

Validation notes:

- `ThrowSalt(int amount)` is predefined.
- Require exact argument `3`.
- Reject strings, decimals, missing argument, or wrong number.

Correct outcome:
White particles fly toward the aswang and push it back.

Wrong outcome:
The particles fall short or overshoot, and the aswang blocks the path.

Assets needed:

- monster/shadow sprite
- small white particle effect drawn in Phaser
- forest/village path

Important implementation notes:

- No salt asset needed.
- Use white Phaser circles/particles.

### Level 17 - Anting-Anting Power

Topic: Methods with parameters and return values

Story:
Kai calculates the protection power of an anting-anting using two input values.

Level design:
Draw an amulet meter near Kai with a target mark at `8`. The method call should fill the meter based on the returned value. A shadow projectile approaches while the meter fills; if correct, the shield blocks it. This level should make return values feel like computed power.

Setting and feeling:
Night with a brief combat-test atmosphere. The scene can be a small clearing with a shadow attack coming from the right. It should feel like Kai is learning to calculate protection, with the amulet as the brightest object on screen.

Student task:
Define a method named `CalculatePower` that takes two integers and returns their sum. Store the result in `power`.

Expected code shape:

```csharp
static int CalculatePower(int basePower, int bonus) {
  return basePower + bonus;
}

static void Main(string[] args) {
  int power = CalculatePower(5, 3);
}
```

Validation notes:

- Require method name `CalculatePower`.
- Require two `int` parameters.
- Require `return basePower + bonus;`.
- Require call `CalculatePower(5, 3)`.
- Expected result is `8`.

Correct outcome:
The protection meter fills to 8 and blocks a shadow attack.

Wrong outcome:
The meter fills too low or stays empty, and the attack pushes Kai back.

Assets needed:

- amulet icon optional
- Phaser-drawn circle/meter
- enemy projectile or shadow

### Level 18 - Healing Ritual

Topic: Methods with parameters and return values

Story:
A wounded diwata needs a calculated healing value based on two ingredients.

Level design:
Place the diwata/NPC on the ground near a blocked path. Show two ingredient icons or labels and a healing bar above the NPC. The returned value fills the bar. Correct healing stands the NPC up and opens the path; wrong healing keeps the bar incomplete.

Setting and feeling:
Quiet night after danger has passed. The mood should be compassionate and slower. Use soft light around the wounded diwata, muted colors, and a healing bar that makes the returned value feel useful rather than abstract.

Student task:
Define a method named `Heal` that takes two integers and returns their product. Store the result in `healing`.

Expected code shape:

```csharp
static int Heal(int herb, int water) {
  return herb * water;
}

static void Main(string[] args) {
  int healing = Heal(4, 2);
}
```

Validation notes:

- Require two integer parameters.
- Require multiplication return expression.
- Require call `Heal(4, 2)`.
- Expected result is `8`.

Correct outcome:
The healing bar fills, the diwata stands, and she opens the path.

Wrong outcome:
The healing bar fills incorrectly, the diwata stays weak, and the path remains closed.

Assets needed:

- NPC sprite
- potion/crystal/fire sprite
- Phaser health/healing bar

### Level 19 - Endless Bamboo Stairs

Topic: Recursive Functions/Methods

Story:
The stairs repeat endlessly. Kai must use recursion with a base case to reach the top.

Level design:
Use stacked platforms or stair-like tiles rising upward/right. Add a recursion depth counter beside the play area. Each recursive call lights the next platform; the base case stops the sequence and reveals the exit. Failure should loop the platform lighting until the counter turns red.

Setting and feeling:
Night on an impossible staircase that seems to repeat into fog. The mood should be eerie and looping. Use repeated platform shapes, faint motion in the background, and a counter that gives the player a concrete sense of descending recursion depth.

Student task:
Complete a recursive method named `Climb` that stops when `step == 0`.

Expected code shape:

```csharp
static void Climb(int step) {
  if (step == 0) {
    return;
  }

  Climb(step - 1);
}
```

Validation notes:

- Require method `Climb(int step)`.
- Require base case checking `step == 0` or `step <= 0`.
- Require `return;` in base case.
- Require recursive call with `step - 1`.
- Reject recursion without a base case.

Correct outcome:
Each recursive depth lights one stair. When the base case is reached, Kai exits the repeating stairs.

Wrong outcome:
The stairs loop visually, the depth counter turns red, and Kai is returned to the start.

Assets needed:

- stairs/platform tiles
- repeated platforms
- depth counter UI

Important implementation notes:

- Use normal platforms; no bamboo-specific asset required.

### Level 20 - Echoes Under the Balete

Topic: Recursive Functions/Methods

Story:
Echoes repeat under a haunted tree. Kai must reduce the echo count until the curse stops.

Level design:
Use a dark forest scene with repeated echo text bubbles appearing around Kai. Each recursive call removes one bubble or makes it smaller. The base case clears the final bubble and opens the path. This avoids needing a special Balete asset.

Setting and feeling:
Very late night in a haunted forest. The scene should feel claustrophobic, with repeated whispers appearing around Kai. The emotional goal is relief: each recursive step reduces the echo until silence returns.

Student task:
Complete a recursive method named `Echo` that returns an integer count and stops at zero.

Expected code shape:

```csharp
static int Echo(int count) {
  if (count == 0) {
    return 0;
  }

  return Echo(count - 1);
}
```

Validation notes:

- Require `static int Echo(int count)`.
- Require base case `count == 0` or `count <= 0`.
- Require `return 0;` in the base case.
- Require recursive return with `count - 1`.

Correct outcome:
Echo text bubbles shrink one by one until the final echo disappears.

Wrong outcome:
Echo bubbles multiply or stay on screen, and Kai cannot proceed.

Assets needed:

- forest tileset
- optional large tree or dark background
- text bubbles drawn with Phaser
- shadow/glow effect

Important implementation notes:

- No carved tree needed.
- The recursion is shown through repeated echo bubbles.

## Lesson 3: Functions/Methods With Arrays

Theme: organized data plus reusable rituals.

### Level 21 - Process the Lantern Line

Topic: Methods with 1D arrays

Story:
Kai passes the lantern array into a ritual method to relight the whole street.

Level design:
Reuse a lantern-row layout, but add a large method panel between Kai and the lanterns. The array appears on the left side of the panel and the method name appears on the right. On success, a visual "data flow" line connects the array into the method, then the lanterns light.

Setting and feeling:
Night, but the barrio road now feels more hopeful because earlier lessons are paying off. Use more lanterns and slightly warmer lighting. The mood should communicate progress: Kai is no longer doing one small action, he is sending grouped data into a reusable ritual.

Student task:
Define a void method named `LightLanterns` that accepts an `int[]`, then call it with `lanterns`.

Expected code shape:

```csharp
static void LightLanterns(int[] lanterns) {
}

static void Main(string[] args) {
  int[] lanterns = { 1, 1, 1 };
  LightLanterns(lanterns);
}
```

Validation notes:

- Require method parameter `int[] lanterns`.
- Require array declaration in `Main`.
- Require call `LightLanterns(lanterns);`.

Correct outcome:
The method panel activates, then three lanterns light in sequence.

Wrong outcome:
The method panel fails to connect to the array, and the lanterns remain dark.

Assets needed:

- lantern/flame/orb row
- method panel UI
- gate/barrier

### Level 22 - Count the Cursed Charms

Topic: Methods with 1D arrays

Story:
Kai must pass a list of charms into a method that counts how many are cursed.

Level design:
Place several repeated charm/orb sprites in a row and a counter gate on the right. The method traversal highlights each charm, counts cursed ones, then sends the final number to the gate. The gate opens only if the count is correct.

Setting and feeling:
Night at a protective charm checkpoint. The area should feel like a final inspection before the curse gets stronger. Use red flashes for cursed charms and green/white light for clean ones. The mood is analytical and tense.

Student task:
Define a method named `CountCursed` that accepts an `int[]` and returns the number of `0` values.

Expected code shape:

```csharp
static int CountCursed(int[] charms) {
  int count = 0;
  for (int i = 0; i < charms.Length; i++) {
    if (charms[i] == 0) {
      count++;
    }
  }
  return count;
}
```

Validation notes:

- Require method return type `int`.
- Require parameter `int[] charms`.
- Require loop over `charms.Length`.
- Require condition `charms[i] == 0`.
- Require `count++`.
- Require `return count;`.

Correct outcome:
Cursed charms flash red, the counter shows the correct number, and the gate opens.

Wrong outcome:
The counter shows the wrong number, the charms stay cursed, and the gate stays closed.

Assets needed:

- gems/orbs/charms, or repeated item sprite
- counter UI
- gate

### Level 23 - Restore the Warding Grid

Topic: Methods with 2D arrays

Story:
Kai passes a 2D warding grid into a method that repairs the ritual floor.

Level design:
Use a larger 2D grid puzzle on the ground or as a floating panel. Show the function name above the grid so students understand the grid is being passed into a method. On success, rows and columns glow one by one, then the entire floor becomes safe.

Setting and feeling:
Night in a larger shrine floor or plaza. The atmosphere should feel like the barrio's main ward is almost restored. Use broader light beams and stronger grid glow than Level 5 to show this is a more advanced version of the same idea.

Student task:
Define a void method named `RestoreGrid` that accepts an `int[,]`.

Expected code shape:

```csharp
static void RestoreGrid(int[,] grid) {
}

static void Main(string[] args) {
  int[,] grid = {
    { 1, 0 },
    { 0, 1 }
  };
  RestoreGrid(grid);
}
```

Validation notes:

- Require parameter `int[,] grid`.
- Require a 2D array declaration.
- Require call `RestoreGrid(grid);`.
- Reject `int[][]` jagged arrays for this level.

Correct outcome:
Rows and columns glow in order until the grid is restored.

Wrong outcome:
The grid flickers unevenly and the ritual floor remains unsafe.

Assets needed:

- floor tiles
- Phaser-drawn 2D grid
- glow effect

### Level 24 - Roof Tile Defense

Topic: Methods with 2D arrays

Story:
A flying creature attacks through weak roof tiles. Kai must process a 2D tile grid to find safe cells.

Level design:
Build a side-scroller roof/platform section with a 2D grid overlay. The flying enemy travels overhead from left to right. Safe cells glow green as the method counts them. If correct, Kai stands on safe tiles while the enemy misses.

Setting and feeling:
Night on rooftops or high platforms with wind and fast movement. The mood is urgent: the flying creature is actively passing overhead. Use moving shadows, red danger flashes, and green safe-cell highlights to make the 2D array feel spatial.

Student task:
Define a method named `CountSafeTiles` that accepts an `int[,]` and returns how many cells equal `1`.

Expected code shape:

```csharp
static int CountSafeTiles(int[,] tiles) {
  int safe = 0;
  for (int row = 0; row < tiles.GetLength(0); row++) {
    for (int col = 0; col < tiles.GetLength(1); col++) {
      if (tiles[row, col] == 1) {
        safe++;
      }
    }
  }
  return safe;
}
```

Validation notes:

- Require method return type `int`.
- Require parameter `int[,] tiles`.
- Require nested loops.
- Require `GetLength(0)` and `GetLength(1)`.
- Require access `tiles[row, col]`.
- Require counting cells equal to `1`.

Correct outcome:
Safe tiles glow. The flying creature passes overhead and misses Kai.

Wrong outcome:
Unsafe tiles flash red, the creature dives, and Kai is pushed back.

Assets needed:

- platform/roof-like tiles
- flying enemy sprite
- Phaser grid overlay
- safe/unsafe tile highlights

Important implementation notes:

- Use normal platforms. The roof grid can be a UI overlay, not a literal roof asset.

## Final Level 25 - Bakunawa Eclipse: The Last Compile

Topic: Combined final level

Story:
Bakunawa has swallowed the moon and trapped Malumay in permanent night. Kai must combine arrays, traversal, functions, parameters, return values, recursion, and functions with arrays to restore the moon.

Level design:
Create a boss arena with Kai on the left, Bakunawa or a large shadow boss on the right, and a moon circle in the background. Split the fight into six short phases instead of one huge submission. Each phase lights a moon segment and damages the boss. Keep UI clear: current phase, objective, code panel, and restored moon segments.

Setting and feeling:
Final eclipse night. The sky should be darkest here, with the moon almost swallowed and the arena lit by red/purple eclipse light. The mood is high-stakes but readable. Each correct phase should visibly bring dawn closer, shifting the palette from red-black to blue, then gold.

Student task:
Complete a multi-phase script. Each phase checks one major concept.

Suggested phase tasks:

1. Declare `int[] symbols = { 1, 1, 0, 1 };`.
2. Traverse `symbols` and count corrupted values equal to `0`.
3. Define `static void RepairSymbol(int index)` and call `RepairSymbol(2);`.
4. Define `static int CalculateWard(int basePower, int bonus)` returning `basePower + bonus`.
5. Define `static int CountMoonCells(int[,] moon)` using nested loops.
6. Define recursive `static void BreakEclipse(int phase)` with a base case.

Validation notes:

- This should be implemented as phases, not one giant strict validator at first.
- Each phase can reuse validators/helpers from earlier levels.
- Give partial visual progress after each accepted phase.

Correct outcome:
Each phase restores part of the moon. Bakunawa loses one phase of power. After the final phase, the serpent retreats and dawn returns.

Wrong outcome:
Only the current phase fails. Bakunawa attacks, the moon darkens slightly, and the student retries that phase without restarting the whole boss unless required.

Assets needed:

- dragon/serpent/shadow boss sprite
- moon circle drawn with Phaser
- dark sky or cave arena background
- portals/orbs/crystals
- boss health/phase UI
- glow and flash effects

Asset-light approach:
If no serpent asset is available, use a generic dragon, shadow monster, or large silhouette boss. Draw the moon and phase symbols with Phaser graphics.

End screen:

```text
Compilation successful. Umaga na.
```

## Shared Validation Strategy

Early implementation can use regex/static checks similar to the existing tutorial levels. Keep the accepted syntax narrow and show the required format clearly.

Recommended validator families:

- array declaration validator
- exact array values validator
- array index access validator
- 2D array declaration validator
- for-loop traversal validator
- method declaration validator
- method call validator
- return-value method validator
- recursive method validator
- method-with-array-parameter validator

For future improvements, move harder levels to a parser or AST-lite validator.

## Suggested Asset Search Keywords

Use broad keywords instead of highly specific Filipino terms:

- `free pixel art forest platformer tileset`
- `free pixel art village tileset`
- `free pixel art horror platformer tileset`
- `free pixel art cave tileset`
- `free pixel art graveyard tileset`
- `free pixel art ghost enemy`
- `free pixel art monster sprite`
- `free pixel art flying enemy`
- `free pixel art dragon boss`
- `free pixel art lantern`
- `free pixel art torch`
- `free pixel art crystal`
- `free pixel art chest`
- `free pixel art gate door`
- `free pixel art platformer props`

## Implementation Notes

1. Keep current tutorial levels stable.
2. Add the new curriculum to progress defaults only after level keys are approved.
3. Build the new levels one lesson at a time, starting with Arrays.
4. Reuse scene patterns from current levels:
   - dialogue trigger
   - code validation
   - success animation
   - failure animation
   - backend progress save
5. Create generic reusable Phaser helpers for:
   - array box UI
   - 2D grid UI
   - glowing object sequence
   - method call/return panel
   - recursion depth display
6. Do not block implementation on rare assets. If an asset is hard to find, use a generic prop plus text/glow overlays.

## Approval Checklist

Before implementation, confirm:

- The 5 current levels remain as tutorial/prologue.
- The main curriculum has 25 new levels.
- The Filipino myth horror direction is approved.
- Asset-light visual substitutions are acceptable.
- Level names and topic mapping are approved.
- Expected code shapes are acceptable for beginner C# learners.
- Progress reset/migration behavior is decided.
