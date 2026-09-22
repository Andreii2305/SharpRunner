import assert from "node:assert/strict";
import test from "node:test";
import * as tutorial from "./gameTutorialSteps.js";

test("the final tour follows the observe, edit, run, evaluate, and retry loop", () => {
  assert.deepEqual(
    tutorial.GAME_TUTORIAL_STEPS.map((step) => step.id),
    ["world", "clues", "task", "editor", "run", "feedback", "hints", "ready"],
  );
});

test("each highlighted step uses the real game target and mobile panel", () => {
  assert.deepEqual(
    tutorial.GAME_TUTORIAL_STEPS.map(({ target, mobileTab }) => [target, mobileTab]),
    [
      ["world", "game"],
      ["world", "game"],
      ["task", "lesson"],
      ["editor", "code"],
      ["run", "code"],
      ["feedback", "code"],
      ["hints", "code"],
      [null, "game"],
    ],
  );
});

test("Level 1 names its actual positional clue without giving away the value", () => {
  assert.equal(typeof tutorial.getGameTutorialSteps, "function");
  const clue = tutorial.getGameTutorialSteps(1).find((step) => step.id === "clues");
  assert.match(clue.description, /Kai/i);
  assert.match(clue.description, /portal/i);
  assert.match(clue.description, /ground|tile/i);
  assert.match(clue.description, /after (?:this )?(?:tour|tutorial|guide)/i);
  assert.match(clue.description, /drag|pan|swipe/i);
  assert.doesNotMatch(clue.description, /numbered|indexed|steps\s*=\s*\d+/i);
});

test("first entry on another level uses general clue wording", () => {
  assert.equal(typeof tutorial.getGameTutorialSteps, "function");
  for (const levelNumber of [2, 3, 30]) {
    const clue = tutorial.getGameTutorialSteps(levelNumber).find((step) => step.id === "clues");
    assert.match(clue.description, /scene|world/i);
    assert.doesNotMatch(clue.description, /Kai|portal|ground tiles/i);
  }
});

test("tutorial copy teaches observation without exposing a level answer", () => {
  assert.equal(typeof tutorial.getGameTutorialSteps, "function");
  for (const levelNumber of [1, 2]) {
    const copy = tutorial.getGameTutorialSteps(levelNumber)
      .map(({ title, description }) => `${title} ${description}`).join(" ");
    assert.doesNotMatch(copy, /\b(?:int|double|string)\s+\w+\s*=\s*\S+/i);
    assert.doesNotMatch(copy, /\b(?:set|use|enter)\s+(?:the\s+value\s+)?\d+\b/i);
    assert.doesNotMatch(copy, /validator|success condition/i);
  }
});

test("feedback guidance distinguishes the initial prompt from later run results", () => {
  const feedback = tutorial.GAME_TUTORIAL_STEPS.find((step) => step.id === "feedback");
  assert.match(feedback.description, /starts with a prompt/i);
  assert.match(feedback.description, /after a run/i);
});
