const crypto = require("crypto");
const express = require("express");
const { getPracticeRunnerDiagnostic, runPracticeCode } = require("./services/practiceRunnerService");

// This process is the remote sandbox receiver, never a client of itself.
delete process.env.PRACTICE_RUNNER_URL;

const createPracticeRunnerApp = ({ serviceToken = process.env.PRACTICE_RUNNER_TOKEN } = {}) => {
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
  app.use(express.json({ limit: "20kb" }));

  const sendHealth = async (_req, res) => {
    const diagnostic = await getPracticeRunnerDiagnostic();
    return res.status(diagnostic.available ? 200 : 503).json({ status: diagnostic.available ? "ok" : "error", dotnet: diagnostic.available });
  };

  // Render cannot attach an Authorization header to health checks. This route
  // exposes only readiness; execution and the authenticated probe stay protected.
  app.get("/health", sendHealth);
  app.use((req, res, next) => {
    if (!tokenMatches(req.get("authorization"))) return res.status(401).json({ message: "Unauthorized" });
    return next();
  });
  app.get("/health/auth", sendHealth);

  app.post("/run", async (req, res) => {
    if (activeRuns >= maxConcurrentRuns) return res.status(429).json({ message: "Runner is busy" });
    activeRuns += 1;
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
