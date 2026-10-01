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
const { AssessmentPageContent, AssessmentStatusView } = await vite.ssrLoadModule(
  "/src/pages/student/assessment/AssessmentPage.jsx",
);

test.after(async () => { await vite.close(); });

const renderOutcome = (outcome, overrides = {}) => renderToStaticMarkup(React.createElement(
  AssessmentStatusView,
  { outcome, onRetry() {}, ...overrides },
));

test("assessment shell renders accessible, non-blank route states", () => {
  const cases = [
    ["LOADING", "Loading assessment"],
    ["INVALID_ROUTE", "Invalid assessment link"],
    ["AUTH_REQUIRED", "Sign in required"],
    ["FORBIDDEN", "Assessment unavailable"],
    ["UNAVAILABLE", "Assessment unavailable"],
    ["LOCKED", "Assessment locked"],
    ["COMPLETED", "Assessment already completed"],
    ["SUBMITTED", "Assessment submitted"],
    ["RETAKE_AVAILABLE", "Retake available"],
    ["EXHAUSTED", "Assessment attempts exhausted"],
    ["ACTIVE", "Active attempt loaded"],
    ["ERROR", "Unable to load assessment"],
  ];

  for (const [kind, heading] of cases) {
    const html = renderOutcome({
      kind,
      route: { classroomId: 47, lessonKey: "arrays", type: "PRE" },
      latestSubmittedAttemptId: 401,
    });
    assert.match(html, new RegExp(`<h1>${heading}</h1>`), kind);
    assert.match(html, /<(?:main|section)[^>]+(?:role="status"|role="alert")/, kind);
  }
});

test("active F-C shell never renders hydrated question or answer content", () => {
  const html = renderOutcome({
    kind: "ACTIVE",
    route: { classroomId: 47, lessonKey: "arrays", type: "PRE" },
    envelope: {
      assessment: {
        title: "Secret assessment title",
        questions: [{
          id: 1,
          questionText: "Secret question text",
          choices: [{ id: 2, choiceText: "Secret choice text" }],
        }],
      },
      attempt: { attemptId: 301, status: "IN_PROGRESS" },
    },
  });

  assert.doesNotMatch(html, /Secret assessment title|Secret question text|Secret choice text/);
  assert.doesNotMatch(html, /<input|type="radio"|<form/);
  assert.match(html, /The assessment player will appear in the next checkpoint/);
});

