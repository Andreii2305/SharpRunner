import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";

const LEVEL_NUMBER = 10;
const PLAYER_SCALE = 2;
const PLAYER_WALK_SPEED = 150;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_ASSET_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const GH_BG_BASE = `${GH_ASSET_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const LEVEL_MAP_KEY = "arrays_level_5_warding_grid";
const LEVEL_MAP_PATH = `${ASSET_BASE}/maps/arrays-level-5-warding-tile-grid.tmj`;
const RUNE_FRAME_SIZE = 160;
const ACTIVE_RUNE_FRAME = 3;
const DECOY_RUNE_FRAMES = [0, 1, 2, 4, 5, 6, 7, 8];
const ACTIVE_RUNE_SCALE = 0.32;
const DECOY_RUNE_SCALE = 0.32;
const MANANGY_FRAME_SIZE = 256;
const EXPECTED_WARD = [
  [1, 0, 1],
  [0, 1, 0],
  [1, 0, 1],
];
const SPIRIT_DEFAULT_LINE = "You can't pass through this ward.";
const SPIRIT_TAUNTS = [
  "The ward reads your array.",
  "Wrong numbers, wrong path.",
  "Find the burning pattern.",
];
const PLAYER_ANIMATIONS = [
  { key: "player-idle-arrays-5", start: 0, end: 5, frameRate: 6, repeat: -1 },
  { key: "player-run-arrays-5", start: 16, end: 23, frameRate: 12, repeat: -1 },
  { key: "player-death-arrays-5", start: 40, end: 47, frameRate: 10, repeat: 0 },
];

const indexOffset = (rowIndex, colIndex) => (rowIndex * 120) + (colIndex * 80);

export default class ArraysLevelFiveScene extends Phaser.Scene {
  constructor() {
    super("ArraysLevelFiveScene");
  }

  preload() {
    this.load.spritesheet(
      "player_sheet_blue",
      `${ASSET_BASE}/characters/players/char_blue.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    this.load.spritesheet(
      "arrays_5_manangy_idle",
      `${ASSET_BASE}/characters/monsters/Manangy-fly_idle.png`,
      { frameWidth: MANANGY_FRAME_SIZE, frameHeight: MANANGY_FRAME_SIZE },
    );
    this.load.tilemapTiledJSON(LEVEL_MAP_KEY, LEVEL_MAP_PATH);
    this.load.image("arrays_5_floor_tiles", `${GH_ASSET_BASE}/Floor_Tiles2.png`);
    this.load.image("arrays_5_decor_tiles", `${GH_ASSET_BASE}/Decor.png`);
    this.load.image("arrays_5_garden_decor_tiles", `${GH_ASSET_BASE}/Garden_Decorations.png`);
    this.load.image("arrays_5_pine_trees_tiles", `${GH_ASSET_BASE}/Pine_Trees.png`);
    this.load.image("arrays_5_house_tiles", `${GH_ASSET_BASE}/House_Tiles.png`);
    this.load.image("arrays_5_other_tiles_2", `${GH_ASSET_BASE}/Other_Tiles2.png`);
    this.load.image("arrays_5_pine_forest_tiles", `${GH_ASSET_BASE}/Pine_forest_sheet.png`);
    this.load.image("arrays_5_large_tent_tiles", `${GH_ASSET_BASE}/Large_Tent.png`);
    this.load.image(
      "arrays_5_lamp_post_tall",
      `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze/Lamp-Post-2-TALL.png`,
    );
    this.load.image(
      "arrays_5_lamp_post_short",
      `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze/Lamp-Post-2-SHORT.png`,
    );
    this.load.image("arrays_5_bg5", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("arrays_5_bg_castle", `${GH_BG_BASE}/Background_Castle.png`);
    this.load.image("arrays_5_bg4", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("arrays_5_bg3", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("arrays_5_bg2", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("arrays_5_bg1", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
    this.load.spritesheet("arrays_5_runes", `${ASSET_BASE}/other/Runes/Runes.png`, {
      frameWidth: RUNE_FRAME_SIZE,
      frameHeight: RUNE_FRAME_SIZE,
    });
  }

  create() {
    this.scale.resize(1024, 576);
    const map = this.make.tilemap({ key: LEVEL_MAP_KEY });
    const offsetY = this.scale.height - map.heightInPixels;

    this.createParallaxBackgrounds(map);
    this.createPlayerAnimations();
    this.createTileMapLayers(map, offsetY);
    this.points = this.resolveMapPoints(map, offsetY);

    this.gridCellSize = 58;
    this.spawnPoint = this.points.player_spawn ?? { x: 96, y: 448 + offsetY };
    const gridPoint = this.points.ward_grid ?? { x: 509, y: 414 + offsetY };
    this.gridOrigin = {
      x: gridPoint.x - (this.gridCellSize * 1.5),
      y: gridPoint.y - (this.gridCellSize * 3) - 18,
    };
    this.spiritPoint = this.points.spirit_spawn ?? { x: 897, y: 426 + offsetY };
    this.exitPoint = this.points.level_exit ?? { x: 1162, y: 421 + offsetY };
    this.floorY = this.spawnPoint.y;
    this.sequenceTimers = [];
    this.sequenceMode = "idle";

    this.createSceneLabels();
    this.createWardGrid();
    this.createSpirit();
    this.createWardBarrier();
    this.createPlayer();
    this.startSpiritTaunts();

    this.cameras.main.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setBackgroundColor("#050916");
    this.player.play("player-idle-arrays-5");

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);
  }

  update() {
    if (!this.player) return;

    if (this.sequenceMode === "walkingToExit") {
      this.player.x += (PLAYER_WALK_SPEED * this.game.loop.delta) / 1000;
      this.player.setFlipX(false);
      this.playAnimation("player-run-arrays-5");
      if (this.player.x >= this.exitPoint.x) {
        this.finishSuccessSequence();
      }
      return;
    }

    if (this.sequenceMode === "idle") {
      this.playAnimation("player-idle-arrays-5");
    }
  }

  createParallaxBackgrounds(map) {
    const worldWidth = map?.widthInPixels ?? 1280;
    const backgrounds = [
      { key: "arrays_5_bg5", factor: 0.08, depth: -8, alpha: 0.82, y: 0 },
      { key: "arrays_5_bg_castle", factor: 0.08, depth: -7, alpha: 0.35, y: 0 },
      { key: "arrays_5_bg4", factor: 0.12, depth: -6, alpha: 0.7, y: 0 },
      { key: "arrays_5_bg3", factor: 0.35, depth: -5, alpha: 0.68, y: 90 },
      { key: "arrays_5_bg2", factor: 0.62, depth: -4, alpha: 0.62, y: 184 },
      { key: "arrays_5_bg1", factor: 0.82, depth: -3, alpha: 0.56, y: 230 },
    ];

    backgrounds.forEach(({ key, factor, depth, alpha, y }) => {
      this.add
        .tileSprite(0, y, worldWidth, this.scale.height - y, key)
        .setOrigin(0, 0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x223f57)
        .setAlpha(alpha);
    });

    this.add
      .rectangle(0, 0, worldWidth, this.scale.height, 0x030711, 0.34)
      .setOrigin(0, 0)
      .setDepth(-2);
  }

  createTileMapLayers(map, offsetY) {
    const floorTileset = map.addTilesetImage("Floor_Tiles2", "arrays_5_floor_tiles");
    const decorTileset = map.addTilesetImage("Decor", "arrays_5_decor_tiles");
    const gardenDecorTileset = map.addTilesetImage(
      "Garden_Decorations",
      "arrays_5_garden_decor_tiles",
    );
    const pineTreesTileset = map.addTilesetImage("Pine_Trees", "arrays_5_pine_trees_tiles");
    const houseTileset = map.addTilesetImage("House_Tiles", "arrays_5_house_tiles");
    const otherTileset = map.addTilesetImage("Other_Tiles2", "arrays_5_other_tiles_2");
    const pineForestTileset = map.addTilesetImage(
      "Pine_forest_sheet",
      "arrays_5_pine_forest_tiles",
    );
    const largeTentTileset = map.addTilesetImage("Large_Tent", "arrays_5_large_tent_tiles");
    const lampPostTallTileset = map.addTilesetImage(
      "Lamp Post 2 TALL",
      "arrays_5_lamp_post_tall",
    );
    const lampPostShortTileset = map.addTilesetImage(
      "Lamp Post 2 SHORT",
      "arrays_5_lamp_post_short",
    );
    const allTilesets = [
      floorTileset,
      decorTileset,
      gardenDecorTileset,
      pineTreesTileset,
      houseTileset,
      otherTileset,
      pineForestTileset,
      largeTentTileset,
      lampPostTallTileset,
      lampPostShortTileset,
    ].filter(Boolean);

    this.createVisualTileLayer(map, "trees", allTilesets, offsetY, 0.02, 0x8fa2b8, 0.82);
    this.platformLayer = this.createVisualTileLayer(map, "platform", allTilesets, offsetY, 0.12, 0xffffff, 1);
    this.createVisualTileLayer(map, "decoration", allTilesets, offsetY, 0.2, 0xc9d3e1, 0.92);
    this.createVisualTileLayer(map, "front_decoration", allTilesets, offsetY, 1.35, 0xdde6f2, 0.96);
  }

  createVisualTileLayer(map, layerName, tilesets, offsetY, depth, tint, alpha) {
    const layer = map.createLayer(layerName, tilesets, 0, offsetY);
    if (!layer) return null;
    layer.setDepth(depth);
    layer.setAlpha(alpha);
    layer.setTint(tint);
    return layer;
  }

  resolveMapPoints(map, offsetY) {
    const points = {};
    ["objects", "Objects", "triggers", "Triggers", "hazzards", "hazards", "Hazards"].forEach(
      (layerName) => {
        const layer = map.getObjectLayer(layerName);
        if (!layer) return;
        layer.objects.forEach((obj) => {
          const name = obj.name?.trim();
          if (!name) return;
          points[name] = {
            x: obj.x + (obj.width || 0) / 2,
            y: obj.y + offsetY + (obj.height || 0),
          };
        });
      },
    );
    return points;
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

    if (!this.anims.exists("arrays-5-manangy-idle")) {
      this.anims.create({
        key: "arrays-5-manangy-idle",
        frames: this.anims.generateFrameNumbers("arrays_5_manangy_idle", {
          start: 0,
          end: 24,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }
  }

  createSceneLabels() {
  }

  createWardGrid() {
    this.cells = [];
    const gridWidth = this.gridCellSize * 3;
    const gridHeight = this.gridCellSize * 3;
    const gridCenterX = this.gridOrigin.x + gridWidth / 2;
    const gridCenterY = this.gridOrigin.y + gridHeight / 2;

    this.gridGlow = this.add
      .ellipse(
        gridCenterX,
        gridCenterY,
        gridWidth + 96,
        gridHeight + 78,
        0xffd45a,
        0.045,
      )
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(0.3);

    this.gridPlate = this.add
      .rectangle(gridCenterX, gridCenterY, gridWidth + 16, gridHeight + 16, 0x050914, 0.58)
      .setStrokeStyle(2, 0x49606e, 0.3)
      .setDepth(0.68);

    this.xTrace = this.add.graphics().setDepth(0.74).setAlpha(0.26);
    this.xTrace.lineStyle(1, 0xfff1a4, 0.38);
    this.xTrace.strokeRect(this.gridOrigin.x - 3, this.gridOrigin.y - 3, gridWidth + 6, gridHeight + 6);
    this.successTrace = this.add.graphics().setDepth(0.86).setAlpha(0);
    this.rowScanner = this.add
      .rectangle(gridCenterX, this.gridOrigin.y + this.gridCellSize / 2, gridWidth + 12, this.gridCellSize - 8, 0x9ff4ff, 0.12)
      .setStrokeStyle(1, 0xc9fbff, 0.42)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(0.94)
      .setAlpha(0);

    EXPECTED_WARD.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        const x = this.gridOrigin.x + colIndex * this.gridCellSize;
        const y = this.gridOrigin.y + rowIndex * this.gridCellSize;
        const centerX = x + this.gridCellSize / 2;
        const centerY = y + this.gridCellSize / 2;
        const isActive = value === 1;
        const frame = isActive
          ? ACTIVE_RUNE_FRAME
          : Phaser.Utils.Array.GetRandom(DECOY_RUNE_FRAMES);
        const cell = this.add
          .rectangle(centerX, centerY, this.gridCellSize - 7, this.gridCellSize - 7, 0x111522, 0.62)
          .setOrigin(0.5)
          .setStrokeStyle(1, 0x4c5870, 0.5)
          .setDepth(0.76);
        const aura = this.add
          .ellipse(centerX, centerY, 64, 54, 0x7aa3d6, 0.055)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(0.8);
        const coreGlow = this.add
          .ellipse(centerX, centerY + 1, 34, 28, 0xc4d8ff, 0.028)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(0.84);
        const rune = this.add
          .sprite(centerX, centerY, "arrays_5_runes", frame)
          .setOrigin(0.5)
          .setScale(isActive ? ACTIVE_RUNE_SCALE : DECOY_RUNE_SCALE)
          .setDepth(0.88)
          .setAlpha(0.94)
          .setTint(isActive ? 0xf2d77a : 0xffffff);
        const valueText = this.add
          .text(centerX, centerY + 23, String(value), {
            fontFamily: "monospace",
            fontSize: "13px",
            color: "#fff0ad",
            backgroundColor: "rgba(4, 9, 18, 0.68)",
            padding: { x: 5, y: 1 },
          })
          .setOrigin(0.5)
          .setAlpha(0)
          .setDepth(1);

        this.cells.push({
          rowIndex,
          colIndex,
          value,
          frame,
          cell,
          rune,
          aura,
          coreGlow,
          valueText,
        });

        this.tweens.add({
          targets: rune,
          y: centerY - 1,
          duration: 2200 + indexOffset(rowIndex, colIndex),
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      });
    });
  }

  createSpirit() {
    this.spirit = this.add
      .container(this.spiritPoint.x, this.spiritPoint.y - 76)
      .setDepth(1.1);
    this.spiritAura = this.add
      .ellipse(0, -2, 138, 162, 0xa9eaff, 0.13)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.spiritShadow = this.add
      .ellipse(0, 74, 106, 18, 0x02050a, 0.4);
    this.spiritSprite = this.add
      .sprite(0, 0, "arrays_5_manangy_idle", 0)
      .setOrigin(0.5)
      .setScale(0.55)
      .setFlipX(true);
    this.spiritSprite.play("arrays-5-manangy-idle");
    this.spirit.add([this.spiritAura, this.spiritShadow, this.spiritSprite]);
    this.spiritLabel = this.add
      .text(this.spiritPoint.x, this.spiritPoint.y - 166, SPIRIT_DEFAULT_LINE, {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#c9f7ff",
        backgroundColor: "rgba(4, 9, 18, 0.72)",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(1.2);
    this.startSpiritMotion();
  }

  startSpiritMotion() {
    this.tweens.add({
      targets: this.spirit,
      y: this.spirit.y - 9,
      duration: 1350,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.spiritAura,
      alpha: { from: 0.08, to: 0.2 },
      scaleX: { from: 0.92, to: 1.08 },
      scaleY: { from: 0.92, to: 1.06 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createWardBarrier() {
    const barrierX = this.spiritPoint.x - 90;
    const barrierY = this.floorY - 78;

    this.wardBarrier = this.add.container(barrierX, barrierY).setDepth(1.05);
    this.barrierCore = this.add
      .rectangle(0, 0, 10, 148, 0x9fefff, 0.12)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.barrierGlow = this.add
      .ellipse(0, 0, 58, 164, 0x76dcff, 0.075)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.barrierLines = this.add.graphics().setAlpha(0.42);
    this.drawBarrierLines();
    this.wardBarrier.add([this.barrierGlow, this.barrierCore, this.barrierLines]);
    this.startBarrierPulse();
  }

  startBarrierPulse() {
    this.tweens.add({
      targets: [this.barrierCore, this.barrierGlow, this.barrierLines],
      alpha: { from: 0.18, to: 0.46 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  drawBarrierLines() {
    this.barrierLines.clear();
    this.barrierLines.lineStyle(2, 0xaef7ff, 0.38);
    [-8, 0, 8].forEach((xOffset, lineIndex) => {
      this.barrierLines.beginPath();
      for (let y = -72; y <= 72; y += 12) {
        const x = xOffset + Math.sin((y + lineIndex * 18) / 18) * 3;
        if (y === -72) {
          this.barrierLines.moveTo(x, y);
        } else {
          this.barrierLines.lineTo(x, y);
        }
      }
      this.barrierLines.strokePath();
    });
  }

  startSpiritTaunts() {
    this.tauntIndex = 0;
    this.tauntTimer = this.time.addEvent({
      delay: 4200,
      loop: true,
      callback: () => {
        if (this.sequenceMode !== "idle") return;
        const line = SPIRIT_TAUNTS[this.tauntIndex % SPIRIT_TAUNTS.length];
        this.tauntIndex += 1;
        this.setSpiritLine(line);
      },
    });
  }

  setSpiritLine(text, color = "#c9f7ff") {
    this.spiritLabel?.setText(text).setColor(color).setAlpha(1);
  }

  createPlayer() {
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "player_sheet_blue")
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.2);
  }

  onCodeEvaluated({ levelNumber, isCorrect, values, message }) {
    if (levelNumber !== LEVEL_NUMBER) return;
    this.resetAttemptState();
    this.playRowScan(() => {
      if (isCorrect) {
        this.startSuccessSequence();
        return;
      }

      this.startFailureSequence(values?.ward, message);
    });
  }

  resetAttemptState() {
    this.sequenceTimers?.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.tweens.killTweensOf([
      this.player,
      this.gridGlow,
      this.gridPlate,
      this.xTrace,
      this.successTrace,
      this.rowScanner,
      this.wardBarrier,
      this.barrierCore,
      this.barrierGlow,
      this.barrierLines,
      this.spirit,
      this.spiritAura,
      this.spiritLabel,
    ]);
    this.cells?.forEach(({ value, frame, rowIndex, colIndex, cell, rune, aura, coreGlow, valueText }) => {
      const isActive = value === 1;
      const centerY = this.gridOrigin.y + rowIndex * this.gridCellSize + this.gridCellSize / 2;
      this.tweens.killTweensOf([cell, rune, aura, coreGlow, valueText]);
      cell
        .setFillStyle(0x111522, 0.62)
        .setStrokeStyle(1, 0x4c5870, 0.5)
        .setScale(1);
      rune
        .setFrame(frame)
        .setY(centerY)
        .setScale(isActive ? ACTIVE_RUNE_SCALE : DECOY_RUNE_SCALE)
        .setAlpha(0.94)
        .setTint(isActive ? 0xf2d77a : 0xffffff);
      aura
        .setFillStyle(0x7aa3d6, 0.055)
        .setAlpha(0.055)
        .setScale(1);
      coreGlow
        .setFillStyle(0xc4d8ff, 0.028)
        .setAlpha(0.028)
        .setScale(1);
      valueText.setText(String(value)).setAlpha(0).setColor("#fff0ad");

      this.tweens.add({
        targets: rune,
        y: centerY - 1,
        duration: 2200 + indexOffset(rowIndex, colIndex),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });
    this.gridGlow?.setAlpha(0.045).setScale(1);
    this.gridPlate?.setFillStyle(0x050914, 0.58).setStrokeStyle(2, 0x49606e, 0.3).setScale(1);
    this.xTrace?.setAlpha(0.26);
    this.successTrace?.clear().setAlpha(0).setScale(1);
    this.rowScanner?.setAlpha(0).setScale(1);
    this.wardBarrier?.setAlpha(1).setScale(1);
    this.barrierCore?.setAlpha(0.18).setScale(1);
    this.barrierGlow?.setAlpha(0.075).setScale(1);
    this.barrierLines?.setAlpha(0.42).setScale(1);
    this.startBarrierPulse();
    this.spirit?.setPosition(this.spiritPoint.x, this.spiritPoint.y - 76).setAlpha(1).setScale(1);
    this.spiritSprite?.setScale(0.55).setFlipX(true).clearTint().setAlpha(1);
    this.spiritAura?.setFillStyle(0xa9eaff, 0.13).setAlpha(0.13).setScale(1);
    this.startSpiritMotion();
    this.setSpiritLine(SPIRIT_DEFAULT_LINE);
    this.spiritLabel?.setScale(1);
    this.sequenceMode = "idle";
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y).setAlpha(1);
    this.playAnimation("player-idle-arrays-5");
  }

  playRowScan(onComplete) {
    this.sequenceMode = "scanning";
    this.setSpiritLine("The shrine reads your rows.", "#dfffea");
    const rowCenters = [0, 1, 2].map(
      (rowIndex) => this.gridOrigin.y + rowIndex * this.gridCellSize + this.gridCellSize / 2,
    );

    rowCenters.forEach((rowY, rowIndex) => {
      this.schedule(rowIndex * 180, () => {
        this.rowScanner
          ?.setY(rowY)
          .setAlpha(0.08)
          .setScale(1);
        this.tweens.add({
          targets: this.rowScanner,
          alpha: { from: 0.08, to: 0.42 },
          scaleX: { from: 0.96, to: 1.02 },
          duration: 130,
          yoyo: true,
          ease: "Sine.easeInOut",
        });
      });
    });

    this.schedule(rowCenters.length * 180 + 180, () => {
      this.rowScanner?.setAlpha(0).setScale(1);
      onComplete?.();
    });
  }

  startSuccessSequence() {
    this.sequenceMode = "restoring";
    this.drawSuccessTrace();
    this.setSpiritLine("The ward breaks... no!", "#fff0ad");

    this.cells.forEach((cellData, index) => {
      this.schedule(index * 130, () => {
        const shouldGlow = cellData.value === 1;
        cellData.cell
          .setFillStyle(shouldGlow ? 0x3d2c0d : 0x0b1018, shouldGlow ? 0.96 : 0.54)
          .setStrokeStyle(shouldGlow ? 2 : 1, shouldGlow ? 0xffdf79 : 0x334256, shouldGlow ? 0.95 : 0.36);
        cellData.rune
          .setFrame(cellData.frame)
          .setAlpha(shouldGlow ? 1 : 0.44)
          .setTint(shouldGlow ? 0xfff1a6 : 0x6f7b8f);
        cellData.aura
          .setFillStyle(shouldGlow ? 0xffd161 : 0x50647c, shouldGlow ? 0.36 : 0.035)
          .setAlpha(shouldGlow ? 0.36 : 0.035)
          .setScale(1);
        cellData.coreGlow
          .setFillStyle(shouldGlow ? 0xfff0ad : 0x6e8098, shouldGlow ? 0.2 : 0.018)
          .setAlpha(shouldGlow ? 0.2 : 0.018)
          .setScale(1);
        cellData.valueText.setText(String(cellData.value)).setAlpha(1);
        this.tweens.add({
          targets: [cellData.cell, cellData.aura, cellData.coreGlow, cellData.valueText],
          scaleX: shouldGlow ? 1.015 : 0.995,
          scaleY: shouldGlow ? 1.015 : 0.995,
          duration: 140,
          yoyo: true,
          ease: "Sine.easeOut",
        });
        this.tweens.add({
          targets: cellData.rune,
          scaleX: shouldGlow ? ACTIVE_RUNE_SCALE * 1.015 : DECOY_RUNE_SCALE * 0.995,
          scaleY: shouldGlow ? ACTIVE_RUNE_SCALE * 1.015 : DECOY_RUNE_SCALE * 0.995,
          duration: 140,
          yoyo: true,
          ease: "Sine.easeOut",
        });
      });
    });

    this.schedule(this.cells.length * 130 + 620, () => {
      this.tweens.add({
        targets: this.successTrace,
        alpha: { from: 0.18, to: 0.88 },
        scaleX: { from: 0.99, to: 1.015 },
        scaleY: { from: 0.99, to: 1.015 },
        duration: 520,
        yoyo: true,
        repeat: 1,
        ease: "Sine.easeInOut",
      });
      this.tweens.add({
        targets: this.gridGlow,
        alpha: 0.34,
        scaleX: 1.02,
        scaleY: 1.015,
        duration: 520,
        yoyo: true,
        ease: "Sine.easeInOut",
      });
      this.tweens.add({
        targets: this.wardBarrier,
        alpha: 0,
        scaleY: 0.2,
        duration: 520,
        ease: "Sine.easeInOut",
      });
      this.tweens.add({
        targets: [this.spirit, this.spiritLabel],
        x: "+=80",
        y: "-=28",
        alpha: 0,
        scaleX: 0.7,
        scaleY: 0.7,
        duration: 680,
        ease: "Back.easeIn",
        onComplete: () => {
          this.sequenceMode = "walkingToExit";
          this.player.x = Math.max(this.player.x, 170);
        },
      });
    });
  }

  drawSuccessTrace() {
    if (!this.successTrace) return;
    const first = this.gridCellSize / 2;
    const last = this.gridCellSize * 2.5;
    const x1 = this.gridOrigin.x + first;
    const x2 = this.gridOrigin.x + last;
    const y1 = this.gridOrigin.y + first;
    const y2 = this.gridOrigin.y + last;

    this.successTrace.clear();
    this.successTrace.lineStyle(10, 0xffd15f, 0.12);
    this.successTrace.beginPath();
    this.successTrace.moveTo(x1, y1);
    this.successTrace.lineTo(x2, y2);
    this.successTrace.moveTo(x2, y1);
    this.successTrace.lineTo(x1, y2);
    this.successTrace.strokePath();
    this.successTrace.lineStyle(3, 0xfff2b6, 0.62);
    this.successTrace.beginPath();
    this.successTrace.moveTo(x1, y1);
    this.successTrace.lineTo(x2, y2);
    this.successTrace.moveTo(x2, y1);
    this.successTrace.lineTo(x1, y2);
    this.successTrace.strokePath();
    this.successTrace.setPosition(0, 0).setScale(1).setAlpha(0.18);
  }

  startFailureSequence(submittedWard, validationMessage = "") {
    this.sequenceMode = "failure";
    this.setSpiritLine(this.getFailureLine(submittedWard, validationMessage), "#ffc5c5");
    const submittedRows = Array.isArray(submittedWard) ? submittedWard : [];
    this.cells.forEach((cellData, index) => {
      const submittedValue = submittedRows[cellData.rowIndex]?.[cellData.colIndex];
      const isRight = submittedValue === cellData.value;
      this.schedule(index * 60, () => {
        cellData.cell.setFillStyle(isRight ? 0x183121 : 0x652431, 0.92);
        cellData.cell.setStrokeStyle(2, isRight ? 0x5fd38a : 0xff8585, 0.9);
        cellData.rune.setTint(isRight ? 0xa7ffb6 : 0xff7777).setAlpha(0.86);
        cellData.aura.setFillStyle(isRight ? 0x5fd38a : 0xff5555, 0.34).setAlpha(0.34);
        cellData.coreGlow.setFillStyle(isRight ? 0xbaffcf : 0xff9b9b, 0.22).setAlpha(0.22);
        cellData.valueText.setText(submittedValue ?? "?").setColor(isRight ? "#baffcf" : "#ffc5c5").setAlpha(1);
        this.tweens.add({
          targets: [cellData.cell, cellData.rune, cellData.aura, cellData.coreGlow],
          alpha: { from: 0.62, to: 1 },
          duration: 130,
          yoyo: true,
          repeat: 1,
          ease: "Sine.easeOut",
        });
      });
    });

    this.tweens.add({
      targets: this.spirit,
      x: this.spirit.x - 26,
      duration: 120,
      yoyo: true,
      repeat: 3,
      ease: "Sine.easeInOut",
    });
    this.player.play("player-death-arrays-5", true);
    this.schedule(760, () => {
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message: "The ward pattern is wrong. Use a 3x3 int[,] grid with the required 1 and 0 cells.",
      });
    });
    this.schedule(1250, () => {
      if (this.sequenceMode !== "failure") return;
      this.restoreWardDisplayAfterFailure();
      this.setSpiritLine(SPIRIT_DEFAULT_LINE);
      this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y).setAlpha(1);
      this.playAnimation("player-idle-arrays-5");
      this.sequenceMode = "idle";
    });
  }

  getFailureLine(submittedWard, validationMessage = "") {
    const normalizedMessage = validationMessage.toLowerCase();
    if (
      normalizedMessage.includes("unexpected array") ||
      normalizedMessage.includes("only \"ward\"") ||
      normalizedMessage.includes("exactly one 2d")
    ) {
      return "The shrine does not know that name.";
    }
    if (
      normalizedMessage.includes("rows") ||
      normalizedMessage.includes("columns") ||
      !Array.isArray(submittedWard)
    ) {
      return "That ward has the wrong shape.";
    }
    if (normalizedMessage.includes("integer")) {
      return "The ward only accepts numbers.";
    }
    return "The pattern is close, but not enough.";
  }

  restoreWardDisplayAfterFailure() {
    this.cells?.forEach(({ value, frame, rowIndex, colIndex, cell, rune, aura, coreGlow, valueText }) => {
      const isActive = value === 1;
      const centerY = this.gridOrigin.y + rowIndex * this.gridCellSize + this.gridCellSize / 2;
      this.tweens.killTweensOf([cell, rune, aura, coreGlow, valueText]);
      cell
        .setFillStyle(0x111522, 0.62)
        .setStrokeStyle(1, 0x4c5870, 0.5)
        .setAlpha(1)
        .setScale(1);
      rune
        .setFrame(frame)
        .setY(centerY)
        .setScale(isActive ? ACTIVE_RUNE_SCALE : DECOY_RUNE_SCALE)
        .setAlpha(0.94)
        .setTint(isActive ? 0xf2d77a : 0xffffff);
      aura
        .setFillStyle(0x7aa3d6, 0.055)
        .setAlpha(0.055)
        .setScale(1);
      coreGlow
        .setFillStyle(0xc4d8ff, 0.028)
        .setAlpha(0.028)
        .setScale(1);
      valueText.setAlpha(0);
      this.tweens.add({
        targets: rune,
        y: centerY - 1,
        duration: 2200 + indexOffset(rowIndex, colIndex),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });
  }

  finishSuccessSequence() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    this.playAnimation("player-idle-arrays-5");
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: "Warding grid restored. Arrays Level 5 cleared.",
      shouldProceed: true,
    });
  }

  schedule(delay, callback) {
    const timer = this.time.delayedCall(delay, callback);
    this.sequenceTimers.push(timer);
    return timer;
  }

  playAnimation(key) {
    if (!this.player || this.player.anims.currentAnim?.key === key) return;
    this.player.play(key, true);
  }

  cleanupScene() {
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.tauntTimer?.remove(false);
    this.sequenceTimers?.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
  }
}
