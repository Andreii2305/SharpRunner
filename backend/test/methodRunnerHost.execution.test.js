const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const sdkMajor = execFileSync("dotnet", ["--version"], { encoding: "utf8", windowsHide: true }).trim().match(/^(\d+)/)?.[1];
if (!sdkMajor) throw new Error("The method runner tests require a .NET SDK");
const hostProject = path.resolve(__dirname, "../method-runner-host/SharpRunner.MethodRunnerHost.csproj");
const hostDll = path.resolve(__dirname, `../method-runner-host/bin/Release/net${sdkMajor}.0/SharpRunner.MethodRunnerHost.dll`);

const encode = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
const parseResult = (text) => {
  const line = text.split(/\r?\n/).find((value) => value.startsWith("SHARPRUNNER_RESULT:"));
  assert.ok(line, text);
  return JSON.parse(line.slice("SHARPRUNNER_RESULT:".length));
};

const compileStudent = async (directory, source) => {
  const project = `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net${sdkMajor}.0</TargetFramework><OutputType>Library</OutputType><AssemblyName>StudentSubmission</AssemblyName><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><AllowUnsafeBlocks>false</AllowUnsafeBlocks></PropertyGroup></Project>`;
  await fs.writeFile(path.join(directory, "StudentSubmission.csproj"), project);
  await fs.writeFile(path.join(directory, "Submission.cs"), source);
  const output = path.join(directory, "output");
  execFileSync("dotnet", ["build", "StudentSubmission.csproj", "--output", output, "--nologo", "--verbosity", "quiet"], { cwd: directory, windowsHide: true });
  return path.join(output, "StudentSubmission.dll");
};

const invoke = (assemblyPath, contract, input) => parseResult(execFileSync("dotnet", [hostDll, encode(contract), encode(input), assemblyPath], {
  encoding: "utf8",
  windowsHide: true,
  env: { PATH: process.env.PATH, DOTNET_ROOT: process.env.DOTNET_ROOT, SystemRoot: process.env.SystemRoot },
}));

test.before(() => {
  execFileSync("dotnet", ["build", hostProject, "--configuration", "Release", "--nologo", "--verbosity", "quiet"], { windowsHide: true });
});

test("trusted method host invokes a valid exact public static signature", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "method-host-valid-"));
  try {
    const assembly = await compileStudent(directory, "public static class Submission { public static int AddNumbers(int a, int b) { System.Console.WriteLine(\"student output\"); return a + b; } }");
    const result = invoke(assembly, { typeName: "Submission", methodName: "AddNumbers", parameterTypes: ["int", "int"], returnType: "int" }, [2, 3]);
    assert.deepEqual(result, { category: "SUCCESS", output: 5, stdout: "student output\n" });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("trusted method host rejects missing, wrong-return, and wrong-parameter signatures", async () => {
  const cases = [
    ["public static class Submission { public static int Different(int a) => a; }", { typeName: "Submission", methodName: "Required", parameterTypes: ["int"], returnType: "int" }],
    ["public static class Submission { public static string Required(int a) => a.ToString(); }", { typeName: "Submission", methodName: "Required", parameterTypes: ["int"], returnType: "int" }],
    ["public static class Submission { public static int Required(string a) => a.Length; }", { typeName: "Submission", methodName: "Required", parameterTypes: ["int"], returnType: "int" }],
  ];
  for (const [source, contract] of cases) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "method-host-signature-"));
    try {
      assert.equal(invoke(await compileStudent(directory, source), contract, [1]).category, "SIGNATURE_ERROR");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
});

test("trusted method host returns a sanitized runtime category without a stack or path", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "method-host-runtime-"));
  try {
    const assembly = await compileStudent(directory, "public static class Submission { public static int Fail(int value) => throw new System.InvalidOperationException(\"secret detail\"); }");
    const text = execFileSync("dotnet", [hostDll, encode({ typeName: "Submission", methodName: "Fail", parameterTypes: ["int"], returnType: "int" }), encode([1]), assembly], { encoding: "utf8", windowsHide: true });
    const result = parseResult(text);
    assert.deepEqual(result, { category: "RUNTIME_ERROR" });
    assert.doesNotMatch(text, /secret detail|\.cs:line|method-host-runtime/i);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("trusted method host bounds student console output", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "method-host-output-"));
  try {
    const assembly = await compileStudent(directory, "public static class Submission { public static int Loud(int value) { for (int i = 0; i < 2000; i++) System.Console.WriteLine(new string('x', 100)); return value; } }");
    const result = invoke(assembly, { typeName: "Submission", methodName: "Loud", parameterTypes: ["int"], returnType: "int" }, [1]);
    assert.deepEqual(result, { category: "OUTPUT_LIMIT" });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("trusted method host distinguishes managed resource exhaustion", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "method-host-resource-"));
  try {
    const assembly = await compileStudent(directory, "public static class Submission { public static int Exhaust(int value) => throw new System.OutOfMemoryException(); }");
    const result = invoke(assembly, { typeName: "Submission", methodName: "Exhaust", parameterTypes: ["int"], returnType: "int" }, [1]);
    assert.deepEqual(result, { category: "RESOURCE_LIMIT" });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
