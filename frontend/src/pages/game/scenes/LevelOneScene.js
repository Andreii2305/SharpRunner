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

    this.load.tilemapTiledJSON(
      "level1",
      "/SharpRunner/game/assets/maps/level1.tmj"
    );
  }

  create() {
  const map = this.make.tilemap({ key: "level1" });
  const camera = this.cameras.main;

  // 🌄 Background (camera-fixed)
  const bg = this.add.image(0, 0, "level1_bg")
    .setOrigin(0, 0)
    .setScrollFactor(0) // 👈 KEY LINE
    .setDepth(-10);

  bg.setDisplaySize(camera.width, camera.height);

  // 🧱 Tiles
  const tileset = map.addTilesetImage("greenzone_tileset", "greenzone_tiles");

  const offsetY = this.scale.height - map.heightInPixels;

  map.layers.forEach(layer => {
    map.createLayer(layer.name, tileset, 0, offsetY);
  });

   camera.setBounds(
    0,
    offsetY,
    map.widthInPixels,
    map.heightInPixels
  );

  camera.scrollY = offsetY;
}

}
