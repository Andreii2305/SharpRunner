import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { showMethodFieldError } from "./teacherAssessmentBuilderState.js";

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
    typeName: "Solution", methodName: "Add", parameterNames: ["left", "numbers"], parameterTypes: ["int", "int[]"], returnType: "int",
  },
  codingTestCases: [
    { clientId: "public", visibility: "PUBLIC", input: [1, [2]], expectedOutput: 3, weight: 1 },
    { clientId: "hidden", visibility: "HIDDEN", input: [9, [8]], expectedOutput: 17, weight: 2 },
  ],
};

test("METHOD required errors appear only after touch or a validation attempt", () => {
  assert.equal(typeof showMethodFieldError, "function");
  assert.equal(showMethodFieldError("", false, false), false);
  assert.equal(showMethodFieldError("", true, false), true);
  assert.equal(showMethodFieldError("", false, true), true);
  assert.equal(showMethodFieldError("Solution", true, true), false);
});

test("coding editor renders semantic selectable METHOD and PROGRAM cards with one selected marker", () => {
  const editable = renderToStaticMarkup(React.createElement(CodingQuestionEditor, { question, disabled: false, onChange() {} }));
  assert.match(editable, /<fieldset[^>]*><legend>Coding format<\/legend>/);
  assert.equal((editable.match(/type="radio"/g) ?? []).length, 2);
  assert.equal((editable.match(/checked=""/g) ?? []).length, 1);
  assert.match(editable, /Method[\s\S]*Students implement a required C# method/);
  assert.match(editable, /Program \/ Main[\s\S]*Students write a complete C# program/);
  assert.equal((editable.match(/Selected<\/span>/g) ?? []).length, 1);
  assert.match(editable, /\{\}/);
  assert.match(editable, /&gt;_/);
});

test("coding editor renders structured controls and Monaco becomes read-only when locked", () => {
  const editable = renderToStaticMarkup(React.createElement(CodingQuestionEditor, { question, disabled: false, onChange() {} }));
  assert.match(editable, /Type\/Class name/);
  assert.match(editable, /Parameter 2/);
  assert.match(editable, /Parameter name/);
  assert.match(editable, /placeholder="parameterName"/);
  assert.match(editable, /Input for <code>numbers<\/code>/);
  assert.match(editable, /int\[\] array/);
  assert.match(editable, /Add value/);
  assert.match(editable, /Array preview:[\s\S]*\[2\]/);
  assert.match(editable, /Expected return value[\s\S]*int/);
  assert.match(editable, /aria-label="Remove value 1 from input for numbers"/);
  assert.doesNotMatch(editable, /\[object Object\]/);
  assert.match(editable, /PUBLIC — student example/);
  assert.match(editable, /HIDDEN — grading only/);
  assert.match(editable, /data-read-only="false"/);
  assert.match(editable, /HIDDEN<\/strong> cases are optional/);
  assert.doesNotMatch(editable, /Add at least one HIDDEN test case/);
  assert.match(editable, /role="group"[^>]*aria-labelledby="[^"]+"[^>]*aria-describedby="[^"]+"/);
  assert.match(editable, /aria-invalid="false"/);
  const locked = renderToStaticMarkup(React.createElement(CodingQuestionEditor, { question, disabled: true, onChange() {} }));
  assert.match(locked, /<fieldset disabled=""/);
  assert.equal((locked.match(/type="radio"[^>]*disabled=""/g) ?? []).length, 2);
  assert.equal((locked.match(/data-read-only="true"/g) ?? []).length, 2);
});

test("starter and reference editors unmistakably describe optional source semantics", () => {
  const html = renderToStaticMarkup(React.createElement(CodingQuestionEditor, { question, disabled: false, onChange() {} }));
  assert.match(html, /Starter code \(optional\)/);
  assert.match(html, /Optional code students receive when they begin this question/);
  assert.match(html, /Reference solution \(optional\)/);
  assert.match(html, /Optional teacher-only solution/);
  assert.match(html, /not required for grading/);
});

test("untouched blank METHOD fields use explicit examples without premature validation errors", () => {
  const invalid = {
    ...question,
    methodContract: { ...question.methodContract, typeName: "", methodName: "", parameterNames: ["", "numbers"] },
  };
  const html = renderToStaticMarkup(React.createElement(CodingQuestionEditor, { question: invalid, disabled: false, onChange() {} }));
  assert.match(html, /placeholder="Example: Solution"/);
  assert.match(html, /placeholder="Example: AddNumbers"/);
  assert.doesNotMatch(html, /aria-invalid="true"|Type\/class name is required|Method name is required/);
  assert.doesNotMatch(html, /Parameter name is required/);
  assert.match(html, /public static int &lt;method name&gt;\(int &lt;parameter name&gt;, int\[\] numbers\)/);
});

test("validation attempts expose associated METHOD field errors", () => {
  const invalid = {
    ...question,
    methodContract: { ...question.methodContract, typeName: "", methodName: "", parameterNames: ["", "numbers"] },
  };
  const html = renderToStaticMarkup(React.createElement(CodingQuestionEditor, {
    question: invalid, disabled: false, validationAttempted: true, onChange() {},
  }));
  assert.equal((html.match(/aria-invalid="true"/g) ?? []).length, 3);
  assert.match(html, /aria-describedby="[^"]+type-name-error"/);
  assert.match(html, /aria-describedby="[^"]+method-name-error"/);
  assert.match(html, /Type\/class name is required/);
  assert.match(html, /Method name is required/);
  assert.match(html, /aria-describedby="[^"]+parameter-0-error"/);
  assert.match(html, /Parameter name is required/);
});

test("parameter fields report invalid and duplicate C# names with associated errors", () => {
  const invalidName = renderToStaticMarkup(React.createElement(CodingQuestionEditor, {
    question: { ...question, methodContract: { ...question.methodContract, parameterNames: ["class", "numbers"] } },
    disabled: false, validationAttempted: true, onChange() {},
  }));
  assert.match(invalidName, /Use a valid C# parameter name/);
  const duplicate = renderToStaticMarkup(React.createElement(CodingQuestionEditor, {
    question: { ...question, methodContract: { ...question.methodContract, parameterNames: ["value", "value"] } },
    disabled: false, validationAttempted: true, onChange() {},
  }));
  assert.equal((duplicate.match(/Parameter names must be unique/g) ?? []).length, 2);
  assert.equal((duplicate.match(/aria-invalid="true"/g) ?? []).length, 2);
});

test("actual METHOD values clear errors and drive the signature preview", () => {
  const configured = {
    ...question,
    methodContract: { typeName: "Solution", methodName: "CountAbove", parameterNames: ["numbers", "limit"], parameterTypes: ["int[]", "int"], returnType: "int" },
  };
  const html = renderToStaticMarkup(React.createElement(CodingQuestionEditor, {
    question: configured, disabled: false, validationAttempted: true, onChange() {},
  }));
  assert.doesNotMatch(html, /aria-invalid="true"|Type\/class name is required|Method name is required/);
  assert.match(html, /value="Solution"/);
  assert.match(html, /value="CountAbove"/);
  assert.match(html, /public static int CountAbove\(int\[\] numbers, int limit\)/);
  assert.match(html, /Students must implement this exact signature/);
});

test("legacy METHOD names render deterministic argN values without validation errors", () => {
  const legacy = { ...question, methodContract: { ...question.methodContract, parameterNames: null } };
  const html = renderToStaticMarkup(React.createElement(CodingQuestionEditor, {
    question: legacy, disabled: false, validationAttempted: true, onChange() {},
  }));
  assert.match(html, /public static int Add\(int arg1, int\[\] arg2\)/);
  assert.doesNotMatch(html, /Parameter name is required|aria-invalid="true"/);
});

test("array previews cover empty, string, boolean, negative, and Unicode structured values", () => {
  const arrays = {
    ...question,
    methodContract: { ...question.methodContract, parameterNames: ["empty", "names", "flags", "values"], parameterTypes: ["int[]", "string[]", "bool[]", "long[]"] },
    codingTestCases: [{ clientId: "arrays", visibility: "PUBLIC", input: [[], ["Ana", "Mabuhay 🌞"], [true, false], [-5, 10]], expectedOutput: 0, weight: 1 }],
  };
  const html = renderToStaticMarkup(React.createElement(CodingQuestionEditor, { question: arrays, disabled: false, onChange() {} }));
  for (const preview of ["[]", '[&quot;Ana&quot;, &quot;Mabuhay 🌞&quot;]', "[true, false]", "[-5, 10]"]) assert.equal(html.includes(preview), true, preview);
});

test("PROGRAM format hides METHOD signature controls and renders stdin/stdout editors", () => {
  const program = {
    ...question,
    executionMode: "PROGRAM",
    codingTestCases: [{ clientId: "program", visibility: "PUBLIC", input: "2\n3\n", expectedOutput: "5\n", weight: 1 }],
  };
  const html = renderToStaticMarkup(React.createElement(CodingQuestionEditor, { question: program, disabled: false, validationAttempted: true, onChange() {} }));
  assert.match(html, /Program \/ Main/);
  assert.match(html, /Standard input/);
  assert.match(html, /Expected output/);
  assert.match(html, /Console.ReadLine/);
  assert.doesNotMatch(html, /Type\/Class name|Signature preview|Input for|Expected return value|Type\/class name is required|Method name is required/);
});

test("PROGRAM format permits empty stdin and expected stdout", () => {
  const program = {
    ...question,
    executionMode: "PROGRAM",
    codingTestCases: [{ clientId: "program-empty", visibility: "HIDDEN", input: "", expectedOutput: "", weight: 1 }],
  };
  const html = renderToStaticMarkup(React.createElement(CodingQuestionEditor, { question: program, disabled: false, onChange() {} }));
  assert.match(html, /Leave blank if no input is required/);
  assert.match(html, /Leave blank when no output is expected/);
  assert.doesNotMatch(html, /Expected output<textarea[^>]*required/);
});

test("student coding preview excludes reference solution and hidden grading values", () => {
  const html = renderToStaticMarkup(React.createElement(StudentCodingPreview, { question }));
  assert.match(html, /public starter/);
  assert.match(html, /Expected: 3/);
  assert.doesNotMatch(html, /private solution|Expected: 17|Input: \[9,\[8\]\]/);
  const teacher = renderToStaticMarkup(React.createElement(TeacherCodingConfigurationPreview, { question, index: 0 }));
  assert.match(teacher, /private solution/);
  assert.match(teacher, /17/);
});
