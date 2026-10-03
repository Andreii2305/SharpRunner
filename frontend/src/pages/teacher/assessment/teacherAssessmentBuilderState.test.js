import assert from "node:assert/strict";
import test from "node:test";
import * as builderState from "./teacherAssessmentBuilderState.js";
import {
  ACADEMIC_LESSONS, METHOD_TYPES, addChoice, addCodingParameter, addCodingTestCase,
  addQuestion, assessmentStatus, buildSaveGraph, createAssessmentDraft,
  codingModeChangeRequiresConfirmation, defaultValueForType, hydrateAssessmentDraft, moveChoice, moveCodingParameter,
  moveCodingTestCase, moveQuestion, publishIssues, removeChoice,
  removeCodingParameter, removeCodingTestCase, removeQuestion, selectCorrectChoice,
  updateCodingExecutionMode, updateCodingParameterType, updateCodingReturnType, updateQuestionType,
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
  assert.deepEqual(questions[0].methodContract.parameterNames, ["", ""]);
  questions = addCodingTestCase(questions, id, "PUBLIC");
  questions = addCodingTestCase(questions, id, "HIDDEN");
  assert.deepEqual(questions[0].codingTestCases[0].input, [0, []]);
  questions = updateCodingParameterType(questions, id, 0, "bool");
  assert.deepEqual(questions[0].codingTestCases.map(({ input }) => input[0]), [false, false]);
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

test("METHOD parameter names, types, and every test input move and delete as one positional tuple", () => {
  let questions = addQuestion([], "CODING");
  const id = questions[0].clientId;
  questions = addCodingParameter(questions, id, "int[]");
  questions = builderState.updateCodingParameterName(questions, id, 0, "numbers");
  questions = addCodingParameter(questions, id, "int");
  questions = builderState.updateCodingParameterName(questions, id, 1, "limit");
  questions = addCodingTestCase(questions, id, "PUBLIC");
  questions = addCodingTestCase(questions, id, "HIDDEN");
  questions[0].codingTestCases[0].input = [[1, 2, 3], 2];
  questions[0].codingTestCases[1].input = [[10, 20], 10];

  questions = moveCodingParameter(questions, id, 1, -1);
  assert.deepEqual(questions[0].methodContract.parameterNames, ["limit", "numbers"]);
  assert.deepEqual(questions[0].methodContract.parameterTypes, ["int", "int[]"]);
  assert.deepEqual(questions[0].codingTestCases.map(({ input }) => input), [[2, [1, 2, 3]], [10, [10, 20]]]);

  questions = removeCodingParameter(questions, id, 0);
  assert.deepEqual(questions[0].methodContract.parameterNames, ["numbers"]);
  assert.deepEqual(questions[0].methodContract.parameterTypes, ["int[]"]);
  assert.deepEqual(questions[0].codingTestCases.map(({ input }) => input), [[[1, 2, 3]], [[10, 20]]]);
});

test("adding every supported METHOD type seeds typed values in PUBLIC and HIDDEN cases", () => {
  let questions = addQuestion([], "CODING");
  const id = questions[0].clientId;
  questions = addCodingTestCase(questions, id, "PUBLIC");
  questions = addCodingTestCase(questions, id, "HIDDEN");
  for (const type of METHOD_TYPES) questions = addCodingParameter(questions, id, type);

  assert.deepEqual(METHOD_TYPES, ["bool", "int", "long", "string", "bool[]", "int[]", "long[]", "string[]"]);
  assert.deepEqual(
    questions[0].codingTestCases.map(({ input }) => input),
    [
      [false, 0, 0, "", [], [], [], []],
      [false, 0, 0, "", [], [], [], []],
    ],
  );
});

test("METHOD parameter-name validation mirrors ordinary C# identifiers and exact duplicate rules", () => {
  assert.equal(builderState.parameterNameError(["_numbers", "value1", "value", "Value"], 0), null);
  assert.equal(builderState.parameterNameError([""], 0), "required");
  assert.equal(builderState.parameterNameError(["   "], 0), "required");
  for (const name of ["1value", "two values", "has-dash", "class", "x".repeat(65)]) {
    assert.equal(builderState.parameterNameError([name], 0), "invalid", name);
  }
  assert.equal(builderState.parameterNameError(["value", "value"], 1), "duplicate");
  assert.equal(builderState.parameterNameError(["value", "Value"], 1), null);
  const draft = createAssessmentDraft("POST", "functions");
  draft.questions = addQuestion([], "CODING");
  Object.assign(draft.questions[0], { questionText: "Mismatch", codingTestCases: [{ clientId: "test", visibility: "PUBLIC", input: [1], expectedOutput: 1, weight: 1 }] });
  draft.questions[0].methodContract = { typeName: "Solution", methodName: "Solve", parameterNames: ["value", "extra"], parameterTypes: ["int"], returnType: "int" };
  assert.equal(publishIssues(draft).some((issue) => issue.includes("one name for every parameter type")), true);
});

test("legacy METHOD contracts resolve argN in memory while new blank names stay incomplete", () => {
  assert.deepEqual(builderState.resolveParameterNames(["int[]", "int"], null), ["arg1", "arg2"]);
  const legacy = hydrateAssessmentDraft({
    ...createAssessmentDraft("POST", "functions"), id: 9,
    questions: [{
      id: 21, questionText: "Legacy", questionType: "CODING", points: 1, choices: [],
      executionMode: "METHOD", methodContract: { typeName: "Solution", methodName: "Solve", parameterTypes: ["int", "int"], returnType: "int" },
      codingTestCases: [],
    }],
  });
  assert.deepEqual(legacy.questions[0].methodContract.parameterNames, ["arg1", "arg2"]);
  let questions = addQuestion([], "CODING");
  const id = questions[0].clientId;
  questions = addCodingParameter(questions, id, "int");
  assert.deepEqual(questions[0].methodContract.parameterNames, [""]);
});

test("array previews are display-only compact C#-friendly value summaries", () => {
  assert.equal(builderState.formatArrayPreview([]), "[]");
  assert.equal(builderState.formatArrayPreview([1, -2, 3]), "[1, -2, 3]");
  assert.equal(builderState.formatArrayPreview([true, false]), "[true, false]");
  assert.equal(builderState.formatArrayPreview(["hello", "\u00c1na", 'a"b']), '["hello", "\u00c1na", "a\\"b"]');
});

test("CODING graph hydrates and serializes the exact teacher contract without client IDs", () => {
  const draft = hydrateAssessmentDraft({
    ...createAssessmentDraft("POST", "functions"), id: 9, version: 4,
    questions: [{
      id: 21, questionText: "Add", questionType: "CODING", points: 5,
      explanation: null, objectiveKey: null, choices: [],
      starterCode: "starter", referenceSolution: "secret",
      methodContract: { typeName: "Solution", methodName: "Add", parameterNames: ["left", "right"], parameterTypes: ["int", "int"], returnType: "int" },
      codingTestCases: [{ id: 31, displayOrder: 0, visibility: "HIDDEN", input: [1, 2], expectedOutput: 3, weight: 2 }],
    }],
  });
  assert.match(draft.questions[0].codingTestCases[0].clientId, /^coding-test-/);
  const graph = buildSaveGraph(draft);
  assert.deepEqual(graph.questions[0], {
    questionText: "Add", questionType: "CODING", points: 5, explanation: null,
    objectiveKey: null, choices: [], executionMode: "METHOD", starterCode: "starter", referenceSolution: "secret",
    methodContract: { typeName: "Solution", methodName: "Add", parameterNames: ["left", "right"], parameterTypes: ["int", "int"], returnType: "int" },
    codingTestCases: [{ visibility: "HIDDEN", input: [1, 2], expectedOutput: 3, weight: 2 }],
  });
  assert.doesNotMatch(JSON.stringify(graph), /clientId|displayOrder/);
});

test("CODING format switching clears incompatible contract tests and PROGRAM validates text cases", () => {
  let questions = addQuestion([], "CODING");
  const id = questions[0].clientId;
  questions[0].questionText = "Print a sum";
  questions[0].starterCode = "using System; class Program { static void Main() {} }";
  questions[0].referenceSolution = "using System; class Program { static void Main() { Console.WriteLine(5); } }";
  questions[0].methodContract.typeName = "Solution";
  questions[0].codingTestCases = [{ clientId: "old", visibility: "HIDDEN", input: [], expectedOutput: 5, weight: 1 }];
  questions = updateCodingExecutionMode(questions, id, "PROGRAM");
  assert.equal(questions[0].executionMode, "PROGRAM");
  assert.deepEqual(questions[0].codingTestCases, []);
  questions = addCodingTestCase(questions, id, "HIDDEN");
  questions[0].codingTestCases[0].input = "2\n3\n";
  questions[0].codingTestCases[0].expectedOutput = "5\n";
  const draft = { ...createAssessmentDraft("POST", "arrays"), questions };
  assert.deepEqual(publishIssues(draft), []);
  const saved = buildSaveGraph(draft).questions[0];
  assert.equal(saved.executionMode, "PROGRAM");
  assert.equal(saved.methodContract, undefined);
});

test("CODING format switching requests confirmation for configured METHOD data even without tests", () => {
  const question = addQuestion([], "CODING")[0];
  assert.equal(codingModeChangeRequiresConfirmation(question, "PROGRAM"), false);
  question.methodContract.methodName = "Solve";
  assert.equal(codingModeChangeRequiresConfirmation(question, "PROGRAM"), true);
  question.methodContract.methodName = "";
  question.codingTestCases = [{ visibility: "PUBLIC", input: [], expectedOutput: 0, weight: 1 }];
  assert.equal(codingModeChangeRequiresConfirmation(question, "PROGRAM"), true);
  assert.equal(codingModeChangeRequiresConfirmation({ ...question, executionMode: "PROGRAM" }, "PROGRAM"), false);
});

test("CODING publish issues mirror structural backend requirements", () => {
  const draft = createAssessmentDraft("POST", "arrays");
  draft.questions = addQuestion([], "CODING");
  draft.questions[0].questionText = "Write a method";
  let issues = publishIssues(draft);
  for (const marker of ["type/class name", "method name", "test case"]) {
    assert.equal(issues.some((issue) => issue.includes(marker)), true, marker);
  }
  assert.equal(issues.some((issue) => issue.includes("HIDDEN")), false);
  assert.equal(issues.some((issue) => issue.includes("starter code")), false);
  assert.equal(issues.some((issue) => issue.includes("reference solution")), false);
  const question = draft.questions[0];
  question.methodContract.typeName = "Solution";
  question.methodContract.methodName = "Solve";
  question.codingTestCases = [{ clientId: "hidden", visibility: "HIDDEN", input: [], expectedOutput: 1, weight: 0 }];
  issues = publishIssues(draft);
  assert.equal(issues.some((issue) => issue.includes("weight")), true);
  question.codingTestCases[0].weight = 1;
  assert.deepEqual(publishIssues(draft), []);
});

test("PUBLIC-only PROGRAM tests satisfy publication while zero tests remain invalid", () => {
  const draft = createAssessmentDraft("POST", "arrays");
  draft.questions = addQuestion([], "CODING");
  const question = draft.questions[0];
  question.questionText = "Print nothing";
  question.executionMode = "PROGRAM";
  question.starterCode = "";
  question.referenceSolution = "";
  assert.deepEqual(publishIssues(draft), ["Question 1: add at least one test case."]);
  question.codingTestCases = [{ clientId: "public", visibility: "PUBLIC", input: "", expectedOutput: "", weight: 1 }];
  assert.deepEqual(publishIssues(draft), []);
});

test("CODING publish issues catch backend byte and typed-value limits before save", () => {
  const draft = createAssessmentDraft("POST", "arrays");
  draft.questions = addQuestion([], "CODING");
  const question = draft.questions[0];
  question.questionText = "Bounded method";
  question.methodContract = { typeName: "Solution", methodName: "Solve", parameterNames: ["value"], parameterTypes: ["string"], returnType: "string" };
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
