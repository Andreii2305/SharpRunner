import assert from "node:assert/strict";
import test from "node:test";
import {
  createDashboardNextStepViewModel,
  dashboardProgressionReducer,
  fulfilledDashboardSections,
  initialDashboardProgressionState,
} from "./dashboardNextStep.js";

const classroom = { id: 17, className: "Section Ada" };

const progression = (nextAction, lessonOverrides = {}, summaryOverrides = {}) => ({
  classroomId: 17,
  summary: {
    nextAction,
    nextActionLessonKey: "arrays",
    totalLevelsCleared: 2,
    ...summaryOverrides,
  },
  lessons: [{
    lessonKey: "arrays",
    lessonTitle: "Barangay Malumay",
    nextAction,
    moduleUnlocked: false,
    gameUnlocked: false,
    gameStarted: false,
    gameCompleted: false,
    ...lessonOverrides,
  }],
});

const readyState = (progress) => ({
  ...initialDashboardProgressionState,
  status: "ready",
  classroom,
  progress,
});

test("maps every supported progression action to its existing label and exact destination", () => {
  const cases = [
    ["TAKE_PRE", {}, "Take Pre-Test", "/classrooms/17/lessons/arrays/assessment/pre"],
    ["RESUME_PRE", {}, "Continue Pre-Test", "/classrooms/17/lessons/arrays/assessment/pre"],
    ["PLAY_GAME", { moduleUnlocked: true }, "Open Module", "/lesson/built-in/arrays?classroomId=17"],
    ["PLAY_GAME", { moduleUnlocked: true, gameStarted: true, gameUnlocked: true }, "Continue Game", "/Map?classroomId=17"],
    ["TAKE_POST", {}, "Take Post-Test", "/classrooms/17/lessons/arrays/assessment/post"],
    ["RESUME_POST", {}, "Continue Post-Test", "/classrooms/17/lessons/arrays/assessment/post"],
    ["RETRY_POST", {}, "Retry Post-Test", "/classrooms/17/lessons/arrays/assessment/post"],
  ];

  for (const [nextAction, overrides, label, href] of cases) {
    const model = createDashboardNextStepViewModel(readyState(progression(nextAction, overrides)));
    assert.equal(model.action.label, label, nextAction);
    assert.equal(model.action.href, href, nextAction);
    assert.equal(model.action.disabled, false, nextAction);
  }
});

test("reports loading, retryable failure, confirmed unenrollment, and confirmed new-student states", () => {
  const loading = createDashboardNextStepViewModel({
    ...initialDashboardProgressionState,
    status: "loading",
  });
  assert.equal(loading.kind, "loading");
  assert.equal(loading.action, null);

  const failed = createDashboardNextStepViewModel({
    ...initialDashboardProgressionState,
    status: "error",
    error: "Progress could not be loaded",
  });
  assert.equal(failed.kind, "error");
  assert.equal(failed.canRetry, true);
  assert.equal(failed.action, null);

  const unenrolled = createDashboardNextStepViewModel({
    ...initialDashboardProgressionState,
    status: "unenrolled",
  });
  assert.equal(unenrolled.kind, "unenrolled");
  assert.deepEqual(unenrolled.action, {
    label: "Join a classroom",
    href: "/join-class",
    disabled: false,
    kind: "enroll",
  });

  const newStudentProgress = progression("TAKE_PRE", {}, { totalLevelsCleared: 0 });
  newStudentProgress.lessons.unshift({
    lessonKey: "tutorial",
    totalLevels: 0,
    progressPercent: null,
    gameCompleted: true,
    lessonCompleted: true,
    nextAction: "LESSON_COMPLETE",
  });
  const newStudent = createDashboardNextStepViewModel(readyState(newStudentProgress));
  assert.equal(newStudent.kind, "new");
  assert.equal(newStudent.action.label, "Take Pre-Test");

  newStudentProgress.lessons[0].preCompleted = true;
  const returningStudent = createDashboardNextStepViewModel(readyState(newStudentProgress));
  assert.equal(returningStudent.kind, "ready");
});

