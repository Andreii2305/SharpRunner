import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const npmCommand = "npm";
const checks = [
  ["Backend API tests", npmCommand, ["--prefix", "backend", "test"]],
  ["Frontend lint", npmCommand, ["--prefix", "frontend", "run", "lint"]],
  ["Frontend tests and audits", npmCommand, ["--prefix", "frontend", "test"]],
  ["Frontend production build", npmCommand, ["--prefix", "frontend", "run", "build"]],
];

function parseEnv(path) {
  if (!existsSync(path)) return null;

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
}

function printEnvironmentReadiness() {
  const backendEnv = parseEnv("backend/.env");
  const frontendEnv = parseEnv("frontend/.env.development");

  console.log("\nDemo environment readiness");

  if (!backendEnv) {
    console.log("  WARN backend/.env is missing; copy backend/.env.example and configure it.");
  } else {
    const databaseReady = Boolean(
      backendEnv.DATABASE_URL
      || (backendEnv.DB_HOST && backendEnv.DB_NAME && backendEnv.DB_USER && backendEnv.DB_PASSWORD),
    );
    const authReady = Boolean(backendEnv.JWT_SECRET);
    const emailReady = Boolean(
      backendEnv.SMTP_HOST && backendEnv.SMTP_USER && backendEnv.SMTP_PASS && backendEnv.EMAIL_FROM,
    );

    console.log(`  ${databaseReady ? "PASS" : "WARN"} database configuration`);
    console.log(`  ${authReady ? "PASS" : "WARN"} JWT configuration`);
    console.log(`  ${emailReady ? "PASS" : "INFO"} email verification configuration${emailReady ? "" : " (needed only when registering demo accounts)"}`);
    console.log(`  ${backendEnv.DEVELOPER_SETUP_KEY ? "PASS" : "INFO"} developer setup key${backendEnv.DEVELOPER_SETUP_KEY ? "" : " (needed only for the developer invite demo)"}`);
  }

  if (!frontendEnv?.VITE_API_BASE_URL) {
    console.log("  WARN frontend/.env.development does not define VITE_API_BASE_URL.");
  } else {
    console.log("  PASS frontend API URL configuration");
  }
}

async function checkDeployedPracticeCompiler() {
  const apiUrl = String(process.env.DEMO_API_URL || "").trim().replace(/\/+$/u, "");
  const studentToken = String(process.env.DEMO_STUDENT_TOKEN || "").trim();
  if (!apiUrl) {
    console.log("  INFO Practice compiler: NOT CHECKED (set DEMO_API_URL and DEMO_STUDENT_TOKEN for a deployed check)");
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const apiResponse = await fetch(`${apiUrl}/api/health`, { signal: controller.signal });
    console.log(`  ${apiResponse.ok ? "PASS" : "WARN"} Main API health (HTTP ${apiResponse.status})`);
    if (!studentToken) {
      console.log("  WARN Practice compiler: NOT CHECKED (DEMO_STUDENT_TOKEN is missing)");
      return;
    }
    const practiceResponse = await fetch(`${apiUrl}/api/practice/health`, {
      headers: { authorization: `Bearer ${studentToken}` },
      signal: controller.signal,
    });
    const practice = await practiceResponse.json().catch(() => ({}));
    console.log(`  ${practiceResponse.ok && practice.available === true ? "PASS" : "WARN"} Practice compiler: ${practiceResponse.ok && practice.available === true ? "READY" : `UNAVAILABLE (${practice.reason || `HTTP ${practiceResponse.status}`})`}`);
  } catch (error) {
    console.log(`  WARN Practice compiler: UNAVAILABLE (${error.name === "AbortError" ? "health check timed out" : "API unreachable"})`);
  } finally {
    clearTimeout(timer);
  }
}

printEnvironmentReadiness();
await checkDeployedPracticeCompiler();

for (const [name, command, args] of checks) {
  console.log(`\n=== ${name} ===`);
  // Windows resolves npm through npm.cmd, which requires the command shell.
  // The command and arguments are fixed above; no user input reaches the shell.
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(`Unable to run ${name}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\nDemo preflight failed during: ${name}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nDemo preflight passed. Continue with docs/DEMO_QA_CHECKLIST.md.");
