const assert = require("node:assert/strict");
const { test } = require("node:test");

let config = null;
let policy = null;

try {
  config = require("../src/constants/assessmentConfig");
  policy = require("../src/services/assessmentPolicyService");
} catch {
  // The first TDD run intentionally reaches the assertions before the
  // assessment domain exists.
}

const multipleChoice = (overrides = {}) => ({
  id: 11,
  questionText: "Which declaration creates an integer array?",
  questionType: "MULTIPLE_CHOICE",
  displayOrder: 1,
  points: 1,
  explanation: "int[] declares an integer array.",
  choices: [
    { id: 101, choiceText: "int[] values", displayOrder: 1, isCorrect: true },
    { id: 102, choiceText: "int values[]", displayOrder: 2, isCorrect: false },
  ],
  ...overrides,
});

const trueFalse = (overrides = {}) => ({
  id: 12,
  questionText: "Array indexes begin at zero.",
  questionType: "TRUE_FALSE",
  displayOrder: 2,
  points: 1,
  choices: [
    { id: 201, choiceText: "True", displayOrder: 1, isCorrect: true },
    { id: 202, choiceText: "False", displayOrder: 2, isCorrect: false },
  ],
  ...overrides,
});

test("assessment defaults keep PRE diagnostic and POST highest-attempt grading", () => {
  assert.ok(config, "assessmentConfig must exist");
  assert.ok(policy, "assessmentPolicyService must exist");

  const pre = policy.normalizeAssessmentConfiguration({
    lessonKey: "arrays",
    type: config.ASSESSMENT_TYPES.PRE,
  });
  assert.equal(pre.maxAttempts, 1);
  assert.equal(pre.gradeCalculation, config.GRADE_CALCULATIONS.FIRST);
  assert.equal(pre.passingPercentage, null);
  assert.equal(pre.requirePassingForCompletion, false);

  const post = policy.normalizeAssessmentConfiguration({
    lessonKey: "arrays",
    type: config.ASSESSMENT_TYPES.POST,
  });
  assert.equal(post.maxAttempts, 3);
  assert.equal(post.gradeCalculation, config.GRADE_CALCULATIONS.HIGHEST);
  assert.equal(post.passingPercentage, 75);
});

test("configuration validation enforces academic lesson keys and PRE invariants", () => {
  assert.doesNotThrow(() => policy.validateAssessmentConfiguration({
    lessonKey: "arrays",
    type: "PRE",
    maxAttempts: 1,
    gradeCalculation: "FIRST",
    passingPercentage: null,
    requirePassingForCompletion: false,
  }));
  assert.throws(() => policy.validateAssessmentConfiguration({
    lessonKey: "arrays", type: "PRE", maxAttempts: 2,
  }), /PRE assessment must allow exactly one attempt/);
  assert.throws(() => policy.validateAssessmentConfiguration({
    lessonKey: "arrays", type: "PRE", requirePassingForCompletion: true,
  }), /PRE assessment cannot require passing/);
  assert.throws(() => policy.validateAssessmentConfiguration({
    lessonKey: "tutorial", type: "PRE",
  }), /academic lesson key/);
  assert.throws(() => policy.validateAssessmentConfiguration({
    lessonKey: "arrays", type: "POST", gradeCalculation: "FIRST",
  }), /POST grade calculation must be HIGHEST/);
});

