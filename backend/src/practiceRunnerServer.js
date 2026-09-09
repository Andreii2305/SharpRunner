const crypto = require("crypto");
const express = require("express");
const { getPracticeRunnerHealth, runPracticeCode } = require("./services/practiceRunnerService");

// This process is the remote sandbox receiver, never a client of itself.
delete process.env.PRACTICE_RUNNER_URL;

const serviceToken = process.env.PRACTICE_RUNNER_TOKEN;
if (!serviceToken || serviceToken.length < 32) {
  throw new Error("PRACTICE_RUNNER_TOKEN must be set to at least 32 characters");
}

const tokenMatches = (authorization = "") => {
  const supplied = Buffer.from(authorization.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(serviceToken);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
};

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use((req, res, next) => {
  if (!tokenMatches(req.get("authorization"))) return res.status(401).json({ message: "Unauthorized" });
  return next();
});

app.get("/health", async (_req, res) => {
  const health = await getPracticeRunnerHealth();
  return res.status(health.available ? 200 : 503).json(health);
});

app.post("/run", async (req, res) => {
  try {
    // Limits come from this service's environment, not from request-controlled values.
    const result = await runPracticeCode(req.body?.code);
    const status = result.rejected ? 400 : result.timedOut ? 408 : 200;
    return res.status(status).json(result);
  } catch (error) {
    if (error.code === "RUNNER_UNAVAILABLE") return res.status(503).json({ message: "Runner unavailable" });
    console.error("Isolated practice runner failed", error);
    return res.status(500).json({ message: "Runner error" });
  }
});

app.use((_req, res) => res.status(404).json({ message: "Not found" }));

const port = Number(process.env.PRACTICE_RUNNER_PORT || process.env.PORT) || 5050;
app.listen(port, "0.0.0.0", () => console.log(`Practice runner listening on port ${port}`));
