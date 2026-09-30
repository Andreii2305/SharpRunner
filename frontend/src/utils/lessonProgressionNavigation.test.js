import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssessmentHref,
  buildMapHref,
  buildModuleHref,
  createLessonProgressionViewModel,
  loadExactProgress,
  withExactClassroom,
} from "./lessonProgressionNavigation.js";

const lesson = (overrides = {}) => ({
  lessonKey: "arrays",
  curriculumPrerequisiteSatisfied: true,
  preRequired: true,
  preAssessmentId: 11,
  preUnlocked: true,
  preAttemptInProgress: false,
  preCompleted: false,
  moduleUnlocked: false,
  gameUnlocked: false,
  gameStarted: false,
  gameCompleted: false,
  postRequired: true,
  postAssessmentId: 12,
  postUnlocked: false,
  postAttemptInProgress: false,
  postCompleted: false,
  postPassingRequired: true,
  postPassed: false,
  postAttemptsRemaining: 3,
  postAttemptsExhausted: false,
  lessonCompleted: false,
  nextAction: "TAKE_PRE",
  ...overrides,
});

test("exact-classroom routes encode PRE, POST, module, map, and existing game queries", () => {
  assert.equal(
    buildAssessmentHref({ classroomId: 7, lessonKey: "functions-with-arrays", type: "PRE" }),
    "/classrooms/7/lessons/functions-with-arrays/assessment/pre",
  );
  assert.equal(
    buildAssessmentHref({ classroomId: 7, lessonKey: "arrays", type: "post" }),
    "/classrooms/7/lessons/arrays/assessment/post",
  );
  assert.equal(buildModuleHref(7, "arrays"), "/lesson/built-in/arrays?classroomId=7");
  assert.equal(buildMapHref(7), "/Map?classroomId=7");
  assert.equal(withExactClassroom("/array/level/1", 7), "/array/level/1?classroomId=7");
  assert.equal(withExactClassroom("/Map?region=arrays", 7), "/Map?region=arrays&classroomId=7");
});

test("required PRE is the only current action and keeps module and game locked", () => {
  const model = createLessonProgressionViewModel({
    lesson: lesson(),
    classroomId: 7,
    gameHref: "/array/level/1?classroomId=7",
  });

  assert.deepEqual(model.action, {
    kind: "assessment",
    label: "Take Pre-Test",
    href: "/classrooms/7/lessons/arrays/assessment/pre",
    disabled: false,
  });
  assert.deepEqual(model.steps.map(({ id, state }) => [id, state]), [
    ["pre", "current"],
    ["module", "locked"],
    ["game", "locked"],
    ["post", "locked"],
  ]);
});

test("completed PRE leads to module before game starts and then to the current game level", () => {
  const moduleModel = createLessonProgressionViewModel({
    lesson: lesson({
      preCompleted: true,
      moduleUnlocked: true,
      gameUnlocked: true,
      nextAction: "PLAY_GAME",
    }),
    classroomId: 7,
    gameHref: "/array/level/1?classroomId=7",
  });
  assert.equal(moduleModel.action.label, "Continue to Module");
  assert.equal(moduleModel.action.href, "/lesson/built-in/arrays?classroomId=7");
  assert.equal(moduleModel.steps.find(({ id }) => id === "module").state, "current");

  const gameModel = createLessonProgressionViewModel({
    lesson: lesson({
      preCompleted: true,
      moduleUnlocked: true,
      gameUnlocked: true,
      gameStarted: true,
      nextAction: "PLAY_GAME",
    }),
    classroomId: 7,
    gameHref: "/array/level/4?classroomId=7",
  });
  assert.equal(gameModel.action.label, "Continue Lesson");
  assert.equal(gameModel.action.href, "/array/level/4?classroomId=7");
});