test("publishability validates MCQ and TRUE_FALSE answer graphs", () => {
  const valid = policy.validateAssessmentForPublish({
    assessment: { lessonKey: "arrays", type: "POST" },
    questions: [multipleChoice(), trueFalse()],
  });
  assert.equal(valid.questionCount, 2);
  assert.equal(valid.totalPossiblePoints, 2);

  assert.throws(() => policy.validateAssessmentForPublish({
    assessment: { lessonKey: "arrays", type: "POST" },
    questions: [],
  }), /at least one question/);
  assert.throws(() => policy.validateAssessmentForPublish({
    assessment: { lessonKey: "arrays", type: "POST" },
    questions: [multipleChoice({ points: 0 })],
  }), /points must be positive/);
  assert.throws(() => policy.validateAssessmentForPublish({
    assessment: { lessonKey: "arrays", type: "POST" },
    questions: [multipleChoice({ choices: [
      { id: 1, choiceText: "One", isCorrect: false },
      { id: 2, choiceText: "Two", isCorrect: false },
    ] })],
  }), /exactly one correct choice/);
  assert.throws(() => policy.validateAssessmentForPublish({
    assessment: { lessonKey: "arrays", type: "POST" },
    questions: [multipleChoice({ choices: [
      { id: 1, choiceText: "One", isCorrect: true },
      { id: 2, choiceText: "Two", isCorrect: true },
    ] })],
  }), /exactly one correct choice/);
  assert.throws(() => policy.validateAssessmentForPublish({
    assessment: { lessonKey: "arrays", type: "POST" },
    questions: [multipleChoice({ choices: [
      { id: 1, choiceText: "", isCorrect: true },
      { id: 2, choiceText: "Valid", isCorrect: false },
    ] })],
  }), /choice text is required/i);
  assert.throws(() => policy.validateAssessmentForPublish({
    assessment: { lessonKey: "arrays", type: "POST" },
    questions: [trueFalse({ choices: [{ id: 1, choiceText: "True", isCorrect: true }] })],
  }), /exactly two choices/);
  assert.throws(() => policy.validateAssessmentForPublish({
    assessment: { lessonKey: "arrays", type: "POST" },
    questions: [trueFalse({ choices: [
      { id: 1, choiceText: "Yes", isCorrect: true },
      { id: 2, choiceText: "No", isCorrect: false },
    ] })],
  }), /true and false/i);
});

test("draft validation permits incomplete graphs but enforces persistence-safe fields", () => {
  assert.doesNotThrow(() => policy.validateAssessmentDraft({
    assessment: { lessonKey: "arrays", type: "POST", title: "Draft" },
    questions: [],
  }));
  assert.doesNotThrow(() => policy.validateAssessmentDraft({
    assessment: { lessonKey: "arrays", type: "POST", title: "Draft" },
    questions: [{
      questionText: "Work in progress",
      questionType: "MULTIPLE_CHOICE",
      points: 1,
      objectiveKey: "array-declaration",
      choices: [{ choiceText: "Only choice", isCorrect: false }],
    }],
  }));
  assert.throws(() => policy.validateAssessmentDraft({
    assessment: { lessonKey: "arrays", type: "POST", title: " " },
    questions: [],
  }), /title/i);
  assert.throws(() => policy.validateAssessmentDraft({
    assessment: { lessonKey: "arrays", type: "POST", title: "Draft" },
    questions: [{
      questionText: "Valid question",
      questionType: "MULTIPLE_CHOICE",
      points: 1,
      choices: [{ choiceText: "Valid choice", isCorrect: "false" }],
    }],
  }), /correct/i);
  assert.doesNotThrow(() => policy.validateAssessmentDraft({
    assessment: { lessonKey: "arrays", type: "POST", title: "Draft" },
    questions: [{
      questionText: "Valid question",
      questionType: "MULTIPLE_CHOICE",
      points: 1,
      choices: [{ choiceText: "Incomplete choice" }],
    }],
  }));
  assert.throws(() => policy.validateAssessmentDraft({
    assessment: { lessonKey: "arrays", type: "POST", title: "Draft" },
    questions: [{
      questionText: "Valid question",
      questionType: "MULTIPLE_CHOICE",
      points: 1,
      choices: [{ choiceText: "Invalid choice", isCorrect: null }],
    }],
  }), /correct/i);
  assert.throws(() => policy.validateAssessmentDraft({
    assessment: { lessonKey: "arrays", type: "POST", title: "Draft" },
    questions: [{
      questionText: "Incomplete coding draft",
      questionType: "CODING",
      points: 1,
      choices: [],
      codingTestCases: [{ visibility: "PUBLIC", input: [], expectedOutput: 1, weight: 1.234 }],
    }],
  }), /weight/i);
  assert.throws(() => policy.validateAssessmentDraft({
    assessment: { lessonKey: "arrays", type: "POST", title: "Draft" },
    questions: [{
      questionText: "Complete contract with malformed typed input",
      questionType: "CODING",
      points: 1,
      choices: [],
      starterCode: null,
      referenceSolution: null,
      codingTypeName: "Solution",
      codingMethodName: "Solve",
      codingParameterTypes: ["int"],
      codingReturnType: "int",
      codingTestCases: [{ displayOrder: 0, visibility: "HIDDEN", input: ["not-an-int"], expectedOutput: 1, weight: 1 }],
    }],
  }), /unsupported/i);
});

