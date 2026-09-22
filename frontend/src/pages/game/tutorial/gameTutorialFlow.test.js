import assert from "node:assert/strict";
import test from "node:test";
import * as flow from "./gameTutorialFlow.js";
import { readTutorialCompletion } from "./gameTutorialState.js";

const makeStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

test("Skip and Finish both complete onboarding before the initial story starts", () => {
  assert.equal(typeof flow.finishGameTutorialSession, "function");
  for (const action of ["Skip", "Finish"]) {
    const storage = makeStorage();
    const next = flow.finishGameTutorialSession({ storage, userId: 42, deferredIntro: true });
    assert.deepEqual(next, { kind: "intro" }, action);
    assert.equal(readTutorialCompletion(storage, 42), true, action);
  }
});

test("a scene-triggered dialogue queued during onboarding opens after the tour", () => {
  assert.equal(typeof flow.finishGameTutorialSession, "function");
  const pendingDialogue = { levelNumber: 2, dialogueId: "gatekeeper", dialogueSteps: [] };
  const next = flow.finishGameTutorialSession({
    storage: makeStorage(), userId: 42, deferredIntro: true, pendingDialogue,
  });
  assert.deepEqual(next, { kind: "triggered", payload: pendingDialogue });
});

test("replay completion does not start a story when none was deferred", () => {
  assert.equal(typeof flow.finishGameTutorialSession, "function");
  const storage = makeStorage();
  flow.finishGameTutorialSession({ storage, userId: 42 });
  const next = flow.finishGameTutorialSession({ storage, userId: 42 });
  assert.deepEqual(next, { kind: "none" });
  assert.equal(readTutorialCompletion(storage, 42), true);
});
