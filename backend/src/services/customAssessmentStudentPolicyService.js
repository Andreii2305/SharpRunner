const defaultModels = require("../models");
const { ASSESSMENT_TYPES } = require("../constants/assessmentConfig");
const { AssessmentApiError } = require("./assessmentErrorService");
const { isStudentAssigned } = require("./classroomLessonPolicyService");

const plain = (value) => value?.get ? value.get({ plain: true }) : value;

const createCustomAssessmentStudentPolicyService = ({
  models = defaultModels,
  now = () => new Date(),
} = {}) => {
  const {
    Classroom,
    ClassroomLesson,
    ClassroomLessonPlacement,
    ClassroomLessonReadingCompletion,
    ClassroomMembership,
  } = models;

  const lockExactTarget = async ({ expectedTarget, studentId, transaction }) => {
    const initialPlacement = plain(await ClassroomLessonPlacement.findOne({
      where: {
        id: expectedTarget.classroomLessonPlacementId,
        classroomId: expectedTarget.classroomId,
      },
      transaction,
    }));
    if (!initialPlacement) {
      throw new AssessmentApiError(404, "ASSESSMENT_TARGET_NOT_FOUND", "Assessment target was not found");
    }
    const lesson = plain(await ClassroomLesson.findByPk(initialPlacement.lessonId, {
      transaction,
      ...(transaction?.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {}),
    }));
    const placement = plain(await ClassroomLessonPlacement.findOne({
      where: {
        id: expectedTarget.classroomLessonPlacementId,
        classroomId: expectedTarget.classroomId,
        lessonId: lesson?.id,
      },
      transaction,
      ...(transaction?.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {}),
    }));
    if (!lesson || !placement || lesson.contentType !== "lesson") {
      throw new AssessmentApiError(404, "ASSESSMENT_TARGET_NOT_FOUND", "Assessment target was not found");
    }
    if (!placement
      || Number(placement.classroomId) !== Number(expectedTarget.classroomId)) {
      throw new AssessmentApiError(404, "ASSESSMENT_TARGET_NOT_FOUND", "Assessment target was not found");
    }
    const [membership, classroom] = await Promise.all([
      ClassroomMembership.findOne({
        where: { classroomId: expectedTarget.classroomId, studentId, status: "active" },
        transaction,
      }),
      Classroom.findOne({ where: { id: expectedTarget.classroomId, isActive: true }, transaction }),
    ]);
    if (!membership || !classroom) {
      throw new AssessmentApiError(403, "FORBIDDEN", "Forbidden");
    }
    return { ...placement, lesson };
  };

  const loadExactPlacement = async ({ assessment, studentId, transaction }) => {
    const placement = plain(await ClassroomLessonPlacement.findOne({
      where: {
        id: assessment.classroomLessonPlacementId,
        classroomId: assessment.classroomId,
      },
      include: [{ association: "lesson", required: true }],
      transaction,
      ...(transaction?.LOCK?.UPDATE
        ? { lock: { level: transaction.LOCK.UPDATE, of: ClassroomLessonPlacement } }
        : {}),
    }));
    const [membership, classroom] = await Promise.all([
      ClassroomMembership.findOne({
        where: { classroomId: assessment.classroomId, studentId, status: "active" },
        transaction,
      }),
      Classroom.findOne({ where: { id: assessment.classroomId, isActive: true }, transaction }),
    ]);
    if (!membership || !classroom) {
      throw new AssessmentApiError(403, "FORBIDDEN", "Forbidden");
    }
    return placement;
  };

  const assertPlacementMatchesAssessment = (placement, assessment) => {
    if (!placement
      || Number(placement.classroomId) !== Number(assessment.classroomId)
      || Number(placement.id) !== Number(assessment.classroomLessonPlacementId)
      || Number(placement.lesson?.contentVersion) !== Number(assessment.targetLessonVersion)
      || placement.lesson?.contentType !== "lesson") {
      throw new AssessmentApiError(404, "ASSESSMENT_TARGET_NOT_FOUND", "Assessment target was not found");
    }
  };

  const evaluate = async ({ assessment: input, studentId, transaction, operation = "START", placement: lockedPlacement }) => {
    const assessment = plain(input);
    const placement = lockedPlacement || await loadExactPlacement({ assessment, studentId, transaction });
    assertPlacementMatchesAssessment(placement, assessment);
    const historicalOperation = ["ACTIVE_ATTEMPT", "RESULT"].includes(operation);
    if (historicalOperation) return { allowed: true, placement };
    if (placement.archivedAt || placement.lesson.archivedAt) {
      return { allowed: false, reason: "PLACEMENT_ARCHIVED" };
    }
    if (!placement.lesson.isPublished
      || (placement.lesson.publishAt && new Date(placement.lesson.publishAt) > now())
      || !isStudentAssigned(placement.lesson, studentId)) {
      return { allowed: false, reason: "LESSON_NOT_AVAILABLE" };
    }
    if (assessment.type === ASSESSMENT_TYPES.POST) {
      const completion = await ClassroomLessonReadingCompletion.findOne({
        where: {
          classroomLessonPlacementId: placement.id,
          classroomId: assessment.classroomId,
          lessonId: placement.lessonId,
          studentId,
          lessonVersion: Number(assessment.targetLessonVersion),
        },
        transaction,
      });
      if (!completion) return { allowed: false, reason: "READING_ACKNOWLEDGEMENT_REQUIRED" };
    }
    return { allowed: true, placement };
  };

  const assertAllowed = async (input) => {
    const result = await evaluate(input);
    if (result.allowed) return result;
    const archived = result.reason === "PLACEMENT_ARCHIVED";
    throw new AssessmentApiError(
      archived ? 409 : 403,
      archived ? "ASSESSMENT_TARGET_ARCHIVED" : result.reason,
      archived
        ? "This classroom lesson is archived. New assessment attempts are unavailable."
        : result.reason === "READING_ACKNOWLEDGEMENT_REQUIRED"
          ? "Finish reading this lesson before starting its POST assessment."
          : "This classroom lesson is not currently available.",
    );
  };

  return { evaluate, assertAllowed, lockExactTarget };
};

const defaultService = createCustomAssessmentStudentPolicyService();

module.exports = { createCustomAssessmentStudentPolicyService, ...defaultService };
