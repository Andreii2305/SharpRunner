import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { gameEvents, GAME_LEVEL_OUTCOME } from "./gameEvents.js";
import {
  cleanupGameSfx,
  getGameSfxForLevel,
  playGameSfx,
  preloadGameSfx,
  stopGameSfx,
} from "./audio/gameSfx.js";

const createAudioBootScene = (targetSceneKey, levelNumber) =>
  class AudioBootScene extends Phaser.Scene {
    constructor() {
      super({ key: `AudioBootScene:${targetSceneKey}` });
    }

    preload() {
      preloadGameSfx(this, getGameSfxForLevel(levelNumber));
    }

    create() {
      const targetScene = this.scene.get(targetSceneKey);
      if (targetScene) {
        targetScene.playSfx = (name, options) => playGameSfx(targetScene, name, options);
        targetScene.stopSfx = (name) => stopGameSfx(targetScene, name);
        targetScene.cleanupSfx = () => cleanupGameSfx(targetScene);
      }
      this.scene.start(targetSceneKey);
    }
  };

export default function Game({
  scene,
  sceneKey,
  levelNumber,
  parentId = "phaser-canvas-root",
  isMuted = false,
  sfxVolume = 100,
}) {
  const gameRef = useRef(null);
  const initialAudioSettingsRef = useRef({ isMuted, sfxVolume });

  useEffect(() => {
    if (!scene) {
      return undefined;
    }

    const AudioBootScene = createAudioBootScene(sceneKey, levelNumber);
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: parentId,
      pixelArt: true,
      physics: {
        default: "arcade",
        arcade: {
          gravity: { y: 0 },
          debug: false,
        },
      },

      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.NO_CENTER,
      },

      scene: [AudioBootScene, scene],
      // backgroundColor: "#e9e7e7",
    });
    gameRef.current = game;
    game.sound.mute = initialAudioSettingsRef.current.isMuted;
    game.sound.volume = initialAudioSettingsRef.current.sfxVolume / 100;

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [scene, sceneKey, levelNumber, parentId]);

  useEffect(() => {
    if (gameRef.current?.sound) {
      gameRef.current.sound.mute = isMuted;
      gameRef.current.sound.volume = sfxVolume / 100;
    }
  }, [isMuted, sfxVolume]);

  useEffect(() => {
    const handleOutcome = ({ levelNumber: outcomeLevelNumber, status }) => {
      if (outcomeLevelNumber !== levelNumber) return;
      const activeScene = gameRef.current?.scene?.getScene(sceneKey);
      if (!activeScene) return;
      playGameSfx(activeScene, status === "success" ? "successMagic" : "errorMagic");
    };
    gameEvents.on(GAME_LEVEL_OUTCOME, handleOutcome);
    return () => gameEvents.off(GAME_LEVEL_OUTCOME, handleOutcome);
  }, [levelNumber, sceneKey]);

  return null;
}
