const assert = require("node:assert/strict");
const { test } = require("node:test");

const serializers = require("../src/services/assessmentSerializationService");
const errors = require("../src/services/assessmentErrorService");

const findForbiddenKey = (value, keys) => {
  if (!value || typeof value !== "object") return null;
  for (const [key, nested] of Object.entries(value)) {
    if (keys.has(key)) return key;
    const found = findForbiddenKey(nested, keys);
    if (found) return found;
  }
  return null;
};

const assessment = (overrides = {}) => ({
  id: 10,
  classroomId: 3,
  lessonKey: "arrays",
  type: "POST",
  title: "Arrays post-test",
  instructions: "Choose one answer.",
  isRequired: true,
  isPublished: true,
  publishedAt: "2026-09-25T12:00:00.000Z",
  passingPercentage: 75,
  maxAttempts: 3,
  gradeCalculation: "HIGHEST",
  requirePassingForCompletion: true,
  showScoreAfterSubmission: true,
  answerReviewPolicy: "AFTER_FINAL_ATTEMPT",
  shuffleQuestions: true,
  shuffleChoices: true,
  createdBy: 7,
  version: 2,
  questions: [{
    id: 101,
    questionText: "Which array declaration is valid?",
    questionType: "MULTIPLE_CHOICE",
    displayOrder: 0,
    points: "2",
    explanation: "Brackets follow the type.",
    objectiveKey: "array-declaration",
    choices: [{
      id: 1001, choiceText: "int[] values", displayOrder: 0, isCorrect: true,
    }, {
      id: 1002, choiceText: "int values[]", displayOrder: 1, isCorrect: false,
    }],
  }],
  ...overrides,
});

const submittedAttempt = (overrides = {}) => ({
  id: 40,
  assessmentId: 10,
  classroomId: 3,
  studentId: 99,
  attemptNumber: 1,
  status: "SUBMITTED",
  assessmentVersion: 2,
  startedAt: "2026-09-25T12:00:00.000Z",
  submittedAt: "2026-09-25T12:10:00.000Z",
  pointsEarned: "8",
  maxPoints: "10",
  percentage: "80",
  correctCount: 4,
  questionCount: 5,
  passed: true,
  passingPercentageApplied: 75,
  submissionKey: "private-submission-key",
  ...overrides,
});

test("player serializers recursively exclude answer and teacher configuration fields", () => {
  const output = {
    assessment: serializers.serializePlayerAssessment(assessment()),
    attempt: serializers.serializePlayerAttempt({
      assessment: assessment(),
      attempt: submittedAttempt(),
      responses: [{
        questionId: 101,
        selectedChoiceId: 1001,
        isCorrect: true,
        pointsAwarded: 2,
      }],
      attemptsUsed: 1,
      maxAttempts: 3,
    }),
  };
  const forbidden = new Set([
    "isCorrect", "correctChoiceId", "explanation", "passingPercentage",
    "passingPercentageApplied", "gradeCalculation", "answerReviewPolicy",
    "createdBy", "studentId", "submissionKey", "pointsAwarded", "displayOrder",
  ]);
  assert.equal(findForbiddenKey(output, forbidden), null);
  assert.equal(output.attempt.responses[0].selectedChoiceId, 1001);
});

test("teacher editor serializer includes answer keys only after authorization", () => {
  const editor = serializers.serializeTeacherEditor(assessment(), {
    attemptsExist: true,
    structureLocked: true,
  });
  assert.equal(editor.questions[0].explanation, "Brackets follow the type.");
  assert.equal(editor.questions[0].choices[0].isCorrect, true);
  assert.equal(editor.structureLocked, true);

  const summary = serializers.serializeTeacherSummary({
    assessment: assessment(), questionCount: 1, attemptsExist: true,
  });
  assert.equal(summary.id, 10);
  assert.equal(summary.passingPercentage, 75);

  const results = serializers.serializeTeacherResults({
    assessment: assessment(),
    results: [{
      student: { id: 99, firstName: "Ada", lastName: "Learner", username: "ada", email: "private@example.com" },
      attempt: submittedAttempt(),
      isOfficial: true,
      isFirstSubmittedPost: true,
    }],
  });
  assert.equal(results.results[0].student.email, undefined);
  assert.equal(results.results[0].isOfficial, true);
});

