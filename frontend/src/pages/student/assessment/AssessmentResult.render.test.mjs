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
const { default: AssessmentResult } = await vite.ssrLoadModule(
  "/src/pages/student/assessment/AssessmentResult.jsx",
);
test.after(async () => { await vite.close(); });

const route = { classroomId: 47, lessonKey: "arrays", type: "POST" };
const progression = (lesson = {}, summary = {}) => ({
  classroomId: 47,
  lessons: [{
    lessonKey: "arrays",
    moduleUnlocked: true,
    postPassingRequired: true,
    postPassed: false,
    postCompleted: true,
    postAttemptsRemaining: 2,
    postAttemptsExhausted: false,
    lessonCompleted: false,
    nextAction: "RETRY_POST",
    ...lesson,
  }],
  summary: { nextAction: "RETRY_POST", nextActionLessonKey: "arrays", ...summary },
});
const envelope = (result = {}, extra = {}) => ({
  assessment: {
    id: 12,
    classroomId: 47,
    lessonKey: "arrays",
    type: result.type ?? "POST",
    title: result.type === "PRE" ? "Arrays diagnostic" : "Arrays post-test",
  },
  result: {
    attemptId: 312,
    type: "POST",
    status: "SUBMITTED",
    attemptNumber: 2,
    submittedAt: "2026-09-29T01:00:00.000Z",
    scoreVisible: true,
    pointsEarned: 7,
    maxPoints: 10,
    percentage: 70,
    passed: false,
    ...result,
  },
  attempts: { used: 2, max: 3, remaining: 1 },
  reviewAvailable: false,
  ...extra,
});
const renderResult = (overrides = {}) => renderToStaticMarkup(React.createElement(
  AssessmentResult,
  {
    envelope: envelope(),
    progression: progression(),
    route,
    questions: null,
    retakeStatus: "idle",
    onRetake() {},
    onRetryProgression() {},
    ...overrides,
  },
));

test("valid PRE result uses honest starting-point and baseline wording", () => {
  const html = renderResult({
    route: { ...route, type: "PRE" },
    envelope: envelope({
      type: "PRE",
      diagnosticCompleted: true,
      baselineEligible: true,
      passed: undefined,
      percentage: 45,
      pointsEarned: 4.5,
      maxPoints: 10,
    }, { attempts: { used: 1, max: 1, remaining: 0 } }),
    progression: progression({ moduleUnlocked: true, nextAction: "PLAY_GAME" }),
  });
  assert.match(html, /<h1[^>]*tabindex="-1"[^>]*>Diagnostic complete<[\/]h1>/);
  assert.match(html, /Diagnostic complete/);
  assert.match(html, /Arrays/);
  assert.match(html, /Arrays diagnostic/);
  assert.match(html, /PRE/);
  assert.match(html, /Submitted/);
  assert.match(html, /Sep/);
  assert.match(html, /Baseline score/);
  assert.match(html, /45%/);
  assert.match(html, /Continue to module/);
  assert.match(html, /Back to Lesson Map/);
  assert.doesNotMatch(html, /failed|did not pass|Retake|XP|reward/i);
});

test("retroactive or unknown PRE uses neutral diagnostic wording and target-lesson POST continuation", () => {
  const html = renderResult({
    route: { ...route, type: "PRE" },
    envelope: envelope({
      type: "PRE",
      diagnosticCompleted: true,
      baselineEligible: false,
      passed: undefined,
      percentage: 45,
      pointsEarned: 4.5,
      maxPoints: 10,
    }),
    progression: progression(
      { nextAction: "TAKE_POST", moduleUnlocked: true },
      { nextAction: "TAKE_PRE", nextActionLessonKey: "functions" },
    ),
  });
  assert.match(html, /Diagnostic score[^<]*45%/);
  assert.match(html, /diagnostic result has been recorded/i);
  assert.match(html, /Continue to Post-Test/);
  assert.match(html, /classrooms\/47\/lessons\/arrays\/assessment\/post/);
  assert.doesNotMatch(html, /starting point|Baseline score|Continue to module/i);
});

