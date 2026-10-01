const {
  EXECUTION_CATEGORIES,
  MAX_SOURCE_BYTES,
  validateMethodExecutionRequest,
  validateTypedValue,
} = require("./secureCodingExecutionContract");

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
  const question = plain(questionInput) || {};
  if (question.questionType !== "CODING") throw new TypeError("Question is not CODING");
  if (typeof question.starterCode !== "string"
    || (publish && !question.starterCode.trim())
    || Buffer.byteLength(question.starterCode, "utf8") > MAX_SOURCE_BYTES) {
    throw new TypeError("Coding starter source is invalid or too large");
  }
  if (typeof question.referenceSolution !== "string"
    || (publish && !question.referenceSolution.trim())
    || Buffer.byteLength(question.referenceSolution, "utf8") > MAX_SOURCE_BYTES) {
    throw new TypeError("Coding reference solution is invalid or too large");
  }
  const tests = sortedTests(question);
  if (publish && !tests.length) throw new TypeError("CODING requires grading tests");
  if (publish && !tests.some((testCase) => testCase.visibility === "HIDDEN")) {
    throw new TypeError("CODING requires at least one hidden grading test");
  }
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
  if (publish && totalWeight <= 0) throw new TypeError("Coding grading weight must be positive");
  return { question, tests, contract: contractForQuestion(question), totalWeight };
};

const sameTypedValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const shapePublicCodingExecutionResult = ({ tests: inputTests = [], result }) => {
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
      || invocation.category === EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR) {
      throw new CodingAssessmentInfrastructureError();
    }
    const passed = invocation.category === EXECUTION_CATEGORIES.SUCCESS
      && sameTypedValue(invocation.output, testCase.expectedOutput);
    return {
      status: invocation.category,
      passed,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      ...(invocation.category === EXECUTION_CATEGORIES.SUCCESS
        ? { actualOutput: invocation.output }
        : {}),
    };
  });
  return output;
};

const gradeCodingQuestion = async ({ question: input, sourceCode, execute }) => {
  const { question, tests, contract, totalWeight } = validateCodingQuestion(input, { publish: true });
  if (typeof sourceCode !== "string" || Buffer.byteLength(sourceCode, "utf8") > MAX_SOURCE_BYTES) {
    throw new TypeError("Coding response source is invalid or too large");
  }
  const result = await execute({ source: sourceCode, contract, inputs: tests.map((item) => item.input) });
  const validCategories = new Set(Object.values(EXECUTION_CATEGORIES));
  const invocations = Array.isArray(result?.invocations) ? result.invocations : null;
  if (result?.category === EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR
    || result?.code === "SECURE_EXECUTION_UNAVAILABLE"
    || !result || !validCategories.has(result.category)
    || (result.category === EXECUTION_CATEGORIES.SUCCESS
      && (!invocations || invocations.length !== tests.length))
    || (invocations && invocations.length !== tests.length)
    || (invocations && invocations.some((item) => !item || !validCategories.has(item.category)
      || item.category === EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR))) {
    throw new CodingAssessmentInfrastructureError();
  }
  const gradedInvocations = invocations || [];
  let passedWeight = 0;
  tests.forEach((testCase, index) => {
    const invocation = gradedInvocations[index];
    if (invocation?.category === EXECUTION_CATEGORIES.SUCCESS
      && sameTypedValue(invocation.output, testCase.expectedOutput)) {
      passedWeight += Number(testCase.weight);
    }
  });
  const pointsAwarded = Math.round((Number(question.points) * passedWeight / totalWeight) * 100) / 100;
  return { isCorrect: passedWeight === totalWeight, pointsAwarded };
};

module.exports = {
  CodingAssessmentInfrastructureError,
  contractForQuestion,
  gradeCodingQuestion,
  isCodingAssessmentPlayerEnabled,
  shapePublicCodingExecutionResult,
  validateCodingQuestion,
};