test("draft policy validates explicit METHOD parameter names without requiring grading tests", () => {
  const codingDraft = (overrides = {}) => ({
    questionText: "Work in progress method",
    questionType: "CODING",
    points: 1,
    choices: [],
    starterCode: "",
    referenceSolution: "",
    codingExecutionMode: "METHOD",
    codingTypeName: "Solution",
    codingMethodName: "CountAbove",
    codingParameterTypes: ["int[]", "int"],
    codingParameterNames: ["numbers", "limit"],
    codingReturnType: "int",
    codingTestCases: [],
    ...overrides,
  });
  const validate = (question) => policy.validateAssessmentDraft({
    assessment: { lessonKey: "arrays", type: "POST", title: "Draft" },
    questions: [question],
  });

  assert.doesNotThrow(() => validate(codingDraft()));
  assert.doesNotThrow(() => validate(codingDraft({ codingParameterNames: null })));
  assert.throws(() => validate(codingDraft({ codingParameterNames: ["numbers"] })), /parameter/i);
  assert.throws(() => validate(codingDraft({ codingParameterNames: ["class", "limit"] })), /parameter/i);
  assert.throws(() => validate(codingDraft({ codingParameterNames: ["numbers", "numbers"] })), /parameter/i);
  assert.throws(() => validate(codingDraft({ codingParameterNames: ["numbers", 7] })), /parameter/i);
  assert.throws(() => validate(codingDraft({ codingParameterNames: "numbers" })), /parameter/i);

  assert.throws(() => validate(multipleChoice({ codingParameterNames: ["numbers"] })), /coding configuration/i);
  assert.throws(() => validate(trueFalse({ codingParameterNames: ["numbers"] })), /coding configuration/i);
  assert.throws(() => validate(codingDraft({
    codingExecutionMode: "PROGRAM",
    codingTypeName: null,
    codingMethodName: null,
    codingParameterTypes: null,
    codingParameterNames: ["numbers"],
    codingReturnType: null,
  })), /parameter|configuration/i);
});

test("objective keys use the minimal lowercase kebab-case contract", () => {
  assert.equal(policy.validateObjectiveKey(null), null);
  assert.equal(policy.validateObjectiveKey("array-declaration-2"), "array-declaration-2");
  for (const value of ["Array", "array key", "array_key", "-array", "array-", "array--key"]) {
    assert.throws(() => policy.validateObjectiveKey(value), /objective key/i);
  }
});

test("weighted scoring is server-derived and PRE never receives pass-fail status", () => {
  const questions = [
    multipleChoice({ points: 1 }),
    trueFalse({ points: 2 }),
  ];
  const responses = [
    { questionId: 11, selectedChoiceId: 101 },
    { questionId: 12, selectedChoiceId: 202 },
  ];

  const pre = policy.calculateAssessmentScore({
    assessment: { type: "PRE", passingPercentage: null },
    questions,
    responses,
  });
  assert.deepEqual({
    pointsEarned: pre.pointsEarned,
    maxPoints: pre.maxPoints,
    percentage: pre.percentage,
    correctCount: pre.correctCount,
    questionCount: pre.questionCount,
    passed: pre.passed,
  }, {
    pointsEarned: 1,
    maxPoints: 3,
    percentage: 33.33,
    correctCount: 1,
    questionCount: 2,
    passed: null,
  });
});

