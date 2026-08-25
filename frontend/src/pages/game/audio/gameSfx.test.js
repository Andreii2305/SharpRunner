import assert from "node:assert/strict";
import {
  GAME_SFX,
  GAME_SFX_BASE_PATH,
  cleanupGameSfx,
  getGameSfxForLevel,
  getSfxCacheKey,
  playGameSfx,
  preloadGameSfx,
  stopGameSfx,
} from "./gameSfx.js";

assert.equal(Object.keys(GAME_SFX).length, 21);
assert.ok(Object.values(GAME_SFX).every(({ volume }) => volume >= 0.2 && volume <= 0.5));
assert.deepEqual(getGameSfxForLevel(29), [
  "scan", "scanError", "ghostFade", "spiritRelease", "moonRestore", "successMagic", "errorMagic",
]);
assert.deepEqual(getGameSfxForLevel(999), ["successMagic", "errorMagic"]);

const loaded = [];
const listeners = new Map();
let now = 1000;
let playCount = 0;
let stopped = 0;
const loopSound = { play() {}, stop() { stopped += 1; }, destroy() {} };
const scene = {
  load: { audio: (key, path) => loaded.push({ key, path }) },
  cache: { audio: { exists: () => true } },
  sound: {
    mute: false,
    volume: 0.5,
    play: () => { playCount += 1; },
    add: () => loopSound,
  },
  time: { get now() { return now; } },
  events: { once: (event, callback) => listeners.set(event, callback) },
};

preloadGameSfx(scene, ["scan", "scan", "scanError"]);
assert.deepEqual(loaded, [
  { key: getSfxCacheKey("scan"), path: `${GAME_SFX_BASE_PATH}/scan.mp3` },
  { key: getSfxCacheKey("scanError"), path: `${GAME_SFX_BASE_PATH}/scan_error.mp3` },
]);

assert.equal(playGameSfx(scene, "scan"), true);
assert.equal(playGameSfx(scene, "scan"), null, "cooldown prevents scan spam");
now += 101;
assert.equal(playGameSfx(scene, "scan", { rate: 1.03 }), true);
assert.equal(playCount, 2);

scene.sound.mute = true;
assert.equal(playGameSfx(scene, "scanError"), null, "mute prevents gameplay SFX");
scene.sound.mute = false;
assert.equal(playGameSfx(scene, "fireLoop"), loopSound);
assert.equal(playGameSfx(scene, "fireLoop"), loopSound, "only one loop instance is created");
stopGameSfx(scene, "fireLoop");
assert.equal(stopped, 1);
cleanupGameSfx(scene);

console.log("Gameplay SFX registry, mute, cooldown, and loop cleanup tests passed.");
