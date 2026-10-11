import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLessonCards,
  createLessonNextStepViewModel,
  initialLessonProgressionState,
  lessonProgressionReducer,
} from "./lessonSectionState.js";

const meta = [
  { lessonKey: "arrays", fallbackTitle: "Arrays", region: "Barangay Malumay", route: "/lesson/built-in/arrays" },
  { lessonKey: "functions", fallbackTitle: "Functions", region: "Kapre's Trail", route: "/lesson/built-in/functions" },
];

const lesson = (overrides = {}) => ({
  lessonKey: "arrays",
  lessonTitle: "Arrays",
  progressPercent: 100,
  curriculumPrerequisiteSatisfied: true,
  moduleUnlocked: true,
  gameUnlocked: true,
  gameStarted: true,
  gameCompleted: true,
  lessonCompleted: true,
  nextAction: "LESSON_COMPLETE",
  ...overrides,
});

test("outstanding required POST keeps a game-complete lesson in progress", () => {
  const [card] = buildLessonCards({
    lessonMeta: meta,
    progressLessons: [lesson({
      postRequired: true,
      postAssessmentId: 18,
      postUnlocked: true,
      postCompleted: false,
      postPassingRequired: true,
      postPassed: false,
      lessonCompleted: false,
      nextAction: "TAKE_POST",
    })],
    classroomId: 7,
  });

  assert.equal(card.status, "active");
  assert.equal(card.statusLabel, "In progress");
  assert.equal(card.progress, 100);
  assert.equal(card.assessmentModel.rows[0].action.href, "/classrooms/7/lessons/arrays/assessment/post");
});

test("missing eligibility is blocked instead of inferred from percentage or order", () => {
  const cards = buildLessonCards({
    lessonMeta: meta,
    progressLessons: [
      lesson({ moduleUnlocked: undefined, gameUnlocked: undefined, lessonCompleted: false, nextAction: "PLAY_GAME" }),
      lesson({ lessonKey: "functions", lessonTitle: "Functions", progressPercent: 0, curriculumPrerequisiteSatisfied: undefined, moduleUnlocked: undefined, gameUnlocked: undefined, gameStarted: false, gameCompleted: false, lessonCompleted: false, nextAction: undefined }),
    ],
    classroomId: 7,
  });

  assert.equal(cards[0].status, "blocked");
  assert.equal(cards[0].canOpenModule, false);
  assert.equal(cards[0].availabilityMessage, "Availability could not be confirmed.");
  assert.equal(cards[1].status, "blocked");
  assert.equal(cards[1].canOpenModule, false);
});

test("module, game, and lesson eligibility remain distinct", () => {
  const [card] = buildLessonCards({
    lessonMeta: meta,
    progressLessons: [lesson({
      progressPercent: 35,
      moduleUnlocked: true,
      gameUnlocked: false,
      gameStarted: false,
      gameCompleted: false,
      lessonCompleted: false,
      nextAction: "PLAY_GAME",
    })],
    classroomId: 7,
  });

  assert.equal(card.canOpenModule, true);
  assert.equal(card.canOpenGame, false);
  assert.equal(card.status, "available");
});

test("zero-activity progression rows retain authoritative module and result access", () => {
  const [card] = buildLessonCards({
    lessonMeta: meta,
    progressLessons: [lesson({
      progressPercent: null,
      totalLevels: 0,
      completedLevels: 0,
      preRequired: false,
      preAssessmentId: null,
      preLatestSubmittedAttemptId: 401,
      moduleUnlocked: true,
    })],
    classroomId: 7,
  });

  assert.equal(card.canOpenModule, true);
  assert.equal(card.progress, null);
  assert.equal(card.assessmentModel.rows[0].resultAction.href, "/classrooms/7/lessons/arrays/assessment/pre/results/401");
});

