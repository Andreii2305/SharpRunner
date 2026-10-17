import assert from "node:assert/strict";
import test from "node:test";
import {
  createLessonMapViewModel,
  createMapLevelEntry,
  initialMapProgressState,
  mapProgressReducer,
} from "./lessonMapViewModel.js";

const lesson = (lessonKey, overrides = {}) => ({
  lessonKey,
  lessonTitle: lessonKey,
  completedLevels: 0,
  totalLevels: 1,
  progressPercent: 0,
  curriculumPrerequisiteSatisfied: true,
  moduleUnlocked: true,
  gameUnlocked: true,
  gameStarted: true,
  gameCompleted: false,
  lessonCompleted: false,
  nextAction: "PLAY_GAME",
  ...overrides,
});

const level = (lessonKey, levelNumber, overrides = {}) => ({
  levelKey: `${lessonKey}-level-${levelNumber}`,
  lessonKey,
  levelNumber,
  isAccessible: true,
  isCompleted: false,
  progressPercent: 0,
  ...overrides,
});

const progress = (overrides = {}) => ({
  classroomId: 7,
  levels: [level("arrays", 1)],
  lessons: [
    lesson("tutorial", { completedLevels: 5, totalLevels: 5, progressPercent: 100, gameCompleted: true, lessonCompleted: true, nextAction: "LESSON_COMPLETE" }),
    lesson("arrays"),
    lesson("functions", { gameUnlocked: false, moduleUnlocked: false, curriculumPrerequisiteSatisfied: false, nextAction: "COMPLETE_PREREQUISITE_LESSON" }),
    lesson("functions-with-arrays", { gameUnlocked: false, moduleUnlocked: false, curriculumPrerequisiteSatisfied: false, nextAction: "COMPLETE_PREREQUISITE_LESSON" }),
    lesson("final", { gameUnlocked: false, moduleUnlocked: false, curriculumPrerequisiteSatisfied: false, nextAction: "COMPLETE_PREREQUISITE_LESSON" }),
  ],
  summary: {
    totalLevels: 29,
    totalLevelsCleared: 5,
    overallProgress: 17,
    nextAction: "PLAY_GAME",
    nextActionLessonKey: "arrays",
  },
  ...overrides,
});

test("the authoritative next step is independent from the selected map region", () => {
  const tutorialSelected = createLessonMapViewModel(progress(), { selectedRegion: "tutorial" });
  const functionsSelected = createLessonMapViewModel(progress(), { selectedRegion: "functions" });

  assert.equal(tutorialSelected.status, "ready");
  assert.equal(tutorialSelected.nextStep.lessonKey, "arrays");
  assert.deepEqual(tutorialSelected.nextStep.action, {
    kind: "game",
    label: "Continue Game",
    href: "/array/level/1?classroomId=7",
    disabled: false,
  });
  assert.equal(functionsSelected.nextStep.action.href, tutorialSelected.nextStep.action.href);
  assert.equal(functionsSelected.selectedRegion, "functions");
});

test("assessment, module, and blocked next steps keep authoritative destinations", () => {
  const postLesson = lesson("arrays", {
    gameCompleted: true,
    postUnlocked: true,
    nextAction: "TAKE_POST",
  });
  const post = createLessonMapViewModel(progress({
    lessons: progress().lessons.map((row) => row.lessonKey === "arrays" ? postLesson : row),
    summary: { ...progress().summary, nextAction: "TAKE_POST" },
  }));
  assert.equal(post.nextStep.action.href, "/classrooms/7/lessons/arrays/assessment/post");

  const moduleLesson = lesson("arrays", { gameStarted: false });
  const module = createLessonMapViewModel(progress({
    lessons: progress().lessons.map((row) => row.lessonKey === "arrays" ? moduleLesson : row),
  }));
  assert.equal(module.nextStep.action.label, "Open Module");
  assert.equal(module.nextStep.action.href, "/lesson/built-in/arrays?classroomId=7");

  const blockedLesson = lesson("functions", {
    curriculumPrerequisiteSatisfied: false,
    moduleUnlocked: false,
    gameUnlocked: false,
    gameStarted: false,
    nextAction: "COMPLETE_PREREQUISITE_LESSON",
  });
  const blocked = createLessonMapViewModel(progress({
    lessons: progress().lessons.map((row) => row.lessonKey === "functions" ? blockedLesson : row),
    summary: {
      ...progress().summary,
      nextAction: "COMPLETE_PREREQUISITE_LESSON",
      nextActionLessonKey: "functions",
    },
  }));
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.nextStep.action.href, null);
  assert.equal(blocked.nextStep.action.disabled, true);
});

