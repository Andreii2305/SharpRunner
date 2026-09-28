import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const storage = new Map([
  ["user", JSON.stringify({ id: 42, role: "student" })],
  ["sharprunner:built-in-module-progress:v1:42:arrays", JSON.stringify({
    moduleId: "arrays",
    completedSectionIds: ["protected-section"],
    completedCheckIds: ["protected-check"],
    lastSectionId: "protected-section",
  })],
]);
globalThis.localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};
globalThis.sessionStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};

const sidebarStubId = "\0checkpoint-d-sidebar-stub";
const monacoStubId = "\0checkpoint-d-monaco-stub";
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  ssr: { noExternal: ["@monaco-editor/react"] },
  plugins: [{
    name: "checkpoint-d-sidebar-stub",
    enforce: "pre",
    resolveId(source) {
      if (source.endsWith("/SideBar/Sidebar.jsx")) return sidebarStubId;
      if (source === "@monaco-editor/react") return monacoStubId;
      return null;
    },
    load(id) {
      if (id === sidebarStubId) return "export default function Sidebar() { return null; }";
      if (id === monacoStubId) {
        return "import React from 'react'; export default function Editor({ value }) { return React.createElement('pre', { 'data-editor': 'monaco' }, value); }";
      }
      return null;
    },
  }],
});
const { BuiltInModuleContentView } = await vite.ssrLoadModule("/src/pages/student/BuiltInModulePage.jsx");

test.after(async () => { await vite.close(); });

const renderState = (state, overrides = {}) => renderToStaticMarkup(React.createElement(
  BuiltInModuleContentView,
  {
    state,
    onRetry() {},
    onNavigateGame() {},
    ...overrides,
  },
));

const protectedSentinels = [
  "Protected lesson title",
  "Protected section prose",
  "secret starter code",
];

const assertNoProtectedContent = (html) => {
  for (const sentinel of protectedSentinels) assert.doesNotMatch(html, new RegExp(sentinel));
  assert.doesNotMatch(html, /Module contents/);
};

const legacyRichContentPaths = [
  "../../builtInModules/tutorial.js",
  "../../builtInModules/arrays.js",
  "../../builtInModules/functions.js",
  "../../builtInModules/functionsWithArrays.js",
  "../../builtInModules/finalReview.js",
  "../../builtInModules/index.js",
  "../../builtInModules/moduleHelpers.js",
];

const listProductionSourceFiles = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) files.push(...await listProductionSourceFiles(entryUrl));
    else if (/\.(?:js|jsx|mjs)$/.test(entry.name) && !entry.name.includes(".test.")) files.push(entryUrl);
  }
  return files;
};

test("loading state is accessible and clears previous lesson content", () => {
  const html = renderState({
    status: "loading",
    requestKey: "class-7:arrays:1",
    content: null,
    error: null,
  });
  assert.match(html, /role="status"/);
  assert.match(html, /Loading module/);
  assertNoProtectedContent(html);
});

test("prerequisite and PRE locks show safe actions without lesson content", () => {
  for (const [reason, expected] of [
    ["prerequisite", /Complete the previous lesson/],
    ["pre-assessment", /Complete the required pre-assessment/],
  ]) {
    const html = renderState({
      status: "error",
      requestKey: `locked:${reason}`,
      content: null,
      error: { kind: "locked", reason, message: expected.source, retryable: false },
    });
    assert.match(html, /role="alert"/);
    assert.match(html, expected);
    assert.match(html, /Back to lessons/);
    assertNoProtectedContent(html);
  }
});

test("generic forbidden and local progress reveal no lesson existence or content", () => {
  const html = renderState({
    status: "error",
    requestKey: "forbidden",
    content: null,
    error: {
      kind: "forbidden",
      message: "This module is unavailable for your current classroom access.",
      retryable: false,
    },
  });
  assert.match(html, /Module unavailable/);
  assert.doesNotMatch(html, /not found/i);
  assertNoProtectedContent(html);
});

test("not-found and retryable failures have distinct accessible states", () => {
  const missing = renderState({
    status: "error",
    requestKey: "missing",
    content: null,
    error: { kind: "not-found", message: "This module could not be found.", retryable: false },
  });
  assert.match(missing, /Module not found/);
  assert.match(missing, /role="alert"/);

  const retryable = renderState({
    status: "error",
    requestKey: "retryable",
    content: null,
    error: { kind: "retryable", message: "Check your connection and try again.", retryable: true },
  });
  assert.match(retryable, /Unable to load module/);
  assert.match(retryable, />Try again</);
  assertNoProtectedContent(retryable);
});

test("authentication and malformed-classroom failures have safe explicit actions", () => {
  const auth = renderState({
    status: "error",
    requestKey: "auth",
    content: null,
    error: { kind: "auth", message: "Your session has expired.", retryable: false },
  });
  assert.match(auth, /Sign in required/);
  assert.match(auth, /href="\/login"/);
  assertNoProtectedContent(auth);

  const malformed = renderState({
    status: "error",
    requestKey: "invalid",
    content: null,
    error: { kind: "invalid-classroom", message: "The classroom link is invalid.", retryable: false },
  });
  assert.match(malformed, /Invalid classroom link/);
  assert.match(malformed, /Back to lessons/);
  assertNoProtectedContent(malformed);
});