test("next step uses exact classroom routes for assessments, modules, and games", () => {
  const state = (row, summary) => ({
    status: "ready",
    classroomId: 7,
    progress: { classroomId: 7, lessons: [row], summary },
    error: null,
  });

  const pre = createLessonNextStepViewModel(state(
    lesson({ moduleUnlocked: false, gameUnlocked: false, gameStarted: false, gameCompleted: false, lessonCompleted: false, preRequired: true, preAssessmentId: 11, preUnlocked: true, nextAction: "TAKE_PRE" }),
    { nextAction: "TAKE_PRE", nextActionLessonKey: "arrays" },
  ));
  assert.equal(pre.action.href, "/classrooms/7/lessons/arrays/assessment/pre");

  const module = createLessonNextStepViewModel(state(
    lesson({ progressPercent: 0, gameStarted: false, gameCompleted: false, lessonCompleted: false, nextAction: "PLAY_GAME" }),
    { nextAction: "PLAY_GAME", nextActionLessonKey: "arrays" },
  ));
  assert.equal(module.action.href, "/lesson/built-in/arrays?classroomId=7");

  const game = createLessonNextStepViewModel(state(
    lesson({ progressPercent: 35, gameStarted: true, gameCompleted: false, lessonCompleted: false, nextAction: "PLAY_GAME" }),
    { nextAction: "PLAY_GAME", nextActionLessonKey: "arrays" },
  ));
  assert.equal(game.action.href, "/Map?classroomId=7");
});

test("summary-authorized assessments remain available when disabled lessons omit their row", () => {
  const model = createLessonNextStepViewModel({
    status: "ready",
    classroomId: 7,
    progress: {
      classroomId: 7,
      lessons: [],
      summary: { totalLevels: 0, nextAction: "RESUME_PRE", nextActionLessonKey: "arrays" },
    },
  });

  assert.equal(model.kind, "ready");
  assert.equal(model.action.label, "Continue Pre-Test");
  assert.equal(model.action.href, "/classrooms/7/lessons/arrays/assessment/pre");
});

test("next-step states distinguish loading, failure, unenrolled, empty, blocked, and completed", () => {
  assert.equal(createLessonNextStepViewModel({ status: "loading" }).kind, "loading");
  assert.equal(createLessonNextStepViewModel({ status: "error", error: "Offline" }).kind, "error");
  assert.equal(createLessonNextStepViewModel({ status: "unenrolled" }).kind, "unenrolled");
  assert.equal(createLessonNextStepViewModel({ status: "ready", classroomId: 7, progress: { classroomId: 7, lessons: [], summary: { totalLevels: 0, nextAction: "LESSON_COMPLETE", nextActionLessonKey: null } } }).kind, "empty");
  assert.equal(createLessonNextStepViewModel({ status: "ready", classroomId: 7, progress: { classroomId: 7, lessons: [], summary: {} } }).kind, "error");

  const blockedRow = lesson({ lessonKey: "functions", lessonTitle: "Functions", progressPercent: 0, curriculumPrerequisiteSatisfied: false, moduleUnlocked: false, gameUnlocked: false, gameStarted: false, gameCompleted: false, lessonCompleted: false, nextAction: "COMPLETE_PREREQUISITE_LESSON" });
  assert.equal(createLessonNextStepViewModel({ status: "ready", classroomId: 7, progress: { classroomId: 7, lessons: [blockedRow], summary: { nextAction: blockedRow.nextAction, nextActionLessonKey: "functions" } } }).kind, "blocked");
  assert.equal(createLessonNextStepViewModel({ status: "ready", classroomId: 7, progress: { classroomId: 7, lessons: [lesson()], summary: { totalLevels: 1, nextAction: "LESSON_COMPLETE", nextActionLessonKey: null } } }).kind, "completed");
});

test("retry generations ignore stale classroom responses", () => {
  const loadingOne = lessonProgressionReducer(initialLessonProgressionState, { type: "load-started", generation: 1 });
  const loadingTwo = lessonProgressionReducer(loadingOne, { type: "load-started", generation: 2 });
  const stale = lessonProgressionReducer(loadingTwo, { type: "load-succeeded", generation: 1, classroomId: 7, progress: { classroomId: 7 } });
  assert.equal(stale, loadingTwo);

  const current = lessonProgressionReducer(stale, { type: "load-succeeded", generation: 2, classroomId: 9, progress: { classroomId: 9, lessons: [], summary: {} } });
  assert.equal(current.status, "ready");
  assert.equal(current.classroomId, 9);
  assert.equal(current.progress.classroomId, 9);
});
