import assert from "node:assert/strict";
import test from "node:test";
import {
  getTutorialStorageKey,
  readTutorialCompletion,
  markTutorialComplete,
  moveTutorialStep,
  shouldOpenTutorial,
} from "./gameTutorialState.js";

const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

test("an account's first game visit is incomplete until completion is stored", () => {
  const local = storage();
  assert.equal(readTutorialCompletion(local, 42), false);
  assert.equal(markTutorialComplete(local, 42), true);
  assert.equal(readTutorialCompletion(local, 42), true);
  assert.equal(readTutorialCompletion(local, 43), false);
  assert.match(getTutorialStorageKey(42), /:42$/);
});

test("completion writes fail safely and do not claim a completed visit", () => {
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(readTutorialCompletion(blocked, 42), false);
  assert.equal(markTutorialComplete(blocked, 42), false);
  assert.equal(readTutorialCompletion(null, 42), false);
  assert.equal(markTutorialComplete(null, 42), false);
});

test("Back and Next stop at the first and last steps", () => {
  assert.equal(moveTutorialStep(0, "back", 3), 0);
  assert.equal(moveTutorialStep(0, "next", 3), 1);
  assert.equal(moveTutorialStep(1, "back", 3), 0);
  assert.equal(moveTutorialStep(2, "next", 3), 2);
});

test("completed visitors stay closed automatically but can replay without clearing completion", () => {
  const local = storage();
  assert.equal(shouldOpenTutorial(local, 42), true);
  markTutorialComplete(local, 42);
  assert.equal(shouldOpenTutorial(local, 42), false);
  assert.equal(shouldOpenTutorial(local, 42, { replay: true }), true);
  assert.equal(readTutorialCompletion(local, 42), true);
});

test("Skip and Finish both persist completion through the shared close action", () => {
  for (const action of ["Skip", "Finish"]) {
    const local = storage();
    assert.equal(markTutorialComplete(local, 42), true, action);
    assert.equal(shouldOpenTutorial(local, 42), false, action);
  }
});
