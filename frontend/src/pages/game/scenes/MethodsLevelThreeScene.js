import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_DIALOGUE_CLOSED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";
import LayeredLpcCharacter from "../characters/LayeredLpcCharacter";
import { DIWATA_FAIRY_CONFIG } from "../characters/diwataFairyConfig";

const LEVEL_NUMBER = 16;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const MAP_KEY = "methods_level_3_torch_parameter";
const MAP_PATH = `${ASSET_BASE}/maps/methods-level-3-torch-parameter.tmj`;
const FIRE_PATH = `${ASSET_BASE}/other/Pixel Fire Asset Pack v3.2/Pixel Fire Asset Pack v3.2 Colored/Pixel Fire Asset Pack v3.2 Red/Group 4 - 1/Group 4 - 1.png`;
const PLAYER_SCALE = 2;
const PLAYER_SPEED = 170;
const DIWATA_SCALE = 1.25;
const TARGET_TORCH = 2;
const FIRE_ANIM_KEY = "methods-3-torch-fire";
const PORTAL_ANIM_KEY = "methods-3-barrier-portal";
const RITUAL_GOLD = 0xf2c96d;
const RITUAL_TEAL = 0x7ff6d1;
const FAIL_RED = 0xff6875;

export default class MethodsLevelThreeScene extends Phaser.Scene {
  constructor() {
    super("MethodsLevelThreeScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("methods_3_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("methods_3_decor", `${GH_BASE}/Decor.png`);
    this.load.image("methods_3_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("methods_3_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("methods_3_house", `${GH_BASE}/House_Tiles.png`);
    this.load.image("methods_3_other", `${GH_BASE}/Other_Tiles2.png`);
    this.load.image("methods_3_other_flipped", `${GH_BASE}/Other_Tiles2(Flipped).png`);
    this.load.image("methods_3_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("methods_3_willow_big", `${GH_BASE}/Weeping_Willow1Big.png`);
    this.load.image("methods_3_willow", `${GH_BASE}/Weeping_Willow1.png`);
    this.load.image("methods_3_tree_1", `${GH_BASE}/Tree1.png`);
    this.load.image("methods_3_large_pine", `${GH_BASE}/Large_Pine_Tree.png`);
    this.load.image("methods_3_wheat", `${GH_BASE}/Pixel_Art_Wheat.png`);
    this.load.image("methods_3_signage_1", `${ASSET_BASE}/other/signage1.png`);
    this.load.image("methods_3_signage_2", `${ASSET_BASE}/other/signage2.png`);
    this.load.image("methods_3_unlit_candle", `${ASSET_BASE}/other/unlit_candle.png`);
    this.load.image("methods_3_unlit_candle_tileset", `${ASSET_BASE}/other/unlit_candle_tileset.png`);
    this.load.image("methods_3_torch_tile", `${ASSET_BASE}/other/torch.png`);
    this.load.spritesheet("methods_3_fire", FIRE_PATH, {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet(
      "methods_3_portal",
      `${GH_BASE}/Animated_Sprites/GandalfHardcore_Portal_sheet.png`,
      { frameWidth: 64, frameHeight: 64 },
    );
    this.load.spritesheet(
      "methods_3_player",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
    this.load.image("methods_3_bg5", `${BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("methods_3_bg4", `${BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("methods_3_bg3", `${BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("methods_3_bg2", `${BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("methods_3_bg1", `${BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
  }

  create() {
    this.scale.resize(1024, 576);
    const map = this.make.tilemap({ key: MAP_KEY });
    this.offsetY = this.scale.height - map.heightInPixels;
    this.sequenceMode = "idle";
    this.sequenceTimers = [];
    this.temporaryEffects = [];

    this.createBackgrounds(map);
    this.createTileLayers(map);
    this.createAnimations();

    this.points = this.resolveMapPoints(map);
    this.spawnPoint = this.points.player_spawn ?? { x: 96, y: 448 };
    this.diwataPoint = this.points.diwata_spawn ?? { x: 520, y: 436 };
    this.torchPoints = [1, 2, 3].map((number) => ({
      number,
      ...(this.points[`torch_${number}`] ?? { x: 560 + number * 96, y: 400 }),
    }));
    this.targetTorch = this.torchPoints.find((torch) => torch.number === TARGET_TORCH) ?? this.torchPoints[1];
    this.barrierPoint = this.points.exit_barrier ?? { x: 1050, y: this.spawnPoint.y };
    this.exitPoint = this.points.level_exit ?? { x: map.widthInPixels - 86, y: this.spawnPoint.y };
    this.groundY = Math.max(this.spawnPoint.y, this.barrierPoint.y, this.exitPoint.y);
    this.barrierBasePoint = {
      x: this.barrierPoint.x,
      y: Math.max(this.barrierPoint.y, this.groundY),
    };

    this.createTorchEffects();
    this.createDiwata();
    this.createBarrier();
    this.createPlayer();
    this.createLabels();
    this.setupCamera(map);

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.on(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  update(_time, delta) {
    if (!this.player) return;
    const step = (PLAYER_SPEED * delta) / 1000;
    if (this.sequenceMode === "walkingToExit") {
      this.player.play("methods-3-player-run", true);
      this.player.setFlipX(false);
      this.player.x = Math.min(this.player.x + step, this.exitPoint.x);
      if (this.player.x >= this.exitPoint.x) this.finishSuccess();
    }
  }

  createBackgrounds(map) {
    [
      ["methods_3_bg5", 0.08, -8, 0.78, 0],
      ["methods_3_bg4", 0.14, -7, 0.7, 0],
      ["methods_3_bg3", 0.32, -6, 0.62, 88],
      ["methods_3_bg2", 0.58, -5, 0.58, 176],
      ["methods_3_bg1", 0.82, -4, 0.5, 225],
    ].forEach(([key, factor, depth, alpha, y]) => {
      this.add
        .tileSprite(0, y, map.widthInPixels, this.scale.height - y, key)
        .setOrigin(0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x20384c)
        .setAlpha(alpha);
    });
    this.add.rectangle(0, 0, map.widthInPixels, 576, 0x030711, 0.28).setOrigin(0).setDepth(-3);
  }

  createTileLayers(map) {
    const tilesets = [
      map.addTilesetImage("Floor_Tiles2", "methods_3_floor"),
      map.addTilesetImage("Decor", "methods_3_decor"),
      map.addTilesetImage("Garden_Decorations", "methods_3_garden"),
      map.addTilesetImage("Pine_Trees", "methods_3_pines"),
      map.addTilesetImage("House_Tiles", "methods_3_house"),
      map.addTilesetImage("Other_Tiles2", "methods_3_other"),
      map.addTilesetImage("Other_Tiles2(Flipped)", "methods_3_other_flipped"),
      map.addTilesetImage("Pine_forest_sheet", "methods_3_forest"),
      map.addTilesetImage("Weeping_Willow1Big", "methods_3_willow_big"),
      map.addTilesetImage("Weeping_Willow1", "methods_3_willow"),
      map.addTilesetImage("Tree1", "methods_3_tree_1"),
      map.addTilesetImage("Large_Pine_Tree", "methods_3_large_pine"),
      map.addTilesetImage("Pixel_Art_Wheat", "methods_3_wheat"),
      map.addTilesetImage("signage1", "methods_3_signage_1"),
      map.addTilesetImage("signage2", "methods_3_signage_2"),
      map.addTilesetImage("unlit_candle", "methods_3_unlit_candle"),
      map.addTilesetImage("unlit_candle_tileset", "methods_3_unlit_candle_tileset"),
      map.addTilesetImage("torch", "methods_3_torch_tile"),
    ].filter(Boolean);

    ["platform", "trees", "decoration", "front_decoration"].forEach((name, index) => {
      const layer = map.createLayer(name, tilesets, 0, this.offsetY);
      if (layer) layer.setDepth(0.1 + index * 0.25);
    });
  }

  createAnimations() {
    [
      ["methods-3-player-idle", 0, 5, 6],
      ["methods-3-player-run", 16, 23, 12],
      ["methods-3-player-hurt", 48, 55, 10],
      ["methods-3-player-cast", 64, 71, 10],
    ].forEach(([key, start, end, frameRate]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("methods_3_player", { start, end }),
        frameRate,
        repeat: key.includes("hurt") || key.includes("cast") ? 0 : -1,
      });
    });

    if (!this.anims.exists(FIRE_ANIM_KEY)) {
      this.anims.create({
        key: FIRE_ANIM_KEY,
        frames: this.anims.generateFrameNumbers("methods_3_fire", { start: 0, end: 15 }),
        frameRate: 14,
        repeat: -1,
      });
    }

    if (!this.anims.exists(PORTAL_ANIM_KEY)) {
      this.anims.create({
        key: PORTAL_ANIM_KEY,
        frames: this.anims.generateFrameNumbers("methods_3_portal", { start: 0, end: 9 }),
        frameRate: 9,
        repeat: -1,
      });
    }
  }

  createTorchEffects() {
    this.torchEffects = this.torchPoints.map((torch) => {
      const label = this.add
        .text(torch.x, torch.y - 78, `${torch.number}`, {
          fontFamily: "monospace",
          fontSize: "13px",
          color: "#d9f3ff",
          backgroundColor: "#07141fcc",
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(2);
      const glow = this.add
        .ellipse(torch.x, torch.y - 21, 42, 58, 0xff8f3d, 0)
        .setDepth(1.45)
        .setBlendMode(Phaser.BlendModes.SCREEN);
      const cursedAura = this.add
        .ellipse(torch.x, torch.y - 21, 36, 50, 0x7b2a55, torch.number === TARGET_TORCH ? 0 : 0.055)
        .setDepth(1.42)
        .setBlendMode(Phaser.BlendModes.SCREEN);
      const fire = this.add
        .sprite(torch.x, torch.y - 6, "methods_3_fire", 0)
        .setOrigin(0.5, 1)
        .setScale(0.9)
        .setDepth(1.58)
        .setAlpha(0);
      const ring = this.add
        .ellipse(torch.x, torch.y + 8, 50, 14)
        .setStrokeStyle(1, RITUAL_TEAL, torch.number === TARGET_TORCH ? 0.28 : 0.14)
        .setDepth(1.2);
      const torchEffect = { ...torch, label, glow, cursedAura, fire, ring };
      this.startCursedAuraIdle(torchEffect);
      return torchEffect;
    });
  }

  startCursedAuraIdle(torch) {
    if (!torch || torch.number === TARGET_TORCH) return;
    this.tweens.killTweensOf(torch.cursedAura);
    torch.cursedAura.setAlpha(0.055).setScale(1);
    this.tweens.add({
      targets: torch.cursedAura,
      alpha: 0.12,
      scaleX: 1.12,
      scaleY: 1.08,
      duration: 1550 + torch.number * 170,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createDiwata() {
    this.diwata = new LayeredLpcCharacter(
      this,
      this.diwataPoint.x,
      this.diwataPoint.y - 8,
      DIWATA_FAIRY_CONFIG,
      {
        animationName: "idle",
        direction: "left",
        depth: 1.5,
        scale: DIWATA_SCALE,
      },
    );
    this.diwataGlow = this.add
      .ellipse(this.diwataPoint.x, this.diwataPoint.y - 32, 48, 66, 0x9effd5, 0.08)
      .setDepth(1.35)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.diwataLabel = this.add
      .text(this.diwataPoint.x, this.diwataPoint.y - 94, "Only torch 2 is clean.", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d9fff1",
        backgroundColor: "#07141fde",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(1.8);
    this.tweens.add({
      targets: [this.diwata, this.diwataGlow],
      y: "-=5",
      duration: 1550,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createBarrier() {
    this.barrier = this.add.container(this.barrierBasePoint.x, this.barrierBasePoint.y).setDepth(1.55);
    this.barrierGlow = this.add
      .ellipse(0, -42, 84, 120, 0x8feeff, 0.12)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.barrierCore = this.add
      .sprite(0, -4, "methods_3_portal", 0)
      .setOrigin(0.5, 1)
      .setScale(1.36)
      .setAlpha(0.72)
      .setTint(0xb8f4ff)
      .play(PORTAL_ANIM_KEY);
    this.barrierLabel = this.add
      .text(0, -112, "sealed path", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d9f3ff",
        backgroundColor: "#07141fde",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5);
    this.barrier.add([this.barrierGlow, this.barrierCore, this.barrierLabel]);
  }

  createPlayer() {
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "methods_3_player", 0)
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.9)
      .play("methods-3-player-idle");
  }

  createLabels() {
    this.statusText = this.add
      .text(this.targetTorch.x, this.targetTorch.y - 114, "torchNumber = ?", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#f3e6c4",
        backgroundColor: "#07141fdd",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.callLabel = this.add
      .text(this.targetTorch.x, this.targetTorch.y - 48, "LightTorch(?)", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffd68a",
        backgroundColor: "#07141fcc",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setAlpha(0.5);
  }

  onCodeEvaluated({ levelNumber, isCorrect, message }) {
    if (Number(levelNumber) !== LEVEL_NUMBER) return;
    this.resetAttempt();
    if (isCorrect) this.startSuccess();
    else this.startFailure(message);
  }

  onDialogueClosed({ levelNumber }) {
    if (Number(levelNumber) !== LEVEL_NUMBER || this.openingPreviewPlayed) return;
    this.playOpeningPreview();
  }

  resetAttempt() {
    this.sequenceTimers.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.temporaryEffects.forEach((effect) => effect.destroy());
    this.temporaryEffects = [];
    this.tweens.killTweensOf([
      this.player,
      this.barrier,
      this.barrierCore,
      this.barrierGlow,
      this.statusText,
      this.callLabel,
      ...this.torchEffects.flatMap((torch) => [torch.fire, torch.glow, torch.cursedAura, torch.ring, torch.label]),
    ]);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y).setAlpha(1).setTint(0xffffff);
    this.player.play("methods-3-player-idle", true);
    this.diwata.playIdle("left");
    this.diwataLabel.setText("Only torch 2 is clean.").setColor("#d9fff1");
    this.statusText.setText("torchNumber = ?").setColor("#f3e6c4");
    this.callLabel.setText("LightTorch(?)").setColor("#ffd68a").setAlpha(0.5);
    this.torchEffects.forEach((torch) => {
      torch.fire.stop().setAlpha(0).setScale(0.9).setTint(0xffffff);
      torch.glow.setAlpha(1).setFillStyle(0xff8f3d, 0).setScale(1);
      torch.cursedAura
        .setAlpha(torch.number === TARGET_TORCH ? 0 : 0.055)
        .setFillStyle(0x7b2a55, torch.number === TARGET_TORCH ? 0 : 0.055)
        .setScale(1);
      torch.ring.setStrokeStyle(1, RITUAL_TEAL, torch.number === TARGET_TORCH ? 0.28 : 0.14).setScale(1);
      torch.label.setColor("#d9f3ff").setAlpha(1);
      this.startCursedAuraIdle(torch);
    });
    this.barrier.setPosition(this.barrierBasePoint.x, this.barrierBasePoint.y).setAlpha(1).setScale(1);
    this.barrierCore.setAlpha(0.72).setScale(1.36).setTint(0xb8f4ff).play(PORTAL_ANIM_KEY, true);
    this.barrierGlow.setAlpha(0.12).setScale(1);
    this.sequenceMode = "idle";
    this.cameras.main.stopFollow();
    this.panTo(this.spawnPoint.x, 240);
  }

  startSuccess() {
    this.sequenceMode = "castingTorch";
    this.statusText.setText("torchNumber = 2").setColor("#bfffe5");
    this.callLabel.setText("LightTorch(2)").setColor("#ffe7aa").setAlpha(0.86);
    this.diwataLabel.setText("The argument chose the clean flame.").setColor("#bfffe5");
    this.player.setFlipX(false).play("methods-3-player-cast", true);
    this.createPlayerCastSparks();
    this.schedule(170, () => this.createArgumentTransfer(this.targetTorch));
    this.schedule(560, () => this.lightTorch(TARGET_TORCH));
    this.schedule(1160, () => {
      this.statusText.setText("torch 2 lit").setColor("#ffe7aa");
      this.createTorchToBarrierStreak(this.targetTorch);
      this.panTo(this.barrierBasePoint.x, 720);
    });
    this.schedule(2040, () => this.openBarrier());
  }

  lightTorch(number, failed = false) {
    const torch = this.torchEffects.find((item) => item.number === number);
    if (!torch) return;
    torch.fire.play(FIRE_ANIM_KEY, true).setTint(failed ? 0xff8b8b : 0xffffff);
    if (failed) {
      torch.glow.setFillStyle(FAIL_RED, 0.16);
      torch.cursedAura.setFillStyle(0xba3b78, 0.22).setAlpha(0.22);
      torch.label.setColor("#ffb8b8");
    }
    this.tweens.add({
      targets: torch.fire,
      alpha: failed ? 0.42 : 1,
      scaleX: failed ? 0.82 : 0.96,
      scaleY: failed ? 0.82 : 0.96,
      duration: 300,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: torch.glow,
      alpha: failed ? 0.22 : 0.42,
      scaleX: failed ? 0.92 : 1.18,
      scaleY: failed ? 0.92 : 1.12,
      duration: 500,
      yoyo: !failed,
      repeat: failed ? 0 : -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: torch.ring,
      scaleX: 1.2,
      scaleY: 1.4,
      duration: 360,
      yoyo: true,
      repeat: failed ? 1 : 2,
      ease: "Sine.easeInOut",
    });
    this.createFireSparks(torch, failed);
    if (failed) {
      this.createCursedBurst(torch);
      this.shakeBarrier();
      this.schedule(520, () => {
        torch.fire.stop().setAlpha(0).setTint(0xffffff);
        torch.glow.setAlpha(1).setFillStyle(0xff8f3d, 0);
        torch.cursedAura.setFillStyle(0x7b2a55, 0.055).setAlpha(0.055);
      });
    }
  }

  createArgumentTransfer(torch) {
    const value = this.add
      .text(this.callLabel.x, this.callLabel.y - 4, "2", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: "#ffe7aa",
        backgroundColor: "#07141fd8",
        padding: { x: 7, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(2.4);
    const trail = this.add
      .circle(value.x, value.y, 10, RITUAL_GOLD, 0.24)
      .setDepth(2.35)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.temporaryEffects.push(value, trail);
    this.tweens.add({
      targets: [value, trail],
      x: torch.x,
      y: torch.y - 46,
      scale: 0.82,
      duration: 430,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.tweens.add({
          targets: [value, trail],
          alpha: 0,
          scale: 1.3,
          duration: 180,
          onComplete: () => {
            [value, trail].forEach((item) => {
              Phaser.Utils.Array.Remove(this.temporaryEffects, item);
              item.destroy();
            });
          },
        });
      },
    });
  }

  createPlayerCastSparks() {
    const originX = this.player.x + 14;
    const originY = this.player.y - 78;
    for (let index = 0; index < 12; index += 1) {
      const spark = this.add
        .circle(
          originX + Phaser.Math.Between(-5, 10),
          originY + Phaser.Math.Between(-4, 10),
          Phaser.Math.FloatBetween(1.2, 2),
          index % 2 === 0 ? 0xffe08a : 0xfff5c7,
          0.86,
        )
        .setDepth(2)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.temporaryEffects.push(spark);
      this.tweens.add({
        targets: spark,
        x: spark.x + Phaser.Math.Between(6, 24),
        y: spark.y - Phaser.Math.Between(8, 28),
        alpha: 0,
        scale: 0.35,
        duration: Phaser.Math.Between(420, 720),
        delay: index * 26,
        ease: "Sine.easeOut",
        onComplete: () => {
          Phaser.Utils.Array.Remove(this.temporaryEffects, spark);
          spark.destroy();
        },
      });
    }
  }

  createFireSparks(torch, failed = false) {
    for (let index = 0; index < 14; index += 1) {
      const spark = this.add
        .circle(
          torch.x + Phaser.Math.Between(-8, 8),
          torch.y - Phaser.Math.Between(18, 36),
          Phaser.Math.FloatBetween(1.1, 2),
          failed ? FAIL_RED : index % 2 === 0 ? 0xffca72 : 0xff6b3a,
          0.8,
        )
        .setDepth(1.85)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: spark,
        y: spark.y - Phaser.Math.Between(20, 42),
        x: spark.x + Phaser.Math.Between(-15, 15),
        alpha: 0,
        scale: 0.35,
        duration: Phaser.Math.Between(520, 840),
        delay: index * 22,
        ease: "Sine.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  createCursedBurst(torch) {
    const burst = this.add
      .ellipse(torch.x, torch.y - 26, 54, 64, 0x8d285e, 0.18)
      .setDepth(1.82)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.temporaryEffects.push(burst);
    this.tweens.add({
      targets: burst,
      alpha: 0,
      scaleX: 1.55,
      scaleY: 1.35,
      duration: 560,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, burst);
        burst.destroy();
      },
    });
  }

  createTorchToBarrierStreak(torch) {
    const startX = torch.x + 12;
    const startY = torch.y - 34;
    const endX = this.barrierBasePoint.x - 10;
    const endY = this.barrierBasePoint.y - 58;
    const distance = Phaser.Math.Distance.Between(startX, startY, endX, endY);
    const angle = Phaser.Math.Angle.Between(startX, startY, endX, endY);
    const streak = this.add
      .rectangle(startX, startY, 2, 3, 0xffc46b, 0.9)
      .setOrigin(0, 0.5)
      .setRotation(angle)
      .setDepth(1.85)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.temporaryEffects.push(streak);
    this.tweens.add({
      targets: streak,
      width: distance,
      duration: 430,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: streak,
          alpha: 0,
          duration: 260,
          onComplete: () => {
            Phaser.Utils.Array.Remove(this.temporaryEffects, streak);
            streak.destroy();
          },
        });
      },
    });
  }

  openBarrier() {
    this.barrierLabel.setText("path opened");
    this.tweens.add({
      targets: [this.barrierGlow, this.barrierCore],
      alpha: 0.98,
      scaleX: 1.55,
      scaleY: 1.55,
      duration: 340,
      ease: "Sine.easeOut",
    });
    this.schedule(520, () => {
      this.tweens.add({
        targets: this.barrier,
        alpha: 0,
        y: this.barrierBasePoint.y - 24,
        scaleY: 1.22,
        duration: 660,
        ease: "Sine.easeIn",
        onComplete: () => {
          this.sequenceMode = "walkingToExit";
          this.cameras.main.startFollow(this.player, true, 0.08, 0.08, -260, 0);
        },
      });
    });
  }

  shakeBarrier() {
    if (!this.barrier) return;
    this.tweens.add({
      targets: this.barrier,
      x: {
        from: this.barrierBasePoint.x - 5,
        to: this.barrierBasePoint.x + 5,
      },
      duration: 54,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
      onComplete: () => this.barrier.setX(this.barrierBasePoint.x),
    });
  }

  startFailure(message = "") {
    this.sequenceMode = "failure";
    const feedback = this.getFailureFeedback(message);
    this.statusText.setText(feedback.status).setColor("#ffb8b8");
    this.callLabel.setText(feedback.callCue).setColor("#ffb8b8").setAlpha(0.72);
    this.diwataLabel.setText(feedback.guide).setColor("#ffcccc");
    this.player.play("methods-3-player-hurt", true);
    if (feedback.wrongTorch) {
      this.lightTorch(feedback.wrongTorch, true);
      const wrongTorch = this.torchEffects.find((torch) => torch.number === feedback.wrongTorch);
      this.schedule(380, () => this.panTo(wrongTorch?.x ?? this.targetTorch.x, 560));
    } else {
      this.pulseAllTorchesFailure();
      this.schedule(620, () => this.panTo(this.targetTorch.x, 560));
    }
    this.schedule(1680, () => {
      this.resetAttempt();
      this.statusText.setText("try again").setColor("#f3e6c4");
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message: message || "Define LightTorch with one int parameter, then call LightTorch(2).",
      });
    });
  }

  getFailureFeedback(message = "") {
    const normalized = String(message).toLowerCase();
    const wrongArgMatch = normalized.match(/lighttorch\((\d+)\)/);
    if (normalized.includes("define static void")) {
      return {
        status: "parameter missing",
        guide: "The method needs one int parameter.",
        callCue: "LightTorch(int torchNumber)",
      };
    }
    if (normalized.includes("body does nothing") || normalized.includes("will not light the safe torch")) {
      return {
        status: "body missing",
        guide: "LightTorch received the right value, but its body did nothing with it.",
        callCue: "WriteLine(torchNumber)",
      };
    }
    if (normalized.includes("wrong torch argument")) {
      return {
        status: "wrong argument",
        guide: "That number carried the ritual to a cursed torch.",
        callCue: "LightTorch(2)",
        wrongTorch: Number(wrongArgMatch?.[1]) || null,
      };
    }
    if (normalized.includes("call lighttorch")) {
      return {
        status: "method not called",
        guide: "A parameter only travels when Main calls the method.",
        callCue: "LightTorch(2)",
      };
    }
    return {
      status: "ritual incomplete",
      guide: "Define the parameter, use it, then pass the clean torch number from Main.",
      callCue: "LightTorch(?)",
    };
  }

  pulseAllTorchesFailure() {
    this.torchEffects.forEach((torch, index) => {
      this.tweens.add({
        targets: [torch.ring, torch.label],
        alpha: 0.25,
        duration: 110,
        delay: index * 45,
        yoyo: true,
        repeat: 3,
        ease: "Sine.easeInOut",
      });
    });
  }

  finishSuccess() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    this.cameras.main.stopFollow();
    this.player.play("methods-3-player-idle", true);
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: "LightTorch received parameter value 2, so the second torch lit and opened the path.",
      shouldProceed: true,
    });
  }

  resolveMapPoints(map) {
    const points = {};
    ["objects", "Objects", "triggers", "Triggers", "hazzards", "hazards"].forEach((name) => {
      const layer = map.getObjectLayer(name);
      layer?.objects.forEach((object) => {
        const key = object.name?.trim();
        if (!key) return;
        points[key] = {
          x: object.x + (object.width || 0) / 2,
          y: object.y + this.offsetY + (object.height || 0),
        };
      });
    });
    return points;
  }

  setupCamera(map) {
    const maxScrollX = Math.max(0, map.widthInPixels - this.scale.width);
    this.cameraBounds = { minX: 0, maxX: maxScrollX };
    this.cameras.main.setBounds(0, this.offsetY, map.widthInPixels, map.heightInPixels);
    this.panTo(this.spawnPoint.x, 0);
  }

  playOpeningPreview() {
    this.openingPreviewPlayed = true;
    this.schedule(260, () => {
      if (this.sequenceMode !== "idle") return;
      this.statusText.setText("choose a torch number").setColor("#f3e6c4");
      this.panTo(this.targetTorch.x, 860);
    });
    this.schedule(1640, () => {
      if (this.sequenceMode !== "idle") return;
      this.statusText.setText("torchNumber = ?").setColor("#f3e6c4");
      this.panTo(this.spawnPoint.x, 900);
    });
  }

  panTo(worldX, duration = 430) {
    const scrollX = Phaser.Math.Clamp(
      worldX - this.scale.width * 0.38,
      this.cameraBounds?.minX ?? 0,
      this.cameraBounds?.maxX ?? 0,
    );
    if (duration <= 0) {
      this.cameras.main.scrollX = scrollX;
      return;
    }
    this.tweens.add({
      targets: this.cameras.main,
      scrollX,
      duration,
      ease: "Sine.easeInOut",
    });
  }

  schedule(delay, callback) {
    const timer = this.time.delayedCall(delay, callback);
    this.sequenceTimers.push(timer);
    return timer;
  }

  cleanup() {
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.off(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.sequenceTimers.forEach((timer) => timer.remove(false));
    this.temporaryEffects?.forEach((effect) => effect.destroy());
  }
}
