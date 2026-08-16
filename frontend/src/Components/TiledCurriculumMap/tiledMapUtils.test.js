import assert from "node:assert/strict";
import { decodeGid, flattenVisibleLayers, parseLevelMarker } from "./tiledMapUtils.js";

const fallbackMarker = parseLevelMarker({
  name: "levelNumber8",
  point: true,
  x: 1477.333,
  y: 274,
});
assert.equal(fallbackMarker.markerLevelNumber, 8);
assert.equal(fallbackMarker.x, 1477.333);
assert.equal(fallbackMarker.y, 274);

const propertyMarker = parseLevelMarker({
  name: "old-name",
  point: true,
  x: 75,
  y: 597,
  properties: [{ name: "levelNumber", type: "int", value: 1 }],
});
assert.equal(propertyMarker.markerLevelNumber, 1);

const tileMarker = parseLevelMarker({
  name: "levelNumber2",
  gid: 42,
  x: 100,
  y: 200,
  width: 16,
  height: 32,
});
assert.deepEqual({ x: tileMarker.x, y: tileMarker.y }, { x: 108, y: 184 });

const flipped = decodeGid((0x80000000 | 0x40000000 | 4918) >>> 0);
assert.equal(flipped.gid, 4918);
assert.equal(flipped.flipHorizontal, true);
assert.equal(flipped.flipVertical, true);

const layers = flattenVisibleLayers([
  { id: 1, type: "tilelayer", opacity: 0.5, offsetx: 2 },
  {
    id: 2,
    type: "group",
    opacity: 0.5,
    offsety: 3,
    layers: [{ id: 3, type: "objectgroup", opacity: 0.5, offsetx: 4 }],
  },
]);
assert.deepEqual(layers.map((layer) => layer.id), [1, 3]);
assert.equal(layers[1].opacity, 0.25);
assert.equal(layers[1].offsetx, 4);
assert.equal(layers[1].offsety, 3);

console.log("Tiled map utility tests passed.");
