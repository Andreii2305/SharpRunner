import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_DIALOGUE_CLOSED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";
import LayeredLpcCharacter from "../characters/LayeredLpcCharacter";
import { DIWATA_FAIRY_CONFIG } from "../characters/diwataFairyConfig";

const LEVEL_NUMBER = 24;
const POST_TRACE_HOLD_MS = 1600;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const MAP_KEY = "methods_level_11_endless_bamboo_stairs";
const MAP_PATH = `${ASSET_BASE}/maps/methods-level-11-endless-bamboo-stairs.tmj`;
const PLAYER_SCALE = 2;
const DIWATA_SCALE = 1.25;
const WATER_TILE_COLUMNS = 20;
const WATER_TILE_FRAME_MS = 130;
const CYAN = 0x79efff;
const BAMBOO_GREEN = 0xb8ff92;
const ERROR_RED = 0xff6677;
const SHRINE_SCALE = 0.13;

export default class MethodsEndlessBambooStairsScene extends Phaser.Scene {
  constructor() {
    super("MethodsEndlessBambooStairsScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("methods_11_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("methods_11_decor", `${GH_BASE}/Decor.png`);
    this.load.image("methods_11_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("methods_11_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("methods_11_house", `${GH_BASE}/House_Tiles.png`);
    this.load.image("methods_11_other", `${GH_BASE}/Other_Tiles2.png`);
    this.load.image("methods_11_other_flipped", `${GH_BASE}/Other_Tiles2(Flipped).png`);
    this.load.image("methods_11_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("methods_11_willow_big", `${GH_BASE}/Weeping_Willow1Big.png`);
    this.load.image("methods_11_willow", `${GH_BASE}/Weeping_Willow1.png`);
    this.load.image("methods_11_tree_1", `${GH_BASE}/Tree1.png`);
    this.load.image("methods_11_tree_2", `${GH_BASE}/Tree2.png`);
    this.load.image("methods_11_large_pine", `${GH_BASE}/Large_Pine_Tree.png`);
    this.load.image("methods_11_wheat", `${GH_BASE}/Pixel_Art_Wheat.png`);
    this.load.image("methods_11_water", `${GH_BASE}/Animated_Sprites/GandalfHardcore_Animated_Water_Tiles.png`);
    this.load.image("methods_11_signage_1", `${ASSET_BASE}/other/signage1.png`);
    this.load.image("methods_11_signage_2", `${ASSET_BASE}/other/signage2.png`);
    this.load.image("methods_11_candle", `${ASSET_BASE}/other/unlit_candle_tileset.png`);
    this.load.image("methods_11_ladder", `${ASSET_BASE}/other/ladder/128x585/ladder2.png`);
    this.load.image("methods_11_shrine_offering", `${ASSET_BASE}/other/shrine_offering.png`);
    this.load.image("methods_11_sealed_shrine", `${ASSET_BASE}/other/sealed_shrine.png`);
    this.load.image("methods_11_altar", `${ASSET_BASE}/other/anting_anting_altar.png`);
    this.load.image("methods_11_exit_sign", `${ASSET_BASE}/other/exit_sign.png`);
    this.load.image("methods_11_stair", `${ASSET_BASE}/other/stair.png`);
    this.load.image("methods_11_bamboo", `${ASSET_BASE}/other/bamboo.png`);
    this.load.audio("methods_11_bell", `${ASSET_BASE}/sounds/bellring.mp3`);
    this.load.spritesheet("methods_11_player", `${ASSET_BASE}/characters/players/char_blue_1.png`, {
      frameWidth: 56,
      frameHeight: 56,
    });
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
    this.load.image("methods_11_bg5", `${BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("methods_11_bg4", `${BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("methods_11_bg3", `${BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("methods_11_bg2", `${BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("methods_11_bg1", `${BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
  }

  create() {
    this.scale.resize(1024, 576);
    const map = this.make.tilemap({ key: MAP_KEY });
    this.offsetY = this.scale.height - map.heightInPixels;
    this.sequenceMode = "idle";
    this.sequenceTimers = [];
    this.temporaryEffects = [];
    this.previewPlayed = false;
    this.stackValues = [];

    this.createBackgrounds(map);
    this.createTileLayers(map);
    this.createAnimations();
    this.points = this.resolveMapObjects(map);
    this.spawnPoint = this.points.player_spawn ?? { x: 90, y: 448 };
    this.diwataPoint = this.points.diwata_spawn ?? { x: 400, y: 448 };
    this.stackPoint = this.points.call_stack_point ?? { x: 650, y: 108 };
    this.shrinePoint = this.points.shrine ?? { x: 950, y: 288 };
    this.exitPoint = this.points.level_exit ?? { x: 1100, y: 288 };
    this.stairPoints = [1, 2, 3, 4, 5]
      .map((step) => ({ step, ...this.points[`stair_${step}`] }))
      .filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));
    this.waterHazard = this.points.water_hazard ?? null;
    this.shrineCharge = 0;

    this.createWaterAtmosphere();
    this.createStairs();
    this.createShrine();
    this.createDiwata();
    this.createPlayer();
    this.createCallStackPanel();
    this.createExecutionControls();
    this.setupCamera(map);

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.on(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  update(time) {
    this.updateWaterAnimation(time);
  }

  createBackgrounds(map) {
    [
      ["methods_11_bg5", 0.08, -8, 0.76, 0],
      ["methods_11_bg4", 0.14, -7, 0.68, 0],
      ["methods_11_bg3", 0.3, -6, 0.6, 88],
      ["methods_11_bg2", 0.54, -5, 0.58, 174],
      ["methods_11_bg1", 0.8, -4, 0.5, 224],
    ].forEach(([key, factor, depth, alpha, y]) => {
      this.add
        .tileSprite(0, y, map.widthInPixels, this.scale.height - y, key)
        .setOrigin(0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x20394c)
        .setAlpha(alpha);
    });
    this.add.rectangle(0, 0, map.widthInPixels, 576, 0x04140f, 0.34).setOrigin(0).setDepth(-3);
  }

  createTileLayers(map) {
    const waterTileset =
      map.addTilesetImage("Animated_Water_Tiles", "methods_11_water") ??
      map.addTilesetImage("GandalfHardcore_Animated_Water_Tiles", "methods_11_water");
    const tilesets = [
      map.addTilesetImage("Floor_Tiles2", "methods_11_floor"),
      map.addTilesetImage("Decor", "methods_11_decor"),
      map.addTilesetImage("Garden_Decorations", "methods_11_garden"),
      map.addTilesetImage("Pine_Trees", "methods_11_pines"),
      map.addTilesetImage("House_Tiles", "methods_11_house"),
      map.addTilesetImage("Other_Tiles2", "methods_11_other"),
      map.addTilesetImage("Pine_forest_sheet", "methods_11_forest"),
      map.addTilesetImage("Weeping_Willow1Big", "methods_11_willow_big"),
      map.addTilesetImage("Other_Tiles2(Flipped)", "methods_11_other_flipped"),
      map.addTilesetImage("signage2", "methods_11_signage_2"),
      map.addTilesetImage("signage1", "methods_11_signage_1"),
      map.addTilesetImage("Pixel_Art_Wheat", "methods_11_wheat"),
      map.addTilesetImage("unlit_candle_tileset", "methods_11_candle"),
      map.addTilesetImage("Tree1", "methods_11_tree_1"),
      map.addTilesetImage("Weeping_Willow1", "methods_11_willow"),
      map.addTilesetImage("Large_Pine_Tree", "methods_11_large_pine"),
      waterTileset,
      map.addTilesetImage("ladder2", "methods_11_ladder"),
      map.addTilesetImage("shrine_offering", "methods_11_shrine_offering"),
      map.addTilesetImage("anting_anting_altar", "methods_11_altar"),
      map.addTilesetImage("exit_sign", "methods_11_exit_sign"),
      map.addTilesetImage("Tree2", "methods_11_tree_2"),
      map.addTilesetImage("stair", "methods_11_stair"),
      map.addTilesetImage("bamboo", "methods_11_bamboo"),
    ].filter(Boolean);

    this.waterTileset = waterTileset ?? null;
    this.waterAnimationLastTime = 0;
    this.waterAnimationFrame = 0;

    ["platform", "trees", "decoration"].forEach((name, index) => {
      const layer = map.createLayer(name, tilesets, 0, this.offsetY);
      if (!layer) return;
      layer.setDepth(0.05 + index * 0.25);
    });
    this.waterLayer = map.createLayer("water", tilesets, 0, this.offsetY);
    if (this.waterLayer) this.waterLayer.setDepth(0.72).setAlpha(0.98);

    const frontLayer = map.createLayer("front_decoration", tilesets, 0, this.offsetY);
    if (frontLayer) {
      frontLayer.setDepth(0.8);
      frontLayer.forEachTile((tile) => {
        if (tile.index >= 1361 && tile.index <= 1364) tile.visible = false;
      });
    }
  }

  updateWaterAnimation(time = 0) {
    if (!this.waterLayer || !this.waterTileset) return;
    if (time - this.waterAnimationLastTime < WATER_TILE_FRAME_MS) return;
    this.waterAnimationLastTime = time;
    this.waterAnimationFrame = (this.waterAnimationFrame + 1) % WATER_TILE_COLUMNS;
    const firstGid = this.waterTileset.firstgid;
    const tileCount = this.waterTileset.total ?? this.waterTileset.tileTotal ?? 220;

    this.waterLayer.forEachTile((tile) => {
      if (!tile || tile.index < firstGid || tile.index >= firstGid + tileCount) return;
      const localIndex = tile.index - firstGid;
      const rowStart = Math.floor(localIndex / WATER_TILE_COLUMNS) * WATER_TILE_COLUMNS;
      tile.index = firstGid + rowStart + this.waterAnimationFrame;
    });
  }

  createWaterAtmosphere() {
    this.waterGlints = [];
    if (!this.waterHazard?.width) return;

    const surfaceY = this.waterHazard.y + 5;
    const count = Phaser.Math.Clamp(Math.round(this.waterHazard.width / 105), 4, 8);
    for (let index = 0; index < count; index += 1) {
      const x = this.waterHazard.x + ((index + 0.5) / count) * this.waterHazard.width;
      const glint = this.add
        .ellipse(x, surfaceY + (index % 2) * 2, Phaser.Math.Between(18, 34), 2, 0xc7fbff, 0.12)
        .setDepth(0.9)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.waterGlints.push(glint);
      this.tweens.add({
        targets: glint,
        x: x + Phaser.Math.Between(-12, 12),
        alpha: { from: 0.06, to: 0.3 },
        scaleX: { from: 0.72, to: 1.18 },
        duration: Phaser.Math.Between(1250, 2100),
        delay: index * 170,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  createAnimations() {
    [
      ["methods-11-player-idle", 0, 5, 6],
      ["methods-11-player-run", 16, 23, 12],
      ["methods-11-player-jump", 32, 39, 10],
      ["methods-11-player-hurt", 48, 55, 10],
    ].forEach(([key, start, end, frameRate]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("methods_11_player", { start, end }),
        frameRate,
        repeat: key.includes("idle") || key.includes("run") ? -1 : 0,
      });
    });
  }

  createStairs() {
    const groundY = this.spawnPoint.y;
    this.stairs = this.stairPoints.map((point) => {
      const width = point.width || 96;
      const supportHeight = Math.max(32, groundY - (point.y + 32));
      const guideSupport = this.add
        .tileSprite(
          point.x + width / 2,
          point.y + 32 + supportHeight,
          32,
          supportHeight,
          "methods_11_bamboo",
        )
        .setOrigin(0.5, 1)
        .setTint(0x6c9290)
        .setAlpha(0.08)
        .setDepth(0.98);
      const guidePlatform = this.add
        .image(point.x + width / 2, point.y + 16, "methods_11_stair")
        .setDisplaySize(width, 32)
        .setTint(0x7da4a0)
        .setAlpha(0.13)
        .setDepth(1.01);
      const support = this.add
        .tileSprite(point.x + width / 2, point.y + 32 + supportHeight, 32, supportHeight, "methods_11_bamboo")
        .setOrigin(0.5, 1)
        .setScale(1, 0.01)
        .setAlpha(0)
        .setDepth(1.05);
      const platform = this.add
        .image(point.x + width / 2, point.y + 16, "methods_11_stair")
        .setDisplaySize(width, 32)
        .setScale(0.05, 1)
        .setAlpha(0)
        .setDepth(1.3);
      const rune = this.add
        .ellipse(point.x + width / 2, point.y + 22, Math.min(width - 18, 70), 14, CYAN, 0.04)
        .setStrokeStyle(1, CYAN, 0.54)
        .setAlpha(0)
        .setDepth(1.2)
        .setBlendMode(Phaser.BlendModes.ADD);
      return {
        ...point,
        width,
        supportHeight,
        guideSupport,
        guidePlatform,
        support,
        platform,
        rune,
      };
    });
  }

  createShrine() {
    this.shrineAura = this.add
      .ellipse(this.shrinePoint.x, this.shrinePoint.y - 52, 120, 108, CYAN, 0.04)
      .setStrokeStyle(1, CYAN, 0.2)
      .setDepth(1.16)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.shrine = this.add
      .image(this.shrinePoint.x, this.shrinePoint.y, "methods_11_sealed_shrine")
      .setOrigin(0.5, 1)
      .setScale(SHRINE_SCALE)
      .setTint(0x6f827b)
      .setDepth(1.5);
    this.shrineStatus = this.add
      .text(this.shrinePoint.x, this.shrinePoint.y - 126, "shrine dormant", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#8da6aa",
        backgroundColor: "#07141faa",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.1);
  }

  createDiwata() {
    this.diwataAura = this.add
      .ellipse(this.diwataPoint.x, this.diwataPoint.y - 34, 74, 94, 0x7effca, 0.1)
      .setDepth(1.18)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.diwata = new LayeredLpcCharacter(this, this.diwataPoint.x, this.diwataPoint.y - 8, DIWATA_FAIRY_CONFIG, {
      scale: DIWATA_SCALE,
      direction: "right",
      animationName: "idle",
    }).setDepth(1.62);
  }

  createPlayer() {
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "methods_11_player")
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.72)
      .play("methods-11-player-idle");
  }

  createCallStackPanel() {
    const x = this.stackPoint.x;
    const y = this.stackPoint.y + 70;
    this.stackPanelCenter = { x, y };
    this.stackPanel = this.add
      .rectangle(x, y, 184, 152, 0x07141f, 0.72)
      .setStrokeStyle(1, CYAN, 0.28)
      .setDepth(2.2);
    this.stackTitle = this.add
      .text(x, y - 64, "call stack", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#a9cad0",
      })
      .setOrigin(0.5)
      .setDepth(2.22);
    this.stackText = this.add
      .text(x, y - 2, "waiting", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#78949a",
      })
      .setOrigin(0.5)
      .setDepth(2.22);
    this.stackFrames = Array.from({ length: 7 }, (_, index) => {
      const slotY = y + 43 - index * 17;
      const frame = this.add
        .rectangle(x, slotY, 154, 15, 0x173140, 0.92)
        .setStrokeStyle(1, CYAN, 0.24)
        .setVisible(false)
        .setDepth(2.23);
      const label = this.add
        .text(x, slotY, "", {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#d7edf0",
        })
        .setOrigin(0.5)
        .setVisible(false)
        .setDepth(2.24);
      return { frame, label, slotY };
    });
    this.phaseText = this.add
      .text(x, y + 61, "stairs missing", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#8da6aa",
        backgroundColor: "#07141fcc",
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(2.23);
  }

  createExecutionControls() {
    const { x, y } = this.stackPanelCenter;
    this.controlTooltip = this.add
      .text(x, y + 108, "", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#c9e7eb",
        backgroundColor: "#07141fe6",
        padding: { x: 5, y: 3 },
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(2.42);

    this.pauseControl = this.createControlButton(
      x - 31,
      y + 84,
      "||",
      "pause recursion",
      () => this.toggleSequencePause(),
    );
    this.stepControl = this.createControlButton(
      x,
      y + 84,
      ">|",
      "next call",
      () => this.stepSequence(),
    );
    this.replayControl = this.createControlButton(
      x + 31,
      y + 84,
      "R",
      "replay trace",
      () => this.replaySequence(),
    );
    this.skipControl = this.createControlButton(
      x + 62,
      y + 84,
      ">>",
      "skip failure playback",
      () => this.skipFailureSequence(),
    );
    this.setControlState("hidden");
  }

  createControlButton(x, y, label, tooltip, onPress) {
    const background = this.add
      .rectangle(x, y, 25, 22, 0x102936, 0.94)
      .setStrokeStyle(1, CYAN, 0.34)
      .setInteractive({ useHandCursor: true })
      .setDepth(2.4);
    const text = this.add
      .text(x, y, label, {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#d9f6f8",
      })
      .setOrigin(0.5)
      .setDepth(2.41);
    const control = { background, text, tooltip, enabled: true };

    background.on("pointerover", () => {
      if (!control.enabled) return;
      background.setFillStyle(0x1c4654, 1).setStrokeStyle(1, CYAN, 0.72);
      this.controlTooltip.setText(tooltip).setVisible(true);
    });
    background.on("pointerout", () => {
      background.setFillStyle(0x102936, 0.94).setStrokeStyle(1, CYAN, 0.34);
      this.controlTooltip.setVisible(false);
    });
    background.on("pointerdown", () => {
      if (!control.enabled) return;
      onPress();
    });
    return control;
  }

  setControlVisible(control, visible, enabled = visible) {
    control.enabled = enabled;
    control.background.setVisible(visible).setAlpha(enabled ? 1 : 0.32);
    control.text.setVisible(visible).setAlpha(enabled ? 1 : 0.32);
    if (enabled) control.background.setInteractive({ useHandCursor: true });
    else control.background.disableInteractive();
  }

  setControlState(state) {
    const running = state === "running";
    const paused = state === "paused";
    const replay = state === "replay";
    const failure = state === "failure";
    this.setControlVisible(this.pauseControl, running || paused);
    this.setControlVisible(this.stepControl, running || paused, paused);
    this.setControlVisible(this.replayControl, replay);
    this.setControlVisible(this.skipControl, failure);
    this.pauseControl.text.setText(paused ? ">" : "||");
    this.controlTooltip.setVisible(false);
  }

  onDialogueClosed({ levelNumber }) {
    if (Number(levelNumber) !== LEVEL_NUMBER || this.previewPlayed) return;
    this.previewPlayed = true;
    this.sequenceMode = "preview";
    this.panTo((this.stairPoints[2]?.x ?? 640) + 80, 620);
    this.schedule(820, () => this.panTo(this.shrinePoint.x, 540));
    this.schedule(1550, () => this.panTo(this.spawnPoint.x + 280, 640));
    this.schedule(2250, () => {
      this.sequenceMode = "idle";
    });
  }

  onCodeEvaluated({ levelNumber, isCorrect, message, recursionError, attemptedArgument }) {
    if (Number(levelNumber) !== LEVEL_NUMBER) return;
    if (["preview", "building", "climbing", "complete", "failure"].includes(this.sequenceMode)) return;
    this.resetAttempt();
    if (isCorrect) this.runRecursion();
    else this.runFailure(recursionError, message, attemptedArgument);
  }

  runRecursion() {
    this.sequenceMode = "building";
    this.panTo((this.stairPoints[2]?.x ?? 640) + 80, 600);
    this.phaseText.setText("calling deeper").setColor("#9cecff");
    this.stackValues = [];
    this.sequencePaused = false;
    this.recursionStepIndex = 0;
    this.recursionSteps = [];
    this.setControlState("running");

    [5, 4, 3, 2, 1, 0].forEach((depth, index) => {
      this.recursionSteps.push({
        delay: index === 0 ? 0 : 240,
        action: () => {
          this.phaseText.setText("calling deeper").setColor("#9cecff");
          this.stackValues.push(depth);
          this.updateStack(false, true);
          this.flashStack(CYAN);
          this.playTone(430 - index * 42, 0.08, 0.025, "sine");
        },
      });
    });

    this.recursionSteps.push({
      delay: 300,
      action: () => {
        this.phaseText.setText("base case: return").setColor("#ffe18a");
        this.flashStack(0xffdf7d);
        this.highlightBaseCase();
      },
    });
    this.recursionSteps.push({
      delay: 560,
      action: () => {
        this.stackValues.pop();
        this.updateStack(false, true);
      },
    });

    this.stairs.forEach((stair, index) => {
      this.recursionSteps.push({
        delay: index === 0 ? 140 : 540,
        action: () => {
          this.phaseText.setText(`return -> CreateStep(${stair.step})`).setColor("#bfffa7");
          this.highlightReturnPair(stair);
          this.growStair(stair);
          this.sendStairCharge(stair, index + 1);
          this.stackValues.pop();
          this.updateStack(false, true);
          this.playTone(360 + index * 68, 0.12, 0.035, "triangle");
        },
      });
    });

    this.recursionSteps.push({
      delay: 620,
      action: () => {
        this.activateShrine();
        this.setControlState("replay");
      },
    });
    this.runNextRecursionStep();
  }

  runNextRecursionStep(immediate = false) {
    if (this.sequenceMode !== "building" || this.sequencePaused) return;
    const step = this.recursionSteps[this.recursionStepIndex];
    if (!step) {
      this.sequenceStepTimer = null;
      this.schedule(POST_TRACE_HOLD_MS, () => this.beginClimb());
      return;
    }

    const execute = () => {
      this.sequenceStepTimer = null;
      this.recursionStepIndex += 1;
      step.action();
      if (!this.sequencePaused) this.runNextRecursionStep();
    };

    if (immediate || step.delay <= 0) {
      execute();
      return;
    }
    this.sequenceStepTimer = this.schedule(step.delay, execute);
  }

  toggleSequencePause() {
    if (this.sequenceMode !== "building") return;
    this.sequencePaused = !this.sequencePaused;
    if (this.sequencePaused) {
      this.sequenceStepTimer?.remove(false);
      this.sequenceStepTimer = null;
      this.setControlState("paused");
      this.phaseText.setText("trace paused").setColor("#b9d9dd");
      return;
    }
    this.setControlState("running");
    this.runNextRecursionStep();
  }

  stepSequence() {
    if (this.sequenceMode !== "building") return;
    if (!this.sequencePaused) {
      this.sequencePaused = true;
      this.sequenceStepTimer?.remove(false);
      this.sequenceStepTimer = null;
      this.setControlState("paused");
    }
    const step = this.recursionSteps[this.recursionStepIndex];
    if (!step) return;
    this.recursionStepIndex += 1;
    step.action();
    if (this.recursionStepIndex >= this.recursionSteps.length) {
      this.sequencePaused = false;
      this.schedule(POST_TRACE_HOLD_MS, () => this.beginClimb());
    }
  }

  replaySequence() {
    if (!["building", "climbing", "complete"].includes(this.sequenceMode)) return;
    this.resetAttempt();
    this.schedule(180, () => this.runRecursion());
  }

  growStair(stair, unsafe = false) {
    const stairIndex = Math.max(0, this.stairs?.indexOf(stair) ?? 0);
    this.playSfx?.("stepSpawn", { rate: Math.min(1.06, 0.94 + stairIndex * 0.03) });
    const color = unsafe ? ERROR_RED : CYAN;
    this.tweens.add({
      targets: [stair.guideSupport, stair.guidePlatform],
      alpha: 0,
      duration: 180,
      ease: "Sine.easeOut",
    });
    stair.rune.setStrokeStyle(1, color, 0.72).setAlpha(0.8).setScale(0.4);
    this.tweens.add({
      targets: stair.rune,
      scaleX: 1.18,
      scaleY: 1.45,
      alpha: 0,
      duration: 460,
      ease: "Sine.easeOut",
    });
    stair.support.setAlpha(unsafe ? 0.55 : 0.9).setTint(unsafe ? 0xff8793 : 0xcaffac);
    stair.platform.setAlpha(unsafe ? 0.58 : 1).setTint(unsafe ? 0xff8793 : 0xffffff);
    this.tweens.add({
      targets: stair.support,
      scaleY: 1,
      duration: 380,
      ease: "Back.easeOut",
      onComplete: () => {
        if (unsafe) return;
        this.tweens.add({
          targets: stair.support,
          angle: { from: -0.55, to: 0.55 },
          duration: 105,
          yoyo: true,
          repeat: 1,
          ease: "Sine.easeInOut",
          onComplete: () => stair.support.setAngle(0),
        });
      },
    });
    this.tweens.add({
      targets: stair.platform,
      scaleX: 1,
      duration: 410,
      ease: "Back.easeOut",
      onComplete: () => {
        if (unsafe) return;
        this.tweens.add({
          targets: stair.platform,
          angle: { from: -0.8, to: 0.8 },
          duration: 95,
          yoyo: true,
          repeat: 1,
          ease: "Sine.easeInOut",
          onComplete: () => stair.platform.setAngle(0),
        });
      },
    });
    this.createGrowthParticles(stair, color);
    if (!unsafe) this.createBambooLeaves(stair);
  }

  highlightReturnPair(stair) {
    const visibleIndex = Math.min(this.stackValues.length, this.stackFrames.length) - 1;
    const stackFrame = this.stackFrames[visibleIndex];
    if (stackFrame) {
      stackFrame.frame.setFillStyle(0x214329, 0.98).setStrokeStyle(1, BAMBOO_GREEN, 0.92);
      stackFrame.label.setColor("#dcffc8");
      this.tweens.add({
        targets: [stackFrame.frame, stackFrame.label],
        scaleX: 1.06,
        scaleY: 1.1,
        duration: 120,
        yoyo: true,
        ease: "Sine.easeInOut",
      });
    }

    const stairPulse = this.add
      .ellipse(stair.x + stair.width / 2, stair.y + 18, stair.width - 8, 24, BAMBOO_GREEN, 0.04)
      .setStrokeStyle(2, BAMBOO_GREEN, 0.82)
      .setDepth(1.84)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.temporaryEffects.push(stairPulse);
    this.tweens.add({
      targets: stairPulse,
      scaleX: 1.14,
      scaleY: 1.3,
      alpha: 0,
      duration: 460,
      ease: "Sine.easeOut",
      onComplete: () => this.destroyTemporary(stairPulse),
    });
  }

  sendStairCharge(stair, charge) {
    const mote = this.add
      .circle(stair.x + stair.width / 2, stair.y + 10, 4, CYAN, 0.9)
      .setDepth(2.12)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.temporaryEffects.push(mote);
    this.tweens.add({
      targets: mote,
      x: this.shrinePoint.x,
      y: this.shrinePoint.y - 54,
      scale: 0.45,
      duration: 520,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.destroyTemporary(mote);
        this.shrineCharge = charge;
        this.shrineAura.setAlpha(0.04 + charge * 0.035);
        this.tweens.add({
          targets: [this.shrine, this.shrineAura],
          scaleX: "*=1.025",
          scaleY: "*=1.025",
          duration: 110,
          yoyo: true,
          ease: "Sine.easeInOut",
        });
        this.createBurst(
          { x: this.shrinePoint.x, y: this.shrinePoint.y - 20 },
          CYAN,
          4,
          20,
        );
      },
    });
  }

  createGrowthParticles(stair, color) {
    for (let index = 0; index < 16; index += 1) {
      const particle = this.add
        .circle(
          stair.x + Phaser.Math.Between(8, stair.width - 8),
          stair.y + Phaser.Math.Between(12, 42),
          Phaser.Math.Between(2, 4),
          index % 3 === 0 ? BAMBOO_GREEN : color,
          0.82,
        )
        .setDepth(1.8)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.temporaryEffects.push(particle);
      this.tweens.add({
        targets: particle,
        y: particle.y - Phaser.Math.Between(20, 54),
        x: particle.x + Phaser.Math.Between(-14, 14),
        alpha: 0,
        scale: 0.2,
        delay: index * 18,
        duration: Phaser.Math.Between(380, 650),
        ease: "Sine.easeOut",
        onComplete: () => this.destroyTemporary(particle),
      });
    }
  }

  createBambooLeaves(stair) {
    for (let index = 0; index < 7; index += 1) {
      const leaf = this.add
        .ellipse(
          stair.x + Phaser.Math.Between(12, stair.width - 12),
          stair.y + Phaser.Math.Between(8, 26),
          Phaser.Math.Between(3, 6),
          Phaser.Math.Between(7, 11),
          index % 2 === 0 ? 0xb8ff92 : 0x6ebc74,
          0.82,
        )
        .setAngle(Phaser.Math.Between(-55, 55))
        .setDepth(1.82);
      this.temporaryEffects.push(leaf);
      this.tweens.add({
        targets: leaf,
        x: leaf.x + Phaser.Math.Between(-28, 28),
        y: leaf.y + Phaser.Math.Between(24, 48),
        angle: leaf.angle + Phaser.Math.Between(80, 190),
        alpha: 0,
        delay: index * 28,
        duration: Phaser.Math.Between(560, 820),
        ease: "Sine.easeIn",
        onComplete: () => this.destroyTemporary(leaf),
      });
    }
  }

  activateShrine() {
    this.playSfx?.("energyCharge");
    this.shrineCharge = this.stairs.length;
    this.phaseText.setText("stack cleared").setColor("#d8ffcb");
    this.stackText.setVisible(true).setText("complete").setColor("#d8ffcb");
    this.shrineStatus.setText("shrine awakened").setColor("#d8ffcb");
    this.shrine.clearTint();
    this.shrineAura.setAlpha(0.32);
    if (this.cache.audio.exists("methods_11_bell")) {
      this.sound.play("methods_11_bell", { volume: 0.34 });
    }
    this.tweens.add({
      targets: [this.shrine, this.shrineAura],
      scaleX: "*=1.08",
      scaleY: "*=1.08",
      alpha: 1,
      duration: 260,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
    this.createBurst(this.shrinePoint, CYAN, 24, 66);
  }

  beginClimb() {
    this.sequenceMode = "climbing";
    this.phaseText.setText("path stable").setColor("#d8ffcb");
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.player.setFlipX(false).play("methods-11-player-run", true);
    const first = this.stairs[0];
    const approachX = first ? first.x - 18 : this.player.x + 200;
    this.tweens.add({
      targets: this.player,
      x: approachX,
      y: this.spawnPoint.y,
      duration: Math.max(520, Math.abs(approachX - this.player.x) * 2.2),
      ease: "Linear",
      onComplete: () => this.jumpToStair(0),
    });
  }

  jumpToStair(index) {
    const stair = this.stairs[index];
    if (!stair) {
      this.runToExit();
      return;
    }
    const targetX = stair.x + stair.width / 2;
    const targetY = stair.y;
    const midX = (this.player.x + targetX) / 2;
    const midY = Math.min(this.player.y, targetY) - 30;
    this.player.play("methods-11-player-jump", true);
    this.tweens.add({
      targets: this.player,
      x: midX,
      y: midY,
      duration: 170,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: this.player,
          x: targetX,
          y: targetY,
          duration: 190,
          ease: "Sine.easeIn",
          onComplete: () => {
            this.player.play("methods-11-player-idle", true);
            this.schedule(100, () => this.jumpToStair(index + 1));
          },
        });
      },
    });
  }

  runToExit() {
    this.player.play("methods-11-player-run", true);
    this.tweens.add({
      targets: this.player,
      x: this.exitPoint.x,
      y: this.exitPoint.y,
      duration: Math.max(620, Math.abs(this.exitPoint.x - this.player.x) * 4),
      ease: "Linear",
      onComplete: () => {
        this.player.play("methods-11-player-idle", true);
        this.cameras.main.stopFollow();
        this.finishSuccess();
      },
    });
  }

  runCountMismatchFailure(requestedCount, message) {
    this.sequenceMode = "failure";
    this.pendingFailureMessage = message;
    this.setControlState("failure");
    const normalizedCount = Math.max(0, Math.trunc(requestedCount));
    const visibleCount = Phaser.Math.Clamp(normalizedCount, 0, this.stairs.length);
    const tracedCount = Math.min(normalizedCount, this.stairs.length + 1);
    const overflowCount = Math.max(0, normalizedCount - this.stairs.length);
    const callValues = Array.from({ length: tracedCount + 1 }, (_, index) => tracedCount - index);
    this.phaseText.setText(`requested ${normalizedCount} steps`).setColor("#ffe18a");
    this.stackValues = [];

    callValues.forEach((value, index) => {
      this.schedule(index * 130, () => {
        this.stackValues.push(value);
        this.updateStack(false, true);
        this.flashStack(value === 0 ? 0xffdf7d : CYAN);
        this.playTone(430 - index * 34, 0.07, 0.022, "sine");
      });
    });

    const baseTime = callValues.length * 130 + 80;
    this.schedule(baseTime, () => {
      this.phaseText.setText("base case: return").setColor("#ffe18a");
      this.highlightBaseCase();
    });
    this.schedule(baseTime + 360, () => {
      this.stackValues.pop();
      this.updateStack(false, true);
    });

    const returnStart = baseTime + 500;
    this.stairs.slice(0, visibleCount).forEach((stair, index) => {
      this.schedule(returnStart + index * 400, () => {
        this.phaseText.setText(`return -> CreateStep(${stair.step})`).setColor("#bfffa7");
        this.highlightReturnPair(stair);
        this.growStair(stair);
        this.sendStairCharge(stair, index + 1);
        this.stackValues.pop();
        this.updateStack(false, true);
        this.playTone(360 + index * 68, 0.11, 0.03, "triangle");
      });
    });

    const overflowTime = returnStart + visibleCount * 400;
    if (overflowCount > 0) {
      this.schedule(overflowTime, () => this.showOverflowCall(normalizedCount));
    }

    const revealTime = overflowTime + (overflowCount > 0 ? 760 : 420);
    this.schedule(revealTime, () => {
      if (visibleCount === 0) {
        this.phaseText.setText("no stairs requested").setColor("#ffb8c0");
        this.finishCountMismatchFailure(message, 900);
        return;
      }
      this.beginPartialClimb(visibleCount, normalizedCount, () => {
        this.finishCountMismatchFailure(message, 700);
      });
    });
  }

  beginPartialClimb(stepCount, requestedCount, onComplete) {
    const first = this.stairs[0];
    if (!first) {
      onComplete();
      return;
    }
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.player.setFlipX(false).play("methods-11-player-run", true);
    const approachX = first.x - 18;
    this.tweens.add({
      targets: this.player,
      x: approachX,
      y: this.spawnPoint.y,
      duration: Math.max(480, Math.abs(approachX - this.player.x) * 2.1),
      ease: "Linear",
      onComplete: () => this.jumpPartialStair(0, stepCount, requestedCount, onComplete),
    });
  }

  jumpPartialStair(index, stepCount, requestedCount, onComplete) {
    if (index >= stepCount) {
      this.player.play("methods-11-player-idle", true);
      this.cameras.main.stopFollow();
      this.phaseText
        .setText(
          requestedCount > this.stairs.length
            ? `${requestedCount} calls, only ${this.stairs.length} stairs`
            : `${requestedCount} of ${this.stairs.length} stairs`,
        )
        .setColor("#ffcf85");
      this.shrineStatus
        .setText(requestedCount > this.stairs.length ? "path overloaded" : "path incomplete")
        .setColor("#ffcf85");
      this.schedule(700, onComplete);
      return;
    }

    const stair = this.stairs[index];
    const targetX = stair.x + stair.width / 2;
    const targetY = stair.y;
    const midX = (this.player.x + targetX) / 2;
    const midY = Math.min(this.player.y, targetY) - 28;
    this.player.play("methods-11-player-jump", true);
    this.tweens.add({
      targets: this.player,
      x: midX,
      y: midY,
      duration: 165,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: this.player,
          x: targetX,
          y: targetY,
          duration: 185,
          ease: "Sine.easeIn",
          onComplete: () => {
            this.player.play("methods-11-player-idle", true);
            this.schedule(90, () =>
              this.jumpPartialStair(index + 1, stepCount, requestedCount, onComplete),
            );
          },
        });
      },
    });
  }

  showOverflowCall(requestedCount) {
    this.stackValues = [requestedCount];
    this.updateStack(true, false);
    this.phaseText
      .setText(`CreateStep(${requestedCount}): no stair`)
      .setColor("#ff9ca8");
    const visibleIndex = Math.min(this.stackValues.length, this.stackFrames.length) - 1;
    const overflowFrame = this.stackFrames[visibleIndex];
    if (overflowFrame) {
      overflowFrame.frame.setFillStyle(0x4a1825, 0.98).setStrokeStyle(2, ERROR_RED, 0.94);
      overflowFrame.label.setColor("#ffd0d5");
      this.tweens.add({
        targets: [overflowFrame.frame, overflowFrame.label],
        x: "+=10",
        duration: 70,
        yoyo: true,
        repeat: 3,
        ease: "Sine.easeInOut",
      });
    }
    this.stackPanel.setStrokeStyle(2, ERROR_RED, 0.9);
    this.cameras.main.shake(130, 0.002);
    this.createBurst(
      { x: this.stackPanelCenter.x, y: this.stackPanelCenter.y + 18 },
      ERROR_RED,
      12,
      42,
    );
  }

  finishCountMismatchFailure(message, delay) {
    this.schedule(delay, () => this.completeFailureReview(message));
  }

  runFailure(errorType, message = "", attemptedArgument = null) {
    if (errorType === "missingMainCall" && Number.isFinite(attemptedArgument)) {
      this.runCountMismatchFailure(attemptedArgument, message);
      return;
    }

    this.sequenceMode = "failure";
    this.pendingFailureMessage = message;
    this.setControlState("failure");
    this.phaseText.setColor("#ffb8c0");
    this.stackText.setColor("#ffb8c0");
    const noProgress = errorType === "noProgress";
    const wrongOrder = errorType === "wrongOrder";
    const values = noProgress ? [5, 5, 5, 5, 5, 5] : [5, 4, 3, 2, 1, 0, -1];

    this.phaseText.setText(
      wrongOrder ? "unsafe order" : noProgress ? "not approaching zero" : "no stopping condition",
    );
    if (wrongOrder) {
      [...this.stairs].reverse().forEach((stair, index) => {
        this.schedule(index * 230, () => this.growStair(stair, true));
      });
    }

    if (!wrongOrder) {
      this.stackValues = [];
      values.forEach((value, index) => {
        this.schedule(index * 150, () => {
          this.stackValues.push(value);
          this.updateStack(true);
          this.cameras.main.shake(55, 0.0015);
        });
      });
    }

    if (wrongOrder) {
      this.schedule(1180, () => this.runFailureApproach(this.stairs[0]));
    }
    this.schedule(1420, () => {
      this.phaseText.setText("ritual interrupted");
      this.diwata.playAnimation("spellcast", "right");
      this.createBurst(this.diwataPoint, ERROR_RED, 14, 44);
      if (wrongOrder) this.collapseStairIntoWater(this.stairs.at(-1));
    });
    this.schedule(2950, () => this.completeFailureReview(message));
  }

  skipFailureSequence() {
    if (this.sequenceMode !== "failure") return;
    this.sequenceTimers.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.sequenceStepTimer = null;
    this.tweens.killTweensOf(this.player);
    this.player.play("methods-11-player-idle", true);
    this.cameras.main.stopFollow();
    this.phaseText.setText("attempt ready to review").setColor("#ffcf85");
    this.completeFailureReview(this.pendingFailureMessage);
  }

  completeFailureReview(message = "") {
    if (this.sequenceMode !== "failure") return;
    this.sequenceMode = "failureReview";
    this.setControlState("hidden");
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "failure",
      message,
    });
  }

  runFailureApproach(firstStair) {
    if (!firstStair) return;
    const stopX = firstStair.x - 18;
    this.player.setFlipX(false).play("methods-11-player-run", true);
    this.tweens.add({
      targets: this.player,
      x: stopX,
      y: this.spawnPoint.y,
      duration: Math.max(420, Math.abs(stopX - this.player.x) * 2.1),
      ease: "Linear",
      onComplete: () => this.player.play("methods-11-player-idle", true),
    });
  }

  collapseStairIntoWater(stair) {
    if (!stair) return;
    const waterY = Number.isFinite(this.waterHazard?.y)
      ? this.waterHazard.y + 7
      : this.spawnPoint.y + 72;
    stair.platform.setTint(ERROR_RED);
    stair.rune.setAlpha(0.72).setStrokeStyle(1, ERROR_RED, 0.9);
    this.tweens.add({
      targets: [stair.platform, stair.rune],
      alpha: { from: 0.72, to: 0.2 },
      duration: 85,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        this.tweens.add({
          targets: [stair.platform, stair.rune],
          y: waterY,
          angle: 8,
          alpha: 0,
          duration: 430,
          ease: "Quad.easeIn",
          onComplete: () => this.createWaterSplash(stair.x + stair.width / 2, waterY),
        });
        this.tweens.add({
          targets: stair.support,
          scaleY: 0.18,
          alpha: 0,
          duration: 360,
          ease: "Quad.easeIn",
        });
      },
    });
  }

  createWaterSplash(x, y) {
    const ring = this.add
      .ellipse(x, y, 18, 6, 0xbefbff, 0.1)
      .setStrokeStyle(2, 0xbefbff, 0.82)
      .setDepth(1.86)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.temporaryEffects.push(ring);
    this.tweens.add({
      targets: ring,
      scaleX: 3.2,
      scaleY: 1.7,
      alpha: 0,
      duration: 520,
      ease: "Sine.easeOut",
      onComplete: () => this.destroyTemporary(ring),
    });

    for (let index = 0; index < 12; index += 1) {
      const drop = this.add
        .circle(x + Phaser.Math.Between(-8, 8), y, Phaser.Math.Between(1, 3), 0xbefbff, 0.82)
        .setDepth(1.88)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.temporaryEffects.push(drop);
      this.tweens.add({
        targets: drop,
        x: drop.x + Phaser.Math.Between(-28, 28),
        y: y - Phaser.Math.Between(18, 46),
        alpha: 0,
        duration: Phaser.Math.Between(360, 580),
        ease: "Quad.easeOut",
        onComplete: () => this.destroyTemporary(drop),
      });
    }
    this.playTone(180, 0.16, 0.025, "sine");
  }

  updateStack(error = false, animate = true) {
    const visibleValues = this.stackValues.slice(-this.stackFrames.length);
    this.stackText
      .setVisible(visibleValues.length === 0)
      .setText(visibleValues.length === 0 ? "waiting" : "")
      .setColor(error ? "#ffb8c0" : "#78949a");

    this.stackFrames.forEach(({ frame, label, slotY }, index) => {
      const value = visibleValues[index];
      if (value !== undefined) {
        const wasVisible = frame.visible;
        frame
          .setVisible(true)
          .setPosition(this.stackPanelCenter.x, slotY)
          .setFillStyle(error ? 0x441d29 : 0x173140, 0.94)
          .setStrokeStyle(1, error ? ERROR_RED : CYAN, error ? 0.64 : 0.3);
        label
          .setVisible(true)
          .setPosition(this.stackPanelCenter.x, slotY)
          .setText(`BuildStairs(${value})`)
          .setColor(error ? "#ffd1d6" : "#d7edf0");
        if (animate && !wasVisible) {
          frame.setX(this.stackPanelCenter.x + 18).setAlpha(0);
          label.setX(this.stackPanelCenter.x + 18).setAlpha(0);
          this.tweens.add({
            targets: [frame, label],
            x: this.stackPanelCenter.x,
            alpha: 1,
            duration: 170,
            ease: "Back.easeOut",
          });
        } else {
          frame.setAlpha(1);
          label.setAlpha(1);
        }
        return;
      }

      if (!frame.visible) return;
      if (!animate) {
        frame.setVisible(false);
        label.setVisible(false);
        return;
      }
      this.tweens.add({
        targets: [frame, label],
        x: this.stackPanelCenter.x - 20,
        alpha: 0,
        duration: 150,
        ease: "Sine.easeIn",
        onComplete: () => {
          frame.setVisible(false).setX(this.stackPanelCenter.x);
          label.setVisible(false).setX(this.stackPanelCenter.x);
        },
      });
    });
  }

  highlightBaseCase() {
    this.playSfx?.("magicPulse");
    const baseFrame = this.stackFrames[this.stackValues.length - 1];
    if (baseFrame) {
      baseFrame.frame.setFillStyle(0x4b3b16, 0.96).setStrokeStyle(1, 0xffdf7d, 0.95);
      baseFrame.label.setColor("#fff0ad");
      this.tweens.add({
        targets: [baseFrame.frame, baseFrame.label],
        scaleX: 1.08,
        scaleY: 1.12,
        duration: 150,
        yoyo: true,
        repeat: 1,
        ease: "Sine.easeInOut",
      });
    }

    const pulse = this.add
      .rectangle(
        this.stackPanelCenter.x,
        this.stackPanelCenter.y,
        190,
        158,
        0xffdf7d,
        0,
      )
      .setStrokeStyle(2, 0xffdf7d, 0.72)
      .setDepth(2.25)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.temporaryEffects.push(pulse);
    this.tweens.add({
      targets: pulse,
      scaleX: 1.08,
      scaleY: 1.08,
      alpha: 0,
      duration: 520,
      ease: "Sine.easeOut",
      onComplete: () => this.destroyTemporary(pulse),
    });
    this.playTone(294, 0.16, 0.04, "sine");
    this.schedule(115, () => this.playTone(440, 0.18, 0.03, "triangle"));
  }

  playTone(frequency, duration = 0.1, volume = 0.03, type = "sine") {
    const context = this.sound?.context;
    if (!context || typeof context.createOscillator !== "function") return;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    } catch {
      // Audio may be unavailable until the browser grants an interaction context.
    }
  }

  flashStack(color) {
    this.stackPanel.setStrokeStyle(1, color, 0.7);
    this.tweens.add({
      targets: [this.stackPanel, this.stackText],
      alpha: 0.58,
      duration: 90,
      yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => this.stackPanel.setStrokeStyle(1, CYAN, 0.28),
    });
  }

  createBurst(point, color, count = 18, spread = 52) {
    for (let index = 0; index < count; index += 1) {
      const spark = this.add
        .circle(point.x, point.y - 28, Phaser.Math.Between(2, 4), color, 0.86)
        .setDepth(2.15)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.temporaryEffects.push(spark);
      this.tweens.add({
        targets: spark,
        x: spark.x + Phaser.Math.Between(-spread, spread),
        y: spark.y + Phaser.Math.Between(-spread, Math.round(spread * 0.6)),
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(420, 720),
        ease: "Sine.easeOut",
        onComplete: () => this.destroyTemporary(spark),
      });
    }
  }

  resetAttempt() {
    this.sequenceTimers.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.sequenceStepTimer = null;
    this.sequencePaused = false;
    this.recursionSteps = [];
    this.recursionStepIndex = 0;
    this.tweens.killTweensOf(this.temporaryEffects);
    this.temporaryEffects.forEach((effect) => effect.destroy());
    this.temporaryEffects = [];
    this.stackValues = [];
    this.shrineCharge = 0;
    this.pendingFailureMessage = null;
    this.tweens.killTweensOf([
      this.player,
      this.shrine,
      this.shrineAura,
      this.stackPanel,
      this.stackText,
      ...this.stackFrames.flatMap(({ frame, label }) => [frame, label]),
      ...this.stairs.flatMap(
        ({ guidePlatform, guideSupport, platform, support, rune }) => [
          guidePlatform,
          guideSupport,
          platform,
          support,
          rune,
        ],
      ),
    ]);
    this.stackFrames.forEach(({ frame, label }) => {
      frame.setVisible(false).setAlpha(1).setScale(1).setX(this.stackPanelCenter.x);
      label.setVisible(false).setAlpha(1).setScale(1).setX(this.stackPanelCenter.x);
    });
    this.stairs.forEach((stair) => {
      const {
        x,
        y,
        width,
        supportHeight,
        guidePlatform,
        guideSupport,
        platform,
        support,
        rune,
      } = stair;
      const centerX = x + width / 2;
      guidePlatform.setPosition(centerX, y + 16);
      guideSupport.setPosition(centerX, y + 32 + supportHeight);
      platform.setPosition(centerX, y + 16);
      support.setPosition(centerX, y + 32 + supportHeight);
      rune.setPosition(centerX, y + 22);
      guidePlatform.setAlpha(0.13);
      guideSupport.setAlpha(0.08);
      platform.setAlpha(0).setScale(0.05, 1).setAngle(0).clearTint();
      support.setAlpha(0).setScale(1, 0.01).setAngle(0).clearTint();
      rune.setAlpha(0).setScale(1).setAngle(0);
    });
    this.player
      .setPosition(this.spawnPoint.x, this.spawnPoint.y)
      .setAlpha(1)
      .setFlipX(false)
      .play("methods-11-player-idle", true);
    this.diwata.playAnimation("idle", "right");
    this.shrine.setScale(SHRINE_SCALE).setAlpha(1).setTint(0x6f827b);
    this.shrineAura.setScale(1).setAlpha(0.04);
    this.shrineStatus.setText("shrine dormant").setColor("#8da6aa");
    this.stackText
      .setVisible(true)
      .setText("waiting")
      .setColor("#78949a")
      .setAlpha(1)
      .setScale(1);
    this.stackPanel.setAlpha(1).setScale(1).setStrokeStyle(1, CYAN, 0.28);
    this.phaseText.setText("stairs missing").setColor("#8da6aa");
    this.setControlState("hidden");
    this.cameras.main.stopFollow();
    this.panTo(this.spawnPoint.x + 280, 420);
    this.sequenceMode = "idle";
  }

  finishSuccess() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    this.setControlState("replay");
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      shouldProceed: true,
    });
  }

  setupCamera(map) {
    this.cameras.main.setBounds(0, 0, map.widthInPixels, this.scale.height);
    this.cameras.main.setZoom(1);
    this.panTo(this.spawnPoint.x + 280, 0);
  }

  panTo(x, duration = 600) {
    const halfWidth = this.scale.width / 2;
    const boundsWidth = this.cameras.main.getBounds().width;
    const clampedX = Phaser.Math.Clamp(x, halfWidth, Math.max(halfWidth, boundsWidth - halfWidth));
    if (duration <= 0) {
      this.cameras.main.scrollX = clampedX - halfWidth;
      return;
    }
    this.cameras.main.pan(clampedX, this.scale.height / 2, duration, "Sine.easeInOut");
  }

  resolveMapObjects(map) {
    const points = {};
    map.objects.forEach((layer) => {
      layer.objects?.forEach((object) => {
        if (!object.name) return;
        points[object.name] = {
          x: object.x,
          y: object.y + this.offsetY,
          width: object.width,
          height: object.height,
        };
      });
    });
    return points;
  }

  schedule(delay, callback) {
    const timer = this.time.delayedCall(delay, callback);
    this.sequenceTimers.push(timer);
    return timer;
  }

  destroyTemporary(effect) {
    Phaser.Utils.Array.Remove(this.temporaryEffects, effect);
    effect?.destroy();
  }

  cleanup() {
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.off(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.sequenceTimers?.forEach((timer) => timer.remove(false));
    this.temporaryEffects?.forEach((effect) => effect.destroy());
    this.diwata?.destroy();
  }
}
