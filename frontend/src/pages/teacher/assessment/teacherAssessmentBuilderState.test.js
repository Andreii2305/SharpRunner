import assert from "node:assert/strict";
import test from "node:test";
import {
  ACADEMIC_LESSONS, METHOD_TYPES, addChoice, addCodingParameter, addCodingTestCase,
  addQuestion, assessmentStatus, buildSaveGraph, createAssessmentDraft,
  defaultValueForType, hydrateAssessmentDraft, moveChoice, moveCodingParameter,
  moveCodingTestCase, moveQuestion, publishIssues, removeChoice,
  removeCodingParameter, removeCodingTestCase, removeQuestion, selectCorrectChoice,
  updateCodingParameterType, updateCodingReturnType, updateQuestionType,
} from "./teacherAssessmentBuilderState.js";

test("academic lesson scope exactly follows backend policy", () => {
  assert.deepEqual(ACADEMIC_LESSONS.map(({ key }) => key), ["arrays", "functions", "functions-with-arrays", "final"]);
});

test("statuses distinguish missing, draft, published, and locked", () => {
  assert.equal(assessmentStatus({ exists: false }), "Not created");
  assert.equal(assessmentStatus({ exists: true, published: false }), "Draft");
  assert.equal(assessmentStatus({ exists: true, published: true }), "Published");
  assert.equal(assessmentStatus({ exists: true, attemptsExist: true }), "Locked");
});

test("PRE and POST drafts preserve their distinct backend semantics", () => {
  const pre = createAssessmentDraft("PRE", "arrays");
  const post = createAssessmentDraft("POST", "arrays");
  assert.deepEqual([pre.maxAttempts, pre.passingPercentage, pre.requirePassingForCompletion, pre.answerReviewPolicy], [1, null, false, "NEVER"]);
  assert.deepEqual([post.maxAttempts, post.passingPercentage, post.requirePassingForCompletion, post.answerReviewPolicy], [3, 75, true, "AFTER_FINAL_ATTEMPT"]);
});

test("MCQ and true/false editing supports add, remove, reorder, and exactly one correct choice", () => {
  let questions = addQuestion([], "MULTIPLE_CHOICE");
  questions = addChoice(questions, questions[0].clientId);
  questions = selectCorrectChoice(questions, questions[0].clientId, questions[0].choices[2].clientId);
  questions = moveChoice(questions, questions[0].clientId, 2, -1);
  assert.equal(questions[0].choices.length, 3);
  assert.equal(questions[0].choices.filter((choice) => choice.isCorrect).length, 1);
  questions = removeChoice(questions, questions[0].clientId, questions[0].choices[2].clientId);
  questions = addQuestion(questions, "TRUE_FALSE");
  questions = updateQuestionType(questions, questions[1].clientId, "TRUE_FALSE");
  assert.deepEqual(questions[1].choices.map((choice) => choice.choiceText), ["True", "False"]);
  questions = moveQuestion(questions, 1, -1);
  assert.equal(questions[0].questionType, "TRUE_FALSE");
  questions = removeQuestion(questions, questions[0].clientId);
  assert.equal(questions.length, 1);
});

test("save graph emits only backend DTO fields and canonical display order", () => {
  const draft = createAssessmentDraft("POST", "functions");
  draft.questions = addQuestion([], "MULTIPLE_CHOICE");
  draft.questions[0].questionText = "Which declaration is valid?";
  draft.questions[0].choices[0].choiceText = "int[] values";
  draft.questions[0].choices[1].choiceText = "int values[]()";
  const graph = buildSaveGraph({ ...draft, version: 2 });
  assert.equal(graph.version, 2);
  assert.equal(graph.questions[0].displayOrder, undefined);
  assert.deepEqual(Object.keys(graph.questions[0]).sort(), ["choices", "explanation", "objectiveKey", "points", "questionText", "questionType"].sort());
  assert.deepEqual(Object.keys(graph.questions[0].choices[0]).sort(), ["choiceText", "isCorrect"].sort());
});

