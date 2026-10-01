const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { EXECUTION_CATEGORIES } = require("../src/services/secureCodingExecutionContract");
const { executeSecureMethodInDocker } = require("../src/services/secureCodingDockerSandbox");
const { runSecureMethodExecution } = require("../src/services/secureCodingExecutionService");

const enabledEnvironment = {
  ...process.env,
  CODING_ASSESSMENT_EXECUTION_ENABLED: "true",
  CODING_ASSESSMENT_EXECUTION_MODE: "docker",
  CODING_ASSESSMENT_EXECUTION_ROLE: "runner",
};

const policyRequest = (source) => ({
  source,
  contract: { typeName: "Submission", methodName: "Probe", parameterTypes: [], returnType: "bool" },
  inputs: [[]],
});

test("malicious API corpus is rejected by policy before sandbox admission", async () => {
  const cases = [
    "public static class Submission { public static bool Probe() => System.IO.File.Exists(\"/etc/passwd\"); }",
    "public static class Submission { public static bool Probe() => System.Net.Dns.GetHostAddresses(\"example.com\").Length > 0; }",
    "public static class Submission { public static bool Probe() => System.Diagnostics.Process.Start(\"sh\") != null; }",
    "public static class Submission { public static bool Probe() => System.Environment.GetEnvironmentVariable(\"JWT_SECRET\") != null; }",
    "public static class Submission { public static bool Probe() => typeof(string).Assembly != null; }",
    "public static class Submission { public static bool Probe() { unsafe { int value = 1; return &value != null; } } }",
    "using System.Runtime.InteropServices; public static class Submission { [DllImport(\"libc\")] static extern int getpid(); public static bool Probe() => getpid() > 0; }",
  ];
  let admitted = 0;
  for (const source of cases) {
    const result = await runSecureMethodExecution(policyRequest(source), {
      environment: enabledEnvironment,
      inspectSandbox: async () => ({ available: true }),
      executeInSandbox: async () => { admitted += 1; return { category: "SUCCESS", output: true }; },
    });
    assert.equal(result.category, EXECUTION_CATEGORIES.POLICY_REJECTION, source);
  }
  assert.equal(admitted, 0);
});

const image = process.env.CODING_ASSESSMENT_SANDBOX_IMAGE || "sharprunner-coding-sandbox:latest";
const dockerCommand = process.env.CODING_ASSESSMENT_DOCKER_BIN || process.env.PRACTICE_DOCKER_BIN || "docker";
const dockerInfo = spawnSync(dockerCommand, ["info"], { windowsHide: true, stdio: "ignore" });
const imageInfo = dockerInfo.status === 0
  ? spawnSync(dockerCommand, ["image", "inspect", image], { windowsHide: true, stdio: "ignore" })
  : { status: 1 };
const containmentSkip = dockerInfo.status === 0 && imageInfo.status === 0
  ? false
  : `Docker daemon and ${image} are required for kernel-containment regression cases`;

test("real sandbox contains environment, filesystem, network, and child-process probes", { skip: containmentSkip }, async () => {
  const source = `
using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
public static class Submission {
  public static string Probe(int test) {
    if (test == 0) return Environment.GetEnvironmentVariable("JWT_SECRET") ?? "isolated";
    if (test == 1) return File.Exists("/app/backend/src/practiceRunnerServer.js") ? "exposed" : "isolated";
    if (test == 2) { try { File.WriteAllText("/escape.txt", "x"); return "writable"; } catch { return "isolated"; } }
    if (test == 3) { try { using var socket = new TcpClient(); socket.Connect("1.1.1.1", 53); return "connected"; } catch { return "isolated"; } }
    if (test == 4) { try { Process.Start(new ProcessStartInfo("/bin/sh", "-c 'sleep 30'") { UseShellExecute = false }); return "spawned-contained"; } catch { return "blocked-contained"; } }
    return "unknown";
  }
}`;
  const result = await executeSecureMethodInDocker({
    source,
    contract: { typeName: "Submission", methodName: "Probe", parameterTypes: ["int"], returnType: "string" },
    inputs: [[0], [1], [2], [3], [4]],
  }, { environment: enabledEnvironment });
  assert.notEqual(result.category, EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR);
  assert.deepEqual(result.invocations.slice(0, 3).map((item) => item.output), ["isolated", "isolated", "isolated"]);
  assert.ok([EXECUTION_CATEGORIES.SUCCESS, EXECUTION_CATEGORIES.TIMEOUT].includes(result.invocations[3].category));
  if (result.invocations[3].category === EXECUTION_CATEGORIES.SUCCESS) assert.equal(result.invocations[3].output, "isolated");
  assert.match(result.invocations[4].output, /contained$/);
  const remaining = spawnSync(dockerCommand, ["ps", "-q", "--filter", "name=sharprunner-secure-"], { encoding: "utf8", windowsHide: true });
  assert.equal(remaining.stdout.trim(), "", "no secure execution container or child process tree may survive cleanup");
});

test("real sandbox contains infinite loops, managed allocation, excessive output, and malformed source", { skip: containmentSkip }, async () => {
  const stress = await executeSecureMethodInDocker({
    source: `public static class Submission {
      public static int Stress(int test) {
        if (test == 0) { while (true) { } }
        if (test == 1) { var blocks = new System.Collections.Generic.List<byte[]>(); while (true) blocks.Add(new byte[16 * 1024 * 1024]); }
        while (true) System.Console.WriteLine(new string('x', 1024));
      }
    }`,
    contract: { typeName: "Submission", methodName: "Stress", parameterTypes: ["int"], returnType: "int" },
    inputs: [[0], [1], [2]],
  }, { environment: enabledEnvironment });
  assert.deepEqual(stress.invocations.map((item) => item.category), [
    EXECUTION_CATEGORIES.TIMEOUT,
    EXECUTION_CATEGORIES.RESOURCE_LIMIT,
    EXECUTION_CATEGORIES.OUTPUT_LIMIT,
  ]);

  const malformed = await executeSecureMethodInDocker({
    source: "public static class Submission { public static int Broken(int value) [ return value; ] }",
    contract: { typeName: "Submission", methodName: "Broken", parameterTypes: ["int"], returnType: "int" },
    inputs: [[1]],
  }, { environment: enabledEnvironment });
  assert.equal(malformed.category, EXECUTION_CATEGORIES.COMPILE_ERROR);
  assert.ok(malformed.diagnostics.length > 0);
});
