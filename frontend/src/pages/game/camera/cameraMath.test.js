import assert from "node:assert/strict";
import {
  CAMERA_DRAG_THRESHOLD,
  CAMERA_ZOOM,
  getHorizontalScrollRange,
} from "./cameraMath.js";

assert.equal(CAMERA_ZOOM, 1, "camera zoom must preserve the authored pixel scale");
assert.equal(CAMERA_DRAG_THRESHOLD, 12, "dragging must have a tap-safe threshold");

assert.deepEqual(
  getHorizontalScrollRange({ boundsX: 0, boundsWidth: 1600, viewportWidth: 800 }),
  { min: 0, max: 800 },
  "wide worlds must expose their complete right edge",
);

assert.deepEqual(
  getHorizontalScrollRange({ boundsX: 0, boundsWidth: 800, viewportWidth: 1024 }),
  { min: 0, max: 0 },
  "maps that fit must not pan into empty space",
);

assert.deepEqual(
  getHorizontalScrollRange({ boundsX: 40, boundsWidth: 1280, viewportWidth: 640 }),
  { min: 40, max: 680 },
  "non-zero camera bounds must remain clamped",
);

console.log("Responsive camera math tests passed.");
