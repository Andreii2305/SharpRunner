import assert from "node:assert/strict";
import test from "node:test";
import {
  ACADEMIC_LESSONS,
  buildAssessmentAnalytics,
  filterAssessmentStudents,
  summarizeAssessmentAvailability,
} from "./teacherAssessmentAnalyticsState.js";

const student = (id, firstName, lastName) => ({ id, firstName, lastName, username: `student${id}` });
const result = (studentValue, overrides = {}) => ({
  student: studentValue,
  attemptId: overrides.attemptId ?? `${studentValue.id}-${overrides.attemptNumber ?? 1}`,
  attemptNumber: overrides.attemptNumber ?? 1,
  submittedAt: overrides.submittedAt ?? "2026-09-20T00:00:00.000Z",
  pointsEarned: overrides.pointsEarned ?? 8,
  maxPoints: overrides.maxPoints ?? 10,
  percentage: overrides.percentage ?? 80,
  passed: overrides.passed ?? null,
  isOfficial: overrides.isOfficial ?? false,
  isFirstSubmittedPost: overrides.isFirstSubmittedPost ?? false,
});

const prePayload = (results) => ({ assessment: { id: 1, lessonKey: "arrays", type: "PRE", title: "Arrays diagnostic", passingPercentage: null, maxAttempts: 1 }, results });
const postPayload = (results) => ({ assessment: { id: 2, lessonKey: "arrays", type: "POST", title: "Arrays check", passingPercentage: 75, maxAttempts: 3 }, results });

test("academic lesson filter uses the backend assessment allowlist", () => {
  assert.deepEqual(ACADEMIC_LESSONS.map(({ key }) => key), ["arrays", "functions", "functions-with-arrays", "final"]);
  assert.equal(ACADEMIC_LESSONS.find(({ key }) => key === "final").assessmentApplicable, false);
});

test("analytics deduplicates submitted students and keeps first versus official POST distinct", () => {
  const ada = student(2, "Ada", "Lovelace");
  const grace = student(3, "Grace", "Hopper");
  const model = buildAssessmentAnalytics({
    prePayload: prePayload([result(ada, { percentage: 40 }), result(grace, { percentage: 70 })]),
    postPayload: postPayload([
      result(ada, { attemptId: "a1", attemptNumber: 1, percentage: 60, passed: false, isFirstSubmittedPost: true }),
      result(ada, { attemptId: "a2", attemptNumber: 2, percentage: 90, passed: true, isOfficial: true }),
      result(grace, { attemptId: "g1", percentage: 80, passed: true, isOfficial: true, isFirstSubmittedPost: true }),
    ]),
  });
  assert.equal(model.metrics.preSubmittedStudents, 2);
  assert.equal(model.metrics.postSubmittedStudents, 2);
  assert.equal(model.metrics.averagePrePercentage, 55);
  assert.equal(model.metrics.averageOfficialPostPercentage, 85);
  assert.equal(model.metrics.postPassedStudents, 2);
  assert.equal(model.metrics.postPassRate, 100);
  assert.equal(model.metrics.averagePostAttempts, 1.5);
  assert.equal(model.metrics.pairedStudents, 2);
  assert.equal(model.metrics.averageLearningGain, 15);
  assert.equal(model.students[0].name, "Ada Lovelace");
  assert.equal(model.students[0].firstPost.percentage, 60);
  assert.equal(model.students[0].officialPost.percentage, 90);
  assert.equal(model.students[0].learningGain, 20);
  assert.equal(model.students[0].postAttempts.length, 2);
});

test("PRE is diagnostic and never receives inferred pass/fail semantics", () => {
  const alan = student(1, "Alan", "Turing");
  const model = buildAssessmentAnalytics({ prePayload: prePayload([result(alan, { percentage: 100, passed: true })]) });
  assert.equal(model.students[0].preStatus, "Diagnostic submitted");
  assert.equal(model.students[0].preAttempt.passed, null);
  assert.equal(model.metrics.postPassRate, null);
});

