const { spawn, execFile } = require("child_process");
const { randomUUID } = require("crypto");
const { constants: fsConstants } = require("fs");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { compileWithRoslyn, getCompilerHostHealth } = require("./roslynCompilerHostClient");

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_OUTPUT_LIMIT = 32 * 1024;
const DEFAULT_CODE_LIMIT = 16 * 1024;
const DEFAULT_IMAGE = "mcr.microsoft.com/dotnet/sdk:8.0";
const DEFAULT_BUILD_TIMEOUT_MS = 30_000;
const DEFAULT_READY_TIMEOUT_MS = 3_000;
const DEFAULT_RETRY_AFTER_MS = 5_000;
const directTemplatePromises = new Map();
const directDiagnosticPromises = new Map();

const blockedApiPatterns = [
  [/(?:global\s*::\s*)?System\s*\.\s*IO\b|\b(?:File|Directory|Path|FileInfo|DirectoryInfo|DriveInfo|FileSystemWatcher|FileStream|StreamReader|StreamWriter|BinaryReader|BinaryWriter|RandomAccess)\s*(?:\.|\()/i, "File access is not available in practice code."],
  [/(?:global\s*::\s*)?System\s*\.\s*Net\b|\b(?:HttpClient|WebClient|WebRequest|HttpWebRequest|Socket|TcpClient|UdpClient|NetworkStream|Dns|Ping)\s*(?:\.|\()/i, "Network access is not available in practice code."],
  [/(?:global\s*::\s*)?System\s*\.\s*Diagnostics\b|\b(?:Process|ProcessStartInfo)\s*(?:\.|\()/i, "Starting or inspecting processes is not available in practice code."],
  [/\bEnvironment\s*\.|GetEnvironmentVariable/i, "Environment variables are not available in practice code."],
  [/\b(?:Reflection|Runtime\s*\.\s*InteropServices|DllImport|LibraryImport|Marshal|NativeLibrary|Assembly|Activator|AppDomain)\b/i, "Reflection and native APIs are not available in practice code."],
  [/\b(?:typeof|GetType|Type\s*\.\s*GetType|GetMethod|InvokeMember|Delegate)\b/i, "Runtime type inspection is not available in practice code."],
  [/\busing\s+[\p{L}_][\p{L}\p{N}_]*\s*=/iu, "Namespace aliases are not available in practice code."],
  [/\\u[0-9a-f]{4}|\\U[0-9a-f]{8}/i, "Escaped identifiers are not available in practice code."],
  [/\b(?:unsafe|stackalloc|dynamic)\b/i, "Unsafe and dynamic code is not available in the practice compiler."],
  [/\bMicrosoft\s*\.\s*Win32\b/i, "Operating-system APIs are not available in practice code."],
];

const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\r\n]*/g, " ");

const stripCommentsAndLiterals = (source) => stripComments(source)
  .replace(/@"(?:""|[^"])*"/g, '""')
  .replace(/\$?"(?:\\.|[^"\\])*"/g, '""')
  .replace(/'(?:\\.|[^'\\])'/g, "''");

const validatePracticeCode = (code, codeLimit = DEFAULT_CODE_LIMIT) => {
  if (typeof code !== "string" || !code.trim()) {
    return { allowed: false, message: "Enter some C# code before running it." };
  }
  if (Buffer.byteLength(code, "utf8") > codeLimit) {
    return { allowed: false, message: `Practice code is limited to ${Math.floor(codeLimit / 1024)} KB.` };
  }
  const withoutComments = stripComments(code);
  const inspected = stripCommentsAndLiterals(code);
  // Interpolation expressions are executable. Inspect the comment-free source
  // conservatively whenever interpolation is present so a blocked API cannot
  // be hidden inside $"{ ... }" while ordinary string contents remain ignored.
  const securityText = /\$@?"|@\$"/.test(withoutComments) ? `${inspected}\n${withoutComments}` : inspected;
  for (const [pattern, message] of blockedApiPatterns) {
    if (pattern.test(securityText)) return { allowed: false, message };
  }
  return { allowed: true };
};

