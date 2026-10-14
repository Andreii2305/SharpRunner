import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
const { default: AssessmentStart } = await vite.ssrLoadModule(
  "/src/pages/student/assessment/AssessmentStart.jsx",
);
test.after(async () => { await vite.close(); });

const readyOutcome = (overrides = {}) => ({
  kind: "READY",
  startMode: "retake",
  route: { classroomId: 47, lessonKey: "arrays", type: "POST" },
  discovery: {
    assessment: {
      id: 92,
      lessonKey: "arrays",
      type: "POST",
      title: "Arrays mastery check",
      instructions: "Choose the best answer.",
      maxAttempts: 3,
      studentInformation: {
        lessonTitle: "Arrays",
        questionCount: 3,
        totalPossiblePoints: 6.5,
        passingRequirement: { required: true, minimumPercentage: 75 },
        scoreReleasePolicy: "AFTER_SUBMISSION",
        answerReviewReleasePolicy: "AFTER_FINAL_ATTEMPT",
      },
    },
    status: { attemptsUsed: 1, attemptsRemaining: 2 },
  },
  ...overrides,
});

const renderStart = (outcome = readyOutcome()) => renderToStaticMarkup(React.createElement(
  AssessmentStart,
  { outcome, onStart() {} },
));

test("POST checkpoint presents authoritative facts and distinguishes before/after attempt availability", () => {
  const html = renderStart();
  assert.match(html, /<h1[^>]*>Arrays mastery check<\/h1>/);
  assert.match(html, /Arrays · Post-assessment/);
  assert.match(html, /checks what you learned/);
  assert.match(html, /3 questions/);
  assert.match(html, /6\.5 points/);
  assert.match(html, /75% or higher/);
  assert.match(html, /3 total attempts/);
  assert.match(html, /2 attempts are available before you start/);
  assert.match(html, /After you start, 1 additional attempt will remain/);
  assert.match(html, /saved automatically/);
  assert.match(html, /final submission/);
  assert.match(html, /score will be available after you submit/);
  assert.match(html, /answer review and any provided explanations will be available after your final allowed attempt/i);
  assert.match(html, /<button[^>]*>Start assessment<\/button>/);
  assert.match(html, /href="\/Map\?classroomId=47"[^>]*>Back to Lesson Map<\/a>/);
  assert.doesNotMatch(html, /time limit|timer|correct answers/i);
});

test("PRE checkpoint uses diagnostic wording and never invents a passing score", () => {
  const outcome = readyOutcome({
    startMode: "initial",
    route: { classroomId: 47, lessonKey: "arrays", type: "PRE" },
    discovery: {
      assessment: {
        id: 91,
        lessonKey: "arrays",
        type: "PRE",
        title: "Arrays diagnostic",
        instructions: null,
        maxAttempts: 1,
        studentInformation: {
          lessonTitle: "Arrays",
          questionCount: 2,
          totalPossiblePoints: 4,
          passingRequirement: null,
          scoreReleasePolicy: "NOT_RELEASED",
          answerReviewReleasePolicy: "NEVER",
        },
      },
      status: { attemptsUsed: 0, attemptsRemaining: 1 },
    },
  });
  const html = renderStart(outcome);
  assert.match(html, /shows what you already know/);
  assert.match(html, /diagnostic shows what you already know[\s\S]*not a pass-or-fail test/i);
  assert.match(html, /1 attempt is available before you start/);
  assert.match(html, /After you start, no additional attempts will remain/);
  assert.match(html, /Your score is not released/);
  assert.match(html, /Answer review and explanations are not released/);
  assert.doesNotMatch(html, /% or higher|passing score/i);
});

test("optional POST settings and immediate review policy are described without a made-up threshold", () => {
  const outcome = readyOutcome();
  outcome.discovery.assessment.studentInformation.passingRequirement = { required: false };
  outcome.discovery.assessment.studentInformation.answerReviewReleasePolicy = "AFTER_SUBMISSION";
  const html = renderStart(outcome);
  assert.match(html, /No passing percentage is required/);
  assert.match(html, /Answer review and any provided explanations will be available after you submit/);
  assert.doesNotMatch(html, /75% or higher/);
});

test("pending and retry states retain checkpoint context and expose accessible feedback", () => {
  const pending = renderStart({ ...readyOutcome(), startStatus: "starting" });
  assert.match(pending, /aria-busy="true"/);
  assert.match(pending, /<button[^>]*disabled=""[^>]*>Starting assessment…<\/button>/);
  assert.match(pending, /Arrays mastery check/);

  const failed = renderStart({
    ...readyOutcome(),
    kind: "START_ERROR",
    startStatus: "error",
    error: new Error("Connection lost"),
  });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /authoritative assessment status/i);
  assert.match(failed, /<button[^>]*>Try starting again<\/button>/);
  assert.match(failed, /Arrays mastery check/);
});
