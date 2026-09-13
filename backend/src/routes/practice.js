const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const { createRateLimit } = require("../middleware/rateLimit");
const { getPracticeRunnerHealth, runPracticeCode } = require("../services/practiceRunnerService");

const router = express.Router();
const RETRY_AFTER_MS = 5_000;
const runnerFailureResponse = (error) => {
  const reason = [
    "runner_url_missing",
    "runner_url_invalid",
    "runner_token_missing",
    "runner_auth_failed",
    "runner_unreachable",
    "runner_starting",
    "runner_timeout",
    "runner_http_error",
    "runtime_unavailable",
  ].includes(error.reason) ? error.reason : "runner_unreachable";

  if (reason === "runner_starting") {
    return {
      success: false,
      code: "PRACTICE_RUNNER_STARTING",
      message: "The compiler is starting. Please try again shortly.",
      stdout: "",
      stderr: "The compiler is starting. Please try again in a few seconds.",
      unavailable: true,
      errorType: "service_starting",
      reason,
      retryAfterMs: RETRY_AFTER_MS,
    };
  }

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
      stderr: "The practice compiler did not respond in time. Please try again.",
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
  if (!health.available && health.reason === "runner_starting") {
    res.set("Retry-After", String(RETRY_AFTER_MS / 1000));
    return res.status(503).json({ ...health, code: "PRACTICE_RUNNER_STARTING", retryAfterMs: RETRY_AFTER_MS });
  }
  return res.status(health.available ? 200 : 503).json(health);
});

router.post("/run", authMiddleware, requireRole("student"), practiceRateLimit, async (req, res) => {
  const startedAt = Date.now();
  try {
    const result = await runPracticeCode(req.body?.code);
    const status = result.rejected ? 400 : result.timedOut ? 408 : ["rate_limit", "runner_busy"].includes(result.errorType) ? 429 : 200;
    if (status === 429) res.set("Retry-After", String((result.retryAfterMs || RETRY_AFTER_MS) / 1000));
    return res.status(status).json(result);
  } catch (error) {
    if (error.code === "RUNNER_UNAVAILABLE") {
      const payload = runnerFailureResponse(error);
      if (payload.retryAfterMs) res.set("Retry-After", String(payload.retryAfterMs / 1000));
      return res.status(503).json(payload);
    }
    console.error("Practice runner failed", error);
    return res.status(500).json({ message: "The practice compiler encountered an internal error. Try again in a moment." });
  } finally {
    console.info(`Practice API request finished (durationMs=${Date.now() - startedAt})`);
  }
});

module.exports = router;
