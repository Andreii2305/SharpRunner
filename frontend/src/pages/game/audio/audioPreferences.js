import { DEFAULT_BGM_VOLUME, DEFAULT_SFX_VOLUME } from "./bgmConfig.js";

export const AUDIO_STORAGE_KEYS = Object.freeze({
  bgmVolume: "sharprunner:bgm-volume",
  bgmMuted: "sharprunner:bgm-muted",
  sfxVolume: "sharprunner:sfx-volume",
  sfxMuted: "sharprunner:sfx-muted",
  legacyMuted: "sharprunner:game-audio-muted",
});

export const DEFAULT_AUDIO_PREFERENCES = Object.freeze({
  bgmVolume: DEFAULT_BGM_VOLUME,
  bgmMuted: false,
  sfxVolume: DEFAULT_SFX_VOLUME,
  sfxMuted: false,
});

const readBoolean = (storage, key, fallback) => {
  const value = storage.getItem(key);
  return value == null ? fallback : value === "true";
};

const readVolume = (storage, key, fallback, maximum) => {
  const value = Number(storage.getItem(key));
  return Number.isFinite(value) ? Math.min(maximum, Math.max(0, value)) : fallback;
};

export const readAudioPreferences = () => {
  try {
    const storage = window.localStorage;
    const legacyMuted = readBoolean(storage, AUDIO_STORAGE_KEYS.legacyMuted, false);
    return {
      bgmVolume: readVolume(storage, AUDIO_STORAGE_KEYS.bgmVolume, DEFAULT_BGM_VOLUME, 40),
      bgmMuted: readBoolean(storage, AUDIO_STORAGE_KEYS.bgmMuted, legacyMuted),
      sfxVolume: readVolume(storage, AUDIO_STORAGE_KEYS.sfxVolume, DEFAULT_SFX_VOLUME, 100),
      sfxMuted: readBoolean(storage, AUDIO_STORAGE_KEYS.sfxMuted, legacyMuted),
    };
  } catch {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
};

export const saveAudioPreferences = (preferences) => {
  try {
    const storage = window.localStorage;
    storage.setItem(AUDIO_STORAGE_KEYS.bgmVolume, String(preferences.bgmVolume));
    storage.setItem(AUDIO_STORAGE_KEYS.bgmMuted, String(preferences.bgmMuted));
    storage.setItem(AUDIO_STORAGE_KEYS.sfxVolume, String(preferences.sfxVolume));
    storage.setItem(AUDIO_STORAGE_KEYS.sfxMuted, String(preferences.sfxMuted));
    // Existing scenes read this key directly, so keep it synchronized with SFX mute.
    storage.setItem(AUDIO_STORAGE_KEYS.legacyMuted, String(preferences.sfxMuted));
  } catch {
    // Settings remain active for this session if storage is unavailable.
  }
};