const sanitizeRunnerText = (value, tempDirectory = "") => {
  let result = String(value || "").replace(/\r\n/g, "\n");
  if (tempDirectory) result = result.split(tempDirectory).join("practice");
  result = result
    .replace(/\/source\/Program\.cs\((\d+),(\d+)\)/g, "Line $1, column $2")
    .replace(/\/tmp\/practice[^\s:]*/g, "practice")
    .replace(/^\s*at .*\/source\/Program\.cs:line \d+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return result;
};

const removeContainer = (dockerBinary, containerName) => new Promise((resolve) => {
  try {
    execFile(dockerBinary, ["rm", "-f", containerName], { windowsHide: true, timeout: 2_000 }, () => resolve());
  } catch {
    resolve();
  }
});

const unavailableError = (message = "Practice runner is unavailable", reason = "runner_unreachable") => {
  const error = new Error(message);
  error.code = "RUNNER_UNAVAILABLE";
  error.reason = reason;
  return error;
};

const remoteHeaders = () => {
  const headers = { "content-type": "application/json", accept: "application/json" };
  const token = String(process.env.PRACTICE_RUNNER_TOKEN || "").trim();
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
};

const configuredRemoteBaseUrl = () => {
  const configured = String(process.env.PRACTICE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!configured) return "";
  const candidate = /^https?:\/\//i.test(configured)
    ? configured
    : /^[a-z][a-z\d+.-]*:\/\//i.test(configured)
      ? ""
      : `http://${configured}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? candidate : "";
  } catch {
    return "";
  }
};

const remoteUrl = (pathName) => `${configuredRemoteBaseUrl()}${pathName}`;
const probeRemoteRunner = async ({ signal }) => {
  const startedAt = Date.now();
  try {
    const response = await fetch(remoteUrl("/health/auth"), {
      headers: remoteHeaders(), signal, redirect: "error",
    });
    const contentType = response.headers.get("content-type") || "";
    if (response.status === 401 || response.status === 403) {
      throw unavailableError("Practice runner authentication failed", "runner_auth_failed");
    }
    if (response.ok && contentType.includes("application/json")) {
      const result = await response.json();
      if (result.status === "ok" && (result.compilerAvailable === true || result.dotnet === true)) return result;
      throw unavailableError("Practice runner reported an unavailable runtime", "runtime_unavailable");
    }
    await response.text();
    if (response.status === 404) throw unavailableError("Practice runner health endpoint was not found", "runner_http_error");
    if (response.status === 503 && contentType.includes("application/json")) {
      throw unavailableError("Practice runner reported an unavailable runtime", "runtime_unavailable");
    }
    throw unavailableError("Practice runner is starting", "runner_starting");
  } catch (error) {
    if (error.code === "RUNNER_UNAVAILABLE") throw error;
    if (error.name === "AbortError" || signal.aborted) throw unavailableError("Practice runner is starting", "runner_starting");
    throw unavailableError("Practice runner could not be reached", "runner_unreachable");
  } finally {
    console.info(`Practice runner readiness check (durationMs=${Date.now() - startedAt})`);
  }
};

const normalizeRunnerResult = (value, outputLimit = DEFAULT_OUTPUT_LIMIT) => {
  if (!value || typeof value !== "object" || typeof value.success !== "boolean") {
    throw unavailableError("Practice runner returned an invalid response");
  }
  const stdout = sanitizeRunnerText(value.stdout);
  const stderr = sanitizeRunnerText(value.stderr);
  if (Buffer.byteLength(stdout + stderr, "utf8") > outputLimit) {
    return { success: false, stdout: stdout.slice(0, outputLimit), stderr: "Output limit exceeded. Reduce the amount your program prints.", outputLimited: true, errorType: "output_limit" };
  }
  return {
    success: value.success,
    stdout,
    stderr,
    ...(value.timedOut ? { timedOut: true } : {}),
    ...(value.outputLimited ? { outputLimited: true } : {}),
    ...(typeof value.errorType === "string" ? { errorType: value.errorType } : {}),
  };
};

const runRemotePracticeCode = async (code, { timeoutMs, outputLimit }) => {
  if (!String(process.env.PRACTICE_RUNNER_TOKEN || "").trim()) {
    console.error("Practice runner token not configured");
    throw unavailableError("Remote practice runner authentication is not configured", "runner_token_missing");
  }
  const controller = new AbortController();
  const buildTimeoutMs = Number(process.env.PRACTICE_COMPILE_TIMEOUT_MS) || Number(process.env.PRACTICE_RUNNER_BUILD_TIMEOUT_MS) || DEFAULT_BUILD_TIMEOUT_MS;
  const readyTimeoutMs = Number(process.env.PRACTICE_RUNNER_READY_TIMEOUT_MS) || DEFAULT_READY_TIMEOUT_MS;
  let timer = setTimeout(() => controller.abort(), readyTimeoutMs);
  const baseUrl = configuredRemoteBaseUrl();
  if (!baseUrl) {
    clearTimeout(timer);
    console.error("PRACTICE_RUNNER_URL invalid");
    throw unavailableError("Remote practice runner URL is invalid", "runner_url_invalid");
  }
  console.info(`Practice runner request attempted (configured=true, normalized=true, protocol=${new URL(baseUrl).protocol.replace(":", "")})`);
  try {
    await probeRemoteRunner({ signal: controller.signal });
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), buildTimeoutMs + timeoutMs + 2_000);
    const runStartedAt = Date.now();
    const response = await fetch(remoteUrl("/run"), {
      method: "POST",
      headers: remoteHeaders(),
      body: JSON.stringify({ code, timeoutMs, outputLimit }),
      signal: controller.signal,
      redirect: "error",
    });
    if (response.status === 429) {
      console.info(`Practice runner busy rejection (durationMs=${Date.now() - runStartedAt})`);
      return { success: false, code: "PRACTICE_RUNNER_BUSY", stdout: "", stderr: "The compiler is busy. Please try again in a moment.", errorType: "runner_busy", retryAfterMs: DEFAULT_RETRY_AFTER_MS };
    }
    if (response.status === 401 || response.status === 403) {
      console.error("Practice runner authentication failed");
      throw unavailableError(`Practice runner request failed with status ${response.status}`, "runner_auth_failed");
    }
    if (response.status === 503) {
      console.error("Practice compiler runtime unavailable");
      throw unavailableError("Practice runner reported an unavailable runtime", "runtime_unavailable");
    }
    if (response.status === 404 || response.status >= 500) {
      console.error(`Practice runner HTTP failure (status=${response.status})`);
      throw unavailableError(`Practice runner request failed with status ${response.status}`, "runner_http_error");
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > outputLimit * 2) throw unavailableError("Practice runner response was too large");
    let payload;
    try { payload = JSON.parse(text); } catch { throw unavailableError("Practice runner returned non-JSON data"); }
    console.info(`Practice runner request completed (status=${response.status}, durationMs=${Date.now() - runStartedAt})`);
    return normalizeRunnerResult(payload, outputLimit);
  } catch (error) {
    if (error.code === "RUNNER_UNAVAILABLE") throw error;
    const detail = error.cause?.code || error.code || error.name || "unknown";
    console.error(`Practice runner unreachable (${detail})`);
    throw unavailableError(error.name === "AbortError" ? "Practice runner did not respond in time" : "Practice runner could not be reached", error.name === "AbortError" ? "runner_timeout" : "runner_unreachable");
  } finally {
    clearTimeout(timer);
  }
};

const execFileResult = (file, args, options = {}) => new Promise((resolve, reject) => {
  execFile(file, args, { windowsHide: true, ...options }, (error, stdout, stderr) => {
    if (error) reject(error); else resolve({ stdout, stderr });
  });
});

const directDotnetEnvironment = (tempDirectory, packageDirectory) => {
  const environment = {
    PATH: process.env.PATH,
    DOTNET_ROOT: process.env.DOTNET_ROOT,
    DOTNET_CLI_HOME: path.join(tempDirectory, ".dotnet"),
    NUGET_PACKAGES: packageDirectory,
    HOME: tempDirectory,
    USERPROFILE: tempDirectory,
    DOTNET_NOLOGO: "1",
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
    DOTNET_CLI_TELEMETRY_OPTOUT: "1",
    DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: "1",
    DOTNET_EnableDiagnostics: "0",
    MSBUILDDISABLENODEREUSE: "1",
  };
  if (process.platform === "win32") {
    environment.SystemRoot = process.env.SystemRoot;
    environment.ProgramFiles = process.env.ProgramFiles;
    environment["ProgramFiles(x86)"] = process.env["ProgramFiles(x86)"];
    environment.APPDATA = tempDirectory;
    environment.LOCALAPPDATA = tempDirectory;
    environment.TEMP = tempDirectory;
    environment.TMP = tempDirectory;
  }
  return Object.fromEntries(Object.entries(environment).filter(([, value]) => value != null));
};

const collectProcess = (file, args, {
  cwd,
  env,
  timeoutMs,
  outputLimit,
  timeoutMessage,
  spawnOptions = {},
}) => new Promise((resolve, reject) => {
  let child;
  try {
    child = spawn(file, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      ...spawnOptions,
    });
  } catch {
    reject(unavailableError(`${file} could not be started`));
    return;
  }

  let stdout = "";
  let stderr = "";
  let totalBytes = 0;
  let settled = false;
  let timer;
  const finish = (result) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    resolve(result);
  };
  const stop = () => {
    try { child.kill("SIGKILL"); } catch { /* Process already exited. */ }
  };
  const collect = (kind) => (chunk) => {
    totalBytes += chunk.length;
    const remaining = Math.max(0, outputLimit - Buffer.byteLength(stdout + stderr, "utf8"));
    const text = chunk.subarray(0, remaining).toString("utf8");
    if (kind === "stdout") stdout += text; else stderr += text;
    if (totalBytes > outputLimit) {
      stop();
      finish({ exitCode: null, stdout, stderr, outputLimited: true });
    }
  };
  child.stdout.on("data", collect("stdout"));
  child.stderr.on("data", collect("stderr"));
  child.once("error", () => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    reject(unavailableError(`${file} could not be started`));
  });
  child.once("close", (exitCode) => finish({ exitCode, stdout, stderr }));
  timer = setTimeout(() => {
    stop();
    finish({ exitCode: null, stdout, stderr: timeoutMessage, timedOut: true });
  }, timeoutMs);
});

const directProject = (targetFramework) => `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>${targetFramework}</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><WarningLevel>0</WarningLevel><UseSharedCompilation>false</UseSharedCompilation></PropertyGroup></Project>`;

const chownTree = async (target, uid, gid) => {
  const entries = await fs.readdir(target, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) await chownTree(child, uid, gid);
    await fs.chown(child, uid, gid);
  }));
};

const prepareDirectTemplate = (dotnetBinary, targetFramework) => {
  const configuredTemplate = String(process.env.PRACTICE_TEMPLATE_DIR || "").trim();
  const cacheKey = `${dotnetBinary}:${targetFramework}:${configuredTemplate}`;
  if (!directTemplatePromises.has(cacheKey)) {
    directTemplatePromises.set(cacheKey, (async () => {
      if (configuredTemplate) {
        return {
          templateDirectory: configuredTemplate,
          packageDirectory: process.env.PRACTICE_NUGET_PACKAGES || path.join(configuredTemplate, ".nuget"),
        };
      }
      // Local/self-hosted direct mode prepares one process-wide template. The
      // production image supplies PRACTICE_TEMPLATE_DIR, so user requests never
      // perform restore work there.
      const templateDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "sharprunner-template-"));
      const packageDirectory = path.join(templateDirectory, ".nuget");
      await fs.writeFile(path.join(templateDirectory, "Practice.csproj"), directProject(targetFramework), "utf8");
      const environment = directDotnetEnvironment(templateDirectory, packageDirectory);
      await execFileResult(dotnetBinary, ["restore", "Practice.csproj", "--nologo", "--verbosity", "quiet"], {
        cwd: templateDirectory,
        env: environment,
        timeout: Number(process.env.PRACTICE_COMPILE_TIMEOUT_MS) || Number(process.env.PRACTICE_RUNNER_BUILD_TIMEOUT_MS) || DEFAULT_BUILD_TIMEOUT_MS,
        maxBuffer: DEFAULT_OUTPUT_LIMIT,
      });
      return { templateDirectory, packageDirectory };
    })());
  }
  return directTemplatePromises.get(cacheKey);
};

const runLegacyDirectPracticeCode = async (code, { timeoutMs, outputLimit }) => {
  const dotnetBinary = process.env.PRACTICE_DOTNET_BIN || "dotnet";
  const targetFramework = process.env.PRACTICE_DOTNET_TARGET || "net8.0";
  const buildTimeoutMs = Number(process.env.PRACTICE_COMPILE_TIMEOUT_MS) || Number(process.env.PRACTICE_RUNNER_BUILD_TIMEOUT_MS) || DEFAULT_BUILD_TIMEOUT_MS;
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "sharprunner-practice-"));
  const outputDirectory = path.join(tempDirectory, "build");
  const projectPath = path.join(tempDirectory, "Practice.csproj");
  let templateDirectory;
  let packageDirectory;
  try {
    ({ templateDirectory, packageDirectory } = await prepareDirectTemplate(dotnetBinary, targetFramework));
  } catch (error) {
    await fs.rm(tempDirectory, { recursive: true, force: true });
    throw error;
  }
  const environment = directDotnetEnvironment(tempDirectory, packageDirectory);
  const runAsUnprivilegedUser = process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() === 0;
  const spawnOptions = runAsUnprivilegedUser ? { uid: 65534, gid: 65534 } : {};

  try {
    console.info("Practice compile started");
    await fs.copyFile(path.join(templateDirectory, "Practice.csproj"), projectPath, fsConstants.COPYFILE_EXCL);
    await fs.cp(path.join(templateDirectory, "obj"), path.join(tempDirectory, "obj"), { recursive: true });
    const sourcePath = path.join(tempDirectory, "Program.cs");
    await fs.writeFile(sourcePath, code, { encoding: "utf8", flag: "wx", mode: 0o600 });
    if (runAsUnprivilegedUser) {
      await chownTree(tempDirectory, 65534, 65534);
      await fs.chown(tempDirectory, 65534, 65534);
    }
    const compileStartedAt = Date.now();
    const build = await collectProcess(dotnetBinary, [
      "build", projectPath,
      "--no-restore",
      "--configuration", "Release",
      "--output", outputDirectory,
      "--nologo", "--verbosity", "quiet",
      "-p:RestoreIgnoreFailedSources=true",
      "-p:UseSharedCompilation=false",
    ], {
      cwd: tempDirectory,
      env: environment,
      timeoutMs: buildTimeoutMs,
      outputLimit,
      timeoutMessage: "Compilation exceeded the allowed time.",
      spawnOptions,
    });
    const compileDurationMs = Date.now() - compileStartedAt;
    console.info(`Practice compile finished (durationMs=${compileDurationMs}, exitCode=${build.exitCode ?? "none"}, timedOut=${Boolean(build.timedOut)})`);
    const buildText = sanitizeRunnerText(`${build.stdout}\n${build.stderr}`, tempDirectory);
    if (build.outputLimited) return { success: false, stdout: "", stderr: "Compiler output limit exceeded.", outputLimited: true, errorType: "output_limit" };
    if (build.timedOut) return { success: false, stdout: "", stderr: build.stderr, timedOut: true, errorType: "timeout" };
    if (build.exitCode !== 0) return { success: false, stdout: "", stderr: buildText, errorType: "compiler" };

    const executionStartedAt = Date.now();
    const executionMemoryMb = Math.max(32, Number(process.env.PRACTICE_EXEC_MEMORY_LIMIT_MB) || 128);
    const execution = await collectProcess(dotnetBinary, [path.join(outputDirectory, "Practice.dll")], {
      cwd: tempDirectory,
      // This caps the managed heap in addition to the service/container plan's
      // process memory limit. Execution remains a separate unprivileged process.
      env: { ...environment, DOTNET_GCHeapHardLimit: (executionMemoryMb * 1024 * 1024).toString(16) },
      timeoutMs,
      outputLimit,
      timeoutMessage: `Program terminated after execution timeout (${timeoutMs / 1000} seconds).`,
      spawnOptions,
    });
    console.info(`Practice execution finished (durationMs=${Date.now() - executionStartedAt}, exitCode=${execution.exitCode ?? "none"}, timedOut=${Boolean(execution.timedOut)}, outputLimited=${Boolean(execution.outputLimited)})`);
    if (execution.outputLimited) {
      return { success: false, stdout: sanitizeRunnerText(execution.stdout, tempDirectory), stderr: "Output limit exceeded. Reduce the amount your program prints.", outputLimited: true, errorType: "output_limit" };
    }
    if (execution.timedOut) return { success: false, stdout: sanitizeRunnerText(execution.stdout, tempDirectory), stderr: execution.stderr, timedOut: true, errorType: "timeout" };
    return {
      success: execution.exitCode === 0,
      stdout: sanitizeRunnerText(execution.stdout, tempDirectory),
      stderr: sanitizeRunnerText(execution.stderr, tempDirectory),
      ...(execution.exitCode === 0 ? {} : { errorType: "runtime" }),
    };
  } finally {
    const cleanupStartedAt = Date.now();
    await fs.rm(tempDirectory, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
    console.info(`Practice job cleanup finished (durationMs=${Date.now() - cleanupStartedAt})`);
  }
};

const formatRoslynDiagnostics = (diagnostics = []) => diagnostics
  .filter((diagnostic) => diagnostic.severity === "error")
  .map((diagnostic) => {
    const location = diagnostic.line > 0 ? `Line ${diagnostic.line}, column ${diagnostic.column}: ` : "";
    return `${location}error ${diagnostic.id}: ${diagnostic.message}`;
  })
  .join("\n");

const runRoslynDirectPracticeCode = async (code, { timeoutMs, outputLimit }) => {
  const dotnetBinary = process.env.PRACTICE_DOTNET_BIN || "dotnet";
  const compileTimeoutMs = Number(process.env.PRACTICE_COMPILE_TIMEOUT_MS) || DEFAULT_BUILD_TIMEOUT_MS;
  const jobId = randomUUID();
  const assemblyName = `Student_${jobId.replaceAll("-", "")}`;
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "sharprunner-practice-"));
  const outputDirectory = path.join(tempDirectory, "build");
  const environment = directDotnetEnvironment(tempDirectory, process.env.PRACTICE_NUGET_PACKAGES || path.join(tempDirectory, ".nuget"));
  const runAsUnprivilegedUser = process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() === 0;
  const spawnOptions = runAsUnprivilegedUser ? { uid: 65534, gid: 65534 } : {};
  const totalStartedAt = Date.now();
  let exitCode = null;
  let timedOut = false;
  let outputLimited = false;

  console.info(`Practice job started (jobId=${jobId}, compiler=roslyn)`);
  try {
    await fs.mkdir(outputDirectory, { recursive: true, mode: 0o700 });
    if (runAsUnprivilegedUser) {
      await chownTree(tempDirectory, 65534, 65534);
      await fs.chown(tempDirectory, 65534, 65534);
    }

    const compileStartedAt = Date.now();
    console.info(`Practice Roslyn compile started (jobId=${jobId})`);
    let compilation;
    try {
      compilation = await compileWithRoslyn({ source: code, outputDirectory, assemblyName, timeoutMs: compileTimeoutMs });
    } catch (error) {
      const compileDurationMs = Date.now() - compileStartedAt;
      if (error.code === "COMPILER_TIMEOUT") {
        timedOut = true;
        console.info(`Practice Roslyn compile finished (jobId=${jobId}, durationMs=${compileDurationMs}, success=false, timedOut=true)`);
        return { success: false, stdout: "", stderr: "Compilation exceeded the allowed time.", timedOut: true, errorType: "compiler_timeout" };
      }
      console.error(`Practice Roslyn compile failed (jobId=${jobId}, durationMs=${compileDurationMs}, reason=${error.code || "unknown"})`);
      throw unavailableError("Roslyn compiler host is unavailable", "runtime_unavailable");
    }
    const compileDurationMs = Date.now() - compileStartedAt;
    timedOut = Boolean(compilation.timedOut);
    console.info(`Practice Roslyn compile finished (jobId=${jobId}, durationMs=${compileDurationMs}, success=${Boolean(compilation.success)}, timedOut=${timedOut})`);
    if (compilation.infrastructureError) throw unavailableError("Roslyn compiler host rejected the compile job", "runtime_unavailable");
    if (compilation.timedOut) return { success: false, stdout: "", stderr: "Compilation exceeded the allowed time.", timedOut: true, errorType: "compiler_timeout" };
    if (!compilation.success) {
      const compilerText = formatRoslynDiagnostics(compilation.diagnostics);
      if (Buffer.byteLength(compilerText, "utf8") > outputLimit) {
        outputLimited = true;
        return { success: false, stdout: "", stderr: "Compiler output limit exceeded.", outputLimited: true, errorType: "output_limit" };
      }
      return { success: false, stdout: "", stderr: compilerText || "Compilation failed.", errorType: "compiler" };
    }

    const expectedAssemblyPath = path.join(outputDirectory, `${assemblyName}.dll`);
    if (path.resolve(compilation.assemblyPath) !== path.resolve(expectedAssemblyPath)) {
      throw unavailableError("Roslyn compiler host returned an invalid artifact", "runtime_unavailable");
    }
    const executionStartedAt = Date.now();
    console.info(`Practice execution started (jobId=${jobId})`);
    const executionMemoryMb = Math.max(32, Number(process.env.PRACTICE_EXEC_MEMORY_LIMIT_MB) || 128);
    const execution = await collectProcess(dotnetBinary, [expectedAssemblyPath], {
      cwd: tempDirectory,
      env: { ...environment, DOTNET_GCHeapHardLimit: (executionMemoryMb * 1024 * 1024).toString(16) },
      timeoutMs,
      outputLimit,
      timeoutMessage: `Program terminated after execution timeout (${timeoutMs / 1000} seconds).`,
      spawnOptions,
    });
    exitCode = execution.exitCode;
    timedOut = Boolean(execution.timedOut);
    outputLimited = Boolean(execution.outputLimited);
    console.info(`Practice execution finished (jobId=${jobId}, durationMs=${Date.now() - executionStartedAt}, exitCode=${exitCode ?? "none"}, timedOut=${timedOut}, outputLimited=${outputLimited})`);
    if (execution.outputLimited) {
      return { success: false, stdout: sanitizeRunnerText(execution.stdout, tempDirectory), stderr: "Output limit exceeded. Reduce the amount your program prints.", outputLimited: true, errorType: "output_limit" };
    }
    if (execution.timedOut) return { success: false, stdout: sanitizeRunnerText(execution.stdout, tempDirectory), stderr: execution.stderr, timedOut: true, errorType: "timeout" };
    return {
      success: execution.exitCode === 0,
      stdout: sanitizeRunnerText(execution.stdout, tempDirectory),
      stderr: sanitizeRunnerText(execution.stderr, tempDirectory),
      ...(execution.exitCode === 0 ? {} : { errorType: "runtime" }),
    };
  } finally {
    const cleanupStartedAt = Date.now();
    await fs.rm(tempDirectory, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
    console.info(`Practice job cleanup finished (jobId=${jobId}, durationMs=${Date.now() - cleanupStartedAt})`);
    console.info(`Practice job finished (jobId=${jobId}, totalDurationMs=${Date.now() - totalStartedAt}, exitCode=${exitCode ?? "none"}, timedOut=${timedOut}, outputLimited=${outputLimited})`);
  }
};

const runDirectPracticeCode = (code, options) => String(process.env.PRACTICE_COMPILER_MODE || "legacy").toLowerCase() === "roslyn"
  ? runRoslynDirectPracticeCode(code, options)
  : runLegacyDirectPracticeCode(code, options);

const getPracticeRunnerDiagnostic = async () => {
  if (String(process.env.PRACTICE_RUNNER_ENABLED || "true").toLowerCase() === "false") {
    return { available: false, mode: "disabled", reason: "execution is disabled by PRACTICE_RUNNER_ENABLED" };
  }
  if (process.env.PRACTICE_RUNNER_URL) {
    if (!String(process.env.PRACTICE_RUNNER_TOKEN || "").trim()) return { available: false, mode: "remote", reason: "PRACTICE_RUNNER_TOKEN is missing", reasonCode: "runner_token_missing" };
    if (!configuredRemoteBaseUrl()) return { available: false, mode: "remote", reason: "PRACTICE_RUNNER_URL is invalid", reasonCode: "runner_url_invalid" };
    const controller = new AbortController();
    const readyTimeoutMs = Number(process.env.PRACTICE_RUNNER_READY_TIMEOUT_MS) || DEFAULT_READY_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), readyTimeoutMs);
    try {
      await probeRemoteRunner({ signal: controller.signal });
      return { available: true, mode: "remote", reason: "remote runner is healthy" };
    } catch (error) {
      if (error.code === "RUNNER_UNAVAILABLE") {
        return { available: false, mode: "remote", reason: error.message, reasonCode: error.reason };
      }
      return { available: false, mode: "remote", reason: error.name === "AbortError" ? "health request timed out" : `health request failed: ${error.message}`, reasonCode: error.name === "AbortError" ? "runner_timeout" : "runner_unreachable" };
    } finally {
      clearTimeout(timer);
    }
  }
  if (process.env.NODE_ENV === "production" && String(process.env.PRACTICE_RUNNER_MODE || "").toLowerCase() !== "direct") {
    return { available: false, mode: "remote", reason: "PRACTICE_RUNNER_URL is missing", reasonCode: "runner_url_missing" };
  }
  if (String(process.env.PRACTICE_RUNNER_MODE || "docker").toLowerCase() === "direct") {
    if (String(process.env.PRACTICE_COMPILER_MODE || "legacy").toLowerCase() === "roslyn") {
      try {
        const health = await getCompilerHostHealth();
        return { available: true, mode: "direct", compilerMode: "roslyn", reason: "Roslyn compiler host is ready", targetFramework: health.targetFramework };
      } catch (error) {
        return { available: false, mode: "direct", compilerMode: "roslyn", reason: `Roslyn compiler host check failed: ${error.code || error.message}` };
      }
    }
    const dotnetBinary = process.env.PRACTICE_DOTNET_BIN || "dotnet";
    const cacheKey = `${dotnetBinary}:${process.env.PRACTICE_DOTNET_TARGET || "net8.0"}`;
    if (!directDiagnosticPromises.has(cacheKey)) directDiagnosticPromises.set(cacheKey, (async () => {
      try {
      const checkEnvironment = { PATH: process.env.PATH, DOTNET_ROOT: process.env.DOTNET_ROOT };
      const [sdks, runtimes] = await Promise.all([
        execFileResult(dotnetBinary, ["--list-sdks"], { timeout: 3_000, env: checkEnvironment }),
        execFileResult(dotnetBinary, ["--list-runtimes"], { timeout: 3_000, env: checkEnvironment }),
      ]);
      const sdkVersion = sdks.stdout.match(/^(\d+\.\d+\.\d+)/m)?.[1];
      const sdkFound = Boolean(sdkVersion);
      const runtimeFound = /^Microsoft\.NETCore\.App\s+\d+/m.test(runtimes.stdout);
      return sdkFound && runtimeFound
        ? { available: true, mode: "direct", reason: ".NET SDK and runtime found", sdkVersion }
        : !sdkFound
          ? { available: false, mode: "direct", reason: "dotnet exists but no SDK is installed" }
          : { available: false, mode: "direct", reason: ".NET SDK exists but the runtime is missing" };
      } catch (error) {
        return { available: false, mode: "direct", reason: `dotnet SDK check failed: ${error.code || error.message}` };
      }
    })());
    return directDiagnosticPromises.get(cacheKey);
  }
  try {
    const dockerBinary = process.env.PRACTICE_DOCKER_BIN || "docker";
    const image = process.env.PRACTICE_DOTNET_IMAGE || DEFAULT_IMAGE;
    await execFileResult(dockerBinary, ["info", "--format", "{{.ServerVersion}}"], { timeout: 3_000, env: { PATH: process.env.PATH } });
    await execFileResult(dockerBinary, ["image", "inspect", image], { timeout: 3_000, env: { PATH: process.env.PATH } });
    return { available: true, mode: "docker", reason: "Docker daemon and SDK image found" };
  } catch (error) {
    return { available: false, mode: "docker", reason: `Docker or SDK image check failed: ${error.code || error.message}` };
  }
};

const getPracticeRunnerHealth = async () => {
  const diagnostic = await getPracticeRunnerDiagnostic();
  if (!diagnostic.available) {
    if (diagnostic.reasonCode === "runner_url_missing") console.error("PRACTICE_RUNNER_URL not configured");
    else if (diagnostic.reasonCode === "runner_url_invalid") console.error("PRACTICE_RUNNER_URL invalid");
    else if (diagnostic.reasonCode === "runner_token_missing") console.error("Practice runner token not configured");
    else if (diagnostic.reasonCode === "runner_auth_failed") console.error("Practice runner authentication failed");
    else if (diagnostic.reasonCode === "runtime_unavailable") console.error("Practice compiler runtime unavailable");
    else console.error(`Practice runner unreachable (${diagnostic.reasonCode || "unknown"})`);
  }
  return diagnostic.available
    ? { available: true }
    : { available: false, reason: diagnostic.reasonCode || "runtime_unavailable" };
};

const runPracticeCode = async (code, options = {}) => {
  const timeoutMs = options.timeoutMs ?? (Number(process.env.PRACTICE_EXEC_TIMEOUT_MS) || Number(process.env.PRACTICE_RUNNER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const outputLimit = options.outputLimit ?? (Number(process.env.PRACTICE_RUNNER_OUTPUT_LIMIT) || DEFAULT_OUTPUT_LIMIT);
  const policy = validatePracticeCode(code, options.codeLimit);
  if (!policy.allowed) return { success: false, stdout: "", stderr: policy.message, rejected: true };
  if (String(process.env.PRACTICE_RUNNER_ENABLED || "true").toLowerCase() === "false") {
    throw unavailableError("Practice runner is disabled");
  }

  if (process.env.PRACTICE_RUNNER_URL) return runRemotePracticeCode(code, { timeoutMs, outputLimit });
  if (process.env.NODE_ENV === "production" && String(process.env.PRACTICE_RUNNER_MODE || "").toLowerCase() !== "direct") {
    console.error("PRACTICE_RUNNER_URL not configured");
    throw unavailableError("Remote practice runner URL is not configured", "runner_url_missing");
  }
  if (String(process.env.PRACTICE_RUNNER_MODE || "docker").toLowerCase() === "direct") {
    return runDirectPracticeCode(code, { timeoutMs, outputLimit });
  }

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "sharprunner-practice-"));
  const containerName = `sharprunner-practice-${randomUUID()}`;
  const dockerBinary = process.env.PRACTICE_DOCKER_BIN || "docker";
  const image = process.env.PRACTICE_DOTNET_IMAGE || DEFAULT_IMAGE;
  const project = '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><WarningLevel>0</WarningLevel></PropertyGroup></Project>';

  try {
    await fs.writeFile(path.join(tempDirectory, "Practice.csproj"), project, { encoding: "utf8", flag: "wx", mode: 0o644 });
    await fs.writeFile(path.join(tempDirectory, "Program.cs"), code, { encoding: "utf8", flag: "wx", mode: 0o644 });
    await fs.chmod(tempDirectory, 0o755);

    const mountSource = `${path.resolve(tempDirectory)}:/source:ro`;
    const args = [
    "run", "--rm", "--name", containerName,
    "--network", "none", "--read-only", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--memory", "256m", "--memory-swap", "256m",
    "--cpus", "0.5", "--pids-limit", "64", "--tmpfs", "/tmp:rw,nosuid,size=64m,mode=1777",
    "--user", "65534:65534", "-e", "HOME=/tmp", "-e", "DOTNET_CLI_HOME=/tmp/dotnet",
    "-e", "DOTNET_NOLOGO=1", "-e", "DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1",
    "-v", mountSource, "-w", "/tmp", image,
    "dotnet", "run", "--project", "/source/Practice.csproj", "--artifacts-path", "/tmp/artifacts", "--verbosity", "quiet",
    ];

    return await new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(dockerBinary, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { PATH: process.env.PATH } });
      } catch {
        reject(unavailableError("Container runtime could not be started"));
        return;
      }
      let stdout = "";
      let stderr = "";
      let totalBytes = 0;
      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const collect = (kind) => (chunk) => {
        totalBytes += chunk.length;
        const remaining = Math.max(0, outputLimit - Buffer.byteLength(stdout + stderr, "utf8"));
        const text = chunk.subarray(0, remaining).toString("utf8");
        if (kind === "stdout") stdout += text; else stderr += text;
        if (totalBytes > outputLimit) {
          child.kill();
          void removeContainer(dockerBinary, containerName);
          finish({ success: false, stdout: sanitizeRunnerText(stdout, tempDirectory), stderr: "Output limit exceeded. Reduce the amount your program prints.", outputLimited: true, errorType: "output_limit" });
        }
      };
      child.stdout.on("data", collect("stdout"));
      child.stderr.on("data", collect("stderr"));
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(unavailableError("Container runtime could not be started"));
      });
      child.on("close", (exitCode) => {
        const cleanStdout = sanitizeRunnerText(stdout, tempDirectory);
        const cleanStderr = sanitizeRunnerText(stderr, tempDirectory);
        if (exitCode === 125 || /(?:docker:|daemon|Unable to find image|pull access denied)/i.test(cleanStderr)) {
          reject(unavailableError("Container runtime or SDK image is unavailable"));
          return;
        }
        finish({
          success: exitCode === 0,
          stdout: cleanStdout,
          stderr: cleanStderr,
          ...(exitCode === 0 ? {} : { errorType: /\berror CS\d+/i.test(cleanStderr) ? "compiler" : "runtime" }),
        });
      });
      const timer = setTimeout(() => {
        child.kill();
        void removeContainer(dockerBinary, containerName);
        finish({ success: false, stdout: sanitizeRunnerText(stdout, tempDirectory), stderr: `Execution stopped after ${timeoutMs / 1000} seconds. Check for an infinite or very long loop.`, timedOut: true, errorType: "timeout" });
      }, timeoutMs);
    });
  } finally {
    await removeContainer(dockerBinary, containerName);
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
};

module.exports = { configuredRemoteBaseUrl, getPracticeRunnerDiagnostic, getPracticeRunnerHealth, normalizeRunnerResult, runDirectPracticeCode, runLegacyDirectPracticeCode, runPracticeCode, runRoslynDirectPracticeCode, sanitizeRunnerText, validatePracticeCode };
