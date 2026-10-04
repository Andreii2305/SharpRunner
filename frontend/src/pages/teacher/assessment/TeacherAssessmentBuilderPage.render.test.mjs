import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const source = fs.readFileSync(new URL("./TeacherAssessmentBuilderPage.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("./TeacherAssessmentBuilderPage.module.css", import.meta.url), "utf8");
const codingEditor = fs.readFileSync(new URL("./CodingQuestionEditor.jsx", import.meta.url), "utf8");
const codeEditor = fs.readFileSync(new URL("./AssessmentCodeEditor.jsx", import.meta.url), "utf8");
const sharedCodeEditor = fs.readFileSync(new URL("../../../Components/AssessmentCodeEditor/AssessmentCodeEditor.jsx", import.meta.url), "utf8");
const codingPreview = fs.readFileSync(new URL("./CodingQuestionPreview.jsx", import.meta.url), "utf8");

const vite = await createServer({
  server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true },
});
test.after(async () => vite.close());

test("question navigation identifies the current question and keeps add question available", async () => {
  const { QuestionNavigator } = await vite.ssrLoadModule("/src/pages/teacher/assessment/TeacherAssessmentBuilderChrome.jsx");
  const html = renderToStaticMarkup(React.createElement(QuestionNavigator, {
    questions: [
      { clientId: "question-1", questionText: "Variables and values" },
      { clientId: "question-2", questionText: "" },
    ],
    activeQuestionId: "question-2",
    onNavigate() {},
    onAdd() {},
  }));
  assert.match(html, /<nav[^>]*aria-label="Question navigation"/);
  assert.match(html, /Variables and values/);
  assert.match(html, /Question 2/);
  assert.match(html, /aria-current="true"/);
  assert.match(html, /Add question/);
});

test("copy dialog clearly separates source and destination and warns without blocking cross-lesson copy", async () => {
  const { default: TeacherAssessmentCopyDialog } = await vite.ssrLoadModule("/src/pages/teacher/assessment/TeacherAssessmentCopyDialog.jsx");
  const html = renderToStaticMarkup(React.createElement(TeacherAssessmentCopyDialog, {
    open: true,
    classrooms: [
      { id: 7, className: "C# Fundamentals", section: "BSIT 3A" },
      { id: 10, className: "C# Fundamentals", section: "BSIT 3B" },
    ],
    destinationClassroom: { id: 10, className: "C# Fundamentals", section: "BSIT 3B" },
    destinationLesson: { key: "arrays", title: "Arrays" },
    type: "PRE",
    sourceClassroomId: "7",
    sourceLessonKey: "functions",
    sourceSummary: { exists: true, id: 12, title: "Functions diagnostic", questionCount: 1, published: true },
    onClose() {}, onSubmit() {}, onSourceClassroomChange() {}, onSourceLessonChange() {},
  }));
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /Copy existing Pre-Test/);
  assert.match(html, /Copy from/);
  assert.match(html, /Copy to/);
  assert.match(html, /C# Fundamentals/);
  assert.match(html, /<option value="12" selected="">Functions diagnostic<\/option>/);
  assert.match(html, /1 question/);
  assert.doesNotMatch(html, /1 questions/);
  assert.match(html, /Published/);
  assert.match(html, /Arrays/);
  assert.match(html, /This assessment comes from a different lesson\. Review its questions before publishing\./);
  assert.match(html, /Copy as draft/);
  assert.doesNotMatch(html, /disabled=""[^>]*>Copy as draft/);
});

test("copy dialog gives an untitled candidate a non-blank contextual fallback and plural metadata", async () => {
  const { default: TeacherAssessmentCopyDialog } = await vite.ssrLoadModule("/src/pages/teacher/assessment/TeacherAssessmentCopyDialog.jsx");
  const html = renderToStaticMarkup(React.createElement(TeacherAssessmentCopyDialog, {
    open: true,
    classrooms: [{ id: 7, className: "C# Fundamentals", section: "BSIT 3A" }],
    destinationClassroom: { id: 10, className: "C# Fundamentals", section: "BSIT 3B" },
    destinationLesson: { key: "arrays", title: "Arrays" },
    type: "POST",
    sourceClassroomId: "7",
    sourceLessonKey: "arrays",
    sourceSummary: { exists: true, id: 12, title: "   ", questionCount: 2, published: false },
    onClose() {}, onSubmit() {}, onSourceClassroomChange() {}, onSourceLessonChange() {},
  }));
  assert.match(html, /<option value="12" selected="">Arrays Post-Test<\/option>/);
  assert.match(html, /<strong>Arrays Post-Test<\/strong>/);
  assert.match(html, /2 questions/);
  assert.match(html, /Draft/);
  assert.doesNotMatch(html, /<option value="12" selected="">\s*<\/option>/);
});

test("copy dialog prevents a duplicate submission while copying", async () => {
  const { default: TeacherAssessmentCopyDialog } = await vite.ssrLoadModule("/src/pages/teacher/assessment/TeacherAssessmentCopyDialog.jsx");
  const html = renderToStaticMarkup(React.createElement(TeacherAssessmentCopyDialog, {
    open: true,
    classrooms: [],
    destinationClassroom: { id: 10, className: "Class B", section: "" },
    destinationLesson: { key: "arrays", title: "Arrays" },
    type: "POST",
    sourceClassroomId: "7",
    sourceLessonKey: "arrays",
    sourceSummary: { exists: true, id: 12, title: "Arrays post-test", questionCount: 4, published: false },
    submitting: true,
    onClose() {}, onSubmit() {}, onSourceClassroomChange() {}, onSourceLessonChange() {},
  }));
  assert.match(html, /Copying…/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Copying…<\/button>/);
  assert.doesNotMatch(html, /different lesson/);
});

test("sticky editor actions preserve lesson, assessment, status, and save context", async () => {
  const { EditorActionBar } = await vite.ssrLoadModule("/src/pages/teacher/assessment/TeacherAssessmentBuilderChrome.jsx");
  const html = renderToStaticMarkup(React.createElement(EditorActionBar, {
    lessonTitle: "Arrays",
    assessmentType: "PRE",
    status: "Draft",
    saveState: "unsaved",
    dirty: true,
    locked: false,
    saving: false,
    published: false,
    publishDisabled: true,
    onPreview() {},
    onSave() {},
    onPublish() {},
    onUnpublish() {},
  }));
  assert.match(html, /Arrays/);
  assert.match(html, /PRE-Test/);
  assert.match(html, /Draft/);
  assert.match(html, /Unsaved changes/);
  assert.match(html, /Save Draft/);
  assert.match(html, /Preview/);
  assert.match(html, /Publish/);
});

test("builder exposes labelled settings, question controls, preview, and lifecycle confirmations", () => {
  for (const marker of ["Assessment builder", "Passing percentage", "Maximum attempts", "Answer review policy", "Add question", "Move question up", "Move choice down", "Preview", "Publish assessment?", "Delete assessment?"]) {
    assert.equal(source.includes(marker), true, marker);
  }
  assert.doesNotMatch(source, />Objective key\s*</);
  assert.doesNotMatch(source, />Explanation\s*</);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
});

test("empty assessment slots expose restrained create and copy actions", () => {
  assert.match(source, /Create new/);
  assert.match(source, /Copy existing/);
  assert.doesNotMatch(source, /Copy assessment dashboard/);
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
  assert.match(source, /availableQuestionTypes\(question\.questionType\)\.map/);
  assert.doesNotMatch(source, /Add multiple-choice, true\/false, or coding questions/);
});

test("desktop builder keeps scope compact and constrains the question workspace", () => {
  assert.match(styles, /\.main\s*\{[^}]*padding:\s*18px\s+clamp\(18px,\s*3vw,\s*40px\)\s+64px/s);
  assert.match(styles, /\.pageHeader\s*\{[^}]*margin-bottom:\s*14px/s);
  assert.match(styles, /\.selectorCard\s*\{[^}]*padding:\s*16px\s+18px/s);
  assert.match(styles, /\.slotGrid\s+article\s*\{[^}]*display:\s*grid[^}]*grid-template-areas:\s*"heading action"\s*"summary action"/s);
  assert.match(styles, /\.editorWorkspace\s*\{[^}]*grid-template-columns:[^}]*230px[^}]*900px/s);
  assert.match(styles, /\.editorActionBar\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/s);
  assert.match(styles, /\.questionNavigator\s*\{[^}]*position:\s*sticky/s);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*\.slotGrid\s+article\s*\{[^}]*grid-template-areas:\s*"heading"\s*"summary"\s*"action"/);
});