test("authorized DTO renders all block types as text with stable IDs and safe links", () => {
  delete globalThis.__builtInModuleCodeExecuted;
  const content = {
    schemaVersion: 1,
    contentRevision: "2026-09-28.test",
    lesson: {
      lessonKey: "arrays",
      title: "Authorized Arrays Module",
      eyebrow: "Arrays · Authorized",
      description: "Authorized module description",
      objectives: ["Read array values safely"],
      sections: [{
        id: "section-stable",
        title: "All block types",
        blocks: [
          { type: "heading", text: "Heading block" },
          { type: "paragraph", text: "Paragraph <strong>must stay text</strong>" },
          { type: "list", items: ["First list item", "Second list item"] },
          {
            type: "code",
            title: "Code stays text",
            value: "<script>globalThis.__builtInModuleCodeExecuted = true</script>",
            output: "safe output",
            runnable: false,
          },
          { type: "note", label: "Remember", text: "Note block", tone: "note" },
          { type: "diagram", headers: ["Index", "Value"], rows: [["0", "Kai"]], caption: "Diagram block" },
          {
            type: "practice",
            id: "practice-stable",
            prompt: "Practice prompt",
            starterCode: "int secret = 0; // secret starter code",
            solution: "int secret = 1;",
            expectedOutput: "1",
          },
          {
            type: "check",
            id: "check-stable",
            prompt: "Quick-check prompt",
            options: ["Wrong", "Correct"],
            answer: 1,
            feedback: "Quick-check feedback",
          },
          { type: "connection", text: "Connection block" },
        ],
      }],
      references: [
        { title: "Microsoft reference", url: "https://learn.microsoft.com/dotnet/csharp/" },
        { title: "Printed reference", url: null },
      ],
      game: {
        title: "Barangay Malumay",
        route: "/Map",
      },
    },
  };

  const html = renderState({
    status: "ready",
    requestKey: "class-7:arrays:2",
    content,
    error: null,
  });
  assert.match(html, /Authorized Arrays Module/);
  for (const text of [
    "Heading block",
    "Paragraph &lt;strong&gt;must stay text&lt;\/strong&gt;",
    "First list item",
    "Code stays text",
    "safe output",
    "Note block",
    "Diagram block",
    "Practice prompt",
    "Expected output",
    "Show solution",
    "Quick-check prompt",
    "Connection block",
    "Microsoft reference",
    "Printed reference",
  ]) assert.match(html, new RegExp(text));
  assert.match(html, /&lt;script&gt;globalThis\.__builtInModuleCodeExecuted = /);
  assert.match(html, /&lt;\/script&gt;/);
  assert.equal(globalThis.__builtInModuleCodeExecuted, undefined);
  assert.doesNotMatch(html, /dangerouslySetInnerHTML/);
  assert.match(html, /id="module-section-section-stable"/);
  assert.match(html, /data-practice-id="practice-stable"/);
  assert.match(html, /data-check-id="check-stable"/);
  assert.match(html, /name="check-stable"/);
  assert.match(html, /href="https:\/\/learn\.microsoft\.com\/dotnet\/csharp\/"/);
  assert.match(html, /Next: SharpRunner Barangay Malumay/);
  assert.match(html, /data-game-route="\/Map"/);
  assert.doesNotMatch(html, /data-game-route="(?:undefined)?"/);
  assert.doesNotMatch(html, /undefined/);

  const missingGameContent = structuredClone(content);
  delete missingGameContent.lesson.game;
  const missingGameHtml = renderState({
    status: "ready",
    requestKey: "class-7:arrays:missing-game",
    content: missingGameContent,
    error: null,
  });
  assert.doesNotMatch(missingGameHtml, /Start Adventure/);
  assert.doesNotMatch(missingGameHtml, /data-game-route/);
});

test("application routes require active class membership and navigation propagates classroom identity", async () => {
  const appSource = await readFile(new URL("../../App.jsx", import.meta.url), "utf8");
  assert.match(appSource, /path="\/lesson"[\s\S]{0,180}<ProtectedRoute requireClassMembership>/);
  assert.match(appSource, /path="\/lesson\/built-in\/:moduleId"[\s\S]{0,180}<ProtectedRoute requireClassMembership>/);

  const sectionSource = await readFile(new URL("../../Components/LessonSection/LessonSection.jsx", import.meta.url), "utf8");
  assert.match(sectionSource, /progressResult\.value\.data\?\.classroomId/);
  assert.match(sectionSource, /withClassroomIdQuery\(lesson\.route, classroomId\)/);
});

test("production module page no longer imports the synchronous rich registry", async () => {
  const source = await readFile(new URL("./BuiltInModulePage.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /builtInModules\/index|getBuiltInModule|builtInModuleById/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /fetchPrimaryClassroomId/);
  assert.match(source, /fetchBuiltInLessonContent/);
});

test("legacy rich-content sources and imports are absent from frontend production source", async () => {
  const violations = [];
  for (const relativePath of legacyRichContentPaths) {
    const sourceUrl = new URL(relativePath, import.meta.url);
    try {
      await access(sourceUrl);
      violations.push(`legacy source exists: ${relativePath}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  const frontendSourceRoot = new URL("../../", import.meta.url);
  const forbiddenImport = /builtInModules\/(?:tutorial|arrays|functions|functionsWithArrays|finalReview|index|moduleHelpers)|\bgetBuiltInModule\b|\bbuiltInModuleById\b|from\s+["'][^"']*moduleHelpers/;
  for (const sourceUrl of await listProductionSourceFiles(frontendSourceRoot)) {
    const source = await readFile(sourceUrl, "utf8");
    if (forbiddenImport.test(source)) violations.push(`legacy import or registry symbol: ${sourceUrl.pathname}`);
  }

  assert.deepEqual(violations, []);
});
