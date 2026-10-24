import assert from "node:assert/strict";
import test from "node:test";
import {
  builtInLessonDetailPath,
  createAdminBuiltInLessonDetailController,
} from "./adminBuiltInLessonDetailState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const lesson = (lessonKey, title = lessonKey) => ({
  lessonKey,
  title,
  eyebrow: "Canonical lesson",
  description: "Read-only content.",
});

const payload = (lessonKey, title) => ({
  schemaVersion: 1,
  contentRevision: "2026-09-28.1",
  lesson: {
    ...lesson(lessonKey, title),
    objectives: [],
    sections: [],
    references: [],
  },
  mode: "read-only",
});

const focusSession = () => ({
  began: [], ended: 0, canceled: 0,
  begin(opener) { this.began.push(opener); return true; },
  end() { this.ended += 1; return true; },
  cancel() { this.canceled += 1; return true; },
});

test("detail controller requests the selected admin built-in lesson and accepts only its authoritative identity", async () => {
  const states = [];
  const calls = [];
  const focus = focusSession();
  const opener = { id: "inspect-arrays" };
  const controller = createAdminBuiltInLessonDetailController({
    request: async (path, options) => {
      calls.push({ path, signal: options.signal });
      return payload("arrays", "Arrays");
    },
    setDetail: (state) => states.push(state),
    focusSession: focus,
  });

  assert.equal(builtInLessonDetailPath("functions-with-arrays"), "/api/admin/built-in-lessons/functions-with-arrays");
  assert.equal(await controller.open(lesson("arrays", "Arrays"), opener), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/admin/built-in-lessons/arrays");
  assert.equal(calls[0].signal instanceof AbortSignal, true);
  assert.deepEqual(focus.began, [opener]);
  assert.equal(states[0].status, "loading");
  assert.equal(states[0].lesson, undefined);
  assert.equal(states.at(-1).status, "success");
  assert.equal(states.at(-1).lessonKey, "arrays");
  assert.deepEqual(states.at(-1).response, payload("arrays", "Arrays"));
});

test("detail errors are retryable only for the currently selected lesson", async () => {
  const states = [];
  const paths = [];
  let attempt = 0;
  const controller = createAdminBuiltInLessonDetailController({
    request: async (path) => {
      paths.push(path);
      attempt += 1;
      if (attempt === 1) {
        const error = new Error("network");
        error.response = { data: { message: "Built-in lesson unavailable." } };
        throw error;
      }
      return payload("tutorial", "C# Foundations");
    },
    setDetail: (state) => states.push(state),
    focusSession: focusSession(),
  });

  assert.equal(await controller.open(lesson("tutorial", "C# Foundations"), {}), false);
  assert.equal(states.at(-1).status, "error");
  assert.equal(states.at(-1).error, "Built-in lesson unavailable.");
  assert.equal(await controller.retry(), true);
  assert.deepEqual(paths, [
    "/api/admin/built-in-lessons/tutorial",
    "/api/admin/built-in-lessons/tutorial",
  ]);
  assert.equal(states.at(-1).status, "success");
});

test("lesson replacement synchronously clears old content and fences late success, error, and completion", async () => {
  for (const lateOutcome of ["resolve", "reject"]) {
    const first = deferred();
    const second = deferred();
    const requests = [first, second];
    const states = [];
    const focus = focusSession();
    const controller = createAdminBuiltInLessonDetailController({
      request: () => requests.shift().promise,
      setDetail: (state) => states.push(state),
      focusSession: focus,
    });

    const firstCompletion = controller.open(lesson("tutorial"), { id: "first" });
    const secondCompletion = controller.open(lesson("arrays"), { id: "second" });
    const replacementState = states.at(-1);
    assert.equal(replacementState.status, "loading");
    assert.equal(replacementState.lessonKey, "arrays");
    assert.equal(replacementState.response, undefined);

    if (lateOutcome === "resolve") first.resolve(payload("tutorial"));
    else first.reject(new Error("late failure"));
    assert.equal(await firstCompletion, false);
    assert.equal(states.at(-1), replacementState);

    second.resolve(payload("arrays"));
    assert.equal(await secondCompletion, true);
    assert.equal(states.at(-1).response.lesson.lessonKey, "arrays");
    assert.equal(focus.canceled, 1);
    assert.equal(focus.began.length, 2);
  }
});

test("mismatched detail identity fails closed instead of displaying another lesson", async () => {
  const states = [];
  const controller = createAdminBuiltInLessonDetailController({
    request: async () => payload("final", "Final Review"),
    setDetail: (state) => states.push(state),
    focusSession: focusSession(),
  });

  assert.equal(await controller.open(lesson("arrays"), {}), false);
  assert.equal(states.at(-1).status, "error");
  assert.equal(states.at(-1).lessonKey, "arrays");
  assert.equal(states.at(-1).response, undefined);
});

test("close and source/view cancellation fence all late outcomes with the correct focus behavior", async () => {
  for (const action of ["close", "cancel"]) {
    for (const lateOutcome of ["resolve", "reject"]) {
      const pending = deferred();
      const states = [];
      const focus = focusSession();
      const controller = createAdminBuiltInLessonDetailController({
        request: () => pending.promise,
        setDetail: (state) => states.push(state),
        focusSession: focus,
      });
      const completion = controller.open(lesson("functions"), {});
      controller[action]();
      assert.equal(states.at(-1), null);
      if (lateOutcome === "resolve") pending.resolve(payload("functions"));
      else pending.reject(new Error("late failure"));
      assert.equal(await completion, false);
      assert.equal(states.at(-1), null);
      assert.equal(focus.ended, action === "close" ? 1 : 0);
      assert.equal(focus.canceled, action === "cancel" ? 1 : 0);
    }
  }
});

test("unmount disposal aborts and fences requests without a state or focus-restoration update", async () => {
  const pending = deferred();
  const states = [];
  const focus = focusSession();
  const controller = createAdminBuiltInLessonDetailController({
    request: () => pending.promise,
    setDetail: (state) => states.push(state),
    focusSession: focus,
  });
  const completion = controller.open(lesson("final"), {});
  const stateCount = states.length;
  controller.dispose();
  pending.resolve(payload("final"));
  assert.equal(await completion, false);
  assert.equal(states.length, stateCount);
  assert.equal(focus.canceled, 1);
  assert.equal(focus.ended, 0);
});
