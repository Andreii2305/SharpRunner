const { spawn, execFile } = require("child_process");
const { randomUUID } = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const {
  EXECUTION_CATEGORIES,
  validateTypedValue,
} = require("./secureCodingExecutionContract");

const DEFAULT_IMAGE = "sharprunner-coding-sandbox:latest";
const RESULT_MARKER = "SHARPRUNNER_RESULT:";
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const DEFAULT_SECURE_LIMITS = Object.freeze({
  compileTimeoutMs: 20_000,
  executionTimeoutMs: 2_000,
  totalDeadlineMs: 30_000,
  outputBytes: 32 * 1024,
  memoryMb: 256,
  cpus: 0.5,
  pids: 64,
  jobTmpfsMb: 64,
  maxDiagnostics: 50,
  maxInvocations: 10,
});

const projectFile = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <OutputType>Library</OutputType>
    <AssemblyName>StudentSubmission</AssemblyName>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AllowUnsafeBlocks>false</AllowUnsafeBlocks>
    <UseSharedCompilation>false</UseSharedCompilation>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <RestoreIgnoreFailedSources>true</RestoreIgnoreFailedSources>
  </PropertyGroup>
  <ItemGroup><Compile Include="StudentSubmission.cs" /></ItemGroup>
</Project>`;
const programProjectFile = projectFile.replace("<OutputType>Library</OutputType>", "<OutputType>Exe</OutputType>");

const buildContainerSecurityArgs = ({ name, limits }) => [
  "run", "--name", name,
  "--network", "none",
  "--read-only",
  "--cap-drop", "ALL",
  "--security-opt", "no-new-privileges:true",
  "--memory", `${limits.memoryMb}m`,
  "--memory-swap", `${limits.memoryMb}m`,
  "--cpus", String(limits.cpus),
  "--pids-limit", String(limits.pids),
  "--ulimit", `nproc=${limits.pids}:${limits.pids}`,
  "--user", "65534:65534",
  "--tmpfs", `/tmp:rw,nosuid,nodev,size=${limits.jobTmpfsMb}m,mode=1777`,
  "--tmpfs", `/work:rw,nosuid,nodev,size=${limits.jobTmpfsMb}m,mode=700`,
];

const forceRemoveDockerContainer = (name, { dockerBinary = "docker", environment = process.env } = {}) => new Promise((resolve) => {
  try {
    execFile(dockerBinary, ["rm", "-f", name], {
      windowsHide: true,
      timeout: 5_000,
      env: { PATH: environment.PATH },
    }, () => resolve());
  } catch {
    resolve();
  }
});

const inspectOomKilled = (name, { dockerBinary, environment }) => new Promise((resolve) => {
  try {
    execFile(dockerBinary, ["inspect", "--format", "{{.State.OOMKilled}}", name], {
      windowsHide: true,
      timeout: 2_000,
      env: { PATH: environment.PATH },
    }, (error, stdout) => resolve(!error && String(stdout).trim().toLowerCase() === "true"));
  } catch {
    resolve(false);
  }
});

const runDockerContainer = (spec) => new Promise((resolve) => {
  const {
    dockerBinary, environment, name, args, timeoutMs, outputLimit, signal,
    spawnProcess = spawn,
    inspectContainerOom = inspectOomKilled,
    forceRemoveContainer = forceRemoveDockerContainer,
  } = spec;
  let child;
  try {
    child = spawnProcess(dockerBinary, args, {
      windowsHide: true,
      stdio: [spec.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      env: { PATH: environment.PATH },
    });
  } catch {
    resolve({ infrastructureError: true });
    return;
  }

  let stdout = "";
  let stderr = "";
  let totalBytes = 0;
  let settled = false;
  let timer;
  const removeOptions = { dockerBinary, environment };
  const finish = async (result, destroy = false) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    if (destroy) {
      await forceRemoveContainer(name, removeOptions);
      try { child.kill("SIGKILL"); } catch { /* Docker CLI already exited. */ }
    }
    resolve({ stdout, stderr, ...result });
  };
  const abort = () => { void finish({ infrastructureError: true, cancelled: true }, true); };
  const collect = (kind) => (chunk) => {
    totalBytes += chunk.length;
    const storedBytes = Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(stderr, "utf8");
    const remaining = Math.max(0, outputLimit - storedBytes);
    const text = chunk.subarray(0, remaining).toString("utf8");
    if (kind === "stdout") stdout += text; else stderr += text;
    if (totalBytes > outputLimit) void finish({ outputLimited: true }, true);
  };
  child.stdout.on("data", collect("stdout"));
  child.stderr.on("data", collect("stderr"));
  child.once("error", () => { void finish({ infrastructureError: true }, true); });
  child.once("close", async (exitCode) => {
    if (settled) return;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    const oomKilled = await inspectContainerOom(name, removeOptions);
    void finish({ exitCode, oomKilled });
  });
  timer = setTimeout(() => { void finish({ timedOut: true }, true); }, timeoutMs);
  if (spec.stdin !== undefined) {
    child.stdin.on("error", () => { /* A program may exit before consuming all bounded stdin. */ });
    child.stdin.end(spec.stdin, "utf8");
  }
  if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
});

const parseDiagnostics = (text, maxDiagnostics) => String(text || "")
  .split(/\r?\n/)
  .map((line) => line.match(/(?:StudentSubmission\.cs)?\((\d+),(\d+)\):\s*error\s+(CS\d{4}):\s*(.*?)(?:\s*\[.*)?$/i))
  .filter(Boolean)
  .slice(0, maxDiagnostics)
  .map((match) => ({ id: match[3].toUpperCase(), line: Number(match[1]), column: Number(match[2]), message: match[4].trim().slice(0, 512) }));

const classifyContainerFailure = (result, compile = false, limits = DEFAULT_SECURE_LIMITS) => {
  if (result?.timedOut) return { category: EXECUTION_CATEGORIES.TIMEOUT };
  if (result?.outputLimited) return { category: EXECUTION_CATEGORIES.OUTPUT_LIMIT };
  if (result?.oomKilled) return { category: EXECUTION_CATEGORIES.RESOURCE_LIMIT };
  if (result?.infrastructureError) return { category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR };
  if (compile && result?.exitCode !== 0) {
    return { category: EXECUTION_CATEGORIES.COMPILE_ERROR, diagnostics: parseDiagnostics(`${result.stdout || ""}\n${result.stderr || ""}`, limits.maxDiagnostics) };
  }
  return null;
};

const parseHarnessResult = (stdout, returnType) => {
  const marked = String(stdout || "").split(/\r?\n/).filter((line) => line.startsWith(RESULT_MARKER));
  if (marked.length !== 1) return { category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR };
  let value;
  try { value = JSON.parse(marked[0].slice(RESULT_MARKER.length)); } catch { return { category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR }; }
  if (![EXECUTION_CATEGORIES.SUCCESS, EXECUTION_CATEGORIES.SIGNATURE_ERROR, EXECUTION_CATEGORIES.RUNTIME_ERROR, EXECUTION_CATEGORIES.OUTPUT_LIMIT, EXECUTION_CATEGORIES.RESOURCE_LIMIT].includes(value?.category)) {
    return { category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR };
  }
  if (value.category === EXECUTION_CATEGORIES.SUCCESS && !validateTypedValue(returnType, value.output)) {
    return { category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR };
  }
  return value.category === EXECUTION_CATEGORIES.SUCCESS
    ? { category: value.category, output: value.output, ...(typeof value.stdout === "string" ? { stdout: value.stdout.slice(0, 8 * 1024) } : {}) }
    : { category: value.category };
};

const directorySize = async (directory) => {
  let total = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    total += entry.isDirectory() ? await directorySize(entryPath) : (await fs.stat(entryPath)).size;
    if (total > MAX_ARTIFACT_BYTES) return total;
  }
  return total;
};

const defaultVerifyArtifacts = async (artifactDirectory) => {
  const required = ["StudentSubmission.dll", "StudentSubmission.deps.json"];
  try {
    await Promise.all(required.map((file) => fs.access(path.join(artifactDirectory, file))));
    return await directorySize(artifactDirectory) <= MAX_ARTIFACT_BYTES;
  } catch {
    return false;
  }
};

const defaultVerifyProgramArtifacts = async (artifactDirectory) => {
  try {
    await fs.access(path.join(artifactDirectory, "StudentSubmission.runtimeconfig.json"));
    return await defaultVerifyArtifacts(artifactDirectory);
  } catch {
    return false;
  }
};

const minimalDotnetEnvironment = [
  "/usr/bin/env", "-i",
  "PATH=/usr/bin:/bin",
  "DOTNET_ROOT=/usr/share/dotnet",
  "HOME=/tmp",
  "DOTNET_CLI_HOME=/tmp/dotnet",
  "DOTNET_NOLOGO=1",
  "DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1",
  "DOTNET_CLI_TELEMETRY_OPTOUT=1",
  "DOTNET_EnableDiagnostics=0",
];

const pathForDockerMount = (value) => path.resolve(value).replaceAll("\\", "/");
const encodeArgument = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
const overallCategory = (invocations) => {
  const priority = [
    EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR,
    EXECUTION_CATEGORIES.RESOURCE_LIMIT,
    EXECUTION_CATEGORIES.TIMEOUT,
    EXECUTION_CATEGORIES.OUTPUT_LIMIT,
    EXECUTION_CATEGORIES.RUNTIME_ERROR,
    EXECUTION_CATEGORIES.SIGNATURE_ERROR,
  ];
  return priority.find((category) => invocations.some((item) => item.category === category)) || EXECUTION_CATEGORIES.SUCCESS;
};

const executeSecureMethodInDocker = async (request, {
  environment = process.env,
  signal,
  limits = DEFAULT_SECURE_LIMITS,
  createJobDirectory = () => fs.mkdtemp(path.join(os.tmpdir(), "sharprunner-secure-")),
  verifyArtifacts = defaultVerifyArtifacts,
  runContainer = runDockerContainer,
  removeContainer,
} = {}) => {
  const dockerBinary = environment.CODING_ASSESSMENT_DOCKER_BIN || environment.PRACTICE_DOCKER_BIN || "docker";
  const image = environment.CODING_ASSESSMENT_SANDBOX_IMAGE || DEFAULT_IMAGE;
  const jobDirectory = await createJobDirectory();
  const sourceDirectory = path.join(jobDirectory, "source");
  const artifactDirectory = path.join(jobDirectory, "artifacts");
  const deadline = Date.now() + limits.totalDeadlineMs;
  const remove = removeContainer || ((name) => forceRemoveDockerContainer(name, { dockerBinary, environment }));
  const names = [];
  try {
    await fs.mkdir(sourceDirectory, { recursive: true, mode: 0o755 });
    await fs.mkdir(artifactDirectory, { recursive: true, mode: 0o777 });
    await fs.writeFile(path.join(sourceDirectory, "StudentSubmission.csproj"), projectFile, { encoding: "utf8", flag: "wx", mode: 0o644 });
    await fs.writeFile(path.join(sourceDirectory, "StudentSubmission.cs"), request.source, { encoding: "utf8", flag: "wx", mode: 0o644 });
    await fs.chmod(jobDirectory, 0o755);
    await fs.chmod(artifactDirectory, 0o777);

    const compileName = `sharprunner-secure-compile-${randomUUID()}`;
    names.push(compileName);
    const compileSecurityArgs = buildContainerSecurityArgs({ name: compileName, limits });
    const compileArgs = [
      ...compileSecurityArgs,
      "--mount", `type=bind,src=${pathForDockerMount(sourceDirectory)},dst=/source,readonly`,
      "--mount", `type=bind,src=${pathForDockerMount(artifactDirectory)},dst=/artifacts`,
      image,
      ...minimalDotnetEnvironment,
      "/usr/bin/dotnet", "build", "/source/StudentSubmission.csproj",
      "--artifacts-path", "/work/build", "--output", "/artifacts",
      "--configuration", "Release", "--nologo", "--verbosity", "quiet",
      "-p:RestoreIgnoreFailedSources=true", "-p:UseSharedCompilation=false",
    ];
    const compileResult = await runContainer({
      phase: "compile", name: compileName, args: compileArgs, securityArgs: compileSecurityArgs,
      dockerBinary, environment, timeoutMs: Math.max(1, Math.min(limits.compileTimeoutMs, deadline - Date.now())),
      outputLimit: limits.outputBytes, signal,
    });
    const compileFailure = classifyContainerFailure(compileResult, true, limits);
    if (compileFailure) return compileFailure;
    if (!await verifyArtifacts(artifactDirectory)) return { category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR };

    const invocations = [];
    for (const input of request.inputs) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return { category: EXECUTION_CATEGORIES.TIMEOUT, invocations };
      const name = `sharprunner-secure-exec-${randomUUID()}`;
      names.push(name);
      const securityArgs = buildContainerSecurityArgs({ name, limits });
      const args = [
        ...securityArgs,
        "--mount", `type=bind,src=${pathForDockerMount(artifactDirectory)},dst=/job,readonly`,
        image,
        ...minimalDotnetEnvironment,
        "/usr/bin/dotnet", "/opt/sharprunner/method-runner-host/SharpRunner.MethodRunnerHost.dll",
        encodeArgument(request.contract), encodeArgument(input),
      ];
      const execution = await runContainer({
        phase: "execute", name, args, securityArgs, input,
        dockerBinary, environment, timeoutMs: Math.max(1, Math.min(limits.executionTimeoutMs, remaining)),
        outputLimit: limits.outputBytes, signal,
      });
      const failure = classifyContainerFailure(execution, false, limits);
      const invocation = failure || (execution.exitCode === 0
        ? parseHarnessResult(execution.stdout, request.contract.returnType)
        : { category: EXECUTION_CATEGORIES.RUNTIME_ERROR });
      invocations.push(invocation);
      if (invocation.category === EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR || invocation.category === EXECUTION_CATEGORIES.SIGNATURE_ERROR) break;
    }
    return { category: overallCategory(invocations), invocations };
  } catch {
    return { category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR };
  } finally {
    await Promise.all(names.map((name) => remove(name)));
    await fs.rm(jobDirectory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
};

const executeSecureProgramInDocker = async (request, {
  environment = process.env,
  signal,
  limits = DEFAULT_SECURE_LIMITS,
  createJobDirectory = () => fs.mkdtemp(path.join(os.tmpdir(), "sharprunner-secure-")),
  verifyArtifacts = defaultVerifyProgramArtifacts,
  runContainer = runDockerContainer,
  removeContainer,
} = {}) => {
  const dockerBinary = environment.CODING_ASSESSMENT_DOCKER_BIN || environment.PRACTICE_DOCKER_BIN || "docker";
  const image = environment.CODING_ASSESSMENT_SANDBOX_IMAGE || DEFAULT_IMAGE;
  const jobDirectory = await createJobDirectory();
  const sourceDirectory = path.join(jobDirectory, "source");
  const artifactDirectory = path.join(jobDirectory, "artifacts");
  const deadline = Date.now() + limits.totalDeadlineMs;
  const remove = removeContainer || ((name) => forceRemoveDockerContainer(name, { dockerBinary, environment }));
  const names = [];
  try {
    await fs.mkdir(sourceDirectory, { recursive: true, mode: 0o755 });
    await fs.mkdir(artifactDirectory, { recursive: true, mode: 0o777 });
    await fs.writeFile(path.join(sourceDirectory, "StudentSubmission.csproj"), programProjectFile, { encoding: "utf8", flag: "wx", mode: 0o644 });
    await fs.writeFile(path.join(sourceDirectory, "StudentSubmission.cs"), request.source, { encoding: "utf8", flag: "wx", mode: 0o644 });
    await fs.chmod(jobDirectory, 0o755);
    await fs.chmod(artifactDirectory, 0o777);
    const compileName = `sharprunner-secure-compile-${randomUUID()}`;
    names.push(compileName);
    const compileSecurityArgs = buildContainerSecurityArgs({ name: compileName, limits });
    const compileArgs = [...compileSecurityArgs,
      "--mount", `type=bind,src=${pathForDockerMount(sourceDirectory)},dst=/source,readonly`,
      "--mount", `type=bind,src=${pathForDockerMount(artifactDirectory)},dst=/artifacts`, image,
      ...minimalDotnetEnvironment, "/usr/bin/dotnet", "build", "/source/StudentSubmission.csproj",
      "--artifacts-path", "/work/build", "--output", "/artifacts", "--configuration", "Release",
      "--nologo", "--verbosity", "quiet", "-p:RestoreIgnoreFailedSources=true", "-p:UseSharedCompilation=false"];
    const compileResult = await runContainer({ phase: "compile", name: compileName, args: compileArgs,
      securityArgs: compileSecurityArgs, dockerBinary, environment,
      timeoutMs: Math.max(1, Math.min(limits.compileTimeoutMs, deadline - Date.now())), outputLimit: limits.outputBytes, signal });
    const compileFailure = classifyContainerFailure(compileResult, true, limits);
    if (compileFailure) return compileFailure;
    if (!await verifyArtifacts(artifactDirectory)) return { category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR };
    const invocations = [];
    for (const stdin of request.inputs) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return { category: EXECUTION_CATEGORIES.TIMEOUT, invocations };
      const name = `sharprunner-secure-exec-${randomUUID()}`;
      names.push(name);
      const securityArgs = buildContainerSecurityArgs({ name, limits });
      const args = [...securityArgs, "--mount", `type=bind,src=${pathForDockerMount(artifactDirectory)},dst=/job,readonly`,
        image, ...minimalDotnetEnvironment, "/usr/bin/dotnet", "/job/StudentSubmission.dll"];
      const execution = await runContainer({ phase: "execute", name, args, securityArgs, stdin,
        dockerBinary, environment, timeoutMs: Math.max(1, Math.min(limits.executionTimeoutMs, remaining)),
        outputLimit: limits.outputBytes, signal });
      const failure = classifyContainerFailure(execution, false, limits);
      invocations.push(failure || (execution.exitCode === 0
        ? { category: EXECUTION_CATEGORIES.SUCCESS, stdout: execution.stdout }
        : { category: EXECUTION_CATEGORIES.RUNTIME_ERROR }));
    }
    return { category: overallCategory(invocations), invocations };
  } catch {
    return { category: EXECUTION_CATEGORIES.INFRASTRUCTURE_ERROR };
  } finally {
    await Promise.all(names.map((name) => remove(name)));
    await fs.rm(jobDirectory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
};

module.exports = {
  DEFAULT_SECURE_LIMITS,
  buildContainerSecurityArgs,
  executeSecureMethodInDocker,
  executeSecureProgramInDocker,
  parseHarnessResult,
  runDockerContainer,
};
