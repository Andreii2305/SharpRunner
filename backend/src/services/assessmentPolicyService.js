const {
  ACADEMIC_LESSON_KEYS,
  ANSWER_REVIEW_POLICIES,
  ASSESSMENT_DEFAULTS,
  ASSESSMENT_LIMITS,
  ASSESSMENT_TYPES,
  ATTEMPT_STATUSES,
  GRADE_CALCULATIONS,
  OBJECTIVE_KEY_PATTERN,
  QUESTION_TYPES,
} = require("../constants/assessmentConfig");

const values = (object) => new Set(Object.values(object));
const ASSESSMENT_TYPE_SET = values(ASSESSMENT_TYPES);
const QUESTION_TYPE_SET = values(QUESTION_TYPES);
const ANSWER_REVIEW_POLICY_SET = values(ANSWER_REVIEW_POLICIES);
const ACADEMIC_LESSON_KEY_SET = new Set(ACADEMIC_LESSON_KEYS);
const POINT_SCALE = 10 ** ASSESSMENT_LIMITS.pointPrecision;

const plain = (value) => value?.toJSON ? value.toJSON() : value;
const roundPercentage = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const pointUnits = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > ASSESSMENT_LIMITS.maxPoints) {
    throw new TypeError("Question points must be positive");
  }
  const units = Math.round(parsed * POINT_SCALE);
  if (Math.abs(units / POINT_SCALE - parsed) > Number.EPSILON * 10) {
    throw new TypeError(`Question points support at most ${ASSESSMENT_LIMITS.pointPrecision} decimal places`);
  }
  return units;
};

const validateObjectiveKey = (value) => {
  if (value == null || value === "") return null;
  const normalized = String(value);
  if (normalized.length > ASSESSMENT_LIMITS.objectiveKeyLength
    || !OBJECTIVE_KEY_PATTERN.test(normalized)) {
    throw new TypeError("Objective key must use lowercase kebab-case");
  }
  return normalized;
};

const normalizeAssessmentConfiguration = (input = {}) => {
  const type = String(input.type || "").trim().toUpperCase();
  if (!ASSESSMENT_TYPE_SET.has(type)) throw new TypeError("Assessment type must be PRE or POST");
  return { ...ASSESSMENT_DEFAULTS[type], ...input, type };
};

const validateAssessmentConfiguration = (input = {}) => {
  const assessment = normalizeAssessmentConfiguration(input);
  if (!ACADEMIC_LESSON_KEY_SET.has(assessment.lessonKey)) {
    throw new TypeError("Assessment lessonKey must be a valid academic lesson key");
  }
  if (!Number.isInteger(Number(assessment.maxAttempts))
    || Number(assessment.maxAttempts) < 1
    || Number(assessment.maxAttempts) > ASSESSMENT_LIMITS.maxAttempts) {
    throw new TypeError(`Assessment maxAttempts must be between 1 and ${ASSESSMENT_LIMITS.maxAttempts}`);
  }
  if (!ANSWER_REVIEW_POLICY_SET.has(assessment.answerReviewPolicy)) {
    throw new TypeError("Assessment answer review policy is invalid");
  }

  if (assessment.type === ASSESSMENT_TYPES.PRE) {
    if (Number(assessment.maxAttempts) !== 1) {
      throw new TypeError("PRE assessment must allow exactly one attempt");
    }
    if (assessment.gradeCalculation !== GRADE_CALCULATIONS.FIRST) {
      throw new TypeError("PRE grade calculation must be FIRST");
    }
    if (assessment.passingPercentage != null) {
      throw new TypeError("PRE assessment cannot have a passing percentage");
    }
    if (assessment.requirePassingForCompletion) {
      throw new TypeError("PRE assessment cannot require passing");
    }
  } else {
    const threshold = Number(assessment.passingPercentage);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      throw new TypeError("POST passing percentage must be between 0 and 100");
    }
    if (assessment.gradeCalculation !== GRADE_CALCULATIONS.HIGHEST) {
      throw new TypeError("POST grade calculation must be HIGHEST in V1");
    }
  }
  return assessment;
};

