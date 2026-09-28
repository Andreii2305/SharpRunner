import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  FORBIDDEN_LEGACY_REFERENCES,
  loadCanonicalSentinels,
  runAudit,
  scanProtectedContent,
  scanSourceTree,
} from "./audit-protected-built-in-content.mjs";

const TEST_SENTINELS = [
  {
    lesson: "tutorial",
    category: "prose",
    label: "tutorial-prose",
    preview: "tutorial prose",
    patterns: ["cobalt lantern teaches precise instructions"],
  },
  {
    lesson: "arrays",
    category: "stable-id",
    label: "arrays-check-id",
    preview: "arrays-check-id",
    patterns: ["arrays-fixture-check-731"],
  },
  {
    lesson: "functions",
    category: "solution",
    label: "functions-solution",
    preview: "function solution",
    patterns: ["return emberTotal * moonFactor;"],
  },
  {
    lesson: "functions-with-arrays",
    category: "expected-output",
    label: "functions-with-arrays-output",
    preview: "expectedOutput=river-echo-44",
    patterns: ['"expectedOutput":"river-echo-44"'],
  },
  {
    lesson: "final",
    category: "feedback",
    label: "final-feedback",
    preview: "final feedback",
    patterns: ["bakunawa fixture feedback confirms traversal"],
  },
];