test("game completion exposes authoritative POST actions without score inference", () => {
  for (const [nextAction, expectedLabel] of [
    ["TAKE_POST", "Take Post-Test"],
    ["RESUME_POST", "Continue Post-Test"],
    ["RETRY_POST", "Retry Post-Test"],
  ]) {
    const model = createLessonProgressionViewModel({
      lesson: lesson({
        preCompleted: true,
        moduleUnlocked: true,
        gameUnlocked: true,
        gameStarted: true,
        gameCompleted: true,
        postUnlocked: true,
        postAttemptInProgress: nextAction === "RESUME_POST",
        postCompleted: nextAction === "RETRY_POST",
        nextAction,
      }),
      classroomId: 7,
      gameHref: "/Map?classroomId=7",
    });
    assert.equal(model.action.label, expectedLabel);
    assert.equal(model.action.href, "/classrooms/7/lessons/arrays/assessment/post");
    assert.equal(model.steps.find(({ id }) => id === "post").state, "current");
  }
});

test("lesson completion and exhausted required POST remain distinct", () => {
  const complete = createLessonProgressionViewModel({
    lesson: lesson({
      preCompleted: true,
      moduleUnlocked: true,
      gameUnlocked: true,
      gameStarted: true,
      gameCompleted: true,
      postUnlocked: true,
      postCompleted: true,
      postPassed: true,
      postAttemptsRemaining: 2,
      lessonCompleted: true,
      nextAction: "LESSON_COMPLETE",
    }),
    classroomId: 7,
  });
  assert.deepEqual(complete.action, {
    kind: "complete",
    label: "Lesson Complete",
    href: "/Map?classroomId=7",
    disabled: false,
  });

  const exhausted = createLessonProgressionViewModel({
    lesson: lesson({
      preCompleted: true,
      moduleUnlocked: true,
      gameUnlocked: true,
      gameStarted: true,
      gameCompleted: true,
      postUnlocked: true,
      postCompleted: true,
      postAttemptsRemaining: 0,
      postAttemptsExhausted: true,
      nextAction: "POST_RECOVERY_REQUIRED",
    }),
    classroomId: 7,
  });
  assert.equal(exhausted.action.label, "Post-Test attempts exhausted");
  assert.equal(exhausted.action.href, null);
  assert.equal(exhausted.action.disabled, true);
  assert.equal(exhausted.lessonCompleted, false);
});

test("assessment-exempt tutorial and final never gain fake assessment steps", () => {
  for (const lessonKey of ["tutorial", "final"]) {
    const model = createLessonProgressionViewModel({
      lesson: lesson({
        lessonKey,
        preRequired: false,
        preAssessmentId: null,
        preCompleted: true,
        moduleUnlocked: true,
        gameUnlocked: true,
        postRequired: false,
        postAssessmentId: null,
        nextAction: "PLAY_GAME",
      }),
      classroomId: 7,
      gameHref: "/Map?classroomId=7",
    });
    assert.deepEqual(model.steps.map(({ id }) => id), ["module", "game"]);
  }
});

test("progress loading preserves an explicit classroom and resolves primary only when absent", async () => {
  const calls = [];
  const getProgress = async ({ classroomId }) => {
    calls.push(classroomId);
    return { classroomId, lessons: [] };
  };
  const resolvePrimary = async () => 99;
  assert.equal((await loadExactProgress({ requestedClassroomId: "7", getProgress, resolvePrimary })).classroomId, 7);
  assert.equal((await loadExactProgress({ requestedClassroomId: null, getProgress, resolvePrimary })).classroomId, 99);
  assert.deepEqual(calls, [7, 99]);
});

test("progress loading rejects malformed or substituted explicit classrooms", async () => {
  await assert.rejects(
    loadExactProgress({ requestedClassroomId: "bad", getProgress() {}, resolvePrimary() {} }),
    /Invalid classroom/,
  );
  await assert.rejects(
    loadExactProgress({ requestedClassroomId: "7", getProgress: async () => ({ classroomId: 8 }), resolvePrimary() {} }),
    /classroom mismatch/,
  );
});