const validateQuestionPersistence = (questionInput) => {
  const question = plain(questionInput) || {};
  if (!QUESTION_TYPE_SET.has(question.questionType)) {
    throw new TypeError("Question type must be MULTIPLE_CHOICE or TRUE_FALSE");
  }
  if (!String(question.questionText || "").trim()) {
    throw new TypeError("Question text is required");
  }
  if (String(question.questionText).length > ASSESSMENT_LIMITS.questionTextLength) {
    throw new TypeError(`Question text cannot exceed ${ASSESSMENT_LIMITS.questionTextLength} characters`);
  }
  const units = pointUnits(question.points);
  validateObjectiveKey(question.objectiveKey);
  if (question.choices != null && !Array.isArray(question.choices)) {
    throw new TypeError("Question choices must be an array");
  }
  const choices = (question.choices || []).map(plain);
  if (choices.length > ASSESSMENT_LIMITS.maxChoicesPerQuestion) {
    throw new TypeError("A question cannot exceed the maximum choices");
  }
  if (choices.some((choice) => !String(choice.choiceText || "").trim())) {
    throw new TypeError("Choice text is required for every choice");
  }
  if (choices.some((choice) => String(choice.choiceText).length > ASSESSMENT_LIMITS.choiceTextLength)) {
    throw new TypeError(`Choice text cannot exceed ${ASSESSMENT_LIMITS.choiceTextLength} characters`);
  }
  if (choices.some((choice) => Object.hasOwn(choice, "isCorrect")
    && typeof choice.isCorrect !== "boolean")) {
    throw new TypeError("Choice correctness must be a boolean");
  }
  return { question, choices, pointUnits: units };
};

const validateQuestion = (questionInput) => {
  const { question, choices, pointUnits: units } = validateQuestionPersistence(questionInput);
  if (question.questionType === QUESTION_TYPES.TRUE_FALSE && choices.length !== 2) {
    throw new TypeError("TRUE_FALSE must have exactly two choices");
  }
  if (choices.length < 2 || choices.length > ASSESSMENT_LIMITS.maxChoicesPerQuestion) {
    throw new TypeError("A question must have valid choices");
  }
  const choiceIds = choices.map((choice) => String(choice.id));
  if (new Set(choiceIds).size !== choiceIds.length) {
    throw new TypeError("Question choices must have unique identifiers");
  }
  const correctCount = choices.filter((choice) => choice.isCorrect === true).length;
  if (correctCount !== 1) throw new TypeError("A question must have exactly one correct choice");
  if (question.questionType === QUESTION_TYPES.TRUE_FALSE) {
    const labels = new Set(choices.map((choice) => String(choice.choiceText || "").trim().toLowerCase()));
    if (!labels.has("true") || !labels.has("false")) {
      throw new TypeError("TRUE_FALSE choices must be True and False");
    }
  }
  return { question, choices, pointUnits: units };
};

const validateAssessmentDraft = ({ assessment: input, questions: questionInputs = [] }) => {
  const assessment = validateAssessmentConfiguration(input);
  if (!String(assessment.title || "").trim()) {
    throw new TypeError("Assessment title is required");
  }
  if (String(assessment.title).length > ASSESSMENT_LIMITS.titleLength) {
    throw new TypeError(`Assessment title cannot exceed ${ASSESSMENT_LIMITS.titleLength} characters`);
  }
  if (assessment.instructions != null
    && String(assessment.instructions).length > ASSESSMENT_LIMITS.instructionsLength) {
    throw new TypeError(`Assessment instructions cannot exceed ${ASSESSMENT_LIMITS.instructionsLength} characters`);
  }
  if (!Array.isArray(questionInputs)) {
    throw new TypeError("Assessment questions must be an array");
  }
  if (questionInputs.length > ASSESSMENT_LIMITS.maxQuestions) {
    throw new TypeError(`An assessment cannot exceed ${ASSESSMENT_LIMITS.maxQuestions} questions`);
  }
  const questions = questionInputs.map(validateQuestionPersistence);
  return { assessment, questionCount: questions.length };
};

const validateAssessmentForPublish = ({ assessment: input, questions: questionInputs = [] }) => {
  const assessment = validateAssessmentConfiguration(input);
  if (!Array.isArray(questionInputs) || questionInputs.length < 1) {
    throw new TypeError("A published assessment must have at least one question");
  }
  if (questionInputs.length > ASSESSMENT_LIMITS.maxQuestions) {
    throw new TypeError(`An assessment cannot exceed ${ASSESSMENT_LIMITS.maxQuestions} questions`);
  }
  const questions = questionInputs.map(validateQuestion);
  const totalUnits = questions.reduce((sum, item) => sum + item.pointUnits, 0);
  if (totalUnits <= 0) throw new TypeError("Assessment total possible points must be positive");
  return {
    assessment,
    questionCount: questions.length,
    totalPossiblePoints: totalUnits / POINT_SCALE,
  };
};