test("reports blocked and completed progress without inventing a playable action", () => {
  for (const [nextAction, label] of [
    ["COMPLETE_PREREQUISITE_LESSON", "Complete previous lesson"],
    ["POST_RECOVERY_REQUIRED", "Post-Test attempts exhausted"],
  ]) {
    const model = createDashboardNextStepViewModel(readyState(progression(nextAction)));
    assert.equal(model.kind, "blocked");
    assert.equal(model.action.label, label);
    assert.equal(model.action.disabled, true);
    assert.equal(model.action.href, null);
    assert.equal(model.secondaryAction.href, "/Map?classroomId=17");
  }

  const completed = createDashboardNextStepViewModel(readyState({
    classroomId: 17,
    summary: {
      nextAction: "LESSON_COMPLETE",
      nextActionLessonKey: null,
      totalLevelsCleared: 30,
    },
    lessons: [],
  }));
  assert.equal(completed.kind, "completed");
  assert.equal(completed.action.label, "View map");
  assert.equal(completed.action.href, "/Map?classroomId=17");
  assert.equal(completed.secondaryAction, null);
});

test("uses the summary contract for an assessment whose disabled levels omit its lesson row", () => {
  const model = createDashboardNextStepViewModel(readyState({
    classroomId: 17,
    summary: {
      nextAction: "RESUME_PRE",
      nextActionLessonKey: "arrays",
      totalLevelsCleared: 0,
    },
    lessons: [],
  }));

  assert.equal(model.kind, "ready");
  assert.equal(model.eyebrow, "Next step");
  assert.equal(model.title, "Your next assessment");
  assert.equal(model.action.label, "Continue Pre-Test");
  assert.equal(model.action.href, "/classrooms/17/lessons/arrays/assessment/pre");
});

test("tells students with exhausted post-test attempts to contact their teacher", () => {
  const model = createDashboardNextStepViewModel(
    readyState(progression("POST_RECOVERY_REQUIRED")),
  );
  assert.match(model.description, /contact your teacher/i);
});

test("treats missing, mismatched, or unsupported progression as failure rather than a new student", () => {
  const cases = [
    null,
    { ...progression("TAKE_PRE"), classroomId: 99 },
    progression("TAKE_PRE", { nextAction: "PLAY_GAME" }),
    progression("UNKNOWN_ACTION"),
  ];

  for (const progress of cases) {
    const model = createDashboardNextStepViewModel(readyState(progress));
    assert.equal(model.kind, "error");
    assert.equal(model.canRetry, true);
  }
});

test("ignores stale progression results after a newer classroom request starts", () => {
  let state = dashboardProgressionReducer(initialDashboardProgressionState, {
    type: "load-started",
    generation: 1,
  });
  state = dashboardProgressionReducer(state, {
    type: "load-started",
    generation: 2,
  });
  state = dashboardProgressionReducer(state, {
    type: "load-succeeded",
    generation: 1,
    classroom: { id: 10 },
    progress: { classroomId: 10 },
  });
  assert.equal(state.status, "loading");
  assert.equal(state.generation, 2);

  state = dashboardProgressionReducer(state, {
    type: "load-succeeded",
    generation: 2,
    classroom: { id: 17 },
    progress: { classroomId: 17 },
  });
  assert.equal(state.status, "ready");
  assert.equal(state.classroom.id, 17);
});

test("keeps fulfilled dashboard sections available when another request fails", () => {
  const patch = fulfilledDashboardSections({
    leaderboard: { status: "rejected", reason: new Error("offline") },
    announcements: {
      status: "fulfilled",
      value: { data: { announcements: [{ id: 4, message: "Quiz Friday" }] } },
    },
    notifications: { status: "rejected", reason: new Error("offline") },
    profile: {
      status: "fulfilled",
      value: { data: { user: { id: 8, username: "ada" } } },
    },
  });

  assert.equal("leaderboard" in patch, false);
  assert.deepEqual(patch.announcements, [{ id: 4, message: "Quiz Friday" }]);
  assert.equal("notifications" in patch, false);
  assert.deepEqual(patch.profile, { id: 8, username: "ada" });
});
