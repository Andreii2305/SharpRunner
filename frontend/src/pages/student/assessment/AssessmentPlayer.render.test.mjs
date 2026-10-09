import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
const { AssessmentPlayer } = await vite.ssrLoadModule(
  "/src/pages/student/assessment/AssessmentPlayer.jsx",
);
test.after(async () => { await vite.close(); });

const questions = [{
  id: 101,
  questionText: "Which declaration creates <an array>?",
  questionType: "MULTIPLE_CHOICE",
  points: 1,
  objectiveKey: "declare-arrays",
  choices: [
    { id: 1002, choiceText: "Second server choice" },
    { id: 1001, choiceText: "First-looking ID" },
  ],
}, {
  id: 102,
  questionText: "Array indexes start at zero.",
  questionType: "TRUE_FALSE",
  points: 1,
  objectiveKey: "index-arrays",
  choices: [
    { id: 2002, choiceText: "Not so" },
    { id: 2001, choiceText: "Indeed" },
  ],
}];

const stateAt = (currentQuestionIndex, overrides = {}) => ({
  assessment: {
    id: 91,
    title: "Arrays post-test",
    instructions: "Choose the best answer.",
    type: "POST",
  },
  attempt: { attemptId: 312, attemptNumber: 2, status: "IN_PROGRESS" },
  orderedQuestions: questions,
  currentQuestionIndex,
  selectedByQuestion: { 102: 2001 },
  savedByQuestion: { 102: 2001 },
  saveStateByQuestion: {
    102: { status: "clean", revision: 0, error: null },
  },
  ...overrides,
});

const renderPlayer = (state, overrides = {}) => renderToStaticMarkup(React.createElement(
  AssessmentPlayer,
  {
    state,
    onSelect() {},
    onPrevious() {},
    onNext() {},
    onGoToQuestion() {},
    onRetrySave() {},
    onRecoverConflict() {},
    onRetrySync() {},
    onReadyToReview() {},
    ...overrides,
  },
));

test("player renders title, instructions, progress, answered count, and one MCQ in server order", () => {
  const html = renderPlayer(stateAt(0));
  assert.match(html, /POST-Test/);
  assert.match(html, /<h1[^>]*>Arrays post-test<\/h1>/);
  assert.match(html, /Choose the best answer\./);
  assert.match(html, /Question 1 of 2/);
  assert.match(html, /Answered 1 of 2/);
  assert.match(html, /<fieldset/);
  assert.match(html, /<legend[^>]*>Which declaration creates &lt;an array&gt;\?<\/legend>/);
  assert.match(html, /type="radio"/);
  assert.ok(html.indexOf("Second server choice") < html.indexOf("First-looking ID"));
  assert.doesNotMatch(html, /Array indexes start at zero|Not so|Indeed/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Previous<\/button>/);
  assert.match(html, /<button[^>]*>Next<\/button>/);
  assert.match(html, /<nav[^>]*aria-label="Question navigator"/);
  assert.match(html, /aria-current="step"[^>]*data-state="current"[^>]*>1<\/button>/);
  assert.match(html, /data-state="answered"[^>]*>2<\/button>/);
  assert.doesNotMatch(html, /data-state="correct"|data-state="incorrect"/);
});

test("PRE identity and navigator expose progress status without correctness", () => {
  const html = renderPlayer(stateAt(1, {
    assessment: {
      id: 90,
      title: "Arrays diagnostic",
      instructions: "Answer what you know.",
      type: "PRE",
    },
  }));
  assert.match(html, /PRE-Test/);
  assert.match(html, /Diagnostic assessment/);
  assert.match(html, /<details[^>]*open=""[^>]*>/);
  assert.match(html, /data-state="unanswered"[^>]*>1<\/button>/);
  assert.match(html, /aria-current="step"[^>]*data-state="current"[^>]*>2<\/button>/);
  assert.doesNotMatch(html, /Correct|Incorrect|Passed|Failed/);
});

test("player fails safely when the authoritative attempt contains no questions", () => {
  const html = renderPlayer(stateAt(0, {
    orderedQuestions: [],
    selectedByQuestion: {},
    savedByQuestion: {},
    saveStateByQuestion: {},
  }));
  assert.match(html, /Assessment unavailable/);
  assert.match(html, /No questions are available for this attempt/);
});

test("TRUE_FALSE uses server labels and restores the server-saved selection", () => {
  const html = renderPlayer(stateAt(1));
  assert.match(html, /Question 2 of 2/);
  assert.ok(html.indexOf("Not so") < html.indexOf("Indeed"));
  assert.doesNotMatch(html, />True<|>False</);
  assert.match(html, /<input[^>]*(?:checked=""[^>]*value="2001"|value="2001"[^>]*checked="")[^>]*>/);
  assert.match(html, /data-state="selected"[^>]*>[\s\S]*value="2001"/);
  assert.match(html, /data-state="unselected"/);
  assert.match(html, /<button[^>]*>Previous<\/button>/);
  assert.match(html, /<button[^>]*>Review answers<\/button>/);
});

