import { check, code, codeChumReference, connection, list, microsoft, note, p, practice } from "./moduleHelpers.js";

export default {
  id: "tutorial",
  title: "C# Foundations",
  eyebrow: "Tutorial · First Compile Trial",
  description: "Build the small set of C# skills used in SharpRunner's five onboarding trials.",
  gameRoute: "/Map",
  gameTitle: "First Compile Trial",
  objectives: [
    "Identify the basic parts of a small C# program.", "Declare int, string, double, and bool variables.",
    "Assign and update values.", "Display values with Console.WriteLine.", "Use variables in a simple calculation.",
  ],
  sections: [
    { id: "welcome", title: "Welcome to C#", blocks: [
      p("C# is a strongly typed programming language: every value has a type, and that type controls which operations make sense. SharpRunner begins with short input and value trials so you can learn to read code one piece at a time."),
      note("How to study", "Read each example, predict what it displays, and then compare your prediction with the output."),
      connection("The Awakening introduces the editor and compile flow before later trials ask for text and number values."),
    ]},
    { id: "program", title: "What is a C# program?", blocks: [
      p("A program is a set of instructions. Execution begins in Main in the style of program used by SharpRunner. Statements usually end with a semicolon, while braces group related statements."),
      code('using System;\n\nclass Program\n{\n    static void Main()\n    {\n        Console.WriteLine("Hello, Malumay!");\n    }\n}', "Hello, Malumay!"),
      note("Common mistake", "C# is case-sensitive. Console.WriteLine is correct; console.writeline is not.", "warning"),
    ]},
    { id: "variables", title: "Variables and values", blocks: [
      p("A variable is a named storage place. In int lanterns = 5;, int is the type, lanterns is the variable name, and 5 is the assigned value."),
      code("int lanterns = 5;\nConsole.WriteLine(lanterns);", "5", "A whole-number variable"),
      code("int coins = 8;\ncoins = 10;\nConsole.WriteLine(coins);", "10", "Updating a value"),
      note("Remember", "Use = to assign a value. The variable name goes on the left and the new value goes on the right."),
      connection("The Coin Keeper checks that you can represent a required whole-number value."),
    ]},
    { id: "types", title: "Common data types", blocks: [
      p("Choose a type that matches the kind of information you need to store."),
      list("int stores whole numbers, such as 12.", "double stores numbers with a decimal part, such as 2.5.", "string stores text inside double quotes.", "bool stores either true or false."),
      code('int coins = 12;\nstring guideName = "Kai";\ndouble potionLiters = 2.5;\nbool gateOpen = false;\n\nConsole.WriteLine(guideName);', "Kai"),
      code('string spirit = "Kapre";\nbool isFriendly = true;\nConsole.WriteLine(spirit);\nConsole.WriteLine(isFriendly);', "Kapre\nTrue", "Text and true/false values"),
      note("Common mistake", 'Text needs double quotes: string name = "Kai";. A decimal value belongs in a suitable type such as double, not int.', "warning"),
      connection("What Is Your Name? and Voices of the Village use text; Potion Measure uses a decimal value."),
    ]},
    { id: "output", title: "Output with Console.WriteLine", blocks: [
      p("Console.WriteLine displays a value and then moves to a new line. It can display literal text, a variable, or an expression."),
      code('string place = "Barangay Malumay";\nConsole.WriteLine("Journey begins");\nConsole.WriteLine(place);', "Journey begins\nBarangay Malumay"),
      code('int charms = 3;\nConsole.WriteLine($"Charms found: {charms}");', "Charms found: 3", "Insert a value into text"),
      note("Remember", "Console.WriteLine displays a value. It does not store that value for later."),
    ]},
    { id: "arithmetic", title: "Simple arithmetic", blocks: [
      p("Numeric variables can take part in calculations. C# evaluates the expression on the right before assigning its result."),
      code("int blueLanterns = 3;\nint redLanterns = 2;\nint totalLanterns = blueLanterns + redLanterns;\nConsole.WriteLine(totalLanterns);", "5"),
      code("double dose = 1.5;\ndouble twoDoses = dose * 2;\nConsole.WriteLine(twoDoses);", "3"),
      practice("Create two int variables named shells and stones. Add them and display the total.", "int shells = 4;\nint stones = 6;\nint total = shells + stones;\nConsole.WriteLine(total);"),
    ]},
    { id: "mistakes", title: "Common beginner mistakes", blocks: [
      list("Using the wrong capitalization in a name.", "Forgetting a semicolon after a statement.", "Using a variable before declaring it.", "Putting text in an int variable.", "Using a comma instead of a decimal point in a numeric literal."),
      code('int lanterns = "five";', null, "This does not compile"),
      note("Why it fails", '"five" is text, but lanterns was declared as an int. Use int lanterns = 5; or string lanterns = "five".', "warning"),
    ]},
    { id: "practice", title: "Practice and quick check", blocks: [
      practice("Declare a string for a village name, an int for its lantern count, and display both values.", 'string village = "Malumay";\nint lanternCount = 5;\nConsole.WriteLine(village);\nConsole.WriteLine(lanternCount);'),
      check("tutorial-type", "Which type is suitable for the value 3.75?", ["int", "double", "bool"], 1, "double can represent a number with a decimal part."),
      check("tutorial-output", "What does Console.WriteLine(lanterns); do?", ["Stores a new value", "Displays the current value", "Changes the variable type"], 1, "Console.WriteLine displays the value; assignment changes stored data."),
    ]},
    { id: "summary", title: "Summary", blocks: [
      p("You can now read a small C# program, choose basic types, assign values, display output, and calculate a result."),
      list("A variable has a type, name, and value.", "int is for whole numbers; double can hold decimals.", "string holds text; bool holds true or false.", "Console.WriteLine displays output.", "The expression on the right of = is evaluated before assignment."),
      connection("These skills prepare you for all five First Compile Trial levels without revealing their required answers."),
    ]},
  ],
  references: [
    microsoft("Built-in types and literals", "https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/types/built-in-types"),
    microsoft("The C# type system", "https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/types/"),
    microsoft("Write your first C# code", "https://learn.microsoft.com/en-us/training/modules/csharp-write-first/"),
    codeChumReference,
  ],
};
