import assert from "node:assert/strict";
import test from "node:test";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

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

class MockAudio {
  static instances = [];
  static nextPlay = null;

  constructor(src) {
    this.src = src;
    this.loop = false;
    this.preload = "";
    this.paused = true;
    this.volume = 1;
    this.currentTime = 0;
    this.playCount = 0;
    this.pauseCount = 0;
    this.loadCount = 0;
    MockAudio.instances.push(this);
  }

  addEventListener() {}
  removeAttribute() { this.src = ""; }
  load() { this.loadCount += 1; }
  async play() {
    this.playCount += 1;
    const pending = MockAudio.nextPlay;
    MockAudio.nextPlay = null;
    if (pending) await pending.promise;
    this.paused = false;
  }
  pause() {
    this.paused = true;
    this.pauseCount += 1;
  }
}

globalThis.Audio = MockAudio;
globalThis.requestAnimationFrame = (callback) => callback(performance.now() + 1000);

const { BgmManager } = await import("./bgmManager.js");
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const createManager = () => {
  MockAudio.instances = [];
  MockAudio.nextPlay = null;
  listeners.clear();
  return new BgmManager();
};

test("temporary suspension pauses and resumes the same track at its current position", async () => {
  const manager = createManager();
  await manager.playTrack("malumay");
  const audio = MockAudio.instances[0];
  audio.currentTime = 37.5;

  assert.equal(manager.pauseTemporarily("fullscreen-gate"), true);
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 37.5);
  assert.equal(manager.pauseTemporarily("fullscreen-gate"), false);

  assert.equal(manager.resumeTemporarily("fullscreen-gate"), true);
  await settle();
  assert.equal(MockAudio.instances.length, 1);
  assert.equal(manager.currentAudio, audio);
  assert.equal(audio.paused, false);
  assert.equal(audio.currentTime, 37.5);
  assert.equal(audio.playCount, 2);
  assert.equal(manager.resumeTemporarily("fullscreen-gate"), false);
});

test("temporary suspension does not start audio that was already paused or stopped", async () => {
  const manager = createManager();
  const audio = new MockAudio("/existing.mp3");
  manager.currentAudio = audio;
  manager.currentKey = "malumay";
  manager.requestedKey = "malumay";

  manager.pauseTemporarily("fullscreen-gate");
  manager.resumeTemporarily("fullscreen-gate");
  await settle();

  assert.equal(audio.playCount, 0);
  assert.equal(audio.pauseCount, 0);
  assert.equal(audio.paused, true);
});

test("multiple pause owners are idempotent and resume only after the final owner clears", async () => {
  const manager = createManager();
  await manager.playTrack("malumay");
  const audio = manager.currentAudio;

  assert.equal(manager.pauseTemporarily("fullscreen-gate"), true);
  assert.equal(manager.pauseTemporarily("fullscreen-gate"), false);
  assert.equal(manager.pauseTemporarily("route-transition"), true);
  assert.equal(manager.resumeTemporarily("fullscreen-gate"), true);
  await settle();
  assert.equal(audio.paused, true);
  assert.equal(audio.playCount, 1);

  assert.equal(manager.resumeTemporarily("route-transition"), true);
  await settle();
  assert.equal(audio.paused, false);
  assert.equal(audio.playCount, 2);
});

test("track replacement during suspension cannot revive the old audio", async () => {
  const manager = createManager();
  await manager.playTrack("malumay");
  const oldAudio = manager.currentAudio;
  manager.pauseTemporarily("fullscreen-gate");

  await manager.playTrack("ritual");
  assert.equal(oldAudio.paused, true);
  assert.equal(oldAudio.src, "");
  assert.equal(manager.requestedKey, "ritual");

  manager.resumeTemporarily("fullscreen-gate");
  await settle();
  assert.equal(oldAudio.playCount, 1);
  assert.equal(MockAudio.instances.length, 2);
  assert.equal(manager.currentAudio, MockAudio.instances[1]);
  assert.equal(MockAudio.instances[1].paused, false);
});

test("suspension during a replacement fade defers the requested new track", async () => {
  const manager = createManager();
  await manager.playTrack("malumay");
  const oldAudio = manager.currentAudio;
  const frames = [];
  globalThis.requestAnimationFrame = (callback) => frames.push(callback);

  const replacement = manager.playTrack("ritual");
  await Promise.resolve();
  assert.equal(frames.length, 1);
  manager.pauseTemporarily("fullscreen-gate");
  frames.shift()(performance.now() + 1000);
  await replacement;
  assert.equal(manager.currentAudio, oldAudio);

  globalThis.requestAnimationFrame = (callback) => callback(performance.now() + 1000);
  manager.resumeTemporarily("fullscreen-gate");
  await settle();
  assert.equal(MockAudio.instances.length, 2);
  assert.equal(manager.currentAudio, MockAudio.instances[1]);
  assert.equal(manager.currentKey, "ritual");
  assert.equal(manager.currentAudio.paused, false);
});

test("stop and navigation disposal during suspension invalidate stale resume work", async () => {
  const manager = createManager();
  await manager.playTrack("malumay");
  const audio = manager.currentAudio;
  manager.pauseTemporarily("fullscreen-gate");

  await manager.stop();
  manager.resumeTemporarily("fullscreen-gate");
  await settle();
  assert.equal(audio.playCount, 1);
  assert.equal(manager.currentAudio, null);
  assert.equal(manager.requestedKey, null);

  await manager.playTrack("ritual");
  const nextAudio = manager.currentAudio;
  manager.pauseTemporarily("fullscreen-gate");
  manager.leaveGameplay();
  await settle();
  manager.resumeTemporarily("fullscreen-gate");
  await settle();
  assert.equal(nextAudio.playCount, 1);
  assert.equal(manager.currentAudio, null);
});

test("fade-out invalidates a deferred track even before an audio object exists", async () => {
  const manager = createManager();
  manager.pauseTemporarily("fullscreen-gate");
  await manager.playTrack("malumay");
  assert.equal(manager.currentAudio, null);
  assert.equal(manager.requestedKey, "malumay");

  await manager.fadeOut();
  manager.resumeTemporarily("fullscreen-gate");
  await settle();

  assert.equal(manager.requestedKey, null);
  assert.equal(manager.currentAudio, null);
  assert.equal(MockAudio.instances.length, 0);
});

test("a pending play completion cannot bypass an active suspension", async () => {
  const manager = createManager();
  const pending = deferred();
  MockAudio.nextPlay = pending;
  const play = manager.playTrack("malumay");
  await Promise.resolve();
  const audio = manager.currentAudio;

  manager.pauseTemporarily("fullscreen-gate");
  pending.resolve();
  await play;

  assert.equal(audio.paused, true);
  assert.equal(audio.playCount, 1);
  manager.resumeTemporarily("fullscreen-gate");
  await settle();
  assert.equal(audio.paused, false);
  assert.equal(audio.playCount, 2);
});

test("rejected playback is contained and suspension blocks unlock retries", async () => {
  const manager = createManager();
  const rejection = deferred();
  MockAudio.nextPlay = rejection;
  const play = manager.playTrack("malumay");
  await Promise.resolve();
  manager.pauseTemporarily("fullscreen-gate");
  rejection.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));

  await assert.doesNotReject(play);
  assert.equal(listeners.size, 0);
  assert.equal(manager.currentAudio.paused, true);
  manager.handleUnlock();
  await settle();
  assert.equal(manager.currentAudio.playCount, 1);
});
