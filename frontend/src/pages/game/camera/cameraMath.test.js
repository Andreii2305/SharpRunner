import assert from "node:assert/strict";
import {
  CAMERA_MAX_ZOOM,
  CAMERA_MIN_ZOOM,
  CAMERA_DRAG_THRESHOLD,
  getAnchoredVerticalScroll,
  getHorizontalScrollRange,
  getResponsiveCameraZoom,
  getVerticalScrollRange,
} from "./cameraMath.js";

assert.equal(CAMERA_MIN_ZOOM, 0.875, "compact zoom must keep 32px tiles on whole pixels");
assert.equal(CAMERA_MAX_ZOOM, 1, "desktop zoom must preserve the authored pixel scale");
assert.equal(CAMERA_DRAG_THRESHOLD, 12, "dragging must have a tap-safe threshold");

for (const [viewportWidth, viewportHeight] of [[667, 243], [844, 258], [915, 280]]) {
  assert.equal(
    getResponsiveCameraZoom({ viewportWidth, viewportHeight }),
    0.875,
    `${viewportWidth}x${viewportHeight} compact gameplay must use the bounded landscape zoom`,
  );
}

assert.equal(
  getResponsiveCameraZoom({ viewportWidth: 700, viewportHeight: 394 }),
  1,
  "desktop gameplay must retain the authored zoom",
);

assert.equal(
  getResponsiveCameraZoom({ viewportWidth: 390, viewportHeight: 712 }),
  1,
  "portrait is blocked rather than zoomed into a different composition",
);

assert.deepEqual(
  getHorizontalScrollRange({ boundsX: 0, boundsWidth: 1600, viewportWidth: 800 }),
  { min: 0, max: 800 },
  "wide worlds must expose their complete right edge",
);

assert.deepEqual(
  getVerticalScrollRange({
    boundsY: 0,
    boundsHeight: 576,
    viewportHeight: 258,
  }),
  { min: 0, max: 318 },
  "camera bounds must remain in stable Tiled world coordinates",
);

const compactVerticalRange = getVerticalScrollRange({
  boundsY: 0,
  boundsHeight: 576,
  viewportHeight: 243,
  zoom: 0.875,
});
assert.ok(
  Math.abs(compactVerticalRange.min - 17.35714285714286) < 1e-9
    && Math.abs(compactVerticalRange.max - 315.6428571428571) < 1e-9,
  "compact zoom must keep the authored map inside the vertical camera bounds",
);

for (const [viewportWidth, viewportHeight] of [
  [667, 375],
  [844, 390],
  [915, 412],
  [768, 1024],
  [1366, 768],
]) {
  const scrollY = getAnchoredVerticalScroll({
    anchorY: 448,
    boundsY: 0,
    boundsHeight: 576,
    viewportHeight,
    zoom: getResponsiveCameraZoom({ viewportWidth, viewportHeight }),
  });
  const range = getVerticalScrollRange({
    boundsY: 0,
    boundsHeight: 576,
    viewportHeight,
    zoom: getResponsiveCameraZoom({ viewportWidth, viewportHeight }),
  });
  assert.ok(scrollY >= range.min && scrollY <= range.max, `${viewportWidth}x${viewportHeight} must stay bounded`);
}

assert.equal(
  getAnchoredVerticalScroll({
    anchorY: 322,
    boundsY: 0,
    boundsHeight: 576,
    viewportHeight: 243,
  }),
  156.76,
  "low-ground maps must frame their gameplay anchor instead of the map bottom",
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
