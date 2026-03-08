import { useEffect, useRef } from "react";
import Phaser from "phaser";

export default function Game({ scene, sceneKey, parentId = "phaser-canvas-root" }) {
  const gameRef = useRef(null);

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

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [scene, sceneKey, parentId]);

  return null;
}
