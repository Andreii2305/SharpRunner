import assert from "node:assert/strict";
import test from "node:test";
import {
  createAssessmentFullscreenController,
  isAssessmentFullscreenEligible,
} from "./assessmentFullscreenController.js";
import { createAssessmentSessionGuard } from "./assessmentSessionGuard.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const eventTarget = (initial = {}) => {
  const listeners = new Map();
  return {
    ...initial,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type, event = {}) {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
  };
};

const createHarness = ({ supported = true } = {}) => {
  const states = [];
  let exitCalls = 0;
  let exitResult = Promise.resolve();
  const documentTarget = eventTarget({
    fullscreenEnabled: supported,
    fullscreenElement: null,
    visibilityState: "visible",
    activeElement: null,
    exitFullscreen() {
      exitCalls += 1;
      return exitResult;
    },
  });
  const element = supported ? { requestFullscreen() { return Promise.resolve(); } } : {};
  const controller = createAssessmentFullscreenController({
    documentTarget,
    onStateChange(state) { states.push(state); },
  });
  return {
    controller,
    documentTarget,
    element,
    states,
    get state() { return controller.getState(); },
    get exitCalls() { return exitCalls; },
    setExitResult(result) { exitResult = result; },
  };
};

test("fullscreen eligibility is limited to active in-progress PRE and POST attempts", () => {
  const base = {
    outcome: { kind: "ACTIVE" },
    assessmentState: {
      screen: "active",
      assessment: { type: "PRE" },
      attempt: { status: "IN_PROGRESS" },
    },
  };
  assert.equal(isAssessmentFullscreenEligible(base), true);
  assert.equal(isAssessmentFullscreenEligible({
    ...base,
    assessmentState: { ...base.assessmentState, assessment: { type: "POST" } },
  }), true);
  assert.equal(isAssessmentFullscreenEligible({
    ...base,
    outcome: { kind: "RESULT" },
  }), false);
  assert.equal(isAssessmentFullscreenEligible({
    ...base,
    assessmentState: { ...base.assessmentState, attempt: { status: "SUBMITTED" } },
  }), false);
  assert.equal(isAssessmentFullscreenEligible({
    ...base,
    assessmentState: { ...base.assessmentState, assessment: { type: "QUIZ" } },
  }), false);
});

test("unsupported fullscreen remains a usable non-requesting state", () => {
  const harness = createHarness({ supported: false });
  harness.controller.setScope({ identity: "attempt-a", element: harness.element, eligible: true });
  assert.deepEqual(harness.state, {
    status: "unsupported",
    message: "Fullscreen is not available in this browser. You can continue in standard view.",
  });
  assert.equal(harness.controller.enter(), null);
  harness.controller.dispose();
});

test("entry is invoked synchronously from the action and duplicate entry is single-flight", async () => {
  const harness = createHarness();
  const request = deferred();
  let requestCalls = 0;
  let invoked = false;
  harness.element.requestFullscreen = () => {
    invoked = true;
    requestCalls += 1;
    return request.promise;
  };
  harness.controller.setScope({ identity: "attempt-a", element: harness.element, eligible: true });

  const first = harness.controller.enter();
  assert.equal(invoked, true);
  assert.equal(harness.state.status, "requesting");
  const second = harness.controller.enter();
  assert.equal(first, second);
  assert.equal(requestCalls, 1);

  harness.documentTarget.fullscreenElement = harness.element;
  harness.documentTarget.emit("fullscreenchange");
  request.resolve();
  await first;
  assert.equal(harness.state.status, "fullscreen");
  harness.controller.dispose();
});

