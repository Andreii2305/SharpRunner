const { spawn, execFile } = require("child_process");
const { randomUUID } = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_OUTPUT_LIMIT = 32 * 1024;
const DEFAULT_CODE_LIMIT = 16 * 1024;
const DEFAULT_IMAGE = "mcr.microsoft.com/dotnet/sdk:8.0";
const DEFAULT_REMOTE_TIMEOUT_MS = 8_000;

const blockedApiPatterns = [
  [/(?:global\s*::\s*)?System\s*\.\s*IO\b|\b(?:File|Directory|FileStream|StreamReader|StreamWriter)\s*\./i, "File access is not available in practice code."],
  [/(?:global\s*::\s*)?System\s*\.\s*Net\b|\b(?:HttpClient|WebClient|Socket|TcpClient|UdpClient)\b/i, "Network access is not available in practice code."],
  [/(?:global\s*::\s*)?System\s*\.\s*Diagnostics\b|\bProcess\s*\./i, "Starting or inspecting processes is not available in practice code."],
  [/\bEnvironment\s*\.|GetEnvironmentVariable/i, "Environment variables are not available in practice code."],
  [/\b(?:Reflection|Runtime\s*\.\s*InteropServices|DllImport|LibraryImport|Marshal|NativeLibrary|Assembly|Activator|AppDomain)\b/i, "Reflection and native APIs are not available in practice code."],
  [/\b(?:typeof|GetType|Type\s*\.\s*GetType|GetMethod|InvokeMember|Delegate)\b/i, "Runtime type inspection is not available in practice code."],
  [/\busing\s+[\p{L}_][\p{L}\p{N}_]*\s*=/iu, "Namespace aliases are not available in practice code."],
  [/\\u[0-9a-f]{4}|\\U[0-9a-f]{8}/i, "Escaped identifiers are not available in practice code."],
  [/\b(?:unsafe|stackalloc|dynamic)\b/i, "Unsafe and dynamic code is not available in the practice compiler."],
  [/\bMicrosoft\s*\.\s*Win32\b/i, "Operating-system APIs are not available in practice code."],
];

const stripCommentsAndLiterals = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\r\n]*/g, " ")
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
  const inspected = stripCommentsAndLiterals(code);
  for (const [pattern, message] of blockedApiPatterns) {
    if (pattern.test(inspected)) return { allowed: false, message };
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

const remoteUrl = (pathName) => `${String(process.env.PRACTICE_RUNNER_URL || "").replace(/\/$/, "")}${pathName}`;

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
  const timer = setTimeout(() => controller.abort(), timeoutMs + DEFAULT_REMOTE_TIMEOUT_MS);
  try {
    const response = await fetch(remoteUrl("/run"), {
      method: "POST",
      headers: remoteHeaders(),
      body: JSON.stringify({ code, timeoutMs, outputLimit }),
      signal: controller.signal,
      redirect: "error",
    });
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

const getPracticeRunnerHealth = async () => {
  if (String(process.env.PRACTICE_RUNNER_ENABLED || "true").toLowerCase() === "false") return { available: false };
  if (process.env.PRACTICE_RUNNER_URL) {
    if (!process.env.PRACTICE_RUNNER_TOKEN) return { available: false };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await fetch(remoteUrl("/health"), { headers: remoteHeaders(), signal: controller.signal, redirect: "error" });
      if (!response.ok) return { available: false };
      const result = await response.json();
      return { available: result.available === true };
    } catch {
      return { available: false };
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    const dockerBinary = process.env.PRACTICE_DOCKER_BIN || "docker";
    const image = process.env.PRACTICE_DOTNET_IMAGE || DEFAULT_IMAGE;
    await execFileResult(dockerBinary, ["info", "--format", "{{.ServerVersion}}"], { timeout: 3_000, env: { PATH: process.env.PATH } });
    await execFileResult(dockerBinary, ["image", "inspect", image], { timeout: 3_000, env: { PATH: process.env.PATH } });
    return { available: true };
  } catch {
    return { available: false };
  }
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

module.exports = { getPracticeRunnerHealth, normalizeRunnerResult, runPracticeCode, sanitizeRunnerText, validatePracticeCode };
