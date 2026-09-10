const { spawn, execFile } = require("child_process");
const { randomUUID } = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_OUTPUT_LIMIT = 32 * 1024;
const DEFAULT_CODE_LIMIT = 16 * 1024;
const DEFAULT_IMAGE = "mcr.microsoft.com/dotnet/sdk:8.0";
// Includes free-tier service wake-up time; compilation and execution have their own limits.
const DEFAULT_REMOTE_TIMEOUT_MS = 60_000;
const DEFAULT_BUILD_TIMEOUT_MS = 30_000;

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

const unavailableError = (message = "Practice runner is unavailable") => {
  const error = new Error(message);
  error.code = "RUNNER_UNAVAILABLE";
  return error;
};

const remoteHeaders = () => {
  const headers = { "content-type": "application/json", accept: "application/json" };
  if (process.env.PRACTICE_RUNNER_TOKEN) headers.authorization = `Bearer ${process.env.PRACTICE_RUNNER_TOKEN}`;
  return headers;
};

const configuredRemoteBaseUrl = () => {
  const configured = String(process.env.PRACTICE_RUNNER_URL || "").trim().replace(/\/$/, "");
  if (!configured) return "";
  return /^[a-z][a-z\d+.-]*:\/\//i.test(configured) ? configured : `http://${configured}`;
};

const remoteUrl = (pathName) => `${configuredRemoteBaseUrl()}${pathName}`;

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
  if (!process.env.PRACTICE_RUNNER_TOKEN) throw unavailableError("Remote practice runner authentication is not configured");
  const controller = new AbortController();
  const buildTimeoutMs = Number(process.env.PRACTICE_RUNNER_BUILD_TIMEOUT_MS) || DEFAULT_BUILD_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), buildTimeoutMs + timeoutMs + DEFAULT_REMOTE_TIMEOUT_MS);
  try {
    const response = await fetch(remoteUrl("/run"), {
      method: "POST",
      headers: remoteHeaders(),
      body: JSON.stringify({ code, timeoutMs, outputLimit }),
      signal: controller.signal,
      redirect: "error",
    });
    if (response.status === 429) {
      return { success: false, stdout: "", stderr: "The practice runner is busy. Wait a moment and try again.", errorType: "rate_limit" };
    }
    if (response.status === 401 || response.status === 403 || response.status === 404 || response.status >= 500) {
      throw unavailableError(`Practice runner request failed with status ${response.status}`);
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > outputLimit * 2) throw unavailableError("Practice runner response was too large");
    let payload;
    try { payload = JSON.parse(text); } catch { throw unavailableError("Practice runner returned non-JSON data"); }
    return normalizeRunnerResult(payload, outputLimit);
  } catch (error) {
    if (error.code === "RUNNER_UNAVAILABLE") throw error;
    throw unavailableError(error.name === "AbortError" ? "Practice runner did not respond in time" : "Practice runner could not be reached");
  } finally {
    clearTimeout(timer);
  }
};

const execFileResult = (file, args, options = {}) => new Promise((resolve, reject) => {
  execFile(file, args, { windowsHide: true, ...options }, (error, stdout, stderr) => {
    if (error) reject(error); else resolve({ stdout, stderr });
  });
});

