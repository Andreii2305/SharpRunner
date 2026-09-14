// This catalog is the single source of truth for free/basic hint content.
// Paid situational and stronger guidance lives in levelSituationalHintCatalog.
const LEVEL_HINTS = Object.freeze({
  "tutorial-level-1": {
    learningObjective: "Declare an integer variable that controls the hero's walking distance.",
    basicHint: "The prepared portal method reads the value stored in the integer named steps.",
  },
  "tutorial-level-2": {
    learningObjective: "Declare a string variable using the exact hero name required by the gatekeeper.",
    basicHint: "C# text values use lowercase string and double quotation marks.",
  },
  "tutorial-level-3": {
    learningObjective: "Declare three non-empty string variables for the villagers' voices.",
    basicHint: "Each frozen villager needs a separate string containing some non-empty text.",
  },
  "tutorial-level-4": {
    learningObjective: "Declare an integer that matches the bridge toll.",
    basicHint: "The coins variable stores a whole-number amount displayed on the toll sign.",
  },
  "tutorial-level-5": {
    learningObjective: "Declare a double that matches the decimal potion measurement.",
    basicHint: "A measurement with a decimal part should use double rather than int.",
  },
  "arrays-level-1": {
    learningObjective: "Declare an integer array in the lantern-marker order.",
    basicHint: "An int array uses square brackets after the type and braces around its values.",
  },
  "arrays-level-2": {
    learningObjective: "Declare a string array in the supply-crate order.",
    basicHint: "Every item in a string array must be written as double-quoted text.",
  },
  "arrays-level-3": {
    learningObjective: "Use zero-based array indexing to select the boss flame.",
    basicHint: "The first element of a C# array is at index 0, not index 1.",
  },
  "arrays-level-4": {
    learningObjective: "Use an array index to select the key from the inventory.",
    basicHint: "Array positions count from 0, so the middle of three items is not index 2.",
  },
  "arrays-level-5": {
    learningObjective: "Represent the warding runes in a 3-by-3 rectangular integer array.",
    basicHint: "A rectangular C# array uses int[,] and is read row by row.",
  },
  "arrays-level-6": {
    learningObjective: "Represent a safe route through checkpoints in a rectangular array.",
    basicHint: "Each pathMap column is one checkpoint and should choose exactly one height.",
  },
  "arrays-level-7": {
    learningObjective: "Traverse every name in a string array with a for loop.",
    basicHint: "A complete traversal starts at index 0 and stops before names.Length.",
  },
  "arrays-level-8": {
    learningObjective: "Traverse the jar-color array and scan each element.",
    basicHint: "The scan method must receive each array element, not the array name by itself.",
  },
  "functions-level-1": {
    learningObjective: "Define and call a reusable no-parameter void method.",
    basicHint: "Defining StartRitual names the action; calling it from Main runs it.",
  },
  "functions-level-2": {
    learningObjective: "Call the predefined RingBell method.",
    basicHint: "The bell method already exists, so it only needs to be invoked from Main.",
  },
  "functions-level-3": {
    learningObjective: "Define and call a no-parameter LightFlame void method.",
    basicHint: "LightFlame performs an action, so it returns no value and receives no input.",
  },
  "functions-level-4": {
    learningObjective: "Define and call a no-parameter SealShrine void method.",
    basicHint: "The shrine seal is an action with no parameters and no returned result.",
  },
  "functions-level-5": {
    learningObjective: "Return the oracle code from an int method and store it in Main.",
    basicHint: "GetCode must send an integer back with return instead of merely performing an action.",
  },
  "functions-level-6": {
    learningObjective: "Return the safe route from a string method and store it in Main.",
    basicHint: "A method returning route text needs string as its return type, not void.",
  },
  "functions-level-7": {
    learningObjective: "Pass the requested offering as an argument to a predefined method.",
    basicHint: "PlaceOffering already exists and expects one string argument inside its parentheses.",
  },
  "functions-level-8": {
    learningObjective: "Pass the measured salt amount as an integer argument.",
    basicHint: "ThrowSalt expects one whole-number amount, not a string.",
  },
  "functions-level-9": {
    learningObjective: "Add two method parameters and return the calculated power.",
    basicHint: "CalculatePower needs both basePower and bonus before it can add them.",
  },
  "functions-level-10": {
    learningObjective: "Multiply two method parameters and return the healing value.",
    basicHint: "Heal should calculate from herb and water, then return the product.",
  },
  "functions-level-11": {
    learningObjective: "Use a base case and a smaller recursive call to build the stairs.",
    basicHint: "BuildStairs needs a stopping case before it calls itself with a smaller step.",
  },
  "functions-with-arrays-level-1": {
    learningObjective: "Pass an integer array into a method parameter.",
    basicHint: "A method that receives the whole lantern line uses an int[] parameter.",
  },
  "functions-with-arrays-level-2": {
    learningObjective: "Count cursed values in an array and return the count.",
    basicHint: "Visit every charms index and increase a counter only when the current value marks a curse.",
  },
  "functions-with-arrays-level-3": {
    learningObjective: "Pass a two-dimensional warding grid into a method.",
    basicHint: "RestoreGrid receives one rectangular int[,] array, not separate row arguments.",
  },
  "functions-with-arrays-level-4": {
    learningObjective: "Traverse a two-dimensional array and return a conditional count.",
    basicHint: "Use one loop for rows and another for columns; each dimension has its own GetLength index.",
  },
  "final-level-1": {
    learningObjective: "Combine arrays, methods, traversal, return values, 2D arrays, and recursion.",
    basicHint: "Complete the six seals one at a time and verify each method's parameter and return type before moving on.",
  },
});

const getLevelHints = (levelKey) => LEVEL_HINTS[levelKey] ?? null;

module.exports = { LEVEL_HINTS, getLevelHints };
