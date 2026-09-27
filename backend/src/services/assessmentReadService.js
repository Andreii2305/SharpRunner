const defaultModels = require("../models");
const defaultAuthorizationService = require("./assessmentAuthorizationService");
const defaultAttemptService = require("./assessmentAttemptService");
const defaultSerializers = require("./assessmentSerializationService");
const defaultProgressionService = require("./lessonProgressionService");
const { AssessmentApiError } = require("./assessmentErrorService");
const { ATTEMPT_STATUSES } = require("../constants/assessmentConfig");
const {
  calculateLearningGain,
  selectFirstSubmittedPostAttempt,
  selectOfficialPostAttempt,
} = require("./assessmentPolicyService");

const plain = (value) => value?.toJSON ? value.toJSON() : value;

const newestSubmitted = (attempts) => [...attempts].sort(
  (left, right) => Number(right.attemptNumber) - Number(left.attemptNumber)
    || new Date(right.submittedAt || 0).getTime() - new Date(left.submittedAt || 0).getTime(),
)[0] ?? null;

const createAssessmentReadService = ({
  models = defaultModels,
  authorizationService = defaultAuthorizationService,
  attemptService = defaultAttemptService,
  progressionService = defaultProgressionService,
  serializers = defaultSerializers,
  selectors = { calculateLearningGain, selectFirstSubmittedPostAttempt, selectOfficialPostAttempt },
} = {}) => {
  const {
    AssessmentAttempt,
    AssessmentChoice,
    AssessmentQuestion,
    AssessmentResponse,
    LessonAssessment,
  } = models;

  const discoverAssessment = async ({ classroomId, lessonKey, type, studentId }) => {
    const membership = await authorizationService.requireActiveStudentMembership({
      classroomId,
      studentId,
    });
    authorizationService.assertAcademicLessonKey(lessonKey);

    const assessmentRow = await LessonAssessment.findOne({
      where: { classroomId, lessonKey, type, isPublished: true },
    });
    if (!assessmentRow) {
      return serializers.serializeDiscoveryStatus({
        assessment: null,
        available: false,
        lessonKey,
        type,
        attemptStatus: "NOT_AVAILABLE",
        attemptsUsed: 0,
        hasSubmittedAttempt: false,
        unlocked: false,
        lockReason: null,
      });
    }

    const assessment = plain(assessmentRow);
    const progressionState = await progressionService.getLessonProgressionState({
      classroomId,
      studentId,
      lessonKey,
      authorizedMembership: membership,
    });
    const progressionDecision = defaultProgressionService.evaluateAssessmentInteraction({
      assessment,
      state: progressionState,
    });
    const attempts = (await AssessmentAttempt.findAll({
      where: { assessmentId: assessment.id, studentId },
    })).map(plain);
    const submittedAttempts = attempts.filter(
      (attempt) => attempt.status === ATTEMPT_STATUSES.SUBMITTED,
    );
    const activeAttempt = attempts.find(
      (attempt) => attempt.status === ATTEMPT_STATUSES.IN_PROGRESS,
    ) ?? null;
    const latestSubmitted = newestSubmitted(submittedAttempts);
    const attemptsUsed = submittedAttempts.length;

    return serializers.serializeDiscoveryStatus({
      assessment,
      available: true,
      unlocked: progressionDecision.allowed,
      lockReason: progressionDecision.reason,
      lessonKey,
      type,
      attemptStatus: activeAttempt?.status ?? latestSubmitted?.status ?? "NOT_STARTED",
      activeAttemptId: activeAttempt?.id,
      attemptsUsed,
      attemptsRemaining: Math.max(0, Number(assessment.maxAttempts) - attemptsUsed),
      hasSubmittedAttempt: submittedAttempts.length > 0,
      latestSubmitted,
      officialPost: type === "POST"
        ? selectors.selectOfficialPostAttempt(submittedAttempts)
        : null,
    });
  };

  const getPlayerAssessment = async ({ assessmentId, studentId }) => {
    const assessmentRow = await LessonAssessment.findByPk(assessmentId, {
      include: [{
        model: AssessmentQuestion,
        as: "questions",
        include: [{ model: AssessmentChoice, as: "choices" }],
      }],
      order: [
        [{ model: AssessmentQuestion, as: "questions" }, "displayOrder", "ASC"],
        [
          { model: AssessmentQuestion, as: "questions" },
          { model: AssessmentChoice, as: "choices" },
          "displayOrder",
          "ASC",
        ],
      ],
    });
    if (!assessmentRow) {
      throw new AssessmentApiError(404, "ASSESSMENT_NOT_FOUND", "Assessment was not found");
    }
    const assessment = plain(assessmentRow);
    if (!assessment.isPublished) {
      throw new AssessmentApiError(
        404,
        "ASSESSMENT_NOT_PUBLISHED",
        "Assessment is not published",
      );
    }
    const membership = await authorizationService.requireActiveStudentMembership({
      classroomId: assessment.classroomId,
      studentId,
    });
    await progressionService.assertAssessmentInteractionAllowed({
      assessment,
      studentId,
      authorizedMembership: membership,
    });
    return { assessment: serializers.serializePlayerAssessment(assessment) };
  };

  const composePlayerAttempt = async (recovered) => {
    const attempt = plain(recovered.attempt);
    const assessment = plain(recovered.assessment);
    let maxAttempts = recovered.maxAttempts ?? assessment.maxAttempts;
    if (maxAttempts == null) {
      const settings = await LessonAssessment.findByPk(attempt.assessmentId, {
        attributes: ["maxAttempts"],
      });
      maxAttempts = plain(settings)?.maxAttempts;
    }
    const attemptsUsed = recovered.attemptsUsed
      ?? Math.max(0, Number(attempt.attemptNumber) - 1);
    const serialized = serializers.serializePlayerAttempt({
      assessment,
      attempt,
      responses: recovered.responses,
      attemptsUsed,
      maxAttempts,
    });
    return {
      attempt: {
        attemptId: serialized.attempt.id,
        attemptNumber: serialized.attempt.attemptNumber,
        assessmentVersion: serialized.attempt.assessmentVersion,
        status: serialized.attempt.status,
        startedAt: serialized.attempt.startedAt,
        resumed: Boolean(recovered.resumed),
        attemptsUsed: serialized.attemptsUsed,
        attemptsRemaining: Math.max(
          0,
          Number(serialized.maxAttempts) - Number(serialized.attemptsUsed) - 1,
        ),
        responses: serialized.responses,
      },
      assessment: serialized.assessment,
    };
  };

  const getActiveAttempt = async ({ attemptId, studentId }) => composePlayerAttempt(
    await attemptService.getActiveAttempt({ attemptId, studentId }),
  );

  const startOrResumeAttempt = async ({ assessmentId, studentId }) => composePlayerAttempt(
    await attemptService.startOrResumeAttempt({ assessmentId, studentId }),
  );

  const canExposeAnswerReview = ({ assessment, submittedAttempts, activeAttempt }) => (
    assessment.answerReviewPolicy === "AFTER_SUBMISSION"
    || (assessment.answerReviewPolicy === "AFTER_FINAL_ATTEMPT"
      && submittedAttempts.length >= Number(assessment.maxAttempts)
      && !activeAttempt)
  );

  const resultAttributes = [
    "id", "assessmentId", "classroomId", "attemptNumber", "status", "submittedAt",
    "pointsEarned", "maxPoints", "percentage", "passed",
  ];

  const getStudentResult = async ({ attemptId, studentId }) => {
    // Authorize metadata first. Scores and answer graphs are loaded only after
    // ownership, exact current membership, and submitted status are established.
    const identity = plain(await AssessmentAttempt.findByPk(attemptId, {
      attributes: ["id", "assessmentId", "classroomId", "studentId", "status"],
    }));
    if (!identity) {
      throw new AssessmentApiError(404, "ATTEMPT_NOT_FOUND", "Assessment attempt was not found");
    }
    if (String(identity.studentId) !== String(studentId)) {
      throw new AssessmentApiError(403, "FORBIDDEN", "Forbidden");
    }
    await authorizationService.requireActiveStudentMembership({
      classroomId: identity.classroomId,
      studentId,
    });
    if (identity.status !== ATTEMPT_STATUSES.SUBMITTED) {
      throw new AssessmentApiError(409, "ATTEMPT_IN_PROGRESS", "Assessment attempt has not been submitted");
    }
    const assessment = plain(await LessonAssessment.findByPk(identity.assessmentId, {
      attributes: ["id", "classroomId", "lessonKey", "type", "maxAttempts",
        "showScoreAfterSubmission", "answerReviewPolicy"],
    }));
    if (!assessment) {
      throw new AssessmentApiError(404, "ASSESSMENT_NOT_FOUND", "Assessment was not found");
    }
    if (String(assessment.classroomId) !== String(identity.classroomId)) {
      throw new AssessmentApiError(403, "FORBIDDEN", "Forbidden");
    }
    // One scoped sibling query supports both centralized selectors and review
    // exhaustion, including any active attempt. Never query once per attempt.
    const attempts = (await AssessmentAttempt.findAll({
      where: { assessmentId: assessment.id, classroomId: identity.classroomId, studentId },
      attributes: resultAttributes,
    })).map(plain);
    const attempt = attempts.find((row) => String(row.id) === String(identity.id));
    if (!attempt) {
      throw new AssessmentApiError(404, "ATTEMPT_NOT_FOUND", "Assessment attempt was not found");
    }
    const submittedAttempts = attempts.filter((row) => row.status === ATTEMPT_STATUSES.SUBMITTED);
    const activeAttempt = attempts.find((row) => row.status === ATTEMPT_STATUSES.IN_PROGRESS) ?? null;
    const officialGrade = assessment.type === "POST"
      ? selectors.selectOfficialPostAttempt(submittedAttempts) : null;
    const firstPost = assessment.type === "POST"
      ? selectors.selectFirstSubmittedPostAttempt(submittedAttempts) : null;
    let learningGain = null;
    if (assessment.type === "POST" && assessment.showScoreAfterSubmission === true) {
      const preAssessment = plain(await LessonAssessment.findOne({
        where: { classroomId: assessment.classroomId, lessonKey: assessment.lessonKey, type: "PRE" },
        attributes: ["id", "showScoreAfterSubmission"],
      }));
      const preAttempt = preAssessment?.showScoreAfterSubmission === true
        ? plain(await AssessmentAttempt.findOne({
        where: { assessmentId: preAssessment.id, classroomId: assessment.classroomId,
          studentId, status: ATTEMPT_STATUSES.SUBMITTED },
        attributes: ["percentage"],
        order: [["attemptNumber", "ASC"], ["submittedAt", "ASC"]],
      })) : null;
      learningGain = selectors.calculateLearningGain(preAttempt, firstPost);
    }
    const safe = serializers.serializeStudentResult({
      assessment, attempt, officialGrade, firstPost, learningGain,
    });
    const scoreVisible = assessment.showScoreAfterSubmission === true;
    const output = {
      result: {
        attemptId: attempt.id,
        type: assessment.type,
        status: attempt.status,
        attemptNumber: attempt.attemptNumber,
        submittedAt: attempt.submittedAt,
        ...(assessment.type === "PRE" ? { diagnosticCompleted: true } : {}),
        scoreVisible,
        ...(scoreVisible ? {
          pointsEarned: safe.result.pointsEarned,
          maxPoints: safe.result.maxPoints,
          percentage: safe.result.percentage,
        } : {}),
        ...(assessment.type === "POST" ? { passed: safe.result.passed } : {}),
      },
      attempts: {
        used: submittedAttempts.length,
        max: Number(assessment.maxAttempts),
        remaining: Math.max(0, Number(assessment.maxAttempts) - submittedAttempts.length),
      },
    };
    if (safe.officialGrade) {
      output.officialGrade = {
        attemptId: officialGrade.id,
        attemptNumber: safe.officialGrade.attemptNumber,
        percentage: safe.officialGrade.percentage,
        submittedAt: officialGrade.submittedAt,
      };
    }
    if (safe.firstPost) {
      output.firstPost = {
        attemptId: firstPost.id,
        attemptNumber: safe.firstPost.attemptNumber,
        percentage: safe.firstPost.percentage,
      };
    }
    if (safe.learningGain) {
      output.prePercentage = safe.prePercentage;
      output.learningGain = { ...safe.learningGain, prePercentage: safe.prePercentage };
    }
    const reviewAvailable = canExposeAnswerReview({ assessment, submittedAttempts, activeAttempt });
    let questions = [];
    let responses = [];
    if (reviewAvailable) {
      questions = await AssessmentQuestion.findAll({
        where: { assessmentId: assessment.id },
        include: [{ model: AssessmentChoice, as: "choices" }],
        order: [["displayOrder", "ASC"], ["id", "ASC"]],
      });
      responses = await AssessmentResponse.findAll({ where: { attemptId: attempt.id } });
    }
    const review = serializers.serializeAllowedReview({ reviewAvailable, questions, responses });
    output.reviewAvailable = review.reviewAvailable;
    if (review.reviewAvailable) {
      output.review = review.review.map((row) => ({
        questionId: row.questionId,
        selectedChoiceId: row.selectedChoiceId,
        correctChoiceId: row.correctChoiceId,
        isCorrect: row.isCorrect,
        pointsAwarded: row.pointsAwarded,
        explanation: row.explanation,
      }));
    }
    return output;
  };

  return {
    canExposeAnswerReview,
    discoverAssessment,
    getActiveAttempt,
    getPlayerAssessment,
    getStudentResult,
    startOrResumeAttempt,
  };
};

const defaultService = createAssessmentReadService();

module.exports = {
  createAssessmentReadService,
  ...defaultService,
};
