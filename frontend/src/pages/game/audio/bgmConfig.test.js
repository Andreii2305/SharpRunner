import assert from "node:assert/strict";
import { BGM_CONFIG, getBgmKeyForLevel } from "./bgmConfig.js";

const expectedMappings = new Map([
  [1, "tutorial"], [5, "tutorial"],
  [6, "malumay"], [13, "malumay"],
  [14, "ritual"], [20, "ritual"],
  [21, "encounter"], [22, "encounter"],
  [23, "ancientSpirits"], [24, "ancientSpirits"],
  [26, "ancientSpirits"], [28, "ancientSpirits"],
  [29, "cemetery"], [30, "bakunawa"],
]);

for (const [levelNumber, expectedKey] of expectedMappings) {
  assert.equal(getBgmKeyForLevel(levelNumber), expectedKey, `global level ${levelNumber}`);
}

assert.equal(getBgmKeyForLevel(0), null);
assert.equal(getBgmKeyForLevel(25), null);
assert.equal(getBgmKeyForLevel(31), null);
assert.equal(Object.keys(BGM_CONFIG).length, 7);

for (const [key, config] of Object.entries(BGM_CONFIG)) {
  assert.equal(config.loop, true, `${key} must loop`);
  assert.match(config.path, /\/game\/assets\/sounds\/bgm\/bgm_[a-z_]+\.mp3$/);
}

const storedValues = new Map();
const listeners = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => storedValues.get(key) ?? null,
    setItem: (key, value) => storedValues.set(key, value),
  },
  addEventListener: (event, handler) => listeners.set(event, handler),
  removeEventListener: (event) => listeners.delete(event),
};

const { readAudioPreferences, saveAudioPreferences } = await import("./audioPreferences.js");
const savedPreferences = { bgmVolume: 22, bgmMuted: true, sfxVolume: 61, sfxMuted: false };
saveAudioPreferences(savedPreferences);
assert.deepEqual(readAudioPreferences(), savedPreferences);

class MockAudio {
  static instances = [];

  constructor(src) {
    this.src = src;
    this.loop = false;
    this.paused = true;
    this.volume = 1;
    this.pauseCount = 0;
    MockAudio.instances.push(this);
  }

  addEventListener() {}
  load() {}
  removeAttribute() { this.src = ""; }
  async play() { this.paused = false; }
  pause() { this.paused = true; this.pauseCount += 1; }
}

globalThis.Audio = MockAudio;
globalThis.requestAnimationFrame = (callback) => callback(performance.now() + 1000);

// Start unmuted for playback lifecycle checks.
saveAudioPreferences({ ...savedPreferences, bgmMuted: false });
const { bgmManager } = await import("./bgmManager.js");
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

bgmManager.playForLevel(6);
await settle();
assert.equal(MockAudio.instances.length, 1);
assert.equal(MockAudio.instances[0].loop, true);
assert.equal(MockAudio.instances[0].volume, 0.22);

bgmManager.playForLevel(7);
await settle();
assert.equal(MockAudio.instances.length, 1, "same-category levels reuse the active audio");

bgmManager.playForLevel(14);
await settle();
assert.equal(MockAudio.instances.length, 2, "a category change creates exactly one replacement");
assert.equal(MockAudio.instances[0].paused, true);

bgmManager.setMusicPreferences({ volume: 15, muted: true });
assert.equal(MockAudio.instances[1].volume, 0, "music mute is immediate");
bgmManager.leaveGameplay();
await settle();
assert.equal(MockAudio.instances[1].paused, true, "leaving gameplay releases playback");

console.log("BGM config, persistence, and lifecycle tests passed.");