test("declined entry reports a neutral failure and permits an explicit retry", async () => {
  const harness = createHarness();
  let calls = 0;
  harness.element.requestFullscreen = () => {
    calls += 1;
    return calls === 1 ? Promise.reject(new Error("Permission denied")) : Promise.resolve();
  };
  harness.controller.setScope({ identity: "attempt-a", element: harness.element, eligible: true });

  await harness.controller.enter();
  assert.equal(harness.state.status, "error");
  assert.match(harness.state.message, /could not be started/i);

  const retry = harness.controller.enter();
  harness.documentTarget.fullscreenElement = harness.element;
  harness.documentTarget.emit("fullscreenchange");
  await retry;
  assert.equal(calls, 2);
  assert.equal(harness.state.status, "fullscreen");
  harness.controller.dispose();
});

test("native fullscreen exit updates state without requesting automatic re-entry", async () => {
  const harness = createHarness();
  let requestCalls = 0;
  harness.element.requestFullscreen = () => {
    requestCalls += 1;
    return Promise.resolve();
  };
  harness.controller.setScope({ identity: "attempt-a", element: harness.element, eligible: true });
  const entry = harness.controller.enter();
  harness.documentTarget.fullscreenElement = harness.element;
  harness.documentTarget.emit("fullscreenchange");
  await entry;

  harness.documentTarget.fullscreenElement = null;
  harness.documentTarget.emit("fullscreenchange");
  assert.equal(harness.state.status, "available");
  assert.match(harness.state.message, /exited/i);
  assert.equal(requestCalls, 1);
  harness.controller.dispose();
});

test("a later external fullscreen session on the same element is not claimed as owned", async () => {
  const harness = createHarness();
  harness.element.requestFullscreen = () => Promise.resolve();
  harness.controller.setScope({ identity: "attempt-a", element: harness.element, eligible: true });
  const entry = harness.controller.enter();
  harness.documentTarget.fullscreenElement = harness.element;
  harness.documentTarget.emit("fullscreenchange");
  await entry;

  harness.documentTarget.fullscreenElement = null;
  harness.documentTarget.emit("fullscreenchange");
  harness.documentTarget.fullscreenElement = harness.element;
  harness.documentTarget.emit("fullscreenchange");
  harness.controller.dispose();

  assert.equal(harness.exitCalls, 0);
});

test("exit is single-flight and rejection keeps authoritative fullscreen state", async () => {
  const harness = createHarness();
  harness.element.requestFullscreen = () => Promise.resolve();
  harness.controller.setScope({ identity: "attempt-a", element: harness.element, eligible: true });
  const entry = harness.controller.enter();
  harness.documentTarget.fullscreenElement = harness.element;
  harness.documentTarget.emit("fullscreenchange");
  await entry;

  const exit = deferred();
  harness.setExitResult(exit.promise);
  const first = harness.controller.exit();
  const second = harness.controller.exit();
  assert.equal(first, second);
  assert.equal(harness.exitCalls, 1);
  exit.reject(new Error("Exit denied"));
  await first;
  assert.equal(harness.state.status, "fullscreen");
  assert.match(harness.state.message, /could not exit/i);
  harness.controller.dispose();
});

test("cleanup exits only an owned exact boundary and leaves another feature untouched", async () => {
  const harness = createHarness();
  harness.element.requestFullscreen = () => Promise.resolve();
  harness.controller.setScope({ identity: "attempt-a", element: harness.element, eligible: true });
  const entry = harness.controller.enter();
  harness.documentTarget.fullscreenElement = harness.element;
  harness.documentTarget.emit("fullscreenchange");
  await entry;
  harness.controller.invalidate();
  assert.equal(harness.exitCalls, 1);

  const otherHarness = createHarness();
  const otherElement = {};
  otherHarness.controller.setScope({ identity: "attempt-b", element: otherHarness.element, eligible: true });
  otherHarness.documentTarget.fullscreenElement = otherElement;
  otherHarness.controller.invalidate();
  assert.equal(otherHarness.exitCalls, 0);
  otherHarness.controller.dispose();
});

