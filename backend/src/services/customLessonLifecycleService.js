const { Op } = require("sequelize");
const defaultModels = require("../models");
const defaultSequelize = require("../config/database");
const { ASSESSMENT_TARGET_KINDS } = require("../constants/assessmentConfig");
const { isStudentAssigned } = require("./classroomLessonPolicyService");

class LessonLifecycleError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = "LessonLifecycleError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const lockOptions = (transaction) => ({
  transaction,
  lock: transaction?.LOCK?.UPDATE,
});

const createCustomLessonLifecycleService = ({
  models = defaultModels,
  sequelize = defaultSequelize,
  now = () => new Date(),
} = {}) => {
  const {
    ClassroomLesson,
    ClassroomLessonPlacement,
    ClassroomLessonProgress,
    ClassroomLessonContentAccess,
    ClassroomLessonReadingCompletion,
    ClassroomLessonSubmission,
    ClassroomMembership,
    Classroom,
    LessonAssessment,
    AssessmentAttempt,
  } = models;

  const lockContentRevisionForEdit = async ({ lessonId, transaction, lockedLesson = null }) => {
    const lesson = lockedLesson || await ClassroomLesson.findByPk(lessonId, lockOptions(transaction));
    if (!lesson) throw new LessonLifecycleError(404, "LESSON_NOT_FOUND", "Lesson not found");
    const placements = await ClassroomLessonPlacement.findAll({
      where: { lessonId },
      attributes: ["id"],
      ...lockOptions(transaction),
    });
    const placementIds = placements.map((placement) => placement.id);
    if (!placementIds.length) return lesson;
    const assessments = await LessonAssessment.findAll({
      where: {
        targetKind: ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT,
        classroomLessonPlacementId: { [Op.in]: placementIds },
      },
      attributes: ["id", "isPublished", "publishedAt"],
      ...lockOptions(transaction),
    });
    if (!assessments.length) return lesson;
    const assessmentIds = assessments.map((assessment) => assessment.id);
    const attemptCount = await AssessmentAttempt.count({
      where: { assessmentId: { [Op.in]: assessmentIds } },
      transaction,
    });
    if (attemptCount > 0) {
      throw new LessonLifecycleError(
        409,
        "LESSON_CONTENT_LOCKED_BY_ASSESSMENT_HISTORY",
        "Create an independent lesson copy to change content after assessment attempts exist.",
      );
    }
    if (assessments.some((assessment) => assessment.isPublished || assessment.publishedAt != null)) {
      throw new LessonLifecycleError(
        409,
        "LESSON_ASSESSMENTS_MUST_BE_UNPUBLISHED",
        "Unpublish linked assessments before changing lesson content.",
      );
    }
    return lesson;
  };

  const advanceContentVersion = (lesson) => {
    lesson.contentVersion = Number(lesson.contentVersion || 1) + 1;
    return lesson.contentVersion;
  };

  const removeOrArchivePlacement = async ({ lessonId, classroomId, transaction }) => {
    const lesson = await ClassroomLesson.findByPk(lessonId, lockOptions(transaction));
    if (!lesson) throw new LessonLifecycleError(404, "LESSON_NOT_FOUND", "Lesson not found");
    const placement = await ClassroomLessonPlacement.findOne({
      where: { lessonId, classroomId },
      ...lockOptions(transaction),
    });
    if (!placement) return null;
    const [assessmentCount, accessCount, completionCount, progressCount, submissionCount] = await Promise.all([
      LessonAssessment.count({ where: { classroomLessonPlacementId: placement.id }, transaction }),
      ClassroomLessonContentAccess.count({ where: { classroomLessonPlacementId: placement.id }, transaction }),
      ClassroomLessonReadingCompletion.count({ where: { classroomLessonPlacementId: placement.id }, transaction }),
      ClassroomLessonProgress.count({ where: { lessonId, classroomId }, transaction }),
      ClassroomLessonSubmission.count({ where: { lessonId, classroomId }, transaction }),
    ]);
    if (assessmentCount + accessCount + completionCount + progressCount + submissionCount > 0) {
      placement.archivedAt = now();
      await placement.save({ transaction });
      return { placement, archived: true };
    }
    await placement.destroy({ transaction });
    return { placement, archived: false };
  };

  const lockLessonForDeletion = async ({ lessonId, transaction }) => {
    const lesson = await ClassroomLesson.findByPk(lessonId, lockOptions(transaction));
    if (!lesson) throw new LessonLifecycleError(404, "LESSON_NOT_FOUND", "Lesson not found");
    const placements = await ClassroomLessonPlacement.findAll({
      where: { lessonId },
      attributes: ["id"],
      ...lockOptions(transaction),
    });
    const [progressCount, submissionCount] = await Promise.all([
      ClassroomLessonProgress.count({ where: { lessonId }, transaction }),
      ClassroomLessonSubmission.count({ where: { lessonId }, transaction }),
    ]);
    if (placements.length || progressCount || submissionCount) {
      throw new LessonLifecycleError(
        409,
        "LESSON_HISTORY_PROTECTED",
        "Archive this lesson instead because classroom or student history must be preserved.",
        { placementCount: placements.length },
      );
    }
    return lesson;
  };

  const recordContentAccess = async ({ placement, lesson, studentId, transaction }) => {
    if (!placement?.id) return null;
    const [access] = await ClassroomLessonContentAccess.findOrCreate({
      where: {
        classroomLessonPlacementId: placement.id,
        studentId,
        lessonVersion: Number(lesson.contentVersion),
      },
      defaults: {
        classroomId: placement.classroomId,
        lessonId: lesson.id,
        accessedAt: now(),
      },
      transaction,
    });
    return access;
  };

  const loadAvailablePlacement = async ({
    lessonId,
    placementId,
    classroomId,
    studentId,
    transaction,
  }) => {
    const lesson = await ClassroomLesson.findByPk(lessonId, lockOptions(transaction));
    const placementRecord = await ClassroomLessonPlacement.findOne({
      where: { id: placementId, lessonId, classroomId, archivedAt: null },
      ...lockOptions(transaction),
    });
    const [classroom, membership] = await Promise.all([
      Classroom.findOne({ where: { id: classroomId, isActive: true }, transaction }),
      ClassroomMembership.findOne({
        where: { classroomId, studentId, status: "active" },
        transaction,
      }),
    ]);
    const available = placementRecord
      && classroom
      && membership
      && lesson?.contentType === "lesson"
      && !lesson.archivedAt
      && lesson.isPublished
      && (!lesson.publishAt || new Date(lesson.publishAt) <= now())
      && isStudentAssigned(lesson, studentId);
    if (!available) {
      throw new LessonLifecycleError(404, "LESSON_NOT_AVAILABLE", "Lesson not found");
    }
    return {
      id: placementRecord.id,
      lessonId: placementRecord.lessonId,
      classroomId: placementRecord.classroomId,
      moduleId: placementRecord.moduleId,
      archivedAt: placementRecord.archivedAt,
      lesson,
    };
  };

  const acknowledgeReading = async ({
    lessonId,
    placementId,
    classroomId,
    studentId,
    lessonVersion,
  }) => sequelize.transaction(async (transaction) => {
    const placement = await loadAvailablePlacement({
      lessonId,
      placementId,
      classroomId,
      studentId,
      transaction,
    });
    const currentVersion = Number(placement.lesson.contentVersion);
    if (!Number.isSafeInteger(Number(lessonVersion)) || Number(lessonVersion) !== currentVersion) {
      throw new LessonLifecycleError(
        409,
        "STALE_LESSON_REVISION",
        "This lesson changed after you opened it. Refresh before marking it finished.",
        { currentVersion },
      );
    }
    const access = await ClassroomLessonContentAccess.findOne({
      where: {
        classroomLessonPlacementId: placement.id,
        studentId,
        lessonVersion: currentVersion,
      },
      transaction,
    });
    if (!access) {
      throw new LessonLifecycleError(
        409,
        "LESSON_REVISION_NOT_ACCESSED",
        "Refresh this lesson before marking it finished.",
      );
    }
    const [completion, created] = await ClassroomLessonReadingCompletion.findOrCreate({
      where: {
        classroomLessonPlacementId: placement.id,
        studentId,
        lessonVersion: currentVersion,
      },
      defaults: {
        classroomId: placement.classroomId,
        lessonId: placement.lessonId,
        completedAt: now(),
      },
      transaction,
    });
    return { completion, created };
  });

  return {
    lockContentRevisionForEdit,
    advanceContentVersion,
    removeOrArchivePlacement,
    lockLessonForDeletion,
    recordContentAccess,
    loadAvailablePlacement,
    acknowledgeReading,
  };
};

const defaultService = createCustomLessonLifecycleService();

module.exports = {
  LessonLifecycleError,
  createCustomLessonLifecycleService,
  ...defaultService,
};
