const ASSESSMENT_TYPES = Object.freeze({ PRE: "PRE", POST: "POST" });
const QUESTION_TYPES = Object.freeze({
  MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
  TRUE_FALSE: "TRUE_FALSE",
  CODING: "CODING",
});
const CODING_TEST_VISIBILITIES = Object.freeze({ PUBLIC: "PUBLIC", HIDDEN: "HIDDEN" });
const CODING_EXECUTION_MODES = Object.freeze({ METHOD: "METHOD", PROGRAM: "PROGRAM" });
const ATTEMPT_STATUSES = Object.freeze({
  IN_PROGRESS: "IN_PROGRESS",
  GRADING: "GRADING",
  SUBMITTED: "SUBMITTED",
});
const PRE_BASELINE_STATUSES = Object.freeze({
  VALID: "VALID",
  RETROACTIVE: "RETROACTIVE",
  UNKNOWN: "UNKNOWN",
});
const GRADE_CALCULATIONS = Object.freeze({ FIRST: "FIRST", HIGHEST: "HIGHEST" });
const ANSWER_REVIEW_POLICIES = Object.freeze({
  NEVER: "NEVER",
  AFTER_SUBMISSION: "AFTER_SUBMISSION",
  AFTER_FINAL_ATTEMPT: "AFTER_FINAL_ATTEMPT",
});
const OBJECTIVE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Tutorial/prologue is intentionally excluded from the academic assessment set.
const ACADEMIC_LESSON_KEYS = Object.freeze([
  "arrays",
  "functions",
  "functions-with-arrays",
  "final",
]);

const ASSESSMENT_DEFAULTS = Object.freeze({
  PRE: Object.freeze({
    isRequired: true,
    isPublished: false,
    passingPercentage: null,
    maxAttempts: 1,
    gradeCalculation: GRADE_CALCULATIONS.FIRST,
    requirePassingForCompletion: false,
    showScoreAfterSubmission: true,
    answerReviewPolicy: ANSWER_REVIEW_POLICIES.NEVER,
    shuffleQuestions: true,
    shuffleChoices: true,
  }),
  POST: Object.freeze({
    isRequired: true,
    isPublished: false,
    passingPercentage: 75,
    maxAttempts: 3,
    gradeCalculation: GRADE_CALCULATIONS.HIGHEST,
    requirePassingForCompletion: true,
    showScoreAfterSubmission: true,
    answerReviewPolicy: ANSWER_REVIEW_POLICIES.AFTER_FINAL_ATTEMPT,
    shuffleQuestions: true,
    shuffleChoices: true,
  }),
});

const ASSESSMENT_LIMITS = Object.freeze({
  titleLength: 160,
  instructionsLength: 10_000,
  questionTextLength: 5_000,
  choiceTextLength: 2_000,
  objectiveKeyLength: 120,
  maxQuestions: 100,
  maxChoicesPerQuestion: 10,
  maxAttempts: 20,
  maxPoints: 10_000,
  pointPrecision: 2,
  submissionKeyLength: 96,
});

module.exports = {
  ACADEMIC_LESSON_KEYS,
  ANSWER_REVIEW_POLICIES,
  ASSESSMENT_DEFAULTS,
  ASSESSMENT_LIMITS,
  ASSESSMENT_TYPES,
  ATTEMPT_STATUSES,
  PRE_BASELINE_STATUSES,
  GRADE_CALCULATIONS,
  OBJECTIVE_KEY_PATTERN,
  QUESTION_TYPES,
  CODING_EXECUTION_MODES,
  CODING_TEST_VISIBILITIES,
};
