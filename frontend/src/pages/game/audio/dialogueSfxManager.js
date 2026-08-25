export const DIALOGUE_SFX_CONFIG = Object.freeze({
  path: "/game/assets/sounds/sfx/medium-text-blip-dialogue.mp3",
  baseVolume: 0.22,
  characterInterval: 3,
  minPlaybackIntervalMs: 55,
  pitchMin: 0.95,
  pitchMax: 1.05,
});

const VISIBLE_CHARACTER_PATTERN = /[\p{L}\p{N}]/u;

export const isDialogueSoundCharacter = (character) =>
  VISIBLE_CHARACTER_PATTERN.test(character ?? "");

export const shouldPlayDialogueBlip = (
  text,
  characterIndex,
  interval = DIALOGUE_SFX_CONFIG.characterInterval,
) => {
  if (!Number.isInteger(characterIndex) || characterIndex < 0) return false;

  const character = text?.[characterIndex];
  if (!isDialogueSoundCharacter(character)) return false;

  let visibleCharacterCount = 0;
  for (let index = 0; index <= characterIndex; index += 1) {
    if (isDialogueSoundCharacter(text[index])) visibleCharacterCount += 1;
  }

  return visibleCharacterCount % interval === 0;
};

export const shouldPlayDialogueBlipForProgress = (text, previousCount, currentCount) =>
  currentCount === previousCount + 1
  && shouldPlayDialogueBlip(text, currentCount - 1);

export class DialogueSfxManager {
  constructor({
    audioFactory = () => new Audio(),
    now = () => performance.now(),
    random = Math.random,
  } = {}) {
    this.audioFactory = audioFactory;
    this.now = now;
    this.random = random;
    this.audio = null;
    this.sfxVolume = 100;
    this.sfxMuted = false;
    this.lastPlaybackAt = Number.NEGATIVE_INFINITY;
    this.loadWarningLogged = false;
    this.playWarningLogged = false;
  }

  preload() {
    if (this.audio) return this.audio;

    try {
      const audio = this.audioFactory();
      audio.preload = "auto";
      audio.src = DIALOGUE_SFX_CONFIG.path;
      audio.addEventListener?.("error", () => {
        if (this.loadWarningLogged) return;
        this.loadWarningLogged = true;
        console.warn(
          `[Dialogue SFX] Could not load ${DIALOGUE_SFX_CONFIG.path}; continuing without voice blips.`,
        );
      });
      audio.load?.();
      this.audio = audio;
    } catch (error) {
      if (!this.loadWarningLogged) {
        this.loadWarningLogged = true;
        console.warn("[Dialogue SFX] Could not initialize voice blips; dialogue will continue.", error);
      }
    }

    return this.audio;
  }

  setSfxPreferences({ volume, muted }) {
    this.sfxVolume = Math.min(100, Math.max(0, Number(volume) || 0));
    this.sfxMuted = Boolean(muted);
    if (this.sfxMuted || this.sfxVolume === 0) this.stop();
  }

  playBlip() {
    if (this.sfxMuted || this.sfxVolume === 0) return false;

    const now = this.now();
    if (now - this.lastPlaybackAt < DIALOGUE_SFX_CONFIG.minPlaybackIntervalMs) return false;

    const audio = this.preload();
    if (!audio) return false;

    this.lastPlaybackAt = now;
    audio.pause?.();
    try {
      audio.currentTime = 0;
    } catch {
      // Some browsers reject seeking until metadata is available; playback can still proceed.
    }
    audio.volume = DIALOGUE_SFX_CONFIG.baseVolume * (this.sfxVolume / 100);
    audio.playbackRate =
      DIALOGUE_SFX_CONFIG.pitchMin
      + this.random() * (DIALOGUE_SFX_CONFIG.pitchMax - DIALOGUE_SFX_CONFIG.pitchMin);

    try {
      const playback = audio.play?.();
      playback?.catch?.((error) => {
        if (error?.name === "NotAllowedError" || this.playWarningLogged) return;
        this.playWarningLogged = true;
        console.warn("[Dialogue SFX] Could not play a voice blip; dialogue will continue.", error);
      });
    } catch (error) {
      if (!this.playWarningLogged) {
        this.playWarningLogged = true;
        console.warn("[Dialogue SFX] Could not play a voice blip; dialogue will continue.", error);
      }
      return false;
    }

    return true;
  }

  stop() {
    if (!this.audio) return;
    this.audio.pause?.();
    try {
      this.audio.currentTime = 0;
    } catch {
      // Reset is best effort when the media has not loaded yet.
    }
  }
}

export const dialogueSfxManager = new DialogueSfxManager();
