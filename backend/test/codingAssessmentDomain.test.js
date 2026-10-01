const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  CodingAssessmentInfrastructureError,
  gradeCodingQuestion,
  isCodingAssessmentPlayerEnabled,
  validateCodingQuestion,
} = require("../src/services/codingAssessmentService");
const { shapePlayerAssessment } = require("../src/services/assessmentPolicyService");
const { serializeTeacherEditor } = require("../src/services/assessmentSerializationService");

const codingQuestion = (overrides = {}) => ({
  id: 11,
  questionText: "Add two integers.",
  questionType: "CODING",
  points: 10,
  starterCode: "public static class Solution { public static int Add(int a, int b) => 0; }",
  codingTypeName: "Solution",
  codingMethodName: "Add",
  codingParameterTypes: ["int", "int"],
  codingReturnType: "int",
  choices: [],
  codingTestCases: [
    { id: 1, displayOrder: 0, visibility: "PUBLIC", input: [1, 2], expectedOutput: 3, weight: 1 },
    { id: 2, displayOrder: 1, visibility: "HIDDEN", input: [5, 7], expectedOutput: 12, weight: 3 },
  ],
  ...overrides,
});

test("CODING publish validation accepts the METHOD allowlist and requires hidden grading tests", () => {
  assert.doesNotThrow(() => validateCodingQuestion(codingQuestion(), { publish: true }));
  assert.throws(
    () => validateCodingQuestion(codingQuestion({ codingReturnType: "double" }), { publish: true }),
    /unsupported/i,
  );
  assert.throws(
    () => validateCodingQuestion(codingQuestion({ codingTestCases: [codingQuestion().codingTestCases[0]] }), { publish: true }),
    /hidden/i,
  );
});

test("student CODING graph exposes public examples but recursively excludes hidden grading data", () => {
  const shaped = shapePlayerAssessment({
    id: 7,
    lessonKey: "arrays",
    type: "POST",
    title: "Coding",
    version: 1,
    questions: [codingQuestion()],
  });
  const serialized = JSON.stringify(shaped);
  assert.equal(shaped.questions[0].codingExamples.length, 1);
  assert.equal(shaped.questions[0].codingExamples[0].expectedOutput, 3);
  assert.doesNotMatch(serialized, /HIDDEN/);
  assert.doesNotMatch(serialized, /\[5,7\]/);
  assert.doesNotMatch(serialized, /"weight"/);
});

test("coding grading awards deterministic weighted partial credit", async () => {
  const result = await gradeCodingQuestion({
    question: codingQuestion(),
    sourceCode: codingQuestion().starterCode,
    execute: async () => ({
      category: "RUNTIME_ERROR",
      invocations: [
        { category: "SUCCESS", output: 3 },
        { category: "RUNTIME_ERROR" },
      ],
    }),
  });
  assert.deepEqual(result, { isCorrect: false, pointsAwarded: 2.5 });
});

test("coding points use deterministic two-decimal rounding", async () => {
  const question = codingQuestion({
    points: 1,
    codingTestCases: [
      { displayOrder: 0, visibility: "PUBLIC", input: [1, 2], expectedOutput: 3, weight: 1 },
      { displayOrder: 1, visibility: "HIDDEN", input: [2, 3], expectedOutput: 5, weight: 2 },
    ],
  });
  const result = await gradeCodingQuestion({
    question,
    sourceCode: question.starterCode,
    execute: async () => ({
      category: "RUNTIME_ERROR",
      invocations: [{ category: "SUCCESS", output: 3 }, { category: "RUNTIME_ERROR" }],
    }),
  });
  assert.deepEqual(result, { isCorrect: false, pointsAwarded: 0.33 });
});

test("coding assessment player release gate defaults off and requires explicit enablement", () => {
  assert.equal(isCodingAssessmentPlayerEnabled({}), false);
  assert.equal(isCodingAssessmentPlayerEnabled({ CODING_ASSESSMENT_PLAYER_ENABLED: "false" }), false);
  assert.equal(isCodingAssessmentPlayerEnabled({ CODING_ASSESSMENT_PLAYER_ENABLED: "true" }), true);
});

test("coding grading treats compile, signature, runtime, timeout, and resource outcomes as student zeroes", async () => {
  for (const category of [
    "COMPILE_ERROR", "SIGNATURE_ERROR", "RUNTIME_ERROR", "TIMEOUT", "RESOURCE_LIMIT",
  ]) {
    const result = await gradeCodingQuestion({
      question: codingQuestion(),
      sourceCode: codingQuestion().starterCode,
      execute: async () => ({ category }),
    });
    assert.deepEqual(result, { isCorrect: false, pointsAwarded: 0 });
  }
});

test("coding grading awards full credit only when every authoritative test passes", async () => {
  const result = await gradeCodingQuestion({
    question: codingQuestion(),
    sourceCode: codingQuestion().starterCode,
    execute: async () => ({
      category: "SUCCESS",
      invocations: [
        { category: "SUCCESS", output: 3 },
        { category: "SUCCESS", output: 12 },
      ],
    }),
  });
  assert.deepEqual(result, { isCorrect: true, pointsAwarded: 10 });
});

test("secure execution infrastructure failure aborts coding grading", async () => {
  await assert.rejects(
    gradeCodingQuestion({
      question: codingQuestion(),
      sourceCode: codingQuestion().starterCode,
      execute: async () => ({ category: "INFRASTRUCTURE_ERROR", code: "SECURE_EXECUTION_UNAVAILABLE" }),
    }),
    CodingAssessmentInfrastructureError,
  );
});

test("malformed secure runner output aborts coding grading", async () => {
  await assert.rejects(
    gradeCodingQuestion({
      question: codingQuestion(),
      sourceCode: codingQuestion().starterCode,
      execute: async () => ({}),
    }),
    CodingAssessmentInfrastructureError,
  );
});

test("authorized teacher graph retains complete public and hidden coding configuration", () => {
  const serialized = serializeTeacherEditor({
    id: 7,
    classroomId: 3,
    lessonKey: "arrays",
    type: "POST",
    title: "Coding",
    maxAttempts: 3,
    gradeCalculation: "HIGHEST",
    requirePassingForCompletion: true,
    showScoreAfterSubmission: true,
    answerReviewPolicy: "AFTER_SUBMISSION",
    shuffleQuestions: false,
    shuffleChoices: false,
    version: 1,
    questions: [codingQuestion()],
  });
  assert.equal(serialized.questions[0].codingTestCases.length, 2);
  assert.equal(serialized.questions[0].codingTestCases[1].visibility, "HIDDEN");
  assert.equal(serialized.questions[0].codingTestCases[1].expectedOutput, 12);
  assert.deepEqual(serialized.questions[0].methodContract.parameterTypes, ["int", "int"]);
});
