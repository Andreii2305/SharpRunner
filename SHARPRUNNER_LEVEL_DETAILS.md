# SharpRunner — Level Details (All 40 Levels)

> Last updated: 2026-04-05
> Game: SharpRunner — A Gamified C# Learning Platform
> Format: 4 Regions × 10 Levels each

---

## Table of Contents

- [Region 1 — The Castle of Syntax](#region-1--the-castle-of-syntax)
- [Region 2 — The Forge of Symbols](#region-2--the-forge-of-symbols)
- [Region 3 — The Branching Keep](#region-3--the-branching-keep)
- [Region 4 — The Spiral Citadel](#region-4--the-spiral-citadel)

---

## Region 1 — The Castle of Syntax

**Lesson:** Variables and Data Types
**Corruption Type:** The Unnamed Plague — nothing has been declared. NPCs are mute. Doors have no labels. Items are weightless ghosts.
**Visual Theme:** Crumbling medieval stone castle. Fog everywhere. Flickering torches. Desaturated palette — grey stone, pale blue mist, faint amber.

---

### Level 1-1 — The Awakening

**Scene Setup:**
Kai wakes up in a collapsed courtyard. A cracked stone path stretches toward a glowing portal. The path has distance markers etched into it, but the hero won't move — he has no instructions telling him how far to go.

**NPC Dialogue:**
> *(Stone inscription on the wall)* "Name the distance. Give it a value. Only then may the journey begin."

**Coding Objective:**
Student declares an integer variable to represent the number of steps Kai should walk toward the portal.

**Visual Payoff:**
Kai walks exactly the declared number of steps. If correct, he reaches the portal and it activates with a pulse of green light. Wrong value — Kai stops short or overshoots and idles at the edge. Wrong format — Kai glitches and falls.

**Asset Callouts:**
- Cracked courtyard tileset (stone, moss, rubble)
- Glowing portal sprite (inactive grey → active green)
- Distance marker props on ground
- Kai idle + walk animation

---

### Level 1-2 — What Is Your Name?

**Scene Setup:**
Kai reaches a checkpoint gate guarded by a silent NPC — a frozen villager who cannot open the gate because he doesn't know who's asking. A name plaque beside the gate is blank.

**NPC Dialogue:**
> "The gate opens for no nameless traveler. Declare yourself."

**Coding Objective:**
Student declares a string variable and assigns Kai's name to it.

**Visual Payoff:**
The blank name plaque fills in with the declared string. The villager turns, reads it, and the gate creaks open. If no name is given, the villager shakes his head and the gate stays shut.

**Asset Callouts:**
- Checkpoint gate sprite (locked/open states)
- Blank name plaque prop (fillable text overlay)
- Frozen villager NPC sprite + "turn and read" animation
- Gate open animation + dust particle

---

### Level 1-3 — Voices of the Village

**Scene Setup:**
A small frozen village square. Three NPCs stand mid-conversation, mouths open, silent — their dialogue strings were wiped. A nearby signpost shows three empty speech bubbles. The road out is blocked by a symbolic silence barrier — a translucent wall of static.

**NPC Dialogue:**
> *(Arlen, watching from a doorway)* "They've been like this since the Plague hit. Give them their words back."

**Coding Objective:**
Student declares three separate string variables — one for each NPC's line of dialogue.

**Visual Payoff:**
Each NPC's speech bubble fills in sequentially as the code compiles. Once all three are declared, a short cutscene plays — the villagers resume their conversation, the static barrier dissolves, and the route east opens.

**Asset Callouts:**
- Village square tileset (cobblestone, frozen fountain, benches)
- Three distinct frozen NPC sprites (villager variants)
- Speech bubble UI overlays (empty → filled animation)
- Static barrier sprite (translucent wall with glitch texture)

---

### Level 1-4 — The Coin Keeper

**Scene Setup:**
A crumbling bridge over a dry ravine. A toll collector sits at a booth, but his ledger shows no coin count — he can't calculate the toll owed or verify if Kai has enough. The bridge remains raised.

**NPC Dialogue:**
> "I can't lower the bridge for a man with no counted coins. Declare your purse."

**Coding Objective:**
Student declares an integer variable representing the number of coins Kai carries.

**Visual Payoff:**
The toll collector checks the ledger, nods, and the bridge lowers with a grinding stone animation. Wrong value (too low) — collector shakes his head, bridge stays raised. No declaration — collector looks confused, nothing happens.

**Asset Callouts:**
- Raised/lowered bridge sprite (two states, animation)
- Toll booth prop
- Coin counter ledger UI element
- Ravine background with dry riverbed

---

### Level 1-5 — Potion Measure

**Scene Setup:**
A potion workshop on the castle's second floor. A cauldron in the center is blocked by a force-sealed door. To deactivate the seal, the correct potion measurement must be declared — a precise float value etched into the seal's instructions.

**NPC Dialogue:**
> "Whole numbers won't do here. The seal demands precision. A fraction of truth."

**Coding Objective:**
Student declares a float or double variable with a specific decimal value shown on the seal's inscription.

**Visual Payoff:**
The cauldron bubbles, the seal glows and shatters, and the obstacle blocking the path (a collapsed shelf) rises and clears. Wrong type (using int) — the seal flickers and rejects it.

**Asset Callouts:**
- Potion workshop tileset (shelves, bottles, cauldron)
- Force seal sprite (glowing runic circle on door)
- Cauldron bubble animation
- Collapsed shelf obstacle + clearing animation

---

### Level 1-6 — Rune Letter

**Scene Setup:**
A long corridor with six rune-engraved doors. Five are already open — their runes matched. The sixth is dark. Its rune is a single carved character waiting to be matched.

**NPC Dialogue:**
> *(Inscription above the door)* "A single letter. Not a word, not a number. One character seals this passage."

**Coding Objective:**
Student declares a char variable and assigns the specific character shown carved into the door.

**Visual Payoff:**
The rune on the sixth door glows, then pulses and matches. The door swings open revealing a lit corridor beyond. Wrong character — rune flickers red and door shudders.

**Asset Callouts:**
- Rune door sprite (dark/active/open states)
- Rune glow animation
- Long corridor tileset (stone, wall sconces)

---

### Level 1-7 — Oath of Truth

**Scene Setup:**
The castle's guard post. A sentinel blocks the inner gate. He doesn't check coins or names — he checks allegiance. A loyalty register on the wall has a single true/false field labeled "Ally."

**NPC Dialogue:**
> "Are you with us or against us? There is no middle. Declare your allegiance — true or false."

**Coding Objective:**
Student declares a boolean variable and assigns it true or false. The level requires true to pass.

**Visual Payoff:**
If true — the guard stands aside and the inner gate opens. If false — the guard crosses his spear and blocks the path (dead end, level resets). Teaches that boolean has two meaningful outcomes.

**Asset Callouts:**
- Guard sentinel sprite (blocking/standing aside states)
- Loyalty register prop (wall-mounted board)
- Inner gate sprite (locked/open)
- Spear cross animation

---

### Level 1-8 — Pack the Journey

**Scene Setup:**
A supply room before the castle's deepest wing. A magical inventory chest requires all items to be declared before it unlocks. A checklist on the wall shows the required types: a count, a name, a measurement, a letter, and a flag.

**NPC Dialogue:**
> "The chest only opens for a fully prepared traveler. Declare everything on the list."

**Coding Objective:**
Student declares multiple variables of different types (int, string, float, char, bool) in a single script — one for each required item on the checklist.

**Visual Payoff:**
Each item on the checklist glows green as its variable is declared. When all five are complete, the chest opens and releases a key. A previously locked door in the background unlocks.

**Asset Callouts:**
- Supply room tileset (barrels, crates, shelves)
- Magical chest sprite (locked/opening animation)
- Checklist board prop (wall-mounted, items check off dynamically)
- Key item sprite

---

### Level 1-9 — Gate of Exact Declarations

**Scene Setup:**
A trap corridor — pressure plates on the floor, arrow slits in the walls. The mechanism is controlled by a logic panel at the entrance. It only accepts exact, clean declarations. Any extra syntax, wrong type, or stray character triggers the traps.

**NPC Dialogue:**
> "The corridor shows no mercy for the imprecise. Every declaration must be exact. Not one character wrong."

**Coding Objective:**
Student must declare a strict set of variables exactly as specified — no extras, no wrong types, no misspellings. The level tests precision over creativity.

**Visual Payoff:**
Each correct declaration disarms one trap section. All correct — corridor is fully disarmed and Kai walks through cleanly. Any error — the corresponding trap fires (arrows fly, plates depress) and the level resets.

**Asset Callouts:**
- Trap corridor tileset (pressure plates, arrow slits)
- Arrow projectile sprite
- Logic panel prop (wall-mounted code input)
- Trap armed/disarmed state animations

---

### Level 1-10 (Boss) — Archivist of Types

**Scene Setup:**
The castle's grand archive — floor-to-ceiling bookshelves, a massive central desk, floating corrupted data tablets spinning in the air. The Archivist floats at the center, his form made of scrambled, wrong-type entries. Every book in the archive has its data types swapped — strings holding numbers, booleans holding names.

**NPC Dialogue:**
> "You think you can restore this archive? Every record I hold is now mine. Fix them — if you can."

**Coding Objective:**
Student is presented with a series of corrupted variable declarations shown on-screen. They must rewrite each one with the correct type — fixing int-to-string swaps, bool-to-float errors, and misassigned chars.

**Visual Payoff:**
Each corrected declaration tears a page away from the Archivist's form. After all corrections, his form collapses into a pile of properly sorted books. The archive shelves glow and reorganize. Arlen enters, picks up a book, reads his own name — and speaks it aloud for the first time. A door at the back of the archive swings open revealing the path to Region 2.

**Asset Callouts:**
- Grand archive tileset (massive bookshelves, grand desk, stone floors)
- Floating data tablet sprites (glitched text overlays)
- Archivist boss sprite (multi-phase: full corruption → partial → defeated)
- Page-tear hit animation
- Arlen full-body sprite with speaking animation
- Archive reorganize animation (books flying into correct positions)
- Region 2 unlock door + dramatic light reveal

---

## Region 2 — The Forge of Symbols

**Lesson:** Operators
**Corruption Type:** Miscalculation Fever — every machine computes wrong. Bridges calculate themselves too short. Cannons fire the wrong distance.
**Visual Theme:** Industrial-medieval forge town. Massive gear mechanisms, molten metal rivers, steam vents. Palette — deep orange, forge-red, dark iron grey, glowing amber.

---

### Level 2-1 — Steps and Stones

**Scene Setup:**
A series of floating iron platforms over a lava river. The platforms are spaced at exact intervals. Kai must reach a lever on the far side, but the number of tiles to cross must be calculated — not guessed.

**NPC Dialogue:**
> *(Mara, at the entrance)* "It's twelve tiles to the lever — but you've only got eight steps walked and four more needed. Figure out how to combine them."

**Coding Objective:**
Student uses addition and subtraction operators to compute the correct number of steps needed to cross.

**Visual Payoff:**
Kai walks the calculated number of steps precisely, landing on the lever platform. He pulls the lever — a bridge section extends. Wrong answer — Kai walks too few or too many steps and falls into the lava gap (death animation, reset).

**Asset Callouts:**
- Iron platform tileset (floating, lava gaps below)
- Lava river animated background
- Lever prop (pull animation)
- Bridge extend animation

---

### Level 2-2 — Forge Multipliers

**Scene Setup:**
A key press mechanism — a massive gear lock on a vault door. The gear has three slots. Each slot requires a calculated value using multiplication, division, or modulus. The values are shown on plaques beside each slot.

**NPC Dialogue:**
> "The vault doesn't want the answer handed to it. It wants you to earn it — multiply, divide, find the remainder."

**Coding Objective:**
Student writes expressions using multiplication, division, and modulus operators to produce the three required values.

**Visual Payoff:**
Each slot glows as its value is correctly computed and entered. When all three are filled, the vault door grinds open with a heavy mechanical animation. Cogs spin, steam vents fire, and a path beyond is revealed.

**Asset Callouts:**
- Vault door sprite (three-slot mechanism, open/closed states)
- Gear slot props (empty/filled glow states)
- Plaque props (showing target values)
- Vault open animation (cogs + steam)

---

### Level 2-3 — Order of Power

**Scene Setup:**
A platform puzzle — four platforms at different heights. The platform Kai needs to land on is determined by the result of a mathematical expression. But the expression has mixed operators, and the wrong order of operations produces the wrong platform height.

**NPC Dialogue:**
> "The platforms don't rise by feeling. They rise by the rules of the expression — and the rules have an order."

**Coding Objective:**
Student solves an expression with mixed operators (e.g., addition, multiplication together) and must respect operator precedence to get the correct result.

**Visual Payoff:**
The correct platform rises to Kai's level and locks in place. Kai walks across. Wrong result — the wrong platform rises and Kai either can't reach it or jumps to a dead end.

**Asset Callouts:**
- Multi-height platform sprites (rise/lock animations)
- Expression display panel (wall-mounted)
- Platform shadow/lighting per height level

---

### Level 2-4 — Battle Math

**Scene Setup:**
A combat arena. Kai faces a Forge Golem — a small mechanical enemy. The golem's armor value and Kai's attack power are shown on combat panels. Kai can only proceed if the correct damage formula produces enough to break the golem's armor.

**NPC Dialogue:**
> "That thing's armor is 40. Your base strike is 8. You've got a multiplier in your pack. Do the math or don't bother swinging."

**Coding Objective:**
Student writes an arithmetic expression combining attack and multiplier values to calculate final damage — must exceed the golem's armor value.

**Visual Payoff:**
Kai swings the CodeBlade — the golem's armor cracks and it collapses. A satisfying hit spark and metal clang. Wrong formula — strike doesn't break armor, golem pushes Kai back, level resets.

**Asset Callouts:**
- Combat arena tileset (iron floor, audience cages in background)
- Forge Golem enemy sprite (idle, damaged, defeated)
- Combat panel UI overlay (attack/armor values displayed)
- Hit spark VFX + armor crack animation

---

### Level 2-5 — Experience Burst

**Scene Setup:**
A large glowing crystal in the center of a platform — an experience crystal that powers a locked gate. It requires a specific charge value to activate. Charge is calculated from a combination of arithmetic expressions.

**NPC Dialogue:**
> "The crystal needs exactly 256 units of charge. You've got base values and operations. Combine them right."

**Coding Objective:**
Student combines multiple arithmetic expressions to arrive at a specific target value. Tests fluency with chaining operations.

**Visual Payoff:**
The crystal charges incrementally as expressions compile correctly — glowing brighter with each correct value until it bursts with light and the gate behind it swings open.

**Asset Callouts:**
- Experience crystal sprite (charge level variants — dim, half, full, burst)
- Crystal burst VFX (light explosion)
- Locked gate + open animation
- Charge value display overlay

---

### Level 2-6 — Eyes of Comparison

**Scene Setup:**
A scanner room — a mechanical eye mounted on the wall scans every object that passes. It checks if values match, differ, or exceed thresholds. Kai must pass an object with the exact right value through the scanner.

**NPC Dialogue:**
> "The scanner doesn't take your word for it. It checks. Is it equal? Not equal? Greater? Tell it how to look."

**Coding Objective:**
Student uses comparison operators (==, !=, >, <) in expressions to correctly define the scanner's check condition.

**Visual Payoff:**
The scanner eye blinks green for a correct condition and the gate beyond it opens. Red blink for a false result — gate stays shut and alarm briefly sounds.

**Asset Callouts:**
- Scanner eye prop sprite (idle, scanning, green pass, red fail)
- Scanner room tileset (conveyor belt, mechanical wall, inspection panel)
- Alarm flash VFX (brief red screen edge)

---

### Level 2-7 — Threshold Trial

**Scene Setup:**
A checkpoint gate with a weight threshold — it only opens for travelers carrying enough (or not too much). A scale prop sits at the gate. The gate's rule is written on a plaque: a minimum or maximum value condition.

**NPC Dialogue:**
> "The gate opens at 50 or more. Not 49. Not maybe. At least 50."

**Coding Objective:**
Student uses >= or <= operators to write the gate's condition correctly.

**Visual Payoff:**
If the condition is correctly written and the value satisfies it, the scale tips to the correct side and the gate opens. Wrong operator — scale tips wrong way, gate doesn't respond.

**Asset Callouts:**
- Scale prop sprite (balanced, tipped left, tipped right)
- Threshold gate sprite (locked/open)
- Value plaque prop
- Scale tip animation

---

### Level 2-8 — Operator Relay

**Scene Setup:**
A relay puzzle — a chain of three connected machines. Each machine takes an input, applies an operator to it, and passes the result to the next. The final machine must output a specific value to open the exit.

**NPC Dialogue:**
> "Machine one adds. Machine two multiplies. Machine three compares. Chain them right and the door opens itself."

**Coding Objective:**
Student chains arithmetic and comparison operators across a multi-step expression to hit the required output at the final machine.

**Visual Payoff:**
Each machine lights up in sequence as the relay computes. Final machine outputs the value — if correct, a conveyor belt activates and carries Kai through the exit door.

**Asset Callouts:**
- Relay machine sprites (three variants, lit/unlit states)
- Conveyor belt animated tile
- Relay connection pipe/wire visual
- Sequential light-up animation

---

### Level 2-9 — Arena Calculator

**Scene Setup:**
A combat arena with waves of small mechanical enemies — each wave has a specific armor value. The arena door only opens after Kai calculates and applies the correct damage expression for each wave.

**NPC Dialogue:**
> "Three waves. Each tougher than the last. Don't guess — calculate."

**Coding Objective:**
Student writes damage calculation expressions for three waves, each requiring different operator combinations. Wave values escalate in complexity.

**Visual Payoff:**
Each correctly solved wave collapses its enemies with a satisfying chain reaction. After wave three, the arena gate rises and a victory banner drops. Wrong calculation — enemies don't fall, wave doesn't clear.

**Asset Callouts:**
- Arena tileset (iron floor, cage walls, crowd silhouettes in background)
- Wave enemy sprites (three mechanical variants, increasing size)
- Victory banner drop animation
- Enemy collapse chain VFX

---

### Level 2-10 (Boss) — Iron Colossus

**Scene Setup:**
A massive underground forge chamber. The Iron Colossus stands at the center — a hulking mechanical guardian with glowing equation panels on its chest, shoulders, and arms. Each panel shows a broken formula. The chamber shakes with each step it takes.

**NPC Dialogue:**
> *(Mara, hiding behind a pillar)* "Its armor runs on math. Break the equations and the plating falls. I'll be right here — not helping — cheering."

**Coding Objective:**
The boss has four armor panels. Each panel displays a broken or incomplete operator expression. Student must correctly complete or fix each expression to destroy that panel.

**Visual Payoff:**
Each correct expression causes the corresponding armor panel to explode off the Colossus in sparks and metal shards. After all four panels are destroyed, the Colossus staggers, its core overloads, and it collapses in a slow, dramatic fall. Mara runs out and cheers. She hands Kai the CodeBlade upgrade — a new edge that glows with conditional logic. Region 3 door opens in the back wall.

**Asset Callouts:**
- Forge chamber boss arena tileset (massive scale, forge machinery in background)
- Iron Colossus boss sprite (full armor, panel-by-panel damage states, collapse animation)
- Armor panel explosion VFX (metal shards + sparks)
- Mara celebration animation
- CodeBlade upgrade VFX (new glow effect on blade)
- Region 3 door reveal

---

## Region 3 — The Branching Keep

**Lesson:** Conditional Statements
**Corruption Type:** The False Branch — every decision resolves to the wrong outcome. Guards let enemies through and block heroes.
**Visual Theme:** Gothic fortress city built vertically — towers, branching staircases, multiple routes. Palette — deep purple stone, silver moonlight, pale green torchlight, shadow-heavy.

---

### Level 3-1 — Two Roads

**Scene Setup:**
A literal fork in the road inside the keep's first corridor. Left path leads to a dead end with a spike pit. Right path leads forward. A logic panel at the fork is blank — with no condition, the gate defaults to the wrong route.

**NPC Dialogue:**
> "The gate used to know which road to open. Now it opens nothing. Write it a condition."

**Coding Objective:**
Student writes a basic if/else statement directing Kai to take the correct (safe) route based on a given variable's value.

**Visual Payoff:**
The correct gate opens and the safe path lights up. Kai walks through. If the condition is wrong — the spike pit gate opens instead and Kai peers in, backs away, level resets.

**Asset Callouts:**
- Fork corridor tileset (split path, gothic stone)
- Spike pit obstacle sprite
- Two gate sprites (left/right, open/closed)
- Path lighting animation (correct route glows)

---

### Level 3-2 — Night Watch

**Scene Setup:**
The keep's outer wall at night. A guard post with a single guard. He checks a password variable. If it matches the required phrase, he steps aside. If not, he blocks and the outer gate stays locked.

**NPC Dialogue:**
> "I don't care who you are. I care what the condition says. If it's right, you pass."

**Coding Objective:**
Student writes an if statement checking whether a string or integer variable matches the guard's required value, and opens the gate in the true branch.

**Visual Payoff:**
Guard checks an invisible registry, nods, and steps aside. Gate opens with a moonlit creak. Wrong condition — guard shakes his head and crosses arms.

**Asset Callouts:**
- Night wall tileset (dark stone, moonlight overlay)
- Guard NPC sprite (blocking/aside states)
- Outer gate sprite (locked/open, moonlit)
- Moonlight ambient light layer

---

### Level 3-3 — Password at Dawn

**Scene Setup:**
A gatehouse at dawn. Two gates — one for known allies, one for strangers. An input variable is already declared (representing the traveler's status). The student must branch on its value to direct Kai to the correct gate.

**NPC Dialogue:**
> "Allies use the east gate. Strangers use the west — and strangers don't get through. Which are you?"

**Coding Objective:**
Student writes an if/else block that checks the traveler variable and directs to the correct gate (ally = east = open, stranger = west = locked).

**Visual Payoff:**
East gate opens with morning light flooding in. Kai walks through. If condition is reversed — west gate opens to a locked cell, level resets.

**Asset Callouts:**
- Gatehouse tileset (two gate arches, dawn light overlay)
- East gate + west gate sprites (distinct designs, open/locked)
- Dawn light color gradient background

---

### Level 3-4 — Weight of the Bridge

**Scene Setup:**
A stone bridge over a deep gorge. The bridge has a weight limit — it holds only if the load is within a threshold. A structural monitor panel shows the current load value. The bridge collapses if the condition isn't properly checked first.

**NPC Dialogue:**
> "The bridge held 10 knights once. Now it's temperamental. Check the load before you cross."

**Coding Objective:**
Student writes a conditional that checks whether a load variable is within the safe range before allowing Kai to cross (bridge appears/holds only if condition is true).

**Visual Payoff:**
If condition is true — bridge glows stable and Kai walks across safely. If false — bridge cracks and starts to crumble (Kai stops before crossing, level resets safely).

**Asset Callouts:**
- Stone bridge sprite (stable/crumbling states)
- Gorge background (deep, atmospheric)
- Structural monitor panel prop
- Bridge crumble animation (partial, non-fatal visual)

---

### Level 3-5 — Hall of Many Doors

**Scene Setup:**
A long hall with five doors. Only one is correct based on Kai's current stat value. A panel shows the stat. The student must write a multi-branch condition to identify and open only the right door.

**NPC Dialogue:**
> "Five doors. One answer. The others are traps — or worse, boring hallways that loop back here."

**Coding Objective:**
Student writes an if/else if/else chain to evaluate a variable and open the correct door out of five.

**Visual Payoff:**
The correct door pulses with green light and swings open. Wrong doors rattle but don't open. Choosing correctly sends Kai through to the next area.

**Asset Callouts:**
- Five-door hall tileset (gothic stone, numbered door plaques)
- Door sprites (five variants, locked/rattling/open states)
- Stat display panel prop
- Green pulse animation on correct door

---

### Level 3-6 — Nested Decisions

**Scene Setup:**
A dual-lock checkpoint. Two conditions must both be true to open the gate — a rank check AND an access level check. Either alone is not enough.

**NPC Dialogue:**
> "The outer gate needs rank. The inner gate needs clearance. One without the other and you're not getting through."

**Coding Objective:**
Student writes a nested if statement (or compound condition with &&) to handle both checks simultaneously.

**Visual Payoff:**
Outer gate opens first, then inner gate — sequential unlock animation. Both conditions met — Kai walks through both. One condition fails — corresponding gate holds, other may open but Kai is still blocked.

**Asset Callouts:**
- Dual-gate tileset (two consecutive gates in a single corridor)
- Rank plaque + clearance badge props
- Sequential gate open animation

---

### Level 3-7 — Merchant's Deal

**Scene Setup:**
A merchant's stall in the keep's market courtyard. The merchant offers two deals: a good one and a bad one. Which deal Kai gets depends on a negotiation variable. The student must write the condition that gives Kai the better outcome.

**NPC Dialogue:**
> "I've got two prices. Which one you get depends entirely on what your negotiation score says — not on how you look."

**Coding Objective:**
Student writes an if/else that branches to either the good reward or penalty outcome based on the negotiation variable's value. Level teaches that branches have real consequences.

**Visual Payoff:**
Good branch — merchant smiles, hands Kai a glowing item, path forward opens. Bad branch — merchant shrugs, takes a coin, different (longer) path opens. Both branches are valid paths — reinforcing that else isn't always failure.

**Asset Callouts:**
- Market courtyard tileset (stalls, lanterns, cobblestone)
- Merchant NPC sprite (smiling/shrugging states)
- Item reward sprite
- Two path exits (visual distinction between the two routes)

---

### Level 3-8 — Edge of Equality

**Scene Setup:**
A precision trap corridor — pressure plates that trigger only at exact values. Too low, too high, or off by one and the trap fires. The exact boundary value is the only safe one.

**NPC Dialogue:**
> "Not more. Not less. Exactly at the line. The trap respects only equality."

**Coding Objective:**
Student writes a condition using == to check for an exact boundary value. Tests that students understand equality vs. comparison operators in edge cases.

**Visual Payoff:**
Correct equality condition — plates stay still, Kai walks cleanly. Off-by-one or wrong operator — plates depress and arrow traps fire (Kai retreats, level resets).

**Asset Callouts:**
- Precision trap corridor (purple stone reskin, pressure plates, arrow slits)
- Pressure plate sprites (safe/triggered states)
- Equality display panel

---

### Level 3-9 — Judgment Tower

**Scene Setup:**
A tall tower interior. Three floors, each with a different condition check. Must clear all three to reach the summit. Conditions chain — floor two's gate condition depends on the outcome of floor one.

**NPC Dialogue:**
> "The tower judges in order. What you answer on the first floor follows you to the third."

**Coding Objective:**
Student writes a multi-condition chain across three connected if/else if blocks — each floor's branch outcome affects what's available on the next.

**Visual Payoff:**
Each floor's gate opens in sequence as conditions are satisfied. Reaching the summit triggers a brief animation of the tower "aligning" — all three floors glow simultaneously before the roof hatch opens.

**Asset Callouts:**
- Tower interior tileset (three vertical floors, spiral staircase between)
- Floor gate sprites (per-floor distinct designs)
- Tower alignment glow animation
- Roof hatch open + sky reveal

---

### Level 3-10 (Boss) — Judge of Branches

**Scene Setup:**
The keep's grand courtroom. Judge Voss stands at the center — robed, enormous, split visually down the middle: left half gold (true), right half dark shadow (false). He constantly shifts which half is dominant. Floating case tablets circle him — each one is a conditional scenario.

**NPC Dialogue:**
> "Every traveler who comes before me is judged. But the judgment is yours to write. Write it wrong and the wrong path opens for you."

**Coding Objective:**
Each boss phase presents a conditional scenario on a case tablet. Student must write the correct if/else logic for each scenario. Four phases total — simple if, if/else, if/else if, and a nested final case.

**Visual Payoff:**
Each correct ruling shatters a case tablet and forces one of Voss's halves to dim. After four correct rulings, both halves collapse inward and Voss shrinks back to his real form — a small, tired old judge who finally sits down. He stamps Kai with a seal of passage. The courtroom doors open to reveal the path to Region 4.

**Asset Callouts:**
- Grand courtroom tileset (high ceilings, gallery seating, elevated judge's podium)
- Judge Voss boss sprite (split gold/shadow design, four phase damage states)
- Floating case tablet sprites (glowing scrolls with condition text)
- Tablet shatter VFX
- Voss restored small form + sitting animation
- Seal of passage stamp VFX
- Courtroom exit doors + Region 4 path reveal

---

## Region 4 — The Spiral Citadel

**Lesson:** Loops
**Corruption Type:** The Infinite Recursion — everything is caught in endless repetition. Soldiers march the same steps forever. Clocks tick but never advance.
**Visual Theme:** Towering citadel spiraling upward into a fractured sky. Repeating architecture. Palette shifts by floor: grey mechanical → electric blue glitch → black void with red Core glow at the peak.

---

### Level 4-1 — March Pattern

**Scene Setup:**
A long marching ground inside the citadel's lower floor. A line of soldier automatons blocks the path — they march forward three steps, reset, march again, forever. Kai needs to model the same march pattern to sync with them and slip through a gap.

**NPC Dialogue:**
> *(Wall inscription)* "The march never ends. But the gap appears on the seventh step. Count correctly."

**Coding Objective:**
Student writes a for loop that repeats a movement action a specific number of times to move Kai through the automaton gap.

**Visual Payoff:**
Kai marches in sync with the automatons, reaches the gap on the correct iteration, and slips through. The automatons continue looping behind him. Wrong iteration count — Kai collides with an automaton and is pushed back.

**Asset Callouts:**
- Marching ground tileset (stone floor, citadel wall, repeating window props)
- Soldier automaton sprites (marching loop animation)
- Gap timing VFX (brief highlight when gap opens)

---

### Level 4-2 — Endless Hall

**Scene Setup:**
A corridor that appears to loop visually — same doors, same torches, same cracks. Kai runs but the hall seems to repeat. A marker on the floor is the actual endpoint — but only a while loop with the right stop condition will get Kai there.

**NPC Dialogue:**
> "The hall doesn't end. Unless you tell it when to stop."

**Coding Objective:**
Student writes a while loop with a correct stopping condition based on a position or distance variable.

**Visual Payoff:**
Kai runs down the hall — the looping visual effect continues until the condition is met, then the hall "snaps" out of its repeat and the end marker glows. The exit door appears. Infinite loop or wrong condition — soft fail animation, then reset prompt.

**Asset Callouts:**
- Repeating hall tileset (seamless loop-designed corridor)
- Loop glitch VFX (screen shimmer when hall is looping)
- Hall "snap" exit animation (corridor straightens, end becomes visible)
- Exit door sprite

---

### Level 4-3 — Last Checkpoint

**Scene Setup:**
A switch sequence puzzle — three switches on the wall that must each be hit at least once to deactivate a barrier. Even if all conditions are already met, the action must execute at least once before checking.

**NPC Dialogue:**
> "You have to hit it before you know if it works. That's just how this checkpoint operates."

**Coding Objective:**
Student writes a do-while loop — the action executes at least once regardless of the initial condition, then checks whether to continue.

**Visual Payoff:**
Each switch flips in sequence (do → then check). When all three are flipped, the barrier dissolves. The level makes the do-before-check distinction visually clear.

**Asset Callouts:**
- Switch props (three variants, unflipped/flipped states)
- Barrier sprite (energy wall, active/dissolve animation)
- Sequential switch flip animation

---

### Level 4-4 — Crystal Collector

**Scene Setup:**
A cavern chamber inside the citadel with glowing crystals embedded in the walls — exactly eight of them. A collection device tracks how many have been gathered. The path forward requires all eight.

**NPC Dialogue:**
> "Eight crystals. The machine won't move until it has every single one. Write the loop that collects them."

**Coding Objective:**
Student writes a loop (for or while) that iterates through all crystal positions and collects each one.

**Visual Payoff:**
Kai moves through the room, each crystal lighting up as it's collected. Counter ticks upward. At eight, the collection device activates and the floor opens to a stairway below.

**Asset Callouts:**
- Cavern chamber tileset (crystal-embedded walls, dark stone)
- Crystal sprite (embedded/collected states, glow animation)
- Collection device prop (counter display)
- Stairway floor reveal animation

---

### Level 4-5 — Wave Runner

**Scene Setup:**
An outdoor rampart — three lanes of wave-enemies approaching from the right. Each lane has its own wave count. Kai must loop through each lane and clear it before advancing.

**NPC Dialogue:**
> "Three lanes. Each lane runs its own wave. You'll need a loop inside a loop."

**Coding Objective:**
Student writes nested loops — outer loop iterates through lanes, inner loop handles waves within each lane.

**Visual Payoff:**
Each inner loop completion clears a lane with a satisfying sweep VFX. When the outer loop completes (all three lanes cleared), the rampart gate opens.

**Asset Callouts:**
- Rampart tileset (battlements, three visible lanes)
- Wave enemy sprites (small, fast, distinct per lane)
- Lane clear sweep VFX
- Rampart gate open animation

---

### Level 4-6 — Method March

**Scene Setup:**
A parade ground where Kai must reach a distant beacon using predefined movement methods. The methods are already written — walk() and run(). Kai must loop through them in the right combination to cover the exact distance.

**NPC Dialogue:**
> "walk() moves you one tile. run() moves you three. The beacon is twelve tiles away. Loop the right methods."

**Coding Objective:**
Student writes a loop that calls predefined walk() and run() methods to reach exactly the required distance.

**Visual Payoff:**
Kai's movement follows the loop exactly — stepping or sprinting per method call. Landing exactly on the beacon tile triggers it to light up and a door opens beyond it. Overshooting or undershooting — beacon doesn't trigger.

**Asset Callouts:**
- Parade ground tileset (long flat stone path, distance markers)
- Beacon prop (dark/lit states)
- Walk vs. run animation variants for Kai
- Beacon light-up VFX

---

### Level 4-7 — Directional Sprint

**Scene Setup:**
A branching corridor with a left path and a right path. Each leads to a partial objective. Kai must loop through directional run calls, passing the correct direction argument each time.

**NPC Dialogue:**
> `run("left")` and `run("right")` are not the same thing. The corridor will remind you of that.

**Coding Objective:**
Student writes loops that call run() with direction string arguments — left and right — to navigate Kai through both path segments in the correct order.

**Visual Payoff:**
Kai sprints left, hits the left objective (a switch), sprints back right per the loop, hits the right objective. Both objectives lit — the central door opens.

**Asset Callouts:**
- Branching corridor tileset (T-junction design)
- Left/right switch props
- Direction arrow VFX (brief arrow shows Kai's direction on each call)
- Central door open animation

---

### Level 4-8 — Break the Trap

**Scene Setup:**
A hazard corridor with mixed safe and dangerous tiles. A loop that runs all the way through would hit every tile — including the dangerous ones. Student must use break and continue to skip hazards and exit the loop early when the goal is reached.

**NPC Dialogue:**
> "Some tiles will hurt you. Some you can skip. And when you've found what you came for — stop. Don't keep going out of habit."

**Coding Objective:**
Student writes a loop using break to exit when the goal tile is found, and continue to skip over hazard tiles mid-loop.

**Visual Payoff:**
Kai moves through the corridor — hopping over skipped tiles (continue), walking through safe ones, and stopping cleanly when break fires. Hazard tiles that would have been hit glow red briefly as Kai skips them. Clean exit triggers the corridor's end door.

**Asset Callouts:**
- Hazard corridor tileset (mixed safe/dangerous tile markers)
- Hazard tile glow (red pulse)
- Skip hop animation for Kai (brief airborne over skipped tile)
- Break exit VFX (loop ends, door opens)

---

### Level 4-9 — Efficiency Trial

**Scene Setup:**
A speed gate — the exit only opens if Kai reaches it within a minimum number of loop iterations. Brute-force looping (too many iterations, wrong method choices) won't clear in time.

**NPC Dialogue:**
> "The gate counts your steps. More steps than it allows and it locks for good. Be efficient."

**Coding Objective:**
Student must write the most efficient loop possible — minimizing iterations while still reaching the goal. Tests loop logic optimization and awareness of step count.

**Visual Payoff:**
An iteration counter on the gate ticks down as Kai moves. If Kai reaches the gate before the counter hits zero — gate opens and a speed-clear banner drops. If counter expires first — gate locks and the level resets with the counter visible so students can identify inefficiencies.

**Asset Callouts:**
- Speed gate prop (counter display, locked/open states)
- Iteration counter UI (visible on gate, ticking down)
- Speed-clear banner drop animation
- Gate lock animation (bolts slamming shut)

---

### Level 4-10 (Final Boss) — The Null King

**Scene Setup:**
The Compiler Core chamber — the peak of the Spiral Citadel. The room is massive, fractured, and dark except for the pulsing red light of the corrupted Core at the back. The Null King stands before it — a towering silhouette made of tangled, glowing code lines: dangling variables, unclosed loops, false conditions, broken operators all woven together into a body. The floor is a code editor. This is the final exam.

**NPC Dialogue:**
> "You've been fixing my world piece by piece. But you've never faced all of it at once. Let's see if you can compile under pressure."

**Coding Objective:**
The boss fight has four phases — one per lesson region. Each phase, the Null King uses a corruption attack that represents that lesson's concept broken:

| Phase | Lesson | Attack | Student Task |
|---|---|---|---|
| 1 | Variables | Scatters unnamed values — Kai is frozen | Declare the correct variable to unfreeze Kai |
| 2 | Operators | Displays a broken attack formula | Write the correct operator expression to deflect it |
| 3 | Conditionals | Splits arena into safe path and void | Write the if/else to send Kai down the correct path |
| 4 | Loops | Summons a repeating corruption wave | Write a loop with a correct exit condition to push it back |

**Visual Payoff:**
Each phase hit staggers the Null King — his body unravels slightly, one corrupted loop or false condition tearing loose and dissolving. After phase four, his form completely unravels. The code lines fall apart. The Compiler Core pulses — green this time.

**Final Cutscene:** The world reboots. Color floods back into every region. Arlen reads his book. Mara's sword is exactly the right length. Voss stamps a document with a calm, correct hand. The sky renders at the right time of day. Kai stands at the top of the citadel and watches Synteria come back online — one process at a time.

**End Screen:** `Compilation successful.` *(terminal-style text, cursor blink)*

**Asset Callouts:**
- Compiler Core chamber tileset (massive, fractured void walls, red → green Core centerpiece)
- Null King boss sprite (full form: tangled code silhouette, four phase unravel states)
- Code floor tile (arena floor with code-line texture)
- Phase 1 VFX: frozen Kai + variable scatter particles
- Phase 2 VFX: operator attack beam (formula displayed mid-air)
- Phase 3 VFX: arena split animation (void crack down center)
- Phase 4 VFX: corruption wave (rolling red wall advancing toward Kai)
- Null King unravel VFX (code lines peeling off per phase)
- Core reboot animation (red → green pulse → full white flash → color return)
- Final cutscene assets (region callbacks: Arlen, Mara, Voss, sky render)
- End screen: `Compilation successful.` — terminal font, cursor blink

---

*SharpRunner Level Design Document — v1.0*
*Prepared for capstone development reference.*
