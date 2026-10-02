const {
  EXECUTION_CATEGORIES,
  MAX_SOURCE_BYTES,
  validateMethodExecutionRequest,
  validateTypedValue,
} = require("./secureCodingExecutionContract");
const { CODING_EXECUTION_MODES } = require("../constants/assessmentConfig");

const MAX_PROGRAM_STDIN_BYTES = 4 * 1024;
const MAX_PROGRAM_OUTPUT_BYTES = 8 * 1024;

class CodingAssessmentInfrastructureError extends Error {
  constructor() {
    super("Secure coding assessment execution is temporarily unavailable.");
    this.name = "CodingAssessmentInfrastructureError";
    this.code = "CODING_EXECUTION_UNAVAILABLE";
  }
}

const plain = (value) => value?.toJSON ? value.toJSON() : value;
const isCodingAssessmentPlayerEnabled = (environment = process.env) => (
  String(environment.CODING_ASSESSMENT_PLAYER_ENABLED || "false").toLowerCase() === "true"
);
const sortedTests = (question) => [...(question.codingTestCases || [])]
  .map(plain)
  .sort((left, right) => Number(left.displayOrder) - Number(right.displayOrder));
const executionModeForQuestion = (questionInput) => {
  const question = plain(questionInput) || {};
  return question.codingExecutionMode || CODING_EXECUTION_MODES.METHOD;
};
const normalizeProgramOutput = (value) => {
  const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n")
    .map((line) => line.trimEnd());
  while (lines.length && lines.at(-1) === "") lines.pop();
  return lines.join("\n");
};

const contractForQuestion = (questionInput) => {
  const question = plain(questionInput);
  return {
    typeName: question.codingTypeName,
    methodName: question.codingMethodName,
    parameterTypes: question.codingParameterTypes,
    returnType: question.codingReturnType,
  };
};

const validateCodingQuestion = (questionInput, { publish = false } = {}) => {
  const rawQuestion = plain(questionInput) || {};
  const question = {
    ...rawQuestion,
    starterCode: rawQuestion.starterCode ?? "",
    referenceSolution: rawQuestion.referenceSolution ?? "",
  };
  if (question.questionType !== "CODING") throw new TypeError("Question is not CODING");
  const executionMode = executionModeForQuestion(question);
  if (!Object.values(CODING_EXECUTION_MODES).includes(executionMode)) {
    throw new TypeError("Coding execution mode is invalid");
  }
  if (typeof question.starterCode !== "string"
    || Buffer.byteLength(question.starterCode, "utf8") > MAX_SOURCE_BYTES) {
    throw new TypeError("Coding starter source is invalid or too large");
  }
  if (typeof question.referenceSolution !== "string"
    || Buffer.byteLength(question.referenceSolution, "utf8") > MAX_SOURCE_BYTES) {
    throw new TypeError("Coding reference solution is invalid or too large");
  }
  const tests = sortedTests(question);
  if (publish && !tests.length) throw new TypeError("CODING requires grading tests");
  let totalWeight = 0;
  tests.forEach((testCase, index) => {
    if (!Number.isInteger(Number(testCase.displayOrder)) || Number(testCase.displayOrder) < 0
      || Number(testCase.displayOrder) !== index) throw new TypeError("Coding test order is invalid");
    if (!(["PUBLIC", "HIDDEN"].includes(testCase.visibility))) throw new TypeError("Coding test visibility is invalid");
    const weight = Number(testCase.weight);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 99999999.99
      || Math.round(weight * 100) / 100 !== weight) {
      throw new TypeError("Coding test weight must be positive with at most two decimal places");
    }
    totalWeight += weight;
  });
  if (executionMode === CODING_EXECUTION_MODES.METHOD) {
    try {
      validateMethodExecutionRequest({
        source: question.starterCode || "public static class Placeholder {}",
        contract: contractForQuestion(question),
        inputs: tests.length ? tests.map((testCase) => testCase.input) : [[]],
      });
      validateMethodExecutionRequest({
        source: question.referenceSolution || "public static class Placeholder {}",
        contract: contractForQuestion(question),
        inputs: tests.length ? tests.map((testCase) => testCase.input) : [[]],
      });
    } catch (error) {
      throw new TypeError(`Coding contract or test input is unsupported: ${error.message}`);
    }
    for (const testCase of tests) {
      if (!validateTypedValue(question.codingReturnType, testCase.expectedOutput)) {
        throw new TypeError("Coding expected output does not match the return type");
      }
    }
  } else {
    for (const testCase of tests) {
      if (typeof testCase.input !== "string"
        || Buffer.byteLength(testCase.input, "utf8") > MAX_PROGRAM_STDIN_BYTES) {
        throw new TypeError("PROGRAM standard input must be bounded text");
      }
      if (typeof testCase.expectedOutput !== "string"
        || Buffer.byteLength(testCase.expectedOutput, "utf8") > MAX_PROGRAM_OUTPUT_BYTES) {
        throw new TypeError("PROGRAM expected output must be bounded text");
      }
    }
  }
  if (publish && totalWeight <= 0) throw new TypeError("Coding grading weight must be positive");
  return {
    question,
    tests,
    contract: executionMode === CODING_EXECUTION_MODES.METHOD ? contractForQuestion(question) : null,
    totalWeight,
    executionMode,
  };
};

const sameTypedValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const hasValidSuccessOutput = ({ invocation, executionMode, returnType }) => {
  if (invocation?.category !== EXECUTION_CATEGORIES.SUCCESS) return true;
  if (executionMode === CODING_EXECUTION_MODES.PROGRAM) {
    return typeof invocation.stdout === "string";
  }
  return hasOwn(invocation, "output")
    && (returnType === undefined || validateTypedValue(returnType, invocation.output));
};

const shapePublicCodingExecutionResult = ({
  tests: inputTests = [], result, executionMode = CODING_EXECUTION_MODES.METHOD,
}) => {
  const tests = inputTests.map(plain).filter((testCase) => testCase.visibility === "PUBLIC");
  const validCategories = new Set(Object.values(EXECUTION_CATEGORIES));
  if (!result || !validCategories.has(result.category)
    || result.category === EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR
    || result.code === "SECURE_EXECUTION_UNAVAILABLE") {
    throw new CodingAssessmentInfrastructureError();
  }
  if (tests.length === 0) return { status: "NO_PUBLIC_TESTS", tests: [] };
  const output = {
    status: result.category,
    ...(typeof result.message === "string" ? { message: result.message.slice(0, 512) } : {}),
    ...(Array.isArray(result.diagnostics) ? {
      diagnostics: result.diagnostics.slice(0, 50).map((diagnostic) => ({
        id: String(diagnostic?.id || "").slice(0, 16),
        line: Math.max(0, Number(diagnostic?.line) || 0),
        column: Math.max(0, Number(diagnostic?.column) || 0),
        message: String(diagnostic?.message || "Compilation failed.").slice(0, 512),
      })),
    } : {}),
    tests: [],
  };
  const invocations = Array.isArray(result.invocations) ? result.invocations : [];
  if (result.category === EXECUTION_CATEGORIES.SUCCESS && invocations.length !== tests.length) {
    throw new CodingAssessmentInfrastructureError();
  }
  if (invocations.length === 0) return output;
  if (invocations.length !== tests.length) throw new CodingAssessmentInfrastructureError();
  output.tests = tests.map((testCase, index) => {
    const invocation = invocations[index];
    if (!invocation || !validCategories.has(invocation.category)
      || invocation.category === EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR
      || !hasValidSuccessOutput({ invocation, executionMode })) {
      throw new CodingAssessmentInfrastructureError();
    }
    const actualOutput = executionMode === CODING_EXECUTION_MODES.PROGRAM
      ? invocation.stdout
      : invocation.output;
    const passed = invocation.category === EXECUTION_CATEGORIES.SUCCESS
      && (executionMode === CODING_EXECUTION_MODES.PROGRAM
        ? normalizeProgramOutput(actualOutput) === normalizeProgramOutput(testCase.expectedOutput)
        : sameTypedValue(actualOutput, testCase.expectedOutput));
    return {
      status: invocation.category,
      passed,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      ...(invocation.category === EXECUTION_CATEGORIES.SUCCESS
        ? { actualOutput }
        : {}),
    };
  });
  return output;
};

const gradeCodingQuestion = async ({
  question: input, sourceCode, execute, executeMethod = execute, executeProgram,
}) => {
  const {
    question, tests, contract, totalWeight, executionMode,
  } = validateCodingQuestion(input, { publish: true });
  if (typeof sourceCode !== "string" || Buffer.byteLength(sourceCode, "utf8") > MAX_SOURCE_BYTES) {
    throw new TypeError("Coding response source is invalid or too large");
  }
  const executor = executionMode === CODING_EXECUTION_MODES.PROGRAM ? executeProgram : executeMethod;
  if (typeof executor !== "function") throw new CodingAssessmentInfrastructureError();
  const result = await executor({
    source: sourceCode,
    ...(executionMode === CODING_EXECUTION_MODES.METHOD ? { contract } : {}),
    inputs: tests.map((item) => item.input),
  });
  const validCategories = new Set(Object.values(EXECUTION_CATEGORIES));
  const invocations = Array.isArray(result?.invocations) ? result.invocations : null;
  if (result?.category === EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR
    || result?.code === "SECURE_EXECUTION_UNAVAILABLE"
    || !result || !validCategories.has(result.category)
    || (result.category === EXECUTION_CATEGORIES.SUCCESS
      && (!invocations || invocations.length !== tests.length))
    || (invocations && invocations.length !== tests.length)
    || (invocations && invocations.some((item) => !item || !validCategories.has(item.category)
      || item.category === EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR
      || !hasValidSuccessOutput({
        invocation: item,
        executionMode,
        returnType: question.codingReturnType,
      })))) {
    throw new CodingAssessmentInfrastructureError();
  }
  const gradedInvocations = invocations || [];
  let passedWeight = 0;
  tests.forEach((testCase, index) => {
    const invocation = gradedInvocations[index];
    if (invocation?.category === EXECUTION_CATEGORIES.SUCCESS
      && (executionMode === CODING_EXECUTION_MODES.PROGRAM
        ? normalizeProgramOutput(invocation.stdout) === normalizeProgramOutput(testCase.expectedOutput)
        : sameTypedValue(invocation.output, testCase.expectedOutput))) {
      passedWeight += Number(testCase.weight);
    }
  });
  const pointsAwarded = Math.round((Number(question.points) * passedWeight / totalWeight) * 100) / 100;
  return { isCorrect: passedWeight === totalWeight, pointsAwarded };
};

module.exports = {
  CodingAssessmentInfrastructureError,
  contractForQuestion,
  executionModeForQuestion,
  gradeCodingQuestion,
  isCodingAssessmentPlayerEnabled,
  normalizeProgramOutput,
  shapePublicCodingExecutionResult,
  validateCodingQuestion,
};
