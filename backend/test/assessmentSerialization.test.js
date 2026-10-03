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
    "referenceSolution", "codingTestCases", "visibility", "weight",
    "gradingLeaseToken", "gradingLeaseExpiresAt", "internalHarness", "harnessSource",
    "containerId", "runnerConfig",
  ]);
  assert.equal(findForbiddenKey(output, forbidden), null);
  assert.equal(output.attempt.responses[0].selectedChoiceId, 1001);
});

test("coding player and review DTOs expose public contract/source without mixed response fields", () => {
  const codingAssessment = assessment({
    questions: [{
      id: 202,
      questionText: "Add two values.",
      questionType: "CODING",
      points: 3,
      objectiveKey: "addition",
      starterCode: "return 0;",
      codingExecutionMode: "METHOD",
      referenceSolution: "return left + right;",
      codingTypeName: "Solution",
      codingMethodName: "Add",
      codingParameterTypes: ["int", "int"],
      codingParameterNames: ["left", "right"],
      codingReturnType: "int",
      codingTestCases: [
        { visibility: "PUBLIC", input: [1, 2], expectedOutput: 3, weight: 1 },
        { visibility: "HIDDEN", input: [9, 9], expectedOutput: 18, weight: 7 },
      ],
      choices: [],
    }],
  });
  const player = serializers.serializePlayerAttempt({
    assessment: codingAssessment,
    attempt: submittedAttempt(),
    responses: [{ questionId: 202, selectedChoiceId: null, sourceCode: "return left + right;" }],
    attemptsUsed: 1,
    maxAttempts: 3,
  });
  assert.deepEqual(player.responses[0], {
    questionId: 202,
    sourceCode: "return left + right;",
  });
  assert.deepEqual(player.assessment.questions[0].codingExamples, [
    { input: [1, 2], expectedOutput: 3 },
  ]);
  assert.equal(player.assessment.questions[0].executionMode, "METHOD");
  assert.deepEqual(player.assessment.questions[0].methodContract.parameterNames, ["left", "right"]);

  const review = serializers.serializeAllowedReview({
    reviewAvailable: true,
    scoreVisible: false,
    questions: codingAssessment.questions,
    responses: [{ questionId: 202, selectedChoiceId: null, sourceCode: "return left + right;" }],
  });
  assert.deepEqual(review.review[0], {
    questionId: 202,
    questionText: "Add two values.",
    sourceCode: "return left + right;",
  });

  const serialized = JSON.stringify({ player, review });
  assert.doesNotMatch(serialized, /referenceSolution|HIDDEN|weight|gradingLease|internalHarness|docker/i);
});

test("player serializers normalize legacy null starter source to an empty editor", () => {
  const codingAssessment = assessment({
    questions: [{
      id: 202,
      questionText: "Add two values.",
      questionType: "CODING",
      points: 3,
      starterCode: null,
      referenceSolution: null,
      codingExecutionMode: "METHOD",
      codingTypeName: "Solution",
      codingMethodName: "Add",
      codingParameterTypes: ["int", "int"],
      codingParameterNames: null,
      codingReturnType: "int",
      codingTestCases: [{ visibility: "HIDDEN", input: [1, 2], expectedOutput: 3, weight: 1 }],
      choices: [],
    }],
  });
  const serialized = serializers.serializePlayerAssessment(codingAssessment);
  assert.equal(serialized.questions[0].starterCode, "");
  assert.deepEqual(serialized.questions[0].methodContract.parameterNames, ["arg1", "arg2"]);
  assert.equal(serialized.questions[0].referenceSolution, undefined);
  assert.doesNotMatch(JSON.stringify(serialized), /referenceSolution|HIDDEN|weight|expectedOutput/);
});

