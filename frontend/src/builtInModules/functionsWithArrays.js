import { check, code, codeChumReference, connection, diagram, list, microsoft, note, p, practice } from "./moduleHelpers.js";

export default {
  id: "functions-with-arrays", title: "Functions with Arrays", eyebrow: "Built-in curriculum · Tikbalang Crossing",
  description: "Combine earlier skills by passing arrays to methods, traversing them, and returning useful results.",
  gameRoute: "/Map", gameTitle: "Functions-with-Arrays Adventure",
  objectives: ["Pass a one-dimensional array to a method.", "Traverse an array inside a method.", "Count matching values and return the result.", "Explain how element changes can affect the supplied array.", "Pass and process a rectangular two-dimensional array."],
  sections: [
    { id: "review", title: "Review: arrays plus methods", blocks: [
      p("Arrays group same-type values; methods group reusable behavior. Combining them lets one method process any compatible array supplied by its caller."),
      code("int[] powers = { 10, 20, 30 };", null, "Array data"),
      code("static void ShowNumber(int number)\n{\n    Console.WriteLine(number);\n}", null, "Method behavior"),
      note("Integration goal", "This module assumes you know indexing, loops, parameters, calls, and return values. It focuses on connecting those ideas."),
    ]},
    { id: "passing-1d", title: "Passing a 1D array", blocks: [
      p("An int[] parameter can receive a complete one-dimensional integer array. The call passes the array name without brackets."),
      code("static void ShowCharms(int[] charms)\n{\n    foreach (int charm in charms)\n    {\n        Console.WriteLine(charm);\n    }\n}\n\nint[] powers = { 10, 20, 30 };\nShowCharms(powers);", "10\n20\n30"),
      diagram(["Step", "Data"], [["Array", "powers"], ["Passed to method", "ShowCharms(powers)"], ["Method loops", "each charm"], ["Result", "each value displayed"]], "One argument carries the whole array."),
      code('static void ShowClues(string[] clues)\n{\n    foreach (string clue in clues)\n        Console.WriteLine(clue);\n}\n\nstring[] trail = { "river", "tree" };\nShowClues(trail);', "river\ntree", "A different element type"),
      connection("Process the Lantern Line requires one int[] argument and complete traversal inside a void method."),
    ]},
    { id: "looping", title: "Looping inside a method", blocks: [
      p("The loop belongs inside the method when traversal is part of the method's job. Use Length so it works for different array sizes."),
      code("static void ShowIndexed(int[] values)\n{\n    for (int i = 0; i < values.Length; i++)\n    {\n        Console.WriteLine($\"{i}: {values[i]}\");\n    }\n}\n\nShowIndexed(new int[] { 4, 8 });", "0: 4\n1: 8"),
      note("Common mistake", "Checking values[0] processes only the first element. A traversal task requires every valid index.", "warning"),
    ]},
    { id: "return-result", title: "Returning a processed result", blocks: [
      p("A processing method can build one result while it traverses and return that result after the loop."),
      code("static int CountStrongCharms(int[] charms)\n{\n    int count = 0;\n\n    foreach (int charm in charms)\n    {\n        if (charm >= 50)\n        {\n            count++;\n        }\n    }\n\n    return count;\n}\n\nint[] values = { 20, 50, 80 };\nint strong = CountStrongCharms(values);\nConsole.WriteLine(strong);", "2"),
      code("static int CountStrongCharms(int[] charms)\n{\n    int count = 0;\n    foreach (int charm in charms)\n        if (charm >= 50) count++;\n    return count;\n}\n\nint[] secondSet = { 60, 10, 55, 5 };\nConsole.WriteLine(CountStrongCharms(secondSet));", "2", "Same method, different values"),
      note("Pattern", "Initialize the counter before the loop, test each element, increment only for a match, and return after traversal."),
      connection("Count the Cursed Charms validates this structure with a parallel condition and data set."),
    ]},
    { id: "modifying", title: "Modifying elements in a method", blocks: [
      p("Arrays are reference types. A method receives a copy of the reference by default; both references point to the same array object. Changing an element through the parameter is visible to the caller."),
      code("static void BoostFirst(int[] values)\n{\n    values[0] = values[0] + 10;\n}\n\nint[] powers = { 5, 8 };\nBoostFirst(powers);\nConsole.WriteLine(powers[0]);", "15"),
      code("static void ClearLast(int[] values)\n{\n    values[values.Length - 1] = 0;\n}\n\nint[] marks = { 3, 6, 9 };\nClearLast(marks);\nConsole.WriteLine(marks[2]);", "0"),
      note("Be deliberate", "Element changes persist. If a method should only inspect data, avoid assigning to array elements."),
    ]},
    { id: "passing-2d", title: "Passing a 2D array", blocks: [
      p("A rectangular grid uses a T[,] parameter. One array argument carries every row and column into the method."),
      code("static void ShowGrid(int[,] grid)\n{\n    for (int row = 0; row < grid.GetLength(0); row++)\n    {\n        for (int col = 0; col < grid.GetLength(1); col++)\n        {\n            Console.WriteLine(grid[row, col]);\n        }\n    }\n}\n\nint[,] ward = { { 1, 0 }, { 0, 1 } };\nShowGrid(ward);", "1\n0\n0\n1"),
      list("int[,] declares a rectangular integer array.", "GetLength(0) gives rows.", "GetLength(1) gives columns.", "grid[row, col] reads the current cell."),
      connection("Restore the Warding Grid requires an int[,] parameter and one call with the prepared grid."),
    ]},
    { id: "return-2d", title: "Returning a result from a grid", blocks: [
      p("Use nested loops to inspect every cell. Keep the accumulator outside both loops so it is not reset while traversal continues."),
      code("static int CountOpenCells(int[,] map)\n{\n    int open = 0;\n    for (int row = 0; row < map.GetLength(0); row++)\n    {\n        for (int col = 0; col < map.GetLength(1); col++)\n        {\n            if (map[row, col] == 1) open++;\n        }\n    }\n    return open;\n}\n\nint[,] map = { { 1, 0, 1 }, { 0, 1, 0 } };\nConsole.WriteLine(CountOpenCells(map));", "3"),
      code("int[,] smallMap = { { 1, 1 }, { 1, 0 } };\nConsole.WriteLine(CountOpenCells(smallMap));", "3", "Reuse with a second grid"),
      connection("Ancient Cemetery of the Forgotten Spirits requires safe nested traversal, matching-value counting, and a returned result."),
    ]},
    { id: "mistakes", title: "Common integration mistakes", blocks: [
      list("Writing int instead of int[] or int[,] in the parameter.", "Passing one element when the method expects the whole array.", "Looping outside the method when processing belongs inside it.", "Returning the counter before traversal finishes.", "Resetting the counter inside a loop.", "Using Length instead of GetLength for row and column bounds.", "Forgetting that element assignments can change the caller's array."),
      check("fa-whole-array", "Which call passes the complete array powers?", ["ShowCharms(powers);", "ShowCharms(powers[0]);", "ShowCharms(int);"], 0, "Use the array variable name to pass the complete array."),
    ]},
    { id: "practice", title: "Practice and assessment", blocks: [
      practice("Write SumValues(int[] values) so it traverses the array and returns the total.", "static int SumValues(int[] values)\n{\n    int total = 0;\n    foreach (int value in values)\n    {\n        total += value;\n    }\n    return total;\n}"),
      practice("Write ShowMap(int[,] map) with safe nested loops that display every cell.", "static void ShowMap(int[,] map)\n{\n    for (int row = 0; row < map.GetLength(0); row++)\n    {\n        for (int col = 0; col < map.GetLength(1); col++)\n        {\n            Console.WriteLine(map[row, col]);\n        }\n    }\n}"),
      check("fa-counter", "Where should a counter usually be initialized?", ["Before the traversal loops", "Inside the innermost loop", "After return"], 0, "Initialize it before traversal so earlier matches are preserved."),
      check("fa-grid-bounds", "What gives the number of columns in grid?", ["grid.Length", "grid.GetLength(0)", "grid.GetLength(1)"], 2, "Dimension 1 is the column dimension."),
    ]},
    { id: "summary", title: "Summary", blocks: [
      p("An array parameter lets a method process an entire collection. Loops visit the data, accumulators build results, return sends a result back, and nested loops handle rectangular grids."),
      list("Use T[] for a 1D array parameter and T[,] for a rectangular grid.", "Pass the array variable name in the call.", "Return only after traversal is complete.", "Use GetLength(0) and GetLength(1) for grid bounds.", "Element changes made through a parameter affect the shared array object."),
      connection("You are prepared for all four functions-with-arrays levels: 1D void processing, 1D returned counting, 2D void processing, and 2D returned counting."),
    ]},
  ],
  references: [
    microsoft("Arrays (C# reference)", "https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/arrays"),
    microsoft("Overview of methods", "https://learn.microsoft.com/en-us/dotnet/csharp/methods"),
    microsoft("Methods (C# Programming Guide)", "https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/methods"),
    codeChumReference,
  ],
};