const calculateAssessmentScore = ({ assessment: input, questions: questionInputs = [], responses = [] }) => {
  const assessment = validateAssessmentConfiguration({ lessonKey: "arrays", ...plain(input) });
  const questions = questionInputs.map(validateQuestion);
  if (!questions.length) throw new TypeError("Cannot grade an assessment without questions");
  const responseByQuestion = new Map(responses.map((response) => [
    String(response.questionId),
    response,
  ]));
  let earnedUnits = 0;
  let maxUnits = 0;
  let correctCount = 0;
  const gradedResponses = questions.map(({ question, choices, pointUnits: units }) => {
    maxUnits += units;
    const response = responseByQuestion.get(String(question.id));
    const selectedChoiceId = response?.selectedChoiceId ?? null;
    const selected = choices.find((choice) => String(choice.id) === String(selectedChoiceId));
    const isCorrect = Boolean(selected?.isCorrect);
    if (isCorrect) {
      earnedUnits += units;
      correctCount += 1;
    }
    return {
      questionId: question.id,
      selectedChoiceId,
      isCorrect,
      pointsAwarded: isCorrect ? units / POINT_SCALE : 0,
    };
  });
  if (maxUnits <= 0) throw new TypeError("Assessment total possible points must be positive");
  const percentage = roundPercentage((earnedUnits * 100) / maxUnits);
  const thresholdHundredths = Math.round(Number(assessment.passingPercentage) * 100);
  const passed = assessment.type === ASSESSMENT_TYPES.PRE
    ? null
    : earnedUnits * 10_000 >= thresholdHundredths * maxUnits;
  return {
    pointsEarned: earnedUnits / POINT_SCALE,
    maxPoints: maxUnits / POINT_SCALE,
    percentage,
    correctCount,
    questionCount: questions.length,
    passed,
    responses: gradedResponses,
  };
};

const submittedAttempts = (attempts = []) => attempts
  .map(plain)
  .filter((attempt) => attempt?.status === ATTEMPT_STATUSES.SUBMITTED);

const timestamp = (value) => {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

const selectOfficialPostAttempt = (attempts = []) => submittedAttempts(attempts)
  .sort((left, right) => Number(right.percentage) - Number(left.percentage)
    || timestamp(left.submittedAt) - timestamp(right.submittedAt)
    || Number(left.attemptNumber) - Number(right.attemptNumber))[0] ?? null;

const selectFirstSubmittedPostAttempt = (attempts = []) => submittedAttempts(attempts)
  .sort((left, right) => Number(left.attemptNumber) - Number(right.attemptNumber)
    || timestamp(left.submittedAt) - timestamp(right.submittedAt))[0] ?? null;

const calculateLearningGain = (preAttempt, postAttempts = []) => {
  const pre = plain(preAttempt);
  const firstPost = Array.isArray(postAttempts)
    ? selectFirstSubmittedPostAttempt(postAttempts)
    : plain(postAttempts);
  if (!pre || !firstPost || !Number.isFinite(Number(pre.percentage))
    || !Number.isFinite(Number(firstPost.percentage))) return null;
  const value = roundPercentage(Number(firstPost.percentage) - Number(pre.percentage));
  const label = `${value > 0 ? "+" : ""}${value} percentage points`;
  return {
    value,
    unit: "percentage points",
    label,
    prePercentage: Number(pre.percentage),
    firstPostPercentage: Number(firstPost.percentage),
  };
};

const shapePlayerAssessment = (assessmentInput) => {
  const assessment = plain(assessmentInput) || {};
  return {
    id: assessment.id,
    lessonKey: assessment.lessonKey,
    type: assessment.type,
    title: assessment.title,
    instructions: assessment.instructions ?? null,
    version: assessment.version,
    questions: (assessment.questions || []).map((questionInput) => {
      const question = plain(questionInput);
      return {
        id: question.id,
        questionText: question.questionText,
        questionType: question.questionType,
        displayOrder: question.displayOrder,
        points: Number(question.points),
        objectiveKey: question.objectiveKey ?? null,
        choices: (question.choices || []).map((choiceInput) => {
          const choice = plain(choiceInput);
          return {
            id: choice.id,
            choiceText: choice.choiceText,
            displayOrder: choice.displayOrder,
          };
        }),
      };
    }),
  };
};

const assertAssessmentStructureMutable = (attemptCount) => {
  if (Number(attemptCount) > 0) {
    throw new TypeError("Assessment structure is immutable after the first student attempt");
  }
  return true;
};

module.exports = {
  assertAssessmentStructureMutable,
  calculateAssessmentScore,
  calculateLearningGain,
  normalizeAssessmentConfiguration,
  selectFirstSubmittedPostAttempt,
  selectOfficialPostAttempt,
  shapePlayerAssessment,
  validateAssessmentConfiguration,
  validateAssessmentDraft,
  validateAssessmentForPublish,
  validateObjectiveKey,
  OBJECTIVE_KEY_PATTERN,
};
