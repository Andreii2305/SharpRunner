const BGM_ASSET_BASE = `${import.meta.env?.BASE_URL ?? "/"}game/assets/sounds/bgm`;

export const DEFAULT_BGM_VOLUME = 5;
export const DEFAULT_SFX_VOLUME = 20;
export const BGM_FADE_DURATION_MS = 750;

export const BGM_CONFIG = Object.freeze({
  tutorial: { path: `${BGM_ASSET_BASE}/bgm_tutorial.mp3`, loop: true },
  malumay: { path: `${BGM_ASSET_BASE}/bgm_malumay.mp3`, loop: true },
  ritual: { path: `${BGM_ASSET_BASE}/bgm_ritual.mp3`, loop: true },
  encounter: { path: `${BGM_ASSET_BASE}/bgm_encounter.mp3`, loop: true },
  ancientSpirits: { path: `${BGM_ASSET_BASE}/bgm_ancient_spirits.mp3`, loop: true },
  cemetery: { path: `${BGM_ASSET_BASE}/bgm_cemetery.mp3`, loop: true },
  bakunawa: { path: `${BGM_ASSET_BASE}/bgm_bakunawa.mp3`, loop: true },
});

const ANCIENT_SPIRITS_LEVELS = new Set([23, 24, 26, 27, 28]);

// These are the verified global IDs in levelConfigs.js. Global level 24 combines
// curriculum Methods levels 11-12, and global level 25 is intentionally absent.
export const getBgmKeyForLevel = (levelNumber) => {
  const id = Number(levelNumber);
  if (id >= 1 && id <= 5) return "tutorial";
  if (id >= 6 && id <= 13) return "malumay";
  if (id >= 14 && id <= 20) return "ritual";
  if (id === 21 || id === 22) return "encounter";
  if (ANCIENT_SPIRITS_LEVELS.has(id)) return "ancientSpirits";
  if (id === 29) return "cemetery";
  if (id === 30) return "bakunawa";
  return null;
};
