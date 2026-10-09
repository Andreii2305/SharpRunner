import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssessmentHref,
  buildAssessmentPageHref,
  buildAssessmentResultHref,
  buildMapHref,
  buildModuleHref,
  createLessonAssessmentAccessViewModel,
  createLessonProgressionViewModel,
  createLevelEntryViewModel,
  getLessonModuleAccess,
  isLevelAssessmentRestriction,
  loadExactProgress,
  resolveLevelAssessmentAction,
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

test("lesson module access disables only an authoritative lock and avoids invented hints", () => {
  assert.deepEqual(getLessonModuleAccess({ moduleUnlocked: false, nextAction: "TAKE_PRE" }), {
    canOpenModule: false,
    unlockHint: "Complete the Pre-Test to unlock this module.",
  });
  assert.deepEqual(getLessonModuleAccess({ moduleUnlocked: false, nextAction: "UNKNOWN_ACTION" }), {
    canOpenModule: false,
    unlockHint: null,
  });
  assert.deepEqual(getLessonModuleAccess({ progressPercent: 100 }), {
    canOpenModule: true,
    unlockHint: null,
  });
});

test("assessment page history uses stable results and returns retakes to the editable route", () => {
  const route = { classroomId: 7, lessonKey: "arrays", type: "POST" };
  assert.equal(
    buildAssessmentPageHref({ route, screen: "result", resultAttemptId: 302 }),
    "/classrooms/7/lessons/arrays/assessment/post/results/302",
  );
  assert.equal(
    buildAssessmentPageHref({ route, screen: "active", resultAttemptId: 302 }),
    "/classrooms/7/lessons/arrays/assessment/post",
  );
  assert.equal(buildAssessmentPageHref({ route, screen: "loading", resultAttemptId: 302 }), null);
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
  assert.equal(
    buildAssessmentResultHref({ classroomId: 7, lessonKey: "arrays", type: "POST", attemptId: 302 }),
    "/classrooms/7/lessons/arrays/assessment/post/results/302",
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
      preLatestSubmittedAttemptId: 201,
      moduleUnlocked: true,
      gameUnlocked: true,
      nextAction: "PLAY_GAME",
    }),
    classroomId: 7,
    gameHref: "/array/level/1?classroomId=7",
  });
  assert.equal(moduleModel.action.label, "Open Module");
  assert.equal(moduleModel.action.href, "/lesson/built-in/arrays?classroomId=7");
  assert.equal(moduleModel.steps.find(({ id }) => id === "module").state, "current");
  assert.deepEqual(moduleModel.steps.find(({ id }) => id === "pre").resultAction, {
    label: "View Result",
    href: "/classrooms/7/lessons/arrays/assessment/pre/results/201",
  });

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
  assert.equal(gameModel.action.label, "Continue Game");
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
        postLatestSubmittedAttemptId: nextAction === "RETRY_POST" ? 301 : null,
        nextAction,
      }),
      classroomId: 7,
      gameHref: "/Map?classroomId=7",
    });
    assert.equal(model.action.label, expectedLabel);
    assert.equal(model.action.href, "/classrooms/7/lessons/arrays/assessment/post");
    assert.equal(model.steps.find(({ id }) => id === "post").state, "current");
    if (nextAction === "RETRY_POST") {
      assert.deepEqual(model.steps.find(({ id }) => id === "post").resultAction, {
        label: "View Result",
        href: "/classrooms/7/lessons/arrays/assessment/post/results/301",
      });
    }
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
      postLatestSubmittedAttemptId: 302,
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
  assert.equal(
    complete.steps.find(({ id }) => id === "post").resultAction.href,
    "/classrooms/7/lessons/arrays/assessment/post/results/302",
  );

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
      postLatestSubmittedAttemptId: 303,
      nextAction: "POST_RECOVERY_REQUIRED",
    }),
    classroomId: 7,
  });
  assert.equal(exhausted.action.label, "Post-Test attempts exhausted");
  assert.equal(exhausted.action.href, null);
  assert.equal(exhausted.action.disabled, true);
  assert.equal(exhausted.lessonCompleted, false);
  assert.equal(exhausted.steps.find(({ id }) => id === "post").resultAction.label, "View Result");
});

test("unpublished historical assessments keep result actions without restoring take actions", () => {
  const model = createLessonProgressionViewModel({
    lesson: lesson({
      preRequired: false,
      preAssessmentId: null,
      preCompleted: false,
      preLatestSubmittedAttemptId: 201,
      postRequired: false,
      postAssessmentId: null,
      postCompleted: false,
      postLatestSubmittedAttemptId: 302,
      moduleUnlocked: true,
      gameUnlocked: true,
      nextAction: "PLAY_GAME",
    }),
    classroomId: 7,
    gameHref: "/array/level/1?classroomId=7",
  });

  assert.deepEqual(model.steps.filter(({ resultAction }) => resultAction).map(({ id }) => id), ["pre", "post"]);
  assert.equal(model.action.kind, "module");
});

