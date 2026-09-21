import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./MethodsSaltAgainstAswangScene.js", import.meta.url), "utf8");

function sceneMethod(name) {
  const start = source.indexOf(`\n  ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const end = source.indexOf("\n  }", start);
  assert.notEqual(end, -1, `${name} has an end`);
  const declaration = source.slice(start, end + 4).trim();
  return new Function(
    "HIT_BLUE", "ASWANG_AURA_COLOR", "ASWANG_AURA_FILL_ALPHA", "LEVEL_NUMBER", "REQUIRED_SALT_AMOUNT",
    `return ({ ${declaration} }).${name};`,
  )(0xcff7ff, 0x42101c, 0.36, 21, 5);
}

function gameObject() {
  return {
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setAlpha(alpha) { this.alpha = alpha; return this; },
    setTint(color) { this.tint = color; return this; },
    clearTint() { this.tint = null; return this; },
    setText(text) { this.text = text; return this; },
    setColor(color) { this.color = color; return this; },
    play() { return this; },
  };
}

// A Phaser ellipse supports fill styles and alpha, but has no tint methods.
function aura() {
  return {
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setAlpha(alpha) { this.alpha = alpha; return this; },
    setFillStyle(color, alpha = 1) { this.fillColor = color; this.fillAlpha = alpha; return this; },
  };
}

const scheduled = [];
const throws = [];
const scene = {
  sequenceTimers: [],
  temporaryEffects: [],
  tweens: { killTweensOf() {}, add() {} },
  markerVisuals: new Map(),
  player: gameObject(),
  aswang: gameObject(),
  aswangAura: aura(),
  callText: gameObject(),
  amountText: gameObject(),
  spawnPoint: { x: 10, y: 20 },
  aswangPoint: { x: 30, y: 40 },
  saltTarget: { x: 30, y: 40 },
  cameras: { main: { stopFollow() {} } },
  panTo() {},
  playSfx() {},
  createLandingSparkle() {},
  createHitBurst() {},
  startThrow(amount, isCorrect) { throws.push({ amount, isCorrect }); },
  schedule(_delay, callback) { scheduled.push(callback); },
};

scene.resetAttempt = sceneMethod("resetAttempt");
sceneMethod("onCodeEvaluated").call(scene, { levelNumber: 21, isCorrect: true, sourceCode: "ThrowSalt(5);" });
assert.equal(scene.aswangAura.fillColor, 0x42101c, "Run Code resets the ellipse to its original fill");
assert.equal(scene.aswangAura.fillAlpha, 0.36);
assert.equal(scene.sequenceMode, "idle");
assert.deepEqual(throws, [{ amount: 5, isCorrect: true }], "Run Code reaches the throw sequence");

sceneMethod("hitAswang").call(scene);
assert.equal(scene.aswangAura.fillColor, 0xcff7ff, "a successful hit briefly changes the ellipse fill");
assert.equal(scene.aswangAura.fillAlpha, 0.36);
scheduled[0]();
assert.equal(scene.aswangAura.fillColor, 0x42101c, "the hit callback restores the ellipse fill");

console.log("Salt Against the Aswang scene reset and hit tests passed.");
