import assert from "node:assert/strict";
import test from "node:test";
import {
  createAssessmentResultModel,
  resolveAssessmentNextHref,
} from "./assessmentResultModel.js";

const route = { classroomId: 47, lessonKey: "arrays", type: "POST" };
const resultEnvelope = (overrides = {}) => ({
  result: {
    attemptId: 312,
    type: "POST",
    status: "SUBMITTED",
    attemptNumber: 1,
    submittedAt: "2026-09-29T01:00:00.000Z",
    scoreVisible: true,
    pointsEarned: 7,
    maxPoints: 10,
    percentage: 70,
    passed: false,
    ...overrides.result,
  },
  attempts: { used: 1, max: 3, remaining: 2, ...overrides.attempts },
  reviewAvailable: false,
  ...overrides,
});
const progression = (lessonOverrides = {}, summaryOverrides = {}) => ({
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
    ...lessonOverrides,
  }],
  summary: {
    nextAction: "RETRY_POST",
    nextActionLessonKey: "arrays",
    ...summaryOverrides,
  },
});
test("POST policy states come only from authoritative passed and progression fields", () => {
  assert.equal(createAssessmentResultModel({ envelope: resultEnvelope(), progression: progression(), route }).state, "RETRY_AVAILABLE");
  assert.equal(createAssessmentResultModel({
    envelope: resultEnvelope({ result: { passed: true, percentage: 10 } }),
    progression: progression({ postPassed: true, postAttemptsRemaining: 2 }, { nextAction: "TAKE_PRE", nextActionLessonKey: "functions" }),
    route,
  }).state, "PASSED");
  assert.equal(createAssessmentResultModel({
    envelope: resultEnvelope({ attempts: { remaining: 99 } }),
    progression: progression({ postAttemptsRemaining: 0, postAttemptsExhausted: true }, { nextAction: "POST_RECOVERY_REQUIRED" }),
    route,
  }).state, "EXHAUSTED");
  assert.equal(createAssessmentResultModel({
    envelope: resultEnvelope({ result: { passed: false } }),
    progression: progression({ postPassingRequired: false, postCompleted: true, lessonCompleted: true }, { nextAction: "LESSON_COMPLETE" }),
    route,
  }).state, "COMPLETED");
});

test("hidden numeric fields stay absent while the server passed boolean remains usable", () => {
  const envelope = resultEnvelope({
    result: {
      scoreVisible: false,
      passed: true,
      pointsEarned: undefined,
      maxPoints: undefined,
      percentage: undefined,
    },
  });
  const model = createAssessmentResultModel({
    envelope,
    progression: progression({ postPassed: true }),
    route,
  });
  assert.equal(model.state, "PASSED");
  assert.equal(model.score, null);
});

test("latest, official-best, first POST, and supplied learning gain stay distinct without client arithmetic", () => {
  const envelope = resultEnvelope({
    officialGrade: { attemptId: 300, attemptNumber: 1, percentage: 90 },
    firstPost: { attemptId: 300, attemptNumber: 1, percentage: 90 },
    prePercentage: 40,
    learningGain: {
      value: 50,
      unit: "percentage_points",
      label: "Learning gain from PRE to first POST",
      firstPostPercentage: 90,
      prePercentage: 40,
    },
  });
  const model = createAssessmentResultModel({ envelope, progression: progression(), route });
  assert.equal(model.score.percentage, 70);
  assert.equal(model.officialGrade.percentage, 90);
  assert.equal(model.firstPost.percentage, 90);
  assert.strictEqual(model.learningGain, envelope.learningGain);
});

test("next-action routing maps only known server actions and fails safely to the exact-classroom map", () => {
  assert.equal(resolveAssessmentNextHref({
    nextAction: "TAKE_PRE",
    nextActionLessonKey: "functions",
    route,
  }), "/classrooms/47/lessons/functions/assessment/pre");
  assert.equal(resolveAssessmentNextHref({
    nextAction: "RESUME_POST",
    nextActionLessonKey: "arrays",
    route,
  }), "/classrooms/47/lessons/arrays/assessment/post");
  assert.equal(resolveAssessmentNextHref({ nextAction: "UNKNOWN", route }), "/Map?classroomId=47");
  assert.equal(resolveAssessmentNextHref({ nextAction: "PLAY_GAME", route }), "/Map?classroomId=47");
});

test("PRE continuation uses only the refreshed target lesson action", () => {
  const preRoute = { ...route, type: "PRE" };
  const preEnvelope = resultEnvelope({
    result: { type: "PRE", passed: undefined, baselineEligible: false },
  });
  for (const [nextAction, label] of [
    ["TAKE_POST", "Continue to Post-Test"],
    ["RESUME_POST", "Continue Post-Test"],
    ["RETRY_POST", "Retry Post-Test"],
  ]) {
    const model = createAssessmentResultModel({
      envelope: preEnvelope,
      progression: progression(
        { nextAction, moduleUnlocked: true },
        { nextAction: "TAKE_PRE", nextActionLessonKey: "functions" },
      ),
      route: preRoute,
    });
    assert.deepEqual(model.continuation, {
      kind: "assessment",
      label,
      href: "/classrooms/47/lessons/arrays/assessment/post",
      disabled: false,
    });
  }

  const ordinary = createAssessmentResultModel({
    envelope: preEnvelope,
    progression: progression(
      { nextAction: "PLAY_GAME", moduleUnlocked: true },
      { nextAction: "TAKE_POST", nextActionLessonKey: "functions" },
    ),
    route: preRoute,
  });
  assert.equal(ordinary.continuation.kind, "module");
  assert.equal(ordinary.continuation.label, "Continue to module");

  const recovery = createAssessmentResultModel({
    envelope: preEnvelope,
    progression: progression({ nextAction: "POST_RECOVERY_REQUIRED" }),
    route: preRoute,
  });
  assert.deepEqual(recovery.continuation, {
    kind: "recovery",
    label: "Post-Test attempts exhausted — contact your teacher",
    href: null,
    disabled: true,
  });
});
