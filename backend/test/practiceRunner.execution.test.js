const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const { runDirectPracticeCode } = require("../src/services/practiceRunnerService");

const sdkLines = execFileSync("dotnet", ["--list-sdks"], { encoding: "utf8", windowsHide: true }).trim().split(/\r?\n/);
const sdkMajor = Number(sdkLines.at(-1).match(/^(\d+)/)?.[1]);
if (!sdkMajor) throw new Error("The practice execution tests require a .NET SDK");
process.env.PRACTICE_DOTNET_TARGET = `net${sdkMajor}.0`;

const execute = (code, timeoutMs = 2_000) => runDirectPracticeCode(code, { timeoutMs, outputLimit: 32 * 1024 });

test("the direct C# runner returns real output and classifies failures", async () => {
  const cases = [
    ["hello", 'Console.WriteLine("Hello SharpRunner");', "Hello SharpRunner"],
    ["array index", "int[] powers = { 10, 20, 30 }; Console.WriteLine(powers[1]);", "20"],
    ["changed array index", "int[] powers = { 10, 20, 30 }; Console.WriteLine(powers[2]);", "30"],
    ["edited try it yourself", "int[] runes = { 2, 4, 0 }; runes[2] = 6; Console.WriteLine(runes[2]);", "6"],
    ["foreach", "int[] powers = { 10, 20, 30 }; foreach (int power in powers) { Console.WriteLine(power); }", "10\n20\n30"],
    ["local method", 'void RingBell() { Console.WriteLine("Ding!"); } RingBell();', "Ding!"],
    ["returning method", "int GetPower() { return 50; } Console.WriteLine(GetPower());", "50"],
    ["array parameter", "void ShowValues(int[] values) { foreach (int value in values) Console.WriteLine(value); } int[] powers = { 10, 20, 30 }; ShowValues(powers);", "10\n20\n30"],
  ];
  for (const [name, source, expected] of cases) {
    const result = await execute(source);
    assert.equal(result.success, true, `${name}: ${result.stderr}`);
    assert.equal(result.stdout, expected, name);
  }

  const compileError = await execute('int number = "hello";');
  assert.equal(compileError.success, false);
  assert.equal(compileError.errorType, "compiler");
  assert.match(compileError.stderr, /error CS0029/);

  const runtimeError = await execute("int[] numbers = { 1 }; Console.WriteLine(numbers[5]);");
  assert.equal(runtimeError.success, false);
  assert.equal(runtimeError.errorType, "runtime");
  assert.match(runtimeError.stderr, /IndexOutOfRangeException/);

  const noOutput = await execute("int number = 10;");
  assert.equal(noOutput.success, true);
  assert.equal(noOutput.stdout, "");

  const timedOut = await execute("while (true) { }", 500);
  assert.equal(timedOut.success, false);
  assert.equal(timedOut.timedOut, true);
  assert.equal(timedOut.errorType, "timeout");
  assert.match(timedOut.stderr, /terminated after execution timeout/);

  const editedA = await execute('Console.WriteLine("A");');
  const editedB = await execute('Console.WriteLine("B");');
  assert.equal(editedA.stdout, "A");
  assert.equal(editedB.stdout, "B");
});
