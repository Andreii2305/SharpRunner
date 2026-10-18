const defaultModels = require("../models");
const defaultAuthorization = require("./assessmentAuthorizationService");
const { ASSESSMENT_TARGET_KINDS } = require("../constants/assessmentConfig");
const { AssessmentApiError } = require("./assessmentErrorService");

const positiveInteger = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0
  ? Number(value)
  : null;

const plain = (value) => value?.get ? value.get({ plain: true }) : value;

const createAssessmentTargetService = ({
  models = defaultModels,
  authorization = defaultAuthorization,
} = {}) => {
  const { ClassroomLessonPlacement, ClassroomLesson } = models;

  const assertTargetShape = ({
    targetKind = ASSESSMENT_TARGET_KINDS.BUILT_IN,
    lessonKey,
    classroomLessonPlacementId,
    targetLessonVersion,
  }) => {
    if (targetKind === ASSESSMENT_TARGET_KINDS.BUILT_IN) {
      if (classroomLessonPlacementId != null || targetLessonVersion != null) {
        throw new AssessmentApiError(400, "INVALID_ASSESSMENT_TARGET", "Invalid assessment target");
      }
      return {
        targetKind,
        lessonKey: authorization.assertAcademicLessonKey(lessonKey),
        classroomLessonPlacementId: null,
        targetLessonVersion: null,
      };
    }

    const placementId = positiveInteger(classroomLessonPlacementId);
    const lessonVersion = positiveInteger(targetLessonVersion);
    if (targetKind !== ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT
      || lessonKey != null
      || !placementId
      || !lessonVersion) {
      throw new AssessmentApiError(400, "INVALID_ASSESSMENT_TARGET", "Invalid assessment target");
    }
    return {
      targetKind,
      lessonKey: null,
      classroomLessonPlacementId: placementId,
      targetLessonVersion: lessonVersion,
    };
  };

  const loadPlacementTarget = async ({
    classroomId,
    classroomLessonPlacementId,
    targetLessonVersion,
    transaction,
    lock = false,
    allowArchived = false,
  }) => {
    const options = {
      where: { id: classroomLessonPlacementId, classroomId },
      include: [{ model: ClassroomLesson, as: "lesson", required: true }],
      ...(transaction ? { transaction } : {}),
    };
    if (lock) options.lock = lock === true && transaction?.LOCK?.UPDATE
      ? { level: transaction.LOCK.UPDATE, of: ClassroomLessonPlacement }
      : lock;
    const placement = plain(await ClassroomLessonPlacement.findOne(options));
    if (!placement || placement.lesson?.contentType !== "lesson") {
      throw new AssessmentApiError(404, "ASSESSMENT_TARGET_NOT_FOUND", "Assessment target was not found");
    }
    if (!allowArchived && (placement.archivedAt || placement.lesson.archivedAt)) {
      throw new AssessmentApiError(409, "ASSESSMENT_TARGET_ARCHIVED", "Assessment target is archived");
    }
    if (Number(placement.lesson.contentVersion) !== targetLessonVersion) {
      throw new AssessmentApiError(409, "LESSON_VERSION_CONFLICT", "Lesson version conflict", {
        currentVersion: placement.lesson.contentVersion,
      });
    }
    return {
      targetKind: ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT,
      lessonKey: null,
      classroomLessonPlacementId: placement.id,
      targetLessonVersion,
      classroomId: placement.classroomId,
      lessonId: placement.lessonId,
      placement,
    };
  };

  const resolveManagedTarget = async (input) => {
    const classroomId = positiveInteger(input.classroomId);
    if (!classroomId) {
      throw new AssessmentApiError(400, "INVALID_ASSESSMENT_TARGET", "Invalid assessment target");
    }
    await authorization.requireManagedClassroom({
      classroomId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      transaction: input.transaction,
      lock: input.lock,
    });
    const target = assertTargetShape(input);
    if (target.targetKind === ASSESSMENT_TARGET_KINDS.BUILT_IN) {
      return { ...target, classroomId };
    }
    return loadPlacementTarget({
      classroomId,
      ...target,
      transaction: input.transaction,
      lock: input.lock,
    });
  };

  const resolveStudentTarget = async (input) => {
    const classroomId = positiveInteger(input.classroomId);
    if (!classroomId) {
      throw new AssessmentApiError(400, "INVALID_ASSESSMENT_TARGET", "Invalid assessment target");
    }
    await authorization.requireActiveStudentMembership({
      classroomId,
      studentId: input.studentId,
      transaction: input.transaction,
    });
    const target = assertTargetShape(input);
    if (target.targetKind === ASSESSMENT_TARGET_KINDS.BUILT_IN) {
      return { ...target, classroomId };
    }
    return loadPlacementTarget({
      classroomId,
      ...target,
      transaction: input.transaction,
      allowArchived: input.allowArchived === true,
    });
  };

  return { assertTargetShape, resolveManagedTarget, resolveStudentTarget };
};

const defaultService = createAssessmentTargetService();

module.exports = { createAssessmentTargetService, ...defaultService };
