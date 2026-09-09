const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const { createRateLimit } = require("../middleware/rateLimit");
const { runPracticeCode } = require("../services/practiceRunnerService");

const router = express.Router();
const practiceRateLimit = createRateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => `practice:${req.userId}`,
  message: "You have run code many times in a short period. Wait a moment and try again.",
});

router.post("/run", authMiddleware, requireRole("student"), practiceRateLimit, async (req, res) => {
  try {
    const result = await runPracticeCode(req.body?.code);
    return res.status(result.rejected ? 400 : 200).json(result);
  } catch (error) {
    if (error.code === "RUNNER_UNAVAILABLE") {
      return res.status(503).json({ message: "Practice compiler is temporarily unavailable. You can still continue reading the lesson." });
    }
    console.error("Practice runner failed", error);
    return res.status(503).json({ message: "Practice compiler is temporarily unavailable. You can still continue reading the lesson." });
  }
});

module.exports = router;
