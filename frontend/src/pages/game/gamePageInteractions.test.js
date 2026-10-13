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
