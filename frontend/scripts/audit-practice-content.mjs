import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { builtInModules } from "../src/builtInModules/index.js";

const expectedIds = new Set(["tutorial", "arrays", "functions", "functions-with-arrays", "final"]);
const runnable = [];

for (const module of builtInModules) {
  assert(expectedIds.delete(module.id), `Unexpected or duplicate module ${module.id}`);
  assert(module.references.at(-1)?.title.startsWith("CodeChum."), `${module.id}: CodeChum footer reference missing`);
  assert(module.references.some(({ title }) => title.startsWith("Microsoft Learn.")), `${module.id}: Microsoft reference missing`);
  const practices = module.sections.flatMap(({ blocks }) => blocks.filter(({ type }) => type === "practice"));
  assert(practices.length > 0, `${module.id}: Try It Yourself activity missing`);
  for (const block of practices) {
    assert(block.id && block.prompt && block.starterCode && block.solution, `${module.id}: incomplete practice block`);
    runnable.push({ name: `${module.id}/${block.id}`, code: block.solution, expected: block.expectedOutput });
  }
  const examples = module.sections.flatMap(({ blocks }) => blocks).filter(({ type, runnable }) => type === "code" && runnable);
  assert(examples.length > 0, `${module.id}: runnable worked example missing`);
  examples.forEach((example, index) => runnable.push({ name: `${module.id}/worked-example-${index + 1}`, code: example.value, expected: example.output }));
}
assert.equal(expectedIds.size, 0, `Missing modules: ${[...expectedIds].join(", ")}`);

if (process.env.SKIP_DOTNET_PRACTICE_AUDIT !== "true") {
  const sdkMajor = execFileSync("dotnet", ["--version"], { encoding: "utf8", windowsHide: true }).trim().split(".")[0];
  for (const sample of runnable) {
    const directory = mkdtempSync(join(tmpdir(), "sharprunner-content-audit-"));
    try {
      writeFileSync(join(directory, "Practice.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net${sdkMajor}.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><WarningLevel>0</WarningLevel></PropertyGroup></Project>`);
      writeFileSync(join(directory, "Program.cs"), sample.code);
      const output = execFileSync("dotnet", ["run", "--project", join(directory, "Practice.csproj"), "--verbosity", "quiet"], { encoding: "utf8", timeout: 60_000, windowsHide: true });
      if (sample.expected != null) assert.equal(output.replace(/\r\n/g, "\n").trim(), sample.expected.trim(), `${sample.name}: output mismatch`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

console.log(`Practice content audit passed (${runnable.length} compiled examples and activities)`);
