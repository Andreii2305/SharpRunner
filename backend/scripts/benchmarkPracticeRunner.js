const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { runDirectPracticeCode } = require("../src/services/practiceRunnerService");
const { stopCompilerHost } = require("../src/services/roslynCompilerHostClient");

const sdkMajor = execFileSync("dotnet", ["--version"], { encoding: "utf8", windowsHide: true }).trim().split(".")[0];
process.env.PRACTICE_COMPILER_MODE = "roslyn";
process.env.PRACTICE_ROSLYN_HOST_DLL ||= path.resolve(__dirname, `../compiler-host/bin/Release/net${sdkMajor}.0/SharpRunner.CompilerHost.dll`);

const source = 'Console.WriteLine("Hello SharpRunner");';

const main = async () => {
  const rows = [];
  for (let run = 1; run <= 3; run += 1) {
    const row = { run };
    const originalInfo = console.info;
    console.info = (message) => {
      const text = String(message);
      const duration = Number(text.match(/durationMs=(\d+)/)?.[1]);
      if (text.includes("Roslyn compile finished")) row.compileMs = duration;
      if (text.includes("execution finished")) row.executionMs = duration;
    };
    const startedAt = Date.now();
    try {
      const result = await runDirectPracticeCode(source, { timeoutMs: 2_000, outputLimit: 32 * 1024 });
      if (!result.success || result.stdout !== "Hello SharpRunner") throw new Error(result.stderr || "Unexpected benchmark output");
      row.totalMs = Date.now() - startedAt;
      rows.push(row);
    } finally {
      console.info = originalInfo;
    }
  }
  console.table(rows);
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(stopCompilerHost);
