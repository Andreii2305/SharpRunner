import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const source = fs.readFileSync(new URL("./TeacherAssessmentAnalyticsPanel.jsx", import.meta.url), "utf8");
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
test.after(async () => vite.close());

const {
  AssessmentAttemptHistory,
  AssessmentEvidenceSummary,
} = await vite.ssrLoadModule("/src/pages/teacher/assessment/TeacherAssessmentAnalyticsPanel.jsx");

test("assessment analytics is classroom and lesson scoped with explicit PRE/POST filtering", () => {
  for (const marker of ["Assessment analytics", "Select a classroom", "Lesson", "Assessment type", "All assessment types", "PRE diagnostic", "POST assessment"]) {
    assert.equal(source.includes(marker), true, marker);
  }
  assert.match(source, /listTeacherClassrooms/);
  assert.match(source, /listTeacherAssessments/);
  assert.match(source, /getTeacherAssessmentResults/);
  assert.match(source, /assessmentClassroomLabel/);
  assert.equal(source.includes("value={classroom.id}"), true);
});

test("canonical assessment-exempt lessons render an explicit not-applicable state", () => {
  assert.equal(source.includes("Assessment not applicable"), true);
  const pageSource = fs.readFileSync(new URL("../TeacherAnalyticsPage.jsx", import.meta.url), "utf8");
  assert.match(pageSource, /TeacherAssessmentAnalyticsPanel/);
});

test("comparison presentation retains definitions, denominator limitation, and paired gain sample size", () => {
  const html = renderToStaticMarkup(React.createElement(AssessmentEvidenceSummary, { metrics: {
    preSubmittedStudents: 2,
    postSubmittedStudents: 1,
    averageAllPrePercentage: 40,
    averageValidBaselinePrePercentage: 40,
    averageOfficialPostPercentage: 90,
    postPassRate: 100,
    postPassedStudents: 1,
    averageLearningGain: 50,
    pairedStudents: 1,
    validBaselineStudents: 1,
    excludedBaselineStudents: 1,
    averagePostAttempts: 2,
  } }));
  for (const marker of ["Participation", "Original PRE average", "first submitted PRE", "excludes supplemental PRE attempts", "Valid baseline PRE average", "Valid baseline students", "Excluded baseline students", "Average official POST", "POST pass rate", "Average submitted POST attempts", "Paired learning gain", "valid-baseline paired students", "Enrollment denominator unavailable", "Comparison details"]) {
    assert.equal(html.includes(marker), true, marker);
  }
  assert.equal(html.includes("All submitted PRE average"), false);
});

test("production history labels POST attempts by authoritative number while preserving score markers and PRE provenance", () => {
  const history = [
    { type: "PRE", attemptId: "pre-1", attemptNumber: 1, submittedAt: "2026-09-20T00:00:00.000Z", pointsEarned: 4, maxPoints: 10, percentage: 40, baselineLabel: "Valid baseline" },
    { type: "PRE", attemptId: "pre-2", attemptNumber: 2, submittedAt: "2026-09-21T00:00:00.000Z", pointsEarned: 9, maxPoints: 10, percentage: 90, baselineLabel: "Supplemental diagnostic — not a baseline" },
    { type: "POST", attemptId: "post-1", attemptNumber: 1, submittedAt: "2026-09-22T00:00:00.000Z", pointsEarned: 6, maxPoints: 10, percentage: 60, isFirstSubmittedPost: true, isOfficial: false },
    { type: "POST", attemptId: "post-2", attemptNumber: 2, submittedAt: "2026-09-23T00:00:00.000Z", pointsEarned: 9, maxPoints: 10, percentage: 90, isFirstSubmittedPost: false, isOfficial: true },
  ];
  const html = renderToStaticMarkup(React.createElement(AssessmentAttemptHistory, { history }));

  assert.ok(html.indexOf("PRE attempt 1") < html.indexOf("PRE attempt 2"));
  assert.ok(html.indexOf("PRE attempt 2") < html.indexOf("POST attempt 1"));
  assert.ok(html.indexOf("POST attempt 1") < html.indexOf("POST attempt 2"));
  for (const marker of ["Valid baseline", "Supplemental diagnostic", "Initial attempt", "Retake", "First POST", "Official grade"]) {
    assert.match(html, new RegExp(marker));
  }
});

test("a submitted POST attempt 2 remains a retake and invalid attempt numbers receive no invented kind", () => {
  const base = { type: "POST", submittedAt: "2026-09-23T00:00:00.000Z", pointsEarned: 9, maxPoints: 10, percentage: 90 };
  const retakeOnly = renderToStaticMarkup(React.createElement(AssessmentAttemptHistory, {
    history: [{ ...base, attemptId: "post-2", attemptNumber: 2 }],
  }));
  assert.match(retakeOnly, /POST attempt 2/);
  assert.match(retakeOnly, /Retake/);
  assert.doesNotMatch(retakeOnly, /Initial attempt/);

  const invalid = renderToStaticMarkup(React.createElement(AssessmentAttemptHistory, {
    history: [{ ...base, attemptId: "post-missing", attemptNumber: null }],
  }));
  assert.doesNotMatch(invalid, /Initial attempt|Retake/);
});

