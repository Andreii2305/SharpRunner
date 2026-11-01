const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  buildWorkerEnvironment,
  emitWorkerCompletionAcknowledgement,
  runPostgresWorker,
} = require("./support/postgresWorkerHarness");

const FIXTURE_ENV = "PHASE7G_POSTGRES_HARNESS_FIXTURE";
const MODE_ENV = "PHASE7G_POSTGRES_HARNESS_MODE";
const SUITE_ID = "phase7g-harness-fixture";
const EXPECTED_SCENARIOS = Object.freeze(["first-scenario", "second-scenario"]);

if (process.env[FIXTURE_ENV] === "1") {
  test("database-free PostgreSQL worker fixture", () => {
    const mode = process.env[MODE_ENV];
    if (mode === "assertion-failure") {
      assert.fail("deliberate child assertion failure");
    }
    if (mode === "missing-acknowledgement") return;
    if (mode === "incomplete-acknowledgement") {
      emitWorkerCompletionAcknowledgement({
        suiteId: SUITE_ID,
        scenarios: [{ id: EXPECTED_SCENARIOS[0], status: "passed" }],
      });
      return;
    }
    if (mode === "skipped-acknowledgement") {
      emitWorkerCompletionAcknowledgement({
        suiteId: SUITE_ID,
        scenarios: [
          { id: EXPECTED_SCENARIOS[0], status: "passed" },
          { id: EXPECTED_SCENARIOS[1], status: "skipped" },
        ],
      });
      return;
    }
    assert.equal(mode, "success");
    emitWorkerCompletionAcknowledgement({
      suiteId: SUITE_ID,
      scenarios: EXPECTED_SCENARIOS.map((id) => ({ id, status: "passed" })),
    });
  });
} else {
  const runFixture = (mode) => runPostgresWorker({
    scriptPath: __filename,
    suiteId: SUITE_ID,
    expectedScenarioIds: EXPECTED_SCENARIOS,
    environment: {
      [FIXTURE_ENV]: "1",
      [MODE_ENV]: mode,
    },
    redactDiagnostics: (value) => value,
  });

  test("worker launch executes every scenario and validates its run-specific acknowledgement", async () => {
    const result = await runFixture("success");
    assert.equal(result.acknowledgement.suiteId, SUITE_ID);
    assert.deepEqual(
      result.acknowledgement.scenarios,
      EXPECTED_SCENARIOS.map((id) => ({ id, status: "passed" })),
    );
  });

  test("worker launch rejects exit zero without a completion acknowledgement", async () => {
    await assert.rejects(
      runFixture("missing-acknowledgement"),
      /completion acknowledgement/i,
    );
  });

  test("worker launch rejects incomplete or skipped scenario acknowledgements", async () => {
    await assert.rejects(
      runFixture("incomplete-acknowledgement"),
      /scenario acknowledgement/i,
    );
    await assert.rejects(
      runFixture("skipped-acknowledgement"),
      /scenario acknowledgement/i,
    );
  });

  test("worker launch rejects a child assertion failure with diagnostics", async () => {
    await assert.rejects(
      runFixture("assertion-failure"),
      (error) => (
        /exited with code 1/i.test(error.message)
        && /deliberate child assertion failure/i.test(error.message)
      ),
    );
  });

  test("worker environment removes only inherited Node test context", () => {
    const environment = buildWorkerEnvironment({
      NODE_TEST_CONTEXT: "child-v8",
      KEEP_EXISTING: "kept",
    }, {
      ADD_OVERRIDE: "added",
    });
    assert.equal(Object.hasOwn(environment, "NODE_TEST_CONTEXT"), false);
    assert.equal(environment.KEEP_EXISTING, "kept");
    assert.equal(environment.ADD_OVERRIDE, "added");
  });
}
