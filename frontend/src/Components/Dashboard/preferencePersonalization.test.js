import assert from "node:assert/strict";
import test from "node:test";
import { resolvePreferenceModes } from "./preferencePersonalization.js";

const cases = [
  ["Progress + Rewards", "progress", "rewards", "progress", "rewards"],
  ["Progress + Challenges", "progress", "challenges", "progress", "challenges"],
  ["Competition + Rewards", "competition", "rewards", "competition", "rewards"],
  ["Competition + Competition", "competition", "competition", "competition", "progress"],
  ["Rewards + Rewards", "rewards", "rewards", "rewards", "progress"],
  ["Story + Exploration", "story", "exploration", "story", "progress"],
];

for (const [name, motivation, interest, primaryMode, secondaryMode] of cases) {
  test(name, () => {
    const result = resolvePreferenceModes({
      gamificationPreference: motivation,
      learningGameInterest: interest,
    });

    assert.equal(result.primaryMode, primaryMode);
    assert.equal(result.secondaryMode, secondaryMode);
  });
}

test("unset preferences use Progress + Challenges defaults", () => {
  const result = resolvePreferenceModes({});

  assert.equal(result.gamificationPreference, "progress");
  assert.equal(result.learningGameInterest, "challenges");
  assert.equal(result.primaryMode, "progress");
  assert.equal(result.secondaryMode, "challenges");
});
