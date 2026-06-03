import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";

const LEVEL_NUMBER = 6;
const PLAYER_SCALE = 2;
const PLAYER_GRAVITY = 1100;
const PLAYER_WALK_SPEED = 150;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_ASSET_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const GH_BG_BASE = `${GH_ASSET_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const LANTERN_BASE = `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack`;
const POST_BASE = `${LANTERN_BASE}/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze`;
const SMALL_LANTERN_PATH =
  `${LANTERN_BASE}/Lanterns-Smaller-Versions/Lantern-1/Silver-Red-Roof/Yellow-Light/Lantern-1-Small-Red-Roof-and-Yellow_000.png`;
const EXPECTED_ORDER = [1, 2, 3, 4];
const LANTERN_TRIGGER_DISTANCE = 54;
const LANTERN_GLOW_TEXTURE = "arrays_lantern_soft_glow";
const PATH_GLOW_TEXTURE = "arrays_path_soft_glow";
const PLAYER_ANIMATIONS = [
  { key: "player-idle-arrays-1", start: 0, end: 5, frameRate: 6, repeat: -1 },
  { key: "player-run-arrays-1", start: 16, end: 23, frameRate: 12, repeat: -1 },
  { key: "player-jump-arrays-1", start: 24, end: 31, frameRate: 10, repeat: -1 },
  { key: "player-death-arrays-1", start: 40, end: 47, frameRate: 10, repeat: 0 },
  { key: "player-downed-arrays-1", start: 48, end: 51, frameRate: 6, repeat: -1 },
];

export default class ArraysLevelOneScene extends Phaser.Scene {
  constructor() {
    super("ArraysLevelOneScene");
  }

  preload() {
    this.load.tilemapTiledJSON(
      "arrays_level_1",
      `${ASSET_BASE}/maps/arrays-level-1-lantern-row.tmj`,
    );
    this.load.image("arrays_floor_tiles", `${GH_ASSET_BASE}/Floor_Tiles2.png`);
    this.load.image("arrays_decor_tiles", `${GH_ASSET_BASE}/Decor.png`);
    this.load.image("arrays_garden_decor_tiles", `${GH_ASSET_BASE}/Garden_Decorations.png`);
    this.load.image("arrays_pine_trees_tiles", `${GH_ASSET_BASE}/Pine_Trees.png`);
    this.load.image("arrays_lamp_post", `${POST_BASE}/Lamp-Post-2-SHORT.png`);
    this.load.image("arrays_lantern", SMALL_LANTERN_PATH);
    this.load.spritesheet(
      "player_sheet_blue",
      `${ASSET_BASE}/characters/players/char_blue.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    this.load.image("arrays_bg5", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("arrays_bg_castle", `${GH_BG_BASE}/Background_Castle.png`);
    this.load.image("arrays_bg4", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("arrays_bg3", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("arrays_bg2", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("arrays_bg1", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
  }

  create() {
    this.scale.resize(1024, 576);
    const map = this.make.tilemap({ key: "arrays_level_1" });
    const offsetY = this.scale.height - map.heightInPixels;

    this.createParallaxBackgrounds(map);
    this.createPlayerAnimations();
    this.createGlowTexture();

    const floorTileset = map.addTilesetImage("Floor_Tiles2", "arrays_floor_tiles");
    const decorTileset = map.addTilesetImage("Decor", "arrays_decor_tiles");
    const gardenDecorTileset = map.addTilesetImage(
      "Garden_Decorations",
      "arrays_garden_decor_tiles",
    );
    const pineTreesTileset = map.addTilesetImage("Pine_Trees", "arrays_pine_trees_tiles");
    const allTilesets = [
      floorTileset,
      decorTileset,
      gardenDecorTileset,
      pineTreesTileset,
    ].filter(Boolean);
    const platformLayer = map.createLayer("platform", allTilesets, 0, offsetY);
    if (platformLayer) {
      platformLayer.setDepth(0);
      platformLayer.setCollision([2, 11], true);
    }
    this.createVisualTileLayer(map, "trees", allTilesets, offsetY, 0.01);
    this.createVisualTileLayer(map, "decoration", allTilesets, offsetY, 0.02);

    this.cameras.main.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);
    this.physics.world.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);

    this.points = this.resolveMapPoints(map, offsetY);
    this.spawnPoint = this.points.player_spawn ?? { x: 96, y: 448 + offsetY };
    this.gatePoint = this.points.array_gate ?? { x: 1500, y: 384 + offsetY };
    this.exitPoint = this.points.level_exit ?? { x: 1770, y: 384 + offsetY };
    this.floorY = this.spawnPoint.y;
    this.createPathDarkness(map);
    this.lanternPoints = EXPECTED_ORDER.map(
      (number) => this.points[`lantern_${number}`],
    ).filter(Boolean);

    this.createLanternPuzzle();
    this.createGate();
    this.createPlayer();

    if (platformLayer) {
      this.physics.add.collider(this.player, platformLayer);
    }

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.sequenceMode = "idle";
    this.failureTimer = null;
    this.isDowned = false;
    this.isDead = false;
    this.nextLanternIndex = 0;

    this.player.play("player-idle-arrays-1");

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);
  }

  update() {
    if (!this.player?.body) return;

    const onGround = this.player.body.blocked.down || this.player.body.touching.down;

    if (this.sequenceMode === "walkingToExit") {
      this.player.setVelocityX(PLAYER_WALK_SPEED);
      this.player.setFlipX(false);
      this.playAnimation(onGround ? "player-run-arrays-1" : "player-jump-arrays-1");
      this.lightLanternsNearPlayer();

      if (this.player.x >= this.exitPoint.x) {
        this.finishSuccessSequence();
      }
      return;
    }

    if (this.sequenceMode === "failure" || this.isDead || this.isDowned) {
      this.player.setVelocityX(0);
      return;
    }

    this.player.setVelocityX(0);
    this.playAnimation(onGround ? "player-idle-arrays-1" : "player-jump-arrays-1");
  }

  createParallaxBackgrounds(map) {
    const worldWidth = map?.widthInPixels ?? this.scale.width;
    const backgrounds = [
      { key: "arrays_bg5", factor: 0.1, depth: -8, alpha: 0.82, y: 0 },
      { key: "arrays_bg_castle", factor: 0.1, depth: -7, alpha: 0.48, y: 0 },
      { key: "arrays_bg4", factor: 0.1, depth: -6, alpha: 0.72, y: 0 },
      { key: "arrays_bg3", factor: 0.4, depth: -5, alpha: 0.7, y: 94 },
      { key: "arrays_bg2", factor: 0.7, depth: -4, alpha: 0.66, y: 186 },
      { key: "arrays_bg1", factor: 0.9, depth: -3, alpha: 0.62, y: 232 },
    ];

    backgrounds.forEach(({ key, factor, depth, alpha, y }) => {
      const bg = this.add.tileSprite(
        0,
        y,
        worldWidth,
        this.scale.height - y,
        key,
      );
      bg.setOrigin(0, 0);
      bg.setScrollFactor(factor, 0);
      bg.setDepth(depth);
      bg.setTint(0x263f64);
      bg.setAlpha(alpha);
    });

    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x06101d, 0.24)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-2);
  }

  createVisualTileLayer(map, layerName, tilesets, offsetY, depth) {
    const layer = map.createLayer(layerName, tilesets, 0, offsetY);
    if (!layer) return null;

    layer.setDepth(depth);
    layer.setAlpha(0.86);
    layer.setTint(0xb8c0d0);
    return layer;
  }

  createPlayerAnimations() {
    PLAYER_ANIMATIONS.forEach(({ key, start, end, frameRate, repeat }) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("player_sheet_blue", { start, end }),
        frameRate,
        repeat,
      });
    });
  }

  createGlowTexture() {
    if (!this.textures.exists(LANTERN_GLOW_TEXTURE)) {
      const size = 192;
      const canvasTexture = this.textures.createCanvas(
        LANTERN_GLOW_TEXTURE,
        size,
        size,
      );
      const ctx = canvasTexture.getContext();
      const center = size / 2;
      const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);

      gradient.addColorStop(0, "rgba(255, 227, 127, 0.95)");
      gradient.addColorStop(0.18, "rgba(255, 190, 66, 0.55)");
      gradient.addColorStop(0.42, "rgba(255, 139, 43, 0.22)");
      gradient.addColorStop(0.72, "rgba(255, 100, 25, 0.07)");
      gradient.addColorStop(1, "rgba(255, 100, 25, 0)");

      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      canvasTexture.refresh();
    }

    if (!this.textures.exists(PATH_GLOW_TEXTURE)) {
      const width = 320;
      const height = 96;
      const canvasTexture = this.textures.createCanvas(
        PATH_GLOW_TEXTURE,
        width,
        height,
      );
      const ctx = canvasTexture.getContext();
      const gradient = ctx.createRadialGradient(
        width / 2,
        height * 0.45,
        8,
        width / 2,
        height * 0.45,
        width / 2,
      );

      gradient.addColorStop(0, "rgba(255, 211, 112, 0.56)");
      gradient.addColorStop(0.28, "rgba(255, 169, 64, 0.28)");
      gradient.addColorStop(0.58, "rgba(255, 126, 36, 0.11)");
      gradient.addColorStop(1, "rgba(255, 126, 36, 0)");

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      canvasTexture.refresh();
    }
  }

  resolveMapPoints(map, offsetY) {
    const points = {};
    const readLayer = (layerName) => {
      const layer = map.getObjectLayer(layerName);
      if (!layer) return;
      layer.objects.forEach((obj) => {
        if (!obj.name) return;
        points[obj.name] = {
          x: obj.x + (obj.width || 0) / 2,
          y: obj.y + offsetY + (obj.height || 0),
          width: obj.width || 0,
          height: obj.height || 0,
        };
      });
    };

    readLayer("Objects");
    readLayer("Triggers");
    readLayer("Hazards");
    return points;
  }

  createLanternPuzzle() {
    this.lanterns = this.lanternPoints.map((point, index) => {
      const postBaseY = this.floorY + 1;
      const lanternY = postBaseY - 96;
      const labelY = lanternY - 30;
      const post = this.add
        .image(point.x, postBaseY, "arrays_lamp_post")
        .setOrigin(0.5, 1)
        .setScale(0.34)
        .setDepth(0.75)
        .setTint(0x8a6a4a);

      const lantern = this.add
        .image(point.x, lanternY, "arrays_lantern")
        .setOrigin(0.5, 0.5)
        .setScale(1.15)
        .setDepth(1.1)
        .setAlpha(0.28)
        .setTint(0x2b3440);

      const glow = this.add
        .image(point.x, lanternY + 2, LANTERN_GLOW_TEXTURE)
        .setOrigin(0.5)
        .setScale(0.55)
        .setAlpha(0)
        .setDepth(0.95)
        .setBlendMode(Phaser.BlendModes.ADD);

      const coreGlow = this.add
        .image(point.x, lanternY, LANTERN_GLOW_TEXTURE)
        .setOrigin(0.5)
        .setScale(0.18)
        .setAlpha(0)
        .setDepth(1.05)
        .setBlendMode(Phaser.BlendModes.ADD);

      const pathGlow = this.add
        .image(point.x, postBaseY + 8, PATH_GLOW_TEXTURE)
        .setOrigin(0.5, 0.55)
        .setScale(0.8, 0.45)
        .setAlpha(0)
        .setDepth(0.08)
        .setBlendMode(Phaser.BlendModes.ADD);

      const label = this.add
        .text(point.x, labelY, String(index + 1), {
          fontFamily: "monospace",
          fontSize: "16px",
          color: "#f8e7b2",
          backgroundColor: "rgba(4, 9, 18, 0.7)",
          padding: { x: 7, y: 3 },
        })
        .setOrigin(0.5)
        .setDepth(1.2);

      return { post, lantern, glow, coreGlow, pathGlow, label, isLit: false };
    });
  }

  createPathDarkness(map) {
    const darknessTopY = this.floorY + 5;
    const darknessHeight = Math.max(112, map.heightInPixels - darknessTopY + 96);

    this.add
      .rectangle(
        map.widthInPixels / 2,
        darknessTopY + darknessHeight / 2,
        map.widthInPixels,
        darknessHeight,
        0x010409,
        0.58,
      )
      .setDepth(0.04);

    this.add
      .rectangle(
        map.widthInPixels / 2,
        this.floorY + 7,
        map.widthInPixels,
        10,
        0x010409,
        0.28,
      )
      .setDepth(0.05);
  }

  createGate() {
    this.gate = this.add
      .rectangle(this.gatePoint.x, this.gatePoint.y - 36, 44, 96, 0x18202b, 0.88)
      .setStrokeStyle(3, 0xffbf47, 0.5)
      .setDepth(1);
    this.gateLabel = this.add
      .text(this.gatePoint.x, this.gatePoint.y - 98, "array gate", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#f8e7b2",
        backgroundColor: "rgba(4, 9, 18, 0.72)",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(1.1);
  }

  createPlayer() {
    this.player = this.physics.add.sprite(
      this.spawnPoint.x,
      this.spawnPoint.y,
      "player_sheet_blue",
    );
    this.player
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.25)
      .setCollideWorldBounds(true)
      .setGravityY(PLAYER_GRAVITY);
  }

  onCodeEvaluated({ levelNumber, isCorrect, values }) {
    if (levelNumber !== LEVEL_NUMBER) return;
    this.resetAttemptState();

    if (!isCorrect) {
      this.flickerLanterns(false);
      this.startFailureSequence("The lantern row rejects the array. Match the order exactly.");
      return;
    }

    const order = values?.lanterns;
    if (!Array.isArray(order) || order.length !== EXPECTED_ORDER.length) {
      this.startFailureSequence("The array could not be read. Use int[] lanterns = { 1, 2, 3, 4 };");
      return;
    }

    this.startSuccessSequence();
  }

  resetAttemptState() {
    if (this.failureTimer) {
      this.failureTimer.remove(false);
      this.failureTimer = null;
    }
    this.tweens.killTweensOf(this.player);
    this.lanterns?.forEach((item) => {
      const { lantern, glow, coreGlow, pathGlow } = item;
      this.tweens.killTweensOf([lantern, glow, coreGlow, pathGlow]);
      lantern.setAlpha(0.28).setTint(0x2b3440);
      lantern.setScale(1.15);
      glow.setAlpha(0);
      glow.setScale(0.55);
      coreGlow.setAlpha(0);
      coreGlow.setScale(0.18);
      pathGlow.setAlpha(0);
      pathGlow.setScale(0.8, 0.45);
      item.isLit = false;
    });
    this.sequenceMode = "idle";
    this.nextLanternIndex = 0;
    this.isDead = false;
    this.isDowned = false;
    this.player.body.enable = true;
    this.player.setAlpha(1);
    this.player.setScale(PLAYER_SCALE);
    this.player.setGravityY(PLAYER_GRAVITY);
    this.player.setVelocity(0, 0);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y);
    this.player.body.reset(this.spawnPoint.x, this.spawnPoint.y);
    this.playAnimation("player-idle-arrays-1");
    this.gate?.setAlpha(1);
    this.gateLabel?.setAlpha(1);
  }

  startSuccessSequence() {
    this.openGateAndWalk();
  }

  lightLanternsNearPlayer() {
    const item = this.lanterns[this.nextLanternIndex];
    if (!item || item.isLit) return;

    if (this.player.x < item.lantern.x - LANTERN_TRIGGER_DISTANCE) {
      return;
    }

    this.lightLantern(item);
    this.nextLanternIndex += 1;
  }

  lightLantern(item) {
    item.isLit = true;
    item.lantern.setTint(0xffd46b);
    item.glow.setTint(0xffb845);
    item.coreGlow.setTint(0xfff0a6);

    this.tweens.add({
      targets: item.lantern,
      alpha: 1,
      scaleX: 1.35,
      scaleY: 1.35,
      duration: 220,
      yoyo: true,
      ease: "Sine.easeOut",
    });

    this.tweens.add({
      targets: item.glow,
      alpha: { from: 0, to: 0.72 },
      scaleX: { from: 0.45, to: 1.05 },
      scaleY: { from: 0.42, to: 0.95 },
      duration: 520,
      ease: "Quad.easeOut",
      onComplete: () => {
        item.glow.setAlpha(0.42);
        item.glow.setScale(0.88, 0.78);
        this.tweens.add({
          targets: item.glow,
          alpha: { from: 0.34, to: 0.5 },
          scaleX: { from: 0.82, to: 0.94 },
          scaleY: { from: 0.74, to: 0.84 },
          duration: 1100,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      },
    });

    this.tweens.add({
      targets: item.coreGlow,
      alpha: { from: 0, to: 0.75 },
      scaleX: { from: 0.12, to: 0.32 },
      scaleY: { from: 0.12, to: 0.3 },
      duration: 260,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeOut",
      onComplete: () => {
        item.coreGlow.setAlpha(0.35);
        item.coreGlow.setScale(0.24);
      },
    });

    this.tweens.add({
      targets: item.pathGlow,
      alpha: { from: 0, to: 0.46 },
      scaleX: { from: 0.55, to: 1.16 },
      scaleY: { from: 0.25, to: 0.58 },
      duration: 620,
      ease: "Quad.easeOut",
      onComplete: () => {
        item.pathGlow.setAlpha(0.3);
        item.pathGlow.setScale(1.02, 0.5);
        this.tweens.add({
          targets: item.pathGlow,
          alpha: { from: 0.24, to: 0.36 },
          scaleX: { from: 0.96, to: 1.08 },
          duration: 1300,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      },
    });
  }

  openGateAndWalk() {
    this.sequenceMode = "openingGate";
    this.tweens.add({
      targets: [this.gate, this.gateLabel],
      alpha: 0,
      duration: 260,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.sequenceMode = "walkingToExit";
        this.player.body.enable = true;
        this.player.setVelocityX(PLAYER_WALK_SPEED);
        this.playAnimation("player-run-arrays-1");
      },
    });
  }

  flickerLanterns(useWarmTint = true) {
    this.lanterns?.forEach(({ lantern, glow, coreGlow, pathGlow }) => {
      lantern.setTint(useWarmTint ? 0xffd46b : 0xff5252);
      glow.setTint(useWarmTint ? 0xffbf47 : 0xff3333);
      coreGlow.setTint(useWarmTint ? 0xfff0a6 : 0xff5555);
      pathGlow.setTint(useWarmTint ? 0xffbf47 : 0xff3333);
      this.tweens.add({
        targets: [lantern, glow, coreGlow, pathGlow],
        alpha: { from: 0.2, to: 0.85 },
        duration: 90,
        yoyo: true,
        repeat: 3,
      });
    });
  }

  startFailureSequence(message) {
    this.sequenceMode = "failure";
    this.failureMessage = message;
    this.player.setVelocity(0, 0);
    this.player.play("player-death-arrays-1", true);
    this.failureTimer = this.time.delayedCall(650, () => {
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message: this.failureMessage,
      });
    });
  }

  finishSuccessSequence() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    this.player.setVelocity(0, 0);
    this.playAnimation("player-idle-arrays-1");
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: "Lantern row solved. Arrays Level 1 cleared.",
      shouldProceed: true,
    });
  }

  playAnimation(key) {
    if (!this.player || this.player.anims.currentAnim?.key === key) return;
    this.player.play(key, true);
  }

  cleanupScene() {
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    if (this.failureTimer) {
      this.failureTimer.remove(false);
      this.failureTimer = null;
    }
  }
}
