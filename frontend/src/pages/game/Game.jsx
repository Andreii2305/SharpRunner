import { useEffect, useRef } from "react";
import Phaser from "phaser";

export default function Game({
  scene,
  sceneKey,
  parentId = "phaser-canvas-root",
  isMuted = false,
  sfxVolume = 45,
}) {
  const gameRef = useRef(null);
  const initialAudioSettingsRef = useRef({ isMuted, sfxVolume });

  useEffect(() => {
    if (!scene) {
      return undefined;
    }

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

      scene: [scene],
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
  }, [scene, sceneKey, parentId]);

  useEffect(() => {
    if (gameRef.current?.sound) {
      gameRef.current.sound.mute = isMuted;
      gameRef.current.sound.volume = sfxVolume / 100;
    }
  }, [isMuted, sfxVolume]);

  return null;
}