test("cleanup exit rejection keeps the authoritative fullscreen state and exit control available", async () => {
  const harness = createHarness();
  harness.element.requestFullscreen = () => Promise.resolve();
  harness.controller.setScope({ identity: "attempt-a", element: harness.element, eligible: true });
  const entry = harness.controller.enter();
  harness.documentTarget.fullscreenElement = harness.element;
  harness.documentTarget.emit("fullscreenchange");
  await entry;

  const rejectedExit = deferred();
  harness.setExitResult(rejectedExit.promise);
  harness.controller.setScope({ identity: null, element: harness.element, eligible: false });
  assert.equal(harness.state.status, "exiting");
  rejectedExit.reject(new Error("Exit denied"));
  await rejectedExit.promise.catch(() => {});
  await Promise.resolve();

  assert.equal(harness.state.status, "fullscreen");
  assert.match(harness.state.message, /could not exit/i);
  harness.documentTarget.fullscreenElement = null;
  harness.controller.dispose();
});

test("a late old-scope completion cannot exit a newer owned session on the same element", async () => {
  const harness = createHarness();
  const oldRequest = deferred();
  const newRequest = deferred();
  let calls = 0;
  harness.element.requestFullscreen = () => {
    calls += 1;
    return calls === 1 ? oldRequest.promise : newRequest.promise;
  };

  harness.controller.setScope({ identity: "attempt-old", element: harness.element, eligible: true });
  const oldOperation = harness.controller.enter();
  harness.controller.setScope({ identity: "attempt-new", element: harness.element, eligible: true });
  const newOperation = harness.controller.enter();
  harness.documentTarget.fullscreenElement = harness.element;
  harness.documentTarget.emit("fullscreenchange");
  newRequest.resolve();
  await newOperation;
  oldRequest.resolve();
  await oldOperation;

  assert.equal(harness.state.status, "fullscreen");
  assert.equal(harness.exitCalls, 0);
  harness.controller.dispose();
});

test("a stale entry completion leaves a newer external session on the same element untouched", async () => {
  const harness = createHarness();
  const oldRequest = deferred();
  harness.element.requestFullscreen = () => oldRequest.promise;

  harness.controller.setScope({ identity: "attempt-old", element: harness.element, eligible: true });
  const oldOperation = harness.controller.enter();
  harness.controller.invalidate();
  const settledState = harness.controller.getState();

  harness.documentTarget.fullscreenElement = harness.element;
  harness.documentTarget.emit("fullscreenchange");
  oldRequest.resolve();
  await oldOperation;
  await Promise.resolve();

  assert.equal(harness.exitCalls, 0);
  assert.equal(harness.controller.exit(), null);
  assert.deepEqual(harness.controller.getState(), settledState);
  harness.controller.dispose();
  assert.equal(harness.exitCalls, 0);
});

test("fullscreen events add no revalidation and combined visibility/focus events keep one notice", () => {
  const harness = createHarness();
  const interruptions = [];
  const revalidations = [];
  const windowTarget = eventTarget();
  const guard = createAssessmentSessionGuard({
    attemptId: 44,
    getState: () => ({ screen: "active", orderedQuestions: [] }),
    revalidate: ({ reason }) => { revalidations.push(reason); return Promise.resolve({ kind: "ACTIVE" }); },
    onInterruption: (notice) => { interruptions.push(notice); return true; },
    windowTarget,
    documentTarget: harness.documentTarget,
    BroadcastChannelImpl: null,
  });

  harness.documentTarget.emit("fullscreenchange");
  assert.deepEqual(revalidations, []);
  assert.deepEqual(interruptions, []);

  harness.documentTarget.visibilityState = "hidden";
  harness.documentTarget.emit("visibilitychange");
  harness.documentTarget.visibilityState = "visible";
  harness.documentTarget.emit("fullscreenchange");
  harness.documentTarget.emit("visibilitychange");
  windowTarget.emit("focus");
  harness.documentTarget.emit("visibilitychange");
  assert.equal(interruptions.length, 1);
  assert.deepEqual(revalidations, []);
  guard.dispose();
  harness.controller.dispose();
});
