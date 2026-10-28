import assert from "node:assert/strict";
import test from "node:test";
import { createPhaserPauseBridge } from "./gamePhaserPauseBridge.js";

const createSound = ({ playing = false, paused = false } = {}) => ({
  isPlaying: playing,
  isPaused: paused,
  pauseCalls: 0,
  resumeCalls: 0,
  pause() {
    this.pauseCalls += 1;
    if (!this.isPlaying || this.isPaused) return false;
    this.isPlaying = false;
    this.isPaused = true;
    return true;
  },
  resume() {
    this.resumeCalls += 1;
    if (!this.isPaused || this.isPlaying) return false;
    this.isPlaying = true;
    this.isPaused = false;
    return true;
  },
  stop() {
    this.isPlaying = false;
    this.isPaused = false;
  },
});

const createScene = () => ({
  input: {
    keyboard: {
      resetCalls: 0,
      resetKeys() { this.resetCalls += 1; },
    },
    pointerResetCalls: 0,
    resetPointers() { this.pointerResetCalls += 1; },
  },
});

const createGame = ({ paused = false, sounds = [], scenes = [createScene()] } = {}) => ({
  isPaused: paused,
  pauseCalls: 0,
  resumeCalls: 0,
  destroyCalls: 0,
  pause() {
    this.pauseCalls += 1;
    this.isPaused = true;
  },
  resume() {
    this.resumeCalls += 1;
    this.isPaused = false;
  },
  destroy() {
    this.destroyCalls += 1;
  },
  scene: {
    scenes,
    getScenes(activeOnly) {
      assert.equal(activeOnly, true);
      return this.scenes;
    },
  },
  sound: {
    sounds,
    getAllPlaying() {
      return this.sounds.filter((sound) => sound.isPlaying);
    },
  },
});

test("the bridge defaults to running and leaves a newly attached game unchanged", () => {
  const game = createGame({ sounds: [createSound({ playing: true })] });
  const bridge = createPhaserPauseBridge();

  bridge.attach(game);

  assert.equal(game.pauseCalls, 0);
  assert.equal(game.resumeCalls, 0);
  assert.equal(game.sound.sounds[0].pauseCalls, 0);
  bridge.dispose();
});

test("a pause requested before asynchronous game initialization applies on attach", () => {
  const game = createGame({ sounds: [createSound({ playing: true })] });
  const bridge = createPhaserPauseBridge();

  bridge.setPaused(true);
  bridge.attach(game);

  assert.equal(game.isPaused, true);
  assert.equal(game.pauseCalls, 1);
  assert.equal(game.sound.sounds[0].isPaused, true);
  bridge.dispose();
});

test("pause and resume preserve the same game and scene instances", () => {
  const scene = createScene();
  const game = createGame({ scenes: [scene] });
  const bridge = createPhaserPauseBridge();
  bridge.attach(game);

  bridge.setPaused(true);
  bridge.setPaused(false);

  assert.equal(game.scene.scenes[0], scene);
  assert.equal(game.destroyCalls, 0);
  assert.equal(game.pauseCalls, 1);
  assert.equal(game.resumeCalls, 1);
  bridge.dispose();
});

test("repeated pause and resume updates are idempotent", () => {
  const playing = createSound({ playing: true });
  const game = createGame({ sounds: [playing] });
  const bridge = createPhaserPauseBridge();
  bridge.attach(game);

  bridge.setPaused(true);
  bridge.setPaused(true);
  bridge.setPaused(false);
  bridge.setPaused(false);

  assert.equal(game.pauseCalls, 1);
  assert.equal(game.resumeCalls, 1);
  assert.equal(playing.pauseCalls, 1);
  assert.equal(playing.resumeCalls, 1);
  bridge.dispose();
});

test("only audio paused by the bridge is resumed", () => {
  const playing = createSound({ playing: true });
  const independentlyPaused = createSound({ paused: true });
  const stopped = createSound();
  const game = createGame({ sounds: [playing, independentlyPaused, stopped] });
  const bridge = createPhaserPauseBridge();
  bridge.attach(game);

  bridge.setPaused(true);
  playing.stop();
  bridge.setPaused(false);

  assert.equal(playing.resumeCalls, 0);
  assert.equal(independentlyPaused.pauseCalls, 0);
  assert.equal(independentlyPaused.resumeCalls, 0);
  assert.equal(stopped.pauseCalls, 0);
  assert.equal(stopped.resumeCalls, 0);
  bridge.dispose();
});

test("bridge-owned playing audio resumes while independently paused audio remains paused", () => {
  const playing = createSound({ playing: true });
  const independentlyPaused = createSound({ paused: true });
  const game = createGame({ sounds: [playing, independentlyPaused] });
  const bridge = createPhaserPauseBridge();
  bridge.attach(game);

  bridge.setPaused(true);
  bridge.setPaused(false);

  assert.equal(playing.resumeCalls, 1);
  assert.equal(playing.isPlaying, true);
  assert.equal(independentlyPaused.resumeCalls, 0);
  assert.equal(independentlyPaused.isPaused, true);
  bridge.dispose();
});

test("a pre-existing whole-game pause is not cleared by the bridge", () => {
  const playing = createSound({ playing: true });
  const game = createGame({ paused: true, sounds: [playing] });
  const bridge = createPhaserPauseBridge();
  bridge.attach(game);

  bridge.setPaused(true);
  bridge.setPaused(false);

  assert.equal(game.pauseCalls, 0);
  assert.equal(game.resumeCalls, 0);
  assert.equal(game.isPaused, true);
  assert.equal(playing.pauseCalls, 1);
  assert.equal(playing.resumeCalls, 0);
  assert.equal(playing.isPaused, true);
  bridge.dispose();
});

test("keyboard and pointer state reset on both sides of a pause", () => {
  const scene = createScene();
  const game = createGame({ scenes: [scene] });
  const bridge = createPhaserPauseBridge();
  bridge.attach(game);

  bridge.setPaused(true);
  bridge.setPaused(false);

  assert.equal(scene.input.keyboard.resetCalls, 2);
  assert.equal(scene.input.pointerResetCalls, 2);
  bridge.dispose();
});

test("detaching a replaced game never resumes or mutates it later", () => {
  const oldSound = createSound({ playing: true });
  const oldGame = createGame({ sounds: [oldSound] });
  const newGame = createGame();
  const bridge = createPhaserPauseBridge();
  bridge.attach(oldGame);
  bridge.setPaused(true);

  bridge.detach(oldGame);
  bridge.attach(newGame);
  bridge.setPaused(false);

  assert.equal(oldGame.resumeCalls, 0);
  assert.equal(oldSound.resumeCalls, 0);
  assert.equal(newGame.resumeCalls, 1);
  bridge.dispose();
});

test("dispose never resumes the current game or bridge-paused audio", () => {
  const sound = createSound({ playing: true });
  const game = createGame({ sounds: [sound] });
  const bridge = createPhaserPauseBridge();
  bridge.attach(game);
  bridge.setPaused(true);

  bridge.dispose();
  bridge.setPaused(false);

  assert.equal(game.resumeCalls, 0);
  assert.equal(sound.resumeCalls, 0);
});
