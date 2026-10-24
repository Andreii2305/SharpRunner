import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILT_IN_LESSON_CATALOGUE_PATH,
  INITIAL_BUILT_IN_CATALOGUE_STATE,
  createAdminBuiltInCatalogueController,
  createAdminContentSourceTransitions,
} from "./adminBuiltInLessonCatalogueState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const assignState = (holder) => (next) => {
  holder.value = typeof next === "function" ? next(holder.value) : next;
};

const cataloguePayload = {
  schemaVersion: 1,
  contentRevision: "2026-09-28.1",
  mode: "read-only",
  lessons: [
    { lessonKey: "tutorial", title: "C# Foundations", eyebrow: "Tutorial", description: "Start here.", displayOrder: 1, sectionCount: 9 },
    { lessonKey: "arrays", title: "Arrays", eyebrow: "Arrays", description: "Store values.", displayOrder: 2, sectionCount: 11 },
    { lessonKey: "functions", title: "Functions and Methods", eyebrow: "Functions", description: "Reuse behavior.", displayOrder: 3, sectionCount: 11 },
    { lessonKey: "functions-with-arrays", title: "Functions with Arrays", eyebrow: "Combined skills", description: "Compose skills.", displayOrder: 4, sectionCount: 10 },
    { lessonKey: "final", title: "Final Review", eyebrow: "Review", description: "Review everything.", displayOrder: 5, sectionCount: 10 },
  ],
};

test("catalogue controller requests the admin endpoint and preserves canonical response order", async () => {
  const state = { value: INITIAL_BUILT_IN_CATALOGUE_STATE };
  const calls = [];
  const controller = createAdminBuiltInCatalogueController({
    request: async (path, options) => {
      calls.push({ path, signal: options.signal });
      return cataloguePayload;
    },
    setState: assignState(state),
  });

  const completion = controller.loadIfNeeded();
  assert.equal(completion instanceof Promise, true);
  assert.equal(state.value.status, "loading");
  assert.equal(await completion, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, BUILT_IN_LESSON_CATALOGUE_PATH);
  assert.equal(calls[0].signal instanceof AbortSignal, true);
  assert.deepEqual(state.value.lessons.map((lesson) => lesson.lessonKey), [
    "tutorial", "arrays", "functions", "functions-with-arrays", "final",
  ]);
  assert.equal(state.value.status, "success");
  assert.equal(state.value.schemaVersion, 1);
  assert.equal(state.value.contentRevision, "2026-09-28.1");
});

test("catalogue errors are retryable and a current success restores the catalogue", async () => {
  const state = { value: INITIAL_BUILT_IN_CATALOGUE_STATE };
  let attempt = 0;
  const controller = createAdminBuiltInCatalogueController({
    request: async () => {
      attempt += 1;
      if (attempt === 1) {
        const error = new Error("network");
        error.response = { data: { message: "Catalogue unavailable." } };
        throw error;
      }
      return cataloguePayload;
    },
    setState: assignState(state),
  });

  assert.equal(await controller.load(), false);
  assert.deepEqual(state.value, {
    ...INITIAL_BUILT_IN_CATALOGUE_STATE,
    status: "error",
    error: "Catalogue unavailable.",
  });
  assert.equal(await controller.load(), true);
  assert.equal(attempt, 2);
  assert.equal(state.value.status, "success");
  assert.equal(state.value.lessons.length, 5);
});

test("deactivation fences late success, error, and completion updates", async () => {
  for (const outcome of ["resolve", "reject"]) {
    const pending = deferred();
    const state = { value: INITIAL_BUILT_IN_CATALOGUE_STATE };
    const controller = createAdminBuiltInCatalogueController({
      request: () => pending.promise,
      setState: assignState(state),
    });

    const completion = controller.load();
    assert.equal(state.value.status, "loading");
    controller.deactivate();
    assert.deepEqual(state.value, INITIAL_BUILT_IN_CATALOGUE_STATE);

    if (outcome === "resolve") pending.resolve(cataloguePayload);
    else pending.reject(new Error("late catalogue failure"));

    assert.equal(await completion, false);
    assert.deepEqual(state.value, INITIAL_BUILT_IN_CATALOGUE_STATE);
  }
});

test("returning after an interrupted catalogue load starts a fresh request", async () => {
  const first = deferred();
  const second = deferred();
  const requests = [first, second];
  const state = { value: INITIAL_BUILT_IN_CATALOGUE_STATE };
  const controller = createAdminBuiltInCatalogueController({
    request: () => requests.shift().promise,
    setState: assignState(state),
  });

  const firstCompletion = controller.loadIfNeeded();
  controller.deactivate();
  const secondCompletion = controller.loadIfNeeded();
  assert.equal(state.value.status, "loading");

  first.resolve({ ...cataloguePayload, lessons: [{ lessonKey: "stale" }] });
  second.resolve(cataloguePayload);
  assert.equal(await firstCompletion, false);
  assert.equal(await secondCompletion, true);
  assert.deepEqual(state.value.lessons.map((lesson) => lesson.lessonKey), [
    "tutorial", "arrays", "functions", "functions-with-arrays", "final",
  ]);
});

test("source transitions preserve inactive state and activate only the selected source", () => {
  const calls = [];
  let source = "teacher";
  const transitions = createAdminContentSourceTransitions({
    deactivateTeacher: () => calls.push("deactivate teacher"),
    activateTeacher: () => calls.push("activate teacher"),
    deactivateBuiltIn: () => calls.push("deactivate built-in"),
    activateBuiltIn: () => calls.push("activate built-in"),
    closeTeacherDetail: () => calls.push("close detail"),
    closeBuiltInDetail: () => calls.push("close built-in detail"),
    setSource: (next) => { source = next; },
  });

  assert.equal(transitions.changeSource("built-in", "teacher"), true);
  assert.equal(source, "built-in");
  assert.deepEqual(calls, ["deactivate teacher", "close detail", "close built-in detail", "activate built-in"]);

  calls.length = 0;
  assert.equal(transitions.changeSource("teacher", "built-in"), true);
  assert.equal(source, "teacher");
  assert.deepEqual(calls, ["deactivate built-in", "close detail", "close built-in detail", "activate teacher"]);

  calls.length = 0;
  assert.equal(transitions.changeSource("teacher", "teacher"), false);
  assert.deepEqual(calls, []);
});

test("view changes deactivate only an active built-in catalogue", () => {
  const calls = [];
  const transitions = createAdminContentSourceTransitions({
    deactivateTeacher() {}, activateTeacher() {},
    deactivateBuiltIn: () => calls.push("deactivate built-in"),
    activateBuiltIn() {}, closeTeacherDetail() {}, closeBuiltInDetail: () => calls.push("close built-in detail"), setSource() {},
  });

  assert.equal(transitions.changeView("students", "content", "built-in"), true);
  assert.deepEqual(calls, ["deactivate built-in", "close built-in detail"]);
  calls.length = 0;
  assert.equal(transitions.changeView("students", "students", "built-in"), false);
  assert.equal(transitions.changeView("content", "students", "built-in"), true);
  assert.deepEqual(calls, []);
});

test("leaving Content and disposal fence pending catalogue requests", async () => {
  for (const action of ["deactivate", "dispose"]) {
    const pending = deferred();
    const state = { value: INITIAL_BUILT_IN_CATALOGUE_STATE };
    const controller = createAdminBuiltInCatalogueController({
      request: () => pending.promise,
      setState: assignState(state),
    });
    const completion = controller.load();
    controller[action]();
    pending.resolve(cataloguePayload);
    assert.equal(await completion, false);
    assert.notEqual(state.value.status, "success");
  }
});
