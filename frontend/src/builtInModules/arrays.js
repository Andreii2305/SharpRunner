import { check, code, codeChumReference, connection, diagram, list, microsoft, note, p, practice } from "./moduleHelpers.js";

export default {
  id: "arrays", title: "Arrays", eyebrow: "Built-in curriculum · Barangay Malumay",
  description: "Store, access, change, and traverse related values in one- and two-dimensional arrays.",
  gameRoute: "/Map", gameTitle: "Arrays Adventure",
  objectives: ["Declare and initialize a one-dimensional array.", "Access and modify elements by zero-based index.", "Use Length and safe index bounds.", "Traverse an array with for and foreach.", "Declare and access a basic rectangular two-dimensional array."],
  sections: [
    { id: "introduction", title: "Introduction to arrays", blocks: [
      p("An array stores a fixed number of values of the same type under one name. Each stored value is an element, and each element has a numbered position called an index."),
      code("int[] lanterns = { 10, 20, 30 };", null, "Three integers in one array"),
      code('string[] spirits = { "Aswang", "Tikbalang", "Kapre" };', null, "Three strings in another array"),
      note("Why use arrays?", "Without an array, processing ten related values could require ten variables and ten statements. An array lets one loop process them consistently."),
      connection("The Lanterns of Malumay and stolen-supplies levels begin with correctly declared arrays."),
    ]},
    { id: "declare", title: "Declaring and initializing", blocks: [
      p("The square brackets after a type mean 'array of this type.' An initializer between braces supplies the elements in order."),
      code("int[] powers = { 10, 20, 30 };\nstring[] paths = { \"north\", \"east\" };", null),
      code("int[] emptySlots = new int[4];\nConsole.WriteLine(emptySlots.Length);", "4", "Create space first"),
      note("Remember", "Every element must be compatible with the array's element type. An int[] cannot contain a string."),
      connection("The first two array validators check element type, array size, order, and values."),
    ]},
    { id: "indexing", title: "Zero-based indexing", blocks: [
      p("C# array indexes start at 0. Therefore, the first element is index 0, the second is index 1, and the third is index 2."),
      diagram(["", "10", "20", "30", "40"], [["Index", "0", "1", "2", "3"]], "Each value sits directly above its index."),
      code("int[] lanterns = { 10, 20, 30 };\nConsole.WriteLine(lanterns[0]);", "10"),
      code('string[] spirits = { "Aswang", "Tikbalang", "Kapre" };\nConsole.WriteLine(spirits[2]);', "Kapre"),
      check("arrays-index", "Which index selects 30 from { 10, 20, 30, 40 }?", ["1", "2", "3"], 1, "30 is the third element, so its zero-based index is 2."),
      connection("The Road of Santelmo and Midnight Inventory require reading a specific string by index."),
    ]},
    { id: "changing", title: "Changing array values", blocks: [
      p("Use an index on the left of = to replace one element. The other elements remain unchanged."),
      code("int[] charms = { 5, 10, 15 };\ncharms[1] = 25;\nConsole.WriteLine(charms[1]);", "25"),
      code('string[] signs = { "safe", "blocked" };\nsigns[0] = "open";\nConsole.WriteLine(signs[0]);', "open"),
      practice("Change the last value in int[] runes = { 2, 4, 0 }; to 6, then display it.", "int[] runes = { 2, 4, 0 };\nrunes[2] = 6;\nConsole.WriteLine(runes[2]);"),
    ]},
    { id: "length", title: "Length and valid bounds", blocks: [
      p("Length is the number of elements. Because indexes begin at 0, the last valid index is Length - 1."),
      code("int[] charms = { 5, 10, 15, 20 };\nConsole.WriteLine(charms.Length);", "4"),
      code("int lastIndex = charms.Length - 1;\nConsole.WriteLine(charms[lastIndex]);", "20", "Access the last element safely"),
      note("Common mistake", "charms[charms.Length] is outside the array. For four elements, Length is 4 but valid indexes are 0 through 3.", "warning"),
    ]},
    { id: "for-loop", title: "Traversing with for", blocks: [
      p("A for loop is useful when you need the index. It starts at 0, continues while the index is less than Length, and increases the index after each pass."),
      code("int[] powers = { 10, 20, 30 };\n\nfor (int i = 0; i < powers.Length; i++)\n{\n    Console.WriteLine(powers[i]);\n}", "10\n20\n30"),
      list("int i = 0 creates the first valid index.", "i < powers.Length prevents an out-of-range access.", "i++ adds 1 after each pass.", "powers[i] reads the current element."),
      code("string[] tags = { \"old\", \"new\" };\nfor (int i = 0; i < tags.Length; i++)\n{\n    Console.WriteLine($\"{i}: {tags[i]}\");\n}", "0: old\n1: new", "Use both index and value"),
      connection("Kapre's Name Tags and The Cursed Jars require complete traversal rather than checking only one element."),
    ]},
    { id: "foreach", title: "Traversing with foreach", blocks: [
      p("foreach gives you each element directly. It is clear when you need every value but do not need to know or change its index."),
      code("int[] powers = { 10, 20, 30 };\n\nforeach (int power in powers)\n{\n    Console.WriteLine(power);\n}", "10\n20\n30"),
      code('string[] clues = { "moon", "river" };\nforeach (string clue in clues)\n{\n    Console.WriteLine(clue);\n}', "moon\nriver"),
      note("for or foreach?", "Use for when the index matters or you must update by position. Use foreach for straightforward read-only traversal. Neither is always better."),
    ]},
    { id: "two-dimensional", title: "Two-dimensional arrays", blocks: [
      p("A rectangular two-dimensional array represents rows and columns. Access it with two indexes: row first, column second."),
      code("int[,] ward = {\n    { 1, 0, 1 },\n    { 0, 1, 0 }\n};\n\nConsole.WriteLine(ward[0, 2]);", "1"),
      diagram(["", "Col 0", "Col 1", "Col 2"], [["Row 0", "1", "0", "1"], ["Row 1", "0", "1", "0"]], "ward[0, 2] means row 0, column 2."),
      code("for (int row = 0; row < ward.GetLength(0); row++)\n{\n    for (int col = 0; col < ward.GetLength(1); col++)\n    {\n        Console.WriteLine(ward[row, col]);\n    }\n}", "1\n0\n1\n0\n1\n0", "Visit every grid cell"),
      note("Remember", "GetLength(0) is the row count. GetLength(1) is the column count."),
      connection("Warding Tile Grid and Tikbalang's Branching Path use rectangular int[,] patterns."),
    ]},
    { id: "mistakes", title: "Common array mistakes", blocks: [
      code("int[] values = { 10, 20, 30 };\nConsole.WriteLine(values[3]);", null, "Invalid index"),
      p("This fails at run time because the three valid indexes are 0, 1, and 2."),
      list("Forgetting that indexing starts at 0.", "Confusing Length with the last index.", "Using <= Length in a loop condition.", "Mixing incompatible element types.", "Checking one element when the task requires full traversal.", "Using one index for a two-dimensional array."),
      check("arrays-bound", "Which loop condition safely visits every element?", ["i <= values.Length", "i < values.Length", "i < values.Length - 1"], 1, "i < Length reaches the last valid index and then stops."),
    ]},
    { id: "practice", title: "Practice and quick assessment", blocks: [
      practice("Create an int[] with 4, 8, and 12. Use a loop to display all three values.", "int[] values = { 4, 8, 12 };\nfor (int i = 0; i < values.Length; i++)\n{\n    Console.WriteLine(values[i]);\n}"),
      practice("Create a 2x2 int[,] named map and display the value at row 1, column 0.", "int[,] map = {\n    { 1, 2 },\n    { 3, 4 }\n};\nConsole.WriteLine(map[1, 0]);"),
      check("arrays-length", "For an array with Length 5, what is the last valid index?", ["5", "4", "6"], 1, "The last index is always Length - 1, so 5 - 1 is 4."),
      check("arrays-row-column", "In grid[1, 2], which index identifies the row?", ["1", "2", "Neither"], 0, "Rectangular arrays use row first, then column."),
    ]},
    { id: "summary", title: "Summary", blocks: [
      p("Arrays group same-type values. Zero-based indexes select elements, Length reports the element count, loops traverse collections, and two-dimensional arrays organize row-and-column data."),
      list("Declare a one-dimensional array with T[].", "The first index is 0; the last is Length - 1.", "Use for when an index matters and foreach when reading each value directly.", "Use int[,] for a rectangular integer grid.", "Use row first and column second."),
      connection("You are prepared for all eight Arrays levels: exact 1D arrays, indexed string access, 2D patterns, and full string-array traversal."),
    ]},
  ],
  references: [
    microsoft("Arrays (C# reference)", "https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/arrays"),
    microsoft("Arrays (C# language specification)", "https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/arrays"),
    microsoft("Iteration statements", "https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/iteration-statements"),
    codeChumReference,
  ],
};
