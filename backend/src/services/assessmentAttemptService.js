const { randomBytes } = require("crypto");
const defaultSequelize = require("../config/database");
const defaultModels = require("../models");
const defaultProgressionService = require("./lessonProgressionService");
const defaultCustomStudentPolicy = require("./customAssessmentStudentPolicyService");
const { createAssessmentBaselineService } = require("./assessmentBaselineService");
const { createAssessmentAttemptAllowanceService } = require("./assessmentAttemptAllowanceService");
const defaultSecureCodingExecution = require("./secureCodingExecutionService");
const { MAX_SOURCE_BYTES } = require("./secureCodingExecutionContract");
const {
  contractForQuestion,
  executionModeForQuestion,
  gradeCodingQuestion,
  shapePublicCodingExecutionResult,
} = require("./codingAssessmentService");
const {
  ASSESSMENT_TYPES,
  ASSESSMENT_TARGET_KINDS,
  ATTEMPT_STATUSES,
} = require("../constants/assessmentConfig");
const {
  assertAssessmentStructureMutable: assertStructureMutablePolicy,
  calculateAssessmentScore,
  shapePlayerAssessment,
  validateAssessmentForPublish,
} = require("./assessmentPolicyService");

class AssessmentAttemptError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AssessmentAttemptError";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new AssessmentAttemptError(code, message);
};

const plain = (value) => value?.toJSON ? value.toJSON() : value;
const sameId = (left, right) => String(left) === String(right);

const shuffle = (values, random) => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};

const sortedByDisplayOrder = (values = []) => [...values].sort(
  (left, right) => Number(left.displayOrder) - Number(right.displayOrder)
    || Number(left.id) - Number(right.id),
);

const safeAttempt = (attemptInput) => {
  const attempt = plain(attemptInput);
  return {
    id: attempt.id,
    assessmentId: attempt.assessmentId,
    classroomId: attempt.classroomId,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    assessmentVersion: attempt.assessmentVersion,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt ?? null,
    questionOrder: attempt.questionOrder,
    choiceOrder: attempt.choiceOrder,
  };
};

const safeSubmittedResult = (attemptInput) => {
  const attempt = plain(attemptInput);
  return {
    id: attempt.id,
    assessmentId: attempt.assessmentId,
    classroomId: attempt.classroomId,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    assessmentVersion: attempt.assessmentVersion,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    pointsEarned: Number(attempt.pointsEarned),
    maxPoints: Number(attempt.maxPoints),
    percentage: Number(attempt.percentage),
    correctCount: Number(attempt.correctCount),
    questionCount: Number(attempt.questionCount),
    passed: attempt.passed == null ? null : Boolean(attempt.passed),
    passingPercentageApplied: attempt.passingPercentageApplied == null
      ? null
      : Number(attempt.passingPercentageApplied),
  };
};

const safeSavedResponses = (rows = []) => rows.map((rowInput) => {
  const row = plain(rowInput);
  return {
    questionId: row.questionId,
    ...(row.sourceCode != null
      ? { sourceCode: row.sourceCode }
      : { selectedChoiceId: row.selectedChoiceId ?? null }),
  };
});

const orderedPlayerAssessment = (assessmentInput, attemptInput) => {
  const safe = shapePlayerAssessment(assessmentInput);
  const attempt = plain(attemptInput);
  const questionById = new Map(safe.questions.map((question) => [String(question.id), question]));
  safe.questions = (attempt.questionOrder || []).map((questionId) => {
    const question = questionById.get(String(questionId));
    if (!question) return null;
    const choiceById = new Map(question.choices.map((choice) => [String(choice.id), choice]));
    const order = attempt.choiceOrder?.[questionId] || attempt.choiceOrder?.[String(questionId)] || [];
    return {
      ...question,
      choices: order.map((choiceId) => choiceById.get(String(choiceId))).filter(Boolean),
    };
  }).filter(Boolean);
  return safe;
};

