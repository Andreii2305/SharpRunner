import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { subscribeGameOutcomeSfx } from "./gameOutcomeSfxHandler.js";

const GAME_LEVEL_OUTCOME = "game:level:outcome";

const createHarness = ({ events = new EventEmitter(), initiallyPaused = false } = {}) => {
  const scene = { key: "level-scene" };
  const game = {
    scene: {
      getScene: (sceneKey) => (sceneKey === "level-scene" ? scene : null),
    },
  };
  const played = [];
  let paused = initiallyPaused;
  const cleanup = subscribeGameOutcomeSfx({
    events,
    eventName: GAME_LEVEL_OUTCOME,
    levelNumber: 7,
    sceneKey: "level-scene",
    getGame: () => game,
    getPaused: () => paused,
    playSfx: (activeScene, soundName) => played.push({ activeScene, soundName }),
  });

  return {
    cleanup,
    events,
    played,
    scene,
    setPaused: (nextPaused) => {
      paused = nextPaused;
    },
  };
};

test("late success and failure outcomes stay silent while gameplay is paused", () => {
  const harness = createHarness({ initiallyPaused: true });

  harness.events.emit(GAME_LEVEL_OUTCOME, { levelNumber: 7, status: "success" });
  harness.events.emit(GAME_LEVEL_OUTCOME, { levelNumber: 7, status: "failure" });

  assert.deepEqual(harness.played, []);
  harness.cleanup();
});

test("the listener reads current pause state and never replays suppressed outcome sounds", () => {
  const harness = createHarness();

  harness.events.emit(GAME_LEVEL_OUTCOME, { levelNumber: 7, status: "success" });
  harness.setPaused(true);
  harness.events.emit(GAME_LEVEL_OUTCOME, { levelNumber: 7, status: "failure" });
  harness.setPaused(false);

  assert.deepEqual(harness.played, [
    { activeScene: harness.scene, soundName: "successMagic" },
  ]);

  harness.events.emit(GAME_LEVEL_OUTCOME, { levelNumber: 7, status: "failure" });
  assert.deepEqual(harness.played, [
    { activeScene: harness.scene, soundName: "successMagic" },
    { activeScene: harness.scene, soundName: "errorMagic" },
  ]);
  harness.cleanup();
});

test("replacement and cleanup leave exactly one current outcome listener", () => {
  const events = new EventEmitter();
  const first = createHarness({ events });
  first.cleanup();
  const second = createHarness({ events });

  events.emit(GAME_LEVEL_OUTCOME, { levelNumber: 8, status: "success" });
  events.emit(GAME_LEVEL_OUTCOME, { levelNumber: 7, status: "success" });
  assert.deepEqual(first.played, []);
  assert.equal(second.played.length, 1);

  second.cleanup();
  second.cleanup();
  events.emit(GAME_LEVEL_OUTCOME, { levelNumber: 7, status: "failure" });
  assert.equal(second.played.length, 1);
});
