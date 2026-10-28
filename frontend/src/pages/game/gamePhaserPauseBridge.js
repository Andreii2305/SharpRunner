const resetActiveSceneInput = (game) => {
  const activeScenes = game?.scene?.getScenes?.(true) ?? [];
  for (const scene of activeScenes) {
    scene?.input?.keyboard?.resetKeys?.();
    scene?.input?.resetPointers?.();
  }
};

const pausePlayingSounds = (game) => {
  const pausedSounds = new Set();
  const playingSounds = game?.sound?.getAllPlaying?.() ?? [];
  for (const sound of playingSounds) {
    if (sound?.pause?.() === true) pausedSounds.add(sound);
  }
  return pausedSounds;
};

const resumeBridgePausedSounds = (pausedSounds) => {
  for (const sound of pausedSounds) {
    if (sound?.isPaused === true && sound?.isPlaying !== true) sound.resume?.();
  }
};

export const createPhaserPauseBridge = () => {
  let disposed = false;
  let game = null;
  let requestedPaused = false;
  let appliedPaused = false;
  let ownsGamePause = false;
  let pausedSounds = new Set();

  const applyPause = () => {
    if (!game || appliedPaused) return;
    resetActiveSceneInput(game);
    ownsGamePause = game.isPaused !== true;
    if (ownsGamePause) game.pause?.();
    pausedSounds = pausePlayingSounds(game);
    appliedPaused = true;
  };

  const applyResume = () => {
    if (!game || !appliedPaused) return;
    resetActiveSceneInput(game);
    if (ownsGamePause && game.isPaused === true) game.resume?.();
    if (game.isPaused !== true) resumeBridgePausedSounds(pausedSounds);
    pausedSounds.clear();
    ownsGamePause = false;
    appliedPaused = false;
  };

  const applyRequestedState = () => {
    if (requestedPaused) applyPause();
    else applyResume();
  };

  const detach = (expectedGame = game) => {
    if (!game || expectedGame !== game) return false;
    game = null;
    appliedPaused = false;
    ownsGamePause = false;
    pausedSounds.clear();
    return true;
  };

  return {
    attach(nextGame) {
      if (disposed || !nextGame) return false;
      if (game === nextGame) {
        applyRequestedState();
        return true;
      }
      detach();
      game = nextGame;
      applyRequestedState();
      return true;
    },
    setPaused(nextPaused) {
      if (disposed) return false;
      requestedPaused = nextPaused === true;
      applyRequestedState();
      return true;
    },
    detach,
    dispose() {
      if (disposed) return;
      disposed = true;
      detach();
    },
  };
};
