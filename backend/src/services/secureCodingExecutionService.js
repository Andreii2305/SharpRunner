const { execFile } = require("child_process");
const {
  EXECUTION_CATEGORIES,
  MethodExecutionValidationError,
  validateTypedValue,
  validateMethodExecutionRequest,
  validateProgramExecutionRequest,
} = require("./secureCodingExecutionContract");
const { validatePracticeCode } = require("./practiceRunnerService");

const DEFAULT_IMAGE = "sharprunner-coding-sandbox:latest";
const RESULT_BYTE_LIMIT = 32 * 1024;
const REMOTE_TIMEOUT_MS = 35_000;
const CATEGORY_MESSAGES = Object.freeze({
  [EXECUTION_CATEGORIES.COMPILE_ERROR]: "Compilation failed.",
  [EXECUTION_CATEGORIES.SIGNATURE_ERROR]: "The required public static method signature was not found.",
  [EXECUTION_CATEGORIES.RUNTIME_ERROR]: "The submitted method failed while running.",
  [EXECUTION_CATEGORIES.TIMEOUT]: "Execution exceeded the allowed time.",
  [EXECUTION_CATEGORIES.OUTPUT_LIMIT]: "Execution produced too much output.",
  [EXECUTION_CATEGORIES.RESOURCE_LIMIT]: "Execution exceeded a resource limit.",
  [EXECUTION_CATEGORIES.POLICY_REJECTION]: "Source code uses an API that is unavailable for coding assessments.",
  [EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR]: "Secure coding execution is unavailable.",
});

const execFileResult = (file, args, options = {}) => new Promise((resolve, reject) => {
  execFile(file, args, { windowsHide: true, ...options }, (error, stdout, stderr) => {
    if (error) reject(error); else resolve({ stdout, stderr });
  });
});

const inspectSecureDockerSandbox = async ({ environment = process.env } = {}) => {
  const dockerBinary = environment.CODING_ASSESSMENT_DOCKER_BIN || environment.PRACTICE_DOCKER_BIN || "docker";
  const image = environment.CODING_ASSESSMENT_SANDBOX_IMAGE || DEFAULT_IMAGE;
  try {
    await execFileResult(dockerBinary, ["info", "--format", "{{.ServerVersion}}"], { timeout: 3_000, env: { PATH: environment.PATH } });
    await execFileResult(dockerBinary, ["image", "inspect", image], { timeout: 3_000, env: { PATH: environment.PATH } });
    return { available: true };
  } catch {
    return { available: false };
  }
};

const remoteBaseUrl = (environment) => {
  const configured = String(environment.PRACTICE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!configured) return "";
  const candidate = /^https?:\/\//i.test(configured) ? configured : `http://${configured}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? candidate : "";
  } catch {
    return "";
  }
};

const remoteHeaders = (environment) => ({
  authorization: `Bearer ${String(environment.PRACTICE_RUNNER_TOKEN || "").trim()}`,
  accept: "application/json",
  "content-type": "application/json",
});

