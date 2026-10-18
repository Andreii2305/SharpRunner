const { Op } = require("sequelize");
const defaultModels = require("../models");
const {
  ASSESSMENT_TARGET_KINDS,
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
  const {
    UserProgress,
    ClassroomLesson,
    ClassroomLessonPlacement,
    ClassroomLessonContentAccess,
  } = models;

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

  const lockCustomTarget = async ({ assessment, transaction }) => {
    const initialPlacement = await ClassroomLessonPlacement.findOne({
      where: {
        id: assessment.classroomLessonPlacementId,
        classroomId: assessment.classroomId,
      },
      attributes: ["id", "lessonId"],
      transaction,
    });
    if (!initialPlacement) throw new Error("Custom PRE placement was not found");
    const lesson = await ClassroomLesson.findByPk(initialPlacement.lessonId, {
      transaction,
      lock: transaction?.LOCK?.UPDATE ?? true,
    });
    const placement = await ClassroomLessonPlacement.findOne({
      where: {
        id: assessment.classroomLessonPlacementId,
        classroomId: assessment.classroomId,
        lessonId: lesson?.id,
      },
      transaction,
      lock: transaction?.LOCK?.UPDATE ?? true,
    });
    if (!lesson || !placement) throw new Error("Custom PRE placement was not found");
    if (Number(lesson.contentVersion) !== Number(assessment.targetLessonVersion)) {
      throw new Error("Custom PRE target lesson revision no longer matches");
    }
    return placement;
  };

  const classifyCustomAtStart = async ({ assessment, studentId, startedAt, transaction }) => {
    const placement = await lockCustomTarget({ assessment, transaction });
    const access = await ClassroomLessonContentAccess.findOne({
      where: {
        classroomLessonPlacementId: placement.id,
        studentId,
        lessonVersion: Number(assessment.targetLessonVersion),
        accessedAt: { [Op.lte]: startedAt },
      },
      transaction,
    });
    if (access) return PRE_BASELINE_STATUSES.RETROACTIVE;
    return placement.accessPolicyEstablishedAt
      ? PRE_BASELINE_STATUSES.VALID
      : PRE_BASELINE_STATUSES.UNKNOWN;
  };

  const classifyAtCreation = async ({
    assessment,
    studentId,
    transaction,
    captureStartedAt = () => new Date(),
  }) => {
    if (assessment?.type !== ASSESSMENT_TYPES.PRE) return null;
    if (assessment.targetKind === ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT) {
      const placement = await lockCustomTarget({ assessment, transaction });
      const startedAt = captureStartedAt();
      const access = await ClassroomLessonContentAccess.findOne({
        where: {
          classroomLessonPlacementId: placement.id,
          studentId,
          lessonVersion: Number(assessment.targetLessonVersion),
          accessedAt: { [Op.lte]: startedAt },
        },
        transaction,
      });
      if (access) return PRE_BASELINE_STATUSES.RETROACTIVE;
      return placement.accessPolicyEstablishedAt
        ? PRE_BASELINE_STATUSES.VALID
        : PRE_BASELINE_STATUSES.UNKNOWN;
    }
    const rows = await lockLessonProgressRows({
      lessonKey: assessment.lessonKey,
      studentId,
      transaction,
    });
    captureStartedAt();
    return hasMeaningfulLessonGameActivity(rows)
      ? PRE_BASELINE_STATUSES.RETROACTIVE
      : PRE_BASELINE_STATUSES.VALID;
  };

  const classifyAtSubmission = async ({ assessment, attempt, studentId, transaction }) => {
    if (assessment?.type !== ASSESSMENT_TYPES.PRE) return null;
    if (attempt?.preBaselineStatus === PRE_BASELINE_STATUSES.SUPPLEMENTAL) {
      return PRE_BASELINE_STATUSES.SUPPLEMENTAL;
    }
    if (assessment.targetKind === ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT) {
      const status = await classifyCustomAtStart({
        assessment,
        studentId,
        startedAt: attempt.startedAt,
        transaction,
      });
      return status === PRE_BASELINE_STATUSES.RETROACTIVE
        ? status
        : effectivePreBaselineStatus(attempt);
    }
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