test("discovery uses assessment-state names and never lesson completion names", () => {
  const output = serializers.serializeDiscoveryStatus({
    assessment: assessment({ type: "PRE", maxAttempts: 1 }),
    available: true,
    attemptStatus: "SUBMITTED",
    attemptsUsed: 1,
    attemptsRemaining: 0,
    hasSubmittedAttempt: true,
    latestSubmitted: submittedAttempt(),
  });
  assert.equal(output.status.hasSubmittedAttempt, true);
  assert.equal(output.status.diagnosticCompleted, true);
  assert.equal(findForbiddenKey(output, new Set(["completed", "lessonCompleted"])), null);
});

test("PRE student results omit passed", () => {
  const result = serializers.serializeStudentResult({
    assessment: assessment({ type: "PRE", passingPercentage: null }),
    attempt: submittedAttempt({ passed: null }),
  });
  assert.equal("passed" in result.result, false);
  assert.equal(result.result.percentage, 80);
});

test("hidden-score POST retains passed and omits every score and comparison field", () => {
  const result = serializers.serializeStudentResult({
    assessment: assessment({ showScoreAfterSubmission: false }),
    attempt: submittedAttempt(),
    officialGrade: submittedAttempt(),
    firstPost: submittedAttempt(),
    learningGain: { prePercentage: 60, value: 20 },
  });
  assert.equal(result.result.passed, true);
  for (const key of ["pointsEarned", "maxPoints", "percentage"]) {
    assert.equal(key in result.result, false);
  }
  for (const key of ["officialGrade", "firstPost", "prePercentage", "learningGain"]) {
    assert.equal(key in result, false);
  }
});

test("review serialization emits keys only for an explicitly allowed review", () => {
  assert.deepEqual(serializers.serializeAllowedReview({ reviewAvailable: false }), {
    reviewAvailable: false,
  });
  const review = serializers.serializeAllowedReview({
    reviewAvailable: true,
    questions: assessment().questions,
    responses: [{ questionId: 101, selectedChoiceId: 1001, pointsAwarded: 2 }],
  });
  assert.equal(review.reviewAvailable, true);
  assert.equal(review.review[0].correctChoiceId, 1001);
  assert.equal(review.review[0].explanation, "Brackets follow the type.");
  assert.equal(review.review[0].pointsAwarded, 2);
});

test("assessment errors translate Phase B and Sequelize conflicts without leaking internals", () => {
  const translated = errors.translateAssessmentError({
    code: "ASSESSMENT_UNAVAILABLE", message: "private detail",
  });
  assert.deepEqual({ status: translated.status, code: translated.code }, {
    status: 404, code: "ASSESSMENT_NOT_PUBLISHED",
  });
  const invalid = errors.translateAssessmentError({ code: "ASSESSMENT_INVALID" });
  assert.deepEqual({ status: invalid.status, code: invalid.code }, {
    status: 422, code: "ASSESSMENT_INVALID",
  });
  assert.equal(errors.translateAssessmentError({
    name: "SequelizeUniqueConstraintError",
    parent: { constraint: "assessment_attempts_submission_key" },
  }).code, "SUBMISSION_CONFLICT");
  assert.equal(errors.translateAssessmentError({
    name: "SequelizeUniqueConstraintError",
    errors: [{ path: "submissionKey" }],
  }).code, "SUBMISSION_CONFLICT");
  assert.equal(errors.translateAssessmentError({
    name: "SequelizeUniqueConstraintError",
    parent: { constraint: "lesson_assessments_classroom_lesson_type" },
  }).code, "ASSESSMENT_TYPE_EXISTS");

  const response = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    errors.sendAssessmentError(response, new Error("SELECT * FROM private_table"));
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { code: "SERVER_ERROR", message: "Server error" });

  errors.sendAssessmentError(response, { code: "ASSESSMENT_INVALID" });
  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.body, {
    code: "ASSESSMENT_INVALID", message: "Assessment graph is invalid",
  });
});
