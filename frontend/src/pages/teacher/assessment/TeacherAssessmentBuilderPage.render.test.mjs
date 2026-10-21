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
const lessonLibrarySource = fs.readFileSync(new URL("../TeacherLessonLibraryPage.jsx", import.meta.url), "utf8");

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

test("custom draft chrome reflects guarded publication and explains revision review", async () => {
  const { CustomAssessmentScope, EditorActionBar, CustomDraftNotice } = await vite.ssrLoadModule("/src/pages/teacher/assessment/TeacherAssessmentBuilderChrome.jsx");
  const scope = renderToStaticMarkup(React.createElement(CustomAssessmentScope, {
    target: { lessonTitle: "Teacher arrays lesson", classroom: { className: "C# Fundamentals", section: "BSIT 3A" } },
    selectedClassroom: null,
    classroomId: "7",
  }));
  assert.match(scope, /Teacher arrays lesson/);
  assert.match(scope, /C# Fundamentals/);
  assert.match(scope, /BSIT 3A/);
  assert.match(scope, /Assessments/);
  assert.doesNotMatch(scope, /Draft assessments/);

  const bar = renderToStaticMarkup(React.createElement(EditorActionBar, {
    lessonTitle: "Teacher arrays lesson", assessmentType: "PRE", status: "Draft",
    saveState: "saved", dirty: false, locked: false, saving: false, published: false,
    publishDisabled: true, publicationAvailable: false,
    onPreview() {}, onSave() {}, onPublish() {}, onUnpublish() {},
  }));
  assert.doesNotMatch(bar, />Publish</);
  assert.match(bar, /Draft only/);
  const notice = renderToStaticMarkup(React.createElement(CustomDraftNotice, {
    revisionReviewRequired: true, boundVersion: 2, currentVersion: 3,
    pending: false, onReview() {}, publication: { enabled: true, canPublish: false, reason: "REVISION_REVIEW_REQUIRED" },
  }));
  assert.match(notice, /Review the current lesson revision before publishing/);
  assert.match(notice, /Revision 2/);
  assert.match(notice, /revision 3/);
  assert.match(notice, /Review current revision/);

  const disabledNotice = renderToStaticMarkup(React.createElement(CustomDraftNotice, {
    revisionReviewRequired: true, boundVersion: 2, currentVersion: 3,
    pending: false, onReview() {}, publication: { enabled: false, canPublish: false, reason: "REVISION_REVIEW_REQUIRED" },
  }));
  assert.match(disabledNotice, /Review the current lesson revision before publishing/);
  assert.match(disabledNotice, /Publication is also disabled on this server/);

  const publishedNotice = renderToStaticMarkup(React.createElement(CustomDraftNotice, {
    revisionReviewRequired: false, boundVersion: 3, currentVersion: 3,
    pending: false, onReview() {}, publication: { enabled: true, canPublish: false, reason: "ALREADY_PUBLISHED" },
  }));
  assert.match(publishedNotice, /Publication status/);
  assert.match(publishedNotice, /Published for this lesson revision/);
  assert.doesNotMatch(publishedNotice, /Custom lesson draft/);

  const enabled = renderToStaticMarkup(React.createElement(EditorActionBar, {
    lessonTitle: "Teacher arrays lesson", assessmentType: "POST", status: "Draft",
    saveState: "saved", dirty: false, locked: false, saving: false, published: false,
    publishDisabled: false, publicationAvailable: true,
    onPreview() {}, onSave() {}, onPublish() {}, onUnpublish() {},
  }));
  assert.match(enabled, />Publish</);

  const publishedWhileDisabled = renderToStaticMarkup(React.createElement(EditorActionBar, {
    lessonTitle: "Teacher arrays lesson", assessmentType: "POST", status: "Published",
    saveState: "saved", dirty: false, locked: false, saving: false, published: true,
    publishDisabled: true, publicationAvailable: false,
    onPreview() {}, onSave() {}, onPublish() {}, onUnpublish() {},
  }));
  assert.match(publishedWhileDisabled, />Unpublish</);
});

test("custom PRE and POST slots keep their own published and draft statuses", async () => {
  const { AssessmentStatus } = await vite.ssrLoadModule("/src/pages/teacher/assessment/TeacherAssessmentBuilderPage.jsx");
  const renderStatuses = (pre, post) => renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(AssessmentStatus, { summary: pre }),
    React.createElement(AssessmentStatus, { summary: post }),
  ));

  const published = renderStatuses(
    { exists: true, published: true, attemptsExist: false },
    { exists: true, published: true, attemptsExist: false },
  );
  assert.equal((published.match(/>Published</g) ?? []).length, 2);
  assert.doesNotMatch(published, />Draft</);

  const mixed = renderStatuses(
    { exists: true, published: true, attemptsExist: false },
    { exists: true, published: false, attemptsExist: false },
  );
  assert.equal((mixed.match(/>Published</g) ?? []).length, 1);
  assert.equal((mixed.match(/>Draft</g) ?? []).length, 1);
});

