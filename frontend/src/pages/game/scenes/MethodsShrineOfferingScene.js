import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_DIALOGUE_CLOSED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";
import LayeredLpcCharacter from "../characters/LayeredLpcCharacter";
import { DIWATA_FAIRY_CONFIG } from "../characters/diwataFairyConfig";

const LEVEL_NUMBER = 20;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const MAP_KEY = "methods_level_7_shrine_offering";
const MAP_PATH = `${ASSET_BASE}/maps/methods-level-7-shrine-offering.tmj`;
const PLAYER_SCALE = 2;
const PLAYER_SPEED = 170;
const DIWATA_SCALE = 1.25;
const OFFERING_GOLD = 0xf3d47b;
const OFFERING_GREEN = 0x9af2c8;
const FAIL_RED = 0xff6677;
const PORTAL_ANIM_KEY = "methods-7-offering-barrier";

export default class MethodsShrineOfferingScene extends Phaser.Scene {
  constructor() {
    super("MethodsShrineOfferingScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("methods_7_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("methods_7_decor", `${GH_BASE}/Decor.png`);
    this.load.image("methods_7_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("methods_7_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("methods_7_house", `${GH_BASE}/House_Tiles.png`);
    this.load.image("methods_7_other", `${GH_BASE}/Other_Tiles2.png`);
    this.load.image("methods_7_other_flipped", `${GH_BASE}/Other_Tiles2(Flipped).png`);
    this.load.image("methods_7_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("methods_7_willow_big", `${GH_BASE}/Weeping_Willow1Big.png`);
    this.load.image("methods_7_willow", `${GH_BASE}/Weeping_Willow1.png`);
    this.load.image("methods_7_tree_1", `${GH_BASE}/Tree1.png`);
    this.load.image("methods_7_large_pine", `${GH_BASE}/Large_Pine_Tree.png`);
    this.load.image("methods_7_wheat", `${GH_BASE}/Pixel_Art_Wheat.png`);
    this.load.image("methods_7_signage_1", `${ASSET_BASE}/other/signage1.png`);
    this.load.image("methods_7_signage_2", `${ASSET_BASE}/other/signage2.png`);
    this.load.image("methods_7_unlit_candle", `${ASSET_BASE}/other/unlit_candle.png`);
    this.load.image("methods_7_unlit_candle_tileset", `${ASSET_BASE}/other/unlit_candle_tileset.png`);
    this.load.image("methods_7_water", `${GH_BASE}/Animated_Sprites/GandalfHardcore_Animated_Water_Tiles.png`);
    this.load.image("methods_7_shrine_offering", `${ASSET_BASE}/other/shrine_offering.png`);
    this.load.spritesheet(
      "methods_7_portal",
      `${GH_BASE}/Animated_Sprites/GandalfHardcore_Portal_sheet.png`,
      { frameWidth: 64, frameHeight: 64 },
    );
    this.load.spritesheet(
      "methods_7_player",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
    this.load.image("methods_7_bg5", `${BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("methods_7_bg4", `${BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("methods_7_bg3", `${BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("methods_7_bg2", `${BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("methods_7_bg1", `${BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
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
    this.spawnPoint = this.points.player_spawn ?? { x: 96, y: 500 };
    this.diwataPoint = this.points.diwata_spawn ?? { x: 455, y: this.spawnPoint.y };
    this.shrinePoint = this.points.offering_shrine ?? { x: 610, y: this.spawnPoint.y };
    this.offeringPoint = this.points.offering_spot ?? {
      x: this.shrinePoint.x + 48,
      y: this.shrinePoint.y - 14,
    };
    this.labelPoint = this.points.offering_label_point ?? {
      x: this.offeringPoint.x,
      y: this.offeringPoint.y - 98,
    };
    this.barrierPoint =
      this.points.exit_barrier ?? this.points.offering_barrier ?? { x: this.shrinePoint.x + 355, y: this.spawnPoint.y };
    this.exitPoint = this.points.level_exit ?? { x: this.barrierPoint.x + 120, y: this.spawnPoint.y };
    this.groundY = Math.max(this.spawnPoint.y, this.shrinePoint.y, this.exitPoint.y);

    this.createShrine();
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

    if (this.sequenceMode === "walkingToShrine") {
      const stopX = this.offeringPoint.x - 58;
      this.player.play("methods-7-player-run", true);
      this.player.setFlipX(false);
      this.player.x = Math.min(this.player.x + step, stopX);
      if (this.player.x >= stopX) {
        this.sequenceMode = "placingOffering";
        this.player.play("methods-7-player-cast", true);
        this.cameras.main.stopFollow();
        this.placeOffering();
      }
    }

    if (this.sequenceMode === "walkingToExit") {
      this.player.play("methods-7-player-run", true);
      this.player.setFlipX(false);
      this.player.x = Math.min(this.player.x + step, this.exitPoint.x);
      if (this.player.x >= this.exitPoint.x) this.finishSuccess();
    }
  }

  createBackgrounds(map) {
    [
      ["methods_7_bg5", 0.08, -8, 0.78, 0],
      ["methods_7_bg4", 0.14, -7, 0.7, 0],
      ["methods_7_bg3", 0.32, -6, 0.62, 88],
      ["methods_7_bg2", 0.58, -5, 0.58, 176],
      ["methods_7_bg1", 0.82, -4, 0.5, 225],
    ].forEach(([key, factor, depth, alpha, y]) => {
      this.add
        .tileSprite(0, y, map.widthInPixels, this.scale.height - y, key)
        .setOrigin(0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x20384c)
        .setAlpha(alpha);
    });
    this.add.rectangle(0, 0, map.widthInPixels, 576, 0x02040a, 0.28).setOrigin(0).setDepth(-3);
  }

  createTileLayers(map) {
    const tilesets = [
      map.addTilesetImage("Floor_Tiles2", "methods_7_floor"),
      map.addTilesetImage("Decor", "methods_7_decor"),
      map.addTilesetImage("Garden_Decorations", "methods_7_garden"),
      map.addTilesetImage("Pine_Trees", "methods_7_pines"),
      map.addTilesetImage("House_Tiles", "methods_7_house"),
      map.addTilesetImage("Other_Tiles2", "methods_7_other"),
      map.addTilesetImage("Other_Tiles2(Flipped)", "methods_7_other_flipped"),
      map.addTilesetImage("Pine_forest_sheet", "methods_7_forest"),
      map.addTilesetImage("Weeping_Willow1Big", "methods_7_willow_big"),
      map.addTilesetImage("Weeping_Willow1", "methods_7_willow"),
      map.addTilesetImage("Tree1", "methods_7_tree_1"),
      map.addTilesetImage("Large_Pine_Tree", "methods_7_large_pine"),
      map.addTilesetImage("Pixel_Art_Wheat", "methods_7_wheat"),
      map.addTilesetImage("signage1", "methods_7_signage_1"),
      map.addTilesetImage("signage2", "methods_7_signage_2"),
      map.addTilesetImage("unlit_candle", "methods_7_unlit_candle"),
      map.addTilesetImage("unlit_candle_tileset", "methods_7_unlit_candle_tileset"),
      map.addTilesetImage("GandalfHardcore_Animated_Water_Tiles", "methods_7_water"),
      map.addTilesetImage("shrine_offering", "methods_7_shrine_offering"),
    ].filter(Boolean);

    ["water", "platform", "trees", "decoration", "front_decoration"].forEach((name, index) => {
      const layer = map.createLayer(name, tilesets, 0, this.offsetY);
      if (layer) layer.setDepth(0.05 + index * 0.25);
    });
  }

  createAnimations() {
    [
      ["methods-7-player-idle", 0, 5, 6],
      ["methods-7-player-run", 16, 23, 12],
      ["methods-7-player-hurt", 48, 55, 10],
      ["methods-7-player-cast", 64, 71, 10],
    ].forEach(([key, start, end, frameRate]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("methods_7_player", { start, end }),
        frameRate,
        repeat: key.includes("hurt") || key.includes("cast") ? 0 : -1,
      });
    });

    if (!this.anims.exists(PORTAL_ANIM_KEY)) {
      this.anims.create({
        key: PORTAL_ANIM_KEY,
        frames: this.anims.generateFrameNumbers("methods_7_portal", { start: 0, end: 9 }),
        frameRate: 9,
        repeat: -1,
      });
    }
  }

  createShrine() {
    this.shrine = this.add.container(this.shrinePoint.x, this.shrinePoint.y).setDepth(1.25);
    this.shrineGlow = this.add
      .ellipse(0, -34, 118, 76, OFFERING_GREEN, 0.08)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.emptyOfferingGlow = this.add
      .ellipse(this.offeringPoint.x, this.offeringPoint.y - 20, 54, 18, OFFERING_GOLD, 0.16)
      .setDepth(1.62)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.offeringRice = this.add.container(this.offeringPoint.x, this.offeringPoint.y - 18).setDepth(1.72).setAlpha(0);
    const riceBowl = this.add.ellipse(0, 12, 40, 16, 0x7a5234, 1).setStrokeStyle(2, 0xe8b46a, 0.9);
    const rice = this.add.ellipse(0, 5, 32, 16, 0xf5ead1, 1).setStrokeStyle(1, 0xfff7d0, 0.85);
    const riceDot1 = this.add.circle(-8, 3, 2, 0xffffff, 0.95);
    const riceDot2 = this.add.circle(4, 0, 2, 0xffffff, 0.95);
    const riceDot3 = this.add.circle(11, 5, 1.6, 0xffffff, 0.95);
    this.offeringRice.add([riceBowl, rice, riceDot1, riceDot2, riceDot3]);
    this.shrine.add([this.shrineGlow]);
    this.startShrineIdleTweens();
  }

  startShrineIdleTweens() {
    this.tweens.add({
      targets: this.shrineGlow,
      alpha: 0.16,
      scaleX: 1.08,
      scaleY: 1.1,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.emptyOfferingGlow,
      alpha: 0.34,
      scaleX: 1.18,
      duration: 1180,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createDiwata() {
    this.diwataHalo = this.add
      .ellipse(this.diwataPoint.x, this.diwataPoint.y - 35, 62, 86, 0x9fffe9, 0.12)
      .setDepth(1.3)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.diwata = new LayeredLpcCharacter(this, this.diwataPoint.x, this.diwataPoint.y, DIWATA_FAIRY_CONFIG, {
      scale: DIWATA_SCALE,
      depth: 1.86,
      direction: "left",
      animationName: "idle",
    });
    this.diwataLabel = this.add
      .text(this.diwataPoint.x + 24, this.diwataPoint.y - 92, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d9fff1",
        backgroundColor: "#07141fde",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.05);
  }

  createBarrier() {
    this.barrier = this.add.container(this.barrierPoint.x, this.groundY).setDepth(1.5);
    this.barrierGlow = this.add
      .ellipse(0, -40, 76, 130, 0x74e5ff, 0.1)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.barrierCore = this.add
      .sprite(0, -4, "methods_7_portal", 0)
      .setOrigin(0.5, 1)
      .setScale(1.32)
      .setTint(0xb8f4ff)
      .setAlpha(0.72)
      .play(PORTAL_ANIM_KEY);
    this.barrierLabel = this.add
      .text(0, -112, "", {
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
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "methods_7_player", 0)
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.9)
      .play("methods-7-player-idle");
  }

  createLabels() {
    this.parameterText = this.add
      .text(this.offeringPoint.x, this.offeringPoint.y - 76, "PlaceOffering(?)", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#f3e6c4",
        backgroundColor: "#07141fde",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(2.1);
    this.statusText = this.add
      .text(this.shrinePoint.x, this.shrinePoint.y - 86, "empty", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d9f3ff",
        backgroundColor: "#07141fbd",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.05);
  }

  onCodeEvaluated({ levelNumber, isCorrect, message, sourceCode }) {
    if (Number(levelNumber) !== LEVEL_NUMBER) return;
    this.lastSourceCode = sourceCode ?? "";
    this.resetAttempt();
    if (isCorrect) this.startSuccess();
    else this.startFailure(message);
  }

  onDialogueClosed({ levelNumber }) {
    if (Number(levelNumber) !== LEVEL_NUMBER) return;
    this.playOpeningPreview();
  }

  startSuccess() {
    this.playSfx?.("itemCollect");
    this.sequenceMode = "walkingToShrine";
    this.parameterText.setText('PlaceOffering("rice")').setColor("#ffe8a8");
    this.tweens.add({
      targets: this.statusText,
      alpha: 0,
      duration: 260,
      ease: "Sine.easeOut",
    });
    this.cameras.main.startFollow(this.player, false, 0.08, 0.08);
  }

  startFailure(message) {
    this.playSfx?.("errorMagic", { volume: 0.22 });
    const argument = this.extractOfferingArgument(this.lastSourceCode) ?? "?";
    this.parameterText.setText(`PlaceOffering(${argument})`).setColor("#ffb8c0");
    this.statusText.setText(message || "rejected").setColor("#ffb8c0");
    this.diwataLabel.setText("").setColor("#ffd0d6");
    this.panTo(this.shrinePoint.x, 460);
    this.showRejectedArgument(argument);
    this.tweens.add({
      targets: [this.shrineGlow, this.emptyOfferingGlow, this.parameterText],
      alpha: 1,
      duration: 110,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
      onStart: () => this.shrineGlow.setFillStyle(FAIL_RED, 0.28),
      onComplete: () => {
        this.shrineGlow.setFillStyle(OFFERING_GREEN, 0.08);
        this.schedule(560, () => {
          if (this.sequenceMode !== "idle") return;
          this.statusText.setText("empty").setColor("#d9f3ff").setAlpha(1);
          this.parameterText.setText("PlaceOffering(?)").setColor("#f3e6c4");
        });
      },
    });
  }

  placeOffering() {
    this.panTo(this.shrinePoint.x, 540);
    this.parameterText.setText('"rice"').setColor("#fff2b2");
    this.statusText.setText("").setColor("#fff2b2");
    this.diwataLabel.setText("").setColor("#d9fff1");
    this.emptyOfferingGlow.setAlpha(0.42);
    this.sendArgumentToShrine();
  }

  sendArgumentToShrine() {
    const valueText = this.add
      .text(this.player.x + 22, this.player.y - 78, '"rice"', {
        fontFamily: "monospace",
        fontSize: "14px",
        fontStyle: "bold",
        color: "#fff2b2",
        stroke: "#4c3211",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(2.2);
    this.temporaryEffects.push(valueText);
    const startX = valueText.x;
    const startY = valueText.y;
    const endX = this.offeringPoint.x;
    const endY = this.offeringPoint.y - 54;
    const arcPeakY = Math.min(startY, endY) - 44;
    this.tweens.add({
      targets: { progress: 0 },
      progress: 1,
      duration: 680,
      ease: "Sine.easeInOut",
      onUpdate: (tween) => {
        const progress = tween.targets[0].progress;
        valueText.x = Phaser.Math.Linear(startX, endX, progress);
        valueText.y = Phaser.Math.Interpolation.Bezier([startY, arcPeakY, endY], progress);
        valueText.setScale(1 + Math.sin(progress * Math.PI) * 0.12);
      },
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, valueText);
        valueText.destroy();
        this.showAcceptedOffering();
      },
    });
  }

  showAcceptedOffering() {
    this.statusText.setText("accepted").setColor("#d8ffe7");
    this.pulseShrineAccepted();
    this.offeringRice.setAlpha(1).setScale(0.35);
    this.tweens.add({
      targets: this.offeringRice,
      y: this.offeringPoint.y - 22,
      scale: 1,
      duration: 520,
      ease: "Back.easeOut",
      onComplete: () => this.releaseBarrier(),
    });
    this.createOfferingSparkles();
  }

  pulseShrineAccepted() {
    this.tweens.add({
      targets: [this.shrineGlow, this.emptyOfferingGlow],
      alpha: 0.78,
      scaleX: 1.34,
      scaleY: 1.22,
      duration: 240,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
      onStart: () => {
        this.shrineGlow.setFillStyle(OFFERING_GREEN, 0.32);
        this.emptyOfferingGlow.setFillStyle(OFFERING_GOLD, 0.46);
      },
      onComplete: () => {
        this.shrineGlow.setFillStyle(OFFERING_GREEN, 0.12).setScale(1);
        this.emptyOfferingGlow.setFillStyle(OFFERING_GOLD, 0.18).setScale(1);
      },
    });
  }

  showRejectedArgument(argument) {
    const rejectedText = this.add
      .text(this.offeringPoint.x, this.offeringPoint.y - 56, argument, {
        fontFamily: "monospace",
        fontSize: "14px",
        fontStyle: "bold",
        color: "#ffc2ca",
        stroke: "#4f0b18",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(2.2);
    const crossLineA = this.add.rectangle(this.offeringPoint.x, this.offeringPoint.y - 56, 58, 3, FAIL_RED, 0.86).setDepth(2.21);
    const crossLineB = this.add.rectangle(this.offeringPoint.x, this.offeringPoint.y - 56, 58, 3, FAIL_RED, 0.86).setDepth(2.21);
    crossLineA.setRotation(0.58);
    crossLineB.setRotation(-0.58);
    this.temporaryEffects.push(rejectedText, crossLineA, crossLineB);
    this.tweens.add({
      targets: [rejectedText, crossLineA, crossLineB],
      y: "-=18",
      alpha: 0,
      duration: 760,
      ease: "Sine.easeOut",
      onComplete: () => {
        [rejectedText, crossLineA, crossLineB].forEach((effect) => {
          Phaser.Utils.Array.Remove(this.temporaryEffects, effect);
          effect.destroy();
        });
      },
    });
  }

  releaseBarrier() {
    this.playSfx?.("magicActivate");
    this.barrierLabel.setText("").setColor("#d8ffe7");
    this.tweens.add({
      targets: this.barrier,
      alpha: 0,
      x: this.barrier.x + 12,
      duration: 700,
      ease: "Sine.easeInOut",
      onComplete: () => this.barrier.setVisible(false),
    });
    this.schedule(760, () => {
      this.sequenceMode = "walkingToExit";
      this.cameras.main.startFollow(this.player, false, 0.08, 0.08);
    });
  }

  createOfferingSparkles() {
    for (let index = 0; index < 14; index += 1) {
      const sparkle = this.add
        .circle(this.offeringPoint.x, this.offeringPoint.y - 28, Phaser.Math.Between(2, 4), 0xfff3af, 0.9)
        .setDepth(2.02)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.temporaryEffects.push(sparkle);
      this.tweens.add({
        targets: sparkle,
        x: sparkle.x + Phaser.Math.Between(-54, 54),
        y: sparkle.y + Phaser.Math.Between(-58, -10),
        alpha: 0,
        scale: 0.35,
        duration: Phaser.Math.Between(520, 920),
        ease: "Sine.easeOut",
        onComplete: () => {
          Phaser.Utils.Array.Remove(this.temporaryEffects, sparkle);
          sparkle.destroy();
        },
      });
    }
  }

  playOpeningPreview() {
    this.schedule(280, () => {
      if (this.sequenceMode !== "idle") return;
      this.panTo(this.shrinePoint.x, 760);
      this.tweens.add({
        targets: [this.shrineGlow, this.parameterText],
        alpha: "+=0.16",
        duration: 420,
        yoyo: true,
        ease: "Sine.easeInOut",
      });
    });
    this.schedule(1340, () => {
      if (this.sequenceMode !== "idle") return;
      this.panTo(this.barrierPoint.x, 720);
    });
    this.schedule(2320, () => {
      if (this.sequenceMode !== "idle") return;
      this.panTo(this.spawnPoint.x, 760);
      this.statusText.setText("empty");
    });
  }

  resetAttempt() {
    this.sequenceTimers.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.temporaryEffects.forEach((effect) => effect.destroy());
    this.temporaryEffects = [];
    this.tweens.killTweensOf([
      this.player,
      this.shrineGlow,
      this.emptyOfferingGlow,
      this.parameterText,
      this.statusText,
      this.offeringRice,
      this.barrier,
    ]);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y).setAlpha(1).setTint(0xffffff);
    this.player.play("methods-7-player-idle", true);
    this.offeringRice.setAlpha(0).setScale(1).setPosition(this.offeringPoint.x, this.offeringPoint.y - 18);
    this.shrineGlow.setFillStyle(OFFERING_GREEN, 0.08).setAlpha(0.08);
    this.emptyOfferingGlow.setFillStyle(OFFERING_GOLD, 0.16).setAlpha(0.16).setScale(1);
    this.startShrineIdleTweens();
    this.barrier.setVisible(true).setAlpha(1).setPosition(this.barrierPoint.x, this.groundY);
    this.barrierLabel.setText("").setColor("#d9f3ff");
    this.parameterText.setText("PlaceOffering(?)").setColor("#f3e6c4").setAlpha(1);
    this.statusText.setText("empty").setColor("#d9f3ff").setAlpha(1);
    this.diwataLabel.setText("").setColor("#d9fff1");
    this.sequenceMode = "idle";
    this.cameras.main.stopFollow();
    this.panTo(this.spawnPoint.x, 240);
  }

  finishSuccess() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    this.cameras.main.stopFollow();
    this.player.play("methods-7-player-idle", true);
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: 'PlaceOffering received "rice", the altar accepted it, and the path opened.',
      shouldProceed: true,
    });
  }

  extractOfferingArgument(sourceCode) {
    const match = (sourceCode ?? "").match(/\bPlaceOffering\s*\(\s*([^)]*?)\s*\)\s*;/);
    return match?.[1]?.trim();
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