test("teacher serializer preserves nullable legacy METHOD parameter names without writing fallbacks", () => {
  const codingAssessment = assessment({
    questions: [{
      id: 202, questionText: "Legacy method", questionType: "CODING", points: 3,
      starterCode: "", referenceSolution: "", codingExecutionMode: "METHOD",
      codingTypeName: "Solution", codingMethodName: "Add",
      codingParameterTypes: ["int", "int"], codingParameterNames: null, codingReturnType: "int",
      codingTestCases: [{ visibility: "PUBLIC", input: [1, 2], expectedOutput: 3, weight: 1 }],
      choices: [],
    }],
  });
  const editor = serializers.serializeTeacherEditor(codingAssessment);
  assert.equal(editor.questions[0].methodContract.parameterNames, null);
  assert.deepEqual(editor.questions[0].methodContract.parameterTypes, ["int", "int"]);
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

test("teacher recovery serializer exposes only the eight approved attempt fields", () => {
  const output = serializers.serializeTeacherGrantedAttempt({
    ...submittedAttempt({ status: "IN_PROGRESS", submittedAt: null }),
    questionOrder: [101],
    choiceOrder: { 101: [1001, 1002] },
    questions: assessment().questions,
  });
  assert.deepEqual(Object.keys(output), [
    "id", "assessmentId", "classroomId", "studentId", "attemptNumber",
    "status", "assessmentVersion", "startedAt",
  ]);
  assert.equal(findForbiddenKey(output, new Set([
    "questionOrder", "choiceOrder", "responses", "pointsEarned", "maxPoints",
    "percentage", "correctCount", "questionCount", "passed", "submissionKey",
    "questions", "choices", "isCorrect", "explanation",
  ])), null);
});

test("discovery uses assessment-state names and never lesson completion names", () => {
  const output = serializers.serializeDiscoveryStatus({
    assessment: assessment({ type: "PRE", maxAttempts: 1 }),
    available: true,
    unlocked: false,
    lockReason: "LESSON_PREREQUISITE_REQUIRED",
    attemptStatus: "SUBMITTED",
    attemptsUsed: 1,
    attemptsRemaining: 0,
    hasSubmittedAttempt: true,
    latestSubmitted: submittedAttempt(),
  });
  assert.equal(output.status.hasSubmittedAttempt, true);
  assert.equal(output.status.diagnosticCompleted, true);
  assert.equal(output.status.latestSubmittedAttemptId, 40);
  assert.equal(output.status.unlocked, false);
  assert.equal(output.status.lockReason, "LESSON_PREREQUISITE_REQUIRED");
  assert.equal(findForbiddenKey(output, new Set(["completed", "lessonCompleted"])), null);
});

test("discovery exposes a submitted attempt ID without hidden scores or answer keys", () => {
  const output = serializers.serializeDiscoveryStatus({
    assessment: assessment({ showScoreAfterSubmission: false }),
    available: true,
    unlocked: true,
    lockReason: null,
    postPassed: true,
    percentage: 100,
    pointsEarned: 2,
    latestSubmitted: submittedAttempt({
      answerKey: "private",
      correctAnswer: 1001,
      correctChoiceId: 1001,
      isCorrect: true,
      pointsAwarded: 2,
      explanation: "private",
    }),
    progressionState: {
      postPassed: true,
      percentage: 100,
      questions: assessment().questions,
      passingPercentage: 75,
    },
  });

  assert.equal(output.status.unlocked, true);
  assert.equal(output.status.lockReason, null);
  assert.equal(output.status.latestSubmittedAttemptId, 40);
  assert.equal(findForbiddenKey(output, new Set([
    "questions", "choices", "postPassed", "percentage", "pointsEarned", "maxPoints",
    "passingPercentage", "progressionState", "isCorrect", "correctChoiceId",
    "pointsAwarded", "correctAnswer", "answerKey", "explanation", "latestSubmitted",
  ])), null);
});

test("unavailable discovery cannot become an unlocked progression resource", () => {
  const output = serializers.serializeDiscoveryStatus({
    assessment: null,
    available: false,
    unlocked: true,
    lockReason: "GAME_INCOMPLETE",
    lessonKey: "arrays",
    type: "POST",
  });

  assert.equal(output.status.available, false);
  assert.equal(output.status.unlocked, false);
  assert.equal(output.status.lockReason, null);
  assert.equal(output.status.latestSubmittedAttemptId, null);
  assert.equal(output.assessment, null);
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
  for (const [code, message] of [
    ["POST_RECOVERY_NOT_ALLOWED", "An additional POST attempt cannot be granted for this assessment"],
    ["POST_ATTEMPTS_NOT_EXHAUSTED", "Ordinary POST attempts are not exhausted"],
    ["POST_ALREADY_PASSED", "The student already has a passing POST result"],
    ["ACTIVE_ATTEMPT_EXISTS", "The student already has an active assessment attempt"],
  ]) {
    const recovery = errors.translateAssessmentError({ code, message: "private detail" });
    assert.deepEqual({
      status: recovery.status,
      code: recovery.code,
      message: recovery.message,
    }, { status: 409, code, message });
  }
  assert.equal(errors.translateAssessmentError({
    name: "SequelizeUniqueConstraintError",
    parent: { constraint: "assessment_attempts_submission_key" },
  }).code, "SUBMISSION_CONFLICT");
  assert.equal(errors.translateAssessmentError({
    name: "SequelizeUniqueConstraintError",
    errors: [{ path: "submissionKey" }],
  }).code, "SUBMISSION_CONFLICT");
  const activeConflict = errors.translateAssessmentError({
    name: "SequelizeUniqueConstraintError",
    parent: { constraint: "assessment_attempts_one_in_progress" },
    errors: [{ path: "assessmentId" }],
  });
  assert.deepEqual({
    status: activeConflict.status,
    code: activeConflict.code,
    message: activeConflict.message,
  }, {
    status: 409,
    code: "ACTIVE_ATTEMPT_EXISTS",
    message: "The student already has an active assessment attempt",
  });
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

test("assessment progression errors expose only approved safe details", () => {
  const response = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  errors.sendAssessmentError(response, {
    name: "LessonProgressionError",
    code: "LESSON_PREREQUISITE_REQUIRED",
    message: "private source message",
    lessonKey: "functions",
    prerequisiteLessonKey: "arrays",
    nextAction: "COMPLETE_PREREQUISITE_LESSON",
    details: {
      answerKey: 1001,
      percentage: 100,
      sql: "SELECT private",
    },
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, {
    code: "LESSON_PREREQUISITE_REQUIRED",
    message: "Complete the prerequisite lesson before opening this lesson.",
    lessonKey: "functions",
    prerequisiteLessonKey: "arrays",
    nextAction: "COMPLETE_PREREQUISITE_LESSON",
  });

  const apiError = new errors.AssessmentApiError(409, "SAFE", "Safe", {
    currentVersion: 4,
    lessonKey: "arrays",
    assessmentId: 31,
    prerequisiteLessonKey: "tutorial",
    nextAction: "TAKE_PRE",
    arbitrary: "must-not-escape",
    nested: { answerKey: 1001 },
  });
  assert.deepEqual(apiError.details, {
    currentVersion: 4,
    lessonKey: "arrays",
    assessmentId: 31,
    prerequisiteLessonKey: "tutorial",
    nextAction: "TAKE_PRE",
  });
});