const createAssessmentAttemptService = ({
  sequelize = defaultSequelize,
  models = defaultModels,
  random = Math.random,
  now = () => new Date(),
  progressionService = defaultProgressionService,
  customStudentPolicy = defaultCustomStudentPolicy,
  baselineService = createAssessmentBaselineService({ models }),
  allowanceService = createAssessmentAttemptAllowanceService({ models }),
  secureCodingExecution = defaultSecureCodingExecution,
  environment = process.env,
  createLeaseToken = () => randomBytes(32).toString("base64url"),
} = {}) => {
  const {
    AssessmentAttempt,
    AssessmentChoice,
    AssessmentCodingTestCase,
    AssessmentQuestion,
    AssessmentResponse,
    AssessmentAttemptGrant,
    ClassroomMembership,
    LessonAssessment,
  } = models;

  const assessmentInclude = [{
    model: AssessmentQuestion,
    as: "questions",
    include: [
      { model: AssessmentChoice, as: "choices" },
      { model: AssessmentCodingTestCase, as: "codingTestCases" },
    ],
  }];

  const loadAssessment = async (assessmentId, transaction, lock = false) => LessonAssessment.findByPk(
    assessmentId,
    {
      include: assessmentInclude,
      transaction,
      ...(lock ? { lock: { level: transaction.LOCK.UPDATE, of: LessonAssessment } } : {}),
    },
  );

  const requireAssessment = async (assessmentId, transaction, lock = false) => {
    const assessment = await loadAssessment(assessmentId, transaction, lock);
    if (!assessment) fail("ASSESSMENT_NOT_FOUND", "Assessment was not found");
    return assessment;
  };

  const requirePublishedGraph = (assessmentInput) => {
    const assessment = plain(assessmentInput);
    if (!assessment.isPublished) {
      fail("ASSESSMENT_UNAVAILABLE", "Assessment is not published");
    }
    try {
      validateAssessmentForPublish({ assessment, questions: assessment.questions });
    } catch (error) {
      fail("ASSESSMENT_INVALID", error.message);
    }
    return assessment;
  };

  const requireMembership = async (assessmentInput, studentId, transaction) => {
    const assessment = plain(assessmentInput);
    const membership = await ClassroomMembership.findOne({
      where: {
        classroomId: assessment.classroomId,
        studentId,
        status: "active",
      },
      transaction,
    });
    if (!membership) fail("NOT_ENROLLED", "Student is not active in the assessment classroom");
    return membership;
  };

  const requireAttemptClassroomMembership = async (attemptInput, studentId, transaction) => {
    const attempt = plain(attemptInput);
    const membership = await ClassroomMembership.findOne({
      where: {
        classroomId: attempt.classroomId,
        studentId,
        status: "active",
      },
      transaction,
    });
    if (!membership) fail("NOT_ENROLLED", "Student is not active in the assessment classroom");
    return membership;
  };

  const requireOwnedAttempt = async (attemptId, studentId, transaction) => {
    const attempt = await AssessmentAttempt.findByPk(attemptId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!attempt) fail("ATTEMPT_NOT_FOUND", "Assessment attempt was not found");
    if (!sameId(attempt.studentId, studentId)) {
      fail("ATTEMPT_FORBIDDEN", "Assessment attempt belongs to another student");
    }
    return attempt;
  };

  const requireMatchingVersion = (attemptInput, assessmentInput) => {
    const attempt = plain(attemptInput);
    const assessment = plain(assessmentInput);
    if (Number(attempt.assessmentVersion) !== Number(assessment.version)) {
      fail("ASSESSMENT_VERSION_MISMATCH", "Assessment changed after this attempt began");
    }
  };

  const assertExpectedTarget = (assessment, expectedTarget) => {
    const targetKind = assessment.targetKind ?? ASSESSMENT_TARGET_KINDS.BUILT_IN;
    const expectedKind = expectedTarget?.targetKind ?? ASSESSMENT_TARGET_KINDS.BUILT_IN;
    const matches = targetKind === expectedKind
      && (expectedTarget?.classroomId == null
        || sameId(assessment.classroomId, expectedTarget.classroomId))
      && (expectedKind !== ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT
        || (sameId(assessment.classroomLessonPlacementId, expectedTarget.classroomLessonPlacementId)
          && assessment.type === expectedTarget.type));
    if (!matches) fail("ASSESSMENT_NOT_FOUND", "Assessment route does not match its target");
  };

  const assertInteractionAllowed = async ({
    assessment, studentId, membership, transaction, operation,
  }) => {
    if ((assessment.targetKind ?? ASSESSMENT_TARGET_KINDS.BUILT_IN)
      === ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT) {
      return customStudentPolicy.assertAllowed({ assessment, studentId, transaction, operation });
    }
    return progressionService.assertAssessmentInteractionAllowed({
      assessment, studentId, authorizedMembership: membership, transaction,
    });
  };

  const loadSafeResponses = async (attemptId, transaction) => safeSavedResponses(
    await AssessmentResponse.findAll({ where: { attemptId }, transaction }),
  );

  const gradingLeaseMs = Math.max(
    30_000,
    Math.min(5 * 60_000, Number(environment.CODING_ASSESSMENT_GRADING_LEASE_MS) || 90_000),
  );
  const safeGradingResult = (attemptInput) => ({
    id: plain(attemptInput).id,
    status: ATTEMPT_STATUSES.GRADING,
  });
  const activeLease = (attemptInput, at) => {
    const attempt = plain(attemptInput);
    return attempt.status === ATTEMPT_STATUSES.GRADING
      && typeof attempt.gradingLeaseToken === "string"
      && attempt.gradingLeaseToken.length >= 32
      && new Date(attempt.gradingLeaseExpiresAt || 0).getTime() > at.getTime();
  };

  const buildOrder = (assessment) => {
    const questions = sortedByDisplayOrder(assessment.questions);
    const questionOrder = assessment.shuffleQuestions
      ? shuffle(questions.map((question) => question.id), random)
      : questions.map((question) => question.id);
    const choiceOrder = Object.fromEntries(questions.map((question) => {
      const choices = sortedByDisplayOrder(question.choices).map((choice) => choice.id);
      return [question.id, assessment.shuffleChoices ? shuffle(choices, random) : choices];
    }));
    return { questionOrder, choiceOrder };
  };
  const safeAllowance = (allowance) => ({
    standardAttemptAllowance: allowance.standardAttemptAllowance,
    additionalAttemptsGranted: allowance.additionalAttemptsGranted,
    additionalAttemptsAvailable: allowance.additionalAttemptsAvailable,
    totalAttemptAllowance: allowance.totalAttemptAllowance,
    attemptsUsed: allowance.attemptsUsed,
    attemptsRemaining: allowance.attemptsRemaining,
  });

  const startOrResumeAttempt = ({ assessmentId, studentId, expectedTarget }) => sequelize.transaction(async (transaction) => {
    const assessmentRow = await requireAssessment(assessmentId, transaction, true);
    const assessment = requirePublishedGraph(assessmentRow);
    assertExpectedTarget(assessment, expectedTarget);
    const membership = await requireMembership(assessment, studentId, transaction);
    const isCustomTarget = (assessment.targetKind ?? ASSESSMENT_TARGET_KINDS.BUILT_IN)
      === ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT;

    if (!isCustomTarget) {
      await assertInteractionAllowed({
        assessment,
        studentId,
        membership,
        transaction,
        operation: "START",
      });
    }

    let active = await AssessmentAttempt.findOne({
      where: { assessmentId: assessment.id, studentId, status: ATTEMPT_STATUSES.IN_PROGRESS },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!active) {
      active = await AssessmentAttempt.findOne({
        where: { assessmentId: assessment.id, studentId, status: ATTEMPT_STATUSES.GRADING },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
    }
    if (isCustomTarget) {
      await assertInteractionAllowed({
        assessment,
        studentId,
        membership,
        transaction,
        operation: active ? "ACTIVE_ATTEMPT" : "START",
      });
    }
    if (active) {
      requireMatchingVersion(active, assessment);
      const attempts = await AssessmentAttempt.findAll({
        where: { assessmentId: assessment.id, studentId }, transaction,
      });
      const grants = await allowanceService.loadGrants({ assessmentId: assessment.id, studentId, transaction });
      return {
        attempt: safeAttempt(active),
        assessment: orderedPlayerAssessment(assessment, active),
        resumed: true,
        responses: await loadSafeResponses(active.id, transaction),
        allowance: safeAllowance(allowanceService.summarizeAllowance({ assessment, attempts, grants })),
      };
    }

    const attempts = await AssessmentAttempt.findAll({
      where: { assessmentId: assessment.id, studentId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const grants = await allowanceService.loadGrants({
      assessmentId: assessment.id, studentId, transaction, lock: true,
    });
    const allowance = allowanceService.summarizeAllowance({ assessment, attempts, grants });
    if (allowance.attemptsRemaining < 1) {
      fail("MAX_ATTEMPTS", "Maximum assessment attempts reached");
    }
    const ordinaryAllowanceExhausted = allowance.attemptsUsed >= allowance.standardAttemptAllowance;
    const unusedGrant = ordinaryAllowanceExhausted
      ? (grants.find((grant) => plain(grant).consumedByAttemptId == null) ?? null)
      : null;

    const attemptNumber = attempts.reduce(
      (maximum, attempt) => Math.max(maximum, Number(attempt.attemptNumber)),
      0,
    ) + 1;
    const order = buildOrder(assessment);
    let startedAt = null;
    const captureStartedAt = () => {
      startedAt ||= now();
      return startedAt;
    };
    const preBaselineStatus = assessment.type === ASSESSMENT_TYPES.PRE
      ? (unusedGrant
        ? "SUPPLEMENTAL"
        : await baselineService.classifyAtCreation({
          assessment,
          studentId,
          transaction,
          captureStartedAt,
        }))
      : null;
    captureStartedAt();
    const created = await AssessmentAttempt.create({
      assessmentId: assessment.id,
      classroomId: assessment.classroomId,
      studentId,
      attemptNumber,
      status: ATTEMPT_STATUSES.IN_PROGRESS,
      assessmentVersion: assessment.version,
      startedAt,
      questionOrder: order.questionOrder,
      choiceOrder: order.choiceOrder,
      preBaselineStatus,
    }, { transaction });

    if (unusedGrant && AssessmentAttemptGrant) {
      await unusedGrant.update({ consumedByAttemptId: created.id, consumedAt: now() }, { transaction });
    }

    return {
      attempt: safeAttempt(created),
      assessment: orderedPlayerAssessment(assessment, created),
      resumed: false,
      responses: [],
      allowance: safeAllowance(allowanceService.summarizeAllowance({
        assessment,
        attempts: [...attempts, created],
        grants,
      })),
    };
  });

  const getActiveAttempt = ({ attemptId, studentId, expectedTarget }) => sequelize.transaction(async (transaction) => {
    const attempt = await requireOwnedAttempt(attemptId, studentId, transaction);
    if (![ATTEMPT_STATUSES.IN_PROGRESS, ATTEMPT_STATUSES.GRADING].includes(attempt.status)) {
      fail("ATTEMPT_SUBMITTED", "Submitted assessment attempts cannot be changed");
    }
    const assessmentRow = await requireAssessment(attempt.assessmentId, transaction);
    const assessment = requirePublishedGraph(assessmentRow);
    assertExpectedTarget(assessment, expectedTarget);
    requireMatchingVersion(attempt, assessment);
    const membership = await requireMembership(assessment, studentId, transaction);
    await assertInteractionAllowed({ assessment, studentId, membership, transaction, operation: "ACTIVE_ATTEMPT" });
    return {
      attempt: safeAttempt(attempt),
      assessment: orderedPlayerAssessment(assessment, attempt),
      resumed: true,
      responses: await loadSafeResponses(attempt.id, transaction),
      allowance: safeAllowance(allowanceService.summarizeAllowance({
        assessment,
        attempts: await AssessmentAttempt.findAll({
          where: { assessmentId: assessment.id, studentId }, transaction,
        }),
        grants: await allowanceService.loadGrants({ assessmentId: assessment.id, studentId, transaction }),
      })),
    };
  });

  const saveResponse = ({ attemptId, studentId, questionId, selectedChoiceId, sourceCode, expectedTarget }) => sequelize.transaction(
    async (transaction) => {
      const attempt = await requireOwnedAttempt(attemptId, studentId, transaction);
      if (attempt.status === ATTEMPT_STATUSES.GRADING) {
        fail("ATTEMPT_GRADING", "Assessment attempt is being graded");
      }
      if (attempt.status !== ATTEMPT_STATUSES.IN_PROGRESS) {
        fail("ATTEMPT_SUBMITTED", "Submitted assessment attempts cannot be changed");
      }
      const assessmentRow = await requireAssessment(attempt.assessmentId, transaction);
      const assessment = requirePublishedGraph(assessmentRow);
      assertExpectedTarget(assessment, expectedTarget);
      requireMatchingVersion(attempt, assessment);
      const membership = await requireMembership(assessment, studentId, transaction);
      await assertInteractionAllowed({ assessment, studentId, membership, transaction, operation: "ACTIVE_ATTEMPT" });

      if (!(attempt.questionOrder || []).some((id) => sameId(id, questionId))) {
        fail("QUESTION_NOT_PRESENTED", "Question was not presented in this attempt");
      }
      const question = assessment.questions.find((candidate) => sameId(candidate.id, questionId));
      if (!question) fail("QUESTION_NOT_PRESENTED", "Question does not belong to this assessment");
      const isCoding = question.questionType === "CODING";
      if (isCoding) {
        if (selectedChoiceId !== undefined || typeof sourceCode !== "string") {
          fail("INVALID_CODING_RESPONSE", "CODING responses require sourceCode only");
        }
        if (Buffer.byteLength(sourceCode, "utf8") > MAX_SOURCE_BYTES) {
          fail("CODING_SOURCE_TOO_LARGE", "Coding response exceeds the source limit");
        }
      } else if (sourceCode !== undefined || selectedChoiceId === undefined) {
        fail("INVALID_RESPONSE", "Choice responses require selectedChoiceId only");
      }
      if (selectedChoiceId != null
        && !question.choices.some((choice) => sameId(choice.id, selectedChoiceId))) {
        fail("CHOICE_NOT_IN_QUESTION", "Selected choice does not belong to the question");
      }

      let response = await AssessmentResponse.findOne({
        where: { attemptId: attempt.id, questionId: question.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (response) {
        response.selectedChoiceId = selectedChoiceId;
        response.sourceCode = isCoding ? sourceCode : null;
        response.isCorrect = false;
        response.pointsAwarded = 0;
        await response.save({ transaction });
      } else {
        response = await AssessmentResponse.create({
          attemptId: attempt.id,
          questionId: question.id,
          selectedChoiceId,
          sourceCode: isCoding ? sourceCode : null,
          isCorrect: false,
          pointsAwarded: 0,
        }, { transaction });
      }
      return {
        attemptId: attempt.id,
        questionId: question.id,
        ...(isCoding ? { sourceCode } : { selectedChoiceId }),
      };
    },
  );

  const runPublicCodingQuestion = async ({ attemptId, studentId, questionId, expectedTarget }) => {
    const execution = await sequelize.transaction(async (transaction) => {
      const attempt = await requireOwnedAttempt(attemptId, studentId, transaction);
      if (attempt.status === ATTEMPT_STATUSES.GRADING) {
        fail("ATTEMPT_GRADING", "Assessment attempt is being graded");
      }
      if (attempt.status !== ATTEMPT_STATUSES.IN_PROGRESS) {
        fail("ATTEMPT_SUBMITTED", "Submitted assessment attempts cannot be changed");
      }
      const assessmentRow = await requireAssessment(attempt.assessmentId, transaction);
      const assessment = requirePublishedGraph(assessmentRow);
      assertExpectedTarget(assessment, expectedTarget);
      requireMatchingVersion(attempt, assessment);
      const membership = await requireMembership(assessment, studentId, transaction);
      await assertInteractionAllowed({ assessment, studentId, membership, transaction, operation: "ACTIVE_ATTEMPT" });
      if (!(attempt.questionOrder || []).some((id) => sameId(id, questionId))) {
        fail("QUESTION_NOT_PRESENTED", "Question was not presented in this attempt");
      }
      const question = assessment.questions.find((candidate) => sameId(candidate.id, questionId));
      if (!question) fail("QUESTION_NOT_PRESENTED", "Question does not belong to this assessment");
      if (question.questionType !== "CODING") {
        fail("QUESTION_NOT_CODING", "Question does not support code execution");
      }
      const response = await AssessmentResponse.findOne({
        where: { attemptId: attempt.id, questionId: question.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!response || typeof response.sourceCode !== "string") {
        fail("CODING_SOURCE_REQUIRED", "Save source code before running it");
      }
      const publicTests = sortedByDisplayOrder(question.codingTestCases)
        .map(plain)
        .filter((testCase) => testCase.visibility === "PUBLIC");
      return {
        source: response.sourceCode,
        executionMode: executionModeForQuestion(question),
        contract: executionModeForQuestion(question) === "METHOD" ? contractForQuestion(question) : null,
        publicTests,
      };
    });

    const result = execution.publicTests.length === 0
      ? { category: "SUCCESS", invocations: [] }
      : await (execution.executionMode === "PROGRAM"
        ? secureCodingExecution.runSecureProgramExecution({
          source: execution.source,
          inputs: execution.publicTests.map((testCase) => testCase.input),
        })
        : secureCodingExecution.runSecureMethodExecution({
        source: execution.source,
        contract: execution.contract,
        inputs: execution.publicTests.map((testCase) => testCase.input),
        }));
    return shapePublicCodingExecutionResult({ tests: execution.publicTests, result, executionMode: execution.executionMode });
  };

  const reserveSubmission = ({ attemptId, studentId, submissionKey, expectedTarget }) => sequelize.transaction(
    async (transaction) => {
      const attempt = await requireOwnedAttempt(attemptId, studentId, transaction);
      const membership = await requireAttemptClassroomMembership(attempt, studentId, transaction);
      const assessmentRow = await requireAssessment(attempt.assessmentId, transaction);
      const assessment = requirePublishedGraph(assessmentRow);
      assertExpectedTarget(assessment, expectedTarget);
      requireMatchingVersion(attempt, assessment);
      if (!sameId(assessment.classroomId, attempt.classroomId)) {
        fail("ATTEMPT_FORBIDDEN", "Assessment attempt does not match its classroom");
      }
      const isCustomTarget = (assessment.targetKind ?? ASSESSMENT_TARGET_KINDS.BUILT_IN)
        === ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT;
      if (isCustomTarget) {
        await assertInteractionAllowed({
          assessment, studentId, membership, transaction, operation: "ACTIVE_ATTEMPT",
        });
      }
      if (attempt.status === ATTEMPT_STATUSES.SUBMITTED) {
        if (attempt.submissionKey === submissionKey) {
          return { kind: "submitted", result: safeSubmittedResult(attempt) };
        }
        fail("ATTEMPT_SUBMITTED", "Assessment attempt was already submitted");
      }
      if (!/^[A-Za-z0-9_-]{8,96}$/.test(String(submissionKey || ""))) {
        fail("INVALID_SUBMISSION_KEY", "submissionKey must be 8-96 URL-safe characters");
      }
      const reservationTime = now();
      if (attempt.status === ATTEMPT_STATUSES.GRADING) {
        if (activeLease(attempt, reservationTime)) {
          if (attempt.submissionKey !== submissionKey) {
            fail("ATTEMPT_GRADING", "Assessment attempt is already being graded");
          }
          return { kind: "grading", result: safeGradingResult(attempt) };
        }
      } else if (attempt.status !== ATTEMPT_STATUSES.IN_PROGRESS) {
        fail("ATTEMPT_SUBMITTED", "Assessment attempt cannot be submitted");
      }

      const reusedKey = await AssessmentAttempt.findOne({
        where: { submissionKey },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (reusedKey && !sameId(reusedKey.id, attempt.id)) {
        fail("SUBMISSION_KEY_CONFLICT", "submissionKey was already used for another attempt");
      }

      if (!isCustomTarget) {
        await assertInteractionAllowed({
          assessment, studentId, membership, transaction, operation: "ACTIVE_ATTEMPT",
        });
      }

      const questionById = new Map(assessment.questions.map((question) => [String(question.id), question]));
      const presentedQuestions = (attempt.questionOrder || []).map((questionId) => {
        const question = questionById.get(String(questionId));
        if (!question) fail("ASSESSMENT_VERSION_MISMATCH", "Presented question no longer exists");
        return question;
      });
      if (presentedQuestions.length !== assessment.questions.length) {
        fail("ASSESSMENT_VERSION_MISMATCH", "Attempt question set does not match the assessment");
      }

      const savedResponses = await AssessmentResponse.findAll({
        where: { attemptId: attempt.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const responseByQuestion = new Map();
      for (const response of savedResponses) {
        const question = questionById.get(String(response.questionId));
        if (!question || !(attempt.questionOrder || []).some((id) => sameId(id, response.questionId))) {
          fail("INVALID_RESPONSE", "Stored response does not belong to the presented assessment");
        }
        if (response.selectedChoiceId != null
          && !question.choices.some((choice) => sameId(choice.id, response.selectedChoiceId))) {
          fail("INVALID_RESPONSE", "Stored choice does not belong to its question");
        }
        if (question.questionType === "CODING") {
          if (response.selectedChoiceId != null || typeof response.sourceCode !== "string"
            || Buffer.byteLength(response.sourceCode, "utf8") > MAX_SOURCE_BYTES) {
            fail("INVALID_CODING_RESPONSE", "Stored coding response is invalid");
          }
        } else if (response.sourceCode != null) {
          fail("INVALID_RESPONSE", "Stored choice response is invalid");
        }
        responseByQuestion.set(String(response.questionId), response);
      }

      const leaseToken = createLeaseToken();
      if (typeof leaseToken !== "string" || leaseToken.length < 32 || leaseToken.length > 96) {
        fail("GRADING_LEASE_INVALID", "Unable to reserve assessment grading");
      }
      attempt.status = ATTEMPT_STATUSES.GRADING;
      attempt.submissionKey = submissionKey;
      attempt.gradingLeaseToken = leaseToken;
      attempt.gradingLeaseExpiresAt = new Date(reservationTime.getTime() + gradingLeaseMs);
      await attempt.save({ transaction });

      return {
        kind: "execute",
        attemptId: attempt.id,
        studentId,
        assessment,
        presentedQuestions: presentedQuestions.map(plain),
        savedResponses: savedResponses.map((response) => {
          const saved = plain(response);
          return {
            questionId: saved.questionId,
            selectedChoiceId: saved.selectedChoiceId ?? null,
            sourceCode: saved.sourceCode ?? null,
          };
        }),
        leaseToken,
        submissionKey,
      };
    },
  );

  const releaseSubmission = async (reservation) => sequelize.transaction(async (transaction) => {
    const attempt = await AssessmentAttempt.findByPk(reservation.attemptId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!attempt
      || attempt.status !== ATTEMPT_STATUSES.GRADING
      || attempt.submissionKey !== reservation.submissionKey
      || attempt.gradingLeaseToken !== reservation.leaseToken) return false;
    attempt.status = ATTEMPT_STATUSES.IN_PROGRESS;
    attempt.submissionKey = null;
    attempt.gradingLeaseToken = null;
    attempt.gradingLeaseExpiresAt = null;
    await attempt.save({ transaction });
    return true;
  });

  const finalizeSubmissionOnce = (reservation, score) => sequelize.transaction(async (transaction) => {
    const attempt = await requireOwnedAttempt(reservation.attemptId, reservation.studentId, transaction);
    if (attempt.status === ATTEMPT_STATUSES.SUBMITTED
      && attempt.submissionKey === reservation.submissionKey) return safeSubmittedResult(attempt);
    if (attempt.status !== ATTEMPT_STATUSES.GRADING
      || attempt.submissionKey !== reservation.submissionKey
      || attempt.gradingLeaseToken !== reservation.leaseToken) {
      fail("GRADING_LEASE_LOST", "Assessment grading reservation is no longer current");
    }

    const assessmentRow = await requireAssessment(attempt.assessmentId, transaction);
    const assessment = requirePublishedGraph(assessmentRow);
    requireMatchingVersion(attempt, assessment);
    if (Number(assessment.version) !== Number(reservation.assessment.version)) {
      fail("ASSESSMENT_VERSION_MISMATCH", "Assessment changed during grading");
    }
    const currentResponses = await AssessmentResponse.findAll({
      where: { attemptId: attempt.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const currentSnapshot = currentResponses.map((responseInput) => {
      const response = plain(responseInput);
      return {
        questionId: response.questionId,
        selectedChoiceId: response.selectedChoiceId ?? null,
        sourceCode: response.sourceCode ?? null,
      };
    }).sort((left, right) => Number(left.questionId) - Number(right.questionId));
    const reservedSnapshot = [...reservation.savedResponses]
      .sort((left, right) => Number(left.questionId) - Number(right.questionId));
    if (JSON.stringify(currentSnapshot) !== JSON.stringify(reservedSnapshot)) {
      fail("GRADING_SNAPSHOT_CHANGED", "Assessment responses changed during grading");
    }
    const responseByQuestion = new Map(currentResponses.map((response) => [String(response.questionId), response]));

    for (const graded of score.responses) {
      let response = responseByQuestion.get(String(graded.questionId));
      if (response) {
        response.selectedChoiceId = graded.selectedChoiceId;
        response.sourceCode = graded.sourceCode ?? null;
        response.isCorrect = graded.isCorrect;
        response.pointsAwarded = graded.pointsAwarded;
        await response.save({ transaction });
      } else {
        response = await AssessmentResponse.create({
          attemptId: attempt.id,
          ...graded,
        }, { transaction });
      }
    }

    if (assessment.type === ASSESSMENT_TYPES.PRE) {
      attempt.preBaselineStatus = await baselineService.classifyAtSubmission({
        assessment,
        attempt,
        studentId: reservation.studentId,
        transaction,
      });
    }
    attempt.status = ATTEMPT_STATUSES.SUBMITTED;
    attempt.submittedAt = now();
    attempt.pointsEarned = score.pointsEarned;
    attempt.maxPoints = score.maxPoints;
    attempt.percentage = score.percentage;
    attempt.correctCount = score.correctCount;
    attempt.questionCount = score.questionCount;
    attempt.passed = score.passed;
    attempt.passingPercentageApplied = assessment.type === "POST"
      ? Number(assessment.passingPercentage)
      : null;
    attempt.gradingLeaseToken = null;
    attempt.gradingLeaseExpiresAt = null;
    await attempt.save({ transaction });
    return safeSubmittedResult(attempt);
  });

  const transientFinalizationCode = (error) => (
    error?.code ?? error?.original?.code ?? error?.parent?.code
  );
  const finalizeSubmission = async (reservation, score) => {
    for (let attemptNumber = 1; attemptNumber <= 3; attemptNumber += 1) {
      try {
        return await finalizeSubmissionOnce(reservation, score);
      } catch (error) {
        const transient = ["40001", "40P01"].includes(transientFinalizationCode(error));
        if (!transient || attemptNumber === 3) throw error;
      }
    }
    throw new Error("Assessment finalization retry loop exhausted");
  };

  const submitAttempt = async ({ attemptId, studentId, submissionKey, expectedTarget }) => {
    const reservation = await reserveSubmission({ attemptId, studentId, submissionKey, expectedTarget });
    if (reservation.kind !== "execute") return reservation.result;
    try {
      const responseByQuestion = new Map(
        reservation.savedResponses.map((response) => [String(response.questionId), response]),
      );

      const authoritativeResponses = [];
      for (const question of reservation.presentedQuestions) {
        const saved = responseByQuestion.get(String(question.id));
        if (question.questionType === "CODING") {
          const graded = await gradeCodingQuestion({
            question,
            sourceCode: saved?.sourceCode ?? "",
            execute: (request) => secureCodingExecution.runSecureMethodExecution(request),
            executeProgram: (request) => secureCodingExecution.runSecureProgramExecution(request),
          });
          authoritativeResponses.push({
            questionId: question.id,
            sourceCode: saved?.sourceCode ?? "",
            ...graded,
          });
        } else {
          authoritativeResponses.push({
            questionId: question.id,
            selectedChoiceId: saved?.selectedChoiceId ?? null,
          });
        }
      }

      const score = calculateAssessmentScore({
        assessment: reservation.assessment,
        questions: reservation.presentedQuestions,
        responses: authoritativeResponses,
      });
      return await finalizeSubmission(reservation, score);
    } catch (error) {
      await releaseSubmission(reservation);
      throw error;
    }
  };

  const getAttemptResult = ({ attemptId, studentId }) => sequelize.transaction(async (transaction) => {
    const attempt = await requireOwnedAttempt(attemptId, studentId, transaction);
    if (attempt.status !== ATTEMPT_STATUSES.SUBMITTED) {
      fail("ATTEMPT_IN_PROGRESS", "Assessment attempt has not been submitted");
    }
    return safeSubmittedResult(attempt);
  });

  const assertAssessmentStructureMutable = async ({ assessmentId }) => {
    const attemptCount = await AssessmentAttempt.count({ where: { assessmentId } });
    try {
      return assertStructureMutablePolicy(attemptCount);
    } catch (error) {
      fail("ASSESSMENT_IMMUTABLE", error.message);
    }
  };

  return {
    assertAssessmentStructureMutable,
    getActiveAttempt,
    getAttemptResult,
    runPublicCodingQuestion,
    saveResponse,
    startOrResumeAttempt,
    submitAttempt,
  };
};

const defaultService = createAssessmentAttemptService();

module.exports = {
  AssessmentAttemptError,
  createAssessmentAttemptService,
  ...defaultService,
};