test("POST without a passing policy is submitted, never failed, and has no pass rate", () => {
  const alan = student(1, "Alan", "Turing");
  const payload = postPayload([result(alan, { percentage: 70, passed: null, isOfficial: true, isFirstSubmittedPost: true })]);
  payload.assessment.passingPercentage = null;
  const model = buildAssessmentAnalytics({ postPayload: payload });
  assert.equal(model.students[0].postStatus, "Submitted");
  assert.equal(model.metrics.postPassRate, null);
  assert.equal(model.metrics.postPassedStudents, null);
});

test("paired learning gain excludes PRE-only and POST-only students and preserves negative gain", () => {
  const paired = student(1, "Alan", "Turing");
  const preOnly = student(2, "Ada", "Lovelace");
  const postOnly = student(3, "Grace", "Hopper");
  const model = buildAssessmentAnalytics({
    prePayload: prePayload([result(paired, { percentage: 90 }), result(preOnly, { percentage: 30 })]),
    postPayload: postPayload([
      result(paired, { percentage: 70, passed: false, isOfficial: true, isFirstSubmittedPost: true }),
      result(postOnly, { percentage: 100, passed: true, isOfficial: true, isFirstSubmittedPost: true }),
    ]),
  });
  assert.equal(model.metrics.pairedStudents, 1);
  assert.equal(model.metrics.averageLearningGain, -20);
  assert.equal(model.students.find((row) => row.student.id === 2).learningGain, null);
  assert.equal(model.students.find((row) => row.student.id === 3).learningGain, null);
});

test("paired learning gain preserves a zero percentage-point change", () => {
  const alan = student(1, "Alan", "Turing");
  const model = buildAssessmentAnalytics({
    prePayload: prePayload([result(alan, { percentage: 75 })]),
    postPayload: postPayload([result(alan, { percentage: 75, passed: true, isOfficial: true, isFirstSubmittedPost: true })]),
  });
  assert.equal(model.students[0].learningGain, 0);
  assert.equal(model.metrics.averageLearningGain, 0);
  assert.equal(model.metrics.pairedStudents, 1);
});

test("missing authoritative POST markers stay unavailable rather than being guessed", () => {
  const ada = student(2, "Ada", "Lovelace");
  const model = buildAssessmentAnalytics({ postPayload: postPayload([result(ada, { percentage: 92, passed: true })]) });
  assert.equal(model.students[0].officialPost, null);
  assert.equal(model.students[0].firstPost, null);
  assert.equal(model.metrics.averageOfficialPostPercentage, null);
  assert.equal(model.metrics.postPassedStudents, 0);
  assert.equal(model.metrics.postPassRate, null);
});

test("rows are alphabetical by default and filters never introduce score ranking", () => {
  const model = buildAssessmentAnalytics({
    prePayload: prePayload([result(student(2, "Zoe", "Zeta")), result(student(1, "Amy", "Alpha"))]),
  });
  assert.deepEqual(model.students.map(({ name }) => name), ["Amy Alpha", "Zoe Zeta"]);
  assert.deepEqual(filterAssessmentStudents(model.students, { query: "zoe", type: "PRE" }).map(({ name }) => name), ["Zoe Zeta"]);
  assert.equal(filterAssessmentStudents(model.students, { query: "", type: "POST" }).length, 0);
});

test("availability distinguishes unconfigured, draft, published-empty, and published-with-submissions", () => {
  assert.equal(summarizeAssessmentAvailability({ exists: false }, null), "Not configured");
  assert.equal(summarizeAssessmentAvailability({ exists: true, published: false }, null), "Draft — results unavailable");
  assert.equal(summarizeAssessmentAvailability({ exists: true, published: true }, postPayload([])), "Published — no submitted attempts");
  assert.equal(summarizeAssessmentAvailability({ exists: true, published: true }, postPayload([result(student(1, "A", "B"))])), "Published — submissions available");
});

test("analytics model exposes no answer content or grading keys", () => {
  const raw = postPayload([{ ...result(student(1, "A", "B"), { isOfficial: true }), responses: [{ isCorrect: true, correctChoiceId: 9 }], explanation: "hidden" }]);
  const serialized = JSON.stringify(buildAssessmentAnalytics({ postPayload: raw }));
  for (const forbidden of ["responses", "isCorrect", "correctChoiceId", "explanation", "pointsEarned", "maxPoints"]) assert.equal(serialized.includes(forbidden), false);
});
