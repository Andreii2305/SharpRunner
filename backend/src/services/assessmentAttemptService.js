const defaultSequelize = require("../config/database");
const defaultModels = require("../models");
const {
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
} = {}) => {
  const {
    AssessmentAttempt,
    AssessmentChoice,
    AssessmentQuestion,
    AssessmentResponse,
    ClassroomMembership,
    LessonAssessment,
  } = models;

  const assessmentInclude = [{
    model: AssessmentQuestion,
    as: "questions",
    include: [{ model: AssessmentChoice, as: "choices" }],
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

  const startOrResumeAttempt = ({ assessmentId, studentId }) => sequelize.transaction(async (transaction) => {
    const assessmentRow = await requireAssessment(assessmentId, transaction, true);
    const assessment = requirePublishedGraph(assessmentRow);
    await requireMembership(assessment, studentId, transaction);

    const active = await AssessmentAttempt.findOne({
      where: { assessmentId: assessment.id, studentId, status: ATTEMPT_STATUSES.IN_PROGRESS },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (active) {
      requireMatchingVersion(active, assessment);
      return {
        attempt: safeAttempt(active),
        assessment: orderedPlayerAssessment(assessment, active),
        resumed: true,
      };
    }

    const attempts = await AssessmentAttempt.findAll({
      where: { assessmentId: assessment.id, studentId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const submittedCount = attempts.filter(
      (attempt) => attempt.status === ATTEMPT_STATUSES.SUBMITTED,
    ).length;
    if (submittedCount >= Number(assessment.maxAttempts)) {
      fail("MAX_ATTEMPTS", "Maximum assessment attempts reached");
    }

    const attemptNumber = attempts.reduce(
      (maximum, attempt) => Math.max(maximum, Number(attempt.attemptNumber)),
      0,
    ) + 1;
    const order = buildOrder(assessment);
    const created = await AssessmentAttempt.create({
      assessmentId: assessment.id,
      classroomId: assessment.classroomId,
      studentId,
      attemptNumber,
      status: ATTEMPT_STATUSES.IN_PROGRESS,
      assessmentVersion: assessment.version,
      startedAt: now(),
      questionOrder: order.questionOrder,
      choiceOrder: order.choiceOrder,
    }, { transaction });

    return {
      attempt: safeAttempt(created),
      assessment: orderedPlayerAssessment(assessment, created),
      resumed: false,
    };
  });

  const saveResponse = ({ attemptId, studentId, questionId, selectedChoiceId = null }) => sequelize.transaction(
    async (transaction) => {
      const attempt = await requireOwnedAttempt(attemptId, studentId, transaction);
      if (attempt.status !== ATTEMPT_STATUSES.IN_PROGRESS) {
        fail("ATTEMPT_SUBMITTED", "Submitted assessment attempts cannot be changed");
      }
      const assessmentRow = await requireAssessment(attempt.assessmentId, transaction);
      const assessment = requirePublishedGraph(assessmentRow);
      requireMatchingVersion(attempt, assessment);
      await requireMembership(assessment, studentId, transaction);

      if (!(attempt.questionOrder || []).some((id) => sameId(id, questionId))) {
        fail("QUESTION_NOT_PRESENTED", "Question was not presented in this attempt");
      }
      const question = assessment.questions.find((candidate) => sameId(candidate.id, questionId));
      if (!question) fail("QUESTION_NOT_PRESENTED", "Question does not belong to this assessment");
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
        response.isCorrect = false;
        response.pointsAwarded = 0;
        await response.save({ transaction });
      } else {
        response = await AssessmentResponse.create({
          attemptId: attempt.id,
          questionId: question.id,
          selectedChoiceId,
          isCorrect: false,
          pointsAwarded: 0,
        }, { transaction });
      }
      return { attemptId: attempt.id, questionId: question.id, selectedChoiceId };
    },
  );

  const submitAttempt = ({ attemptId, studentId, submissionKey }) => sequelize.transaction(
    async (transaction) => {
      const attempt = await requireOwnedAttempt(attemptId, studentId, transaction);
      if (attempt.status === ATTEMPT_STATUSES.SUBMITTED) {
        if (attempt.submissionKey === submissionKey) return safeSubmittedResult(attempt);
        fail("ATTEMPT_SUBMITTED", "Assessment attempt was already submitted");
      }
      if (!/^[A-Za-z0-9_-]{8,96}$/.test(String(submissionKey || ""))) {
        fail("INVALID_SUBMISSION_KEY", "submissionKey must be 8-96 URL-safe characters");
      }

      const reusedKey = await AssessmentAttempt.findOne({
        where: { submissionKey },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (reusedKey && !sameId(reusedKey.id, attempt.id)) {
        fail("SUBMISSION_KEY_CONFLICT", "submissionKey was already used for another attempt");
      }

      const assessmentRow = await requireAssessment(attempt.assessmentId, transaction);
      const assessment = requirePublishedGraph(assessmentRow);
      requireMatchingVersion(attempt, assessment);
      await requireMembership(assessment, studentId, transaction);

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
        responseByQuestion.set(String(response.questionId), response);
      }

      const score = calculateAssessmentScore({
        assessment,
        questions: presentedQuestions,
        responses: presentedQuestions.map((question) => ({
          questionId: question.id,
          selectedChoiceId: responseByQuestion.get(String(question.id))?.selectedChoiceId ?? null,
        })),
      });

      for (const graded of score.responses) {
        let response = responseByQuestion.get(String(graded.questionId));
        if (response) {
          response.selectedChoiceId = graded.selectedChoiceId;
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
      attempt.submissionKey = submissionKey;
      await attempt.save({ transaction });
      return safeSubmittedResult(attempt);
    },
  );

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
    getAttemptResult,
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
