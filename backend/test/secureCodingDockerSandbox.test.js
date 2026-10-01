const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { EventEmitter } = require("node:events");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const test = require("node:test");
const { EXECUTION_CATEGORIES } = require("../src/services/secureCodingExecutionContract");
const {
  DEFAULT_SECURE_LIMITS,
  buildContainerSecurityArgs,
  executeSecureMethodInDocker,
  runDockerContainer,
} = require("../src/services/secureCodingDockerSandbox");

const request = {
  source: "public static class Submission { public static int AddNumbers(int a, int b) => a + b; }",
  contract: { typeName: "Submission", methodName: "AddNumbers", parameterTypes: ["int", "int"], returnType: "int" },
  inputs: [[2, 3], [10, -4]],
};

test("container security arguments enforce the required kernel boundaries", () => {
  assert.deepEqual(DEFAULT_SECURE_LIMITS, {
    compileTimeoutMs: 20_000,
    executionTimeoutMs: 2_000,
    totalDeadlineMs: 30_000,
    outputBytes: 32 * 1024,
    memoryMb: 256,
    cpus: 0.5,
    pids: 64,
    jobTmpfsMb: 64,
    maxDiagnostics: 50,
    maxInvocations: 10,
  });
  const args = buildContainerSecurityArgs({ name: "job-name", limits: DEFAULT_SECURE_LIMITS });
  const joined = args.join(" ");
  assert.match(joined, /--network none/);
  assert.match(joined, /--read-only/);
  assert.match(joined, /--cap-drop ALL/);
  assert.match(joined, /--security-opt no-new-privileges/);
  assert.match(joined, /--memory 256m --memory-swap 256m/);
  assert.match(joined, /--cpus 0\.5/);
  assert.match(joined, /--pids-limit 64/);
  assert.match(joined, /--user 65534:65534/);
  assert.match(joined, /\/tmp:rw,nosuid,nodev,size=64m/);
  assert.doesNotMatch(joined, /PRACTICE_RUNNER_TOKEN|DATABASE_URL|JWT_SECRET/);
});

test("method execution compiles once and uses a fresh sandbox for every input", async () => {
  const calls = [];
  const removed = [];
  const jobDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "secure-sandbox-unit-"));
  const runContainer = async (spec) => {
    calls.push(spec);
    if (spec.phase === "compile") return { exitCode: 0, stdout: "", stderr: "" };
    const output = spec.input[0] + spec.input[1];
    return { exitCode: 0, stdout: `SHARPRUNNER_RESULT:${JSON.stringify({ category: "SUCCESS", output })}\n`, stderr: "" };
  };
  const result = await executeSecureMethodInDocker(request, {
    environment: { CODING_ASSESSMENT_SANDBOX_IMAGE: "sandbox:test" },
    createJobDirectory: async () => jobDirectory,
    verifyArtifacts: async () => true,
    runContainer,
    removeContainer: async (name) => { removed.push(name); },
  });
  assert.equal(result.category, EXECUTION_CATEGORIES.SUCCESS);
  assert.deepEqual(result.invocations.map((item) => item.output), [5, 6]);
  assert.equal(calls.filter((call) => call.phase === "compile").length, 1);
  assert.equal(calls.filter((call) => call.phase === "execute").length, 2);
  const executionNames = calls.filter((call) => call.phase === "execute").map((call) => call.name);
  assert.equal(new Set(executionNames).size, 2);
  assert.ok(calls.every((call) => call.securityArgs.includes("--network")));
  assert.ok(calls.every((call) => removed.includes(call.name)), "every named container must be force-removed");
  await assert.rejects(() => fs.access(jobDirectory), /ENOENT/);
});

test("sandbox classifies timeout, output, resource, and infrastructure failures", async () => {
  const cases = [
    [{ timedOut: true }, EXECUTION_CATEGORIES.TIMEOUT],
    [{ outputLimited: true }, EXECUTION_CATEGORIES.OUTPUT_LIMIT],
    [{ oomKilled: true, exitCode: 137 }, EXECUTION_CATEGORIES.RESOURCE_LIMIT],
    [{ infrastructureError: true }, EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR],
  ];
  for (const [executionResult, expected] of cases) {
    const result = await executeSecureMethodInDocker({ ...request, inputs: [[2, 3]] }, {
      createJobDirectory: () => fs.mkdtemp(path.join(os.tmpdir(), "secure-sandbox-classify-")),
      verifyArtifacts: async () => true,
      runContainer: async (spec) => spec.phase === "compile" ? { exitCode: 0 } : executionResult,
      removeContainer: async () => {},
    });
    assert.equal(result.category, expected);
  }
});

test("malformed or spoofed harness output is an infrastructure failure", async () => {
  const result = await executeSecureMethodInDocker({ ...request, inputs: [[2, 3]] }, {
    createJobDirectory: () => fs.mkdtemp(path.join(os.tmpdir(), "secure-sandbox-protocol-")),
    verifyArtifacts: async () => true,
    runContainer: async (spec) => spec.phase === "compile"
      ? { exitCode: 0 }
      : { exitCode: 0, stdout: "student noise\nSHARPRUNNER_RESULT:{not-json}\n" },
    removeContainer: async () => {},
  });
  assert.equal(result.category, EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR);
});

test("a process that exits before its deadline is not reclassified while OOM status is inspected", async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {};
  const resultPromise = runDockerContainer({
    dockerBinary: "unused",
    environment: {},
    name: "finished-job",
    args: [],
    timeoutMs: 20,
    outputLimit: 1024,
    spawnProcess: () => child,
    inspectContainerOom: async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return false;
    },
    forceRemoveContainer: async () => {},
  });
  setTimeout(() => child.emit("close", 0), 5);
  const result = await resultPromise;
  assert.equal(result.exitCode, 0);
  assert.equal(result.timedOut, undefined);
});
