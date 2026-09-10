const assert = require("assert");
const test = require("node:test");
const { createPracticeRunnerApp } = require("../src/practiceRunnerServer");
const { configuredRemoteBaseUrl, normalizeRunnerResult, sanitizeRunnerText, validatePracticeCode } = require("../src/services/practiceRunnerService");

assert.equal(validatePracticeCode('Console.WriteLine("Hello");').allowed, true);
assert.equal(validatePracticeCode('int x = "abc";').allowed, true, "Compiler errors should reach the compiler");
assert.equal(validatePracticeCode('int[] x = { 1 }; Console.WriteLine(x[5]);').allowed, true, "Runtime errors should reach the sandbox");
assert.equal(validatePracticeCode("while (true) { }").allowed, true, "Infinite loops are handled by the timeout");
assert.equal(validatePracticeCode("System.IO.File.ReadAllText(\"secret\")").allowed, false);
assert.equal(validatePracticeCode("new FileInfo(\"secret\").OpenRead()").allowed, false);
assert.equal(validatePracticeCode("Path.GetTempPath()").allowed, false);
assert.equal(validatePracticeCode("new System.Net.Http.HttpClient()").allowed, false);
assert.equal(validatePracticeCode("Dns.GetHostAddresses(\"example.com\")").allowed, false);
assert.equal(validatePracticeCode("System.Diagnostics.Process.Start(\"cmd\")").allowed, false);
assert.equal(validatePracticeCode("new ProcessStartInfo(\"sh\")").allowed, false);
assert.equal(validatePracticeCode("Environment.GetEnvironmentVariable(\"JWT_SECRET\")").allowed, false);
assert.equal(validatePracticeCode('Console.WriteLine($"{Environment.GetEnvironmentVariable("JWT_SECRET")}");').allowed, false);
assert.equal(validatePracticeCode("using S = System; S.IO.File.ReadAllText(\"secret\");").allowed, false);
assert.equal(validatePracticeCode("Console.Out.GetType().Assembly.FullName").allowed, false);
assert.equal(validatePracticeCode("System.\\u0049O.File.ReadAllText(\"secret\")").allowed, false);
assert.equal(validatePracticeCode('Console.WriteLine("System.IO.File is text here");').allowed, true, "Blocked words in strings are harmless");
assert.match(sanitizeRunnerText("/source/Program.cs(3,4): error CS1002: ; expected"), /^Line 3, column 4/);
assert.deepEqual(normalizeRunnerResult({ success: true, stdout: "Hello\r\n", stderr: "" }), { success: true, stdout: "Hello", stderr: "" });
assert.equal(normalizeRunnerResult({ success: false, stdout: "", stderr: "error CS1002", errorType: "compiler" }).errorType, "compiler");
assert.equal(normalizeRunnerResult({ success: false, stdout: "x".repeat(100), stderr: "" }, 10).outputLimited, true);

const originalRunnerUrl = process.env.PRACTICE_RUNNER_URL;
process.env.PRACTICE_RUNNER_URL = "runner.internal:10000/";
assert.equal(configuredRemoteBaseUrl(), "http://runner.internal:10000");
process.env.PRACTICE_RUNNER_URL = "https://runner.example.com///";
assert.equal(configuredRemoteBaseUrl(), "https://runner.example.com");
process.env.PRACTICE_RUNNER_URL = "ftp://runner.example.com";
assert.equal(configuredRemoteBaseUrl(), "");
if (originalRunnerUrl === undefined) delete process.env.PRACTICE_RUNNER_URL;
else process.env.PRACTICE_RUNNER_URL = originalRunnerUrl;

test("runner health is public but authenticated health rejects a bad token", async () => {
  const previousMode = process.env.PRACTICE_RUNNER_MODE;
  const previousTarget = process.env.PRACTICE_DOTNET_TARGET;
  process.env.PRACTICE_RUNNER_MODE = "direct";
  const sdkMajor = require("node:child_process").execFileSync("dotnet", ["--list-sdks"], { encoding: "utf8" }).trim().split(/\r?\n/).at(-1).match(/^(\d+)/)?.[1];
  process.env.PRACTICE_DOTNET_TARGET = `net${sdkMajor}.0`;
  const token = "runner-test-token-that-is-at-least-32-characters";
  const app = createPracticeRunnerApp({ serviceToken: token });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const publicHealth = await fetch(`${url}/health`);
    assert.equal(publicHealth.status, 200);
    assert.deepEqual(await publicHealth.json(), { status: "ok", dotnet: true });
    assert.equal((await fetch(`${url}/health/auth`)).status, 401);
    assert.equal((await fetch(`${url}/health/auth`, { headers: { authorization: `Bearer ${token}` } })).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousMode === undefined) delete process.env.PRACTICE_RUNNER_MODE; else process.env.PRACTICE_RUNNER_MODE = previousMode;
    if (previousTarget === undefined) delete process.env.PRACTICE_DOTNET_TARGET; else process.env.PRACTICE_DOTNET_TARGET = previousTarget;
  }
});

console.log("Practice runner policy tests passed");