test("summary and lesson action disagreement fails closed without a speculative route", () => {
  const mismatched = progress({
    summary: {
      totalLevels: 29,
      totalLevelsCleared: 5,
      overallProgress: 17,
      nextAction: "TAKE_POST",
      nextActionLessonKey: "arrays",
    },
  });
  const model = createLessonMapViewModel(mismatched);

  assert.equal(model.status, "unavailable");
  assert.equal(model.nextStep.action, null);
  assert.equal(model.nextStep.canRetry, true);
});

test("missing authoritative lesson eligibility fails closed", () => {
  const model = createLessonMapViewModel(progress({
    lessons: progress().lessons.map((row) => row.lessonKey === "arrays"
      ? { ...row, gameUnlocked: undefined }
      : row),
  }));

  assert.equal(model.status, "unavailable");
  assert.equal(model.nextStep.action, null);
});

test("Region IV combines Functions with Arrays and Final Challenge using activity totals", () => {
  const data = progress({
    levels: [level("final", 1)],
    lessons: progress().lessons.map((row) => {
      if (row.lessonKey === "functions-with-arrays") {
        return lesson(row.lessonKey, { completedLevels: 3, totalLevels: 4, progressPercent: 75 });
      }
      if (row.lessonKey === "final") {
        return lesson(row.lessonKey, { completedLevels: 0, totalLevels: 1, progressPercent: 40 });
      }
      return row;
    }),
    summary: {
      totalLevels: 29,
      totalLevelsCleared: 27,
      overallProgress: 93,
      nextAction: "PLAY_GAME",
      nextActionLessonKey: "final",
    },
  });
  const model = createLessonMapViewModel(data);

  assert.deepEqual(model.regions["functions-arrays"], {
    completedCount: 3,
    totalCount: 5,
    progressPercent: 68,
    countText: "3 of 5 game activities completed",
    percentageText: "68%",
    availability: "available",
    hasApplicableActivities: true,
  });
  assert.equal(model.nextStep.action.href, "/function-with-array/level/5?classroomId=7");
});

test("Region IV ignores a zero-activity lesson when weighting partial progress", () => {
  const model = createLessonMapViewModel(progress({
    levels: [level("final", 1)],
    lessons: progress().lessons.map((row) => {
      if (row.lessonKey === "functions-with-arrays") {
        return lesson(row.lessonKey, {
          completedLevels: 0,
          totalLevels: 0,
          progressPercent: null,
          gameUnlocked: false,
        });
      }
      if (row.lessonKey === "final") {
        return lesson(row.lessonKey, { completedLevels: 0, totalLevels: 1, progressPercent: 45 });
      }
      return row;
    }),
    summary: {
      ...progress().summary,
      nextActionLessonKey: "final",
    },
  }));

  assert.equal(model.regions["functions-arrays"].totalCount, 1);
  assert.equal(model.regions["functions-arrays"].progressPercent, 45);
  assert.equal(model.regions["functions-arrays"].countText, "0 of 1 game activity completed");
});

test("zero, missing, and malformed lesson totals are not displayed as zero progress", () => {
  const rows = progress().lessons
    .filter((row) => row.lessonKey !== "functions")
    .map((row) => row.lessonKey === "arrays"
      ? { ...row, completedLevels: 0, totalLevels: 0, progressPercent: null }
      : row.lessonKey === "tutorial"
        ? { ...row, totalLevels: "five" }
        : row);
  const model = createLessonMapViewModel(progress({ lessons: rows }));

  assert.equal(model.regions.arrays.countText, "No assigned game activities");
  assert.equal(model.regions.arrays.progressPercent, null);
  assert.equal(model.regions.tutorial.countText, "Progress unavailable");
  assert.equal(model.regions.functions.countText, "Progress unavailable");
});

test("a valid response distinguishes unassigned nodes from prerequisite-locked nodes", () => {
  const model = createLessonMapViewModel(progress({
    levels: [level("arrays", 1, { isAccessible: false, lockReason: "prerequisite" })],
    lessons: progress().lessons.map((row) => row.lessonKey === "arrays"
      ? { ...row, gameStarted: false }
      : row),
  }));

  assert.equal(createMapLevelEntry(model, "arrays-level-1", "/array/level/1").visualStatus, "locked");
  const unassigned = createMapLevelEntry(model, "arrays-level-2", "/array/level/2");
  assert.equal(unassigned.visualStatus, "unassigned");
  assert.equal(unassigned.label, "Not assigned");
  assert.equal(unassigned.disabled, true);
});

