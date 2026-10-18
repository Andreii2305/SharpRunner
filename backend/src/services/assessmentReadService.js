const defaultModels = require("../models");
const defaultAuthorizationService = require("./assessmentAuthorizationService");
const defaultAttemptService = require("./assessmentAttemptService");
const defaultSerializers = require("./assessmentSerializationService");
const defaultProgressionService = require("./lessonProgressionService");
const defaultCustomStudentPolicy = require("./customAssessmentStudentPolicyService");
const { createAssessmentAttemptAllowanceService } = require("./assessmentAttemptAllowanceService");
const { AssessmentApiError } = require("./assessmentErrorService");
const { ATTEMPT_STATUSES } = require("../constants/assessmentConfig");
const { ASSESSMENT_TARGET_KINDS } = require("../constants/assessmentConfig");
const { LESSON_DEFINITIONS } = require("../constants/progressDefaults");
const {
  calculateLearningGain,
  selectFirstSubmittedPostAttempt,
  selectOfficialPostAttempt,
} = require("./assessmentPolicyService");

const plain = (value) => value?.toJSON ? value.toJSON() : value;
const lessonTitleByKey = new Map(LESSON_DEFINITIONS.map(
  ({ lessonKey, lessonTitle }) => [lessonKey, lessonTitle],
));
const totalQuestionPoints = (questions = []) => Math.round(questions.reduce(
  (total, question) => total + Number(plain(question)?.points ?? 0),
  0,
) * 100) / 100;

const newestSubmitted = (attempts) => [...attempts].sort(
  (left, right) => Number(right.attemptNumber) - Number(left.attemptNumber)
    || new Date(right.submittedAt || 0).getTime() - new Date(left.submittedAt || 0).getTime(),
)[0] ?? null;

