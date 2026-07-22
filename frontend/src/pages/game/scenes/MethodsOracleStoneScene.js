import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_DIALOGUE_CLOSED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";
import LayeredLpcCharacter from "../characters/LayeredLpcCharacter";
import { DIWATA_FAIRY_CONFIG } from "../characters/diwataFairyConfig";

const LEVEL_NUMBER = 18;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const MAP_KEY = "methods_level_5_oracle_stone";
const MAP_PATH = `${ASSET_BASE}/maps/methods-level-5-oracle-stone.tmj`;
const CRYSTAL_PATH = `${ASSET_BASE}/other/stone_crystal/free_glowing_crystal_frakassets/crystal_5_64x64_12f_20d.png`;
const PLAYER_SCALE = 2;
const PLAYER_SPEED = 170;
const DIWATA_SCALE = 1.25;
const STOP_BEFORE_ORACLE = 70;
const CRYSTAL_SCALE = 1.28;
const ORACLE_BLUE = 0x69e9ff;
const ORACLE_GOLD = 0xf4d37b;
const FAIL_RED = 0xff6677;
const PORTAL_ANIM_KEY = "methods-5-barrier-portal";
const CRYSTAL_ANIM_KEY = "methods-5-oracle-crystal";

export default class MethodsOracleStoneScene extends Phaser.Scene {
  constructor() {
    super("MethodsOracleStoneScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("methods_5_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("methods_5_decor", `${GH_BASE}/Decor.png`);
    this.load.image("methods_5_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("methods_5_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("methods_5_house", `${GH_BASE}/House_Tiles.png`);
    this.load.image("methods_5_other", `${GH_BASE}/Other_Tiles2.png`);
    this.load.image("methods_5_other_flipped", `${GH_BASE}/Other_Tiles2(Flipped).png`);
    this.load.image("methods_5_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("methods_5_willow_big", `${GH_BASE}/Weeping_Willow1Big.png`);
    this.load.image("methods_5_willow", `${GH_BASE}/Weeping_Willow1.png`);
    this.load.image("methods_5_tree_1", `${GH_BASE}/Tree1.png`);
    this.load.image("methods_5_large_pine", `${GH_BASE}/Large_Pine_Tree.png`);
    this.load.image("methods_5_wheat", `${GH_BASE}/Pixel_Art_Wheat.png`);
    this.load.image("methods_5_signage_1", `${ASSET_BASE}/other/signage1.png`);
    this.load.image("methods_5_signage_2", `${ASSET_BASE}/other/signage2.png`);
    this.load.image("methods_5_unlit_candle", `${ASSET_BASE}/other/unlit_candle.png`);
    this.load.image("methods_5_unlit_candle_tileset", `${ASSET_BASE}/other/unlit_candle_tileset.png`);
    this.load.spritesheet("methods_5_crystal", CRYSTAL_PATH, {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet(
      "methods_5_portal",
      `${GH_BASE}/Animated_Sprites/GandalfHardcore_Portal_sheet.png`,
      { frameWidth: 64, frameHeight: 64 },
    );
    this.load.spritesheet(
      "methods_5_player",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
    this.load.image("methods_5_bg5", `${BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("methods_5_bg4", `${BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("methods_5_bg3", `${BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("methods_5_bg2", `${BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("methods_5_bg1", `${BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
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
    this.diwataPoint = this.points.diwata_spawn ?? { x: 516, y: 435 };
    this.oraclePoint = this.points.oracle_stone ?? { x: 688, y: 446 };
    this.valuePoint = this.points.return_value_point ?? {
      x: this.oraclePoint.x,
      y: this.oraclePoint.y - 110,
    };
    this.barrierPoint = this.points.exit_barrier ?? { x: 1050, y: this.spawnPoint.y };
    this.exitPoint = this.points.level_exit ?? { x: map.widthInPixels - 64, y: this.spawnPoint.y };
    this.groundY = Math.max(this.spawnPoint.y, this.oraclePoint.y, this.barrierPoint.y);

    this.createOracleStone();
    this.createDiwata();
    this.createBarrier();
    this.createPlayer();
    this.createCodeReceptacle();
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

    if (this.sequenceMode === "walkingToOracle") {
      this.player.play("methods-5-player-run", true);
      this.player.setFlipX(false);
      this.player.x = Math.min(this.player.x + step, this.oraclePoint.x - STOP_BEFORE_ORACLE);
      if (this.player.x >= this.oraclePoint.x - STOP_BEFORE_ORACLE) {
        this.sequenceMode = "readingOracle";
        this.player.play("methods-5-player-cast", true);
        this.cameras.main.stopFollow();
        this.revealReturnedCode();
      }
    }

    if (this.sequenceMode === "walkingToExit") {
      this.player.play("methods-5-player-run", true);
      this.player.setFlipX(false);
      this.player.x = Math.min(this.player.x + step, this.exitPoint.x);
      if (this.player.x >= this.exitPoint.x) this.finishSuccess();
    }
  }

  createBackgrounds(map) {
    [
      ["methods_5_bg5", 0.08, -8, 0.78, 0],
      ["methods_5_bg4", 0.14, -7, 0.7, 0],
      ["methods_5_bg3", 0.32, -6, 0.62, 88],
      ["methods_5_bg2", 0.58, -5, 0.58, 176],
      ["methods_5_bg1", 0.82, -4, 0.5, 225],
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
      .rectangle(0, 0, map.widthInPixels, 576, 0x020610, 0.3)
      .setOrigin(0)
      .setDepth(-3);
  }

  createTileLayers(map) {
    const tilesets = [
      map.addTilesetImage("Floor_Tiles2", "methods_5_floor"),
      map.addTilesetImage("Decor", "methods_5_decor"),
      map.addTilesetImage("Garden_Decorations", "methods_5_garden"),
      map.addTilesetImage("Pine_Trees", "methods_5_pines"),
      map.addTilesetImage("House_Tiles", "methods_5_house"),
      map.addTilesetImage("Other_Tiles2", "methods_5_other"),
      map.addTilesetImage("Other_Tiles2(Flipped)", "methods_5_other_flipped"),
      map.addTilesetImage("Pine_forest_sheet", "methods_5_forest"),
      map.addTilesetImage("Weeping_Willow1Big", "methods_5_willow_big"),
      map.addTilesetImage("Weeping_Willow1", "methods_5_willow"),
      map.addTilesetImage("Tree1", "methods_5_tree_1"),
      map.addTilesetImage("Large_Pine_Tree", "methods_5_large_pine"),
      map.addTilesetImage("Pixel_Art_Wheat", "methods_5_wheat"),
      map.addTilesetImage("signage1", "methods_5_signage_1"),
      map.addTilesetImage("signage2", "methods_5_signage_2"),
      map.addTilesetImage("unlit_candle", "methods_5_unlit_candle"),
      map.addTilesetImage("unlit_candle_tileset", "methods_5_unlit_candle_tileset"),
    ].filter(Boolean);

    ["platform", "trees", "decoration", "front_decoration"].forEach((name, index) => {
      const layer = map.createLayer(name, tilesets, 0, this.offsetY);
      if (layer) layer.setDepth(0.1 + index * 0.25);
    });
  }

  createAnimations() {
    [
      ["methods-5-player-idle", 0, 5, 6],
      ["methods-5-player-run", 16, 23, 12],
      ["methods-5-player-hurt", 48, 55, 10],
      ["methods-5-player-cast", 64, 71, 10],
    ].forEach(([key, start, end, frameRate]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("methods_5_player", { start, end }),
        frameRate,
        repeat: key.includes("hurt") || key.includes("cast") ? 0 : -1,
      });
    });
    if (!this.anims.exists(CRYSTAL_ANIM_KEY)) {
      this.anims.create({
        key: CRYSTAL_ANIM_KEY,
        frames: this.anims.generateFrameNumbers("methods_5_crystal", { start: 0, end: 11 }),
        frameRate: 12,
        repeat: -1,
      });
    }
    if (!this.anims.exists(PORTAL_ANIM_KEY)) {
      this.anims.create({
        key: PORTAL_ANIM_KEY,
        frames: this.anims.generateFrameNumbers("methods_5_portal", { start: 0, end: 9 }),
        frameRate: 9,
        repeat: -1,
      });
    }
  }

  createOracleStone() {
    this.oracle = this.add.container(this.oraclePoint.x, this.oraclePoint.y).setDepth(1.45);
    this.oracleShadow = this.add.ellipse(0, -4, 92, 22, 0x010309, 0.5);
    this.oracleGlow = this.add
      .ellipse(0, -40, 108, 104, ORACLE_BLUE, 0.1)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.crystal = this.add
      .sprite(0, -8, "methods_5_crystal", 0)
      .setOrigin(0.5, 1)
      .setScale(CRYSTAL_SCALE)
      .setTint(0xc8fbff)
      .play(CRYSTAL_ANIM_KEY);
    this.oracle.add([this.oracleShadow, this.oracleGlow, this.crystal]);
    this.tweens.add({
      targets: [this.oracleGlow, this.crystal],
      alpha: "+=0.12",
      scaleX: "+=0.05",
      scaleY: "+=0.05",
      duration: 1180,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.oracleMotes = [];
    const motePositions = [
      [-54, -112],
      [-36, -132],
      [-12, -142],
      [12, -142],
      [36, -132],
      [54, -112],
      [0, -101],
    ];
    motePositions.forEach(([x, y], index) => {
      const mote = this.add
        .circle(x, y, 4.8, ORACLE_GOLD, 0.82)
        .setStrokeStyle(1, 0xfff5c8, 0.82)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.oracle.add(mote);
      this.oracleMotes.push(mote);
      this.tweens.add({
        targets: mote,
        alpha: 0.36,
        scale: 0.72,
        duration: 780 + index * 70,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
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
      .text(this.diwataPoint.x + 16, this.diwataPoint.y - 92, "Count them.", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d9fff1",
        backgroundColor: "#07141fde",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.05);
    this.tweens.add({
      targets: this.diwataHalo,
      alpha: 0.2,
      scaleX: 1.12,
      scaleY: 1.08,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createBarrier() {
    this.barrier = this.add.container(this.barrierPoint.x, this.groundY).setDepth(1.5);
    this.barrierGlow = this.add
      .ellipse(0, -40, 76, 130, 0x74e5ff, 0.1)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.barrierCore = this.add
      .sprite(0, -4, "methods_5_portal", 0)
      .setOrigin(0.5, 1)
      .setScale(1.32)
      .setTint(0xb8f4ff)
      .setAlpha(0.72)
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
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "methods_5_player", 0)
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.9)
      .play("methods-5-player-idle");
  }

  createCodeReceptacle() {
    this.codeReceptacle = this.add.container(this.spawnPoint.x + 78, this.spawnPoint.y - 76).setDepth(2.04);
    this.codeSlot = this.add
      .rectangle(0, 0, 46, 28, 0x07141f, 0.52)
      .setStrokeStyle(1, ORACLE_BLUE, 0.28);
    this.codeSlotGlow = this.add
      .ellipse(0, 0, 54, 34, ORACLE_BLUE, 0.08)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.codeSlotLabel = this.add
      .text(0, 0, "code", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#a9d7e6",
      })
      .setOrigin(0.5);
    this.codeReceptacle.add([this.codeSlotGlow, this.codeSlot, this.codeSlotLabel]);
    this.codeReceptacle.setAlpha(0.64);
  }

  createLabels() {
    this.statusText = this.add
      .text(this.oraclePoint.x, this.oraclePoint.y - 176, "waiting", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#f3e6c4",
        backgroundColor: "#07141fde",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(2.1);
    this.valueText = this.add
      .text(this.valuePoint.x, this.valuePoint.y, "?", {
        fontFamily: "monospace",
        fontSize: "34px",
        fontStyle: "bold",
        color: "#bffaff",
        stroke: "#062636",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(2.08)
      .setAlpha(0.42);
    this.valueLabel = this.add
      .text(this.valuePoint.x, this.valuePoint.y + 34, "oracle answer", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#a9d7e6",
        backgroundColor: "#07141fbd",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.07);
  }

  onCodeEvaluated({ levelNumber, isCorrect, message, sourceCode }) {
    if (Number(levelNumber) !== LEVEL_NUMBER) return;
    this.lastSourceCode = sourceCode ?? "";
    this.resetAttempt();
    if (isCorrect) this.startSuccess();
    else this.startFailure(message);
  }

  onDialogueClosed({ levelNumber }) {
    if (Number(levelNumber) !== LEVEL_NUMBER || this.openingPreviewPlayed) return;
    this.playOpeningPreview();
  }

  startSuccess() {
    this.sequenceMode = "walkingToOracle";
    this.statusText.setText("reading...").setColor("#bfffe5");
    this.diwataLabel.setText("The answer returns.").setColor("#bfffe5");
    this.weakenBarrier();
    this.panTo(this.oraclePoint.x, 720);
  }

  revealReturnedCode() {
    this.flashPlayerToOracle();
    this.schedule(260, () => this.lightOracleMotes());
    this.schedule(1260, () => {
      this.valueText.setText("7").setAlpha(1).setScale(0.35);
      this.tweens.add({
        targets: this.valueText,
        scale: 1,
        duration: 380,
        ease: "Back.easeOut",
      });
      this.statusText.setText("answer found").setColor("#fff2b5");
      this.createReturnBeam();
      this.createTravelingValue();
    });
    this.schedule(1980, () => this.openBarrier());
    this.schedule(2920, () => {
      this.sequenceMode = "walkingToExit";
      this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    });
  }

  lightOracleMotes() {
    this.oracleMotes.forEach((mote, index) => {
      this.tweens.add({
        targets: mote,
        scale: 1.75,
        alpha: 1,
        duration: 180,
        delay: index * 95,
        yoyo: true,
        ease: "Sine.easeInOut",
      });
    });
  }

  flashPlayerToOracle() {
    const startX = this.player.x + 18;
    const startY = this.player.y - 80;
    const endX = this.oraclePoint.x;
    const endY = this.oraclePoint.y - 74;
    const distance = Phaser.Math.Distance.Between(startX, startY, endX, endY);
    const angle = Phaser.Math.Angle.Between(startX, startY, endX, endY);
    const streak = this.add
      .rectangle(startX, startY, 2, 3, ORACLE_BLUE, 0.88)
      .setOrigin(0, 0.5)
      .setRotation(angle)
      .setDepth(2.02)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.temporaryEffects.push(streak);
    this.tweens.add({
      targets: streak,
      width: distance,
      duration: 360,
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

  createReturnBeam() {
    const beam = this.add
      .rectangle(this.oraclePoint.x, this.oraclePoint.y - 78, 5, 5, ORACLE_GOLD, 0.9)
      .setDepth(2)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.temporaryEffects.push(beam);
    this.tweens.add({
      targets: beam,
      y: this.valuePoint.y,
      scaleX: 1.5,
      scaleY: 8,
      alpha: 0,
      duration: 520,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, beam);
        beam.destroy();
      },
    });
    this.tweens.add({
      targets: [this.oracleGlow, this.crystal],
      scaleX: 1.18,
      scaleY: 1.18,
      alpha: 1,
      duration: 260,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
  }

  createTravelingValue() {
    const answer = this.add
      .text(this.valuePoint.x, this.valuePoint.y - 4, "7", {
        fontFamily: "monospace",
        fontSize: "26px",
        fontStyle: "bold",
        color: "#fff2b5",
        stroke: "#2b1c03",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(2.16);
    const trail = this.add
      .circle(answer.x, answer.y, 12, ORACLE_GOLD, 0.18)
      .setDepth(2.14)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.temporaryEffects.push(answer, trail);
    const targetX = this.codeReceptacle.x;
    const targetY = this.codeReceptacle.y;
    this.tweens.add({
      targets: answer,
      x: targetX,
      y: targetY,
      scale: 0.72,
      duration: 760,
      ease: "Sine.easeInOut",
      onUpdate: () => trail.setPosition(answer.x, answer.y),
      onComplete: () => {
        this.codeSlot.setStrokeStyle(2, ORACLE_GOLD, 0.78);
        this.codeSlotGlow.setFillStyle(ORACLE_GOLD, 0.18);
        this.codeSlotLabel.setText("code = 7").setColor("#fff2b5");
        this.tweens.add({
          targets: this.codeReceptacle,
          alpha: 1,
          scaleX: 1.08,
          scaleY: 1.08,
          duration: 180,
          yoyo: true,
          ease: "Sine.easeInOut",
        });
        this.tweens.add({
          targets: [answer, trail],
          alpha: 0,
          scale: 1.8,
          duration: 260,
          ease: "Sine.easeOut",
          onComplete: () => {
            Phaser.Utils.Array.Remove(this.temporaryEffects, answer);
            Phaser.Utils.Array.Remove(this.temporaryEffects, trail);
            answer.destroy();
            trail.destroy();
          },
        });
      },
    });
  }

  weakenBarrier() {
    this.tweens.add({
      targets: [this.barrierGlow, this.barrierCore],
      alpha: 0.42,
      duration: 520,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.barrier,
      scaleX: 0.94,
      duration: 520,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
  }

  openBarrier() {
    this.panTo(this.barrierPoint.x, 700);
    this.schedule(250, () => {
      this.statusText.setText("code stored").setColor("#bfffe5");
      this.tweens.add({
        targets: [this.barrierGlow, this.barrierCore, this.barrierLabel],
        alpha: 0,
        scaleX: 0.62,
        scaleY: 1.22,
        duration: 760,
        ease: "Sine.easeInOut",
      });
      this.createBarrierParticles();
    });
  }

  createBarrierParticles() {
    for (let index = 0; index < 18; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const spark = this.add
        .circle(
          this.barrierPoint.x + side * Phaser.Math.Between(4, 18),
          this.groundY - Phaser.Math.Between(18, 112),
          Phaser.Math.FloatBetween(1.3, 2.5),
          index % 2 === 0 ? ORACLE_BLUE : ORACLE_GOLD,
          0.82,
        )
        .setDepth(2)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.temporaryEffects.push(spark);
      this.tweens.add({
        targets: spark,
        x: spark.x + side * Phaser.Math.Between(22, 54),
        y: spark.y - Phaser.Math.Between(8, 34),
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(520, 850),
        delay: index * 18,
        ease: "Sine.easeOut",
        onComplete: () => {
          Phaser.Utils.Array.Remove(this.temporaryEffects, spark);
          spark.destroy();
        },
      });
    }
  }

  startFailure(message = "") {
    this.sequenceMode = "failure";
    const feedback = this.getFailureFeedback(message);
    this.statusText.setText(feedback.status).setColor("#ffb8b8");
    this.diwataLabel.setText(feedback.guide).setColor("#ffcccc");
    this.valueText.setText("?").setAlpha(0.55).setColor("#ffb8b8");
    this.player.play("methods-5-player-hurt", true);
    this.pulseOracleFailure(feedback.status);
    this.scrambleMotesFailure();
    this.showWrongReturnValue(feedback.wrongValue);
    this.schedule(1120, () => {
      this.resetAttempt();
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message:
          message || "Define GetCode(), return the oracle value, then store GetCode() in code.",
      });
    });
  }

  getFailureFeedback(message = "") {
    const normalized = String(message).toLowerCase();
    if (normalized.includes("return int") || normalized.includes("not void")) {
      return {
        status: "wrong return type",
        guide: "Use int.",
      };
    }
    if (normalized.includes("define static int")) {
      return {
        status: "GetCode() missing",
        guide: "Define it first.",
      };
    }
    if (normalized.includes("return 7")) {
      return {
        status: "wrong value",
        guide: "Count again.",
        wrongValue: this.extractReturnedInteger(),
      };
    }
    return {
      status: "value not stored",
      guide: "Store it.",
    };
  }

  extractReturnedInteger() {
    const source = this.lastSourceCode ?? "";
    const codeWithoutComments = source.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
    const match = codeWithoutComments.match(/\breturn\s+(-?\d+)\s*;/);
    if (!match || match[1] === "7") return null;
    return match[1];
  }

  pulseOracleFailure(labelText) {
    const label = this.add
      .text(this.oraclePoint.x, this.oraclePoint.y - 128, labelText, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffd0d0",
        backgroundColor: "#07141fde",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.1);
    const flash = this.add
      .ellipse(this.oraclePoint.x, this.oraclePoint.y - 46, 110, 95, FAIL_RED, 0.18)
      .setDepth(1.42)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.temporaryEffects.push(label, flash);
    this.crystal.setTint(0xff9aaf);
    this.tweens.add({
      targets: [this.crystal, this.oracleGlow, ...this.oracleMotes],
      alpha: 0.28,
      duration: 100,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: [label, flash],
      alpha: 0,
      scaleX: 1.2,
      scaleY: 1.12,
      duration: 820,
      delay: 280,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, label);
        Phaser.Utils.Array.Remove(this.temporaryEffects, flash);
        label.destroy();
        flash.destroy();
      },
    });
  }

  showWrongReturnValue(wrongValue) {
    if (!wrongValue) return;
    const wrongText = this.add
      .text(this.valuePoint.x, this.valuePoint.y, wrongValue, {
        fontFamily: "monospace",
        fontSize: "32px",
        fontStyle: "bold",
        color: "#ffb8b8",
        stroke: "#2b050a",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(2.18);
    this.temporaryEffects.push(wrongText);
    this.tweens.add({
      targets: wrongText,
      x: wrongText.x + 7,
      yoyo: true,
      repeat: 4,
      duration: 60,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.tweens.add({
          targets: wrongText,
          alpha: 0,
          y: wrongText.y + 16,
          scale: 0.72,
          duration: 360,
          ease: "Sine.easeIn",
          onComplete: () => {
            Phaser.Utils.Array.Remove(this.temporaryEffects, wrongText);
            wrongText.destroy();
          },
        });
      },
    });
  }

  scrambleMotesFailure() {
    this.oracleMotes.forEach((mote, index) => {
      const originalX = mote.x;
      const originalY = mote.y;
      this.tweens.add({
        targets: mote,
        x: originalX + Phaser.Math.Between(-12, 12),
        y: originalY + Phaser.Math.Between(-8, 10),
        alpha: index % 2 === 0 ? 0.18 : 0.9,
        scale: index % 2 === 0 ? 0.55 : 1.35,
        duration: 92,
        yoyo: true,
        repeat: 5,
        ease: "Sine.easeInOut",
        onComplete: () => mote.setPosition(originalX, originalY),
      });
    });
  }

  resetAttempt() {
    this.sequenceTimers.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.temporaryEffects.forEach((effect) => effect.destroy());
    this.temporaryEffects = [];
    this.tweens.killTweensOf([
      this.player,
      this.crystal,
      this.oracleGlow,
      this.valueText,
      this.barrier,
      this.barrierCore,
      this.barrierGlow,
      this.barrierLabel,
      this.statusText,
      this.valueLabel,
      this.codeReceptacle,
      this.codeSlot,
      this.codeSlotGlow,
      ...this.oracleMotes,
    ]);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y).setAlpha(1).setTint(0xffffff);
    this.player.play("methods-5-player-idle", true);
    this.crystal.setTint(0xc8fbff).setAlpha(1).setScale(CRYSTAL_SCALE).play(CRYSTAL_ANIM_KEY, true);
    this.oracleGlow.setAlpha(0.1).setScale(1);
    this.oracleMotes.forEach((mote) => {
      mote.setFillStyle(ORACLE_GOLD, 0.76).setStrokeStyle(1, 0xfff5c8, 0.7);
      mote.setScale(1).setAlpha(0.76);
    });
    this.valueText.setText("?").setAlpha(0.42).setScale(1).setColor("#bffaff");
    this.codeReceptacle.setAlpha(0.64).setScale(1);
    this.codeSlot.setStrokeStyle(1, ORACLE_BLUE, 0.28);
    this.codeSlotGlow.setFillStyle(ORACLE_BLUE, 0.08);
    this.codeSlotLabel.setText("code").setColor("#a9d7e6");
    this.statusText.setText("waiting").setColor("#f3e6c4");
    this.diwataLabel.setText("Count them.").setColor("#d9fff1");
    this.barrier.setPosition(this.barrierPoint.x, this.groundY).setAlpha(1).setScale(1);
    this.barrierCore.setAlpha(0.72).setScale(1.32).setTint(0xb8f4ff).play(PORTAL_ANIM_KEY, true);
    this.barrierGlow.setAlpha(0.1).setScale(1);
    this.barrierLabel.setAlpha(1).setScale(1);
    this.sequenceMode = "idle";
    this.cameras.main.stopFollow();
    this.panTo(this.spawnPoint.x, 240);
  }

  finishSuccess() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    this.cameras.main.stopFollow();
    this.player.play("methods-5-player-idle", true);
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: "GetCode returned 7, Main stored it in code, and the oracle opened the path.",
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
      this.statusText.setText("count").setColor("#f3e6c4");
      this.panTo(this.oraclePoint.x, 820);
      this.pulseCountMotes();
    });
    this.schedule(1450, () => {
      if (this.sequenceMode !== "idle") return;
      this.statusText.setText("store the answer").setColor("#d9fff1");
      this.panTo(this.valuePoint.x, 640);
    });
    this.schedule(2400, () => {
      if (this.sequenceMode !== "idle") return;
      this.statusText.setText("sealed path").setColor("#d9f3ff");
      this.panTo(this.barrierPoint.x, 760);
    });
    this.schedule(3420, () => {
      if (this.sequenceMode !== "idle") return;
      this.statusText.setText("waiting").setColor("#f3e6c4");
      this.panTo(this.spawnPoint.x, 820);
    });
  }

  pulseCountMotes() {
    this.oracleMotes.forEach((mote, index) => {
      this.tweens.add({
        targets: mote,
        scale: 1.82,
        alpha: 1,
        duration: 190,
        delay: index * 145,
        yoyo: true,
        ease: "Sine.easeInOut",
      });
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
