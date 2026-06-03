import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";

const LEVEL_NUMBER = 7;
const PLAYER_SCALE = 2;
const PLAYER_GRAVITY = 1100;
const PLAYER_WALK_SPEED = 150;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_ASSET_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const GH_BG_BASE = `${GH_ASSET_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const SUPPLY_BOX_PATH = `${ASSET_BASE}/other/box/1.png`;
const EXPECTED_SUPPLIES = ["rice", "salt", "candle"];
const PLAYER_ANIMATIONS = [
  { key: "player-idle-arrays-2", start: 0, end: 5, frameRate: 6, repeat: -1 },
  { key: "player-run-arrays-2", start: 16, end: 23, frameRate: 12, repeat: -1 },
  { key: "player-jump-arrays-2", start: 24, end: 31, frameRate: 10, repeat: -1 },
  { key: "player-death-arrays-2", start: 40, end: 47, frameRate: 10, repeat: 0 },
];
const MONSTER_ANIMATIONS = [
  { key: "aswang-idle-arrays-2", sheet: "aswang_idle", start: 0, end: 24, frameRate: 10, repeat: -1 },
  { key: "aswang-attack-arrays-2", sheet: "aswang_attack", start: 0, end: 24, frameRate: 14, repeat: -1 },
];

export default class ArraysLevelTwoScene extends Phaser.Scene {
  constructor() {
    super("ArraysLevelTwoScene");
  }

  preload() {
    this.load.tilemapTiledJSON(
      "arrays_level_2_base",
      `${ASSET_BASE}/maps/arrays-level-2-stolen-supplies.tmj`,
    );
    this.load.image("arrays_2_floor_tiles", `${GH_ASSET_BASE}/Floor_Tiles2.png`);
    this.load.image("arrays_2_decor_tiles", `${GH_ASSET_BASE}/Decor.png`);
    this.load.image("arrays_2_garden_decor_tiles", `${GH_ASSET_BASE}/Garden_Decorations.png`);
    this.load.image("arrays_2_pine_trees_tiles", `${GH_ASSET_BASE}/Pine_Trees.png`);
    this.load.image("arrays_2_house_tiles", `${GH_ASSET_BASE}/House_Tiles.png`);
    this.load.image("arrays_2_supply_box", SUPPLY_BOX_PATH);
    this.load.spritesheet(
      "player_sheet_blue",
      `${ASSET_BASE}/characters/players/char_blue.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    this.load.spritesheet(
      "aswang_idle",
      `${ASSET_BASE}/characters/monsters/Manangy-fly_idle.png`,
      { frameWidth: 256, frameHeight: 256 },
    );
    this.load.spritesheet(
      "aswang_attack",
      `${ASSET_BASE}/characters/monsters/Manangy-fly_attack.png`,
      { frameWidth: 256, frameHeight: 256 },
    );
    this.load.image("arrays_2_bg5", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("arrays_2_bg_castle", `${GH_BG_BASE}/Background_Castle.png`);
    this.load.image("arrays_2_bg4", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("arrays_2_bg3", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("arrays_2_bg2", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("arrays_2_bg1", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
  }

  create() {
    this.scale.resize(1024, 576);
    const map = this.make.tilemap({ key: "arrays_level_2_base" });
    const offsetY = this.scale.height - map.heightInPixels;

    this.createParallaxBackgrounds(map);
    this.createPlayerAnimations();
    this.createMonsterAnimations();

    const floorTileset = map.addTilesetImage("Floor_Tiles2", "arrays_2_floor_tiles");
    const decorTileset = map.addTilesetImage("Decor", "arrays_2_decor_tiles");
    const gardenDecorTileset = map.addTilesetImage(
      "Garden_Decorations",
      "arrays_2_garden_decor_tiles",
    );
    const pineTreesTileset = map.addTilesetImage("Pine_Trees", "arrays_2_pine_trees_tiles");
    const houseTileset = map.addTilesetImage("House_Tiles", "arrays_2_house_tiles");
    const allTilesets = [
      floorTileset,
      decorTileset,
      gardenDecorTileset,
      pineTreesTileset,
      houseTileset,
    ].filter(Boolean);

    const platformLayer = map.createLayer("platform", allTilesets, 0, offsetY);
    if (platformLayer) {
      platformLayer.setDepth(0);
      platformLayer.setCollision([2, 11], true);
    }
    this.createVisualTileLayer(map, "trees", allTilesets, offsetY, 0.01);
    this.createVisualTileLayer(map, "decoration", allTilesets, offsetY, 0.02);
    this.createVisualTileLayer(map, "front_decoration", allTilesets, offsetY, 0.03);

    this.cameras.main.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);
    this.physics.world.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);

    this.points = this.resolveMapPoints(map, offsetY);
    this.spawnPoint = this.points.player_spawn ?? { x: 96, y: 448 + offsetY };
    this.gatePoint = this.points.supply_gate ?? { x: 1500, y: 384 + offsetY };
    this.exitPoint = this.points.level_exit ?? { x: 1770, y: 384 + offsetY };
    this.aswangPoint = this.points.aswang_spawn ?? { x: 1320, y: 216 + offsetY };
    this.supplyPoints = EXPECTED_SUPPLIES.map((_, index) => {
      const point = this.points[`supply_${index + 1}`];
      return point ?? { x: 380 + index * 260, y: this.spawnPoint.y - 32 };
    });
    this.floorY = this.spawnPoint.y;

    this.createPathDarkness(map);
    this.createSupplyCrates();
    this.createAswangThreat();
    this.createPlayer();

    if (platformLayer) {
      this.physics.add.collider(this.player, platformLayer);
    }

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.sequenceMode = "idle";
    this.failureTimer = null;
    this.sequenceTimers = [];
    this.protectedSupplies = [];
    this.player.play("player-idle-arrays-2");

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);
  }

  update() {
    if (!this.player?.body) return;

    const onGround = this.player.body.blocked.down || this.player.body.touching.down;

    if (this.sequenceMode === "walkingToExit") {
      this.player.setVelocityX(PLAYER_WALK_SPEED);
      this.player.setFlipX(false);
      this.playAnimation(onGround ? "player-run-arrays-2" : "player-jump-arrays-2");

      if (this.player.x >= this.exitPoint.x) {
        this.finishSuccessSequence();
      }
      return;
    }

    if (
      this.sequenceMode === "failure" ||
      this.sequenceMode === "collectingSupplies" ||
      this.sequenceMode === "depositingSupplies" ||
      this.sequenceMode === "aswangStealing"
    ) {
      this.player.setVelocityX(0);
      return;
    }

    this.player.setVelocityX(0);
    this.playAnimation(onGround ? "player-idle-arrays-2" : "player-jump-arrays-2");
  }

  createParallaxBackgrounds(map) {
    const worldWidth = map?.widthInPixels ?? this.scale.width;
    const backgrounds = [
      { key: "arrays_2_bg5", factor: 0.1, depth: -8, alpha: 0.82, y: 0 },
      { key: "arrays_2_bg_castle", factor: 0.1, depth: -7, alpha: 0.48, y: 0 },
      { key: "arrays_2_bg4", factor: 0.1, depth: -6, alpha: 0.72, y: 0 },
      { key: "arrays_2_bg3", factor: 0.4, depth: -5, alpha: 0.7, y: 94 },
      { key: "arrays_2_bg2", factor: 0.7, depth: -4, alpha: 0.66, y: 186 },
      { key: "arrays_2_bg1", factor: 0.9, depth: -3, alpha: 0.62, y: 232 },
    ];

    backgrounds.forEach(({ key, factor, depth, alpha, y }) => {
      const bg = this.add.tileSprite(0, y, worldWidth, this.scale.height - y, key);
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

  createMonsterAnimations() {
    MONSTER_ANIMATIONS.forEach(({ key, sheet, start, end, frameRate, repeat }) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(sheet, { start, end }),
        frameRate,
        repeat,
      });
    });
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
        };
      });
    };

    readLayer("objects");
    readLayer("Objects");
    readLayer("triggers");
    readLayer("Triggers");
    readLayer("hazzards");
    readLayer("Hazards");
    return points;
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
        0.54,
      )
      .setDepth(0.04);
  }

  createSupplyCrates() {
    this.crates = this.supplyPoints.map((point, index) => {
      const x = point.x;
      const y = Math.min(point.y + 7, this.floorY - 25);
      const container = this.add.container(x, y).setDepth(1);
      const shadow = this.add.ellipse(0, 24, 66, 12, 0x02050a, 0.48);
      const crate = this.add
        .image(0, 0, "arrays_2_supply_box")
        .setOrigin(0.5, 0.5)
        .setScale(0.13)
        .setTint(0xd0b085);
      const sealGlow = this.add
        .ellipse(0, 0, 70, 54, 0x57d68d, 0)
        .setBlendMode(Phaser.BlendModes.ADD);

      container.add([shadow, sealGlow, crate]);

      const marker = this.add
        .text(x, y - 64, `crate ${index + 1}`, {
          fontFamily: "monospace",
          fontSize: "14px",
          color: "#f8e7b2",
          backgroundColor: "rgba(4, 9, 18, 0.72)",
          padding: { x: 7, y: 4 },
        })
        .setOrigin(0.5)
        .setDepth(1.2);

      const itemLabel = this.add
        .text(x, y - 88, EXPECTED_SUPPLIES[index], {
          fontFamily: "monospace",
          fontSize: "15px",
          color: "#d9ffe6",
          backgroundColor: "rgba(7, 49, 31, 0.76)",
          padding: { x: 8, y: 4 },
        })
        .setOrigin(0.5)
        .setDepth(1.25)
        .setAlpha(0);

      return {
        container,
        crate,
        sealGlow,
        marker,
        itemLabel,
        homeX: x,
        homeY: y,
      };
    });
  }

  createAswangThreat() {
    const firstSupply = this.supplyPoints[0] ?? { x: this.spawnPoint.x + 520 };
    const visibleThreatX = Math.max(
      this.spawnPoint.x + 610,
      Math.min(this.aswangPoint.x, firstSupply.x + 130),
    );
    const visibleThreatY = Math.min(this.aswangPoint.y, this.floorY - 170);
    this.aswangStartPoint = { x: visibleThreatX, y: visibleThreatY };
    this.aswangAura = this.add
      .ellipse(this.aswangStartPoint.x, this.aswangStartPoint.y + 12, 116, 138, 0x3b0d18, 0.26)
      .setDepth(1.05);
    this.aswang = this.add
      .sprite(this.aswangStartPoint.x, this.aswangStartPoint.y, "aswang_idle", 0)
      .setOrigin(0.5)
      .setScale(0.55)
      .setDepth(1.15)
      .setFlipX(true);
    this.aswang.play("aswang-idle-arrays-2");

    this.tweens.add({
      targets: [this.aswang, this.aswangAura],
      y: this.aswang.y - 8,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
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
      this.startFailureSequence("The aswang steals the supplies. Check the string array order.");
      return;
    }

    const supplies = values?.supplies;
    if (!Array.isArray(supplies) || supplies.length !== EXPECTED_SUPPLIES.length) {
      this.startFailureSequence("The aswang steals the supplies because the array could not be read.");
      return;
    }

    this.startSuccessSequence();
  }

  resetAttemptState() {
    if (this.failureTimer) {
      this.failureTimer.remove(false);
      this.failureTimer = null;
    }
    this.sequenceTimers?.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.protectedSupplies?.forEach((item) => item.destroy());
    this.protectedSupplies = [];
    this.tweens.killTweensOf(this.player);
    this.crates?.forEach(({ container, crate, sealGlow, itemLabel, marker, homeX, homeY }) => {
      this.tweens.killTweensOf([container, crate, sealGlow, itemLabel, marker]);
      container.setPosition(homeX, homeY);
      container.setAngle(0);
      container.setScale(1);
      container.setAlpha(1);
      crate.setTint(0xd0b085).setScale(0.13);
      sealGlow.setAlpha(0).setScale(1);
      itemLabel.setAlpha(0).setY(container.y - 88);
      marker.setAlpha(1);
    });
    this.tweens.killTweensOf(this.aswang);
    this.tweens.killTweensOf(this.aswangAura);
    this.aswang?.setAlpha(1).setPosition(this.aswangStartPoint.x, this.aswangStartPoint.y);
    this.aswang?.play("aswang-idle-arrays-2", true);
    this.aswangAura?.setAlpha(1).setPosition(this.aswangStartPoint.x, this.aswangStartPoint.y + 12);
    this.sequenceMode = "idle";
    this.player.body.enable = true;
    this.player.setAlpha(1);
    this.player.setScale(PLAYER_SCALE);
    this.player.setGravityY(PLAYER_GRAVITY);
    this.player.setVelocity(0, 0);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y);
    this.player.body.reset(this.spawnPoint.x, this.spawnPoint.y);
    this.playAnimation("player-idle-arrays-2");
  }

  startSuccessSequence() {
    this.sequenceMode = "collectingSupplies";
    this.fleeAswang();
    this.collectSupplyAtIndex(0);
  }

  fleeAswang() {
    this.aswang?.play("aswang-attack-arrays-2", true);
    this.tweens.add({
      targets: [this.aswang, this.aswangAura],
      x: this.aswang.x + 260,
      y: this.aswang.y - 80,
      alpha: 0,
      duration: 720,
      ease: "Sine.easeIn",
    });
  }

  collectSupplyAtIndex(index) {
    const crate = this.crates[index];
    if (!crate) {
      this.depositSuppliesAtGate();
      return;
    }

    const targetX = crate.container.x - 28;
    this.movePlayerTo(targetX, () => {
      this.collectCrate(crate, index, () => {
        this.collectSupplyAtIndex(index + 1);
      });
    });
  }

  collectCrate(crate, index, onComplete) {
    crate.crate.setTint(0xffe0a3);
    this.tweens.add({
      targets: crate.sealGlow,
      alpha: { from: 0, to: 0.62 },
      scaleX: { from: 0.7, to: 1.18 },
      scaleY: { from: 0.7, to: 1 },
      duration: 180,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: crate.itemLabel,
      alpha: 1,
      y: crate.container.y - 102,
      duration: 180,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: crate.container,
      x: this.player.x + 18,
      y: this.player.y - 54,
      scaleX: 0.62,
      scaleY: 0.62,
      alpha: 0,
      duration: 360,
      ease: "Back.easeIn",
      onComplete: () => {
        crate.marker.setAlpha(0);
        crate.itemLabel.setAlpha(0);
        this.createCarriedSupplyBadge(index);
        onComplete?.();
      },
    });
  }

  createCarriedSupplyBadge(index) {
    const badge = this.add
      .image(this.player.x - 18 + index * 18, this.player.y - 88, "arrays_2_supply_box")
      .setOrigin(0.5)
      .setScale(0.035)
      .setDepth(1.4)
      .setTint(0xffe0a3);
    this.protectedSupplies.push(badge);

    this.tweens.add({
      targets: badge,
      y: badge.y - 8,
      duration: 280,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
  }

  depositSuppliesAtGate() {
    this.sequenceMode = "depositingSupplies";
    this.movePlayerTo(this.gatePoint.x - 64, () => {
      this.protectedSupplies.forEach((badge, index) => {
        this.tweens.add({
          targets: badge,
          x: this.gatePoint.x - 34 + index * 24,
          y: this.floorY - 28,
          scaleX: 0.055,
          scaleY: 0.055,
          duration: 300,
          ease: "Back.easeOut",
        });
      });

      this.schedule(360, () => {
        this.openGateAndWalk();
      });
    });
  }

  openGateAndWalk() {
    this.sequenceMode = "openingGate";
    this.schedule(220, () => {
      this.sequenceMode = "walkingToExit";
      this.player.body.enable = true;
      this.player.setVelocityX(PLAYER_WALK_SPEED);
      this.playAnimation("player-run-arrays-2");
    });
  }

  startFailureSequence(message) {
    this.sequenceMode = "aswangStealing";
    this.failureMessage = message;

    this.aswang?.play("aswang-attack-arrays-2", true);
    this.player.setVelocity(0, 0);
    this.playAnimation("player-idle-arrays-2");
    this.stealSupplyAtIndex(0);
  }

  stealSupplyAtIndex(index) {
    const crate = this.crates[index];
    if (!crate) {
      this.failureTimer = this.schedule(260, () => {
        this.emitFailureOutcome();
      });
      return;
    }

    this.tweens.add({
      targets: [this.aswang, this.aswangAura],
      x: crate.container.x,
      y: crate.container.y - 108,
      duration: 360,
      ease: "Sine.easeInOut",
      onComplete: () => {
        crate.crate.setTint(0xff6b6b);
        this.tweens.add({
          targets: crate.container,
          x: this.aswang.x,
          y: this.aswang.y + 28,
          scaleX: 0.42,
          scaleY: 0.42,
          alpha: 0,
          duration: 260,
          ease: "Back.easeIn",
          onComplete: () => {
            crate.marker.setAlpha(0);
            this.stealSupplyAtIndex(index + 1);
          },
        });
      },
    });
  }

  emitFailureOutcome() {
    this.sequenceMode = "failure";
    this.tweens.add({
      targets: [this.aswang, this.aswangAura],
      x: this.aswang.x + 180,
      alpha: 0,
      duration: 360,
      ease: "Sine.easeIn",
    });
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "failure",
      message: this.failureMessage,
    });
  }

  movePlayerTo(targetX, onComplete) {
    const distance = Math.abs(targetX - this.player.x);
    const duration = Math.max(260, (distance / PLAYER_WALK_SPEED) * 1000);
    const badgeOffsets = this.protectedSupplies.map((badge) => ({
      badge,
      x: badge.x - this.player.x,
      y: badge.y - this.player.y,
    }));
    this.player.setFlipX(targetX < this.player.x);
    this.playAnimation("player-run-arrays-2");
    badgeOffsets.forEach(({ badge, x, y }) => {
      this.tweens.add({
        targets: badge,
        x: targetX + x,
        y: this.player.y + y,
        duration,
        ease: "Linear",
      });
    });
    this.tweens.add({
      targets: this.player,
      x: targetX,
      duration,
      ease: "Linear",
      onComplete: () => {
        this.player.setVelocityX(0);
        this.playAnimation("player-idle-arrays-2");
        onComplete?.();
      },
    });
  }

  schedule(delay, callback) {
    const timer = this.time.delayedCall(delay, callback);
    this.sequenceTimers.push(timer);
    return timer;
  }

  startLegacyFailureTimer() {
    this.failureTimer = this.schedule(700, () => {
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
    this.playAnimation("player-idle-arrays-2");
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: "Supplies protected. Arrays Level 2 cleared.",
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
