import { check, code, codeChumReference, connection, list, microsoft, note, p, practice } from "./moduleHelpers.js";

export default {
  id: "final", title: "Final Review", eyebrow: "Built-in curriculum · Bakunawa Eclipse",
  description: "Review the complete journey and check your readiness for the Last Compile without introducing new syntax.",
  gameRoute: "/Map", gameTitle: "Bakunawa Eclipse",
  objectives: ["Recall the core syntax from every earlier module.", "Choose a safe traversal for 1D and 2D arrays.", "Distinguish parameters, arguments, and return values.", "Recognize a safe recursive base case.", "Plan a multi-part program one phase at a time."],
  sections: [
    { id: "overview", title: "Final journey overview", blocks: [
      p("Bakunawa Eclipse combines skills you have already practiced. No substantial new syntax is introduced here. Read one phase at a time, identify its inputs and expected result, and fix the earliest incomplete phase first."),
      list("Variables store the program's current data.", "Arrays organize related values.", "Loops visit array elements.", "Methods name reusable operations.", "Parameters carry inputs and return carries a result back.", "Recursion repeats self-calls until a base case."),
      note("Readiness, not an exam", "The checks in this module are formative. Retry anything you miss and revisit the matching section."),
    ]},
    { id: "variables-review", title: "Variables review", blocks: [
      p("A declaration gives a variable a type and name. Assignment stores a compatible value."),
      code('int seals = 4;\nstring phaseName = "Moon ward";\nbool repaired = false;\nConsole.WriteLine(seals);', "4"),
      code("int basePower = 20;\nint bonus = 5;\nint total = basePower + bonus;", null, "Calculate, then store"),
      check("final-types", "Which type stores true or false?", ["string", "bool", "double"], 1, "bool represents the two logical values true and false."),
    ]},
    { id: "arrays-indexing", title: "Arrays and indexing review", blocks: [
      p("A one-dimensional array uses one zero-based index. Length gives its element count, so Length - 1 is the final valid index."),
      code("int[] symbols = { 1, 0, 1 };\nConsole.WriteLine(symbols[1]);\nConsole.WriteLine(symbols.Length);", "0\n3"),
      note("Check the bound", "A loop should use index < symbols.Length, not index <= symbols.Length."),
      check("final-first-index", "What is the first array index?", ["0", "1", "-1"], 0, "C# arrays use zero-based indexing."),
    ]},
    { id: "loops-review", title: "Loop review", blocks: [
      p("Use a loop to visit every element. Place a counter before the loop so its value survives across iterations."),
      code("static int CountZeros(int[] values)\n{\n    int count = 0;\n    for (int i = 0; i < values.Length; i++)\n    {\n        if (values[i] == 0) count++;\n    }\n    return count;\n}", null),
      code("foreach (int value in values)\n{\n    Console.WriteLine(value);\n}", null, "Read each value directly"),
      check("final-length", "What does .Length return for a 1D array?", ["Its final index", "Its number of elements", "Its largest value"], 1, "Length is the element count; the final index is Length - 1."),
    ]},
    { id: "methods-review", title: "Methods and calls review", blocks: [
      p("A definition describes behavior. A call runs it. void means no result value is returned."),
      code('static void Repair(int index)\n{\n    Console.WriteLine($"Repairing {index}");\n}\n\nRepair(2);', "Repairing 2"),
      note("Create and call", "Both parts matter: the method must exist, and the program must call it where the action is needed."),
    ]},
    { id: "parameters-return", title: "Parameters and return values review", blocks: [
      p("Parameters are names in a definition; arguments are values in a call. return sends a value to the caller instead of merely displaying it."),
      code("static int CalculateWard(int basePower, int bonus)\n{\n    return basePower + bonus;\n}\n\nint ward = CalculateWard(30, 10);", null),
      check("final-parameter", "In CalculateWard(30, 10), what are 30 and 10?", ["Parameters", "Arguments", "Return types"], 1, "Values supplied by a call are arguments."),
      check("final-return", "Which keyword sends a value back?", ["void", "static", "return"], 2, "return supplies the method's result to its caller."),
    ]},
    { id: "grid-review", title: "Arrays plus methods review", blocks: [
      p("A method that receives int[,] can process a rectangular grid. Nested loops cover both dimensions."),
      code("static int CountCells(int[,] grid)\n{\n    int visited = 0;\n    for (int row = 0; row < grid.GetLength(0); row++)\n    {\n        for (int col = 0; col < grid.GetLength(1); col++)\n        {\n            int current = grid[row, col];\n            visited++;\n        }\n    }\n    return visited;\n}", null),
      note("Trace it", "For a 2 by 3 grid, the outer loop selects 2 rows and the inner loop visits 3 columns per row: 6 cell visits."),
    ]},
    { id: "recursion-review", title: "Recursion review", blocks: [
      p("A recursive call must move toward a reachable base case."),
      code("static void ResolvePhase(int phase)\n{\n    if (phase == 0) return;\n    Console.WriteLine(phase);\n    ResolvePhase(phase - 1);\n}", null),
      list("The base case stops at 0.", "phase - 1 makes the input smaller.", "The recursive call uses the same method name."),
      check("final-recursion", "What must recursion contain to stop safely?", ["A base case", "A 2D array", "Two return values"], 0, "A reachable base case stops further self-calls."),
    ]},
    { id: "readiness", title: "Final readiness check", blocks: [
      practice("final-mini", "Complete this mini review: count values equal to 1 and display the returned result.", "static int CountOnes(int[] values)\n{\n    int count = 0;\n    foreach (int value in values)\n    {\n        // Increase count when value is 1\n    }\n    return count;\n}\n\nConsole.WriteLine(CountOnes(new int[] { 1, 0, 1 }));", "static int CountOnes(int[] values)\n{\n    int count = 0;\n    foreach (int value in values)\n    {\n        if (value == 1) count++;\n    }\n    return count;\n}\n\nConsole.WriteLine(CountOnes(new int[] { 1, 0, 1 }));", "2"),
      check("final-traversal", "Which can visit every 1D array element?", ["A safe for loop or foreach", "One fixed index", "A method name alone"], 0, "Both a safe for loop and foreach can traverse every 1D element."),
      check("final-grid", "Which pair gives row and column counts?", ["Length and Length - 1", "GetLength(0) and GetLength(1)", "row[0] and col[1]"], 1, "For rectangular arrays, dimensions 0 and 1 are rows and columns."),
    ]},
    { id: "summary", title: "Summary", blocks: [
      p("You have reviewed variables, arrays, safe traversal, methods, parameters, return values, rectangular grids, and recursion. Approach the finale phase by phase and use the compiler feedback to locate the earliest incomplete requirement."),
      list("Indexes begin at 0.", "Length is a count, not the last index.", "Complete traversal uses safe loop bounds.", "Arguments flow into parameters.", "return sends a result back.", "Recursion needs a reachable base case.", "Two-dimensional arrays need row and column traversal."),
      connection("The Last Compile combines 1D counting, a parameterized repair action, a returned calculation, complete 2D traversal, and countdown recursion."),
    ]},
  ],
  references: [
    microsoft("C# documentation", "https://learn.microsoft.com/en-us/dotnet/csharp/"),
    microsoft("Arrays (C# reference)", "https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/arrays"),
    microsoft("Overview of methods", "https://learn.microsoft.com/en-us/dotnet/csharp/methods"),
    microsoft("Iteration statements", "https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/iteration-statements"),
    codeChumReference,
  ],
};
