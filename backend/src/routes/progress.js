const router = require("express").Router();
const UserProgress = require("../models/UserProgress");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const requireActiveClassMembership = require("../middleware/requireActiveClassMembership");
const {
  ensureProgressRowsForUser,
  buildProgressSummary,
  DEFAULT_LEVEL_PROGRESS,
} = require("../services/progressService");
const {
  findPrimaryActiveMembership,
  buildClassroomLeaderboard,
} = require("../services/studentClassService");

const LEVEL_KEYS = new Set(DEFAULT_LEVEL_PROGRESS.map((level) => level.levelKey));

const normalizeLevelKey = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const parseProgressValue = (value) => {
  if (value === undefined) {
    return { hasValue: false, value: null };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { hasValue: true, error: "progressPercent must be a number" };
  }

  if (parsed < 0 || parsed > 100) {
    return {
      hasValue: true,
      error: "progressPercent must be between 0 and 100",
    };
  }

  return {
    hasValue: true,
    value: Math.round(parsed),
  };
};

router.use(authMiddleware, requireActiveClassMembership);

const buildProgressPayloadForUser = async (userId) => {
  const rows = await ensureProgressRowsForUser(userId);
  let classRank = null;
  let classSize = null;

  const primaryMembership = await findPrimaryActiveMembership(userId);
  if (primaryMembership) {
    const leaderboardData = await buildClassroomLeaderboard({
      classroomId: primaryMembership.classroomId,
      currentUserId: userId,
      limit: null,
    });
    classRank = leaderboardData.currentUserRank;
    classSize = leaderboardData.classSize;
  }

  return buildProgressSummary(rows, { classRank, classSize });
};

router.get("/me", async (req, res) => {
  try {
    return res.json(await buildProgressPayloadForUser(req.userId));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/level/:levelKey", async (req, res) => {
  try {
    const body = req.body ?? {};
    const levelKey = normalizeLevelKey(req.params.levelKey);
    if (!LEVEL_KEYS.has(levelKey)) {
      return res.status(404).json({ message: "Unknown level key" });
    }

    const progressInput = parseProgressValue(body.progressPercent);
    if (progressInput.error) {
      return res.status(400).json({ message: progressInput.error });
    }

    if (
      body.isCompleted !== undefined &&
      typeof body.isCompleted !== "boolean"
    ) {
      return res.status(400).json({ message: "isCompleted must be a boolean" });
    }

    await ensureProgressRowsForUser(req.userId);

    const levelRow = await UserProgress.findOne({
      where: {
        userId: req.userId,
        levelKey,
      },
    });

    if (!levelRow) {
      return res.status(404).json({ message: "Progress row not found" });
    }

    const newProgress = progressInput.hasValue
      ? progressInput.value
      : levelRow.progressPercent;
    const completedFromBody = body.isCompleted;
    const isCompleted =
      typeof completedFromBody === "boolean"
        ? completedFromBody || newProgress === 100
        : levelRow.isCompleted || newProgress === 100;

    levelRow.progressPercent = isCompleted ? 100 : newProgress;
    levelRow.isCompleted = isCompleted;
    levelRow.completedAt = isCompleted
      ? levelRow.completedAt ?? new Date()
      : null;

    await levelRow.save();

    return res.json(await buildProgressPayloadForUser(req.userId));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/activity", async (req, res) => {
  try {
    const isPlayingGame = req.body?.isPlayingGame;
    if (typeof isPlayingGame !== "boolean") {
      return res.status(400).json({ message: "isPlayingGame must be a boolean" });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isPlayingGame = isPlayingGame;
    user.lastGameHeartbeatAt = new Date();
    await user.save();

    return res.json({
      message: "Activity updated",
      isPlayingGame: user.isPlayingGame,
      lastGameHeartbeatAt: user.lastGameHeartbeatAt,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
