const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  CodingAssessmentInfrastructureError,
  gradeCodingQuestion,
  isCodingAssessmentPlayerEnabled,
  normalizeProgramOutput,
  shapePublicCodingExecutionResult,
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
  referenceSolution: "public static class Solution { public static int Add(int a, int b) => a + b; }",
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

const programQuestion = (overrides = {}) => codingQuestion({
  questionText: "Read two integers and print their sum.",
  codingExecutionMode: "PROGRAM",
  starterCode: "using System; public class Program { public static void Main() { } }",
  referenceSolution: "using System; public class Program { public static void Main() { Console.WriteLine(int.Parse(Console.ReadLine()) + int.Parse(Console.ReadLine())); } }",
  codingTypeName: null,
  codingMethodName: null,
  codingParameterTypes: null,
  codingReturnType: null,
  codingTestCases: [
    { id: 1, displayOrder: 0, visibility: "PUBLIC", input: "2\n3\n", expectedOutput: "5\n", weight: 1 },
    { id: 2, displayOrder: 1, visibility: "HIDDEN", input: "10\n20\n", expectedOutput: "30", weight: 3 },
  ],
  ...overrides,
});

test("legacy CODING defaults to METHOD while PROGRAM ignores method configuration", () => {
  assert.equal(validateCodingQuestion(codingQuestion(), { publish: true }).executionMode, "METHOD");
  const validated = validateCodingQuestion(programQuestion(), { publish: true });
  assert.equal(validated.executionMode, "PROGRAM");
  assert.equal(validated.contract, null);
  assert.throws(() => validateCodingQuestion(programQuestion({ codingExecutionMode: "SCRIPT" }), { publish: true }), /mode/i);
  assert.throws(() => validateCodingQuestion(programQuestion({
    codingTestCases: programQuestion().codingTestCases.map((testCase, index) => index === 0
      ? { ...testCase, input: [2, 3] }
      : testCase),
  }), { publish: true }), /standard input/i);
});

test("PROGRAM output normalization is deterministic and preserves meaningful content", async () => {
  const executeProgram = async () => ({
    category: "SUCCESS",
    invocations: [
      { category: "SUCCESS", stdout: "5  \r\n\r\n" },
      { category: "SUCCESS", stdout: "30\n" },
    ],
  });
  assert.deepEqual(await gradeCodingQuestion({
    question: programQuestion(), sourceCode: programQuestion().starterCode, executeProgram,
  }), { isCorrect: true, pointsAwarded: 10 });
  assert.deepEqual(await gradeCodingQuestion({
    question: programQuestion({ codingTestCases: programQuestion().codingTestCases.map((item, index) => index === 0 ? { ...item, expectedOutput: "5 0" } : item) }),
    sourceCode: programQuestion().starterCode,
    executeProgram,
  }), { isCorrect: false, pointsAwarded: 7.5 });
});

test("PROGRAM output normalization handles line endings without changing meaningful text", () => {
  for (const value of ["5", "5\n", "5\r\n", "5  \r\n\r\n", "5\t\n\n"]) {
    assert.equal(normalizeProgramOutput(value), "5");
  }
  assert.equal(normalizeProgramOutput(" \t\r\n\r\n"), "");
  assert.equal(normalizeProgramOutput(""), "");
  assert.equal(normalizeProgramOutput("a  b\n\u03bb"), "a  b\n\u03bb");
  assert.notEqual(normalizeProgramOutput("hello"), normalizeProgramOutput("Hello"));
  assert.notEqual(normalizeProgramOutput("a b"), normalizeProgramOutput("ab"));
  assert.notEqual(normalizeProgramOutput("a  b"), normalizeProgramOutput("a b"));
});

