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
const MAP_KEY = "methods_level_3_light_warding_flame";
const MAP_PATH = `${ASSET_BASE}/maps/methods-level-3-light-warding-flame.tmj`;
const FIRE_PATH = `${ASSET_BASE}/other/Pixel Fire Asset Pack v3.2/Pixel Fire Asset Pack v3.2 Colored/Pixel Fire Asset Pack v3.2 Red/Group 4 - 1/Group 4 - 1.png`;
const PLAYER_SCALE = 2;
const PLAYER_SPEED = 170;
const DIWATA_SCALE = 1.25;
const STOP_BEFORE_CANDLE = 62;
const RITUAL_TEAL = 0x7ff6d1;
const RITUAL_GOLD = 0xf2c96d;
const FAIL_RED = 0xff6875;
const FIRE_ANIM_KEY = "methods-2-ritual-fire";
const PORTAL_ANIM_KEY = "methods-2-barrier-portal";

export default class MethodsLevelTwoScene extends Phaser.Scene {
  constructor() {
    super("MethodsLevelTwoScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("methods_2_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("methods_2_decor", `${GH_BASE}/Decor.png`);
    this.load.image("methods_2_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("methods_2_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("methods_2_house", `${GH_BASE}/House_Tiles.png`);
    this.load.image("methods_2_other", `${GH_BASE}/Other_Tiles2.png`);
    this.load.image("methods_2_other_flipped", `${GH_BASE}/Other_Tiles2(Flipped).png`);
    this.load.image("methods_2_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("methods_2_willow", `${GH_BASE}/Weeping_Willow1Big.png`);
    this.load.image("methods_2_willow_small", `${GH_BASE}/Weeping_Willow1.png`);
    this.load.image("methods_2_tree_1", `${GH_BASE}/Tree1.png`);
    this.load.image("methods_2_large_pine", `${GH_BASE}/Large_Pine_Tree.png`);
    this.load.image("methods_2_wheat", `${GH_BASE}/Pixel_Art_Wheat.png`);
    this.load.image("methods_2_signage_1", `${ASSET_BASE}/other/signage1.png`);
    this.load.image("methods_2_signage_2", `${ASSET_BASE}/other/signage2.png`);
    this.load.image("methods_2_unlit_candle", `${ASSET_BASE}/other/unlit_candle.png`);
    this.load.image("methods_2_unlit_candle_tileset", `${ASSET_BASE}/other/unlit_candle_tileset.png`);
    this.load.spritesheet("methods_2_fire", FIRE_PATH, {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet(
      "methods_2_portal",
      `${GH_BASE}/Animated_Sprites/GandalfHardcore_Portal_sheet.png`,
      { frameWidth: 64, frameHeight: 64 },
    );
    this.load.spritesheet(
      "methods_2_player",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
    this.load.image("methods_2_bg5", `${BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("methods_2_bg4", `${BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("methods_2_bg3", `${BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("methods_2_bg2", `${BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("methods_2_bg1", `${BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
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
    this.diwataPoint = this.points.diwata_spawn ?? { x: 510, y: 440 };
    this.candlePoint = this.points.ritual_candle ?? this.points.ritual_circle ?? { x: 690, y: 414 };
    this.ritualPoint = this.points.ritual_circle ?? { x: this.candlePoint.x, y: this.candlePoint.y + 32 };
    this.barrierPoint = this.points.exit_barrier ?? { x: 1048, y: this.spawnPoint.y };
    this.exitPoint = this.points.level_exit ?? { x: map.widthInPixels - 84, y: this.spawnPoint.y };
    this.groundY = Math.max(this.spawnPoint.y, this.exitPoint.y, this.barrierPoint.y);
    this.barrierBasePoint = {
      x: this.barrierPoint.x,
      y: Math.max(this.barrierPoint.y, this.groundY),
    };

    this.createRitualFocus();
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

    if (this.sequenceMode === "walkingToCandle") {
      this.player.play("methods-2-player-run", true);
      this.player.setFlipX(false);
      this.player.x = Math.min(this.player.x + step, this.candlePoint.x - STOP_BEFORE_CANDLE);
      if (this.player.x >= this.candlePoint.x - STOP_BEFORE_CANDLE) {
        this.sequenceMode = "lighting";
        this.player.play("methods-2-player-idle", true);
        this.cameras.main.stopFollow();
        this.lightRitualCandle();
      }
    }

    if (this.sequenceMode === "walkingToExit") {
      this.player.play("methods-2-player-run", true);
      this.player.setFlipX(false);
      this.player.x = Math.min(this.player.x + step, this.exitPoint.x);
      if (this.player.x >= this.exitPoint.x) this.finishSuccess();
    }
  }

  createBackgrounds(map) {
    [
      ["methods_2_bg5", 0.08, -8, 0.78, 0],
      ["methods_2_bg4", 0.14, -7, 0.7, 0],
      ["methods_2_bg3", 0.32, -6, 0.62, 88],
      ["methods_2_bg2", 0.58, -5, 0.58, 176],
      ["methods_2_bg1", 0.82, -4, 0.5, 225],
    ].forEach(([key, factor, depth, alpha, y]) => {
      this.add
        .tileSprite(0, y, map.widthInPixels, this.scale.height - y, key)
        .setOrigin(0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x20384c)
        .setAlpha(alpha);
    });
    this.ambientShadow = this.add
      .rectangle(0, 0, map.widthInPixels, 576, 0x030711, 0.3)
      .setOrigin(0)
      .setDepth(-3);
  }

  createTileLayers(map) {
    const tilesets = [
      map.addTilesetImage("Floor_Tiles2", "methods_2_floor"),
      map.addTilesetImage("Decor", "methods_2_decor"),
      map.addTilesetImage("Garden_Decorations", "methods_2_garden"),
      map.addTilesetImage("Pine_Trees", "methods_2_pines"),
      map.addTilesetImage("House_Tiles", "methods_2_house"),
      map.addTilesetImage("Other_Tiles2", "methods_2_other"),
      map.addTilesetImage("Other_Tiles2(Flipped)", "methods_2_other_flipped"),
      map.addTilesetImage("Pine_forest_sheet", "methods_2_forest"),
      map.addTilesetImage("Weeping_Willow1Big", "methods_2_willow"),
      map.addTilesetImage("Weeping_Willow1", "methods_2_willow_small"),
      map.addTilesetImage("Tree1", "methods_2_tree_1"),
      map.addTilesetImage("Large_Pine_Tree", "methods_2_large_pine"),
      map.addTilesetImage("Pixel_Art_Wheat", "methods_2_wheat"),
      map.addTilesetImage("signage1", "methods_2_signage_1"),
      map.addTilesetImage("signage2", "methods_2_signage_2"),
      map.addTilesetImage("unlit_candle", "methods_2_unlit_candle"),
      map.addTilesetImage("unlit_candle_tileset", "methods_2_unlit_candle_tileset"),
    ].filter(Boolean);

    ["platform", "trees", "decoration", "front_decoration"].forEach((name, index) => {
      const layer = map.createLayer(name, tilesets, 0, this.offsetY);
      if (layer) layer.setDepth(0.1 + index * 0.25);
    });
  }

  createAnimations() {
    [
      ["methods-2-player-idle", 0, 5, 6],
      ["methods-2-player-run", 16, 23, 12],
      ["methods-2-player-hurt", 48, 55, 10],
      ["methods-2-player-cast", 64, 71, 10],
    ].forEach(([key, start, end, frameRate]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("methods_2_player", { start, end }),
        frameRate,
        repeat: key.includes("hurt") || key.includes("cast") ? 0 : -1,
      });
    });

    if (!this.anims.exists(FIRE_ANIM_KEY)) {
      this.anims.create({
        key: FIRE_ANIM_KEY,
        frames: this.anims.generateFrameNumbers("methods_2_fire", { start: 0, end: 15 }),
        frameRate: 14,
        repeat: -1,
      });
    }

    if (!this.anims.exists(PORTAL_ANIM_KEY)) {
      this.anims.create({
        key: PORTAL_ANIM_KEY,
        frames: this.anims.generateFrameNumbers("methods_2_portal", { start: 0, end: 9 }),
        frameRate: 9,
        repeat: -1,
      });
    }
  }

  createRitualFocus() {
    this.ritual = this.add.container(this.ritualPoint.x, this.ritualPoint.y).setDepth(1.1);
    this.ritualGroundGlow = this.add
      .ellipse(0, 5, 96, 20, RITUAL_GOLD, 0.04)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.ritualRing = this.add
      .ellipse(0, 4, 104, 24)
      .setStrokeStyle(1, RITUAL_TEAL, 0.22);
    this.ritualInnerRing = this.add
      .ellipse(0, 4, 58, 13)
      .setStrokeStyle(1, RITUAL_GOLD, 0.18);
    this.ritual.add([this.ritualGroundGlow, this.ritualRing, this.ritualInnerRing]);

    this.fireGlow = this.add
      .ellipse(this.candlePoint.x, this.candlePoint.y - 12, 48, 64, 0xff8f3d, 0)
      .setDepth(1.45)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.unlitFlameAura = this.add
      .ellipse(this.candlePoint.x, this.candlePoint.y - 12, 54, 70, 0x80d7ff, 0.1)
      .setDepth(1.42)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.fireSprite = this.add
      .sprite(this.candlePoint.x, this.candlePoint.y + 2, "methods_2_fire", 0)
      .setOrigin(0.5, 1)
      .setScale(1.04)
      .setDepth(1.55)
      .setAlpha(0);

    this.tweens.add({
      targets: [this.ritualRing, this.ritualInnerRing, this.ritualGroundGlow, this.unlitFlameAura],
      alpha: { from: 0.16, to: 0.38 },
      duration: 1500,
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
    this.faceDiwataTowardKai();
    this.diwataGlow = this.add
      .ellipse(this.diwataPoint.x, this.diwataPoint.y - 32, 48, 66, 0x9effd5, 0.08)
      .setDepth(1.35)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.diwataLabel = this.add
      .text(this.diwataPoint.x, this.diwataPoint.y - 94, "No input. No return.", {
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
      .sprite(0, -4, "methods_2_portal", 0)
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

    this.tweens.add({
      targets: [this.barrierGlow, this.barrierCore],
      alpha: "+=0.1",
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createPlayer() {
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "methods_2_player", 0)
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.9)
      .play("methods-2-player-idle");
  }

  createLabels() {
    this.statusText = this.add
      .text(this.candlePoint.x, this.candlePoint.y - 82, "LightFlame()", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#f3e6c4",
        backgroundColor: "#07141fdd",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.actionLabel = this.add
      .text(this.candlePoint.x, this.candlePoint.y - 48, "{ }", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffd68a",
        backgroundColor: "#07141fcc",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setAlpha(0.35);
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
      this.ritual,
      this.ritualRing,
      this.ritualInnerRing,
      this.ritualGroundGlow,
      this.unlitFlameAura,
      this.fireGlow,
      this.fireSprite,
      this.ambientShadow,
      this.barrier,
      this.barrierCore,
      this.barrierGlow,
      this.statusText,
      this.actionLabel,
    ]);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y).setAlpha(1).setTint(0xffffff);
    this.player.play("methods-2-player-idle", true);
    this.faceDiwataTowardKai();
    this.diwataLabel.setText("No input. No return.").setColor("#d9fff1");
    this.statusText.setText("LightFlame()").setColor("#f3e6c4").setAlpha(1);
    this.actionLabel.setText("{ }").setAlpha(0.35).setColor("#ffd68a");
    this.ritualRing.setStrokeStyle(1, RITUAL_TEAL, 0.22).setScale(1).setAlpha(0.24);
    this.ritualInnerRing.setStrokeStyle(1, RITUAL_GOLD, 0.18).setScale(1).setAlpha(0.2);
    this.ritualGroundGlow.setFillStyle(RITUAL_GOLD, 0.04).setScale(1).setAlpha(1);
    this.unlitFlameAura.setFillStyle(0x80d7ff, 0.1).setScale(1).setAlpha(0.16);
    this.fireGlow.setFillStyle(0xff8f3d, 0).setScale(1).setAlpha(1);
    this.fireSprite.stop().setAlpha(0).setScale(1.04).setTint(0xffffff);
    this.ambientShadow.setAlpha(0.3);
    this.barrier.setPosition(this.barrierBasePoint.x, this.barrierBasePoint.y).setAlpha(1).setScale(1);
    this.barrierCore.setAlpha(0.72).setScale(1.36).setTint(0xb8f4ff).play(PORTAL_ANIM_KEY, true);
    this.barrierGlow.setAlpha(0.12).setScale(1);
    this.sequenceMode = "idle";
    this.cameras.main.stopFollow();
    this.panTo(this.spawnPoint.x, 240);
  }

  startSuccess() {
    this.sequenceMode = "castingCandle";
    this.statusText.setText("method defined").setColor("#bfffe5");
    this.actionLabel.setText("{ action }").setAlpha(0.78).setColor("#ffe7aa");
    this.diwataLabel.setText("Good. The fixed flame has a name.").setColor("#bfffe5");
    this.player.setFlipX(false);
    this.player.play("methods-2-player-cast", true);
    this.createPlayerCastSparks();
    this.createEmptyParenthesesCue();
    this.schedule(560, () => {
      if (this.sequenceMode !== "castingCandle") return;
      this.lightRitualCandle();
    });
  }

  lightRitualCandle() {
    this.panTo(this.candlePoint.x, 460);
    this.statusText.setText("method called").setColor("#ffd68a");
    this.actionLabel.setText("{ burn }").setAlpha(0.9).setColor("#fff1b8");
    this.diwataLabel.setText("Main called it. Now the flame burns.").setColor("#ffffff");
    this.diwata.playAnimation("spellcast", "left");
    this.createPlayerToCandleStreak();

    this.schedule(300, () => this.igniteCandle());

    this.schedule(1120, () => {
      this.statusText.setText("ritual burning").setColor("#ffe7aa");
      this.diwataLabel.setText("A void method can simply perform an action.").setColor("#fff1b8");
      this.createCandleToBarrierStreak();
      this.panTo(this.barrierBasePoint.x, 720);
      this.tweens.add({
        targets: [this.barrierGlow, this.barrierCore],
        alpha: "+=0.2",
        scaleX: 1.46,
        scaleY: 1.46,
        duration: 420,
        ease: "Sine.easeOut",
      });
    });

    this.schedule(2060, () => this.openBarrier());
  }

  faceDiwataTowardKai() {
    if (!this.diwata) return;
    const direction = this.spawnPoint.x < this.diwataPoint.x ? "left" : "right";
    this.diwata.playIdle(direction);
  }

  createEmptyParenthesesCue() {
    const cue = this.add
      .text(this.statusText.x, this.statusText.y + 25, "(  )", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: "#bfffe5",
        backgroundColor: "#07141fde",
        padding: { x: 9, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(2.12)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    const glow = this.add
      .ellipse(this.statusText.x, this.statusText.y + 27, 64, 24, RITUAL_TEAL, 0.2)
      .setDepth(2.1)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.temporaryEffects.push(cue, glow);
    this.tweens.add({
      targets: [cue, glow],
      scaleX: 1.18,
      scaleY: 1.18,
      alpha: 0,
      duration: 900,
      ease: "Sine.easeOut",
      onComplete: () => {
        [cue, glow].forEach((effect) => {
          Phaser.Utils.Array.Remove(this.temporaryEffects, effect);
          effect.destroy();
        });
      },
    });
  }

  igniteCandle() {
    this.fireSprite.play(FIRE_ANIM_KEY, true);
    this.tweens.add({
      targets: this.unlitFlameAura,
      alpha: 0,
      scaleX: 0.82,
      scaleY: 0.82,
      duration: 260,
      ease: "Sine.easeIn",
    });
    this.tweens.add({
      targets: this.fireSprite,
      alpha: 1,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 320,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: this.fireGlow,
      alpha: 0.42,
      scaleX: 1.2,
      scaleY: 1.12,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.pulseRitual(RITUAL_GOLD);
    this.createFireSparks();
    this.brightenEnvironment();
  }

  brightenEnvironment() {
    this.tweens.add({
      targets: this.ambientShadow,
      alpha: 0.16,
      duration: 900,
      ease: "Sine.easeOut",
    });
    const warmth = this.add
      .ellipse(this.candlePoint.x, this.candlePoint.y - 20, 300, 150, 0xffb65c, 0.08)
      .setDepth(-1.2)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.temporaryEffects.push(warmth);
    this.tweens.add({
      targets: warmth,
      alpha: 0.14,
      scaleX: 1.35,
      scaleY: 1.18,
      duration: 850,
      ease: "Sine.easeOut",
    });
  }

  pulseRitual(color) {
    this.ritualGroundGlow.setFillStyle(color, 0.1);
    this.ritualRing.setStrokeStyle(2, color, 0.5);
    this.ritualInnerRing.setStrokeStyle(1, 0xffe7aa, 0.4);
    this.tweens.add({
      targets: [this.ritualRing, this.ritualInnerRing, this.ritualGroundGlow],
      scaleX: 1.16,
      scaleY: 1.35,
      alpha: 0.72,
      duration: 520,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
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

  createPlayerToCandleStreak() {
    const startX = this.player.x + 18;
    const startY = this.player.y - 82;
    const endX = this.candlePoint.x - 2;
    const endY = this.candlePoint.y - 20;
    const distance = Phaser.Math.Distance.Between(startX, startY, endX, endY);
    const angle = Phaser.Math.Angle.Between(startX, startY, endX, endY);
    const streak = this.add
      .rectangle(startX, startY, 2, 3, 0xffd47c, 0.9)
      .setOrigin(0, 0.5)
      .setRotation(angle)
      .setDepth(1.84)
      .setBlendMode(Phaser.BlendModes.ADD);
    const head = this.add
      .circle(startX, startY, 3, 0xfff2bf, 0.95)
      .setDepth(1.85)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.temporaryEffects.push(streak, head);

    this.tweens.add({
      targets: streak,
      width: distance,
      duration: 360,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: streak,
          alpha: 0,
          duration: 220,
          onComplete: () => {
            Phaser.Utils.Array.Remove(this.temporaryEffects, streak);
            streak.destroy();
          },
        });
      },
    });
    this.tweens.add({
      targets: head,
      x: endX,
      y: endY,
      scale: 1.35,
      duration: 410,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.tweens.add({
          targets: head,
          alpha: 0,
          scale: 2,
          duration: 220,
          onComplete: () => {
            Phaser.Utils.Array.Remove(this.temporaryEffects, head);
            head.destroy();
          },
        });
      },
    });
  }

  createFireSparks() {
    for (let index = 0; index < 18; index += 1) {
      const spark = this.add
        .circle(
          this.candlePoint.x + Phaser.Math.Between(-10, 10),
          this.candlePoint.y - Phaser.Math.Between(12, 28),
          Phaser.Math.FloatBetween(1.2, 2.3),
          index % 2 === 0 ? 0xffca72 : 0xff6b3a,
          0.82,
        )
        .setDepth(1.8)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: spark,
        y: spark.y - Phaser.Math.Between(28, 54),
        x: spark.x + Phaser.Math.Between(-18, 18),
        alpha: 0,
        scale: 0.35,
        duration: Phaser.Math.Between(620, 920),
        delay: index * 28,
        ease: "Sine.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  createCandleToBarrierStreak() {
    const startX = this.candlePoint.x + 18;
    const startY = this.candlePoint.y - 26;
    const endX = this.barrierBasePoint.x - 10;
    const endY = this.barrierBasePoint.y - 58;
    const wave = this.add
      .ellipse(startX, this.groundY - 42, 52, 32)
      .setStrokeStyle(2, RITUAL_GOLD, 0.42)
      .setDepth(1.72)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    const distance = Phaser.Math.Distance.Between(startX, startY, endX, endY);
    const angle = Phaser.Math.Angle.Between(startX, startY, endX, endY);
    const streak = this.add
      .rectangle(startX, startY, 2, 3, 0xffc46b, 0.9)
      .setOrigin(0, 0.5)
      .setRotation(angle)
      .setDepth(1.85)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.temporaryEffects.push(wave, streak);
    this.tweens.add({
      targets: wave,
      x: this.barrierBasePoint.x - 22,
      scaleX: 4.4,
      scaleY: 1.8,
      alpha: 0,
      duration: 760,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, wave);
        wave.destroy();
      },
    });
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
    this.statusText.setText("path opened").setColor("#dfffea");
    this.barrierLabel.setText("path opened");
    this.tweens.add({
      targets: [this.barrierGlow, this.barrierCore],
      alpha: 0.98,
      scaleX: 1.55,
      scaleY: 1.55,
      duration: 340,
      ease: "Sine.easeOut",
    });
    this.createBarrierBreakParticles();
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

  createBarrierBreakParticles() {
    for (let index = 0; index < 20; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const shard = this.add
        .rectangle(
          this.barrierBasePoint.x + side * Phaser.Math.Between(2, 11),
          this.barrierBasePoint.y - Phaser.Math.Between(18, 92),
          3,
          Phaser.Math.Between(5, 10),
          index % 2 === 0 ? 0xffd59b : 0xbff6ff,
          0.74,
        )
        .setDepth(1.86)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: shard,
        x: shard.x + side * Phaser.Math.Between(22, 56),
        y: shard.y - Phaser.Math.Between(8, 34),
        alpha: 0,
        angle: side * Phaser.Math.Between(45, 120),
        duration: 650,
        delay: index * 14,
        ease: "Sine.easeOut",
        onComplete: () => shard.destroy(),
      });
    }
  }

  startFailure(message = "") {
    this.sequenceMode = "failure";
    const feedback = this.getFailureFeedback(message);
    this.statusText.setText(feedback.status).setColor("#ffb8b8");
    this.diwataLabel.setText(feedback.guide).setColor("#ffcccc");
    this.actionLabel.setText(feedback.bodyCue).setAlpha(0.48).setColor("#ffb8b8");
    this.ritualRing.setStrokeStyle(2, FAIL_RED, 0.52);
    this.ritualInnerRing.setStrokeStyle(1, FAIL_RED, 0.34);
    this.player.play("methods-2-player-hurt", true);
    if (feedback.kind === "missingMethod") {
      this.pulseMissingMethodFailure();
    } else if (feedback.kind === "missingCall") {
      this.createMissingCallBarrierCue();
      this.pulseBarrierFailure();
    } else {
      this.createFailedFlameSpark();
      this.pulseRitualFailure();
    }
    this.schedule(520, () => {
      this.statusText.setText("flame still unlit").setColor("#ffcccc");
      this.panTo(this.candlePoint.x, 540);
    });
    this.schedule(1620, () => {
      this.resetAttempt();
      this.statusText.setText("try again").setColor("#f3e6c4");
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message: message || "Define LightFlame(), then call LightFlame(); inside Main.",
      });
    });
  }

  getFailureFeedback(message = "") {
    const normalized = String(message).toLowerCase();
    if (normalized.includes("define static void")) {
      return {
        kind: "missingMethod",
        status: "LightFlame() missing",
        guide: "Define the no-parameter void method before Main calls it.",
        bodyCue: "{ }",
      };
    }
    if (normalized.includes("call lightflame")) {
      return {
        kind: "missingCall",
        status: "method not called",
        guide: "The flame only lights when Main calls LightFlame();",
        bodyCue: "LightFlame();",
      };
    }
    return {
      kind: "generic",
      status: "ritual incomplete",
      guide: "Define LightFlame() with empty parentheses, then call it from Main.",
      bodyCue: "LightFlame()",
    };
  }

  pulseMissingMethodFailure() {
    const marker = this.add
      .text(this.candlePoint.x, this.candlePoint.y - 112, "no method definition", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffd0d0",
        backgroundColor: "#07141fde",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.08);
    this.temporaryEffects.push(marker);
    this.tweens.add({
      targets: [this.ritualRing, this.ritualInnerRing, this.ritualGroundGlow, this.unlitFlameAura],
      alpha: 0.1,
      scaleX: 0.92,
      scaleY: 0.92,
      duration: 120,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: marker,
      y: marker.y - 12,
      alpha: 0,
      duration: 900,
      delay: 280,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, marker);
        marker.destroy();
      },
    });
  }

  createMissingCallBarrierCue() {
    const label = this.add
      .text(this.barrierBasePoint.x, this.barrierBasePoint.y - 136, "LightFlame(); not called", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffd0d0",
        backgroundColor: "#07141fde",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.08);
    this.temporaryEffects.push(label);
    this.tweens.add({
      targets: label,
      y: label.y - 12,
      alpha: 0,
      duration: 900,
      delay: 280,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, label);
        label.destroy();
      },
    });
  }

  flickerCandleFailure() {
    this.createFailedFlameSpark();
    this.fireSprite.play(FIRE_ANIM_KEY, true).setAlpha(0.34).setScale(0.9).setTint(0xff8b8b);
    this.fireGlow.setFillStyle(FAIL_RED, 0.18).setAlpha(0.7);
    this.tweens.add({
      targets: [this.fireSprite, this.fireGlow],
      alpha: 0,
      duration: 130,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.fireSprite.stop().setAlpha(0).setTint(0xffffff);
        this.fireGlow.setFillStyle(0xff8f3d, 0).setAlpha(1);
      },
    });
    this.pulseRitualFailure();
  }

  createFailedFlameSpark(message = "LightFlame() not completed") {
    const label = this.add
      .text(this.candlePoint.x, this.candlePoint.y - 112, message, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffd0d0",
        backgroundColor: "#07141fde",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.08);
    const flash = this.add
      .ellipse(this.candlePoint.x, this.candlePoint.y - 14, 60, 72, FAIL_RED, 0.2)
      .setDepth(1.7)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.temporaryEffects.push(label, flash);
    for (let index = 0; index < 9; index += 1) {
      const ember = this.add
        .circle(
          this.candlePoint.x + Phaser.Math.Between(-8, 8),
          this.candlePoint.y - Phaser.Math.Between(8, 24),
          Phaser.Math.FloatBetween(1.2, 2.1),
          index % 2 === 0 ? FAIL_RED : 0xffb0b0,
          0.78,
        )
        .setDepth(1.82)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.temporaryEffects.push(ember);
      this.tweens.add({
        targets: ember,
        x: ember.x + Phaser.Math.Between(-18, 18),
        y: ember.y + Phaser.Math.Between(10, 26),
        alpha: 0,
        scale: 0.25,
        duration: Phaser.Math.Between(360, 620),
        delay: index * 24,
        ease: "Sine.easeIn",
        onComplete: () => {
          Phaser.Utils.Array.Remove(this.temporaryEffects, ember);
          ember.destroy();
        },
      });
    }
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.2,
      duration: 480,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, flash);
        flash.destroy();
      },
    });
    this.tweens.add({
      targets: label,
      y: label.y - 12,
      alpha: 0,
      duration: 900,
      delay: 260,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, label);
        label.destroy();
      },
    });
  }

  pulseBarrierFailure() {
    this.tweens.add({
      targets: this.barrier,
      x: this.barrierBasePoint.x - 9,
      duration: 80,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: [this.barrierGlow, this.barrierCore],
      alpha: 0.34,
      duration: 120,
      yoyo: true,
      repeat: 4,
      ease: "Sine.easeInOut",
    });
  }

  pulseRitualFailure() {
    this.tweens.add({
      targets: [this.ritualRing, this.ritualInnerRing, this.ritualGroundGlow],
      alpha: 0.2,
      duration: 110,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
    });
  }

  finishSuccess() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    this.cameras.main.stopFollow();
    this.player.play("methods-2-player-idle", true);
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: "LightFlame was defined and called. The warding flame opened the path.",
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
      this.statusText.setText("fixed ritual flame").setColor("#f3e6c4");
      this.panTo(this.candlePoint.x, 860);
    });
    this.schedule(1580, () => {
      if (this.sequenceMode !== "idle") return;
      this.statusText.setText("sealed path").setColor("#d9f3ff");
      this.panTo(this.barrierBasePoint.x, 860);
    });
    this.schedule(2900, () => {
      if (this.sequenceMode !== "idle") return;
      this.statusText.setText("LightFlame()").setColor("#f3e6c4");
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