test("active CODING question renders the shared C# editor, public examples, and safe run feedback", () => {
  const assessmentState = {
    screen: "active",
    assessment: { id: 91, type: "POST", title: "Mixed assessment", instructions: "Answer all questions." },
    attempt: { attemptId: 301, status: "IN_PROGRESS" },
    orderedQuestions: [{
      id: 103,
      questionText: "Return the array length.",
      questionType: "CODING",
      starterCode: "return 0;",
      methodContract: {
        typeName: "Solution",
        methodName: "Solve",
        parameterTypes: ["int[]"],
        returnType: "int",
      },
      codingExamples: [{ input: [[1, 2]], expectedOutput: 2 }],
      referenceSolution: "teacher-secret-solution",
      codingTestCases: [{ visibility: "HIDDEN", input: [[9]], expectedOutput: 1, weight: 99 }],
      choices: [],
    }],
    currentQuestionIndex: 0,
    selectedByQuestion: {},
    savedByQuestion: {},
    sourceByQuestion: { 103: "return values.Length;" },
    savedSourceByQuestion: { 103: "return values.Length;" },
    responseExistsByQuestion: { 103: true },
    saveStateByQuestion: { 103: { status: "clean" } },
    codingRunByQuestion: {
      103: {
        status: "succeeded",
        result: {
          status: "SUCCESS",
          tests: [{
            status: "SUCCESS",
            passed: true,
            input: [[1, 2]],
            expectedOutput: 2,
            actualOutput: 2,
          }, {
            status: "SUCCESS",
            passed: false,
            input: [[]],
            expectedOutput: 0,
            actualOutput: 1,
          }],
        },
      },
    },
    externalSyncRequired: false,
    externalSyncStatus: "idle",
  };
  const html = renderToStaticMarkup(React.createElement(AssessmentPageContent, {
    outcome: { kind: "ACTIVE" },
    assessmentState,
    reviewReady: false,
    onSourceChange() {},
    onRunCode() {},
    onPrevious() {},
    onNext() {},
    onGoToQuestion() {},
    onRetrySave() {},
    onRecoverConflict() {},
    onRetrySync() {},
    onReadyToReview() {},
  }));

  assert.match(html, /C# coding question/);
  assert.match(html, /Required method signature/);
  assert.match(html, /Solution\.Solve/);
  assert.match(html, /Public examples/);
  assert.match(html, /Code answer for question 103/);
  assert.match(html, /Run code/);
  assert.match(html, /role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html, /Public test 1: Passed/);
  assert.match(html, /Public test 2: Failed/);
  assert.doesNotMatch(html, /teacher-secret-solution|HIDDEN|99/);
});

test("active page content renders the F-D player from hydrated reducer state", () => {
  const assessmentState = {
    screen: "active",
    assessment: {
      id: 91,
      type: "PRE",
      title: "Arrays diagnostic",
      instructions: "Choose one answer.",
    },
    attempt: { attemptId: 301, attemptNumber: 1, status: "IN_PROGRESS" },
    orderedQuestions: [{
      id: 101,
      questionText: "Which declaration creates an array?",
      questionType: "MULTIPLE_CHOICE",
      choices: [{ id: 1001, choiceText: "int[] values" }],
    }],
    currentQuestionIndex: 0,
    selectedByQuestion: {},
    savedByQuestion: {},
    saveStateByQuestion: {},
  };
  const html = renderToStaticMarkup(React.createElement(AssessmentPageContent, {
    outcome: { kind: "ACTIVE" },
    assessmentState,
    reviewReady: false,
    onRetry() {},
    onSelect() {},
    onPrevious() {},
    onNext() {},
    onGoToQuestion() {},
    onRetrySave() {},
    onRecoverConflict() {},
    onReadyToReview() {},
    onReturnToQuestions() {},
  }));

  assert.match(html, /Arrays diagnostic/);
  assert.match(html, /Which declaration creates an array\?/);
  assert.match(html, /type="radio"/);
  assert.doesNotMatch(html, /player will appear in the next checkpoint/);
});

test("final-question handoff renders authoritative readiness and explicit submission confirmation", () => {
  const html = renderToStaticMarkup(React.createElement(AssessmentPageContent, {
    outcome: { kind: "ACTIVE" },
    assessmentState: {
      screen: "active",
      orderedQuestions: [{ id: 101 }, { id: 102 }],
      selectedByQuestion: { 101: 1001 },
      savedByQuestion: { 101: 1001 },
      saveStateByQuestion: { 101: { status: "clean" } },
      submitStatus: "idle",
      submitReviewOpen: true,
      error: null,
    },
    reviewReady: true,
    onRetry() {},
    onReturnToQuestions() {},
    onGoToQuestion() {},
    onOpenConfirmation() {},
    onCancelConfirmation() {},
    onConfirmSubmit() {},
  }));
  assert.match(html, /Review your answers/);
  assert.match(html, /<dt>Answered<\/dt><dd>1 of 2<\/dd>/);
  assert.match(html, /You still have 1 unanswered question/);
  assert.match(html, /<button[^>]*>Back to questions<\/button>/);
  assert.match(html, /<button[^>]*>Submit assessment<\/button>/);
  assert.doesNotMatch(html, /Correct|Incorrect|Score|Expected answer/);
});

test("external invalidation closes review and cannot expose a stale submission action", () => {
  const html = renderToStaticMarkup(React.createElement(AssessmentPageContent, {
    outcome: { kind: "ACTIVE" },
    assessmentState: {
      screen: "active",
      assessment: { id: 91, type: "POST", title: "Arrays post-test" },
      attempt: { attemptId: 312, status: "IN_PROGRESS" },
      orderedQuestions: [{
        id: 101,
        questionText: "Which declaration creates an array?",
        questionType: "MULTIPLE_CHOICE",
        choices: [{ id: 1001, choiceText: "int[] values" }],
      }],
      currentQuestionIndex: 0,
      selectedByQuestion: { 101: 1001 },
      savedByQuestion: { 101: 1001 },
      saveStateByQuestion: { 101: { status: "clean" } },
      submitStatus: "idle",
      submitReviewOpen: false,
      externalSyncRequired: true,
      externalSyncStatus: "required",
    },
    reviewReady: true,
    onRetry() {},
    onSelect() {},
    onPrevious() {},
    onNext() {},
    onGoToQuestion() {},
    onRetrySave() {},
    onRecoverConflict() {},
    onRetrySync() {},
    onReadyToReview() {},
    onReturnToQuestions() {},
  }));
  assert.match(html, /changed in another tab/i);
  assert.match(html, /Reload assessment/);
  assert.doesNotMatch(html, /Continue to submission|Submit assessment/);
});

test("failed immutable recovery hides editable content and offers result-only retry", () => {
  const html = renderToStaticMarkup(React.createElement(AssessmentPageContent, {
    outcome: { kind: "ACTIVE" },
    assessmentState: {
      screen: "active",
      submitStatus: "recovery-error",
      orderedQuestions: [{ id: 101, questionText: "Must stay hidden after submit" }],
    },
    reviewReady: true,
    onRetryResultRecovery() {},
  }));

  assert.match(html, /Unable to load submitted result/);
  assert.match(html, /already submitted and can no longer be edited/);
  assert.match(html, /Try loading result again/);
  assert.doesNotMatch(html, /Must stay hidden after submit|Back to questions|type="radio"/);
});

test("server result state renders the reusable result component without shell placeholders", () => {
  const html = renderToStaticMarkup(React.createElement(AssessmentPageContent, {
    outcome: { kind: "RESULT", route: { classroomId: 47, lessonKey: "arrays", type: "PRE" } },
    assessmentState: {
      screen: "result",
      result: {
        result: {
          attemptId: 401,
          type: "PRE",
          status: "SUBMITTED",
          attemptNumber: 1,
          scoreVisible: false,
          diagnosticCompleted: true,
        },
        attempts: { used: 1, max: 1, remaining: 0 },
        reviewAvailable: false,
      },
      progression: {
        classroomId: 47,
        lessons: [{ lessonKey: "arrays", moduleUnlocked: true }],
        summary: { nextAction: "PLAY_GAME", nextActionLessonKey: "arrays" },
      },
      progressionError: null,
      retakeStatus: "idle",
      retakeError: null,
    },
    reviewReady: false,
    onRetry() {},
    onRetake() {},
    onRetryProgression() {},
  }));
  assert.match(html, /Diagnostic complete/);
  assert.match(html, /Continue to module/);
  assert.doesNotMatch(html, /Results will be available|results checkpoint/);
});

test("completed and retry shells retain identity without fetching or starting another attempt", () => {
  const completed = renderOutcome({
    kind: "COMPLETED",
    route: { classroomId: 47, lessonKey: "arrays", type: "PRE" },
    latestSubmittedAttemptId: 401,
  });
  const retry = renderOutcome({
    kind: "RETAKE_AVAILABLE",
    route: { classroomId: 47, lessonKey: "arrays", type: "POST" },
    latestSubmittedAttemptId: 402,
  });

  assert.match(completed, /data-latest-submitted-attempt-id="401"/);
  assert.match(retry, /data-latest-submitted-attempt-id="402"/);
  assert.doesNotMatch(retry, /<button[^>]*>Start|<button[^>]*>Retake/);
});

test("recoverable failure exposes a retry action without backend internals", () => {
  const html = renderOutcome({
    kind: "ERROR",
    route: { classroomId: 47, lessonKey: "arrays", type: "POST" },
    error: new Error("database password internal-secret"),
  });
  assert.match(html, /role="alert"/);
  assert.match(html, />Try again</);
  assert.doesNotMatch(html, /database password|internal-secret/);
});

test("App registers one lazy, student-only, class-membership assessment route", async () => {
  const appSource = await readFile(new URL("../../../App.jsx", import.meta.url), "utf8");
  assert.match(appSource, /lazy\(\(\) => import\("\.\/pages\/student\/assessment\/AssessmentPage\.jsx"\)\)/);
  assert.match(
    appSource,
    /path="\/classrooms\/:classroomId\/lessons\/:lessonKey\/assessment\/:type"[\s\S]{0,260}<ProtectedRoute[^>]*allowedRoles=\{\["student"\]\}[^>]*requireClassMembership>/,
  );
  assert.equal(
    (appSource.match(/classrooms\/:classroomId\/lessons\/:lessonKey\/assessment\/:type/g) ?? []).length,
    1,
  );
});

test("page owns abort and generation fencing and delegates policy orchestration", async () => {
  const source = await readFile(new URL("./AssessmentPage.jsx", import.meta.url), "utf8");
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /requestGeneration/);
  assert.match(source, /createAssessmentRouteOrchestrator/);
  assert.match(source, /createAssessmentPlayerController/);
  assert.match(source, /createAssessmentSubmissionController/);
  assert.match(source, /createAssessmentSessionGuard/);
  assert.match(source, /orchestrator\.revalidate/);
  assert.match(source, /announceSaved/);
  assert.match(source, /announceSubmitted/);
  assert.match(source, /saveResponse/);
  assert.match(source, /submitAttempt/);
  assert.match(source, /getAttemptResult/);
  assert.match(source, /codingRunInFlight/);
  assert.match(source, /assessmentReducer/);
  assert.doesNotMatch(source, /pointsEarned|percentage|passingScore|isCorrect/);
});
