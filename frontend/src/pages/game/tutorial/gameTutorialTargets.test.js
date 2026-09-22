import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getGameTutorialSteps } from "./gameTutorialSteps.js";

test("every configured spotlight target is registered by GamePage", () => {
  const page = readFileSync(new URL("../GamePage.jsx", import.meta.url), "utf8");
  const registeredTargets = new Set(
    [...page.matchAll(/data-game-tutorial-target="([a-z]+)"/g)].map((match) => match[1]),
  );
  const requiredTargets = new Set(getGameTutorialSteps(1).map((step) => step.target).filter(Boolean));
  assert.deepEqual(registeredTargets, requiredTargets);
});

test("the game header names the replay control for sighted and screen-reader users", () => {
  const page = readFileSync(new URL("../GamePage.jsx", import.meta.url), "utf8");
  assert.match(page, /aria-label="Replay game tutorial"/);
  assert.match(page, />\s*Tutorial\s*<\/button>/);
});
