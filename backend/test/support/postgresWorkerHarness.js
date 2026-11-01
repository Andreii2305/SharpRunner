const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ACKNOWLEDGEMENT_PREFIX = "PHASE7G_POSTGRES_WORKER_COMPLETE ";
const RUN_ID_ENV = "PHASE7G_POSTGRES_WORKER_RUN_ID";

const buildWorkerEnvironment = (baseEnvironment = process.env, overrides = {}) => {
  const environment = {
    ...baseEnvironment,
    ...overrides,
  };
  delete environment.NODE_TEST_CONTEXT;
  return environment;
};

const emitWorkerCompletionAcknowledgement = ({ suiteId, scenarios }) => {
  const runId = process.env[RUN_ID_ENV];
  if (!runId) {
    throw new Error("PostgreSQL worker run identity is missing");
  }
  process.stdout.write(`${ACKNOWLEDGEMENT_PREFIX}${JSON.stringify({
    version: 1,
    runId,
    suiteId,
    scenarios,
  })}\n`);
};

const extractAcknowledgement = ({
  output,
  runId,
  suiteId,
  expectedScenarioIds,
}) => {
  const acknowledgementLines = String(output)
    .split(/\r?\n/u)
    .map((line) => {
      const prefixIndex = line.indexOf(ACKNOWLEDGEMENT_PREFIX);
      return prefixIndex === -1
        ? null
        : line.slice(prefixIndex + ACKNOWLEDGEMENT_PREFIX.length);
    })
    .filter((line) => line !== null);

  if (acknowledgementLines.length !== 1) {
    throw new Error(
      `PostgreSQL worker completion acknowledgement count was ${acknowledgementLines.length}, expected 1`,
    );
  }

  let acknowledgement;
  try {
    acknowledgement = JSON.parse(acknowledgementLines[0]);
  } catch {
    throw new Error("PostgreSQL worker completion acknowledgement was malformed");
  }

  if (
    acknowledgement?.version !== 1
    || acknowledgement?.runId !== runId
    || acknowledgement?.suiteId !== suiteId
  ) {
    throw new Error("PostgreSQL worker completion acknowledgement identity did not match the launch");
  }

  const expectedScenarios = expectedScenarioIds.map((id) => ({ id, status: "passed" }));
  if (JSON.stringify(acknowledgement.scenarios) !== JSON.stringify(expectedScenarios)) {
    throw new Error("PostgreSQL worker scenario acknowledgement was incomplete, skipped, or mismatched");
  }

  return acknowledgement;
};

const runPostgresWorker = ({
  scriptPath,
  suiteId,
  expectedScenarioIds,
  environment = {},
  redactDiagnostics = (value) => String(value),
}) => new Promise((resolve, reject) => {
  const runId = crypto.randomUUID();
  const child = spawn(process.execPath, [
    "--test",
    "--test-concurrency=1",
    scriptPath,
  ], {
    env: buildWorkerEnvironment(process.env, {
      ...environment,
      [RUN_ID_ENV]: runId,
    }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.once("error", (error) => {
    reject(new Error(`PostgreSQL worker launch failed: ${redactDiagnostics(error.message)}`));
  });
  child.once("close", (exitCode, signal) => {
    const diagnostics = redactDiagnostics(`${stdout}\n${stderr}`).trim();
    if (exitCode !== 0) {
      reject(new Error(
        `PostgreSQL worker exited with code ${exitCode}${signal ? ` and signal ${signal}` : ""}`
        + (diagnostics ? `\n${diagnostics}` : ""),
      ));
      return;
    }

    try {
      const acknowledgement = extractAcknowledgement({
        output: stdout,
        runId,
        suiteId,
        expectedScenarioIds,
      });
      resolve({ acknowledgement });
    } catch (error) {
      reject(new Error(
        `${error.message}${diagnostics ? `\n${diagnostics}` : ""}`,
      ));
    }
  });
});

module.exports = {
  ACKNOWLEDGEMENT_PREFIX,
  RUN_ID_ENV,
  buildWorkerEnvironment,
  emitWorkerCompletionAcknowledgement,
  runPostgresWorker,
};