test("publish summary catches obvious incompleteness without replacing backend validation", () => {
  const draft = createAssessmentDraft("POST", "arrays");
  assert.deepEqual(publishIssues(draft), ["Add at least one question."]);
  draft.questions = addQuestion([], "MULTIPLE_CHOICE");
  assert.equal(publishIssues(draft).some((issue) => issue.includes("question text")), true);
  draft.questions[0].questionText = "Ready?";
  draft.questions[0].choices.forEach((choice, index) => { choice.choiceText = `Choice ${index + 1}`; });
  assert.deepEqual(publishIssues(draft), []);
});

test("CODING creation and type transitions discard incompatible state", () => {
  let questions = addQuestion([], "MULTIPLE_CHOICE");
  const id = questions[0].clientId;
  questions[0].choices[0].choiceText = "Never survives";
  questions = updateQuestionType(questions, id, "CODING");
  assert.equal(questions[0].questionType, "CODING");
  assert.deepEqual(questions[0].choices, []);
  assert.deepEqual(questions[0].methodContract.parameterTypes, []);
  assert.equal(questions[0].referenceSolution, "");
  questions[0].referenceSolution = "teacher secret";
  questions[0].codingTestCases = [{ clientId: "test", visibility: "HIDDEN", input: [], expectedOutput: 0, weight: 1 }];
  questions = updateQuestionType(questions, id, "TRUE_FALSE");
  assert.deepEqual(questions[0].choices.map(({ choiceText }) => choiceText), ["True", "False"]);
  for (const field of ["methodContract", "starterCode", "referenceSolution", "codingTestCases"]) {
    assert.equal(Object.hasOwn(questions[0], field), false, field);
  }
  questions = updateQuestionType(questions, id, "CODING");
  questions = updateQuestionType(questions, id, "MULTIPLE_CHOICE");
  assert.equal(questions[0].choices.length, 2);
  assert.equal(questions[0].choices.filter(({ isCorrect }) => isCorrect).length, 1);
});

test("CODING contract and test operations keep typed inputs aligned and ordered", () => {
  assert.deepEqual(METHOD_TYPES, ["bool", "int", "long", "string", "bool[]", "int[]", "long[]", "string[]"]);
  let questions = addQuestion([], "CODING");
  const id = questions[0].clientId;
  questions = addCodingParameter(questions, id, "int");
  questions = addCodingParameter(questions, id, "string[]");
  questions = addCodingTestCase(questions, id, "PUBLIC");
  questions = addCodingTestCase(questions, id, "HIDDEN");
  assert.deepEqual(questions[0].codingTestCases[0].input, [0, []]);
  questions = updateCodingParameterType(questions, id, 0, "bool");
  assert.equal(questions[0].codingTestCases[0].input[0], false);
  questions = moveCodingParameter(questions, id, 1, -1);
  assert.deepEqual(questions[0].methodContract.parameterTypes, ["string[]", "bool"]);
  assert.deepEqual(questions[0].codingTestCases[0].input, [[], false]);
  questions = removeCodingParameter(questions, id, 0);
  assert.deepEqual(questions[0].codingTestCases[0].input, [false]);
  questions = updateCodingReturnType(questions, id, "string");
  assert.equal(questions[0].codingTestCases[0].expectedOutput, "");
  questions = moveCodingTestCase(questions, id, 1, -1);
  assert.equal(questions[0].codingTestCases[0].visibility, "HIDDEN");
  questions = removeCodingTestCase(questions, id, 1);
  assert.equal(questions[0].codingTestCases.length, 1);
  assert.deepEqual(defaultValueForType("int[]"), []);
});