test("lesson cards expose stable submitted PRE and POST results without score data", () => {
  const model = createLessonAssessmentAccessViewModel({
    lesson: lesson({
      preRequired: false,
      preAssessmentId: null,
      preCompleted: false,
      preLatestSubmittedAttemptId: 201,
      postRequired: false,
      postAssessmentId: null,
      postCompleted: false,
      postLatestSubmittedAttemptId: 302,
      nextAction: "PLAY_GAME",
      score: 99,
      percentage: 99,
      postPassed: true,
    }),
    classroomId: 7,
  });

  assert.deepEqual(model, {
    rows: [
      {
        type: "PRE",
        label: "Pre-Test",
        status: "Completed",
        action: null,
        resultAction: {
          label: "View Result",
          href: "/classrooms/7/lessons/arrays/assessment/pre/results/201",
        },
      },
      {
        type: "POST",
        label: "Post-Test",
        status: "Completed",
        action: null,
        resultAction: {
          label: "View Result",
          href: "/classrooms/7/lessons/arrays/assessment/post/results/302",
        },
      },
    ],
  });
  assert.equal(JSON.stringify(model).includes("99"), false);
  assert.equal(JSON.stringify(model).includes("passed"), false);
});

test("lesson card assessment actions follow authoritative nextAction and attempt state", () => {
  const available = createLessonAssessmentAccessViewModel({ lesson: lesson(), classroomId: 7 });
  assert.deepEqual(available.rows.find(({ type }) => type === "PRE"), {
    type: "PRE",
    label: "Pre-Test",
    status: "Available",
    resultAction: null,
    action: {
      label: "Take Test",
      href: "/classrooms/7/lessons/arrays/assessment/pre",
    },
  });
  assert.equal(available.rows.find(({ type }) => type === "POST").status, "Locked");

  const inProgress = createLessonAssessmentAccessViewModel({
    lesson: lesson({ preAttemptInProgress: true, nextAction: "RESUME_PRE" }),
    classroomId: 7,
  });
  assert.equal(inProgress.rows[0].status, "In Progress");
  assert.equal(inProgress.rows[0].action.label, "Continue");

  const retry = createLessonAssessmentAccessViewModel({
    lesson: lesson({
      preCompleted: true,
      postUnlocked: true,
      postCompleted: true,
      postLatestSubmittedAttemptId: 301,
      postAttemptsRemaining: 2,
      nextAction: "RETRY_POST",
    }),
    classroomId: 7,
  });
  const post = retry.rows.find(({ type }) => type === "POST");
  assert.equal(post.status, "Available");
  assert.equal(post.action.label, "Retry");
  assert.equal(post.resultAction.href, "/classrooms/7/lessons/arrays/assessment/post/results/301");
});

