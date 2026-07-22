import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_DIALOGUE_CLOSED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";
import LayeredLpcCharacter from "../characters/LayeredLpcCharacter";
import { DIWATA_FAIRY_CONFIG } from "../characters/diwataFairyConfig";

const LEVEL_NUMBER = 19;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const MAP_KEY = "methods_level_6_diwatas_safe_path";
const MAP_PATH = `${ASSET_BASE}/maps/methods-level-6-diwatas-safe-path.tmj`;
const PLAYER_SCALE = 2;
const PLAYER_SPEED = 170;
const PLAYER_CLIMB_DURATION = 780;
const DIWATA_SCALE = 1.25;
const WATER_TILE_COLUMNS = 20;
const WATER_TILE_FRAME_MS = 130;
const SAFE_BLUE = 0x79f4ff;
const SAFE_GREEN = 0x9dffbd;
const DANGER_RED = 0xff6677;
const RETURN_TEXT = '"up"';

export default class MethodsDiwatasSafePathScene extends Phaser.Scene {
  constructor() {
    super("MethodsDiwatasSafePathScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("methods_6_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("methods_6_decor", `${GH_BASE}/Decor.png`);
    this.load.image("methods_6_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("methods_6_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("methods_6_house", `${GH_BASE}/House_Tiles.png`);
    this.load.image("methods_6_other", `${GH_BASE}/Other_Tiles2.png`);
    this.load.image("methods_6_other_flipped", `${GH_BASE}/Other_Tiles2(Flipped).png`);
    this.load.image("methods_6_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("methods_6_willow_big", `${GH_BASE}/Weeping_Willow1Big.png`);
    this.load.image("methods_6_willow", `${GH_BASE}/Weeping_Willow1.png`);
    this.load.image("methods_6_tree_1", `${GH_BASE}/Tree1.png`);
    this.load.image("methods_6_large_pine", `${GH_BASE}/Large_Pine_Tree.png`);
    this.load.image("methods_6_wheat", `${GH_BASE}/Pixel_Art_Wheat.png`);
    this.load.image("methods_6_signage_1", `${ASSET_BASE}/other/signage1.png`);
    this.load.image("methods_6_signage_2", `${ASSET_BASE}/other/signage2.png`);
    this.load.image("methods_6_unlit_candle", `${ASSET_BASE}/other/unlit_candle.png`);
    this.load.image("methods_6_unlit_candle_tileset", `${ASSET_BASE}/other/unlit_candle_tileset.png`);
    this.load.image("methods_6_ladder_1", `${ASSET_BASE}/other/ladder/128x585/ladder1.png`);
    this.load.image("methods_6_ladder_2", `${ASSET_BASE}/other/ladder/128x585/ladder2.png`);
    this.load.image(
      "methods_6_water_tiles",
      `${GH_BASE}/Animated_Sprites/GandalfHardcore_Animated_Water_Tiles.png`,
    );
    this.load.spritesheet(
      "methods_6_player",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    this.load.spritesheet(
      "methods_6_player_climb",
      `${ASSET_BASE}/characters/players/char_blue_2.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
    this.load.image("methods_6_bg5", `${BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("methods_6_bg4", `${BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("methods_6_bg3", `${BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("methods_6_bg2", `${BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("methods_6_bg1", `${BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
  }

  create() {
    this.scale.resize(1024, 576);
    const map = this.make.tilemap({ key: MAP_KEY });
    this.offsetY = this.scale.height - map.heightInPixels;
    this.sequenceTimers = [];
    this.temporaryEffects = [];
    this.sequenceMode = "idle";

    this.createBackgrounds(map);
    this.createAnimations();
    this.createTileLayers(map);
    this.points = this.resolveMapPoints(map);
    this.waterHazards = this.resolveWaterHazards(map);

    this.spawnPoint = this.points.player_spawn ?? { x: 96, y: 448 };
    this.diwataPoint = this.points.diwata_spawn ?? { x: 390, y: 430 };
    this.upPathPoint = this.points.up_path ?? { x: 540, y: 320 };
    this.downPathPoint = this.points.down_path ?? { x: 660, y: 510 };
    this.valuePoint = this.points.return_value_point ?? { x: 444, y: 181 };
    this.exitPoint = this.points.level_exit ?? { x: map.widthInPixels - 90, y: this.upPathPoint.y };
    this.groundY = Math.max(this.spawnPoint.y, this.downPathPoint.y);

    this.createRouteCues();
    this.createWaterGlints();
    this.createDiwata();
    this.createPlayer();
    this.createLabels();
    this.setupCamera(map);

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.on(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  update(time) {
    this.updateWaterAnimation(time);
    this.updateRouteMovement();
  }

  createBackgrounds(map) {
    [
      ["methods_6_bg5", 0.08, -8, 0.78, 0],
      ["methods_6_bg4", 0.14, -7, 0.7, 0],
      ["methods_6_bg3", 0.32, -6, 0.62, 88],
      ["methods_6_bg2", 0.58, -5, 0.58, 176],
      ["methods_6_bg1", 0.82, -4, 0.5, 225],
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
      .rectangle(0, 0, map.widthInPixels, 576, 0x020610, 0.28)
      .setOrigin(0)
      .setDepth(-3);
  }

  createTileLayers(map) {
    const waterTileset =
      map.addTilesetImage("Animated_Water_Tiles", "methods_6_water_tiles") ??
      map.addTilesetImage("GandalfHardcore_Animated_Water_Tiles", "methods_6_water_tiles");
    const tilesets = [
      map.addTilesetImage("Floor_Tiles2", "methods_6_floor"),
      map.addTilesetImage("Decor", "methods_6_decor"),
      map.addTilesetImage("Garden_Decorations", "methods_6_garden"),
      map.addTilesetImage("Pine_Trees", "methods_6_pines"),
      map.addTilesetImage("House_Tiles", "methods_6_house"),
      map.addTilesetImage("Other_Tiles2", "methods_6_other"),
      map.addTilesetImage("Other_Tiles2(Flipped)", "methods_6_other_flipped"),
      map.addTilesetImage("Pine_forest_sheet", "methods_6_forest"),
      map.addTilesetImage("Weeping_Willow1Big", "methods_6_willow_big"),
      map.addTilesetImage("Weeping_Willow1", "methods_6_willow"),
      map.addTilesetImage("Tree1", "methods_6_tree_1"),
      map.addTilesetImage("Large_Pine_Tree", "methods_6_large_pine"),
      map.addTilesetImage("Pixel_Art_Wheat", "methods_6_wheat"),
      map.addTilesetImage("signage1", "methods_6_signage_1"),
      map.addTilesetImage("signage2", "methods_6_signage_2"),
      map.addTilesetImage("unlit_candle", "methods_6_unlit_candle"),
      map.addTilesetImage("unlit_candle_tileset", "methods_6_unlit_candle_tileset"),
      map.addTilesetImage("ladder1", "methods_6_ladder_1"),
      map.addTilesetImage("ladder2", "methods_6_ladder_2"),
      waterTileset,
    ].filter(Boolean);

    this.waterTileset = waterTileset ?? null;
    this.waterAnimationLastTime = 0;
    this.waterAnimationFrame = 0;

    ["platform", "trees", "decoration"].forEach((name, index) => {
      const layer = map.createLayer(name, tilesets, 0, this.offsetY);
      if (layer) layer.setDepth(0.1 + index * 0.22);
    });
    this.waterLayer = map.createLayer("water", tilesets, 0, this.offsetY);
    if (this.waterLayer) this.waterLayer.setDepth(0.76).setAlpha(0.98);
    const frontLayer = map.createLayer("front_decoration", tilesets, 0, this.offsetY);
    if (frontLayer) frontLayer.setDepth(1.35).setAlpha(0.96);
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

  createAnimations() {
    [
      ["methods-6-player-idle", 0, 5, 6],
      ["methods-6-player-run", 16, 23, 12],
      ["methods-6-player-hurt", 48, 55, 10],
      ["methods-6-player-cast", 64, 71, 10],
    ].forEach(([key, start, end, frameRate]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("methods_6_player", { start, end }),
        frameRate,
        repeat: key.includes("hurt") || key.includes("cast") ? 0 : -1,
      });
    });
    if (!this.anims.exists("methods-6-player-climb")) {
      this.anims.create({
        key: "methods-6-player-climb",
        frames: this.anims.generateFrameNumbers("methods_6_player_climb", { start: 40, end: 47 }),
        frameRate: 9,
        repeat: -1,
      });
    }
  }

  createRouteCues() {
    this.safePathGlow = this.add
      .ellipse(this.upPathPoint.x + 54, this.upPathPoint.y - 8, 180, 28, SAFE_GREEN, 0)
      .setDepth(1.05)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.dangerPathGlow = this.add
      .ellipse(this.downPathPoint.x + 250, this.downPathPoint.y - 5, 470, 32, DANGER_RED, 0)
      .setDepth(1.05)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.upMarker = this.add
      .text(this.upPathPoint.x, this.upPathPoint.y - 34, "up", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#bfe8ff",
        backgroundColor: "#07141faa",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setAlpha(0);
    this.downMarker = this.add
      .text(this.downPathPoint.x, this.downPathPoint.y - 34, "down", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#bfe8ff",
        backgroundColor: "#07141faa",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setAlpha(0);
    this.exitGlow = this.add
      .ellipse(this.exitPoint.x, this.exitPoint.y - 8, 120, 30, SAFE_GREEN, 0)
      .setDepth(1.08)
      .setBlendMode(Phaser.BlendModes.SCREEN);
  }

  createWaterGlints() {
    this.waterGlints = [];
    this.waterHazards.forEach((hazard, hazardIndex) => {
      const glintCount = Math.min(3, Math.max(1, Math.floor(hazard.width / 220)));
      for (let index = 0; index < glintCount; index += 1) {
        const glint = this.add
          .ellipse(
            hazard.x + ((index + 1) * hazard.width) / (glintCount + 1),
            hazard.y + Math.min(13, Math.max(7, hazard.height * 0.22)),
            18,
            4,
            0xa8ffff,
            0,
          )
          .setDepth(1.1)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.waterGlints.push(glint);
        this.tweens.add({
          targets: glint,
          alpha: { from: 0, to: 0.42 },
          scaleX: { from: 0.45, to: 1.35 },
          duration: 900 + hazardIndex * 70,
          delay: hazardIndex * 180 + index * 430,
          yoyo: true,
          repeat: -1,
          repeatDelay: 1800 + index * 240,
          ease: "Sine.easeInOut",
        });
      }
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
      .text(this.diwataPoint.x + 18, this.diwataPoint.y - 92, "Ask the path.", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d9fff1",
        backgroundColor: "#07141fde",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.05);
  }

  createPlayer() {
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "methods_6_player", 0)
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.9)
      .play("methods-6-player-idle");
  }

  createLabels() {
    this.returnValueText = this.add
      .text(this.valuePoint.x, this.valuePoint.y, "?", {
        fontFamily: "monospace",
        fontSize: "30px",
        fontStyle: "bold",
        color: "#bffaff",
        stroke: "#062636",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(2.1)
      .setAlpha(0.42);
    this.statusText = this.add
      .text(this.valuePoint.x, this.valuePoint.y + 38, "waiting", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#f3e6c4",
        backgroundColor: "#07141fde",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.1);
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
    this.sequenceMode = "success";
    this.statusText.setText("path returned").setColor("#bfffe5");
    this.diwataLabel.setText("The safe path answers.").setColor("#bfffe5");
    this.returnValueText.setText(RETURN_TEXT).setAlpha(1).setScale(0.5);
    this.tweens.add({
      targets: this.returnValueText,
      scale: 1,
      duration: 360,
      ease: "Back.easeOut",
    });
    this.createDiwataSafePathTrail();
    this.openSafePath();
  }

  createDiwataSafePathTrail() {
    const startX = this.diwataPoint.x + 28;
    const startY = this.diwataPoint.y - 74;
    const endX = this.upPathPoint.x + 34;
    const endY = this.upPathPoint.y - 18;
    const distance = Phaser.Math.Distance.Between(startX, startY, endX, endY);
    const angle = Phaser.Math.Angle.Between(startX, startY, endX, endY);
    const trail = this.add
      .rectangle(startX, startY, 2, 3, SAFE_BLUE, 0.86)
      .setOrigin(0, 0.5)
      .setRotation(angle)
      .setDepth(2.02)
      .setBlendMode(Phaser.BlendModes.ADD);
    const spark = this.add
      .circle(startX, startY, 4, SAFE_GREEN, 0.88)
      .setDepth(2.03)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.temporaryEffects.push(trail, spark);

    this.tweens.add({
      targets: trail,
      width: distance,
      duration: 520,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: trail,
          alpha: 0,
          duration: 260,
          onComplete: () => {
            Phaser.Utils.Array.Remove(this.temporaryEffects, trail);
            trail.destroy();
          },
        });
      },
    });
    this.tweens.add({
      targets: spark,
      x: endX,
      y: endY,
      scale: 1.45,
      duration: 560,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.tweens.add({
          targets: spark,
          alpha: 0,
          scale: 2.1,
          duration: 260,
          onComplete: () => {
            Phaser.Utils.Array.Remove(this.temporaryEffects, spark);
            spark.destroy();
          },
        });
      },
    });
  }

  openSafePath() {
    this.panTo(this.upPathPoint.x + 180, 650);
    this.tweens.add({
      targets: [this.safePathGlow, this.upMarker],
      alpha: 1,
      duration: 520,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: this.exitGlow,
      alpha: 0.42,
      scaleX: 1.14,
      scaleY: 1.18,
      duration: 760,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.downMarker,
      alpha: 0.32,
      duration: 380,
      ease: "Sine.easeOut",
    });
    this.schedule(700, () => this.walkSafeRoute());
  }

  walkSafeRoute() {
    this.routeTravelTargets = this.buildSafeRouteTargets();
    this.routeTargetIndex = 0;
    this.sequenceMode = "walkingRoute";
    this.player.setFlipX(false).play("methods-6-player-run", true);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
  }

  buildSafeRouteTargets() {
    return [
      { type: "run", x: this.upPathPoint.x, y: this.spawnPoint.y },
      { type: "climb", x: this.upPathPoint.x, y: this.upPathPoint.y },
      { type: "run", x: this.exitPoint.x, y: this.upPathPoint.y },
    ];
  }

  updateRouteMovement() {
    if (this.sequenceMode !== "walkingRoute" || !this.player) return;
    const target = this.routeTravelTargets?.[this.routeTargetIndex];
    if (!target) {
      this.finishSuccess();
      return;
    }

    if (target.type === "climb") {
      this.startRouteClimb(target);
      return;
    }

    this.player.play("methods-6-player-run", true);
    this.player.setFlipX(false);
    const dx = target.x - this.player.x;
    if (Math.abs(dx) <= 4) {
      this.player.setPosition(target.x, target.y);
      this.routeTargetIndex += 1;
      return;
    }

    const step = (PLAYER_SPEED * this.game.loop.delta) / 1000;
    this.player.y = target.y;
    this.player.x += Math.sign(dx) * Math.min(step, Math.abs(dx));
  }

  startRouteClimb(target) {
    this.sequenceMode = "climbingRoute";
    this.player.setFlipX(false);
    this.player.setX(target.x);
    this.player.play("methods-6-player-idle", true);

    this.schedule(120, () => {
      this.player.play("methods-6-player-climb", true);
      this.tweens.add({
        targets: this.player,
        y: target.y,
        duration: PLAYER_CLIMB_DURATION,
        ease: "Sine.easeInOut",
        onComplete: () => {
          this.player.setPosition(target.x, target.y);
          this.player.play("methods-6-player-idle", true);
          this.schedule(240, () => {
            this.routeTargetIndex += 1;
            this.player.play("methods-6-player-run", true);
            this.sequenceMode = "walkingRoute";
          });
        },
      });
    });
  }

  startFailure(message = "") {
    this.sequenceMode = "failure";
    const feedback = this.getFailureFeedback(message);
    this.statusText.setText(feedback.status).setColor("#ffb8b8");
    this.diwataLabel.setText(feedback.guide).setColor("#ffcccc");
    this.returnValueText
      .setText(feedback.wrongValue ? `"${feedback.wrongValue}"` : "?")
      .setAlpha(1)
      .setColor("#ffb8b8");
    this.player.play("methods-6-player-hurt", true);
    this.showWrongPathOverWater(feedback.wrongValue);
    this.flashDangerWater();
    this.createDangerSplashes();
    this.schedule(1120, () => {
      this.resetAttempt();
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message:
          message || 'Define GetSafePath(), return "up", then store GetSafePath() in path.',
      });
    });
  }

  getFailureFeedback(message = "") {
    const normalized = String(message).toLowerCase();
    if (normalized.includes("return string") || normalized.includes("not void")) {
      return { status: "wrong type", guide: "Use string." };
    }
    if (normalized.includes("define static string")) {
      return { status: "missing method", guide: "Define it first." };
    }
    if (normalized.includes('return "up"')) {
      return {
        status: "wrong path",
        guide: "The water is below.",
        wrongValue: this.extractReturnedString(),
      };
    }
    return { status: "path not stored", guide: "Store it." };
  }

  extractReturnedString() {
    const codeWithoutComments = (this.lastSourceCode ?? "").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
    const match = codeWithoutComments.match(/\breturn\s+"([^"]*)"\s*;/);
    if (!match || match[1] === "up") return null;
    return match[1];
  }

  flashDangerWater() {
    this.panTo(this.downPathPoint.x + 260, 520);
    this.tweens.add({
      targets: [this.dangerPathGlow, this.downMarker],
      alpha: 1,
      duration: 120,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
    });
    if (this.waterLayer) {
      this.tweens.add({
        targets: this.waterLayer,
        tint: 0xff9aa4,
        alpha: 0.68,
        duration: 120,
        yoyo: true,
        repeat: 5,
        ease: "Sine.easeInOut",
        onComplete: () => this.waterLayer.setTint(0xffffff).setAlpha(0.98),
      });
    }
  }

  showWrongPathOverWater(wrongValue) {
    if (!wrongValue) return;
    const primaryWater = this.waterHazards.find((hazard) =>
      hazard.name.toLowerCase().includes("water_hazard"),
    ) ?? this.waterHazards[0];
    const x = primaryWater
      ? primaryWater.x + primaryWater.width * 0.48
      : this.downPathPoint.x + 210;
    const y = primaryWater
      ? primaryWater.y - 28
      : this.downPathPoint.y - 24;
    const wrongText = this.add
      .text(x, y, `"${wrongValue}"`, {
        fontFamily: "monospace",
        fontSize: "20px",
        fontStyle: "bold",
        color: "#ffb8b8",
        stroke: "#2b050a",
        strokeThickness: 4,
        backgroundColor: "#07141fbb",
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.16);
    this.temporaryEffects.push(wrongText);
    this.tweens.add({
      targets: wrongText,
      y: y - 10,
      alpha: 0,
      scale: 1.18,
      duration: 850,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, wrongText);
        wrongText.destroy();
      },
    });
  }

  createDangerSplashes() {
    const primaryWater = this.waterHazards.find((hazard) =>
      hazard.name.toLowerCase().includes("water_hazard"),
    ) ?? this.waterHazards[0];
    const baseX = primaryWater
      ? primaryWater.x + primaryWater.width * 0.5
      : this.downPathPoint.x + 240;
    const baseY = primaryWater
      ? primaryWater.y + Math.min(16, Math.max(8, primaryWater.height * 0.35))
      : this.downPathPoint.y + 18;

    for (let index = 0; index < 16; index += 1) {
      const splash = this.add
        .ellipse(
          baseX + Phaser.Math.Between(-80, 80),
          baseY + Phaser.Math.Between(-4, 6),
          Phaser.Math.Between(4, 9),
          Phaser.Math.Between(2, 5),
          index % 2 === 0 ? 0xff7385 : 0xffc1c8,
          0.72,
        )
        .setDepth(1.4)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.temporaryEffects.push(splash);
      this.tweens.add({
        targets: splash,
        y: splash.y - Phaser.Math.Between(18, 46),
        x: splash.x + Phaser.Math.Between(-24, 24),
        alpha: 0,
        scaleX: 0.42,
        scaleY: 0.42,
        duration: Phaser.Math.Between(430, 760),
        delay: index * 22,
        ease: "Sine.easeOut",
        onComplete: () => {
          Phaser.Utils.Array.Remove(this.temporaryEffects, splash);
          splash.destroy();
        },
      });
    }
  }

  resetAttempt() {
    this.sequenceTimers.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.temporaryEffects.forEach((effect) => effect.destroy());
    this.temporaryEffects = [];
    this.tweens.killTweensOf([
      this.player,
      this.safePathGlow,
      this.dangerPathGlow,
      this.upMarker,
      this.downMarker,
      this.exitGlow,
      this.returnValueText,
      this.statusText,
      this.waterLayer,
    ]);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y).setAlpha(1).setTint(0xffffff);
    this.player.play("methods-6-player-idle", true);
    this.safePathGlow.setAlpha(0);
    this.dangerPathGlow.setAlpha(0);
    this.upMarker.setAlpha(this.openingPreviewPlayed ? 0.72 : 0).setColor("#bfe8ff");
    this.downMarker.setAlpha(this.openingPreviewPlayed ? 0.72 : 0).setColor("#bfe8ff");
    this.exitGlow.setAlpha(0).setScale(1);
    this.returnValueText.setText("?").setAlpha(0.42).setScale(1).setColor("#bffaff");
    this.statusText.setText("waiting").setColor("#f3e6c4");
    this.diwataLabel.setText("Ask the path.").setColor("#d9fff1");
    this.waterLayer?.setTint(0xffffff).setAlpha(0.98);
    this.sequenceMode = "idle";
    this.routeTravelTargets = [];
    this.routeTargetIndex = 0;
    this.cameras.main.stopFollow();
    this.panTo(this.spawnPoint.x, 240);
  }

  finishSuccess() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    this.cameras.main.stopFollow();
    this.player.play("methods-6-player-idle", true);
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: 'GetSafePath returned "up", Main stored it in path, and Kai crossed safely.',
      shouldProceed: true,
    });
  }

  playOpeningPreview() {
    this.openingPreviewPlayed = true;
    this.schedule(260, () => {
      if (this.sequenceMode !== "idle") return;
      this.statusText.setText("choose").setColor("#f3e6c4");
      this.panTo(this.upPathPoint.x + 120, 780);
      this.tweens.add({
        targets: this.upMarker,
        alpha: 0.72,
        duration: 420,
        ease: "Sine.easeOut",
      });
      this.pulsePath(this.safePathGlow, SAFE_BLUE, 0.28);
    });
    this.schedule(1320, () => {
      if (this.sequenceMode !== "idle") return;
      this.panTo(this.downPathPoint.x + 260, 760);
      this.tweens.add({
        targets: this.downMarker,
        alpha: 0.72,
        duration: 420,
        ease: "Sine.easeOut",
      });
      this.pulsePath(this.dangerPathGlow, DANGER_RED, 0.22);
    });
    this.schedule(2460, () => {
      if (this.sequenceMode !== "idle") return;
      this.statusText.setText("waiting").setColor("#f3e6c4");
      this.panTo(this.spawnPoint.x, 820);
    });
  }

  pulsePath(target, color, alpha) {
    target.setFillStyle(color, alpha);
    this.tweens.add({
      targets: target,
      alpha,
      scaleX: 1.1,
      scaleY: 1.18,
      duration: 360,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
      onComplete: () => target.setAlpha(0).setScale(1),
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

  resolveWaterHazards(map) {
    const hazards = [];
    ["hazzards", "hazards", "Hazards"].forEach((layerName) => {
      const layer = map.getObjectLayer(layerName);
      layer?.objects.forEach((object) => {
        const name = object.name?.trim() ?? "";
        if (!name.toLowerCase().includes("water")) return;
        hazards.push({
          name,
          x: object.x,
          y: object.y + this.offsetY,
          width: object.width || 0,
          height: object.height || 0,
        });
      });
    });
    return hazards;
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
    this.waterGlints?.forEach((glint) => glint.destroy());
  }
}
