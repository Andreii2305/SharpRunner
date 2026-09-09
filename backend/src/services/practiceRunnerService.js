const { spawn, execFile } = require("child_process");
const { randomUUID } = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_OUTPUT_LIMIT = 32 * 1024;
const DEFAULT_CODE_LIMIT = 16 * 1024;
const DEFAULT_IMAGE = "mcr.microsoft.com/dotnet/sdk:8.0";

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
  execFile(dockerBinary, ["rm", "-f", containerName], { windowsHide: true, timeout: 2_000 }, () => resolve());
});

const runPracticeCode = async (code, options = {}) => {
  const timeoutMs = options.timeoutMs ?? (Number(process.env.PRACTICE_RUNNER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const outputLimit = options.outputLimit ?? (Number(process.env.PRACTICE_RUNNER_OUTPUT_LIMIT) || DEFAULT_OUTPUT_LIMIT);
  const policy = validatePracticeCode(code, options.codeLimit);
  if (!policy.allowed) return { success: false, stdout: "", stderr: policy.message, rejected: true };
  if (String(process.env.PRACTICE_RUNNER_ENABLED || "true").toLowerCase() === "false") {
    const error = new Error("Practice runner is disabled");
    error.code = "RUNNER_UNAVAILABLE";
    throw error;
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
      const child = spawn(dockerBinary, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { PATH: process.env.PATH } });
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
          finish({ success: false, stdout: sanitizeRunnerText(stdout, tempDirectory), stderr: "Output limit exceeded. Reduce the amount your program prints.", outputLimited: true });
        }
      };
      child.stdout.on("data", collect("stdout"));
      child.stderr.on("data", collect("stderr"));
      child.on("error", (error) => {
        clearTimeout(timer);
        error.code = "RUNNER_UNAVAILABLE";
        reject(error);
      });
      child.on("close", (exitCode) => finish({
        success: exitCode === 0,
        stdout: sanitizeRunnerText(stdout, tempDirectory),
        stderr: sanitizeRunnerText(stderr, tempDirectory),
      }));
      const timer = setTimeout(() => {
        child.kill();
        void removeContainer(dockerBinary, containerName);
        finish({ success: false, stdout: sanitizeRunnerText(stdout, tempDirectory), stderr: `Execution stopped after ${timeoutMs / 1000} seconds. Check for an infinite or very long loop.`, timedOut: true });
      }, timeoutMs);
    });
  } finally {
    await removeContainer(dockerBinary, containerName);
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
};

module.exports = { runPracticeCode, sanitizeRunnerText, validatePracticeCode };