test("METHOD and PROGRAM success result shapes cannot cross-normalize", async () => {
  const emptyOutputProgram = programQuestion({
    codingTestCases: [
      { displayOrder: 0, visibility: "PUBLIC", input: "", expectedOutput: "", weight: 1 },
      { displayOrder: 1, visibility: "HIDDEN", input: "", expectedOutput: "", weight: 1 },
    ],
  });
  await assert.rejects(gradeCodingQuestion({
    question: emptyOutputProgram,
    sourceCode: emptyOutputProgram.starterCode,
    executeProgram: async () => ({
      category: "SUCCESS",
      invocations: [
        { category: "SUCCESS", output: "" },
        { category: "SUCCESS", output: "" },
      ],
    }),
  }), CodingAssessmentInfrastructureError);
  await assert.rejects(gradeCodingQuestion({
    question: codingQuestion(),
    sourceCode: codingQuestion().starterCode,
    executeMethod: async () => ({
      category: "SUCCESS",
      invocations: [
        { category: "SUCCESS", stdout: "3" },
        { category: "SUCCESS", stdout: "12" },
      ],
    }),
  }), CodingAssessmentInfrastructureError);
  assert.throws(() => shapePublicCodingExecutionResult({
    tests: [emptyOutputProgram.codingTestCases[0]],
    executionMode: "PROGRAM",
    result: { category: "SUCCESS", invocations: [{ category: "SUCCESS", output: "" }] },
  }), CodingAssessmentInfrastructureError);
  assert.throws(() => shapePublicCodingExecutionResult({
    tests: [codingQuestion().codingTestCases[0]],
    executionMode: "METHOD",
    result: { category: "SUCCESS", invocations: [{ category: "SUCCESS", stdout: "3" }] },
  }), CodingAssessmentInfrastructureError);
});

test("CODING publish validation accepts the METHOD allowlist and PUBLIC-only grading tests", () => {
  assert.doesNotThrow(() => validateCodingQuestion(codingQuestion(), { publish: true }));
  assert.doesNotThrow(() => validateCodingQuestion(codingQuestion({
    starterCode: "", referenceSolution: "",
  }), { publish: true }));
  assert.doesNotThrow(() => validateCodingQuestion(codingQuestion({
    starterCode: null, referenceSolution: null,
  }), { publish: true }));
  assert.throws(
    () => validateCodingQuestion(codingQuestion({ codingReturnType: "double" }), { publish: true }),
    /unsupported/i,
  );
  assert.doesNotThrow(
    () => validateCodingQuestion(codingQuestion({ codingTestCases: [codingQuestion().codingTestCases[0]] }), { publish: true }),
  );
  assert.throws(
    () => validateCodingQuestion(codingQuestion({ codingTestCases: [] }), { publish: true }),
    /grading tests/i,
  );
  assert.throws(
    () => validateCodingQuestion(codingQuestion({
      codingTestCases: codingQuestion().codingTestCases.map((testCase, index) => (
        index === 0 ? { ...testCase, weight: 1.234 } : testCase
      )),
    }), { publish: true }),
    /weight/i,
  );
});

test("PROGRAM publication and grading do not depend on starter or reference source", async () => {
  const question = programQuestion({ starterCode: "", referenceSolution: "" });
  assert.doesNotThrow(() => validateCodingQuestion(question, { publish: true }));
  assert.deepEqual(await gradeCodingQuestion({
    question,
    sourceCode: "using System; Console.WriteLine(5);",
    executeProgram: async ({ source, inputs }) => {
      assert.equal(source, "using System; Console.WriteLine(5);");
      assert.deepEqual(inputs, ["2\n3\n", "10\n20\n"]);
      return {
        category: "SUCCESS",
        invocations: [
          { category: "SUCCESS", stdout: "5\n" },
          { category: "SUCCESS", stdout: "30\n" },
        ],
      };
    },
  }), { isCorrect: true, pointsAwarded: 10 });
  assert.doesNotThrow(() => validateCodingQuestion(programQuestion({
    starterCode: "", referenceSolution: "",
    codingTestCases: [programQuestion().codingTestCases[0]],
  }), { publish: true }));
  assert.throws(() => validateCodingQuestion(programQuestion({
    starterCode: "", referenceSolution: "",
    codingTestCases: programQuestion().codingTestCases.map((testCase, index) => (
      index === 0 ? { ...testCase, input: [] } : testCase
    )),
  }), { publish: true }), /standard input/i);
});

