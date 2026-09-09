const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const { createRateLimit } = require("../middleware/rateLimit");
const { getPracticeRunnerHealth, runPracticeCode } = require("../services/practiceRunnerService");

const router = express.Router();
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
    const status = result.rejected ? 400 : result.timedOut ? 408 : 200;
    return res.status(status).json(result);
  } catch (error) {
    if (error.code === "RUNNER_UNAVAILABLE") {
      return res.status(503).json({ message: "Practice compiler is temporarily unavailable. You can still continue reading the lesson." });
    }
    console.error("Practice runner failed", error);
    return res.status(500).json({ message: "The practice compiler encountered an internal error. Try again in a moment." });
  }
});

module.exports = router;
