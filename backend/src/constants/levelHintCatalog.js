const LEVEL_HINTS = Object.freeze({
  "tutorial-level-1": {
    learningObjective: "Declare an integer variable that controls the hero's walking distance.",
    basicHint: "The prepared portal method reads the value stored in the integer named steps.",
    detailedHint: "Keep the existing WalkToPortal call unchanged. Count only the walkable tile spaces from Kai's current tile to the portal, then assign that count to the single int variable already used by the call.",
  },
  "tutorial-level-2": {
    learningObjective: "Declare a string variable using the exact hero name required by the gatekeeper.",
    basicHint: "C# text values use lowercase string and double quotation marks.",
    detailedHint: "Use the existing myName variable and IntroduceToNpc call. Replace the empty text with the hero name shown in the gatekeeper dialogue, preserving its capital letter and spelling.",
  },
  "tutorial-level-3": {
    learningObjective: "Declare three non-empty string variables for the villagers' voices.",
    basicHint: "Each frozen villager needs a separate string containing some non-empty text.",
    detailedHint: "Declare only voice1, voice2, and voice3. Give each one its own double-quoted word or phrase; an empty pair of quotes will not restore a voice.",
  },
  "tutorial-level-4": {
    learningObjective: "Declare an integer that matches the bridge toll.",
    basicHint: "The coins variable stores a whole-number amount displayed on the toll sign.",
    detailedHint: "Use one int named coins and read the required value from the bridge sign. Match that number exactly rather than adding another variable or changing the prepared toll action.",
  },
  "tutorial-level-5": {
    learningObjective: "Declare a double that matches the decimal potion measurement.",
    basicHint: "A measurement with a decimal part should use double rather than int.",
    detailedHint: "Keep one variable named measurement, use the double type, and copy the full decimal quantity etched on the force seal into its initializer.",
  },
  "arrays-level-1": {
    learningObjective: "Declare an integer array in the lantern-marker order.",
    basicHint: "An int array uses square brackets after the type and braces around its values.",
    detailedHint: "Create only the lanterns array. Read all four numbered markers from left to right and place those integers between the initializer braces in the same order.",
  },
  "arrays-level-2": {
    learningObjective: "Declare a string array in the supply-crate order.",
    basicHint: "Every item in a string array must be written as double-quoted text.",
    detailedHint: "Create the supplies array and transcribe the three crate labels from left to right. Keep each label as a separate quoted element and do not sort the items alphabetically.",
  },
  "arrays-level-3": {
    learningObjective: "Use zero-based array indexing to select the boss flame.",
    basicHint: "The first element of a C# array is at index 0, not index 1.",
    detailedHint: "Build flames in the same left-to-right order as the scene, labeling the controlling flame as boss. Then assign attack by indexing that array at the controlling flame's zero-based position; do not assign the word boss directly.",
  },
  "arrays-level-4": {
    learningObjective: "Use an array index to select the key from the inventory.",
    basicHint: "Array positions count from 0, so the middle of three items is not index 2.",
    detailedHint: "Place candle, key, and map into inventory in crate order. Set selectedItem with an inventory[index] expression aimed at the key's zero-based position instead of hardcoding the selected word.",
  },
  "arrays-level-5": {
    learningObjective: "Represent the warding runes in a 3-by-3 rectangular integer array.",
    basicHint: "A rectangular C# array uses int[,] and is read row by row.",
    detailedHint: "Create ward with three rows of three values. Starting at the upper-left rune, encode each yellow ward rune as 1 and every other rune as 0, completing a whole row before moving down.",
  },
  "arrays-level-6": {
    learningObjective: "Represent a safe route through checkpoints in a rectangular array.",
    basicHint: "Each pathMap column is one checkpoint and should choose exactly one height.",
    detailedHint: "Use a 3-by-3 int[,] named pathMap. Read checkpoints from left to right; in each column place one 1 at the safe path height and 0 in the two routes Kai should avoid.",
  },
  "arrays-level-7": {
    learningObjective: "Traverse every name in a string array with a for loop.",
    basicHint: "A complete traversal starts at index 0 and stops before names.Length.",
    detailedHint: "After declaring names in sign order, use one index variable that increases by one. Inside the loop, pass names[i] to the prepared CheckName method so every sign, including the last one, is checked.",
  },
  "arrays-level-8": {
    learningObjective: "Traverse the jar-color array and scan each element.",
    basicHint: "The scan method must receive each array element, not the array name by itself.",
    detailedHint: "Store the four visible colors in jars from left to right. Loop from the first valid index while the index remains below jars.Length, and call ScanJar with the element at the current index.",
  },
  "functions-level-1": {
    learningObjective: "Define and call a reusable no-parameter void method.",
    basicHint: "Defining StartRitual names the action; calling it from Main runs it.",
    detailedHint: "Add a static void method named StartRitual inside Program but outside Main, with empty parentheses. Then invoke that method once from Main; its body may remain empty for this exercise.",
  },
  "functions-level-2": {
    learningObjective: "Call the predefined RingBell method.",
    basicHint: "The bell method already exists, so it only needs to be invoked from Main.",
    detailedHint: "Do not define a second RingBell method. In Main, write one parameterless invocation using the existing method's exact capitalization and include the call parentheses.",
  },
  "functions-level-3": {
    learningObjective: "Define and call a no-parameter LightFlame void method.",
    basicHint: "LightFlame performs an action, so it returns no value and receives no input.",
    detailedHint: "Place a static void LightFlame method in Program with empty parentheses, then call it once inside Main. No return statement, arguments, or parameters are needed.",
  },
  "functions-level-4": {
    learningObjective: "Define and call a no-parameter SealShrine void method.",
    basicHint: "The shrine seal is an action with no parameters and no returned result.",
    detailedHint: "Create exactly one static void method named SealShrine outside Main. Leave its parameter list empty, then invoke it once from Main using the same spelling and capitalization.",
  },
  "functions-level-5": {
    learningObjective: "Return the oracle code from an int method and store it in Main.",
    basicHint: "GetCode must send an integer back with return instead of merely performing an action.",
    detailedHint: "Count the illuminated oracle symbols. Make GetCode a parameterless static int method that returns that count, then initialize the existing code variable from the method call in Main.",
  },
  "functions-level-6": {
    learningObjective: "Return the safe route from a string method and store it in Main.",
    basicHint: "A method returning route text needs string as its return type, not void.",
    detailedHint: "Define parameterless GetSafePath outside Main and return the direction identified by the Diwata. In Main, assign the result of calling that method to the path string rather than writing the direction there directly.",
  },
  "functions-level-7": {
    learningObjective: "Pass the requested offering as an argument to a predefined method.",
    basicHint: "PlaceOffering already exists and expects one string argument inside its parentheses.",
    detailedHint: "Read the offering requested by the shrine, keep it as double-quoted text, and pass it in one call to PlaceOffering from Main. Do not redefine the prepared method.",
  },
  "functions-level-8": {
    learningObjective: "Pass the measured salt amount as an integer argument.",
    basicHint: "ThrowSalt expects one whole-number amount, not a string.",
    detailedHint: "Count the numbered distance markers to the aswang. Pass that count directly as the single argument in one ThrowSalt call inside Main, leaving the predefined method unchanged.",
  },
  "functions-level-9": {
    learningObjective: "Add two method parameters and return the calculated power.",
    basicHint: "CalculatePower needs both basePower and bonus before it can add them.",
    detailedHint: "Define CalculatePower with two int parameters and an int return type. Add the parameter values inside the method and return the result; in Main, store the result of calling it with the two displayed power values.",
  },
  "functions-level-10": {
    learningObjective: "Multiply two method parameters and return the healing value.",
    basicHint: "Heal should calculate from herb and water, then return the product.",
    detailedHint: "Give Heal two int parameters and an int return type. Multiply the parameter variables inside the method, return that calculation, and initialize healing from the method call rather than a hardcoded total.",
  },
  "functions-level-11": {
    learningObjective: "Use a base case and a smaller recursive call to build the stairs.",
    basicHint: "BuildStairs needs a stopping case before it calls itself with a smaller step.",
    detailedHint: "In BuildStairs, return when step reaches the smallest case. Otherwise recurse with one fewer step before calling CreateStep for the current step; that order makes the stairs appear while the calls unwind.",
  },
  "functions-with-arrays-level-1": {
    learningObjective: "Pass an integer array into a method parameter.",
    basicHint: "A method that receives the whole lantern line uses an int[] parameter.",
    detailedHint: "Define LightLanterns with one int[] parameter. In Main, create the lanterns array using the three on-signals shown, then pass the array variable in a single method call rather than passing each element separately.",
  },
  "functions-with-arrays-level-2": {
    learningObjective: "Count cursed values in an array and return the count.",
    basicHint: "Visit every charms index and increase a counter only when the current value marks a curse.",
    detailedHint: "Inside CountCursed, initialize a counter before a full zero-based loop. Compare charms[i] with the cursed marker, increment on matches, and return the counter after the loop; store the method result in cursedCount.",
  },
  "functions-with-arrays-level-3": {
    learningObjective: "Pass a two-dimensional warding grid into a method.",
    basicHint: "RestoreGrid receives one rectangular int[,] array, not separate row arguments.",
    detailedHint: "Encode the upper rune row first and the lower row second, using 1 only for blue runes. Declare the result as grid, then pass that whole 2D variable once to RestoreGrid.",
  },
  "functions-with-arrays-level-4": {
    learningObjective: "Traverse a two-dimensional array and return a conditional count.",
    basicHint: "Use one loop for rows and another for columns; each dimension has its own GetLength index.",
    detailedHint: "In CountBlessedGraves, initialize the counter before nested loops. Bound the outer loop with dimension 0 and the inner with dimension 1, inspect graves[row, col], count only blessed markers, and return the total afterward.",
  },
  "final-level-1": {
    learningObjective: "Combine arrays, methods, traversal, return values, 2D arrays, and recursion.",
    basicHint: "Complete the six seals one at a time and verify each method's parameter and return type before moving on.",
    detailedHint: "Trace the program in seal order: count the corrupted array marker, repair the indicated zero-based position, return the combined ward power, visit every moon row and column, then make the eclipse recursion move toward its phase-zero base case. Keep each result-producing call assigned in Main.",
  },
});

const getLevelHints = (levelKey) => LEVEL_HINTS[levelKey] ?? null;

module.exports = { LEVEL_HINTS, getLevelHints };