test("lesson placements expose compact exact-scope PRE and POST draft entry points", () => {
  assert.match(lessonLibrarySource, /placement\.id/);
  assert.match(lessonLibrarySource, /assessmentType=PRE/);
  assert.match(lessonLibrarySource, /assessmentType=POST/);
  assert.match(lessonLibrarySource, /classroomId/);
  assert.match(lessonLibrarySource, /placementId/);
});

test("custom mutations fence assessment-type and route changes with the shared request generation", () => {
  for (const [name, nextName] of [
    ["create", "openCopyDialog"],
    ["save", "runAction"],
    ["runAction", "reviewRevision"],
    ["reviewRevision", "issues"],
  ]) {
    const start = source.indexOf(`const ${name} =`);
    const end = source.indexOf(`const ${nextName} =`, start + 1);
    const block = source.slice(start, end);
    assert.match(block, /const request = \+\+requestId\.current/);
    assert.match(block, /request === requestId\.current/);
  }
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
  assert.match(source, /Use built-in draft/);
  assert.doesNotMatch(source, /Copy assessment dashboard/);
});

test("built-in template dialog gives exact draft context and pending protection", async () => {
  let dialogModule = null;
  try {
    dialogModule = await vite.ssrLoadModule("/src/pages/teacher/assessment/TeacherAssessmentTemplateDialog.jsx");
  } catch {
    // The first TDD run intentionally reaches this assertion before the component exists.
  }
  assert.ok(dialogModule, "template dialog component must exist");
  const Dialog = dialogModule.default;
  const html = renderToStaticMarkup(React.createElement(Dialog, {
    open: true,
    classroom: { id: 7, className: "DSA", section: "BSIT 3E" },
    lesson: { key: "arrays", title: "Arrays" },
    type: "PRE",
    template: {
      templateKey: "builtin-arrays-pre",
      templateVersion: 1,
      curriculumRevision: "2026-09-28.1",
      questionCount: 10,
      totalPoints: 10,
    },
    pending: true,
    error: "",
    onConfirm() {},
    onClose() {},
  }));
  assert.match(html, /role="dialog"/);
  assert.match(html, /Arrays Pre-Test/);
  assert.match(html, /DSA/);
  assert.match(html, /BSIT 3E/);
  assert.match(html, /Version 1/);
  assert.match(html, /Curriculum revision 2026-09-28\.1/);
  assert.match(html, /10 questions . 10 points/);
  assert.match(html, /unpublished draft/i);
  assert.match(html, /Review and publish it when it is ready/i);
  assert.match(html, /Loading draft/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Loading draft.<\/button>/);
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

test("empty assessment actions use a scoped wrapping row with readable button labels", () => {
  assert.match(
    styles,
    /\.slotGrid\s+article:has\(\.slotActions\)\s*\{[^}]*grid-template-areas:\s*"heading"\s*"summary"\s*"action"/s,
  );
  assert.match(styles, /\.slotActions\s*\{[^}]*min-width:\s*0[^}]*width:\s*100%[^}]*flex-wrap:\s*wrap/s);
  assert.match(styles, /\.slotActions\s+button\s*\{[^}]*flex:\s*1 1 9rem[^}]*white-space:\s*normal[^}]*line-height:\s*1\.25/s);
  assert.match(styles, /\.main\s+:where\(button\)\s*\{[^}]*min-height:\s*44px/s);
  assert.match(styles, /button:focus-visible/);
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

test("teacher preview preserves multiline question text without inferring code boundaries", () => {
  assert.match(
    source,
    /<h3 className=\{styles\.previewQuestionText\}>\{index \+ 1\}\. \{question\.questionText \|\| "Untitled question"\}/,
  );
  assert.match(styles, /\.previewQuestionText\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/s);
  assert.match(styles, /\.previewQuestionText\s*\{[^}]*white-space:\s*pre-wrap/s);
  assert.match(styles, /\.previewQuestionText\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.doesNotMatch(source, /question\.questionText\.(?:split|replace|trim)\(/);
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
  assert.match(styles, /\.main\s+:where\(button\)\s*\{[^}]*min-height:\s*44px/s);
  assert.match(sharedCodeEditor, /minWidth:\s*0/);
  assert.match(sharedCodeEditor, /overflow:\s*"hidden"/);
});
