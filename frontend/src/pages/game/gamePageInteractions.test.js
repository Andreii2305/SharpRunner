import assert from "node:assert/strict";
import test from "node:test";
import {
  GAMEPLAY_TABS,
  cancelEvaluation,
  createEvaluationLifecycle,
  dispatchEvaluation,
  getNextGameplayTab,
  shouldAcceptEvaluationOutcome,
} from "./gamePageInteractions.js";
import * as gamePageInteractions from "./gamePageInteractions.js";
import { createGameFullscreenInterruptionController } from "./gameFullscreenInterruptionController.js";

const deferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
};

const createExitHarness = () => {
  const listeners = new Map();
  const interruptions = [];
  let currentTime = 1_000;
  let exitResult = Promise.resolve();
  const documentTarget = {
    fullscreenEnabled: true,
    fullscreenElement: null,
    visibilityState: "visible",
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type) {
      for (const listener of listeners.get(type) ?? []) listener();
    },
    exitFullscreen() {
      return exitResult;
    },
  };
  const boundary = { requestFullscreen: () => Promise.resolve() };
  const controller = createGameFullscreenInterruptionController({
    documentTarget,
    now: () => currentTime,
    onInterruption: (interruption) => interruptions.push(interruption),
  });
  controller.setScope({
    accountId: 3,
    classroomId: 1,
    levelIdentity: "tutorial-level-1",
    element: boundary,
  });

  return {
    boundary,
    controller,
    documentTarget,
    interruptions,
    advance(milliseconds) { currentTime += milliseconds; },
    setExitResult(result) { exitResult = result; },
    async enter() {
      const entry = controller.continueGameplay();
      documentTarget.fullscreenElement = boundary;
      documentTarget.emit("fullscreenchange");
      await entry;
    },
  };
};

test("gameplay tabs move with arrows and wrap at either end", () => {
  assert.deepEqual(GAMEPLAY_TABS, ["game", "code", "lesson"]);
  assert.equal(getNextGameplayTab("game", "ArrowRight"), "code");
  assert.equal(getNextGameplayTab("lesson", "ArrowRight"), "game");
  assert.equal(getNextGameplayTab("game", "ArrowLeft"), "lesson");
  assert.equal(getNextGameplayTab("code", "Home"), "game");
  assert.equal(getNextGameplayTab("code", "End"), "lesson");
  assert.equal(getNextGameplayTab("code", "Enter"), null);
});

test("evaluation lifecycle is single-flight and reports state transitions", () => {
  const states = [];
  const inFlight = { current: false };
  const lifecycle = createEvaluationLifecycle((running) => states.push(running), inFlight);

  assert.equal(lifecycle.start(), true);
  assert.equal(lifecycle.isRunning(), true);
  assert.equal(inFlight.current, true);
  assert.equal(lifecycle.start(), false);
  lifecycle.finish();
  assert.equal(lifecycle.isRunning(), false);
  assert.equal(inFlight.current, false);
  assert.deepEqual(states, [true, false]);
});

test("evaluation cancellation clears an active run and repeated cleanup is quiet", () => {
  const states = [];
  const lifecycle = createEvaluationLifecycle((running) => states.push(running));

  lifecycle.start();
  lifecycle.finish();
  lifecycle.finish();

  assert.deepEqual(states, [true, false]);
});

test("synchronous scene dispatch exceptions clear the busy lifecycle and propagate", () => {
  const lifecycle = createEvaluationLifecycle();
  const failure = new Error("scene dispatch failed");

  assert.throws(() => dispatchEvaluation(lifecycle, () => { throw failure; }), failure);
  assert.equal(lifecycle.isRunning(), false);
});

test("reset and access cancellation clear both running state and activity identity", () => {
  const lifecycle = createEvaluationLifecycle();
  const activity = { current: "activity-1" };
  lifecycle.start();

  cancelEvaluation(lifecycle, activity);

  assert.equal(lifecycle.isRunning(), false);
  assert.equal(activity.current, null);
});

test("outcomes require the current level and an active evaluation", () => {
  assert.equal(shouldAcceptEvaluationOutcome({
    outcomeLevelNumber: 4,
    currentLevelNumber: 4,
    evaluationRunning: true,
  }), true);
  assert.equal(shouldAcceptEvaluationOutcome({
    outcomeLevelNumber: 3,
    currentLevelNumber: 4,
    evaluationRunning: true,
  }), false);
  assert.equal(shouldAcceptEvaluationOutcome({
    outcomeLevelNumber: 4,
    currentLevelNumber: 4,
    evaluationRunning: false,
  }), false);
});

test("a committed in-game Exit suppresses only its own fullscreen loss and preserves queued interruptions", async () => {
  const harness = createExitHarness();
  await harness.enter();

  harness.documentTarget.fullscreenElement = null;
  harness.documentTarget.emit("fullscreenchange");
  harness.advance(1_000);
  harness.documentTarget.visibilityState = "hidden";
  harness.documentTarget.emit("visibilitychange");
  harness.documentTarget.visibilityState = "visible";
  harness.documentTarget.emit("visibilitychange");
  await harness.enter();

  assert.equal(
    typeof gamePageInteractions.commitIntentionalGameExit,
    "function",
    "the production Exit path must expose a synchronous commit boundary",
  );
  let destination = null;
  gamePageInteractions.commitIntentionalGameExit({
    fullscreenController: harness.controller,
    navigate(nextDestination) {
      destination = nextDestination;
      harness.documentTarget.fullscreenElement = null;
      harness.documentTarget.emit("fullscreenchange");
    },
  });

  assert.equal(destination, "/dashboard");
  assert.deepEqual(harness.interruptions, [
    { type: "fullscreen_exit", count: 1 },
    { type: "hidden", count: 2 },
  ]);
  harness.controller.dispose();
});

test("an uncommitted or cancelled Exit leaves subsequent Escape and tab counting functional", async () => {
  const harness = createExitHarness();
  await harness.enter();

  // Opening and cancelling a confirmation does not commit navigation.
  harness.documentTarget.fullscreenElement = null;
  harness.documentTarget.emit("fullscreenchange");
  harness.advance(1_000);
  harness.documentTarget.visibilityState = "hidden";
  harness.documentTarget.emit("visibilitychange");

  assert.deepEqual(harness.interruptions, [
    { type: "fullscreen_exit", count: 1 },
    { type: "hidden", count: 2 },
  ]);
  harness.controller.dispose();
});

test("late intentional-exit cleanup cannot affect a replacement scope", async () => {
  const harness = createExitHarness();
  const pendingExit = deferred();
  harness.setExitResult(pendingExit.promise);
  await harness.enter();

  assert.equal(typeof gamePageInteractions.commitIntentionalGameExit, "function");
  gamePageInteractions.commitIntentionalGameExit({
    fullscreenController: harness.controller,
    navigate() {
      harness.documentTarget.fullscreenElement = null;
      harness.documentTarget.emit("fullscreenchange");
    },
  });
  harness.controller.setScope({
    accountId: 3,
    classroomId: 1,
    levelIdentity: "tutorial-level-2",
    element: harness.boundary,
  });
  const replacementState = harness.controller.getState();
  pendingExit.resolve();
  await pendingExit.promise;
  await Promise.resolve();

  assert.deepEqual(harness.controller.getState(), replacementState);
  assert.deepEqual(harness.interruptions, []);
  harness.controller.dispose();
});