test("missing lesson projection and inconsistent level totals do not become unassigned nodes", () => {
  const missingLesson = createLessonMapViewModel(progress({
    levels: [],
    lessons: progress().lessons.filter((row) => row.lessonKey !== "arrays"),
  }));
  assert.equal(
    createMapLevelEntry(missingLesson, "arrays-level-1", "/array/level/1").visualStatus,
    "unavailable",
  );

  const incompleteProjection = createLessonMapViewModel(progress({
    levels: [level("arrays", 1)],
    lessons: progress().lessons.map((row) => row.lessonKey === "arrays"
      ? { ...row, totalLevels: 2 }
      : row),
  }));
  assert.equal(
    createMapLevelEntry(incompleteProjection, "arrays-level-2", "/array/level/2").visualStatus,
    "unavailable",
  );
});

test("a canonical zero-activity lesson can mark its fixed map geometry unassigned", () => {
  const model = createLessonMapViewModel(progress({
    levels: [],
    lessons: progress().lessons.map((row) => row.lessonKey === "arrays"
      ? { ...row, completedLevels: 0, totalLevels: 0, progressPercent: null, gameStarted: false }
      : row),
  }));

  assert.equal(
    createMapLevelEntry(model, "arrays-level-1", "/array/level/1").visualStatus,
    "unassigned",
  );
});

test("malformed responses never turn absent activities into unassigned nodes", () => {
  const model = createLessonMapViewModel(progress({ levels: null }));
  const entry = createMapLevelEntry(model, "arrays-level-2", "/array/level/2");

  assert.equal(model.status, "unavailable");
  assert.equal(entry.visualStatus, "unavailable");
  assert.equal(entry.label, "Availability unavailable");
});

test("missing summary totals make the map unavailable instead of implying zero progress", () => {
  const model = createLessonMapViewModel(progress({
    summary: {
      nextAction: "PLAY_GAME",
      nextActionLessonKey: "arrays",
    },
  }));

  assert.equal(model.status, "unavailable");
  assert.equal(model.nextStep.action, null);
  assert.equal(model.nextStep.canRetry, true);
});

test("a confirmed zero-activity completed curriculum has an explicit empty state", () => {
  const model = createLessonMapViewModel(progress({
    lessons: progress().lessons.map((row) => ({
      ...row,
      completedLevels: 0,
      totalLevels: 0,
      progressPercent: null,
      lessonCompleted: true,
      nextAction: "LESSON_COMPLETE",
    })),
    levels: [],
    summary: {
      totalLevels: 0,
      totalLevelsCleared: 0,
      overallProgress: null,
      nextAction: "LESSON_COMPLETE",
      nextActionLessonKey: null,
    },
  }));

  assert.equal(model.status, "empty");
  assert.equal(model.nextStep.action, null);
});

test("completed curriculum is explicit and exposes no invented continuation", () => {
  const completed = progress({
    levels: [level("arrays", 1, { isCompleted: true })],
    lessons: progress().lessons.map((row) => ({
      ...row,
      completedLevels: row.totalLevels,
      progressPercent: row.totalLevels === 0 ? null : 100,
      gameCompleted: true,
      lessonCompleted: true,
      nextAction: "LESSON_COMPLETE",
    })),
    summary: {
      totalLevels: 9,
      totalLevelsCleared: 9,
      overallProgress: 100,
      nextAction: "LESSON_COMPLETE",
      nextActionLessonKey: null,
    },
  });
  const model = createLessonMapViewModel(completed);

  assert.equal(model.status, "completed");
  assert.equal(model.nextStep.action, null);
});

test("curriculum completion requires complete canonical lesson projections", () => {
  const completed = progress({
    levels: [],
    lessons: progress().lessons.map((row) => ({
      ...row,
      completedLevels: row.totalLevels,
      progressPercent: row.totalLevels === 0 ? null : 100,
      gameCompleted: true,
      lessonCompleted: true,
      nextAction: "LESSON_COMPLETE",
    })),
    summary: {
      ...progress().summary,
      totalLevels: 9,
      totalLevelsCleared: 9,
      nextAction: "LESSON_COMPLETE",
      nextActionLessonKey: null,
    },
  });

  const missingLesson = createLessonMapViewModel({
    ...completed,
    lessons: completed.lessons.filter((row) => row.lessonKey !== "final"),
  });
  assert.equal(missingLesson.status, "unavailable");
  assert.equal(missingLesson.nextStep.action, null);

  const incompleteLesson = createLessonMapViewModel({
    ...completed,
    lessons: completed.lessons.map((row) => row.lessonKey === "final"
      ? { ...row, lessonCompleted: false, nextAction: "PLAY_GAME" }
      : row),
  });
  assert.equal(incompleteLesson.status, "unavailable");
  assert.equal(incompleteLesson.nextStep.action, null);
});

