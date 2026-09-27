const defaultModels = require("../models");
const { ACADEMIC_LESSON_KEYS } = require("../constants/assessmentConfig");
const { AssessmentApiError } = require("./assessmentErrorService");

const withLock = (options, { lock, transaction, model }) => {
  if (!lock) return options;
  if (lock === true && transaction?.LOCK?.UPDATE) {
    return {
      ...options,
      lock: { level: transaction.LOCK.UPDATE, of: model },
    };
  }
  return { ...options, lock };
};

const createAssessmentAuthorizationService = ({ models = defaultModels } = {}) => {
  const { Classroom, ClassroomMembership, LessonAssessment } = models;
  const academicLessonKeys = new Set(ACADEMIC_LESSON_KEYS);

  const requireActiveStudentMembership = async ({ classroomId, studentId, transaction }) => {
    const membership = await ClassroomMembership.findOne({
      where: { classroomId, studentId, status: "active" },
      ...(transaction ? { transaction } : {}),
    });
    if (!membership) {
      throw new AssessmentApiError(403, "FORBIDDEN", "Forbidden");
    }
    return membership;
  };

  const requireManagedClassroom = async ({
    classroomId,
    actorId,
    actorRole,
    transaction,
    lock = false,
  }) => {
    const options = withLock(
      transaction ? { transaction } : {},
      { lock, transaction, model: Classroom },
    );
    const classroom = await Classroom.findByPk(classroomId, options);
    if (!classroom) {
      throw new AssessmentApiError(404, "CLASSROOM_NOT_FOUND", "Classroom was not found");
    }
    if (actorRole !== "admin" && (actorRole !== "teacher" || classroom.teacherId !== actorId)) {
      throw new AssessmentApiError(403, "FORBIDDEN", "Forbidden");
    }
    return classroom;
  };

  const requireAssessmentInClassroom = async ({
    classroomId,
    assessmentId,
    transaction,
    lock = false,
  }) => {
    const options = withLock({
      where: { id: assessmentId, classroomId },
      ...(transaction ? { transaction } : {}),
    }, { lock, transaction, model: LessonAssessment });
    const assessment = await LessonAssessment.findOne(options);
    if (!assessment) {
      throw new AssessmentApiError(404, "ASSESSMENT_NOT_FOUND", "Assessment was not found");
    }
    return assessment;
  };

  const assertAcademicLessonKey = (lessonKey) => {
    if (!academicLessonKeys.has(lessonKey)) {
      throw new AssessmentApiError(400, "INVALID_LESSON_KEY", "Invalid lesson key");
    }
    return lessonKey;
  };

  return {
    assertAcademicLessonKey,
    requireActiveStudentMembership,
    requireAssessmentInClassroom,
    requireManagedClassroom,
  };
};

const defaultService = createAssessmentAuthorizationService();

module.exports = {
  createAssessmentAuthorizationService,
  ...defaultService,
};
