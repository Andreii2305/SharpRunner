import {
  BGM_CONFIG,
  BGM_FADE_DURATION_MS,
  DEFAULT_BGM_VOLUME,
  getBgmKeyForLevel,
} from "./bgmConfig.js";
import { readAudioPreferences } from "./audioPreferences.js";

export class BgmManager {
  constructor() {
    const preferences = readAudioPreferences();
    this.currentAudio = null;
    this.currentKey = null;
    this.requestedKey = null;
    this.volume = preferences.bgmVolume ?? DEFAULT_BGM_VOLUME;
    this.muted = preferences.bgmMuted;
    this.transitionId = 0;
    this.playbackVersion = 0;
    this.suspensionOwners = new Set();
    this.suspendedPlayback = null;
    this.deferredPlaybackKey = null;
    this.pendingPlay = null;
    this.unlockListenersInstalled = false;
    this.handleUnlock = this.handleUnlock.bind(this);
  }

  getTargetVolume() {
    return this.muted ? 0 : this.volume / 100;
  }

  isTemporarilyPaused() {
    return this.suspensionOwners.size > 0;
  }

  releaseAudio(audio) {
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  pauseTemporarily(owner) {
    if (owner == null || this.suspensionOwners.has(owner)) return false;
    this.suspensionOwners.add(owner);
    if (this.suspensionOwners.size > 1) return true;

    this.transitionId += 1;
    if (this.pendingPlay
      && this.pendingPlay.audio === this.currentAudio
      && this.pendingPlay.key === this.requestedKey) {
      this.deferredPlaybackKey = this.requestedKey;
    }
    if (this.requestedKey && this.currentKey !== this.requestedKey) {
      this.deferredPlaybackKey = this.requestedKey;
    }
    if (this.currentAudio && !this.currentAudio.paused) {
      this.currentAudio.pause();
      this.suspendedPlayback = {
        audio: this.currentAudio,
        key: this.currentKey,
        version: this.playbackVersion,
      };
    }
    return true;
  }

  resumeTemporarily(owner) {
    if (owner == null || !this.suspensionOwners.delete(owner)) return false;
    if (this.isTemporarilyPaused()) return true;

    const suspendedPlayback = this.suspendedPlayback;
    const deferredPlaybackKey = this.deferredPlaybackKey;
    this.suspendedPlayback = null;
    this.deferredPlaybackKey = null;
    if (this.muted || !this.requestedKey) return true;

    const pendingCurrentPlayback = this.pendingPlay
      && this.pendingPlay.audio === this.currentAudio
      && this.pendingPlay.key === this.requestedKey
      && this.pendingPlay.version === this.playbackVersion;
    if (pendingCurrentPlayback) return true;

    const ownsCurrentPause = suspendedPlayback
      && suspendedPlayback.audio === this.currentAudio
      && suspendedPlayback.key === this.currentKey
      && suspendedPlayback.key === this.requestedKey
      && suspendedPlayback.version === this.playbackVersion;
    if (ownsCurrentPause || deferredPlaybackKey === this.requestedKey) {
      void this.playTrack(this.requestedKey);
    }
    return true;
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
      if (this.isTemporarilyPaused()) this.deferredPlaybackKey = this.requestedKey;
      else void this.playTrack(this.requestedKey);
    }
  }

  playForLevel(levelNumber) {
    const key = getBgmKeyForLevel(levelNumber);
    if (key) void this.playTrack(key);
  }

