import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const gameRoot = resolve(import.meta.dirname, "..");
const readGameSource = (relativePath) => readFileSync(resolve(gameRoot, relativePath), "utf8");

const tikbalangSource = readGameSource("scenes/ArraysLevelSixScene.js");
assert.match(tikbalangSource, /startOpeningCameraPreview\(\)/, "Tikbalang must retain its authored opening preview");
assert.match(
  tikbalangSource,
  /setCameraScrollX\(scrollX\)[\s\S]*?this\.cameras\.main\.scrollX = clamped;/,
  "horizontal inspection must not reset responsive vertical framing",
);
assert.doesNotMatch(
  tikbalangSource,
  /setCameraScrollX\(scrollX\)[\s\S]*?setScroll\(clamped,[\s\S]*?\n  }/,
  "returning player control must not force the Tikbalang camera to world Y zero",
);

const stairsSource = readGameSource("scenes/MethodsEndlessBambooStairsScene.js");
assert.match(
  stairsSource,
  /panTo\(x, duration = 600, worldY = this\.spawnPoint\.y\)/,
  "Bamboo Stairs pans must support authored vertical targets",
);
assert.match(stairsSource, /this\.panTo\(this\.shrinePoint\.x, 540, this\.shrinePoint\.y\)/);
assert.match(stairsSource, /this\.stairPoints\[2\]\?\.y \?\? this\.spawnPoint\.y/);
assert.match(stairsSource, /startFollow\(this\.player, true, 0\.08, 0\.08\)/);

const bakunawaSource = readGameSource("scenes/FunctionsArraysBakunawaEclipseScene.js");
assert.match(
  bakunawaSource,
  /isResponsiveCameraFramingLocked\(\)[\s\S]*?this\.mode !== "idle"/,
  "Bakunawa resize must preserve every authored non-gameplay camera sequence",
);
assert.match(
  bakunawaSource,
  /beginPostEclipseDialogue\(\)[\s\S]*?this\.mode = "idle";[\s\S]*?this\.cameras\.main\.scrollX = 0;[\s\S]*?this\.responsiveCamera\?\.frameGameplayAnchor\(\)/,
  "Bakunawa must restore player framing when its opening cinematic yields to gameplay",
);

const pluginSource = readGameSource("camera/ResponsiveCameraPlugin.js");
assert.match(pluginSource, /isResponsiveCameraFramingLocked\?\.\(\)/);
assert.doesNotMatch(
  pluginSource,
  /onResize\(gameSize\)[\s\S]*?manualCameraEnabled !== false[\s\S]*?\n  }/,
  "fullscreen resize framing must not depend on manual camera controls",
);

console.log("Targeted responsive scene camera regression tests passed.");
