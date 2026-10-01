import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const monacoStubId = "\0k3-monaco-stub";
const vite = await createServer({
  server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true },
  ssr: { noExternal: ["@monaco-editor/react"] },
  plugins: [{
    name: "k3-monaco-stub", enforce: "pre",
    resolveId(source) { return source === "@monaco-editor/react" ? monacoStubId : null; },
    load(id) {
      if (id !== monacoStubId) return null;
      return "import React from 'react'; export default function Editor({ value, options }) { return React.createElement('pre', { 'data-editor': 'monaco', 'data-read-only': String(Boolean(options?.readOnly)) }, value); }";
    },
  }],
});
const { default: CodingQuestionEditor } = await vite.ssrLoadModule("/src/pages/teacher/assessment/CodingQuestionEditor.jsx");
const { StudentCodingPreview, TeacherCodingConfigurationPreview } = await vite.ssrLoadModule("/src/pages/teacher/assessment/CodingQuestionPreview.jsx");
test.after(async () => vite.close());

const question = {
  clientId: "question-1", questionType: "CODING", starterCode: "public starter",
  referenceSolution: "private solution", methodContract: {
    typeName: "Solution", methodName: "Add", parameterTypes: ["int", "int[]"], returnType: "int",
  },
  codingTestCases: [
    { clientId: "public", visibility: "PUBLIC", input: [1, [2]], expectedOutput: 3, weight: 1 },
    { clientId: "hidden", visibility: "HIDDEN", input: [9, [8]], expectedOutput: 17, weight: 2 },
  ],
};

test("coding editor renders structured controls and Monaco becomes read-only when locked", () => {
  const editable = renderToStaticMarkup(React.createElement(CodingQuestionEditor, { question, disabled: false, onChange() {} }));
  assert.match(editable, /Type\/Class name/);
  assert.match(editable, /Argument 2 \(int\[\]\)/);
  assert.match(editable, /PUBLIC — student example/);
  assert.match(editable, /HIDDEN — grading only/);
  assert.match(editable, /data-read-only="false"/);
  const locked = renderToStaticMarkup(React.createElement(CodingQuestionEditor, { question, disabled: true, onChange() {} }));
  assert.match(locked, /<fieldset disabled=""/);
  assert.equal((locked.match(/data-read-only="true"/g) ?? []).length, 2);
});

test("student coding preview excludes reference solution and hidden grading values", () => {
  const html = renderToStaticMarkup(React.createElement(StudentCodingPreview, { question }));
  assert.match(html, /public starter/);
  assert.match(html, /Expected: 3/);
  assert.doesNotMatch(html, /private solution|17|\[9,\[8\]\]/);
  const teacher = renderToStaticMarkup(React.createElement(TeacherCodingConfigurationPreview, { question, index: 0 }));
  assert.match(teacher, /private solution/);
  assert.match(teacher, /17/);
});