  async playTrack(key) {
    const config = BGM_CONFIG[key];
    if (!config) return;

    const trackChanged = this.requestedKey !== key;
    this.requestedKey = key;
    if (trackChanged) {
      this.playbackVersion += 1;
      this.suspendedPlayback = null;
      this.deferredPlaybackKey = null;
    }
    const playbackVersion = this.playbackVersion;
    const transitionId = ++this.transitionId;

    if (this.isTemporarilyPaused()) {
      if (this.currentAudio && this.currentKey !== key) {
        this.releaseAudio(this.currentAudio);
        this.currentAudio = null;
        this.currentKey = null;
      }
      this.deferredPlaybackKey = key;
      return;
    }

    if (this.currentKey === key && this.currentAudio) {
      this.currentAudio.volume = this.getTargetVolume();
      if (!this.muted && this.currentAudio.paused) {
        const started = await this.tryPlay(this.currentAudio, key, playbackVersion);
        if (started) {
          const fadeTransitionId = ++this.transitionId;
          await this.fade(
            this.currentAudio,
            this.currentAudio.volume,
            this.getTargetVolume(),
            BGM_FADE_DURATION_MS,
            fadeTransitionId,
          );
        }
      }
      return;
    }

    if (this.currentAudio) {
      await this.fade(this.currentAudio, this.currentAudio.volume, 0, BGM_FADE_DURATION_MS, transitionId);
      if (transitionId !== this.transitionId) return;
      this.releaseAudio(this.currentAudio);
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
    const started = await this.tryPlay(audio, key, playbackVersion);
    if (!started
      || this.currentAudio !== audio
      || this.currentKey !== key
      || this.requestedKey !== key
      || this.playbackVersion !== playbackVersion
      || this.isTemporarilyPaused()) return;
    const fadeTransitionId = ++this.transitionId;
    await this.fade(audio, audio.volume, this.getTargetVolume(), BGM_FADE_DURATION_MS, fadeTransitionId);
  }

  async tryPlay(audio, key, version = this.playbackVersion) {
    const pendingPlay = { audio, key, version };
    this.pendingPlay = pendingPlay;
    try {
      await audio.play();
      if (this.pendingPlay === pendingPlay) this.pendingPlay = null;
      const remainsCurrent = this.currentAudio === audio
        && this.currentKey === key
        && this.requestedKey === key
        && this.playbackVersion === version;
      if (!remainsCurrent) {
        if (!audio.paused) audio.pause();
        return false;
      }
      if (this.isTemporarilyPaused()) {
        if (!audio.paused) audio.pause();
        this.deferredPlaybackKey = key;
        return false;
      }
      this.removeUnlockListeners();
      return true;
    } catch (error) {
      if (this.pendingPlay === pendingPlay) this.pendingPlay = null;
      const remainsCurrent = this.currentAudio === audio
        && this.currentKey === key
        && this.requestedKey === key
        && this.playbackVersion === version;
      if (remainsCurrent && this.isTemporarilyPaused()) {
        this.deferredPlaybackKey = key;
        return false;
      }
      if (!remainsCurrent) return false;
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
    if (!this.muted && !this.isTemporarilyPaused() && this.requestedKey) {
      void this.playTrack(this.requestedKey);
    }
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
    this.requestedKey = null;
    this.playbackVersion += 1;
    this.suspendedPlayback = null;
    this.deferredPlaybackKey = null;
    const transitionId = ++this.transitionId;
    if (!audio) return;
    await this.fade(audio, audio.volume, 0, BGM_FADE_DURATION_MS, transitionId);
    if (transitionId === this.transitionId) audio.pause();
  }

  leaveGameplay() {
    this.removeUnlockListeners();
    this.suspensionOwners.clear();
    this.suspendedPlayback = null;
    this.deferredPlaybackKey = null;
    void this.stop();
  }

  async stop() {
    this.requestedKey = null;
    this.playbackVersion += 1;
    this.suspendedPlayback = null;
    this.deferredPlaybackKey = null;
    const audio = this.currentAudio;
    const transitionId = ++this.transitionId;
    if (!audio) return;
    await this.fade(audio, audio.volume, 0, BGM_FADE_DURATION_MS, transitionId);
    if (transitionId !== this.transitionId) return;
    this.releaseAudio(audio);
    this.currentAudio = null;
    this.currentKey = null;
  }
}

export const bgmManager = new BgmManager();