test("lesson card assessment model fails closed for absent or incomplete progression", () => {
  assert.deepEqual(createLessonAssessmentAccessViewModel({
    lesson: lesson({
      preRequired: false,
      preAssessmentId: null,
      postRequired: false,
      postAssessmentId: null,
      nextAction: "PLAY_GAME",
    }),
    classroomId: 7,
  }), { rows: [] });

  const incomplete = createLessonAssessmentAccessViewModel({
    lesson: lesson({
      preAssessmentId: null,
      preUnlocked: true,
      nextAction: "TAKE_PRE",
    }),
    classroomId: 7,
  });
  assert.equal(incomplete.rows[0].status, "Not Started");
  assert.equal(incomplete.rows[0].action, null);
  assert.equal(incomplete.rows[0].resultAction, null);
  assert.equal(JSON.stringify(incomplete).includes("null/lessons"), false);
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

test("level assessment actions accept only the six canonical action/type pairs", () => {
  const cases = [
    ["TAKE_PRE", "PRE", "Take Pre-Test"],
    ["RESUME_PRE", "PRE", "Continue Pre-Test"],
    ["TAKE_POST", "POST", "Take Post-Test"],
    ["RESUME_POST", "POST", "Continue Post-Test"],
    ["RETRY_POST", "POST", "Retry Post-Test"],
  ];
  for (const [assessmentAction, assessmentType, label] of cases) {
    assert.deepEqual(resolveLevelAssessmentAction({
      classroomId: 7,
      level: {
        lessonKey: "arrays",
        assessmentRequired: true,
        assessmentType,
        assessmentId: 81,
        assessmentAction,
      },
    }), {
      kind: "assessment",
      href: `/classrooms/7/lessons/arrays/assessment/${assessmentType.toLowerCase()}`,
      label,
      routable: true,
    }, assessmentAction);
  }

  assert.deepEqual(resolveLevelAssessmentAction({
    classroomId: 7,
    level: {
      lessonKey: "functions-with-arrays",
      assessmentRequired: true,
      assessmentType: "POST",
      assessmentId: 82,
      assessmentAction: "POST_RECOVERY_REQUIRED",
    },
  }), {
    kind: "recovery",
    href: null,
    label: "Post-Test attempts exhausted — contact your teacher",
    routable: false,
  });
});

test("level assessment actions fail closed for malformed or injected metadata", () => {
  const valid = {
    lessonKey: "arrays",
    assessmentRequired: true,
    assessmentType: "PRE",
    assessmentId: 81,
    assessmentAction: "TAKE_PRE",
  };
  for (const overrides of [
    { classroomId: 0 },
    { classroomId: "bad" },
    { level: { ...valid, lessonKey: "tutorial" } },
    { level: { ...valid, lessonKey: "final" } },
    { level: { ...valid, assessmentId: null } },
    { level: { ...valid, assessmentAction: "TAKE_POST" } },
    { level: { ...valid, assessmentType: "POST" } },
    { level: { ...valid, assessmentAction: "UNKNOWN" } },
    { level: { ...valid, assessmentRequired: false } },
    { level: { ...valid, redirectUrl: "https://evil.example" } },
  ]) {
    const input = {
      classroomId: 7,
      level: valid,
      ...overrides,
    };
    if (overrides.level?.redirectUrl) {
      assert.equal(resolveLevelAssessmentAction(input)?.href.includes("evil.example"), false);
    } else {
      assert.equal(resolveLevelAssessmentAction(input), null);
    }
  }
});

test("stale restriction payloads use exact-classroom canonical routes and ignore server navigation text", () => {
  const restriction = {
    lessonKey: "functions-with-arrays",
    assessmentRequired: true,
    assessmentType: "POST",
    assessmentId: 82,
    assessmentAction: "RESUME_POST",
    accessReason: "POST_ASSESSMENT_REQUIRED",
    message: "Open https://evil.example instead",
    redirectUrl: "https://evil.example/steal",
  };

  assert.deepEqual(resolveLevelAssessmentAction({ classroomId: 41, level: restriction }), {
    kind: "assessment",
    href: "/classrooms/41/lessons/functions-with-arrays/assessment/post",
    label: "Continue Post-Test",
    routable: true,
  });
  assert.equal(
    resolveLevelAssessmentAction({
      classroomId: 41,
      level: { ...restriction, lessonKey: "tutorial" },
    }),
    null,
  );
  assert.equal(
    resolveLevelAssessmentAction({
      classroomId: 41,
      level: { ...restriction, assessmentType: "PRE" },
    }),
    null,
  );

  const recovery = resolveLevelAssessmentAction({
    classroomId: 41,
    level: {
      ...restriction,
      assessmentAction: "POST_RECOVERY_REQUIRED",
      redirectUrl: "https://evil.example/recovery",
    },
  });
  assert.equal(recovery?.kind, "recovery");
  assert.equal(recovery?.routable, false);
  assert.equal(recovery?.href, null);
});

test("stale invalid-state payloads recognize the backend code field", () => {
  assert.equal(isLevelAssessmentRestriction({
    code: "ASSESSMENT_STATE_INVALID",
    assessmentRequired: false,
    assessmentType: null,
    assessmentId: null,
    assessmentAction: null,
  }), true);
  assert.equal(isLevelAssessmentRestriction({ code: "LEVEL_LOCKED" }), false);
});

test("level entry view model makes debt authoritative without losing completion", () => {
  const debt = createLevelEntryViewModel({
    classroomId: 7,
    level: {
      lessonKey: "arrays",
      isCompleted: true,
      isAccessible: false,
      assessmentRequired: true,
      assessmentType: "PRE",
      assessmentId: 81,
      assessmentAction: "TAKE_PRE",
    },
    gameHref: "/array/level/1?classroomId=7",
  });
  assert.equal(debt.kind, "assessment");
  assert.equal(debt.visualStatus, "assessment-required");
  assert.equal(debt.completed, true);
  assert.equal(debt.href, "/classrooms/7/lessons/arrays/assessment/pre");

  const replay = createLevelEntryViewModel({
    classroomId: 7,
    level: { lessonKey: "arrays", isCompleted: true, isAccessible: true },
    gameHref: "/array/level/1?classroomId=7",
  });
  assert.equal(replay.kind, "game");
  assert.equal(replay.visualStatus, "completed");
  assert.equal(replay.href, "/array/level/1?classroomId=7");
});
