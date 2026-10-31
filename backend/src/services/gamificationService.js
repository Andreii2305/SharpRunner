const { Op } = require("sequelize");
const sequelize = require("../config/database");
const GameInterruptionCompletionEvidence = require("../models/GameInterruptionCompletionEvidence");
const User = require("../models/User");
const UserProgress = require("../models/UserProgress");
const XpTransaction = require("../models/XpTransaction");
const {
  XP_REWARDS,
  DETAILED_HINT_XP_COST,
} = require("../constants/gamificationConfig");
const { PLAYABLE_LEVEL_KEYS } = require("../constants/progressDefaults");
const { recordHintUsed } = require("./learningAnalyticsEventService");

const playableLevelKeys = new Set(PLAYABLE_LEVEL_KEYS);
const MAX_INTEGER = 2147483647;

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

const plain = (record) => (
  typeof record?.get === "function" ? record.get({ plain: true }) : record
);

const positiveInteger = (value) => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const failXpIntegrity = () => {
  throw new GamificationError(
    "XP_AWARD_INTEGRITY_ERROR",
    "Completion XP could not be processed",
    409,
  );
};

const isXpAwardUniqueError = (error) => {
  if (error?.name !== "SequelizeUniqueConstraintError") return false;
  const evidence = [
    error.constraint,
    error.parent?.constraint,
    error.original?.constraint,
    error.index,
    ...Object.keys(error.fields || {}),
    ...(error.errors || []).flatMap((item) => [item.path, item.constraint]),
  ].filter(Boolean).join(" ").toLowerCase();
  return evidence.includes("xp_transactions_completion_evidence")
    || evidence.includes("xp_transactions_reward_once")
    || (evidence.includes("completionevidenceid"))
    || (evidence.includes("userid")
      && evidence.includes("kind")
      && evidence.includes("referencetype")
      && evidence.includes("referenceid"));
};