test("completed accessible nodes retain an explicit replay route", () => {
  const model = createLessonMapViewModel(progress({
    levels: [level("arrays", 1, { isCompleted: true }), level("arrays", 2)],
    lessons: progress().lessons.map((row) => row.lessonKey === "arrays"
      ? { ...row, completedLevels: 1, totalLevels: 2, progressPercent: 50 }
      : row),
  }));
  const entry = createMapLevelEntry(model, "arrays-level-1", "/array/level/1?classroomId=7");

  assert.equal(entry.label, "Replay level");
  assert.equal(entry.href, "/array/level/1?classroomId=7");
  assert.equal(entry.disabled, false);
});

test("teacher-authorized POST remediation keeps retry primary and relabels completed nodes for practice", () => {
  const data = progress({
    levels: [level("arrays", 1, {
      isCompleted: true,
      isAccessible: true,
      accessReason: "POST_REMEDIATION_REPLAY",
    })],
    lessons: progress().lessons.map((row) => row.lessonKey === "arrays"
      ? {
          ...row,
          completedLevels: 1,
          totalLevels: 1,
          progressPercent: 100,
          gameCompleted: true,
          postRequired: true,
          postCompleted: true,
          postPassingRequired: true,
          postPassed: false,
          postAttemptsRemaining: 1,
          nextAction: "RETRY_POST",
        }
      : row),
    summary: {
      ...progress().summary,
      nextAction: "RETRY_POST",
      nextActionLessonKey: "arrays",
    },
  });
  const model = createLessonMapViewModel(data);
  const entry = createMapLevelEntry(model, "arrays-level-1", "/array/level/1?classroomId=7");

  assert.equal(model.nextStep.progression.action.label, "Retry Post-Test");
  assert.equal(entry.label, "Practice level");
  assert.equal(entry.href, "/array/level/1?classroomId=7");
  assert.equal(entry.disabled, false);
});

test("completed nodes without authoritative access remain locked", () => {
  const model = createLessonMapViewModel(progress({
    levels: [
      level("arrays", 1, { isCompleted: true, isAccessible: false }),
      level("arrays", 2),
    ],
    lessons: progress().lessons.map((row) => row.lessonKey === "arrays"
      ? { ...row, completedLevels: 1, totalLevels: 2, progressPercent: 50 }
      : row),
  }));
  const entry = createMapLevelEntry(model, "arrays-level-1", "/array/level/1?classroomId=7");

  assert.equal(entry.visualStatus, "locked");
  assert.equal(entry.href, null);
  assert.equal(entry.disabled, true);
});

test("map request state clears stale classroom actions and fences late responses", () => {
  const startedOne = mapProgressReducer(initialMapProgressState, {
    type: "load-started",
    generation: 1,
    requestKey: "classroom:7",
  });
  const readyOne = mapProgressReducer(startedOne, {
    type: "load-succeeded",
    generation: 1,
    requestKey: "classroom:7",
    progress: progress(),
  });
  const startedTwo = mapProgressReducer(readyOne, {
    type: "load-started",
    generation: 2,
    requestKey: "classroom:9",
  });
  const stale = mapProgressReducer(startedTwo, {
    type: "load-succeeded",
    generation: 1,
    requestKey: "classroom:7",
    progress: progress(),
  });

  assert.equal(startedTwo.status, "loading");
  assert.equal(startedTwo.progress, null);
  assert.equal(stale, startedTwo);
});

test("request failure and confirmed unenrollment remain distinct retry states", () => {
  const loading = mapProgressReducer(initialMapProgressState, {
    type: "load-started",
    generation: 1,
    requestKey: "primary",
  });
  const failed = mapProgressReducer(loading, {
    type: "load-failed",
    generation: 1,
    requestKey: "primary",
    error: "Progress could not be loaded.",
  });
  const unenrolled = mapProgressReducer(loading, {
    type: "load-unenrolled",
    generation: 1,
    requestKey: "primary",
  });

  assert.equal(failed.status, "error");
  assert.equal(failed.canRetry, true);
  assert.equal(unenrolled.status, "unenrolled");
  assert.equal(unenrolled.canRetry, false);
});
