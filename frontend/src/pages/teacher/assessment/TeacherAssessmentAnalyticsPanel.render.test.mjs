import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./TeacherAssessmentAnalyticsPanel.jsx", import.meta.url), "utf8");

test("assessment analytics is classroom and lesson scoped with explicit PRE/POST filtering", () => {
  for (const marker of ["Assessment analytics", "Select a classroom", "Lesson", "Assessment type", "All assessment types", "PRE diagnostic", "POST assessment"]) {
    assert.equal(source.includes(marker), true, marker);
  }
  assert.match(source, /listTeacherClassrooms/);
  assert.match(source, /listTeacherAssessments/);
  assert.match(source, /getTeacherAssessmentResults/);
});

test("canonical assessment-exempt lessons render an explicit not-applicable state", () => {
  assert.equal(source.includes("Assessment not applicable"), true);
  const pageSource = fs.readFileSync(new URL("../TeacherAnalyticsPage.jsx", import.meta.url), "utf8");
  assert.match(pageSource, /TeacherAssessmentAnalyticsPanel/);
});

test("overview states definitions, denominator limitation, and paired gain sample size", () => {
  for (const marker of ["Submitted students", "All submitted PRE average", "Valid baseline PRE average", "Valid baseline students", "Excluded baseline students", "Average official POST", "POST pass rate", "Average submitted POST attempts", "Submitted POST attempts", "Learning gain", "valid-baseline paired students", "Enrollment denominator unavailable"]) {
    assert.equal(source.includes(marker), true, marker);
  }
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

test("request handling cancels stale classroom/lesson result loads and normalizes errors", () => {
  assert.match(source, /AbortController/);
  assert.match(source, /requestVersionRef/);
  assert.match(source, /normalizeTeacherAssessmentError/);
  assert.match(source, /ERR_CANCELED/);
});

test("render source never asks for answers, responses, or grading keys", () => {
  for (const forbidden of ["correctChoiceId", "isCorrect", "answerReview"]) assert.equal(source.includes(forbidden), false);
  assert.doesNotMatch(source, /\bresponses\s*[:.[]/);
});