test("METHOD grading uses submitted source when optional teacher sources are blank", async () => {
  const question = codingQuestion({ starterCode: "", referenceSolution: "" });
  assert.deepEqual(await gradeCodingQuestion({
    question,
    sourceCode: "public static class Solution { public static int Add(int a, int b) => a + b; }",
    executeMethod: async ({ source, contract, inputs }) => {
      assert.match(source, /a \+ b/);
      assert.equal(contract.methodName, "Add");
      assert.deepEqual(inputs, [[1, 2], [5, 7]]);
      return {
        category: "SUCCESS",
        invocations: [
          { category: "SUCCESS", output: 3 },
          { category: "SUCCESS", output: 12 },
        ],
      };
    },
  }), { isCorrect: true, pointsAwarded: 10 });
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
  assert.doesNotMatch(serialized, /a \+ b/);
});

test("legacy null starter source becomes an empty student editor without exposing reference source", () => {
  const shaped = shapePlayerAssessment({
    id: 7,
    lessonKey: "arrays",
    type: "POST",
    title: "Coding",
    version: 1,
    questions: [codingQuestion({ starterCode: null, referenceSolution: null })],
  });
  assert.equal(shaped.questions[0].starterCode, "");
  assert.equal(shaped.questions[0].referenceSolution, undefined);
  assert.doesNotMatch(JSON.stringify(shaped), /HIDDEN|referenceSolution|\[5,7\]/);
});

test("PROGRAM student graph exposes mode and public stdin/output without method or hidden data", () => {
  const shaped = shapePlayerAssessment({ id: 7, lessonKey: "arrays", type: "POST", title: "Programs", version: 1, questions: [programQuestion()] });
  assert.equal(shaped.questions[0].executionMode, "PROGRAM");
  assert.equal(shaped.questions[0].methodContract, undefined);
  assert.deepEqual(shaped.questions[0].codingExamples, [{ input: "2\n3\n", expectedOutput: "5\n" }]);
  assert.doesNotMatch(JSON.stringify(shaped), /10\\n20|referenceSolution|HIDDEN|weight/);
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

test("public Run Code result exposes safe public values without weights or hidden metadata", () => {
  const shaped = shapePublicCodingExecutionResult({
    tests: [codingQuestion().codingTestCases[0]],
    result: {
      category: "SUCCESS",
      invocations: [{ category: "SUCCESS", output: 4, stdout: "bounded" }],
    },
  });
  assert.deepEqual(shaped, {
    status: "SUCCESS",
    tests: [{
      status: "SUCCESS",
      passed: false,
      input: [1, 2],
      expectedOutput: 3,
      actualOutput: 4,
    }],
  });
  const serialized = JSON.stringify(shaped);
  assert.doesNotMatch(serialized, /weight|HIDDEN|referenceSolution|stdout|lease|docker/i);
});

test("public Run Code preserves sanitized compile diagnostics and rejects infrastructure results", () => {
  assert.deepEqual(shapePublicCodingExecutionResult({
    tests: [codingQuestion().codingTestCases[0]],
    result: {
      category: "COMPILE_ERROR",
      message: "Compilation failed.",
      diagnostics: [{ id: "CS1002", line: 2, column: 4, message: "; expected" }],
    },
  }), {
    status: "COMPILE_ERROR",
    message: "Compilation failed.",
    diagnostics: [{ id: "CS1002", line: 2, column: 4, message: "; expected" }],
    tests: [],
  });
  assert.throws(() => shapePublicCodingExecutionResult({
    tests: [codingQuestion().codingTestCases[0]],
    result: { category: "INFRASTRUCTURE_ERROR" },
  }), CodingAssessmentInfrastructureError);
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
  assert.match(serialized.questions[0].referenceSolution, /a \+ b/);
});