const fetchRemoteJson = async (pathName, { environment, method = "GET", body, timeoutMs = REMOTE_TIMEOUT_MS }) => {
  const baseUrl = remoteBaseUrl(environment);
  const token = String(environment.PRACTICE_RUNNER_TOKEN || "").trim();
  if (!baseUrl || token.length < 32) return { ok: false, status: 503 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${pathName}`, {
      method,
      headers: remoteHeaders(environment),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
      redirect: "error",
    });
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > RESULT_BYTE_LIMIT * 2) return { ok: false, status: 502 };
    let value;
    try { value = JSON.parse(text); } catch { return { ok: false, status: 502 }; }
    return { ok: response.ok, status: response.status, value };
  } catch {
    return { ok: false, status: 503 };
  } finally {
    clearTimeout(timer);
  }
};

const getSecureCodingExecutionCapability = async ({
  environment = process.env,
  inspectSandbox = inspectSecureDockerSandbox,
} = {}) => {
  if (String(environment.CODING_ASSESSMENT_EXECUTION_ENABLED || "false").toLowerCase() !== "true") {
    return { available: false, code: "SECURE_EXECUTION_DISABLED" };
  }
  if (environment.PRACTICE_RUNNER_URL) {
    const response = await fetchRemoteJson("/capabilities/assessment-coding", { environment, timeoutMs: 3_000 });
    return response.ok && response.value?.available === true && response.value?.mode === "docker"
      ? { available: true, mode: "remote" }
      : { available: false, code: "SECURE_SANDBOX_UNAVAILABLE" };
  }
  if (String(environment.CODING_ASSESSMENT_EXECUTION_MODE || "").toLowerCase() !== "docker") {
    return { available: false, code: "SECURE_SANDBOX_REQUIRED" };
  }
  if (String(environment.CODING_ASSESSMENT_EXECUTION_ROLE || "").toLowerCase() !== "runner") {
    return { available: false, code: "SECURE_RUNNER_REQUIRED" };
  }
  const diagnostic = await inspectSandbox({ environment });
  return diagnostic?.available
    ? { available: true, mode: "docker" }
    : { available: false, code: "SECURE_SANDBOX_UNAVAILABLE" };
};

const normalizeInvocation = (value, returnType) => {
  const allowed = [
    EXECUTION_CATEGORIES.SUCCESS,
    EXECUTION_CATEGORIES.SIGNATURE_ERROR,
    EXECUTION_CATEGORIES.RUNTIME_ERROR,
    EXECUTION_CATEGORIES.TIMEOUT,
    EXECUTION_CATEGORIES.OUTPUT_LIMIT,
    EXECUTION_CATEGORIES.RESOURCE_LIMIT,
    EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR,
  ];
  if (!allowed.includes(value?.category)) return { category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR };
  if (value.category !== EXECUTION_CATEGORIES.SUCCESS) return { category: value.category };
  if (!returnType || !validateTypedValue(returnType, value.output)) return { category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR };
  return {
    category: EXECUTION_CATEGORIES.SUCCESS,
    output: value.output,
    ...(typeof value.stdout === "string" ? { stdout: value.stdout.slice(0, 8 * 1024) } : {}),
  };
};

const normalizeResult = (value, returnType, expectedInvocations) => {
  let category = Object.values(EXECUTION_CATEGORIES).includes(value?.category)
    ? value.category
    : EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR;
  const result = { category };
  if (category === EXECUTION_CATEGORIES.SUCCESS && Object.hasOwn(value, "output")) {
    if (!returnType || !validateTypedValue(returnType, value.output)) return { category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR, message: CATEGORY_MESSAGES[EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR] };
    result.output = value.output;
  }
  if (category === EXECUTION_CATEGORIES.SUCCESS && typeof value.stdout === "string") result.stdout = value.stdout.slice(0, 8 * 1024);
  if (Array.isArray(value?.invocations)) {
    result.invocations = value.invocations.slice(0, 10).map((item) => normalizeInvocation(item, returnType));
    if (expectedInvocations !== undefined && result.invocations.length !== expectedInvocations && ![EXECUTION_CATEGORIES.SIGNATURE_ERROR, EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR].includes(category)) {
      category = EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR;
    } else {
      const nestedPriority = [
        EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR,
        EXECUTION_CATEGORIES.RESOURCE_LIMIT,
        EXECUTION_CATEGORIES.TIMEOUT,
        EXECUTION_CATEGORIES.OUTPUT_LIMIT,
        EXECUTION_CATEGORIES.RUNTIME_ERROR,
        EXECUTION_CATEGORIES.SIGNATURE_ERROR,
      ];
      category = nestedPriority.find((candidate) => result.invocations.some((item) => item.category === candidate)) || category;
    }
    result.category = category;
  } else if (expectedInvocations !== undefined && category === EXECUTION_CATEGORIES.SUCCESS && !Object.hasOwn(value, "output")) {
    category = EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR;
    result.category = category;
  }
  if (category === EXECUTION_CATEGORIES.COMPILE_ERROR && Array.isArray(value.diagnostics)) {
    result.diagnostics = value.diagnostics.slice(0, 50).map((diagnostic) => ({
      id: String(diagnostic?.id || "").slice(0, 16),
      line: Math.max(0, Number(diagnostic?.line) || 0),
      column: Math.max(0, Number(diagnostic?.column) || 0),
      message: String(diagnostic?.message || "Compilation failed.")
        .replace(/[A-Za-z]:\\[^\s:]+|\/(?:tmp|app|source|artifacts)\/[^\s:]*/gi, "submission")
        .slice(0, 512),
    }));
  }
  if (category !== EXECUTION_CATEGORIES.SUCCESS) result.message = CATEGORY_MESSAGES[category];
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > RESULT_BYTE_LIMIT) {
    return { category: EXECUTION_CATEGORIES.OUTPUT_LIMIT, message: CATEGORY_MESSAGES[EXECUTION_CATEGORIES.OUTPUT_LIMIT] };
  }
  return result;
};

const normalizeProgramInvocation = (value) => {
  const allowed = [
    EXECUTION_CATEGORIES.SUCCESS, EXECUTION_CATEGORIES.RUNTIME_ERROR,
    EXECUTION_CATEGORIES.TIMEOUT, EXECUTION_CATEGORIES.OUTPUT_LIMIT,
    EXECUTION_CATEGORIES.RESOURCE_LIMIT, EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR,
  ];
  if (!allowed.includes(value?.category)) return { category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR };
  if (value.category !== EXECUTION_CATEGORIES.SUCCESS) return { category: value.category };
  if (typeof value.stdout !== "string") return { category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR };
  return { category: EXECUTION_CATEGORIES.SUCCESS, stdout: value.stdout.slice(0, 8 * 1024) };
};

const normalizeProgramResult = (value, expectedInvocations) => {
  if (value?.category === EXECUTION_CATEGORIES.COMPILE_ERROR) {
    return normalizeResult(value, undefined, undefined);
  }
  const allowedCategories = new Set([
    EXECUTION_CATEGORIES.SUCCESS, EXECUTION_CATEGORIES.RUNTIME_ERROR,
    EXECUTION_CATEGORIES.TIMEOUT, EXECUTION_CATEGORIES.OUTPUT_LIMIT,
    EXECUTION_CATEGORIES.RESOURCE_LIMIT, EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR,
  ]);
  if (!allowedCategories.has(value?.category)) {
    return { category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR, message: CATEGORY_MESSAGES[EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR] };
  }
  if (!Array.isArray(value?.invocations) || value.invocations.length !== expectedInvocations) {
    return { category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR, message: CATEGORY_MESSAGES[EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR] };
  }
  const invocations = value.invocations.map(normalizeProgramInvocation);
  const priority = [EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR, EXECUTION_CATEGORIES.RESOURCE_LIMIT,
    EXECUTION_CATEGORIES.TIMEOUT, EXECUTION_CATEGORIES.OUTPUT_LIMIT, EXECUTION_CATEGORIES.RUNTIME_ERROR];
  const category = priority.find((candidate) => invocations.some((item) => item.category === candidate)) || value.category;
  const result = {
    category,
    invocations,
    ...(category === EXECUTION_CATEGORIES.SUCCESS ? {} : { message: CATEGORY_MESSAGES[category] }),
  };
  return Buffer.byteLength(JSON.stringify(result), "utf8") <= RESULT_BYTE_LIMIT
    ? result
    : { category: EXECUTION_CATEGORIES.OUTPUT_LIMIT, message: CATEGORY_MESSAGES[EXECUTION_CATEGORIES.OUTPUT_LIMIT] };
};

const unavailableResult = () => ({
  category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR,
  code: "SECURE_EXECUTION_UNAVAILABLE",
  message: CATEGORY_MESSAGES[EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR],
});

const runSecureMethodExecution = async (request, {
  environment = process.env,
  inspectSandbox = inspectSecureDockerSandbox,
  executeInSandbox,
  signal,
} = {}) => {
  const capability = await getSecureCodingExecutionCapability({ environment, inspectSandbox });
  if (!capability.available) return unavailableResult();
  let normalized;
  try {
    normalized = validateMethodExecutionRequest(request);
  } catch (error) {
    if (!(error instanceof MethodExecutionValidationError)) throw error;
    return { category: EXECUTION_CATEGORIES.POLICY_REJECTION, code: error.code, message: error.message };
  }
  const policy = validatePracticeCode(normalized.source);
  if (!policy.allowed) {
    return { category: EXECUTION_CATEGORIES.POLICY_REJECTION, code: "SOURCE_POLICY_REJECTION", message: CATEGORY_MESSAGES[EXECUTION_CATEGORIES.POLICY_REJECTION] };
  }
  try {
    if (capability.mode === "remote") {
      const response = await fetchRemoteJson("/execute-method", { environment, method: "POST", body: normalized });
      if (!response.ok) return unavailableResult();
      return normalizeResult(response.value, normalized.contract.returnType, normalized.inputs.length);
    }
    const executor = executeInSandbox || require("./secureCodingDockerSandbox").executeSecureMethodInDocker;
    return normalizeResult(await executor(normalized, { environment, signal }), normalized.contract.returnType, normalized.inputs.length);
  } catch {
    return unavailableResult();
  }
};

const runSecureProgramExecution = async (request, {
  environment = process.env,
  inspectSandbox = inspectSecureDockerSandbox,
  executeInSandbox,
  signal,
} = {}) => {
  const capability = await getSecureCodingExecutionCapability({ environment, inspectSandbox });
  if (!capability.available) return unavailableResult();
  let normalized;
  try {
    normalized = validateProgramExecutionRequest(request);
  } catch (error) {
    if (!(error instanceof MethodExecutionValidationError)) throw error;
    return { category: EXECUTION_CATEGORIES.POLICY_REJECTION, code: error.code, message: error.message };
  }
  const policy = validatePracticeCode(normalized.source);
  if (!policy.allowed) return { category: EXECUTION_CATEGORIES.POLICY_REJECTION, code: "SOURCE_POLICY_REJECTION", message: CATEGORY_MESSAGES[EXECUTION_CATEGORIES.POLICY_REJECTION] };
  try {
    if (capability.mode === "remote") {
      const response = await fetchRemoteJson("/execute-program", { environment, method: "POST", body: normalized });
      if (!response.ok) return unavailableResult();
      return normalizeProgramResult(response.value, normalized.inputs.length);
    }
    const executor = executeInSandbox || require("./secureCodingDockerSandbox").executeSecureProgramInDocker;
    return normalizeProgramResult(await executor(normalized, { environment, signal }), normalized.inputs.length);
  } catch {
    return unavailableResult();
  }
};

module.exports = {
  getSecureCodingExecutionCapability,
  inspectSecureDockerSandbox,
  normalizeSecureCodingExecutionResult: normalizeResult,
  runSecureMethodExecution,
  runSecureProgramExecution,
};
