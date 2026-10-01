const assert = require("node:assert/strict");
const test = require("node:test");
const { createPracticeRunnerApp } = require("../src/practiceRunnerServer");
const {
  EXECUTION_CATEGORIES,
  METHOD_TYPE_ALLOWLIST,
  validateMethodExecutionRequest,
} = require("../src/services/secureCodingExecutionContract");
const {
  getSecureCodingExecutionCapability,
  normalizeSecureCodingExecutionResult,
  runSecureMethodExecution,
} = require("../src/services/secureCodingExecutionService");

const validRequest = () => ({
  source: "public static class Submission { public static int AddNumbers(int a, int b) => a + b; }",
  contract: {
    typeName: "Submission",
    methodName: "AddNumbers",
    parameterTypes: ["int", "int"],
    returnType: "int",
  },
  inputs: [[2, 3]],
});

test("method execution contract accepts only the documented deterministic types", () => {
  assert.deepEqual(METHOD_TYPE_ALLOWLIST, ["bool", "int", "long", "string", "bool[]", "int[]", "long[]", "string[]"]);
  const request = validateMethodExecutionRequest(validRequest());
  assert.equal(request.contract.typeName, "Submission");
  assert.deepEqual(request.inputs, [[2, 3]]);

  for (const disallowed of ["double", "decimal", "object", "dynamic", "System.Type", "int[,]", "List<int>"]) {
    assert.throws(
      () => validateMethodExecutionRequest({ ...validRequest(), contract: { ...validRequest().contract, returnType: disallowed } }),
      (error) => error.code === "UNSUPPORTED_TYPE",
      disallowed,
    );
  }
});

test("method execution contract rejects malformed signatures and typed inputs", () => {
  assert.throws(
    () => validateMethodExecutionRequest({ ...validRequest(), contract: { ...validRequest().contract, methodName: "Run();System.IO.File.ReadAllText" } }),
    (error) => error.code === "INVALID_CONTRACT",
  );
  assert.throws(
    () => validateMethodExecutionRequest({ ...validRequest(), inputs: [[2]] }),
    (error) => error.code === "INVALID_INPUT",
  );
  assert.throws(
    () => validateMethodExecutionRequest({ ...validRequest(), inputs: [[2, "3"]] }),
    (error) => error.code === "INVALID_INPUT",
  );
  assert.throws(
    () => validateMethodExecutionRequest({ ...validRequest(), inputs: Array.from({ length: 11 }, () => [1, 2]) }),
    (error) => error.code === "TOO_MANY_INVOCATIONS",
  );
});

test("expected outputs and grading data cannot cross the execution boundary", () => {
  for (const forbidden of [
    { expectedOutput: 5 },
    { hidden: true },
    { score: 1 },
    { points: 10 },
    { passingPercentage: 75 },
  ]) {
    assert.throws(
      () => validateMethodExecutionRequest({ ...validRequest(), ...forbidden }),
      (error) => error.code === "UNEXPECTED_FIELD",
    );
  }
});

test("authoritative execution capability defaults off and rejects direct mode", async () => {
  let diagnosticCalls = 0;
  const inspectSandbox = async () => {
    diagnosticCalls += 1;
    return { available: true };
  };
  assert.deepEqual(
    await getSecureCodingExecutionCapability({ environment: {}, inspectSandbox }),
    { available: false, code: "SECURE_EXECUTION_DISABLED" },
  );
  assert.deepEqual(
    await getSecureCodingExecutionCapability({
      environment: { CODING_ASSESSMENT_EXECUTION_ENABLED: "true", CODING_ASSESSMENT_EXECUTION_MODE: "direct" },
      inspectSandbox,
    }),
    { available: false, code: "SECURE_SANDBOX_REQUIRED" },
  );
  assert.equal(diagnosticCalls, 0, "ineligible modes must not probe or execute a sandbox");
});

test("authoritative execution fails closed when the sandbox is unavailable", async () => {
  let executionCalls = 0;
  const environment = {
    CODING_ASSESSMENT_EXECUTION_ENABLED: "true",
    CODING_ASSESSMENT_EXECUTION_MODE: "docker",
    CODING_ASSESSMENT_EXECUTION_ROLE: "runner",
  };
  const capability = await getSecureCodingExecutionCapability({
    environment,
    inspectSandbox: async () => ({ available: false }),
  });
  assert.deepEqual(capability, { available: false, code: "SECURE_SANDBOX_UNAVAILABLE" });
  const result = await runSecureMethodExecution(validRequest(), {
    environment,
    inspectSandbox: async () => ({ available: false }),
    executeInSandbox: async () => { executionCalls += 1; },
  });
  assert.equal(result.category, EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR);
  assert.equal(result.code, "SECURE_EXECUTION_UNAVAILABLE");
  assert.equal(executionCalls, 0);
});

test("the capability gate cannot be bypassed by validation or policy responses", async () => {
  const result = await runSecureMethodExecution(policyRequestForGate(), {
    environment: {},
    inspectSandbox: async () => ({ available: true }),
    executeInSandbox: async () => ({ category: EXECUTION_CATEGORIES.SUCCESS, output: true }),
  });
  assert.equal(result.category, EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR);
  assert.equal(result.code, "SECURE_EXECUTION_UNAVAILABLE");
});

