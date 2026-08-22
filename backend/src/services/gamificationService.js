const sequelize = require("../config/database");
const User = require("../models/User");
const XpTransaction = require("../models/XpTransaction");
const { XP_REWARDS } = require("../constants/gamificationConfig");

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

module.exports = { buildCompletionXp, awardFirstCompletionXp };