test("PRE rows and history expose accessible provenance labels without ranking", () => {
  for (const marker of [
    "Valid baseline",
    "Retroactive — game activity preceded PRE",
    "Unknown — legacy baseline timing",
  ]) assert.equal(source.includes(marker), true, marker);
  assert.equal(source.toLowerCase().includes("rank"), false);
});

test("coding breakdown is question performance without rankings or inferred official grades", () => {
  for (const marker of [
    "Coding question performance",
    "PRE diagnostic question",
    "POST assessment question",
    "Submitted responses",
    "Fully correct",
    "Average points",
    "Question-level performance is separate from the official POST grade",
  ]) assert.equal(source.includes(marker), true, marker);
  assert.equal(source.toLowerCase().includes("ranking"), false);
});

test("student table and local history detail are accessible and not a leaderboard", () => {
  assert.match(source, /<table/);
  assert.match(source, /scope="col"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /Escape/);
  assert.equal(source.toLowerCase().includes("leaderboard"), false);
  assert.equal(source.includes("localStorage"), false);
  assert.equal(source.includes("sessionStorage"), false);
});

test("attempt-grant confirmation identifies the exact classroom and lesson", () => {
  for (const marker of [
    "Grant one additional attempt",
    "classroomLabel={assessmentClassroomLabel(selectedClassroom)}",
    "lessonTitle={selectedLesson?.title ?? lessonKey}",
    "Current total allowance:",
    "After this grant:",
    "Answers may already have been available. This retake can affect the official POST grade.",
  ]) assert.equal(source.includes(marker), true, marker);
  assert.equal(source.includes("value={classroom.id}"), true);
});

test("table and history present authoritative points without hiding independently available percentages", () => {
  for (const marker of [
    "attemptPointsLabel", "Percentage unavailable", "PRE attempt", "POST attempt",
    "Required threshold unavailable", "Required:", "First POST", "Official grade",
  ]) assert.equal(source.includes(marker), true, marker);
  assert.equal(source.includes("correct answers"), false);
  assert.equal(source.includes("correctCount"), false);
});

test("score sheet download states its submitted-only scope and fences obsolete requests", () => {
  for (const marker of [
    "Download score sheet",
    "All students with at least one submitted PRE or POST for this classroom and lesson",
    "Student search and assessment-type filters do not affect this download",
    "createScoreSheetDownloadController",
    "setScope(resultsScope)",
    "Downloading…",
    "aria-live=\"polite\"",
  ]) assert.equal(source.includes(marker), true, marker);
});

test("request handling cancels stale classroom/lesson result loads and normalizes errors", () => {
  assert.match(source, /AbortController/);
  assert.match(source, /requestVersionRef/);
  assert.match(source, /normalizeTeacherAssessmentError/);
  assert.match(source, /ERR_CANCELED/);
});

test("custom classroom lesson reporting reuses the existing table with stable placement scope", () => {
  for (const marker of [
    "Built-in game lessons",
    "Classroom lesson placements",
    "Archived",
    "listCustomAssessmentReportingTargets",
    "getCustomTeacherAssessmentResults",
    "getCustomTeacherAssessmentScoreSheet",
    "assessmentTargetValue",
    "parseAssessmentTargetValue",
  ]) assert.equal(source.includes(marker), true, marker);
  assert.match(source, /value=\{assessmentTargetValue\(target\)\}/);
  assert.equal(source.includes("value={target.lessonTitle}"), false);
});

test("custom placement discovery has fenced loading and nonblocking retry feedback", () => {
  for (const marker of [
    "targetsLoading",
    "targetRetryVersion",
    "Loading classroom lesson placements",
    "Retry classroom lessons",
    "Built-in lesson reporting remains available",
  ]) assert.equal(source.includes(marker), true, marker);
  assert.match(source, /\[classroomId, targetRetryVersion\]/);
});

test("custom history grants retain exact placement scope and disable archived targets", () => {
  for (const marker of [
    "getCustomAdditionalAttemptEligibility",
    "grantCustomAdditionalAssessmentAttempt",
    "placementId",
    "Archived placements remain available for history and score-sheet export",
  ]) assert.equal(source.includes(marker), true, marker);
  assert.match(source, /grantDisabled=\{selectedTarget\?\.archived === true\}/);
});

test("classroom and target changes close obsolete history before another grant can be requested", () => {
  assert.match(source, /setClassroomId\(event\.target\.value\); setTargetValue\(""\); setSelectedStudent\(null\)/);
  assert.match(source, /setTargetValue\(event\.target\.value\); setSelectedStudent\(null\)/);
});

test("render source never asks for answers, responses, or grading keys", () => {
  for (const forbidden of ["correctChoiceId", "isCorrect", "answerReview"]) assert.equal(source.includes(forbidden), false);
  assert.doesNotMatch(source, /\bresponses\s*[:.[]/);
});
