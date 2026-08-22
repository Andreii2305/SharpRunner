const sequelize = require("../config/database");
const User = require("../models/User");
const UserProgress = require("../models/UserProgress");
const XpTransaction = require("../models/XpTransaction");
const {
  XP_REWARDS,
  DETAILED_HINT_XP_COST,
} = require("../constants/gamificationConfig");

class GamificationError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = "GamificationError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const buildCompletionXp = ({ attemptCount = 0, hintUsed = false } = {}) => {
  const breakdown = [
    { key: "levelCompletion", label: "Level completion", amount: XP_REWARDS.levelCompletion },
  ];
  if (Number(attemptCount) === 0) {
    breakdown.push({ key: "firstAttemptBonus", label: "First-attempt bonus", amount: XP_REWARDS.firstAttemptBonus });
  }
  if (!hintUsed) {
    breakdown.push({ key: "noHintBonus", label: "No-hint bonus", amount: XP_REWARDS.noHintBonus });
  }
  return {
    breakdown,
    total: breakdown.reduce((sum, item) => sum + item.amount, 0),
  };
};

const awardFirstCompletionXp = async ({ userId, levelKey, attemptCount, hintUsed }) =>
  sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(userId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user) throw new Error("User not found while awarding XP");

    const existing = await XpTransaction.findOne({
      where: {
        userId,
        kind: "level_completion",
        referenceType: "level",
        referenceId: levelKey,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (existing) {
      return {
        awarded: false,
        amount: 0,
        totalXp: Math.max(0, Number(user.xpTotal) || 0),
        breakdown: [],
      };
    }

    const reward = buildCompletionXp({ attemptCount, hintUsed });
    await XpTransaction.create({
      userId,
      amount: reward.total,
      kind: "level_completion",
      referenceType: "level",
      referenceId: levelKey,
      metadata: { attemptCount, hintUsed, breakdown: reward.breakdown },
    }, { transaction });

    user.xpTotal = Math.max(0, Number(user.xpTotal) || 0) + reward.total;
    await user.save({ transaction });
    return {
      awarded: true,
      amount: reward.total,
      totalXp: user.xpTotal,
      breakdown: reward.breakdown,
    };
  });

const purchaseDetailedHint = async ({
  userId,
  levelKey,
  hintsEnabled,
  hintUnlockThreshold,
}) => sequelize.transaction(async (transaction) => {
  const user = await User.findByPk(userId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!user) {
    throw new GamificationError("USER_NOT_FOUND", "User not found", 404);
  }
  if (user.role !== "student") {
    throw new GamificationError(
      "STUDENT_ONLY",
      "Detailed hints are available to students.",
      403,
    );
  }

  const progress = await UserProgress.findOne({
    where: { userId, levelKey },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!progress) {
    throw new GamificationError("PROGRESS_NOT_FOUND", "Progress row not found", 404);
  }
  if (!hintsEnabled) {
    throw new GamificationError(
      "HINTS_DISABLED",
      "Hints are disabled by your teacher.",
      403,
    );
  }

  const threshold = Math.max(1, Number(hintUnlockThreshold) || 1);
  const attemptCount = Math.max(0, Number(progress.attemptCount) || 0);
  if (attemptCount < threshold) {
    throw new GamificationError(
      "HINT_LOCKED",
      `Hints unlock after ${threshold} failed attempts.`,
      403,
      { hintUnlockThreshold: threshold, attemptsRemaining: threshold - attemptCount },
    );
  }

  const currentXp = Math.max(0, Number(user.xpTotal) || 0);
  if (progress.detailedHintUnlocked) {
    return {
      purchased: false,
      alreadyUnlocked: true,
      xpCost: Number(progress.detailedHintXpCost) || DETAILED_HINT_XP_COST,
      totalXp: currentXp,
      progress,
    };
  }
  if (currentXp < DETAILED_HINT_XP_COST) {
    throw new GamificationError(
      "INSUFFICIENT_XP",
      `You need ${DETAILED_HINT_XP_COST} XP to unlock the detailed hint.`,
      409,
      { currentXp, requiredXp: DETAILED_HINT_XP_COST },
    );
  }

  const purchasedAt = new Date();
  await XpTransaction.create({
    userId,
    amount: -DETAILED_HINT_XP_COST,
    kind: "detailed_hint_purchase",
    referenceType: "level",
    referenceId: levelKey,
    metadata: { xpCost: DETAILED_HINT_XP_COST, attemptCount },
  }, { transaction });

  user.xpTotal = currentXp - DETAILED_HINT_XP_COST;
  progress.detailedHintUnlocked = true;
  progress.detailedHintPurchasedAt = purchasedAt;
  progress.detailedHintUsedAt = purchasedAt;
  progress.detailedHintXpCost = DETAILED_HINT_XP_COST;
  progress.hintUsed = true;
  progress.hintUsedAt = progress.hintUsedAt ?? purchasedAt;
  progress.hintType = "detailed";
  progress.attemptCountAtHintUnlock =
    progress.attemptCountAtHintUnlock ?? attemptCount;

  await user.save({ transaction });
  await progress.save({ transaction });

  return {
    purchased: true,
    alreadyUnlocked: false,
    xpCost: DETAILED_HINT_XP_COST,
    totalXp: user.xpTotal,
    progress,
  };
});

module.exports = {
  GamificationError,
  buildCompletionXp,
  awardFirstCompletionXp,
  purchaseDetailedHint,
};
