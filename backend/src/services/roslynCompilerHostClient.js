const { spawn } = require("child_process");
const { randomUUID } = require("crypto");
const os = require("os");
const path = require("path");

const MAX_PROTOCOL_BUFFER = 1024 * 1024;
let child = null;
let stdoutBuffer = "";
let startPromise = null;
let restartTimer = null;
let intentionallyStopped = false;
const pending = new Map();

const hostError = (message, code = "COMPILER_HOST_UNAVAILABLE") => Object.assign(new Error(message), { code });

const compilerHostDll = () => process.env.PRACTICE_ROSLYN_HOST_DLL
  || path.resolve(__dirname, "../../compiler-host/bin/Release/net8.0/SharpRunner.CompilerHost.dll");

const rejectPending = (error) => {
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(error);
  }
  pending.clear();
};

const scheduleRestart = () => {
  if (intentionallyStopped || restartTimer) return;
  restartTimer = setTimeout(() => {
    restartTimer = null;
    void ensureCompilerHost().catch((error) => {
      console.error(`Roslyn compiler host restart failed (${error.code || "unknown"})`);
      scheduleRestart();
    });
  }, 1_000);
  restartTimer.unref?.();
};

const handleHostExit = (exitedChild, exitCode, signal) => {
  if (child !== exitedChild) return;
  child = null;
  startPromise = null;
  stdoutBuffer = "";
  rejectPending(hostError("Roslyn compiler host exited unexpectedly"));
  if (!intentionallyStopped) {
    console.error(`Roslyn compiler host exited (exitCode=${exitCode ?? "none"}, signal=${signal || "none"}); restarting`);
    scheduleRestart();
  }
};

const handleStdout = (chunk) => {
  stdoutBuffer += chunk.toString("utf8");
  if (Buffer.byteLength(stdoutBuffer, "utf8") > MAX_PROTOCOL_BUFFER) {
    const failedChild = child;
    failedChild?.kill("SIGKILL");
    rejectPending(hostError("Roslyn compiler host returned an oversized response"));
    return;
  }
  let newline;
  while ((newline = stdoutBuffer.indexOf("\n")) !== -1) {
    const line = stdoutBuffer.slice(0, newline).trim();
    stdoutBuffer = stdoutBuffer.slice(newline + 1);
    if (!line) continue;
    let response;
    try { response = JSON.parse(line); } catch { child?.kill("SIGKILL"); return; }
    const request = pending.get(response.id);
    if (!request) continue;
    pending.delete(response.id);
    clearTimeout(request.timer);
    request.resolve(response);
  }
};

const sendRequest = (payload, timeoutMs) => new Promise((resolve, reject) => {
  if (!child || !child.stdin.writable) {
    reject(hostError("Roslyn compiler host is not running"));
    return;
  }
  const id = randomUUID();
  const timer = setTimeout(() => {
    pending.delete(id);
    child?.kill("SIGKILL");
    reject(hostError("Roslyn compilation exceeded the allowed time", payload.command === "compile" ? "COMPILER_TIMEOUT" : "COMPILER_HOST_UNAVAILABLE"));
  }, timeoutMs);
  pending.set(id, { resolve, reject, timer });
  child.stdin.write(`${JSON.stringify({ id, ...payload })}\n`, "utf8", (error) => {
    if (!error || !pending.has(id)) return;
    pending.delete(id);
    clearTimeout(timer);
    reject(hostError("Could not send a request to the Roslyn compiler host"));
  });
});

const ensureCompilerHost = async () => {
  if (child?.stdin.writable) return child;
  if (startPromise) return startPromise;
  intentionallyStopped = false;
  startPromise = (async () => {
    const dotnetBinary = process.env.PRACTICE_DOTNET_BIN || "dotnet";
    const hostDll = compilerHostDll();
    const runAsUnprivilegedUser = process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() === 0;
    const spawned = spawn(dotnetBinary, [hostDll], {
      cwd: os.tmpdir(),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      ...(runAsUnprivilegedUser ? { uid: 65534, gid: 65534 } : {}),
      env: {
        PATH: process.env.PATH,
        DOTNET_ROOT: process.env.DOTNET_ROOT,
        HOME: os.tmpdir(),
        USERPROFILE: os.tmpdir(),
        DOTNET_NOLOGO: "1",
        DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
        DOTNET_CLI_TELEMETRY_OPTOUT: "1",
        DOTNET_EnableDiagnostics: "0",
      },
    });
    child = spawned;
    spawned.stdout.on("data", (chunk) => {
      if (child === spawned) handleStdout(chunk);
    });
    spawned.stderr.on("data", (chunk) => {
      const message = chunk.toString("utf8").trim();
      if (message) console.info(`Roslyn compiler host: ${message}`);
    });
    spawned.once("error", () => handleHostExit(spawned, null, "spawn_error"));
    spawned.once("exit", (code, signal) => handleHostExit(spawned, code, signal));
    try {
      const health = await sendRequest({ command: "health" }, 5_000);
      if (!health.success || !health.ready) throw hostError("Roslyn compiler host is not ready");
      return spawned;
    } catch (error) {
      spawned.kill("SIGKILL");
      throw error;
    }
  })();
  try {
    return await startPromise;
  } finally {
    if (!child?.stdin.writable) startPromise = null;
  }
};

const getCompilerHostHealth = async () => {
  await ensureCompilerHost();
  const response = await sendRequest({ command: "health" }, 3_000);
  if (!response.success || !response.ready) throw hostError("Roslyn compiler host is not ready");
  return response;
};

const compileWithRoslyn = async ({ source, outputDirectory, assemblyName, timeoutMs }) => {
  await ensureCompilerHost();
  return sendRequest({ command: "compile", source, outputDirectory, assemblyName, timeoutMs }, timeoutMs + 1_000);
};

const stopCompilerHost = async () => {
  intentionallyStopped = true;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = null;
  const current = child;
  child = null;
  startPromise = null;
  rejectPending(hostError("Roslyn compiler host stopped"));
  if (!current) return;
  current.kill("SIGKILL");
  await new Promise((resolve) => current.once("exit", resolve));
};

const crashCompilerHostForTest = () => {
  const current = child;
  if (!current) return Promise.resolve();
  current.kill("SIGKILL");
  return new Promise((resolve) => current.once("exit", resolve));
};

module.exports = { compileWithRoslyn, crashCompilerHostForTest, getCompilerHostHealth, stopCompilerHost };