test("PRE recovery is non-routable and refresh failure exposes no speculative continuation", () => {
  const recovery = renderResult({
    route: { ...route, type: "PRE" },
    envelope: envelope({ type: "PRE", baselineEligible: false, passed: undefined }),
    progression: progression({ nextAction: "POST_RECOVERY_REQUIRED" }),
  });
  assert.match(recovery, /Post-Test attempts exhausted/);
  assert.match(recovery, /contact your teacher/i);
  assert.doesNotMatch(recovery, /Continue to Post-Test|href="[^"]*assessment\/post/);

  const failedRefresh = renderResult({
    route: { ...route, type: "PRE" },
    envelope: envelope({ type: "PRE", baselineEligible: false, passed: undefined }),
    progression: progression({ nextAction: "TAKE_POST" }),
    progressionError: new Error("offline"),
  });
  assert.match(failedRefresh, /Retry next-step refresh/);
  assert.doesNotMatch(failedRefresh, /Continue to Post-Test|Continue Post-Test|Retry Post-Test/);
});

test("hidden-score POST shows authoritative pass status but no numeric or comparison fields", () => {
  const html = renderResult({
    envelope: envelope({
      scoreVisible: false,
      passed: true,
      pointsEarned: undefined,
      maxPoints: undefined,
      percentage: undefined,
    }, {
      officialGrade: undefined,
      firstPost: undefined,
      prePercentage: undefined,
      learningGain: undefined,
    }),
    progression: progression({ postPassed: true }),
  });
  assert.match(html, /Post-test complete/);
  assert.match(html, /passed/i);
  assert.doesNotMatch(html, /Attempt score|Official grade|Baseline score|Learning gain|points|%/i);
});

test("failed historical POST stays failed when another attempt completed the requirement", () => {
  const html = renderResult({
    envelope: envelope({ passed: false, percentage: 40, pointsEarned: 4 }),
    progression: progression({
      postPassed: true,
      postAttemptsRemaining: 1,
      lessonCompleted: true,
      nextAction: "LESSON_COMPLETE",
    }, { nextAction: "LESSON_COMPLETE" }),
  });

  assert.match(html, /This attempt did not pass/);
  assert.match(html, /completed on another attempt/);
  assert.match(html, /Attempt score[^<]*40%/);
  assert.doesNotMatch(html, /You passed this post-test|Latest attempt score/);
});

test("unknown historical POST outcome reports overall completion without guessing", () => {
  const html = renderResult({
    envelope: envelope({ passed: undefined }),
    progression: progression({ postPassed: true, lessonCompleted: true }, { nextAction: "LESSON_COMPLETE" }),
  });

  assert.match(html, /submitted attempt is recorded/);
  assert.match(html, /post-test requirement is complete/);
  assert.doesNotMatch(html, /did not pass|passed this post-test|another attempt/i);
});

test("POST result labels the viewed attempt and official-best separately and renders supplied learning gain", () => {
  const html = renderResult({
    envelope: envelope({}, {
      officialGrade: { attemptId: 301, attemptNumber: 1, percentage: 90 },
      firstPost: { attemptId: 301, attemptNumber: 1, percentage: 90 },
      prePercentage: 40,
      learningGain: {
        value: 50,
        unit: "percentage_points",
        label: "Learning gain from PRE to first POST",
        firstPostPercentage: 90,
        prePercentage: 40,
      },
    }),
  });
  assert.match(html, /Attempt score[^<]*70%/);
  assert.match(html, /Official grade \(best\)[^<]*90%/);
  assert.match(html, /Learning-gain comparison attempt[^<]*90%/);
  assert.match(html, /Learning gain from PRE to first POST[^<]*50 percentage points/);
});

test("POST retry, exhaustion, and passing-not-required actions use progression authority", () => {
  assert.match(renderResult(), /Retake Post-Test/);
  assert.match(renderResult({ externalSyncStatus: "checking" }), /<button[^>]*disabled=""[^>]*>Checking for updates<[\/]button>/);
  assert.doesNotMatch(renderResult({
    progression: progression({ postAttemptsRemaining: 0, postAttemptsExhausted: true }),
  }), /Retake Post-Test/);
  assert.match(renderResult({
    progression: progression({ postAttemptsRemaining: 0, postAttemptsExhausted: true }),
  }), /No attempts remain/);
  assert.match(renderResult({
    progression: progression({ postPassingRequired: false, lessonCompleted: true }, { nextAction: "LESSON_COMPLETE" }),
  }), /Assessment complete/);
});

