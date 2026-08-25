import assert from "node:assert/strict";
import {
  DIALOGUE_SFX_CONFIG,
  DialogueSfxManager,
  isDialogueSoundCharacter,
  shouldPlayDialogueBlip,
  shouldPlayDialogueBlipForProgress,
} from "./dialogueSfxManager.js";

assert.equal(isDialogueSoundCharacter("H"), true);
assert.equal(isDialogueSoundCharacter("7"), true);
assert.equal(isDialogueSoundCharacter("ñ"), true);
assert.equal(isDialogueSoundCharacter(" "), false);
assert.equal(isDialogueSoundCharacter("!"), false);

const sample = "Hello, traveler.";
const triggerCharacters = [...sample].filter((_, index) => shouldPlayDialogueBlip(sample, index));
assert.deepEqual(triggerCharacters, ["l", "t", "v", "e"]);
assert.equal(shouldPlayDialogueBlip(sample, sample.indexOf(",")), false);
assert.equal(shouldPlayDialogueBlip(sample, sample.indexOf(" ")), false);
assert.equal(shouldPlayDialogueBlipForProgress(sample, 2, 3), true);
assert.equal(
  shouldPlayDialogueBlipForProgress(sample, 3, sample.length),
  false,
  "instant reveal never queues a final or intermediate blip",
);

class MockAudio {
  constructor() {
    this.currentTime = 4;
    this.pauseCount = 0;
    this.playCount = 0;
    this.listeners = new Map();
  }

  addEventListener(event, listener) {
    this.listeners.set(event, listener);
  }

  load() {}

  pause() {
    this.pauseCount += 1;
  }

  play() {
    this.playCount += 1;
    return Promise.resolve();
  }
}

let now = 100;
const audio = new MockAudio();
const manager = new DialogueSfxManager({
  audioFactory: () => audio,
  now: () => now,
  random: () => 0.5,
});

manager.setSfxPreferences({ volume: 50, muted: false });
assert.equal(manager.playBlip(), true);
assert.equal(audio.src, DIALOGUE_SFX_CONFIG.path);
assert.equal(audio.volume, 0.3);
assert.equal(audio.playbackRate, 1);
assert.equal(audio.playCount, 1);

now += 30;
assert.equal(manager.playBlip(), false, "rate limiting prevents overlapping audio spam");
assert.equal(audio.playCount, 1);

now += 30;
assert.equal(manager.playBlip(), true);
assert.equal(audio.playCount, 2);
assert.ok(audio.pauseCount >= 2, "the shared sound is stopped before restart");

audio.currentTime = 0.4;
const pausesBeforeCompletion = audio.pauseCount;
manager.stop();
assert.equal(audio.currentTime, 0, "dialogue completion rewinds the active blip");
assert.equal(audio.pauseCount, pausesBeforeCompletion + 1, "dialogue completion stops playback");

manager.setSfxPreferences({ volume: 50, muted: true });
now += 100;
assert.equal(manager.playBlip(), false, "SFX mute applies immediately");
manager.setSfxPreferences({ volume: 0, muted: false });
assert.equal(manager.playBlip(), false, "zero SFX volume stays silent");

console.log("Dialogue SFX cadence, settings, and playback tests passed.");
