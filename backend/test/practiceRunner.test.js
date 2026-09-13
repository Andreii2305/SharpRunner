const assert = require("assert");
const test = require("node:test");
const { createPracticeRunnerApp } = require("../src/practiceRunnerServer");
const { configuredRemoteBaseUrl, normalizeRunnerResult, runPracticeCode, sanitizeRunnerText, validatePracticeCode } = require("../src/services/practiceRunnerService");

assert.equal(validatePracticeCode('Console.WriteLine("Hello");').allowed, true);
assert.equal(validatePracticeCode('int x = "abc";').allowed, true, "Compiler errors should reach the compiler");
assert.equal(validatePracticeCode('int[] x = { 1 }; Console.WriteLine(x[5]);').allowed, true, "Runtime errors should reach the sandbox");
assert.equal(validatePracticeCode("while (true) { }").allowed, true, "Infinite loops are handled by the timeout");
assert.equal(validatePracticeCode("x".repeat(16 * 1024 + 1)).allowed, false, "Oversized source is rejected before compilation");
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

test("runner liveness is cheap but readiness requires authentication", async () => {
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
    const healthStartedAt = Date.now();
    const publicHealth = await fetch(`${url}/health`);
    assert.ok(Date.now() - healthStartedAt < 250, "liveness should be constant-time");
    assert.equal(publicHealth.status, 200);
    const publicHealthPayload = await publicHealth.json();
    assert.equal(publicHealthPayload.status, "ok");
    assert.equal((await fetch(`${url}/health/auth`)).status, 401);
    const readyResponse = await fetch(`${url}/ready`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(readyResponse.status, 200);
    const readyPayload = await readyResponse.json();
    assert.equal(readyPayload.compilerAvailable, true);
    if (readyPayload.compilerMode === "roslyn") assert.match(readyPayload.targetFramework, /^net\d+\.0$/);
    else assert.match(readyPayload.sdkVersion, /^\d+\.\d+\.\d+$/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousMode === undefined) delete process.env.PRACTICE_RUNNER_MODE; else process.env.PRACTICE_RUNNER_MODE = previousMode;
    if (previousTarget === undefined) delete process.env.PRACTICE_DOTNET_TARGET; else process.env.PRACTICE_DOTNET_TARGET = previousTarget;
  }
});

test("runner rejects excess concurrent work with a retryable 429", async () => {
  const previousMode = process.env.PRACTICE_RUNNER_MODE;
  const previousConcurrency = process.env.PRACTICE_RUNNER_MAX_CONCURRENT;
  const previousTimeout = process.env.PRACTICE_RUNNER_TIMEOUT_MS;
  process.env.PRACTICE_RUNNER_MODE = "direct";
  process.env.PRACTICE_RUNNER_MAX_CONCURRENT = "1";
  process.env.PRACTICE_RUNNER_TIMEOUT_MS = "800";
  const token = "runner-busy-test-token-at-least-32-characters";
  const app = createPracticeRunnerApp({ serviceToken: token });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const options = { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } };
  try {
    const firstRun = fetch(`${url}/run`, { ...options, body: JSON.stringify({ code: "while (true) { }" }) });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const busyResponse = await fetch(`${url}/run`, { ...options, body: JSON.stringify({ code: "Console.WriteLine(1);" }) });
    assert.equal(busyResponse.status, 429);
    assert.equal(busyResponse.headers.get("retry-after"), "5");
    assert.equal((await busyResponse.json()).code, "PRACTICE_RUNNER_BUSY");
    await firstRun;
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousMode === undefined) delete process.env.PRACTICE_RUNNER_MODE; else process.env.PRACTICE_RUNNER_MODE = previousMode;
    if (previousConcurrency === undefined) delete process.env.PRACTICE_RUNNER_MAX_CONCURRENT; else process.env.PRACTICE_RUNNER_MAX_CONCURRENT = previousConcurrency;
    if (previousTimeout === undefined) delete process.env.PRACTICE_RUNNER_TIMEOUT_MS; else process.env.PRACTICE_RUNNER_TIMEOUT_MS = previousTimeout;
  }
});

console.log("Practice runner policy tests passed");

test("a waking remote runner fails fast with a machine-readable reason", async () => {
  const previous = {
    fetch: global.fetch,
    url: process.env.PRACTICE_RUNNER_URL,
    token: process.env.PRACTICE_RUNNER_TOKEN,
    timeout: process.env.PRACTICE_RUNNER_READY_TIMEOUT_MS,
  };
  process.env.PRACTICE_RUNNER_URL = "https://runner.example.test";
  process.env.PRACTICE_RUNNER_TOKEN = "remote-runner-test-token-at-least-32-characters";
  process.env.PRACTICE_RUNNER_READY_TIMEOUT_MS = "50";
  global.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  });
  const startedAt = Date.now();
  try {
    await assert.rejects(
      () => runPracticeCode('Console.WriteLine("Hello");'),
      (error) => error.code === "RUNNER_UNAVAILABLE" && error.reason === "runner_starting",
    );
    assert.ok(Date.now() - startedAt < 500, "readiness should not enter a long wake loop");
  } finally {
    global.fetch = previous.fetch;
    for (const [key, value] of [["PRACTICE_RUNNER_URL", previous.url], ["PRACTICE_RUNNER_TOKEN", previous.token], ["PRACTICE_RUNNER_READY_TIMEOUT_MS", previous.timeout]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
