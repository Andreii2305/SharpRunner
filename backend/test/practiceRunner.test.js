const assert = require("assert");
const { normalizeRunnerResult, sanitizeRunnerText, validatePracticeCode } = require("../src/services/practiceRunnerService");

assert.equal(validatePracticeCode('Console.WriteLine("Hello");').allowed, true);
assert.equal(validatePracticeCode('int x = "abc";').allowed, true, "Compiler errors should reach the compiler");
assert.equal(validatePracticeCode('int[] x = { 1 }; Console.WriteLine(x[5]);').allowed, true, "Runtime errors should reach the sandbox");
assert.equal(validatePracticeCode("while (true) { }").allowed, true, "Infinite loops are handled by the timeout");
assert.equal(validatePracticeCode("System.IO.File.ReadAllText(\"secret\")").allowed, false);
assert.equal(validatePracticeCode("new System.Net.Http.HttpClient()").allowed, false);
assert.equal(validatePracticeCode("System.Diagnostics.Process.Start(\"cmd\")").allowed, false);
assert.equal(validatePracticeCode("Environment.GetEnvironmentVariable(\"JWT_SECRET\")").allowed, false);
assert.equal(validatePracticeCode("using S = System; S.IO.File.ReadAllText(\"secret\");").allowed, false);
assert.equal(validatePracticeCode("Console.Out.GetType().Assembly.FullName").allowed, false);
assert.equal(validatePracticeCode("System.\\u0049O.File.ReadAllText(\"secret\")").allowed, false);
assert.equal(validatePracticeCode('Console.WriteLine("System.IO.File is text here");').allowed, true, "Blocked words in strings are harmless");
assert.match(sanitizeRunnerText("/source/Program.cs(3,4): error CS1002: ; expected"), /^Line 3, column 4/);
assert.deepEqual(normalizeRunnerResult({ success: true, stdout: "Hello\r\n", stderr: "" }), { success: true, stdout: "Hello", stderr: "" });
assert.equal(normalizeRunnerResult({ success: false, stdout: "", stderr: "error CS1002", errorType: "compiler" }).errorType, "compiler");
assert.equal(normalizeRunnerResult({ success: false, stdout: "x".repeat(100), stderr: "" }, 10).outputLimited, true);

console.log("Practice runner policy tests passed");