test("answer review renders only returned policy fields and explanations as escaped text", () => {
  const html = renderResult({
    envelope: envelope({}, {
      reviewAvailable: true,
      review: [{
        questionId: 101,
        questionText: "Which declaration is valid?",
        questionType: "MULTIPLE_CHOICE",
        selectedChoiceId: null,
        studentAnswer: null,
        correctChoiceId: 1001,
        correctAnswer: "int[] values",
        isCorrect: false,
        pointsAwarded: 0,
        explanation: "Use <brackets>, never scripts.",
      }],
    }),
  });
  assert.match(html, /Review Answers/);
  assert.match(html, /Which declaration is valid/);
  assert.match(html, /Correct answer: int\[\] values/);
  assert.match(html, /Question 1/);
  assert.match(html, /Unanswered/);
  assert.match(html, /Incorrect/);
  assert.match(html, /Use &lt;brackets&gt;, never scripts\./);
  assert.doesNotMatch(html, /1001|correctChoiceId|selectedChoiceId/);

  const restricted = renderResult({ envelope: envelope({}, { reviewAvailable: false }) });
  assert.match(restricted, /Answer review is not available/i);
  assert.doesNotMatch(restricted, /Correct|Incorrect|Explanation/);
});

test("hidden-score authorized review shows answers without numeric grading details", () => {
  const html = renderResult({
    envelope: envelope({
      scoreVisible: false,
      pointsEarned: undefined,
      maxPoints: undefined,
      percentage: undefined,
    }, {
      reviewAvailable: true,
      review: [{
        questionId: 101,
        questionText: "Which declaration is valid?",
        questionType: "MULTIPLE_CHOICE",
        studentAnswer: "int values[]",
        correctAnswer: "int[] values",
        isCorrect: false,
        explanation: "Brackets follow the type.",
      }],
    }),
  });
  assert.match(html, /Your answer: int values\[\]/);
  assert.match(html, /Correct answer: int\[\] values/);
  assert.match(html, /Incorrect/);
  assert.doesNotMatch(html, /Points awarded|Latest attempt score|Official grade|%/i);
});

test("answer review follows the cached shuffled attempt order and resolves safe choice labels", () => {
  const html = renderResult({
    questions: [{
      id: 102,
      questionText: "Second server question shown first",
      choices: [
        { id: 2001, choiceText: "Selected second answer" },
        { id: 2002, choiceText: "Correct second answer" },
      ],
    }, {
      id: 101,
      questionText: "First server question shown second",
      choices: [
        { id: 1001, choiceText: "Correct first answer" },
        { id: 1002, choiceText: "Selected first answer" },
      ],
    }],
    envelope: envelope({}, {
      reviewAvailable: true,
      review: [{
        questionId: 101,
        selectedChoiceId: 1002,
        correctChoiceId: 1001,
        isCorrect: false,
      }, {
        questionId: 102,
        selectedChoiceId: 2001,
        correctChoiceId: 2002,
        isCorrect: false,
      }],
    }),
  });

  assert.ok(html.indexOf("Second server question shown first") < html.indexOf("First server question shown second"));
  assert.match(html, /Question 1[\s\S]*Second server question shown first/);
  assert.match(html, /Your answer: Selected second answer/);
  assert.match(html, /Correct answer: Correct second answer/);
  assert.doesNotMatch(html, /2001|2002|correctChoiceId|selectedChoiceId/);
});

test("coding review renders only the student's source and preserves hidden-score protections", () => {
  const html = renderResult({
    questions: [{
      id: 202,
      questionText: "Add two values.",
      questionType: "CODING",
      methodContract: { typeName: "Solution", methodName: "Add" },
      codingExamples: [{ input: [1, 2], expectedOutput: 3 }],
      choices: [],
    }],
    envelope: envelope({
      scoreVisible: false,
      pointsEarned: undefined,
      maxPoints: undefined,
      percentage: undefined,
    }, {
      reviewAvailable: true,
      review: [{
        questionId: 202,
        questionText: "Add two values.",
        questionType: "CODING",
        sourceCode: "return left + right;",
      }],
    }),
  });

  assert.match(html, /Submitted source for question 1/);
  assert.doesNotMatch(html, /Unanswered|Correct|Incorrect|Points awarded|referenceSolution|HIDDEN|weight/);
});

test("result source does not grade, reconstruct hidden answers, or inject HTML", async () => {
  const source = await readFile(new URL("AssessmentResult.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(source, /reduce\s*\([^)]*(?:points|isCorrect)|filter\s*\([^)]*isCorrect/);
  assert.doesNotMatch(source, /maxAttempts\s*-|attemptNumber\s*-/);
  assert.match(source, /headingRef\.current\?\.focus/);
});
