import assert from "node:assert/strict";
import test from "node:test";
import { createAssessmentSessionGuard } from "./assessmentSessionGuard.js";

const deferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
};

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeBroadcastChannel extends FakeEventTarget {
  static instances = [];

  constructor(name) {
    super();
    this.name = name;
    this.messages = [];
    this.closed = false;
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(message) {
    this.messages.push(message);
  }

  close() {
    this.closed = true;
  }
}

const cleanState = () => ({
  screen: "active",
  submitStatus: "idle",
  orderedQuestions: [{ id: 101 }],
  selectedByQuestion: { 101: 1001 },
  savedByQuestion: { 101: 1001 },
  saveStateByQuestion: { 101: { status: "clean" } },
});

const dirtyState = () => ({
  ...cleanState(),
  selectedByQuestion: { 101: 1002 },
  saveStateByQuestion: { 101: { status: "dirty" } },
});

const createHarness = ({ state = cleanState(), BroadcastChannelImpl = FakeBroadcastChannel } = {}) => {
  FakeBroadcastChannel.instances = [];
  const windowTarget = new FakeEventTarget();
  const documentTarget = new FakeEventTarget();
  documentTarget.visibilityState = "visible";
  const revalidations = [];
  const syncRequired = [];
  let currentState = state;
  const guard = createAssessmentSessionGuard({
    attemptId: 312,
    getState: () => currentState,
    revalidate: (event) => {
      revalidations.push(event);
      return Promise.resolve();
    },
    onSyncRequired: (event) => syncRequired.push(event),
    windowTarget,
    documentTarget,
    BroadcastChannelImpl,
  });
  return {
    guard,
    windowTarget,
    documentTarget,
    revalidations,
    syncRequired,
    setState: (nextState) => { currentState = nextState; },
    channel: FakeBroadcastChannel.instances[0],
  };
};

test("beforeunload warns only while active assessment work is dirty, saving, failed, or transitioning", () => {
  const harness = createHarness({ state: cleanState() });
  const cleanEvent = { preventDefault() { this.prevented = true; } };
  harness.windowTarget.emit("beforeunload", cleanEvent);
  assert.equal(cleanEvent.prevented, undefined);

  for (const state of [
    dirtyState(),
    { ...cleanState(), saveStateByQuestion: { 101: { status: "saving" } } },
    { ...cleanState(), saveStateByQuestion: { 101: { status: "error" } } },
    { ...cleanState(), submitStatus: "submitting" },
  ]) {
    harness.setState(state);
    const event = { preventDefault() { this.prevented = true; } };
    harness.windowTarget.emit("beforeunload", event);
    assert.equal(event.prevented, true);
    assert.equal(event.returnValue, "");
  }

  harness.setState({ ...dirtyState(), screen: "result" });
  const resultEvent = { preventDefault() { this.prevented = true; } };
  harness.windowTarget.emit("beforeunload", resultEvent);
  assert.equal(resultEvent.prevented, undefined);
  harness.guard.dispose();
});

test("broadcast messages contain only attempt-scoped non-sensitive invalidation metadata", () => {
  const { guard, channel } = createHarness();
  assert.equal(channel.name, "sharprunner:assessment-attempt:312");

  guard.announceSaved();
  guard.announceSubmitted();

  assert.deepEqual(channel.messages, [
    { type: "ASSESSMENT_ATTEMPT_CHANGED", attemptId: 312 },
    { type: "ASSESSMENT_ATTEMPT_SUBMITTED", attemptId: 312 },
  ]);
  const serialized = JSON.stringify(channel.messages);
  for (const forbidden of [
    "selectedChoiceId", "question", "choice", "answer", "score", "correct", "token",
  ]) assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  guard.dispose();
});

test("invalidations arriving during a clean revalidation coalesce into one trailing refresh", async () => {
  const first = deferred();
  const second = deferred();
  const harness = createHarness();
  let calls = 0;
  harness.guard.dispose();
  const guard = createAssessmentSessionGuard({
    attemptId: 312,
    getState: cleanState,
    revalidate: () => {
      calls += 1;
      return calls === 1 ? first.promise : second.promise;
    },
    onSyncRequired() {},
    windowTarget: harness.windowTarget,
    documentTarget: harness.documentTarget,
    BroadcastChannelImpl: FakeBroadcastChannel,
  });
  const channel = FakeBroadcastChannel.instances.at(-1);

  channel.emit("message", {
    data: { type: "ASSESSMENT_ATTEMPT_CHANGED", attemptId: 312 },
  });
  harness.windowTarget.emit("focus");
  harness.documentTarget.emit("visibilitychange");
  assert.equal(calls, 1);

  first.resolve();
  await first.promise;
  await Promise.resolve();
  assert.equal(calls, 2);

  second.resolve();
  await second.promise;
  guard.dispose();
});

test("a remote submission during an in-flight refresh forces a trailing authority check", async () => {
  const first = deferred();
  const reasons = [];
  const harness = createHarness();
  harness.guard.dispose();
  const guard = createAssessmentSessionGuard({
    attemptId: 312,
    getState: dirtyState,
    revalidate: ({ reason }) => {
      reasons.push(reason);
      return reasons.length === 1 ? first.promise : Promise.resolve();
    },
    onSyncRequired() {},
    windowTarget: harness.windowTarget,
    documentTarget: harness.documentTarget,
    BroadcastChannelImpl: FakeBroadcastChannel,
  });
  const channel = FakeBroadcastChannel.instances.at(-1);

  guard.revalidate("manual", { force: true });
  channel.emit("message", {
    data: { type: "ASSESSMENT_ATTEMPT_SUBMITTED", attemptId: 312 },
  });
  assert.deepEqual(reasons, ["manual"]);

  first.resolve();
  await first.promise;
  await Promise.resolve();
  assert.deepEqual(reasons, ["manual", "remote-submission"]);
  guard.dispose();
});

test("dirty remote edits are never overwritten, while remote submission still verifies authority", async () => {
  const harness = createHarness({ state: dirtyState() });
  harness.channel.emit("message", {
    data: { type: "ASSESSMENT_ATTEMPT_CHANGED", attemptId: 312 },
  });
  assert.equal(harness.revalidations.length, 0);
  assert.deepEqual(harness.syncRequired, [{ reason: "remote-change", attemptId: 312 }]);

  harness.channel.emit("message", {
    data: { type: "ASSESSMENT_ATTEMPT_SUBMITTED", attemptId: 312 },
  });
  await Promise.resolve();
  assert.equal(harness.revalidations.length, 1);
  assert.equal(harness.revalidations[0].reason, "remote-submission");
  assert.deepEqual(harness.syncRequired.at(-1), {
    reason: "remote-submission",
    attemptId: 312,
  });
  harness.guard.dispose();
});

test("focus fallback works without BroadcastChannel and disposal removes every listener", async () => {
  const harness = createHarness({ BroadcastChannelImpl: null });
  assert.equal(harness.channel, undefined);

  harness.documentTarget.visibilityState = "hidden";
  harness.documentTarget.emit("visibilitychange");
  assert.equal(harness.revalidations.length, 0);
  harness.documentTarget.visibilityState = "visible";
  harness.documentTarget.emit("visibilitychange");
  await Promise.resolve();
  assert.equal(harness.revalidations.length, 1);

  harness.guard.dispose();
  harness.windowTarget.emit("focus");
  harness.documentTarget.emit("visibilitychange");
  assert.equal(harness.revalidations.length, 1);
});

test("focus revalidation waits for local submit and retake transitions without inventing a conflict", () => {
  for (const state of [
    { ...cleanState(), submitStatus: "submitting" },
    { ...cleanState(), screen: "result", retakeStatus: "starting" },
  ]) {
    const harness = createHarness({ state });
    harness.windowTarget.emit("focus");
    assert.equal(harness.revalidations.length, 0);
    assert.equal(harness.syncRequired.length, 0);
    harness.guard.dispose();
  }
});

test("an in-flight revalidation can fence completion after the guard is disposed", () => {
  const windowTarget = new FakeEventTarget();
  const documentTarget = new FakeEventTarget();
  documentTarget.visibilityState = "visible";
  let context;
  const guard = createAssessmentSessionGuard({
    attemptId: 312,
    getState: cleanState,
    revalidate: (event) => {
      context = event;
      return new Promise(() => {});
    },
    onSyncRequired() {},
    windowTarget,
    documentTarget,
    BroadcastChannelImpl: null,
  });

  windowTarget.emit("focus");
  assert.equal(context.isActive(), true);
  guard.dispose();
  assert.equal(context.isActive(), false);
});
