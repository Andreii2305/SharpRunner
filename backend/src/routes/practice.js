const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const { createRateLimit } = require("../middleware/rateLimit");
const { getPracticeRunnerHealth, runPracticeCode } = require("../services/practiceRunnerService");

const router = express.Router();
const runnerFailureResponse = (error) => {
  const reason = [
    "runner_url_missing",
    "runner_url_invalid",
    "runner_token_missing",
    "runner_auth_failed",
    "runner_unreachable",
    "runner_timeout",
    "runner_http_error",
    "runtime_unavailable",
  ].includes(error.reason) ? error.reason : "runner_unreachable";

  if (reason === "runner_auth_failed" || reason === "runner_token_missing") {
    return {
      success: false,
      stdout: "",
      stderr: "The practice compiler could not authenticate with its execution service.",
      unavailable: true,
      errorType: "authentication",
      reason,
    };
  }
  if (reason === "runner_timeout") {
    return {
      success: false,
      stdout: "",
      stderr: "The practice compiler did not finish starting in time. Try again to wake it.",
      unavailable: true,
      errorType: "service_timeout",
      reason,
    };
  }
  return {
    success: false,
    stdout: "",
    stderr: "The practice compiler execution service is unavailable. You can continue reading the lesson and retry shortly.",
    unavailable: true,
    errorType: "service_unavailable",
    reason,
  };
};
const practiceRateLimit = createRateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => `practice:${req.userId}`,
  message: "You have run code many times in a short period. Wait a moment and try again.",
});

router.get("/health", authMiddleware, requireRole("student"), async (_req, res) => {
  const health = await getPracticeRunnerHealth();
  return res.status(health.available ? 200 : 503).json(health);
});

router.post("/run", authMiddleware, requireRole("student"), practiceRateLimit, async (req, res) => {
  try {
    const result = await runPracticeCode(req.body?.code);
    const status = result.rejected ? 400 : result.timedOut ? 408 : result.errorType === "rate_limit" ? 429 : 200;
    return res.status(status).json(result);
  } catch (error) {
    if (error.code === "RUNNER_UNAVAILABLE") {
      return res.status(503).json(runnerFailureResponse(error));
    }
    console.error("Practice runner failed", error);
    return res.status(500).json({ message: "The practice compiler encountered an internal error. Try again in a moment." });
  }
});

module.exports = router;