const directDotnetEnvironment = (tempDirectory) => {
  const environment = {
    PATH: process.env.PATH,
    DOTNET_ROOT: process.env.DOTNET_ROOT,
    DOTNET_CLI_HOME: path.join(tempDirectory, ".dotnet"),
    NUGET_PACKAGES: path.join(tempDirectory, ".nuget"),
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

const runDirectPracticeCode = async (code, { timeoutMs, outputLimit }) => {
  const dotnetBinary = process.env.PRACTICE_DOTNET_BIN || "dotnet";
  const targetFramework = process.env.PRACTICE_DOTNET_TARGET || "net8.0";
  const buildTimeoutMs = Number(process.env.PRACTICE_RUNNER_BUILD_TIMEOUT_MS) || DEFAULT_BUILD_TIMEOUT_MS;
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "sharprunner-practice-"));
  const outputDirectory = path.join(tempDirectory, "build");
  const projectPath = path.join(tempDirectory, "Practice.csproj");
  const environment = directDotnetEnvironment(tempDirectory);
  const runAsUnprivilegedUser = process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() === 0;
  const spawnOptions = runAsUnprivilegedUser ? { uid: 65534, gid: 65534 } : {};

  try {
    await fs.writeFile(projectPath, directProject(targetFramework), { encoding: "utf8", flag: "wx", mode: 0o600 });
    const sourcePath = path.join(tempDirectory, "Program.cs");
    await fs.writeFile(sourcePath, code, { encoding: "utf8", flag: "wx", mode: 0o600 });
    if (runAsUnprivilegedUser) {
      await Promise.all([
        fs.chown(tempDirectory, 65534, 65534),
        fs.chown(projectPath, 65534, 65534),
        fs.chown(sourcePath, 65534, 65534),
      ]);
    }
    const build = await collectProcess(dotnetBinary, [
      "build", projectPath,
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
    const buildText = sanitizeRunnerText(`${build.stdout}\n${build.stderr}`, tempDirectory);
    if (build.outputLimited) return { success: false, stdout: "", stderr: "Compiler output limit exceeded.", outputLimited: true, errorType: "output_limit" };
    if (build.timedOut) return { success: false, stdout: "", stderr: build.stderr, timedOut: true, errorType: "timeout" };
    if (build.exitCode !== 0) return { success: false, stdout: "", stderr: buildText, errorType: "compiler" };

    const execution = await collectProcess(dotnetBinary, [path.join(outputDirectory, "Practice.dll")], {
      cwd: tempDirectory,
      env: environment,
      timeoutMs,
      outputLimit,
      timeoutMessage: `Program terminated after execution timeout (${timeoutMs / 1000} seconds).`,
      spawnOptions,
    });
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
    await fs.rm(tempDirectory, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
  }
};

const getPracticeRunnerDiagnostic = async () => {
  if (String(process.env.PRACTICE_RUNNER_ENABLED || "true").toLowerCase() === "false") {
    return { available: false, mode: "disabled", reason: "execution is disabled by PRACTICE_RUNNER_ENABLED" };
  }
  if (process.env.PRACTICE_RUNNER_URL) {
    if (!process.env.PRACTICE_RUNNER_TOKEN) return { available: false, mode: "remote", reason: "PRACTICE_RUNNER_TOKEN is missing" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await fetch(remoteUrl("/health"), { headers: remoteHeaders(), signal: controller.signal, redirect: "error" });
      if (!response.ok) return { available: false, mode: "remote", reason: `health request returned HTTP ${response.status}` };
      const result = await response.json();
      return result.available === true
        ? { available: true, mode: "remote", reason: "remote runner is healthy" }
        : { available: false, mode: "remote", reason: "remote runner reported unavailable" };
    } catch (error) {
      return { available: false, mode: "remote", reason: error.name === "AbortError" ? "health request timed out" : `health request failed: ${error.message}` };
    } finally {
      clearTimeout(timer);
    }
  }
  if (String(process.env.PRACTICE_RUNNER_MODE || "docker").toLowerCase() === "direct") {
    try {
      const dotnetBinary = process.env.PRACTICE_DOTNET_BIN || "dotnet";
      const checkEnvironment = { PATH: process.env.PATH, DOTNET_ROOT: process.env.DOTNET_ROOT };
      const [sdks, runtimes] = await Promise.all([
        execFileResult(dotnetBinary, ["--list-sdks"], { timeout: 3_000, env: checkEnvironment }),
        execFileResult(dotnetBinary, ["--list-runtimes"], { timeout: 3_000, env: checkEnvironment }),
      ]);
      const sdkFound = /^\d+\.\d+\.\d+/m.test(sdks.stdout);
      const runtimeFound = /^Microsoft\.NETCore\.App\s+\d+/m.test(runtimes.stdout);
      return sdkFound && runtimeFound
        ? { available: true, mode: "direct", reason: ".NET SDK and runtime found" }
        : !sdkFound
          ? { available: false, mode: "direct", reason: "dotnet exists but no SDK is installed" }
          : { available: false, mode: "direct", reason: ".NET SDK exists but the runtime is missing" };
    } catch (error) {
      return { available: false, mode: "direct", reason: `dotnet SDK check failed: ${error.code || error.message}` };
    }
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
  return { available: diagnostic.available };
};

const runPracticeCode = async (code, options = {}) => {
  const timeoutMs = options.timeoutMs ?? (Number(process.env.PRACTICE_RUNNER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const outputLimit = options.outputLimit ?? (Number(process.env.PRACTICE_RUNNER_OUTPUT_LIMIT) || DEFAULT_OUTPUT_LIMIT);
  const policy = validatePracticeCode(code, options.codeLimit);
  if (!policy.allowed) return { success: false, stdout: "", stderr: policy.message, rejected: true };
  if (String(process.env.PRACTICE_RUNNER_ENABLED || "true").toLowerCase() === "false") {
    throw unavailableError("Practice runner is disabled");
  }

  if (process.env.PRACTICE_RUNNER_URL) return runRemotePracticeCode(code, { timeoutMs, outputLimit });
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

module.exports = { getPracticeRunnerDiagnostic, getPracticeRunnerHealth, normalizeRunnerResult, runDirectPracticeCode, runPracticeCode, sanitizeRunnerText, validatePracticeCode };
