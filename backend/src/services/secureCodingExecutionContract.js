const MAX_SOURCE_BYTES = 16 * 1024;
const MAX_INPUT_BYTES = 16 * 1024;
const MAX_INVOCATIONS = 10;
const MAX_PARAMETERS = 8;
const MAX_ARRAY_ITEMS = 256;
const MAX_STRING_BYTES = 4 * 1024;
const MAX_PROGRAM_STDIN_BYTES = 4 * 1024;
const MAX_PROGRAM_OUTPUT_BYTES = 8 * 1024;

const METHOD_TYPE_ALLOWLIST = Object.freeze([
  "bool", "int", "long", "string",
  "bool[]", "int[]", "long[]", "string[]",
]);

const EXECUTION_CATEGORIES = Object.freeze({
  COMPILE_ERROR: "COMPILE_ERROR",
  SIGNATURE_ERROR: "SIGNATURE_ERROR",
  SUCCESS: "SUCCESS",
  RUNTIME_ERROR: "RUNTIME_ERROR",
  TIMEOUT: "TIMEOUT",
  OUTPUT_LIMIT: "OUTPUT_LIMIT",
  RESOURCE_LIMIT: "RESOURCE_LIMIT",
  POLICY_REJECTION: "POLICY_REJECTION",
  INFRASTRUCTURE_ERROR: "INFRASTRUCTURE_ERROR",
});

class MethodExecutionValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MethodExecutionValidationError";
    this.code = code;
  }
}

const fail = (code, message) => { throw new MethodExecutionValidationError(code, message); };
const assertExactKeys = (value, allowed, label) => {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail("UNEXPECTED_FIELD", `${label} contains an unsupported field.`);
  }
};

const qualifiedIdentifier = /^(?:[A-Za-z_][A-Za-z0-9_]*\.)*[A-Za-z_][A-Za-z0-9_]*$/;
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const validateScalar = (type, value) => {
  switch (type) {
    case "bool": return typeof value === "boolean";
    case "int": return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
    case "long": return Number.isSafeInteger(value);
    case "string": return typeof value === "string" && Buffer.byteLength(value, "utf8") <= MAX_STRING_BYTES;
    default: return false;
  }
};

const validateTypedValue = (type, value) => {
  if (!type.endsWith("[]")) return validateScalar(type, value);
  if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) return false;
  const itemType = type.slice(0, -2);
  return value.every((item) => validateScalar(itemType, item));
};

const validateMethodExecutionRequest = (input) => {
  if (!isPlainObject(input)) fail("INVALID_REQUEST", "A method execution request is required.");
  assertExactKeys(input, ["source", "contract", "inputs"], "Request");
  if (typeof input.source !== "string" || !input.source.trim()) fail("INVALID_SOURCE", "Source code is required.");
  if (Buffer.byteLength(input.source, "utf8") > MAX_SOURCE_BYTES) fail("SOURCE_TOO_LARGE", "Source code exceeds the execution limit.");

  const contract = input.contract;
  if (!isPlainObject(contract)) fail("INVALID_CONTRACT", "A method contract is required.");
  assertExactKeys(contract, ["typeName", "methodName", "parameterTypes", "returnType"], "Contract");
  if (typeof contract.typeName !== "string" || contract.typeName.length > 128 || !qualifiedIdentifier.test(contract.typeName)) {
    fail("INVALID_CONTRACT", "The contract type name is invalid.");
  }
  if (typeof contract.methodName !== "string" || contract.methodName.length > 64 || !identifier.test(contract.methodName)) {
    fail("INVALID_CONTRACT", "The contract method name is invalid.");
  }
  if (!Array.isArray(contract.parameterTypes) || contract.parameterTypes.length > MAX_PARAMETERS) {
    fail("INVALID_CONTRACT", "The contract parameter list is invalid.");
  }
  for (const type of [...contract.parameterTypes, contract.returnType]) {
    if (!METHOD_TYPE_ALLOWLIST.includes(type)) fail("UNSUPPORTED_TYPE", "The method contract contains an unsupported type.");
  }

  if (!Array.isArray(input.inputs) || input.inputs.length < 1) fail("INVALID_INPUT", "At least one test input is required.");
  if (input.inputs.length > MAX_INVOCATIONS) fail("TOO_MANY_INVOCATIONS", "The request contains too many test invocations.");
  if (Buffer.byteLength(JSON.stringify(input.inputs), "utf8") > MAX_INPUT_BYTES) fail("INVALID_INPUT", "Test inputs exceed the execution limit.");
  for (const invocation of input.inputs) {
    if (!Array.isArray(invocation) || invocation.length !== contract.parameterTypes.length) {
      fail("INVALID_INPUT", "A test input does not match the method parameters.");
    }
    invocation.forEach((value, index) => {
      if (!validateTypedValue(contract.parameterTypes[index], value)) {
        fail("INVALID_INPUT", "A test input does not match the declared parameter type.");
      }
    });
  }

  return {
    source: input.source,
    contract: {
      typeName: contract.typeName,
      methodName: contract.methodName,
      parameterTypes: [...contract.parameterTypes],
      returnType: contract.returnType,
    },
    inputs: input.inputs.map((invocation) => [...invocation]),
  };
};

const validateProgramExecutionRequest = (input) => {
  if (!isPlainObject(input)) fail("INVALID_REQUEST", "A program execution request is required.");
  assertExactKeys(input, ["source", "inputs"], "Request");
  if (typeof input.source !== "string" || !input.source.trim()) fail("INVALID_SOURCE", "Source code is required.");
  if (Buffer.byteLength(input.source, "utf8") > MAX_SOURCE_BYTES) fail("SOURCE_TOO_LARGE", "Source code exceeds the execution limit.");
  if (!Array.isArray(input.inputs) || input.inputs.length < 1) fail("INVALID_INPUT", "At least one program input is required.");
  if (input.inputs.length > MAX_INVOCATIONS) fail("TOO_MANY_INVOCATIONS", "The request contains too many test invocations.");
  if (Buffer.byteLength(JSON.stringify(input.inputs), "utf8") > MAX_INPUT_BYTES) fail("INVALID_INPUT", "Program inputs exceed the execution limit.");
  for (const stdin of input.inputs) {
    if (typeof stdin !== "string" || Buffer.byteLength(stdin, "utf8") > MAX_PROGRAM_STDIN_BYTES) {
      fail("INVALID_INPUT", "A program input must be bounded standard input text.");
    }
  }
  return { source: input.source, inputs: [...input.inputs] };
};

module.exports = {
  EXECUTION_CATEGORIES,
  MAX_INVOCATIONS,
  MAX_INPUT_BYTES,
  MAX_PROGRAM_OUTPUT_BYTES,
  MAX_PROGRAM_STDIN_BYTES,
  MAX_SOURCE_BYTES,
  METHOD_TYPE_ALLOWLIST,
  MethodExecutionValidationError,
  validateTypedValue,
  validateMethodExecutionRequest,
  validateProgramExecutionRequest,
};