test("page shell keeps the builder beside the full-height sidebar instead of below it", () => {
  assert.match(styles, /\.root\s*\{[^}]*display:\s*flex[^}]*align-items:\s*flex-start/s);
  assert.match(styles, /\.main\s*\{[^}]*flex:\s*1[^}]*margin-left:\s*0/s);
  assert.doesNotMatch(styles, /@media\s*\(max-width:\s*900px\)\s*\{[^}]*\.main\s*\{[^}]*margin-left/s);
});

test("coding builder exposes named C# contract, typed tests, weights, and teacher-only source", () => {
  assert.match(source, /question\.questionType === "CODING" \? <CodingQuestionEditor/);
  for (const marker of ["Coding", "C#", "Type/Class name", "Method name", "Parameter name", "Return type", "Signature preview", "Starter code", "Reference solution", "teacher-only", "PUBLIC", "HIDDEN", "Expected return value", "Expected output", "Weight", "Add test case", "Add value", "Array preview"]) {
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
  assert.match(styles, /\.parameterFields\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /\.parameterActions\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(styles, /\.parameterRow\s*\{[^}]*min-width:\s*0/s);
  assert.match(styles, /\.testValues\s*\{[^}]*min-width:\s*0/s);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*\.parameterFields/);
  assert.match(styles, /@media\s*\(max-width:\s*640px\)[\s\S]*\.parameterActions/);
  assert.match(styles, /button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(sharedCodeEditor, /minWidth:\s*0/);
  assert.match(sharedCodeEditor, /overflow:\s*"hidden"/);
});
