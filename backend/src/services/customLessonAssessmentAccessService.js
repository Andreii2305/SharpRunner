const { Op } = require("sequelize");
const defaultModels = require("../models");
const {
  ASSESSMENT_TARGET_KINDS,
  ASSESSMENT_TYPES,
  ATTEMPT_STATUSES,
  PRE_BASELINE_STATUSES,
} = require("../constants/assessmentConfig");
const defaultLifecycleService = require("./customLessonLifecycleService");

class CustomLessonAssessmentAccessError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = "CustomLessonAssessmentAccessError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const createCustomLessonAssessmentAccessService = ({
  models = defaultModels,
  lifecycleService = defaultLifecycleService,
  now = () => new Date(),
} = {}) => {
  const {
    LessonAssessment,
    AssessmentAttempt,
    ClassroomLessonContentAccess,
  } = models;

  const loadPublishedPre = ({ placement, transaction }) => LessonAssessment.findOne({
    where: {
      classroomId: placement.classroomId,
      targetKind: ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT,
      classroomLessonPlacementId: placement.id,
      type: ASSESSMENT_TYPES.PRE,
      isPublished: true,
    },
    transaction,
  });

  const safeGate = (pre) => ({
    code: "CUSTOM_PRE_REQUIRED",
    assessmentId: pre.id,
    assessmentType: ASSESSMENT_TYPES.PRE,
    required: true,
    classroomId: pre.classroomId,
    classroomLessonPlacementId: pre.classroomLessonPlacementId,
  });

  const hasExactTarget = (pre, placement) => (
    Number(pre?.classroomId) === Number(placement?.classroomId)
    && Number(pre?.classroomLessonPlacementId) === Number(placement?.id)
    && Number(pre?.targetLessonVersion) === Number(placement?.lesson?.contentVersion)
  );

  const assertExactTarget = (pre, placement) => {
    if (!hasExactTarget(pre, placement)) {
      throw new CustomLessonAssessmentAccessError(
        409,
        "CUSTOM_PRE_TARGET_MISMATCH",
        "The custom PRE target no longer matches this classroom lesson placement and revision.",
      );
    }
  };

  const evaluateStudentContentAccess = async ({
    lessonId,
    placementId,
    classroomId,
    studentId,
    transaction,
  }) => {
    const placement = await lifecycleService.loadAvailablePlacement({
      lessonId,
      placementId,
      classroomId,
      studentId,
      transaction,
    });
    const pre = await loadPublishedPre({ placement, transaction });
    if (!pre || pre.isRequired !== true) {
      return { allowed: true, placement, gate: null, satisfiedBy: null };
    }
    assertExactTarget(pre, placement);

    const originalAttempt = await AssessmentAttempt.findOne({
      where: {
        assessmentId: pre.id,
        classroomId: placement.classroomId,
        studentId,
        attemptNumber: 1,
        status: ATTEMPT_STATUSES.SUBMITTED,
      },
      transaction,
    });
    if (originalAttempt
      && originalAttempt.preBaselineStatus !== PRE_BASELINE_STATUSES.SUPPLEMENTAL) {
      return {
        allowed: true,
        placement,
        gate: null,
        satisfiedBy: "ORIGINAL_PRE_SUBMISSION",
      };
    }

    let priorAccess = null;
    if (pre.accessGateEstablishedAt && Number.isSafeInteger(Number(pre.targetLessonVersion))) {
      priorAccess = await ClassroomLessonContentAccess.findOne({
        where: {
          classroomLessonPlacementId: placement.id,
          studentId,
          lessonVersion: Number(pre.targetLessonVersion),
          accessedAt: { [Op.lte]: pre.accessGateEstablishedAt },
        },
        transaction,
      });
    }
    if (priorAccess) {
      return {
        allowed: true,
        placement,
        gate: null,
        satisfiedBy: "RECOGNIZED_PRIOR_ACCESS",
      };
    }

    return {
      allowed: false,
      placement,
      gate: safeGate(pre),
      satisfiedBy: null,
    };
  };

  const requireStudentContentAccess = async (input) => {
    const result = await evaluateStudentContentAccess(input);
    if (!result.allowed) {
      throw new CustomLessonAssessmentAccessError(
        403,
        result.gate.code,
        "Complete the required PRE assessment before opening this lesson.",
        { gate: result.gate },
      );
    }
    return result;
  };

  const assertRequiredPrePublicationAllowed = ({ assessment, placement }) => {
    const applies = assessment?.targetKind === ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT
      && assessment?.type === ASSESSMENT_TYPES.PRE
      && assessment?.isRequired === true;
    if (!applies) return;
    assertExactTarget(assessment, placement);
    if (!placement?.accessPolicyEstablishedAt) {
      throw new CustomLessonAssessmentAccessError(
        409,
        "CUSTOM_PRE_ACCESS_HISTORY_UNCERTAIN",
        "A required PRE cannot be attached because prior lesson access cannot be determined safely. Use an optional PRE or an independent lesson copy.",
      );
    }
  };

  const establishRequiredPreAccessGate = ({ assessment, placement }) => {
    const applies = assessment?.targetKind === ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT
      && assessment?.type === ASSESSMENT_TYPES.PRE
      && assessment?.isRequired === true;
    if (!applies) return assessment?.accessGateEstablishedAt ?? null;
    assertRequiredPrePublicationAllowed({ assessment, placement });
    if (assessment.accessGateEstablishedAt == null) {
      assessment.accessGateEstablishedAt = now();
    }
    return assessment.accessGateEstablishedAt;
  };

  return {
    evaluateStudentContentAccess,
    requireStudentContentAccess,
    assertRequiredPrePublicationAllowed,
    establishRequiredPreAccessGate,
  };
};

const defaultService = createCustomLessonAssessmentAccessService();

module.exports = {
  CustomLessonAssessmentAccessError,
  createCustomLessonAssessmentAccessService,
  ...defaultService,
};
