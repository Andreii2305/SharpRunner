import assert from "node:assert/strict";
import test from "node:test";
import { getSpotlightRect, placeTutorialCard } from "./gameTutorialPosition.js";

const viewport = { width: 800, height: 600 };

test("missing or invisible targets get a centered card without a spotlight", () => {
  assert.equal(getSpotlightRect(null, viewport), null);
  assert.equal(getSpotlightRect({ left: 10, top: 10, width: 0, height: 20 }, viewport), null);
  const card = placeTutorialCard({ target: null, card: { width: 300, height: 180 }, viewport });
  assert.deepEqual(card, { left: 250, top: 210, placement: "center" });
});

test("spotlight padding stays within the viewport", () => {
  assert.deepEqual(
    getSpotlightRect({ left: 3, top: 5, width: 100, height: 60 }, viewport, 8),
    { left: 0, top: 0, right: 111, bottom: 73, width: 111, height: 73 },
  );
});

test("card flips above a low target and remains inside safe margins", () => {
  const result = placeTutorialCard({
    target: { left: 300, top: 470, right: 500, bottom: 570, width: 200, height: 100 },
    card: { width: 320, height: 160 },
    viewport,
    preferred: "bottom",
  });
  assert.deepEqual(result, { left: 240, top: 296, placement: "top" });
});

test("when no side fits, the card stays near the target with the least overlap", () => {
  const result = placeTutorialCard({
    target: { left: 100, top: 100, right: 700, bottom: 500, width: 600, height: 400 },
    card: { width: 360, height: 240 },
    viewport,
    preferred: "bottom",
  });
  assert.deepEqual(result, { left: 220, top: 344, placement: "bottom" });
});
