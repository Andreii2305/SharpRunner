import { useEffect } from "react";
import Phaser from "phaser";
import LevelOneScene from "./scenes/LevelOneScene";

let game;

export default function Game() {
  useEffect(() => {
    if (game) return;

    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "phaser-canvas-root",
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

      scene: [LevelOneScene],
      // backgroundColor: "#e9e7e7",
    });

    return () => {
      game.destroy(true);
      game = null;
    };
  }, []);

  return null;
}
