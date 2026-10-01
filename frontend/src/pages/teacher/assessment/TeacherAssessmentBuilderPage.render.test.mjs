import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./TeacherAssessmentBuilderPage.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("./TeacherAssessmentBuilderPage.module.css", import.meta.url), "utf8");
const codingEditor = fs.readFileSync(new URL("./CodingQuestionEditor.jsx", import.meta.url), "utf8");
const codeEditor = fs.readFileSync(new URL("./AssessmentCodeEditor.jsx", import.meta.url), "utf8");
const sharedCodeEditor = fs.readFileSync(new URL("../../../Components/AssessmentCodeEditor/AssessmentCodeEditor.jsx", import.meta.url), "utf8");
const codingPreview = fs.readFileSync(new URL("./CodingQuestionPreview.jsx", import.meta.url), "utf8");

test("builder exposes labelled settings, question controls, preview, and lifecycle confirmations", () => {
  for (const marker of ["Assessment builder", "Passing percentage", "Maximum attempts", "Answer review policy", "Add question", "Move question up", "Move choice down", "Preview", "Publish assessment?", "Delete assessment?"]) {
    assert.equal(source.includes(marker), true, marker);
  }
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /className=\{styles\.saveState\}[^>]*role="status"[^>]*aria-live="polite"/);
});

test("preview remains teacher-local and answer keys are never persisted in browser storage", () => {
  assert.equal(source.includes("studentAssessmentService"), false);
  assert.equal(source.includes("localStorage"), false);
  assert.equal(source.includes("sessionStorage"), false);
  assert.equal(source.includes("console."), false);
});

test("attempt locks disable writes and direct route identity drives requests", () => {
  assert.match(source, /structureLocked/);
  assert.match(source, /classroomId/);
  assert.match(source, /lessonKey/);
  assert.match(source, /assessmentId/);
});

test("question type transitions are draft-only", () => {
  assert.match(source, /published=\{draft\.isPublished\}/);
  assert.match(source, /disabled=\{disabled \|\| published\} value=\{question\.questionType\}/);
});

test("desktop builder keeps scope and assessment selectors compact above the editor", () => {
  assert.match(styles, /\.main\s*\{[^}]*padding:\s*18px\s+clamp\(18px,\s*3vw,\s*44px\)\s+48px/s);
  assert.match(styles, /\.pageHeader\s*\{[^}]*margin-bottom:\s*14px/s);
  assert.match(styles, /\.selectorCard\s*\{[^}]*padding:\s*16px\s+18px/s);
  assert.match(styles, /\.slotGrid\s+article\s*\{[^}]*display:\s*grid[^}]*grid-template-areas:\s*"heading action"\s*"summary action"/s);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*\.slotGrid\s+article\s*\{[^}]*grid-template-areas:\s*"heading"\s*"summary"\s*"action"/);
});

test("page shell keeps the builder beside the full-height sidebar instead of below it", () => {
  assert.match(styles, /\.root\s*\{[^}]*display:\s*flex[^}]*align-items:\s*flex-start/s);
  assert.match(styles, /\.main\s*\{[^}]*flex:\s*1[^}]*margin-left:\s*0/s);
  assert.doesNotMatch(styles, /@media\s*\(max-width:\s*900px\)\s*\{[^}]*\.main\s*\{[^}]*margin-left/s);
});

test("coding builder exposes fixed C# contract, typed tests, weights, and teacher-only source", () => {
  assert.match(source, /value="CODING">Coding/);
  for (const marker of ["Coding", "C#", "Type\/Class name", "Method name", "Return type", "Signature preview", "Starter code", "Reference solution", "teacher-only", "PUBLIC", "HIDDEN", "Expected output", "Weight", "Add test case"]) {
    assert.equal(codingEditor.includes(marker), true, marker);
  }
  assert.match(codeEditor, /Components\/AssessmentCodeEditor/);
  assert.match(sharedCodeEditor, /@monaco-editor\/react/);
  assert.doesNotMatch(`${source}${codingEditor}${codeEditor}${sharedCodeEditor}`, /localStorage|sessionStorage|indexedDB|BroadcastChannel|console\./);
});

test("coding preview separates student-visible examples from teacher-only grading configuration", () => {
  assert.match(source, /STUDENT PREVIEW/);
  assert.match(source, /TEACHER-ONLY GRADING CONFIGURATION/);
  assert.match(codingPreview, /visibility === "PUBLIC"/);
  assert.match(codingPreview, /visibility === "HIDDEN"/);
});

test("coding controls stack responsively and preserve usable editor height", () => {
  assert.match(styles, /\.codingGrid/);
  assert.match(styles, /\.testCaseGrid/);
  assert.match(styles, /min-height:\s*240px/);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*\.codingGrid/);
  assert.match(styles, /@media\s*\(max-width:\s*640px\)[\s\S]*\.testCaseGrid/);
  assert.match(styles, /button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(sharedCodeEditor, /minWidth:\s*0/);
  assert.match(sharedCodeEditor, /overflow:\s*"hidden"/);
});
