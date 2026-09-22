import assert from "node:assert/strict";
import test from "node:test";
import * as position from "./gameTutorialPosition.js";

const { getSpotlightRect, placeTutorialCard } = position;

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

test("reduced motion scrolls the target without the page's smooth scrolling", () => {
  let options;
  const target = { scrollIntoView(value) { options = value; } };
  position.scrollTutorialTargetIntoView(target, true);
  assert.deepEqual(options, { block: "nearest", inline: "nearest", behavior: "instant" });
});

test("an oversized target still leaves the card inside a narrow viewport", () => {
  const narrowViewport = { width: 320, height: 568 };
  const spotlight = getSpotlightRect(
    { left: -120, top: -60, width: 560, height: 690 }, narrowViewport,
  );
  const card = placeTutorialCard({
    target: spotlight,
    card: { width: 360, height: 240 },
    viewport: narrowViewport,
  });
  assert.deepEqual(spotlight, { left: 0, top: 0, right: 320, bottom: 568, width: 320, height: 568 });
  assert.ok(card.left >= 16 && card.left + 288 <= 304);
  assert.ok(card.top >= 16 && card.top + 240 <= 552);
});
