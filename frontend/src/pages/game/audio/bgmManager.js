import {
  BGM_CONFIG,
  BGM_FADE_DURATION_MS,
  DEFAULT_BGM_VOLUME,
  getBgmKeyForLevel,
} from "./bgmConfig.js";
import { readAudioPreferences } from "./audioPreferences.js";

class BgmManager {
  constructor() {
    const preferences = readAudioPreferences();
    this.currentAudio = null;
    this.currentKey = null;
    this.requestedKey = null;
    this.volume = preferences.bgmVolume ?? DEFAULT_BGM_VOLUME;
    this.muted = preferences.bgmMuted;
    this.transitionId = 0;
    this.unlockListenersInstalled = false;
    this.handleUnlock = this.handleUnlock.bind(this);
  }

  getTargetVolume() {
    return this.muted ? 0 : this.volume / 100;
  }

  setMusicPreferences({ volume, muted }) {
    this.volume = Math.min(40, Math.max(0, Number(volume) || 0));
    this.muted = Boolean(muted);
    // Cancel an in-flight fade so a live mute/volume change cannot be overwritten
    // by the next animation frame.
    this.transitionId += 1;

    if (this.currentAudio) {
      this.currentAudio.volume = this.requestedKey ? this.getTargetVolume() : 0;
    }

    if (
      !this.muted &&
      this.requestedKey &&
      (!this.currentAudio || this.currentAudio.paused || this.currentKey !== this.requestedKey)
    ) {
      void this.playTrack(this.requestedKey);
    }
  }

  playForLevel(levelNumber) {
    const key = getBgmKeyForLevel(levelNumber);
    if (key) void this.playTrack(key);
  }

  async playTrack(key) {
    const config = BGM_CONFIG[key];
    if (!config) return;

    this.requestedKey = key;
    const transitionId = ++this.transitionId;

    if (this.currentKey === key && this.currentAudio) {
      this.currentAudio.volume = this.getTargetVolume();
      if (!this.muted && this.currentAudio.paused) await this.tryPlay(this.currentAudio, key);
      return;
    }

    if (this.currentAudio) {
      await this.fade(this.currentAudio, this.currentAudio.volume, 0, BGM_FADE_DURATION_MS, transitionId);
      if (transitionId !== this.transitionId) return;
      this.currentAudio.pause();
      this.currentAudio.removeAttribute("src");
      this.currentAudio.load();
      this.currentAudio = null;
      this.currentKey = null;
    }

    if (transitionId !== this.transitionId || this.muted) return;

    const audio = new Audio(config.path);
    audio.loop = config.loop;
    audio.preload = "auto";
    audio.volume = 0;
    audio.addEventListener("error", () => {
      console.warn(`[BGM] Could not load ${config.path}; continuing without music.`);
    }, { once: true });

    this.currentAudio = audio;
    this.currentKey = key;
    const started = await this.tryPlay(audio, key);
    if (!started || transitionId !== this.transitionId) return;
    await this.fade(audio, 0, this.getTargetVolume(), BGM_FADE_DURATION_MS, transitionId);
  }

  async tryPlay(audio, key) {
    try {
      await audio.play();
      this.removeUnlockListeners();
      return true;
    } catch (error) {
      if (error?.name !== "NotAllowedError") {
        console.warn(`[BGM] Could not play ${key}; continuing without music.`, error);
      }
      this.installUnlockListeners();
      return false;
    }
  }

  installUnlockListeners() {
    if (this.unlockListenersInstalled) return;
    this.unlockListenersInstalled = true;
    window.addEventListener("pointerdown", this.handleUnlock, { passive: true });
    window.addEventListener("keydown", this.handleUnlock);
    window.addEventListener("touchend", this.handleUnlock, { passive: true });
  }

  removeUnlockListeners() {
    if (!this.unlockListenersInstalled) return;
    this.unlockListenersInstalled = false;
    window.removeEventListener("pointerdown", this.handleUnlock);
    window.removeEventListener("keydown", this.handleUnlock);
    window.removeEventListener("touchend", this.handleUnlock);
  }

  handleUnlock() {
    if (!this.muted && this.requestedKey) void this.playTrack(this.requestedKey);
  }

  fade(audio, from, to, duration, transitionId) {
    if (duration <= 0 || from === to) {
      audio.volume = to;
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const start = performance.now();
      const tick = (now) => {
        if (transitionId !== this.transitionId) {
          resolve(false);
          return;
        }
        const progress = Math.min(1, (now - start) / duration);
        audio.volume = from + (to - from) * progress;
        if (progress < 1) requestAnimationFrame(tick);
        else resolve(true);
      };
      requestAnimationFrame(tick);
    });
  }

  async fadeOut() {
    const audio = this.currentAudio;
    if (!audio) return;
    this.requestedKey = null;
    const transitionId = ++this.transitionId;
    await this.fade(audio, audio.volume, 0, BGM_FADE_DURATION_MS, transitionId);
    if (transitionId === this.transitionId) audio.pause();
  }

  leaveGameplay() {
    this.removeUnlockListeners();
    void this.stop();
  }

  async stop() {
    this.requestedKey = null;
    const audio = this.currentAudio;
    const transitionId = ++this.transitionId;
    if (!audio) return;
    await this.fade(audio, audio.volume, 0, BGM_FADE_DURATION_MS, transitionId);
    if (transitionId !== this.transitionId) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    this.currentAudio = null;
    this.currentKey = null;
  }
}

export const bgmManager = new BgmManager();