const createAssessmentReadService = ({
  models = defaultModels,
  authorizationService = defaultAuthorizationService,
  attemptService = defaultAttemptService,
  progressionService = defaultProgressionService,
  customStudentPolicy = defaultCustomStudentPolicy,
  serializers = defaultSerializers,
  selectors = { calculateLearningGain, selectFirstSubmittedPostAttempt, selectOfficialPostAttempt },
  allowanceService = createAssessmentAttemptAllowanceService({ models }),
} = {}) => {
  const {
    AssessmentAttempt,
    AssessmentChoice,
    AssessmentCodingTestCase,
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
      include: [{
        model: AssessmentQuestion,
        as: "questions",
        attributes: ["id", "questionType", "points"],
      }],
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
    const grants = await allowanceService.loadGrants({ assessmentId: assessment.id, studentId });
    const allowance = allowanceService.summarizeAllowance({ assessment, attempts, grants });
    const submittedAttempts = attempts.filter(
      (attempt) => attempt.status === ATTEMPT_STATUSES.SUBMITTED,
    );
    const activeAttempt = attempts.find(
      (attempt) => [ATTEMPT_STATUSES.IN_PROGRESS, ATTEMPT_STATUSES.GRADING].includes(attempt.status),
    ) ?? null;
    const latestSubmitted = newestSubmitted(submittedAttempts);
    const attemptsUsed = submittedAttempts.length;
    const questions = assessment.questions || [];

    return serializers.serializeDiscoveryStatus({
      assessment,
      lessonTitle: lessonTitleByKey.get(lessonKey) ?? lessonKey,
      questionCount: questions.length,
      totalPossiblePoints: totalQuestionPoints(questions),
      available: true,
      unlocked: progressionDecision.allowed,
      lockReason: progressionDecision.reason,
      lessonKey,
      type,
      attemptStatus: activeAttempt?.status ?? latestSubmitted?.status ?? "NOT_STARTED",
      activeAttemptId: activeAttempt?.id,
      attemptsUsed,
      attemptsRemaining: allowance.attemptsRemaining,
      standardAttemptAllowance: allowance.standardAttemptAllowance,
      additionalAttemptsGranted: allowance.additionalAttemptsGranted,
      additionalAttemptsAvailable: allowance.additionalAttemptsAvailable,
      totalAttemptAllowance: allowance.totalAttemptAllowance,
      hasSubmittedAttempt: submittedAttempts.length > 0,
      latestSubmitted,
      officialPost: type === "POST"
        ? selectors.selectOfficialPostAttempt(submittedAttempts)
        : null,
    });
  };

  const discoverCustomAssessment = async ({ classroomId, placementId, type, studentId }) => {
    await authorizationService.requireActiveStudentMembership({ classroomId, studentId });
    const assessmentRow = await LessonAssessment.findOne({
      where: {
        classroomId,
        targetKind: ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT,
        classroomLessonPlacementId: placementId,
        type,
        isPublished: true,
      },
      include: [{
        model: AssessmentQuestion,
        as: "questions",
        attributes: ["id", "questionType", "points"],
      }],
    });
    if (!assessmentRow) {
      return serializers.serializeDiscoveryStatus({
        assessment: null, available: false, type, attemptStatus: "NOT_AVAILABLE",
        attemptsUsed: 0, hasSubmittedAttempt: false, unlocked: false,
      });
    }
    const assessment = plain(assessmentRow);
    const attempts = (await AssessmentAttempt.findAll({
      where: { assessmentId: assessment.id, classroomId, studentId },
    })).map(plain);
    const submittedAttempts = attempts.filter((attempt) => attempt.status === ATTEMPT_STATUSES.SUBMITTED);
    const activeAttempt = attempts.find((attempt) => (
      [ATTEMPT_STATUSES.IN_PROGRESS, ATTEMPT_STATUSES.GRADING].includes(attempt.status)
    )) ?? null;
    const latestSubmitted = newestSubmitted(submittedAttempts);
    const operation = activeAttempt ? "ACTIVE_ATTEMPT" : latestSubmitted ? "RESULT" : "START";
    const decision = await customStudentPolicy.evaluate({ assessment, studentId, operation });
    const startDecision = activeAttempt
      ? { allowed: false }
      : await customStudentPolicy.evaluate({ assessment, studentId, operation: "START" });
    const grants = await allowanceService.loadGrants({ assessmentId: assessment.id, studentId });
    const allowance = allowanceService.summarizeAllowance({ assessment, attempts, grants });
    const questions = assessment.questions || [];
    return serializers.serializeDiscoveryStatus({
      assessment,
      lessonTitle: decision.placement?.lesson?.title ?? assessment.title,
      questionCount: questions.length,
      totalPossiblePoints: totalQuestionPoints(questions),
      available: true,
      unlocked: decision.allowed,
      newAttemptAllowed: startDecision.allowed,
      lockReason: decision.allowed ? null : decision.reason,
      type,
      attemptStatus: activeAttempt?.status ?? latestSubmitted?.status ?? "NOT_STARTED",
      activeAttemptId: activeAttempt?.id,
      attemptsUsed: submittedAttempts.length,
      attemptsRemaining: allowance.attemptsRemaining,
      standardAttemptAllowance: allowance.standardAttemptAllowance,
      additionalAttemptsGranted: allowance.additionalAttemptsGranted,
      additionalAttemptsAvailable: allowance.additionalAttemptsAvailable,
      totalAttemptAllowance: allowance.totalAttemptAllowance,
      hasSubmittedAttempt: submittedAttempts.length > 0,
      latestSubmitted,
      officialPost: type === "POST" ? selectors.selectOfficialPostAttempt(submittedAttempts) : null,
    });
  };

  const getPlayerAssessment = async ({ assessmentId, studentId }) => {
    const assessmentRow = await LessonAssessment.findByPk(assessmentId, {
      include: [{
        model: AssessmentQuestion,
        as: "questions",
        include: [
          { model: AssessmentChoice, as: "choices" },
          { model: AssessmentCodingTestCase, as: "codingTestCases" },
        ],
      }],
      order: [
        [{ model: AssessmentQuestion, as: "questions" }, "displayOrder", "ASC"],
        [
          { model: AssessmentQuestion, as: "questions" },
          { model: AssessmentChoice, as: "choices" },
          "displayOrder",
          "ASC",
        ],
        [
          { model: AssessmentQuestion, as: "questions" },
          { model: AssessmentCodingTestCase, as: "codingTestCases" },
          "displayOrder",
          "ASC",
        ],
      ],
    });
    if (!assessmentRow) {
      throw new AssessmentApiError(404, "ASSESSMENT_NOT_FOUND", "Assessment was not found");
    }
    const assessment = plain(assessmentRow);
    if ((assessment.targetKind ?? ASSESSMENT_TARGET_KINDS.BUILT_IN)
      !== ASSESSMENT_TARGET_KINDS.BUILT_IN) {
      throw new AssessmentApiError(404, "ASSESSMENT_NOT_FOUND", "Assessment was not found");
    }
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
    let maxAttempts = recovered.allowance?.totalAttemptAllowance
      ?? recovered.maxAttempts ?? assessment.maxAttempts;
    if (maxAttempts == null) {
      const settings = await LessonAssessment.findByPk(attempt.assessmentId, {
        attributes: ["maxAttempts"],
      });
      maxAttempts = plain(settings)?.maxAttempts;
    }
    const attemptsUsed = recovered.allowance?.attemptsUsed ?? recovered.attemptsUsed
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

  const getActiveAttempt = async ({ attemptId, studentId, expectedTarget }) => composePlayerAttempt(
    await attemptService.getActiveAttempt({ attemptId, studentId, expectedTarget }),
  );

  const startOrResumeAttempt = async ({ assessmentId, studentId, expectedTarget }) => composePlayerAttempt(
    await attemptService.startOrResumeAttempt({ assessmentId, studentId, expectedTarget }),
  );

  const canExposeAnswerReview = ({ assessment, submittedAttempts = [], activeAttempt = null }) => (
    allowanceService.isAnswerReviewEligible({
      assessment,
      attempts: [
        ...submittedAttempts.map((attempt) => ({ ...plain(attempt), status: ATTEMPT_STATUSES.SUBMITTED })),
        ...(activeAttempt ? [activeAttempt] : []),
      ],
      grants: [],
    })
  );

  const resultAttributes = [
    "id", "assessmentId", "classroomId", "attemptNumber", "status", "submittedAt",
    "pointsEarned", "maxPoints", "percentage", "passed", "preBaselineStatus",
  ];

  const getStudentResult = async ({
    attemptId,
    studentId,
    expectedClassroomId = null,
    expectedLessonKey = null,
    expectedType = null,
    expectedTarget = null,
  }) => {
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
    if (expectedClassroomId != null && String(identity.classroomId) !== String(expectedClassroomId)) {
      throw new AssessmentApiError(403, "FORBIDDEN", "Forbidden");
    }
    await authorizationService.requireActiveStudentMembership({
      classroomId: identity.classroomId,
      studentId,
    });
    const assessment = plain(await LessonAssessment.findByPk(identity.assessmentId, {
      attributes: ["id", "classroomId", "targetKind", "lessonKey", "classroomLessonPlacementId",
        "targetLessonVersion", "type", "title", "maxAttempts",
        "showScoreAfterSubmission", "answerReviewPolicy", "passingPercentage",
        "requirePassingForCompletion"],
    }));
    if (!assessment) {
      throw new AssessmentApiError(404, "ASSESSMENT_NOT_FOUND", "Assessment was not found");
    }
    const targetKind = assessment.targetKind ?? ASSESSMENT_TARGET_KINDS.BUILT_IN;
    const requiredKind = expectedTarget?.targetKind ?? ASSESSMENT_TARGET_KINDS.BUILT_IN;
    if (targetKind !== requiredKind
      || (requiredKind === ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT
        && (String(assessment.classroomLessonPlacementId) !== String(expectedTarget.classroomLessonPlacementId)
          || assessment.type !== expectedTarget.type))) {
      throw new AssessmentApiError(403, "FORBIDDEN", "Forbidden");
    }
    if (String(assessment.classroomId) !== String(identity.classroomId)) {
      throw new AssessmentApiError(403, "FORBIDDEN", "Forbidden");
    }
    if ((assessment.targetKind ?? ASSESSMENT_TARGET_KINDS.BUILT_IN)
      === ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT) {
      await customStudentPolicy.assertAllowed({ assessment, studentId, operation: "RESULT" });
    }
    if ((expectedLessonKey != null && assessment.lessonKey !== expectedLessonKey)
      || (expectedType != null && assessment.type !== expectedType)) {
      throw new AssessmentApiError(403, "FORBIDDEN", "Forbidden");
    }
    if (identity.status !== ATTEMPT_STATUSES.SUBMITTED) {
      if (identity.status === ATTEMPT_STATUSES.GRADING) {
        return {
          result: {
            attemptId: identity.id,
            status: ATTEMPT_STATUSES.GRADING,
          },
          reviewAvailable: false,
        };
      }
      throw new AssessmentApiError(409, "ATTEMPT_IN_PROGRESS", "Assessment attempt has not been submitted");
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
    const grants = await allowanceService.loadGrants({ assessmentId: assessment.id, studentId });
    const allowance = allowanceService.summarizeAllowance({ assessment, attempts, grants });
    const officialGrade = assessment.type === "POST"
      ? selectors.selectOfficialPostAttempt(submittedAttempts) : null;
    const firstPost = assessment.type === "POST"
      ? selectors.selectFirstSubmittedPostAttempt(submittedAttempts) : null;
    let learningGain = null;
    if (assessment.type === "POST" && assessment.showScoreAfterSubmission === true) {
      const preAssessment = plain(await LessonAssessment.findOne({
        where: assessment.targetKind === ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT
          ? {
              classroomId: assessment.classroomId,
              targetKind: ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT,
              classroomLessonPlacementId: assessment.classroomLessonPlacementId,
              type: "PRE",
            }
          : { classroomId: assessment.classroomId, lessonKey: assessment.lessonKey, type: "PRE" },
        attributes: ["id", "showScoreAfterSubmission"],
      }));
      const preAttempt = preAssessment?.showScoreAfterSubmission === true
        ? plain(await AssessmentAttempt.findOne({
        where: { assessmentId: preAssessment.id, classroomId: assessment.classroomId,
          studentId, status: ATTEMPT_STATUSES.SUBMITTED },
        attributes: ["percentage", "preBaselineStatus"],
        order: [["attemptNumber", "ASC"], ["submittedAt", "ASC"]],
      })) : null;
      learningGain = selectors.calculateLearningGain(preAttempt, firstPost);
    }
    const safe = serializers.serializeStudentResult({
      assessment, attempt, officialGrade, firstPost, learningGain,
    });
    const scoreVisible = assessment.showScoreAfterSubmission === true;
    const output = {
      assessment: safe.assessment,
      result: {
        attemptId: attempt.id,
        type: assessment.type,
        status: attempt.status,
        attemptNumber: attempt.attemptNumber,
        submittedAt: attempt.submittedAt,
        ...(assessment.type === "PRE" ? { diagnosticCompleted: true } : {}),
        ...(assessment.type === "PRE" ? { baselineEligible: safe.result.baselineEligible } : {}),
        ...(assessment.type === "PRE" ? { supplementalDiagnostic: attempt.preBaselineStatus === "SUPPLEMENTAL" } : {}),
        scoreVisible,
        ...(scoreVisible ? {
          pointsEarned: safe.result.pointsEarned,
          maxPoints: safe.result.maxPoints,
          percentage: safe.result.percentage,
        } : {}),
        ...(assessment.type === "POST" ? { passed: safe.result.passed } : {}),
      },
      attempts: {
        used: allowance.attemptsUsed,
        max: allowance.totalAttemptAllowance,
        remaining: allowance.attemptsRemaining,
        standard: allowance.standardAttemptAllowance,
        additionalGranted: allowance.additionalAttemptsGranted,
        additionalAvailable: allowance.additionalAttemptsAvailable,
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
    const reviewAvailable = allowanceService.isAnswerReviewEligible({ assessment, attempts, grants });
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
    const review = serializers.serializeAllowedReview({ reviewAvailable, questions, responses, scoreVisible });
    output.reviewAvailable = review.reviewAvailable;
    if (review.reviewAvailable) {
      output.review = review.review.map((row) => ({
        questionId: row.questionId,
        questionText: row.questionText,
        questionType: row.questionType,
        ...(Object.hasOwn(row, "sourceCode")
          ? { sourceCode: row.sourceCode }
          : {
              selectedChoiceId: row.selectedChoiceId,
              studentAnswer: row.studentAnswer,
              correctChoiceId: row.correctChoiceId,
              correctAnswer: row.correctAnswer,
            }),
        ...(Object.hasOwn(row, "isCorrect") ? { isCorrect: row.isCorrect } : {}),
        ...(Object.hasOwn(row, "explanation") ? { explanation: row.explanation } : {}),
        ...(scoreVisible ? {
          pointsAwarded: row.pointsAwarded,
        } : {}),
      }));
    }
    return output;
  };

  return {
    canExposeAnswerReview,
    discoverAssessment,
    discoverCustomAssessment,
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
