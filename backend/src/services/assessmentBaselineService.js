const { Op } = require("sequelize");
const defaultModels = require("../models");
const {
  ASSESSMENT_TYPES,
  PRE_BASELINE_STATUSES,
} = require("../constants/assessmentConfig");
const {
  DEFAULT_LEVEL_PROGRESS,
  PLAYABLE_LEVEL_KEYS,
} = require("../constants/progressDefaults");

const PLAYABLE_LEVEL_KEY_SET = new Set(PLAYABLE_LEVEL_KEYS);

const lessonPlayableLevelKeys = (lessonKey) => PLAYABLE_LEVEL_KEYS.filter(
  (levelKey) => levelKey.startsWith(`${lessonKey}-level-`),
);

const hasNonEmptyMetadata = (value) => Boolean(
  value
  && typeof value === "object"
  && Object.keys(value).length > 0,
);

const hasMeaningfulProgressRowActivity = (row = {}) => Boolean(
  row.startedAt != null
  || row.activeSessionId != null
  || row.activeSessionStartedAt != null
  || row.lastHeartbeatAt != null
  || Number(row.progressPercent) > 0
  || Number(row.attemptCount) > 0
  || Number(row.timeSpentSeconds) > 0
  || row.isCompleted === true
  || row.completedAt != null
  || row.finalScore != null
  || row.hintUsed === true
  || row.hintUsedAt != null
  || row.hintType != null
  || row.attemptCountAtHintUnlock != null
  || row.detailedHintUnlocked === true
  || row.detailedHintPurchasedAt != null
  || row.detailedHintUsedAt != null
  || row.detailedHintXpCost != null
  || row.detailedHintAttemptCount != null
  || row.latestFailureAt != null
  || row.latestFailureCode != null
  || row.latestFailureCategory != null
  || hasNonEmptyMetadata(row.latestFailureMetadata)
  || row.latestFailureAttemptCount != null
  || Number(row.xpAwarded) > 0
  || row.xpAwardedAt != null
);

const hasMeaningfulLessonGameActivity = (progressRows = []) => (
  progressRows.some(hasMeaningfulProgressRowActivity)
);

const effectivePreBaselineStatus = (attempt) => {
  const status = attempt?.preBaselineStatus;
  return Object.values(PRE_BASELINE_STATUSES).includes(status)
    ? status
    : PRE_BASELINE_STATUSES.UNKNOWN;
};

const createAssessmentBaselineService = ({ models = defaultModels } = {}) => {
  const { UserProgress } = models;

  const lockLessonProgressRows = async ({ lessonKey, studentId, transaction }) => {
    const levelKeys = lessonPlayableLevelKeys(lessonKey);
    if (levelKeys.length === 0) {
      throw new Error(`Unknown lesson key for PRE baseline classification: ${lessonKey}`);
    }

    const defaultRows = DEFAULT_LEVEL_PROGRESS
      .filter((level) => PLAYABLE_LEVEL_KEY_SET.has(level.levelKey) && levelKeys.includes(level.levelKey))
      .map((level) => ({
        userId: studentId,
        levelKey: level.levelKey,
        lessonTitle: level.lessonTitle,
        orderIndex: level.orderIndex,
        progressPercent: 0,
        isCompleted: false,
        completedAt: null,
      }));

    await UserProgress.bulkCreate(defaultRows, { ignoreDuplicates: true, transaction });
    return UserProgress.findAll({
      where: { userId: studentId, levelKey: { [Op.in]: levelKeys } },
      order: [["orderIndex", "ASC"]],
      transaction,
      lock: transaction?.LOCK?.UPDATE ?? true,
    });
  };

  const classifyAtCreation = async ({ assessment, studentId, transaction }) => {
    if (assessment?.type !== ASSESSMENT_TYPES.PRE) return null;
    const rows = await lockLessonProgressRows({
      lessonKey: assessment.lessonKey,
      studentId,
      transaction,
    });
    return hasMeaningfulLessonGameActivity(rows)
      ? PRE_BASELINE_STATUSES.RETROACTIVE
      : PRE_BASELINE_STATUSES.VALID;
  };

  const classifyAtSubmission = async ({ assessment, attempt, studentId, transaction }) => {
    if (assessment?.type !== ASSESSMENT_TYPES.PRE) return null;
    const rows = await lockLessonProgressRows({
      lessonKey: assessment.lessonKey,
      studentId,
      transaction,
    });
    if (hasMeaningfulLessonGameActivity(rows)) {
      return PRE_BASELINE_STATUSES.RETROACTIVE;
    }
    return effectivePreBaselineStatus(attempt);
  };

  return { classifyAtCreation, classifyAtSubmission };
};

module.exports = {
  createAssessmentBaselineService,
  effectivePreBaselineStatus,
  hasMeaningfulLessonGameActivity,
  lessonPlayableLevelKeys,
};
