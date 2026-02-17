import Phaser from "phaser";

export default class LevelOneScene extends Phaser.Scene {
  constructor() {
    super("LevelOneScene");
  }

  preload() {
    this.load.image(
      "level1_bg",
      "/SharpRunner/game/assets/backgrounds/level1_bg.png"
    );

    this.load.image(
      "greenzone_tiles",
      "/SharpRunner/game/assets/tiles/greenzone_tileset.png"
    );

    this.load.image(
      "decor_tiles",
      "/SharpRunner/game/assets/tiles/Objects.png"
    );

    this.load.tilemapTiledJSON(
      "level1",
      "/SharpRunner/game/assets/maps/level1.tmj"
    );

    // ✅ IMPORT IDLE SPRITESHEET (32x32 frames)
    this.load.spritesheet(
      "player_sheet_blue",
      "/SharpRunner/game/assets/characters/players/char_blue.png",
      { frameWidth: 56, frameHeight: 56 }
    );
  }

  create() {
    const map = this.make.tilemap({ key: "level1" });
    const camera = this.cameras.main;

    // 🌄 BACKGROUND (fixed to camera)
    const bg = this.add
      .image(0, 0, "level1_bg")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-10);

    bg.setDisplaySize(camera.width, camera.height);

    // 🧱 TILESETS (names MUST match Tiled exactly)
    const greenzoneTileset = map.addTilesetImage(
      "greenzone_tileset",
      "greenzone_tiles"
    );

    const decorTileset = map.addTilesetImage(
      "Objects",
      "decor_tiles"
    );

    // 📏 Push map to bottom of screen
    const offsetY = this.scale.height - map.heightInPixels;

    // 🗺️ CREATE TILE LAYERS
    map.layers.forEach((layerData) => {
      const layerName = layerData.name;

      // ❌ Skip Object Layer (handled separately)
      if (layerName === "Objects") return;

      const layer = map.createLayer(
        layerName,
        [greenzoneTileset, decorTileset],
        0,
        offsetY
      );

      // 🎨 Depth control
      if (layerName === "Decor_Back") layer.setDepth(-1);
      if (layerName === "Ground") layer.setDepth(0);
      if (layerName === "Platforms") layer.setDepth(1);
      if (layerName === "Decor_Front") layer.setDepth(2);
    });

    // 🎥 CAMERA
    camera.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);
    camera.scrollY = offsetY;

    // 📦 OBJECT LAYER (spawn point)
    const objectLayer = map.getObjectLayer("Objects");
    this.playerSpawn = null;

    if (objectLayer) {
      objectLayer.objects.forEach((obj) => {
        if (obj.name === "player_spawn") {
          this.playerSpawn = { x: obj.x, y: obj.y + offsetY };
        }
      });
    }

    // ✅ fallback spawn if missing
    if (!this.playerSpawn) {
      this.playerSpawn = { x: 1000, y: offsetY + map.heightInPixels - 50 };
      console.warn("player_spawn not found — using fallback spawn");
    }

    // ✅ CREATE IDLE ANIMATION (AUTO USES ALL FRAMES)
    if (!this.anims.exists("player-idle")) {
      this.anims.create({
        key: "player-idle",
        frames: this.anims.generateFrameNumbers("player_sheet_blue", {
          start: 0,
          end: 5
        }),
        frameRate: 6,
        repeat: -1
      });
    }

    // ✅ SPAWN PLAYER
    const PLAYER_SCALE = 2;
    const FRAME_HEIGHT = 56;

    this.player = this.add.sprite(
      this.playerSpawn.x,
      this.playerSpawn.y,
      "player_sheet_blue"
    );

    // ✅ feet aligned to ground
    this.player.setOrigin(0.5, 1);

    // ✅ scale character
    this.player.setScale(PLAYER_SCALE);

    // ✅ FIX: lift sprite so it doesn't sink into the ground
    //this.player.y -= (FRAME_HEIGHT * PLAYER_SCALE) / 2;

    // ✅ behind decor front, above platforms
    this.player.setDepth(1);

    // ✅ play idle loop
    this.player.play("player-idle");

    this.scale.resize(1024,576);

    console.log("Canvas:", this.scale.width, this.scale.height);
console.log("Map:", map.widthInPixels, map.heightInPixels);
  }
}
