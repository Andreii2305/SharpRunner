import { check, code, codeChumReference, connection, diagram, list, microsoft, note, p, practice } from "./moduleHelpers.js";

export default {
  id: "functions", title: "Functions and Methods", eyebrow: "Built-in curriculum · Kapre's Trail",
  description: "Define, call, and combine C# methods with parameters, return values, and safe recursion.",
  gameRoute: "/Map", gameTitle: "Functions Adventure",
  objectives: ["Define and call a void method.", "Distinguish a method definition from a method call.", "Distinguish parameters from arguments.", "Return and store a value from a method.", "Trace a recursive method with a base case."],
  sections: [
    { id: "what-is-method", title: "What is a method?", blocks: [
      p("A method is a named group of statements that performs a task. In C#, reusable functions defined inside a class or other type are commonly called methods. A clear method name describes the action or result."),
      code('static void RingBell()\n{\n    Console.WriteLine("Ding!");\n}', null, "A method definition"),
      code("RingBell();", "Ding!", "A method call"),
      note("Create versus call", "Creating the method defines its behavior. Calling the method makes that behavior run."),
      connection("The First Ritual validator requires both a method definition and a call."),
    ]},
    { id: "why-methods", title: "Why use methods?", blocks: [
      p("Methods divide a larger program into smaller jobs. They reduce repeated code, make intent easier to read, and let the same behavior run from more than one place."),
      code('static void ShowWarning()\n{\n    Console.WriteLine("Spirit nearby!");\n}\n\nShowWarning();\nShowWarning();', "Spirit nearby!\nSpirit nearby!"),
      code('static void LightTorch()\n{\n    Console.WriteLine("Torch lit");\n}\n\nLightTorch();', "Torch lit", "One named action"),
      connection("Bell of Dawn focuses on calling prepared behavior, while the next shrine levels ask you to define and call it."),
    ]},
    { id: "void-methods", title: "void methods", blocks: [
      p("The word void means the method does not send a result value back to its caller. It can still display output or perform another action."),
      code('static void OpenGate()\n{\n    Console.WriteLine("Gate opened");\n}\n\nOpenGate();', "Gate opened"),
      code('static void SoundGong()\n{\n    Console.WriteLine("Gong!");\n}\n\nSoundGong();\nSoundGong();', "Gong!\nGong!"),
      note("Common mistake", "Writing a correct definition but never calling it means its body never runs.", "warning"),
      connection("Light the Warding Flame and Seal the Cursed Shrine use no-parameter void methods."),
    ]},
    { id: "parameters", title: "Parameters and arguments", blocks: [
      p("A parameter is a named input in a method definition. An argument is the actual value supplied by a call."),
      code('static void ThrowSalt(int amount)\n{\n    Console.WriteLine($"Threw {amount} salt.");\n}\n\nThrowSalt(5);', "Threw 5 salt."),
      diagram(["Method call", "Parameter", "Received value"], [["ThrowSalt(5)", "amount", "5"]], "The argument 5 flows into the parameter amount."),
      code('static void MarkPath(string direction, int steps)\n{\n    Console.WriteLine($"{direction}: {steps}");\n}\n\nMarkPath("east", 3);', "east: 3", "Two parameters"),
      note("Remember", "Argument order and types must match the parameter list."),
      connection("Shrine Offering and Salt Against the Aswang focus on a parameterized void method and its call."),
    ]},
    { id: "return-values", title: "Return values", blocks: [
      p("A non-void method promises to send a value of its declared return type back to the caller. The return keyword supplies that value, and the caller can store it."),
      code("static int GetPower()\n{\n    return 50;\n}\n\nint power = GetPower();\nConsole.WriteLine(power);", "50"),
      code('static string FindPath()\n{\n    return "north";\n}\n\nstring path = FindPath();\nConsole.WriteLine(path);', "north"),
      note("Display is not return", "Console.WriteLine(50) displays 50. return 50 sends 50 back to the caller so the program can store or calculate with it."),
      connection("Oracle Stone returns an int, while Diwata's Safe Path returns a string."),
    ]},
    { id: "parameters-return", title: "Parameters with return values", blocks: [
      p("A method can receive inputs, calculate with them, and return one result. This keeps the calculation reusable for different arguments."),
      code("static int AddPower(int basePower, int bonus)\n{\n    return basePower + bonus;\n}\n\nint total = AddPower(30, 20);\nConsole.WriteLine(total);", "50"),
      code("static int Double(int value)\n{\n    return value * 2;\n}\n\nConsole.WriteLine(Double(7));", "14", "Same pattern, different calculation"),
      practice("Write a method named TotalCoins that receives two int values and returns their sum.", "static int TotalCoins(int first, int second)\n{\n    return first + second;\n}"),
      connection("Anting-Anting Power and Healing Ritual validate int parameters, calculation, return, call, and stored result."),
    ]},
    { id: "scope", title: "Basic variable scope", blocks: [
      p("A variable declared inside a method is local to that method. Another method cannot use it directly. Values cross a method boundary through parameters and return values."),
      code("static int MakeCharm(int strength)\n{\n    int doubled = strength * 2;\n    return doubled;\n}\n\nint result = MakeCharm(6);", null),
      note("Common mistake", "doubled exists only inside MakeCharm. Main uses the returned result instead.", "warning"),
    ]},
    { id: "recursion", title: "Recursion and the base case", blocks: [
      p("A recursive method calls itself. Each call should move toward a base case: a condition that stops further calls."),
      code('static void BuildStep(int step)\n{\n    if (step == 0)\n        return;\n\n    Console.WriteLine(step);\n    BuildStep(step - 1);\n}\n\nBuildStep(3);', "3\n2\n1"),
      diagram(["Call", "Next"], [["BuildStep(3)", "BuildStep(2)"], ["BuildStep(2)", "BuildStep(1)"], ["BuildStep(1)", "BuildStep(0)"], ["BuildStep(0)", "STOP"]], "The value becomes smaller until the base case stops recursion."),
      list("The method calls itself.", "step - 1 makes the problem smaller.", "step == 0 is the base case.", "return stops that call before another recursive call."),
      note("Common mistake", "Without a reachable base case, calls keep accumulating until the program fails with a stack overflow.", "warning"),
      connection("Endless Bamboo Stairs validates a countdown-style recursive method and a safe base case."),
    ]},
    { id: "mistakes", title: "Common method mistakes", blocks: [
      list("Defining a method but never calling it.", "Calling a method with the wrong argument type or order.", "Declaring a non-void return type but not returning a value.", "Trying to use a local variable outside its method.", "Printing a result when the caller needs it returned.", "Writing recursion without a reachable base case."),
      code("static int GetScore()\n{\n    Console.WriteLine(10);\n}", null, "Missing return value"),
      p("This displays 10 but does not satisfy the promise to return an int. The body needs return 10;."),
    ]},
    { id: "practice", title: "Practice and assessment", blocks: [
      practice("Define and call a void method named LightLantern that displays Lit.", "static void LightLantern()\n{\n    Console.WriteLine(\"Lit\");\n}\n\nLightLantern();"),
      practice("Write an int method named Multiply that accepts two parameters and returns their product.", "static int Multiply(int first, int second)\n{\n    return first * second;\n}"),
      check("methods-create-call", "Which line makes RingBell run?", ["void RingBell()", "RingBell();", "return RingBell;"], 1, "A method call uses its name followed by parentheses."),
      check("methods-parameter", "In ThrowSalt(5), what is 5?", ["A parameter", "An argument", "A return type"], 1, "The call supplies the argument 5 to the method's parameter."),
      check("methods-recursion", "What must stop a recursive method?", ["A base case", "A string", "A second class"], 0, "A reachable base case prevents endless recursive calls."),
    ]},
    { id: "summary", title: "Summary", blocks: [
      p("Methods name reusable behavior. Parameters receive inputs, arguments supply them, return sends a result to the caller, and recursion repeats through self-calls until a base case."),
      list("Definition creates behavior; a call runs it.", "void means no result value is returned.", "Parameters appear in the definition; arguments appear in the call.", "A returned value can be stored by the caller.", "Safe recursion must progress toward a base case."),
      connection("You are prepared for the 11 playable method levels, from simple void calls through int/string returns, parameters, calculated results, and recursive stairs."),
    ]},
  ],
  references: [
    microsoft("Overview of methods", "https://learn.microsoft.com/en-us/dotnet/csharp/methods"),
    microsoft("Methods (C# Programming Guide)", "https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/methods"),
    microsoft("Method parameters and modifiers", "https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/method-parameters"),
    codeChumReference,
  ],
};