test("POST passing compares unrounded weighted points against the configured threshold", () => {
  const questions = [
    multipleChoice({ points: 1 }),
    trueFalse({ points: 3 }),
  ];
  const result = policy.calculateAssessmentScore({
    assessment: { type: "POST", passingPercentage: 75 },
    questions,
    responses: [
      { questionId: 11, selectedChoiceId: 102 },
      { questionId: 12, selectedChoiceId: 201 },
    ],
  });
  assert.equal(result.percentage, 75);
  assert.equal(result.passed, true);

  const failed = policy.calculateAssessmentScore({
    assessment: { type: "POST", passingPercentage: 75.01 },
    questions,
    responses: [
      { questionId: 11, selectedChoiceId: 102 },
      { questionId: 12, selectedChoiceId: 201 },
    ],
  });
  assert.equal(failed.passed, false);
});

test("official POST uses highest percentage with deterministic earlier tie handling", () => {
  const attempts = [
    { id: 1, status: "SUBMITTED", attemptNumber: 1, percentage: 70, submittedAt: new Date("2026-01-03") },
    { id: 2, status: "SUBMITTED", attemptNumber: 2, percentage: 90, submittedAt: new Date("2026-01-05") },
    { id: 3, status: "SUBMITTED", attemptNumber: 3, percentage: 90, submittedAt: new Date("2026-01-04") },
    { id: 4, status: "IN_PROGRESS", attemptNumber: 4, percentage: 100, submittedAt: null },
  ];
  assert.equal(policy.selectOfficialPostAttempt(attempts).id, 3);
  assert.equal(policy.selectFirstSubmittedPostAttempt(attempts).id, 1);
});

test("learning gain uses first POST and formats percentage-point semantics", () => {
  const pre = { percentage: 40 };
  const posts = [
    { id: 1, status: "SUBMITTED", attemptNumber: 1, percentage: 70, submittedAt: new Date("2026-01-01") },
    { id: 2, status: "SUBMITTED", attemptNumber: 2, percentage: 100, submittedAt: new Date("2026-01-02") },
  ];
  assert.deepEqual(policy.calculateLearningGain(pre, posts), {
    value: 30,
    unit: "percentage points",
    label: "+30 percentage points",
    prePercentage: 40,
    firstPostPercentage: 70,
  });
  assert.equal(policy.calculateLearningGain({ percentage: 80 }, [{
    status: "SUBMITTED", attemptNumber: 1, percentage: 60, submittedAt: new Date("2026-01-01"),
  }]).label, "-20 percentage points");
  assert.equal(policy.calculateLearningGain({ percentage: 70 }, [{
    status: "SUBMITTED", attemptNumber: 1, percentage: 70, submittedAt: new Date("2026-01-01"),
  }]).label, "0 percentage points");
});

test("player shaping strips answer keys and hidden explanations", () => {
  const shaped = policy.shapePlayerAssessment({
    id: 5,
    lessonKey: "arrays",
    type: "PRE",
    title: "Arrays baseline",
    instructions: "Answer every question.",
    passingPercentage: null,
    questions: [multipleChoice()],
  });
  assert.deepEqual(shaped.questions[0].choices, [
    { id: 101, choiceText: "int[] values", displayOrder: 1 },
    { id: 102, choiceText: "int values[]", displayOrder: 2 },
  ]);
  assert.equal(shaped.questions[0].explanation, undefined);
  assert.equal(shaped.questions[0].choices[0].isCorrect, undefined);
  assert.equal(shaped.passingPercentage, undefined);
});
