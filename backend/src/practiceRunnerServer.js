const crypto = require("crypto");
const express = require("express");
const {
  compilePracticeCode,
  getPracticeRunnerDiagnostic,
  runPracticeCode,
} = require("./services/practiceRunnerService");
const {
  getSecureCodingExecutionCapability,
  runSecureMethodExecution,
} = require("./services/secureCodingExecutionService");
const { EXECUTION_CATEGORIES } = require("./services/secureCodingExecutionContract");

// This process is the remote sandbox receiver, never a client of itself.
delete process.env.PRACTICE_RUNNER_URL;

const createPracticeRunnerApp = ({
  serviceToken = process.env.PRACTICE_RUNNER_TOKEN,
  secureExecution = {
    getCapability: getSecureCodingExecutionCapability,
    execute: runSecureMethodExecution,
  },
} = {}) => {
  const normalizedToken = String(serviceToken || "").trim();
  if (normalizedToken.length < 32) throw new Error("PRACTICE_RUNNER_TOKEN must be set to at least 32 characters");

  const tokenMatches = (authorization = "") => {
    const supplied = Buffer.from(authorization.replace(/^Bearer\s+/i, "").trim());
    const expected = Buffer.from(normalizedToken);
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  };

  const app = express();
  const maxConcurrentRuns = Math.max(1, Number(process.env.PRACTICE_RUNNER_MAX_CONCURRENT) || 1);
  let activeRuns = 0;
  app.disable("x-powered-by");
  app.use(express.json({ limit: "110kb" }));

  const sendReadiness = async (_req, res) => {
    const diagnostic = await getPracticeRunnerDiagnostic();
    return res.status(diagnostic.available ? 200 : 503).json({
      status: diagnostic.available ? "ok" : "error",
      compilerAvailable: diagnostic.available,
      // Retained for compatibility with API instances deployed before this field
      // was named explicitly.
      dotnet: diagnostic.available,
      ...(diagnostic.sdkVersion ? { sdkVersion: diagnostic.sdkVersion } : {}),
      ...(diagnostic.compilerMode ? { compilerMode: diagnostic.compilerMode } : {}),
      ...(diagnostic.targetFramework ? { targetFramework: diagnostic.targetFramework } : {}),
    });
  };

  // Render liveness must be constant-time and must never contact the compiler.
  // Authenticated readiness uses the compiler host's lightweight health command;
  // it does not perform a sample compilation.
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use((req, res, next) => {
    if (!tokenMatches(req.get("authorization"))) return res.status(401).json({ message: "Unauthorized" });
    return next();
  });
  app.get("/ready", sendReadiness);
  app.get("/health/auth", sendReadiness);

  app.get("/capabilities/assessment-coding", async (_req, res) => {
    const capability = await secureExecution.getCapability();
    return res.status(capability.available ? 200 : 503).json(capability);
  });

  app.post("/execute-method", async (req, res) => {
    if (activeRuns >= maxConcurrentRuns) {
      res.set("Retry-After", "5");
      return res.status(429).json({ category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR, code: "RUNNER_BUSY", message: "Secure coding execution is temporarily unavailable." });
    }
    activeRuns += 1;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    req.once("aborted", cancel);
    try {
      const result = await secureExecution.execute(req.body, { signal: controller.signal });
      const status = result.code === "SECURE_EXECUTION_UNAVAILABLE" ? 503
        : result.category === EXECUTION_CATEGORIES.POLICY_REJECTION ? 400
          : result.category === EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR ? 503
            : 200;
      return res.status(status).json(result);
    } catch {
      console.error("Secure method execution failed");
      return res.status(503).json({ category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR, code: "SECURE_EXECUTION_UNAVAILABLE", message: "Secure coding execution is unavailable." });
    } finally {
      req.off("aborted", cancel);
      activeRuns -= 1;
    }
  });

  app.post("/compile", async (req, res) => {
    if (activeRuns >= maxConcurrentRuns) {
      res.set("Retry-After", "5");
      return res.status(429).json({ success: false, code: "PRACTICE_RUNNER_BUSY", message: "The compiler is busy. Please try again in a moment." });
    }
    activeRuns += 1;
    try {
      const result = await compilePracticeCode(req.body?.code, {
        outputLimit: Number(req.body?.outputLimit) || undefined,
      });
      const status = result.timedOut ? 408 : 200;
      return res.status(status).json(result);
    } catch (error) {
      if (error.code === "RUNNER_UNAVAILABLE") return res.status(503).json({ message: "Runner unavailable" });
      console.error("Isolated compilation failed", error);
      return res.status(500).json({ message: "Compiler error" });
    } finally {
      activeRuns -= 1;
    }
  });

  app.post("/run", async (req, res) => {
    if (activeRuns >= maxConcurrentRuns) {
      console.info(`Practice runner busy rejection (activeRuns=${activeRuns}, maxConcurrentRuns=${maxConcurrentRuns})`);
      res.set("Retry-After", "5");
      return res.status(429).json({ success: false, code: "PRACTICE_RUNNER_BUSY", message: "The compiler is busy. Please try again in a moment.", retryAfterMs: 5000 });
    }
    activeRuns += 1;
    const startedAt = Date.now();
    console.info(`Practice run started (activeRuns=${activeRuns})`);
    try {
      const result = await runPracticeCode(req.body?.code);
      const status = result.rejected ? 400 : result.timedOut ? 408 : 200;
      return res.status(status).json(result);
    } catch (error) {
      if (error.code === "RUNNER_UNAVAILABLE") return res.status(503).json({ message: "Runner unavailable" });
      console.error("Isolated practice runner failed", error);
      return res.status(500).json({ message: "Runner error" });
    } finally {
      activeRuns -= 1;
      console.info(`Practice run finished (durationMs=${Date.now() - startedAt}, activeRuns=${activeRuns})`);
    }
  });
  app.use((_req, res) => res.status(404).json({ message: "Not found" }));
  return app;
};

const startPracticeRunner = () => {
  const port = Number(process.env.PRACTICE_RUNNER_PORT || process.env.PORT) || 5050;
  return createPracticeRunnerApp().listen(port, "0.0.0.0", async () => {
    const diagnostic = await getPracticeRunnerDiagnostic();
    console.log("Practice runner ready");
    console.log(`.NET SDK: ${diagnostic.available ? diagnostic.sdkVersion || "available" : "unavailable"}`);
    console.log(`Target: ${process.env.PRACTICE_DOTNET_TARGET || "net8.0"}`);
    console.log(`Port: ${port}`);
    if (!diagnostic.available) console.error(`Practice compiler runtime unavailable: ${diagnostic.reason}`);
  });
};

if (require.main === module) startPracticeRunner();

module.exports = { createPracticeRunnerApp, startPracticeRunner };