test("CODING graph hydrates and serializes the exact teacher contract without client IDs", () => {
  const draft = hydrateAssessmentDraft({
    ...createAssessmentDraft("POST", "functions"), id: 9, version: 4,
    questions: [{
      id: 21, questionText: "Add", questionType: "CODING", points: 5,
      explanation: null, objectiveKey: null, choices: [],
      starterCode: "starter", referenceSolution: "secret",
      methodContract: { typeName: "Solution", methodName: "Add", parameterTypes: ["int", "int"], returnType: "int" },
      codingTestCases: [{ id: 31, displayOrder: 0, visibility: "HIDDEN", input: [1, 2], expectedOutput: 3, weight: 2 }],
    }],
  });
  assert.match(draft.questions[0].codingTestCases[0].clientId, /^coding-test-/);
  const graph = buildSaveGraph(draft);
  assert.deepEqual(graph.questions[0], {
    questionText: "Add", questionType: "CODING", points: 5, explanation: null,
    objectiveKey: null, choices: [], starterCode: "starter", referenceSolution: "secret",
    methodContract: { typeName: "Solution", methodName: "Add", parameterTypes: ["int", "int"], returnType: "int" },
    codingTestCases: [{ visibility: "HIDDEN", input: [1, 2], expectedOutput: 3, weight: 2 }],
  });
  assert.doesNotMatch(JSON.stringify(graph), /clientId|displayOrder/);
});

test("CODING publish issues mirror structural backend requirements", () => {
  const draft = createAssessmentDraft("POST", "arrays");
  draft.questions = addQuestion([], "CODING");
  draft.questions[0].questionText = "Write a method";
  let issues = publishIssues(draft);
  for (const marker of ["type/class name", "method name", "starter code", "reference solution", "test case", "HIDDEN"]) {
    assert.equal(issues.some((issue) => issue.includes(marker)), true, marker);
  }
  const question = draft.questions[0];
  question.methodContract.typeName = "Solution";
  question.methodContract.methodName = "Solve";
  question.starterCode = "public static class Solution { public static int Solve() => 0; }";
  question.referenceSolution = "public static class Solution { public static int Solve() => 1; }";
  question.codingTestCases = [{ clientId: "hidden", visibility: "HIDDEN", input: [], expectedOutput: 1, weight: 0 }];
  issues = publishIssues(draft);
  assert.equal(issues.some((issue) => issue.includes("weight")), true);
  question.codingTestCases[0].weight = 1;
  assert.deepEqual(publishIssues(draft), []);
});

test("CODING publish issues catch backend byte and typed-value limits before save", () => {
  const draft = createAssessmentDraft("POST", "arrays");
  draft.questions = addQuestion([], "CODING");
  const question = draft.questions[0];
  question.questionText = "Bounded method";
  question.methodContract = { typeName: "Solution", methodName: "Solve", parameterTypes: ["string"], returnType: "string" };
  question.starterCode = "x".repeat(16 * 1024 + 1);
  question.referenceSolution = "solution";
  question.codingTestCases = [{ clientId: "hidden", visibility: "HIDDEN", input: ["ok"], expectedOutput: "x".repeat(4097), weight: 1 }];
  let issues = publishIssues(draft);
  assert.equal(issues.some((issue) => issue.includes("starter code") && issue.includes("16 KB")), true);
  assert.equal(issues.some((issue) => issue.includes("expected output")), true);
  question.starterCode = "starter";
  question.referenceSolution = "😀".repeat(4097);
  issues = publishIssues(draft);
  assert.equal(issues.some((issue) => issue.includes("reference solution") && issue.includes("16 KB")), true);
  question.referenceSolution = "solution";
  question.codingTestCases[0].input = ["x".repeat(16 * 1024)];
  issues = publishIssues(draft);
  assert.equal(issues.some((issue) => issue.includes("test inputs") && issue.includes("16 KB")), true);
  question.codingTestCases[0].input = ["ok"];
  question.codingTestCases[0].weight = 1.234;
  issues = publishIssues(draft);
  assert.equal(issues.some((issue) => issue.includes("weight") && issue.includes("decimal")), true);
});
