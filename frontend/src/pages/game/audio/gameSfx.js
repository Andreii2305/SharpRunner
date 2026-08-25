export const GAME_SFX = Object.freeze({
  bossHit: { file: "boss_hit.mp3", volume: 0.45, cooldownMs: 180 },
  enemyRetreat: { file: "enemy_retreat.mp3", volume: 0.38, cooldownMs: 300 },
  energyCharge: { file: "energy_charge.mp3", volume: 0.32, cooldownMs: 600 },
  errorMagic: { file: "error_magic.wav", volume: 0.28, cooldownMs: 350 },
  fireLoop: { file: "fire.mp3", volume: 0.2, cooldownMs: 0, loop: true },
  fireExtinguish: { file: "fire_extinguish.mp3", volume: 0.34, cooldownMs: 180 },
  fireIgnite: { file: "fire_ignite.mp3", volume: 0.32, cooldownMs: 120 },
  ghostFade: { file: "ghost_fade.wav", volume: 0.28, cooldownMs: 160 },
  heal: { file: "heal.mp3", volume: 0.34, cooldownMs: 300 },
  impactSoft: { file: "impact_soft.wav", volume: 0.3, cooldownMs: 140 },
  itemCollect: { file: "item_collect.mp3", volume: 0.32, cooldownMs: 100 },
  magicActivate: { file: "magic_activate.wav", volume: 0.34, cooldownMs: 220 },
  magicPulse: { file: "magic_pulse.mp3", volume: 0.24, cooldownMs: 90 },
  moonRestore: { file: "moon_restore.mp3", volume: 0.42, cooldownMs: 700 },
  objectShake: { file: "object_shake.mp3", volume: 0.3, cooldownMs: 180 },
  scan: { file: "scan.mp3", volume: 0.24, cooldownMs: 100 },
  scanError: { file: "scan_error.mp3", volume: 0.3, cooldownMs: 180 },
  shieldHit: { file: "shield_hit.mp3", volume: 0.48, cooldownMs: 180 },
  spiritRelease: { file: "spirit_release.mp3", volume: 0.28, cooldownMs: 130 },
  stepSpawn: { file: "step_spawn.mp3", volume: 0.24, cooldownMs: 70 },
  successMagic: { file: "success_magic.wav", volume: 0.4, cooldownMs: 800 },
});

export const GAME_SFX_BASE_PATH = "/game/assets/sounds/sfx";
const KEY_PREFIX = "sr_sfx_";
const stateByScene = new WeakMap();

const LEVEL_SFX = Object.freeze({
  1: ["magicActivate", "impactSoft"],
  2: ["magicActivate", "impactSoft"],
  3: ["magicPulse", "itemCollect", "impactSoft"],
  4: ["itemCollect", "magicActivate"],
  5: ["magicPulse", "magicActivate"],
  6: ["fireIgnite", "magicActivate"],
  7: ["itemCollect", "objectShake", "enemyRetreat"],
  8: ["fireLoop", "impactSoft", "fireExtinguish"],
  9: ["itemCollect", "objectShake", "magicActivate"],
  10: ["magicPulse", "magicActivate", "impactSoft"],
  11: ["magicActivate", "errorMagic"],
  12: ["scan", "scanError", "fireIgnite", "fireExtinguish"],
  13: ["scan", "scanError", "magicPulse", "itemCollect", "enemyRetreat"],
  14: ["energyCharge", "magicPulse", "magicActivate"],
  15: ["magicActivate", "ghostFade"],
  16: ["fireIgnite", "fireLoop", "fireExtinguish"],
  17: ["energyCharge", "magicActivate", "enemyRetreat"],
  18: ["scan", "magicPulse", "magicActivate"],
  19: ["scan", "magicActivate"],
  20: ["itemCollect", "magicActivate", "errorMagic"],
  21: ["magicPulse", "impactSoft", "bossHit", "enemyRetreat"],
  22: ["energyCharge", "magicActivate", "shieldHit", "impactSoft"],
  23: ["energyCharge", "heal", "magicPulse"],
  24: ["stepSpawn", "energyCharge", "magicPulse"],
  26: ["fireIgnite", "magicActivate"],
  27: ["scan", "scanError", "magicPulse"],
  28: ["energyCharge", "magicPulse", "magicActivate"],
  29: ["scan", "scanError", "ghostFade", "spiritRelease", "moonRestore"],
  30: ["energyCharge", "magicPulse", "bossHit", "impactSoft", "enemyRetreat", "moonRestore"],
});

export const getGameSfxForLevel = (levelNumber) => [
  ...new Set([...(LEVEL_SFX[Number(levelNumber)] ?? []), "successMagic", "errorMagic"]),
];

export const getSfxCacheKey = (name) => `${KEY_PREFIX}${name}`;

const getState = (scene) => {
  let state = stateByScene.get(scene);
  if (!state) {
    state = { lastPlayedAt: new Map(), loops: new Map(), cleanupBound: false };
    stateByScene.set(scene, state);
  }
  return state;
};

export const preloadGameSfx = (scene, names) => {
  if (!scene?.load?.audio) return;
  [...new Set(names)].forEach((name) => {
    const config = GAME_SFX[name];
    if (config) scene.load.audio(getSfxCacheKey(name), `${GAME_SFX_BASE_PATH}/${config.file}`);
  });
};

export const stopGameSfx = (scene, name) => {
  const state = stateByScene.get(scene);
  const sound = state?.loops.get(name);
  if (!sound) return;
  try {
    sound.stop();
    sound.destroy?.();
  } catch {
    // Audio cleanup is best effort and must never interrupt scene shutdown.
  }
  state.loops.delete(name);
};

export const cleanupGameSfx = (scene) => {
  const state = stateByScene.get(scene);
  if (!state) return;
  [...state.loops.keys()].forEach((name) => stopGameSfx(scene, name));
  state.lastPlayedAt.clear();
};

const bindCleanup = (scene, state) => {
  if (state.cleanupBound || !scene?.events?.once) return;
  state.cleanupBound = true;
  scene.events.once("shutdown", () => cleanupGameSfx(scene));
  scene.events.once("destroy", () => cleanupGameSfx(scene));
};

export const playGameSfx = (scene, name, options = {}) => {
  const config = GAME_SFX[name];
  if (!config || !scene?.sound || scene.sound.mute || scene.sound.volume <= 0) return null;
  const cacheKey = getSfxCacheKey(name);
  if (scene.cache?.audio?.exists && !scene.cache.audio.exists(cacheKey)) return null;

  const state = getState(scene);
  bindCleanup(scene, state);
  const now = scene.time?.now ?? Date.now();
  const cooldownMs = options.cooldownMs ?? config.cooldownMs ?? 0;
  if (now - (state.lastPlayedAt.get(name) ?? -Infinity) < cooldownMs) return null;

  const loop = options.loop ?? config.loop ?? false;
  if (loop && state.loops.has(name)) return state.loops.get(name);

  try {
    const soundConfig = {
      volume: Math.min(1, Math.max(0, options.volume ?? config.volume)),
      rate: Math.min(1.1, Math.max(0.9, options.rate ?? 1)),
      loop,
    };
    state.lastPlayedAt.set(name, now);
    if (!loop) {
      scene.sound.play(cacheKey, soundConfig);
      return true;
    }
    const sound = scene.sound.add(cacheKey, soundConfig);
    sound.play();
    state.loops.set(name, sound);
    return sound;
  } catch (error) {
    console.warn(`[Game SFX] Could not play ${name}; gameplay will continue.`, error);
    return null;
  }
};