const createEvidenceAwareCompletionXpAwarder = ({
  database = sequelize,
  models = { GameInterruptionCompletionEvidence, XpTransaction },
  now = () => new Date(),
} = {}) => {
  /**
   * Awards completion XP from immutable evidence inside locks owned by the
   * caller. The caller must supply the exact locked User and UserProgress
   * records and an open transaction. This function never opens or commits an
   * outer transaction and never derives an amount from client input.
   */
  const awardCompletionXpFromEvidence = async ({
    userId: userIdInput,
    levelKey: levelKeyInput,
    completionEvidenceId: evidenceIdInput,
    user,
    progress,
  } = {}, { transaction } = {}) => {
    if (!transaction || typeof transaction !== "object" || transaction.finished) {
      throw new TypeError("Evidence-aware XP requires a caller-owned transaction");
    }
    const userId = positiveInteger(userIdInput);
    const completionEvidenceId = positiveInteger(evidenceIdInput);
    const levelKey = typeof levelKeyInput === "string" ? levelKeyInput : "";
    const lockedUser = plain(user);
    const lockedProgress = plain(progress);
    if (!userId || !completionEvidenceId || !playableLevelKeys.has(levelKey)
      || Number(lockedUser?.id) !== userId
      || lockedUser?.role !== "student"
      || lockedUser?.status !== "active"
      || Number(lockedProgress?.userId) !== userId
      || lockedProgress?.levelKey !== levelKey
      || lockedProgress?.isCompleted !== true) {
      throw new TypeError("Invalid locked XP context");
    }

    const evidenceRecord = await models.GameInterruptionCompletionEvidence.findOne({
      where: { id: completionEvidenceId, studentId: userId, levelKey },
      transaction,
    });
    if (!evidenceRecord) failXpIntegrity();
    const evidence = plain(evidenceRecord);
    const grossAmount = Number(evidence.grossCompletionXp);
    const deductionAmount = Number(evidence.xpDeduction);
    const netAmount = Number(evidence.netCompletionXp);
    if (Number(evidence.id) !== completionEvidenceId
      || Number(evidence.studentId) !== userId
      || evidence.levelKey !== levelKey
      || !Number.isSafeInteger(grossAmount)
      || !Number.isSafeInteger(deductionAmount)
      || !Number.isSafeInteger(netAmount)
      || grossAmount < 0
      || deductionAmount < 0
      || netAmount < 0
      || grossAmount > MAX_INTEGER
      || deductionAmount > MAX_INTEGER
      || netAmount > MAX_INTEGER
      || grossAmount - deductionAmount !== netAmount) {
      failXpIntegrity();
    }

    const breakdown = [
      { key: "grossCompletionXp", label: "Gross completion XP", amount: grossAmount },
      {
        key: "interruptionDeduction",
        label: "Interruption deduction",
        amount: deductionAmount === 0 ? 0 : -deductionAmount,
      },
    ];
    const completionAward = {
      evidenceId: completionEvidenceId,
      grossAmount,
      deductionAmount,
      netAmount,
      breakdown,
    };
    const currentXp = Number(lockedUser.xpTotal);
    const recordedProgressXp = Number(lockedProgress.xpAwarded);
    if (!Number.isSafeInteger(currentXp) || currentXp < 0 || currentXp > MAX_INTEGER
      || !Number.isSafeInteger(recordedProgressXp) || recordedProgressXp < 0) {
      failXpIntegrity();
    }

    const findExistingAwards = () => models.XpTransaction.findAll({
      where: {
        [Op.or]: [
          { completionEvidenceId },
          {
            userId,
            kind: "level_completion",
            referenceType: "level",
            referenceId: levelKey,
          },
        ],
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const validateExistingAward = (records) => {
      if (records.length === 0) return null;
      if (records.length !== 1 || netAmount <= 0) failXpIntegrity();
      const existing = plain(records[0]);
      if (Number(existing.userId) !== userId
        || Number(existing.amount) !== netAmount
        || existing.kind !== "level_completion"
        || existing.referenceType !== "level"
        || existing.referenceId !== levelKey
        || Number(existing.completionEvidenceId) !== completionEvidenceId
        || lockedProgress.xpAwardedAt == null
        || recordedProgressXp !== netAmount) {
        failXpIntegrity();
      }
      return existing;
    };
    const retryResult = () => ({
      changed: false,
      xpGrantedNow: 0,
      totalXp: currentXp,
      processedAt: lockedProgress.xpAwardedAt,
      completionAward,
    });

    const initialAwards = await findExistingAwards();
    if (validateExistingAward(initialAwards)) return retryResult();
    if (lockedProgress.xpAwardedAt != null) {
      if (netAmount === 0 && recordedProgressXp === 0) return retryResult();
      failXpIntegrity();
    }
    if (recordedProgressXp !== 0) failXpIntegrity();

    const processedAt = now();
    if (!(processedAt instanceof Date) || Number.isNaN(processedAt.getTime())) {
      failXpIntegrity();
    }
    if (netAmount === 0) {
      progress.xpAwarded = 0;
      progress.xpAwardedAt = processedAt;
      await progress.save({ transaction });
      return {
        changed: true,
        xpGrantedNow: 0,
        totalXp: currentXp,
        processedAt,
        completionAward,
      };
    }
    if (currentXp + netAmount > MAX_INTEGER) failXpIntegrity();

    try {
      await database.transaction({ transaction }, (savepoint) => (
        models.XpTransaction.create({
          userId,
          amount: netAmount,
          kind: "level_completion",
          referenceType: "level",
          referenceId: levelKey,
          completionEvidenceId,
          metadata: {
            completionEvidenceId,
            policyVersion: evidence.policyVersion,
            grossCompletionXp: grossAmount,
            interruptionXpDeduction: deductionAmount,
            netCompletionXp: netAmount,
            breakdown,
          },
        }, { transaction: savepoint })
      ));
    } catch (error) {
      if (!isXpAwardUniqueError(error)) throw error;
      // The insert savepoint has rolled back. Inspect the winner only through
      // the usable parent transaction and never relink an existing ledger.
      const recovered = await findExistingAwards();
      if (!validateExistingAward(recovered)) throw error;
      return retryResult();
    }

    user.xpTotal = currentXp + netAmount;
    progress.xpAwarded = netAmount;
    progress.xpAwardedAt = processedAt;
    await user.save({ transaction });
    await progress.save({ transaction });
    return {
      changed: true,
      xpGrantedNow: netAmount,
      totalXp: user.xpTotal,
      processedAt,
      completionAward,
    };
  };

  return awardCompletionXpFromEvidence;
};

const awardCompletionXpFromEvidence = createEvidenceAwareCompletionXpAwarder();

const awardFirstCompletionXp = async (
  { userId, levelKey, attemptCount, hintUsed },
  { transaction: existingTransaction = null } = {},
) => {
  const award = async (transaction) => {
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
  };
  return existingTransaction ? award(existingTransaction) : sequelize.transaction(award);
};

const purchaseDetailedHint = async ({
  userId,
  classroomId = null,
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
  if (progress.isCompleted) {
    throw new GamificationError(
      "LEVEL_ALREADY_COMPLETED",
      "Completed-level replay does not change academic hint history.",
      409,
    );
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
      xpCost: progress.detailedHintXpCost == null
        ? DETAILED_HINT_XP_COST
        : Number(progress.detailedHintXpCost),
      totalXp: currentXp,
      progress,
    };
  }
  if (currentXp < DETAILED_HINT_XP_COST) {
    throw new GamificationError(
      "INSUFFICIENT_XP",
      `You need ${DETAILED_HINT_XP_COST} XP to unlock the detailed hint. Current XP: ${currentXp}.`,
      409,
      {
        currentXp,
        requiredXp: DETAILED_HINT_XP_COST,
        shortageXp: DETAILED_HINT_XP_COST - currentXp,
      },
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
  progress.detailedHintAttemptCount = attemptCount;
  progress.hintUsed = true;
  progress.hintUsedAt = progress.hintUsedAt ?? purchasedAt;
  progress.hintType = "detailed";
  progress.attemptCountAtHintUnlock =
    progress.attemptCountAtHintUnlock ?? attemptCount;

  await user.save({ transaction });
  await progress.save({ transaction });
  await recordHintUsed({
    studentId: userId,
    classroomId,
    levelKey,
    hintType: "detailed",
    hintPurchased: true,
    hintXpCost: DETAILED_HINT_XP_COST,
    attemptNumber: attemptCount,
    failureCategory: progress.latestFailureCategory ?? null,
    occurredAt: purchasedAt,
  }, { transaction });

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
  createEvidenceAwareCompletionXpAwarder,
  awardCompletionXpFromEvidence,
  purchaseDetailedHint,
};