function policyRequestForGate() {
  return {
    source: "public static class Submission { public static bool Probe() => System.IO.File.Exists(\"/etc/passwd\"); }",
    contract: { typeName: "Submission", methodName: "Probe", parameterTypes: [], returnType: "bool" },
    inputs: [[]],
  };
}

test("structured results are sanitized and bounded at the trusted boundary", async () => {
  const environment = {
    CODING_ASSESSMENT_EXECUTION_ENABLED: "true",
    CODING_ASSESSMENT_EXECUTION_MODE: "docker",
    CODING_ASSESSMENT_EXECUTION_ROLE: "runner",
  };
  const result = await runSecureMethodExecution(validRequest(), {
    environment,
    inspectSandbox: async () => ({ available: true }),
    executeInSandbox: async () => ({
      category: EXECUTION_CATEGORIES.RUNTIME_ERROR,
      message: "failure at /tmp/sharprunner-job-secret/Program.cs\nJWT_SECRET=do-not-return\n" + "x".repeat(40_000),
    }),
  });
  assert.equal(result.category, EXECUTION_CATEGORIES.RUNTIME_ERROR);
  assert.ok(Buffer.byteLength(JSON.stringify(result), "utf8") <= 32 * 1024);
  assert.doesNotMatch(JSON.stringify(result), /sharprunner-job-secret|do-not-return/);
});

test("malformed invocation aggregates fail closed instead of retaining SUCCESS", () => {
  const wrongType = normalizeSecureCodingExecutionResult({
    category: EXECUTION_CATEGORIES.SUCCESS,
    invocations: [{ category: EXECUTION_CATEGORIES.SUCCESS, output: "not-an-int" }],
  }, "int", 1);
  assert.equal(wrongType.category, EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR);

  const missingInvocation = normalizeSecureCodingExecutionResult({
    category: EXECUTION_CATEGORIES.SUCCESS,
    invocations: [],
  }, "int", 1);
  assert.equal(missingInvocation.category, EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR);
});

test("the main API can only use an authenticated remote secure runner", async () => {
  const previousFetch = global.fetch;
  const requests = [];
  const environment = {
    CODING_ASSESSMENT_EXECUTION_ENABLED: "true",
    PRACTICE_RUNNER_URL: "https://runner.example.test",
    PRACTICE_RUNNER_TOKEN: "remote-secure-runner-token-at-least-32-characters",
  };
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith("/capabilities/assessment-coding")) {
      return new Response(JSON.stringify({ available: true, mode: "docker" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ category: "SUCCESS", invocations: [{ category: "SUCCESS", output: 5 }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const capability = await getSecureCodingExecutionCapability({ environment });
    assert.deepEqual(capability, { available: true, mode: "remote" });
    const result = await runSecureMethodExecution(validRequest(), { environment });
    assert.equal(result.category, EXECUTION_CATEGORIES.SUCCESS);
    assert.deepEqual(result.invocations, [{ category: EXECUTION_CATEGORIES.SUCCESS, output: 5 }]);
    assert.ok(requests.every(({ options }) => options.headers.authorization === `Bearer ${environment.PRACTICE_RUNNER_TOKEN}`));
    assert.equal(requests.at(-1).url, "https://runner.example.test/execute-method");
    assert.doesNotMatch(requests.at(-1).options.body, /expectedOutput|passingPercentage|points/);
  } finally {
    global.fetch = previousFetch;
  }
});

test("local secure execution is restricted to the dedicated runner role", async () => {
  const capability = await getSecureCodingExecutionCapability({
    environment: {
      CODING_ASSESSMENT_EXECUTION_ENABLED: "true",
      CODING_ASSESSMENT_EXECUTION_MODE: "docker",
    },
    inspectSandbox: async () => ({ available: true }),
  });
  assert.deepEqual(capability, { available: false, code: "SECURE_RUNNER_REQUIRED" });
});

test("runner exposes authenticated fail-closed capability and method endpoints", async () => {
  const token = "secure-execution-route-token-at-least-32-characters";
  let received;
  const app = createPracticeRunnerApp({
    serviceToken: token,
    secureExecution: {
      getCapability: async () => ({ available: false, code: "SECURE_EXECUTION_DISABLED" }),
      execute: async (request) => { received = request; return { category: EXECUTION_CATEGORIES.SUCCESS, output: 5 }; },
    },
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  try {
    assert.equal((await fetch(`${baseUrl}/capabilities/assessment-coding`)).status, 401);
    const capabilityResponse = await fetch(`${baseUrl}/capabilities/assessment-coding`, { headers });
    assert.equal(capabilityResponse.status, 503);
    assert.deepEqual(await capabilityResponse.json(), { available: false, code: "SECURE_EXECUTION_DISABLED" });

    const methodResponse = await fetch(`${baseUrl}/execute-method`, {
      method: "POST",
      headers,
      body: JSON.stringify(validRequest()),
    });
    assert.equal(methodResponse.status, 200);
    assert.equal((await methodResponse.json()).category, EXECUTION_CATEGORIES.SUCCESS);
    assert.deepEqual(received, validRequest());
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