async function withFixture(files, callback) {
  const rootDir = await mkdtemp(path.join(tmpdir(), "sharprunner-content-audit-"));

  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = path.join(rootDir, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content);
    }

    return await callback(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function scanFixture(rootDir, overrides = {}) {
  return scanProtectedContent({
    rootDir,
    sentinels: TEST_SENTINELS,
    forbiddenReferences: FORBIDDEN_LEGACY_REFERENCES,
    ...overrides,
  });
}

test("clean source fixture passes", async () => {
  await withFixture(
    {
      "src/App.jsx": 'export const heading = "Welcome to SharpRunner";',
      "public/status.json": '{"ready":true}',
    },
    async (rootDir) => {
      assert.deepEqual(await scanFixture(rootDir), []);
    },
  );
});

test("JavaScript containing a protected prose sentinel fails", async () => {
  await withFixture(
    { "src/leak.js": `export default ${JSON.stringify(TEST_SENTINELS[0].patterns[0])};` },
    async (rootDir) => {
      const findings = await scanFixture(rootDir);
      assert.equal(findings.length, 1);
      assert.deepEqual(
        {
          path: findings[0].relativePath,
          lesson: findings[0].lesson,
          category: findings[0].category,
        },
        { path: "src/leak.js", lesson: "tutorial", category: "prose" },
      );
    },
  );
});

test("JavaScript containing a protected practice or check ID fails", async () => {
  await withFixture(
    { "src/check.js": `const checkId = "${TEST_SENTINELS[1].patterns[0]}";` },
    async (rootDir) => {
      const findings = await scanFixture(rootDir);
      assert.equal(findings[0].label, "arrays-check-id");
      assert.equal(findings[0].category, "stable-id");
    },
  );
});

test("JSON containing solution and expected-output sentinels reports both", async () => {
  await withFixture(
    {
      "assets/lesson.json": JSON.stringify({
        solution: TEST_SENTINELS[2].patterns[0],
        expectedOutput: "river-echo-44",
      }),
    },
    async (rootDir) => {
      const findings = await scanFixture(rootDir);
      assert.deepEqual(
        findings.map(({ lesson, category }) => ({ lesson, category })),
        [
          { lesson: "functions", category: "solution" },
          { lesson: "functions-with-arrays", category: "expected-output" },
        ],
      );
    },
  );
});

test("minified and concatenated JavaScript cannot hide a sentinel", async () => {
  await withFixture(
    {
      "assets/index.min.js": `(()=>{const a="prefix${TEST_SENTINELS[2].patterns[0]}suffix";return a})()`,
    },
    async (rootDir) => {
      const findings = await scanFixture(rootDir);
      assert.equal(findings.length, 1);
      assert.equal(findings[0].lesson, "functions");
    },
  );
});

test("lazy chunks are scanned", async () => {
  await withFixture(
    { "assets/LessonPage-lazy-7d91.js": TEST_SENTINELS[4].patterns[0] },
    async (rootDir) => {
      const findings = await scanFixture(rootDir);
      assert.equal(findings[0].relativePath, "assets/LessonPage-lazy-7d91.js");
      assert.equal(findings[0].category, "feedback");
    },
  );
});

test("source maps are scanned", async () => {
  await withFixture(
    {
      "assets/index.js.map": JSON.stringify({
        version: 3,
        sourcesContent: [TEST_SENTINELS[0].patterns[0]],
      }),
    },
    async (rootDir) => {
      const findings = await scanFixture(rootDir);
      assert.equal(findings[0].relativePath, "assets/index.js.map");
      assert.equal(findings[0].lesson, "tutorial");
    },
  );
});

test("HTML artifacts are scanned", async () => {
  await withFixture(
    { "index.html": `<script>window.checkId="${TEST_SENTINELS[1].patterns[0]}"</script>` },
    async (rootDir) => {
      const findings = await scanFixture(rootDir);
      assert.equal(findings[0].relativePath, "index.html");
      assert.equal(findings[0].lesson, "arrays");
    },
  );
});

test("deeply nested text artifacts are scanned", async () => {
  await withFixture(
    { "assets/lazy/deep/lesson.txt": TEST_SENTINELS[2].patterns[0] },
    async (rootDir) => {
      const findings = await scanFixture(rootDir);
      assert.equal(findings[0].relativePath, "assets/lazy/deep/lesson.txt");
    },
  );
});

test("each lesson's independent sentinel is detected", async (t) => {
  for (const sentinel of TEST_SENTINELS) {
    await t.test(sentinel.lesson, async () => {
      await withFixture(
        { [`assets/${sentinel.lesson}.js`]: sentinel.patterns[0] },
        async (rootDir) => {
          const findings = await scanFixture(rootDir);
          assert.equal(findings.length, 1);
          assert.equal(findings[0].lesson, sentinel.lesson);
          assert.equal(findings[0].category, sentinel.category);
        },
      );
    });
  }
});

test("forbidden legacy imports and references fail", async () => {
  await withFixture(
    {
      "src/legacy.js": [
        'import { getBuiltInModule } from "./builtInModules/index.js";',
        'const helper = "builtInModules/moduleHelpers";',
      ].join("\n"),
    },
    async (rootDir) => {
      const findings = await scanFixture(rootDir);
      assert.deepEqual(
        findings.map(({ category, label }) => ({ category, label })),
        [
          { category: "legacy-reference", label: "getBuiltInModule" },
          { category: "legacy-reference", label: "builtInModules/index" },
          { category: "legacy-reference", label: "builtInModules/moduleHelpers" },
        ],
      );
    },
  );
});

test("legitimate progress.js and generic tutorial or Preview words pass", async () => {
  await withFixture(
    {
      "src/builtInModules/progress.js": [
        'export const state = "tutorial";',
        'export const component = "Preview";',
      ].join("\n"),
    },
    async (rootDir) => {
      assert.deepEqual(await scanFixture(rootDir), []);
    },
  );
});

test("multiple findings are returned in deterministic path and descriptor order", async () => {
  await withFixture(
    {
      "z-last.js": TEST_SENTINELS[0].patterns[0],
      "a-first.js": `${TEST_SENTINELS[4].patterns[0]} ${TEST_SENTINELS[1].patterns[0]}`,
    },
    async (rootDir) => {
      const first = await scanFixture(rootDir);
      const second = await scanFixture(rootDir);
      assert.deepEqual(first, second);
      assert.deepEqual(
        first.map(({ relativePath, lesson }) => [relativePath, lesson]),
        [
          ["a-first.js", "arrays"],
          ["a-first.js", "final"],
          ["z-last.js", "tutorial"],
        ],
      );
    },
  );
});

test("obvious binary files are not decoded into false positives", async () => {
  const binary = Buffer.concat([
    Buffer.from([0, 255, 0, 254]),
    Buffer.from(TEST_SENTINELS[0].patterns[0]),
  ]);

  await withFixture({ "assets/image.png": binary }, async (rootDir) => {
    assert.deepEqual(await scanFixture(rootDir), []);
  });
});

test("extensionless text artifacts are scanned", async () => {
  await withFixture(
    { "assets/manifest": TEST_SENTINELS[4].patterns[0] },
    async (rootDir) => {
      const findings = await scanFixture(rootDir);
      assert.equal(findings[0].relativePath, "assets/manifest");
    },
  );
});

test("missing audit roots fail safely", async () => {
  const missingRoot = path.join(tmpdir(), `missing-sharprunner-audit-${process.pid}-${Date.now()}`);
  await assert.rejects(scanFixture(missingRoot), /Audit root does not exist/);
});

test("source mode explicitly excludes test fixtures and the audit's own definitions", async () => {
  await withFixture(
    {
      "src/App.jsx": 'export const safe = "production";',
      "src/App.test.js": TEST_SENTINELS[0].patterns[0],
      "scripts/audit-protected-built-in-content.mjs": [
        TEST_SENTINELS[1].patterns[0],
        "getBuiltInModule",
      ].join("\n"),
      "scripts/audit-protected-built-in-content.test.mjs": TEST_SENTINELS[4].patterns[0],
    },
    async (frontendRoot) => {
      const findings = await scanSourceTree({
        frontendRoot,
        sentinels: TEST_SENTINELS,
        forbiddenReferences: FORBIDDEN_LEGACY_REFERENCES,
      });
      assert.deepEqual(findings, []);
    },
  );
});

test("canonical sentinel inventory covers every protected category for every lesson", async () => {
  const sentinels = await loadCanonicalSentinels();
  const expectedLessons = ["tutorial", "arrays", "functions", "functions-with-arrays", "final"];
  const expectedCategories = ["prose", "stable-id", "solution", "expected-output", "feedback"];

  for (const lesson of expectedLessons) {
    const lessonSentinels = sentinels.filter((sentinel) => sentinel.lesson === lesson);
    const categories = new Set(lessonSentinels.map((sentinel) => sentinel.category));
    assert.ok(lessonSentinels.length >= 5, `${lesson} must have multiple independent sentinels`);
    for (const category of expectedCategories) {
      assert.ok(categories.has(category), `${lesson} is missing ${category}`);
    }
  }
});

test("dist CLI boundary sets a nonzero exit and reports path lesson and category", async () => {
  const [sentinel] = await loadCanonicalSentinels();

  await withFixture(
    { "assets/intentional-leak.js": sentinel.patterns[0] },
    async (rootDir) => {
      const originalConsoleError = console.error;
      const previousExitCode = process.exitCode;
      const output = [];

      try {
        process.exitCode = undefined;
        console.error = (...values) => output.push(values.join(" "));
        const findings = await runAudit(["--dist", "--root", rootDir]);
        const joinedOutput = output.join("\n");

        assert.equal(process.exitCode, 1);
        assert.equal(findings.length, 1);
        assert.match(joinedOutput, /assets\/intentional-leak\.js/);
        assert.match(joinedOutput, new RegExp(sentinel.lesson));
        assert.match(joinedOutput, new RegExp(sentinel.category));
        assert.equal(joinedOutput.includes(sentinel.patterns[0]), false);
      } finally {
        console.error = originalConsoleError;
        process.exitCode = previousExitCode;
      }
    },
  );
});