test("save failures and immutable conflicts have accessible, distinct recovery controls", () => {
  const failed = renderPlayer(stateAt(0, {
    selectedByQuestion: { 101: 1002, 102: 2001 },
    saveStateByQuestion: {
      101: { status: "error", revision: 1, error: new Error("Offline") },
      102: { status: "clean", revision: 0, error: null },
    },
  }));
  assert.match(failed, /aria-live="polite"/);
  assert.match(failed, /role="alert"[^>]*>[\s\S]*<p[^>]*tabindex="-1"/);
  assert.match(failed, /Not saved/);
  assert.match(failed, /<button[^>]*>Retry save<\/button>/);

  const conflict = renderPlayer(stateAt(0, {
    selectedByQuestion: { 101: 1002, 102: 2001 },
    saveStateByQuestion: {
      101: { status: "conflict", revision: 1, error: new Error("Submitted") },
      102: { status: "clean", revision: 0, error: null },
    },
  }));
  assert.match(conflict, /Answers need to be reloaded/);
  assert.match(conflict, /<button[^>]*>Reload assessment<\/button>/);
  assert.doesNotMatch(conflict, />Retry save<\/button>/);

  const conflictOnOtherQuestion = renderPlayer(stateAt(1, {
    selectedByQuestion: { 101: 1002, 102: 2001 },
    saveStateByQuestion: {
      101: { status: "conflict", revision: 1, error: new Error("Submitted") },
      102: { status: "clean", revision: 0, error: null },
    },
  }));
  assert.match(conflictOnOtherQuestion, /role="alert"[^>]*>[\s\S]*<p[^>]*tabindex="-1"/);
  assert.match(conflictOnOtherQuestion, /Answers need to be reloaded/);
  assert.match(conflictOnOtherQuestion, /<button[^>]*>Reload assessment<\/button>/);
  assert.match(conflictOnOtherQuestion, /type="radio"[^>]*disabled=""/);
  assert.match(conflictOnOtherQuestion, /<button[^>]*disabled=""[^>]*>Review answers<\/button>/);
});

test("cross-tab synchronization blocks stale edits and exposes accessible recovery", () => {
  const required = renderPlayer(stateAt(0, {
    externalSyncRequired: true,
    externalSyncStatus: "required",
  }));
  assert.match(required, /role="alert"/);
  assert.match(required, /role="alert"[^>]*>[\s\S]*<p[^>]*tabindex="-1"/);
  assert.match(required, /changed in another tab/i);
  assert.match(required, /<button[^>]*>Reload assessment<[\/]button>/);
  assert.match(required, /type="radio"[^>]*disabled=""/);

  const checking = renderPlayer(stateAt(0, {
    externalSyncRequired: false,
    externalSyncStatus: "checking",
  }));
  assert.match(checking, /Checking for assessment updates/);
  assert.match(checking, /type="radio"[^>]*disabled=""/);

  const failed = renderPlayer(stateAt(0, {
    externalSyncRequired: false,
    externalSyncStatus: "error",
  }));
  assert.match(failed, /Could not check for assessment updates/);
  assert.match(failed, /<button[^>]*>Check again<[\/]button>/);
  assert.doesNotMatch(failed, /type="radio"[^>]*disabled=""/);
});

test("unanswered awareness offers first-unanswered review without correctness or submission UI", () => {
  const html = renderPlayer(stateAt(1, {
    selectedByQuestion: {},
    savedByQuestion: {},
    saveStateByQuestion: {},
  }));
  assert.match(html, /Answered 0 of 2/);
  assert.match(html, /2 unanswered/);
  assert.match(html, /<button[^>]*>Review unanswered questions<\/button>/);
  assert.doesNotMatch(html, /Submit assessment|Correct|Incorrect|Score|Passed/);
});

test("player source uses React text rendering and consumes no grading or browser persistence keys", async () => {
  const sources = await Promise.all([
    "AssessmentPlayer.jsx",
    "AssessmentQuestion.jsx",
    "assessmentPlayerController.js",
  ].map((name) => readFile(new URL(name, import.meta.url), "utf8")));
  const source = sources.join("\n");
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(source, /isCorrect|correctChoiceId|pointsAwarded|answerKey|explanation/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|submitAttempt/);
  assert.doesNotMatch(source, /percentage|passed|officialGrade|learningGain/);
  assert.match(source, /saveStatusRef\.current\?\.focus/);
});

test("responsive page and dialog sizing include padding within the viewport width", async () => {
  const css = await readFile(new URL("AssessmentPlayer.module.css", import.meta.url), "utf8");
  assert.match(css, /\.page\s*\{[^}]*box-sizing:\s*border-box/s);
  assert.match(css, /\.dialogPanel\s*\{[^}]*box-sizing:\s*border-box/s);
  assert.match(css, /@media\s*\(max-width:\s*36rem\)[\s\S]*\.runArea\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(css, /\.runResults\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.questionNavigatorGrid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,/s);
  assert.match(css, /@media\s*\(max-width:\s*36rem\)[\s\S]*\.questionNavigatorSummary\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /@media\s*\(max-width:\s*36rem\)[\s\S]*details:not\(\[open\]\)[^}]*display:\s*none/s);
  assert.match(css, /\.choice\[data-state="selected"\]/);
  assert.match(css, /\.choice:has\(input:disabled\)/);
});
