import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";
import LayeredLpcCharacter from "../characters/LayeredLpcCharacter";
import { DIWATA_FAIRY_CONFIG } from "../characters/diwataFairyConfig";

const LEVEL_NUMBER = 28;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const MAP_KEY = "functions_arrays_level_3_restore_warding_grid";
const MAP_PATH =
  `${ASSET_BASE}/maps/functions-arrays-level-3-restore-warding-grid.tmj`;
const PLAYER_IDLE_KEY = "functions-arrays-3-player-idle";
const PLAYER_RUN_KEY = "functions-arrays-3-player-run";
const PORTAL_ANIM_KEY = "functions-arrays-3-exit-seal";
const GRID_VALUES = [
  [1, 0],
  [0, 1],
];
const RUNE_FILES = ["Rune7.png", "Rune8.png", "Rune6.png", "Rune7.png"];

export default class FunctionsArraysRestoreWardingGridScene extends Phaser.Scene {
  constructor() {
    super("FunctionsArraysRestoreWardingGridScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("fa3_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image(
      "fa3_post_tall",
      `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze/Lamp-Post-2-TALL.png`,
    );
    this.load.image(
      "fa3_post_short",
      `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze/Lamp-Post-2-SHORT.png`,
    );
    this.load.image("fa3_decor", `${GH_BASE}/Decor.png`);
    this.load.image("fa3_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("fa3_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("fa3_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("fa3_exit", `${ASSET_BASE}/other/exit_sign.png`);
    RUNE_FILES.forEach((fileName, index) => {
      this.load.image(`fa3_rune_${index}`, `${ASSET_BASE}/other/Runes/${fileName}`);
    });
    this.load.spritesheet(
      "fa3_portal",
      `${GH_BASE}/Animated_Sprites/GandalfHardcore_Portal_sheet.png`,
      { frameWidth: 64, frameHeight: 64 },
    );
    this.load.spritesheet(
      "fa3_player",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
    [1, 2, 3, 4, 5].forEach((number) => {
      this.load.image(
        `fa3_bg${number}`,
        `${BG_BASE}/GandalfHardcore_Background_layers_layer_${number}.png`,
      );
    });
  }

  create() {
    this.map = this.make.tilemap({ key: MAP_KEY });
    this.offsetY = this.scale.height - this.map.heightInPixels;
    this.mode = "idle";
    this.failureCount = 0;
    this.timers = [];
    this.effects = [];
    this.idleRuneTweens = [];

    this.createBackgrounds();
    this.createTileLayers();
    this.createAnimations();
    this.createGlowTexture();
    this.points = this.resolveMapObjects();
    this.spawnPoint = this.points.player_spawn ?? { x: 79, y: 322 };
    this.diwataPoint = this.points.diwata_spawn ?? { x: 248, y: 298 };
    this.gridPoint = this.points.ward_grid ?? { x: 560, y: 268 };
    this.methodPoint = this.points.grid_method_point ?? { x: 532, y: 110 };
    this.sealPoint = this.points.exit_seal ?? { x: 1036, y: 315 };
    this.exitPoint = this.points.level_exit ?? { x: 1164, y: 301 };
    this.unsafeFloor = this.points.unsafe_floor ?? {
      x: this.gridPoint.x - 88,
      y: this.spawnPoint.y - 10,
      width: this.sealPoint.x - this.gridPoint.x + 148,
      height: 18,
    };

    this.createUnsafeFloor();
    this.createGrid();
    this.createCharacters();
    this.createExitSeal();
    this.setupCamera();
    this.startReadingGuide();

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  createBackgrounds() {
    [
      ["fa3_bg5", 0.08, -8, 0.72, 0],
      ["fa3_bg4", 0.14, -7, 0.64, 0],
      ["fa3_bg3", 0.3, -6, 0.58, 88],
      ["fa3_bg2", 0.54, -5, 0.56, 174],
      ["fa3_bg1", 0.8, -4, 0.48, 224],
    ].forEach(([key, factor, depth, alpha, y]) => {
      this.add
        .tileSprite(0, y, this.map.widthInPixels, this.scale.height - y, key)
        .setOrigin(0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x24384b)
        .setAlpha(alpha);
    });
    this.add
      .rectangle(0, 0, this.map.widthInPixels, 576, 0x06101a, 0.3)
      .setOrigin(0)
      .setDepth(-3);
  }

  createTileLayers() {
    const tilesets = [
      this.map.addTilesetImage("Floor_Tiles2", "fa3_floor"),
      this.map.addTilesetImage("Lamp Post 2 TALL", "fa3_post_tall"),
      this.map.addTilesetImage("Lamp Post 2 SHORT", "fa3_post_short"),
      this.map.addTilesetImage("Decor", "fa3_decor"),
      this.map.addTilesetImage("Garden_Decorations", "fa3_garden"),
      this.map.addTilesetImage("Pine_Trees", "fa3_pines"),
      this.map.addTilesetImage("Pine_forest_sheet", "fa3_forest"),
      this.map.addTilesetImage("exit_sign", "fa3_exit"),
    ].filter(Boolean);

    ["platform", "trees", "decoration", "front_decoration"].forEach(
      (name, index) => {
        const layer = this.map.createLayer(name, tilesets, 0, this.offsetY);
        if (layer) layer.setDepth(0.05 + index * 0.24);
      },
    );
  }

  createAnimations() {
    if (!this.anims.exists(PLAYER_IDLE_KEY)) {
      this.anims.create({
        key: PLAYER_IDLE_KEY,
        frames: this.anims.generateFrameNumbers("fa3_player", {
          start: 0,
          end: 5,
        }),
        frameRate: 6,
        repeat: -1,
      });
    }
    if (!this.anims.exists(PLAYER_RUN_KEY)) {
      this.anims.create({
        key: PLAYER_RUN_KEY,
        frames: this.anims.generateFrameNumbers("fa3_player", {
          start: 16,
          end: 23,
        }),
        frameRate: 12,
        repeat: -1,
      });
    }
    if (!this.anims.exists(PORTAL_ANIM_KEY)) {
      this.anims.create({
        key: PORTAL_ANIM_KEY,
        frames: this.anims.generateFrameNumbers("fa3_portal", {
          start: 0,
          end: 7,
        }),
        frameRate: 9,
        repeat: -1,
      });
    }
  }

  createGlowTexture() {
    if (this.textures.exists("fa3_ward_glow")) return;
    const texture = this.textures.createCanvas("fa3_ward_glow", 128, 128);
    const context = texture.getContext();
    const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
    gradient.addColorStop(0, "rgba(208,255,249,0.95)");
    gradient.addColorStop(0.35, "rgba(82,223,220,0.45)");
    gradient.addColorStop(1, "rgba(31,125,151,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    texture.refresh();
  }

  createUnsafeFloor() {
    const zone = this.unsafeFloor;
    const width = Math.max(zone.width || 0, 420);
    const height = Math.max(zone.height || 0, 14);
    const x = zone.x + width / 2;
    const y = zone.y + height / 2;
    this.floorCorruption = this.add
      .rectangle(x, y, width, height, 0x59234f, 0.2)
      .setStrokeStyle(1, 0xb2487b, 0.28)
      .setDepth(0.94);
    this.floorWardLine = this.add
      .rectangle(x, y - height / 2, width, 2, 0xa54876, 0.34)
      .setDepth(0.95)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: [this.floorCorruption, this.floorWardLine],
      alpha: { from: 0.45, to: 0.9 },
      duration: 1250,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createGrid() {
    const cellSize = 58;
    const gap = 6;
    const total = cellSize * 2 + gap;
    const left = this.gridPoint.x - total / 2;
    const top = this.gridPoint.y - total / 2;

    this.gridGlow = this.add
      .image(this.gridPoint.x, this.gridPoint.y, "fa3_ward_glow")
      .setScale(1.42)
      .setAlpha(0.1)
      .setDepth(1.01)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.gridFrame = this.add
      .rectangle(this.gridPoint.x, this.gridPoint.y, total + 16, total + 16, 0x07141e, 0.78)
      .setStrokeStyle(2, 0x6c8e9d, 0.52)
      .setDepth(1.02);

    this.cells = [];
    GRID_VALUES.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        const index = rowIndex * 2 + columnIndex;
        const x = left + columnIndex * (cellSize + gap) + cellSize / 2;
        const y = top + rowIndex * (cellSize + gap) + cellSize / 2;
        const panel = this.add
          .rectangle(x, y, cellSize, cellSize, 0x111722, 0.94)
          .setStrokeStyle(1, 0x546575, 0.62)
          .setDepth(1.05);
        const glow = this.add
          .image(x, y, "fa3_ward_glow")
          .setScale(0.52)
          .setAlpha(0)
          .setDepth(1.07)
          .setBlendMode(Phaser.BlendModes.ADD);
        const rune = this.add
          .image(x, y + 2, `fa3_rune_${index}`)
          .setAlpha(0.92)
          .setDepth(1.1);
        const runeScale = Math.min(42 / rune.width, 46 / rune.height);
        rune.setScale(runeScale);
        const valueText = this.add
          .text(x - 22, y - 23, "", {
            fontFamily: "monospace",
            fontSize: "9px",
            color: "#91a5ad",
            backgroundColor: "#050d15c7",
            padding: { x: 3, y: 1 },
          })
          .setOrigin(0.5)
          .setDepth(1.2);
        const selectionMarker =
          value === 1
            ? this.add
                .text(x + 19, y - 19, "*", {
                  fontFamily: "monospace",
                  fontSize: "12px",
                  fontStyle: "bold",
                  color: "#bdefff",
                  stroke: "#0b4458",
                  strokeThickness: 2,
                })
                .setOrigin(0.5)
                .setAlpha(0.82)
                .setDepth(1.22)
            : null;
        this.cells.push({
          index,
          row: rowIndex,
          column: columnIndex,
          value,
          x,
          y,
          panel,
          glow,
          rune,
          valueText,
          selectionMarker,
        });
      });
    });

    this.columnLabels = [0, 1].map((column) =>
      this.add
        .text(
          left + column * (cellSize + gap) + cellSize / 2,
          top - 13,
          `[${column}]`,
          {
            fontFamily: "monospace",
            fontSize: "9px",
            color: "#829ba6",
          },
        )
        .setOrigin(0.5)
        .setAlpha(0.72)
        .setDepth(1.21),
    );
    this.rowLabels = [0, 1].map((row) =>
      this.add
        .text(
          left - 13,
          top + row * (cellSize + gap) + cellSize / 2,
          `[${row}]`,
          {
            fontFamily: "monospace",
            fontSize: "9px",
            color: "#829ba6",
          },
        )
        .setOrigin(0.5)
        .setAlpha(0.72)
        .setDepth(1.21),
    );
    this.cells.filter((cell) => cell.value === 1).forEach((cell) => {
      this.startBlueShimmer(cell);
    });

    this.methodLabel = this.add
      .text(this.methodPoint.x, this.methodPoint.y, "RestoreGrid(grid)", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#a9c4c9",
        backgroundColor: "#07131dcc",
        padding: { x: 7, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(1.5);
    this.methodLink = this.add.graphics().setDepth(1.03);
    this.methodLink.lineStyle(1, 0x75d8de, 0.28);
    this.methodLink.beginPath();
    this.methodLink.moveTo(this.methodPoint.x, this.methodPoint.y + 14);
    this.methodLink.lineTo(this.gridPoint.x, top - 10);
    this.methodLink.strokePath();
    this.gridStatus = this.add
      .text(this.gridPoint.x, top + total + 17, "BLUE = 1   OTHER = 0", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#9fcad7",
        backgroundColor: "#07131db8",
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(1.42);
  }

  createCharacters() {
    this.diwataAura = this.add
      .ellipse(this.diwataPoint.x, this.diwataPoint.y - 34, 70, 92, 0x79efcb, 0.08)
      .setDepth(1.2);
    this.diwata = new LayeredLpcCharacter(
      this,
      this.diwataPoint.x,
      this.diwataPoint.y - 8,
      DIWATA_FAIRY_CONFIG,
      { scale: 1.25, direction: "right", animationName: "idle" },
    ).setDepth(1.65);
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "fa3_player")
      .setOrigin(0.5, 1)
      .setScale(2)
      .setDepth(1.72)
      .play(PLAYER_IDLE_KEY);
  }

  createExitSeal() {
    this.exitSealGlow = this.add
      .ellipse(this.sealPoint.x, this.sealPoint.y - 42, 74, 116, 0x5f407c, 0.15)
      .setDepth(1.34);
    this.exitSeal = this.add
      .sprite(this.sealPoint.x, this.sealPoint.y + 2, "fa3_portal")
      .setOrigin(0.5, 1)
      .setScale(1.22)
      .setTint(0x6e5c8b)
      .setAlpha(0.56)
      .setDepth(1.42)
      .play(PORTAL_ANIM_KEY);
  }

  onCodeEvaluated({ levelNumber, isCorrect, message, values }) {
    if (Number(levelNumber) !== LEVEL_NUMBER || this.mode !== "idle") return;
    if (isCorrect) {
      this.restoreGrid(values?.grid ?? GRID_VALUES);
      return;
    }
    this.runFailure(message, values?.grid);
  }

  restoreGrid(values) {
    this.playSfx?.("energyCharge");
    this.mode = "restoring";
    this.stopBlueShimmer();
    this.diwata.playAnimation("spellcast", "right");
    this.methodLabel.setColor("#d5fbff");
    const selectedCount = values.flat().filter((value) => value === 1).length;
    this.gridStatus
      .setText(`${selectedCount}/4 BLUE SELECTED`)
      .setColor("#9edce2");
    this.sendMethodSignal(() => this.restoreRows(values));
  }

  sendMethodSignal(onComplete) {
    const token = this.add
      .text(this.methodPoint.x, this.methodPoint.y + 22, "grid", {
        fontFamily: "monospace",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#c8fbff",
        stroke: "#1e6571",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(2.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.effects.push(token);
    this.emitTrail(
      { x: this.methodPoint.x, y: this.methodPoint.y + 18 },
      { x: this.gridPoint.x, y: this.gridPoint.y },
    );
    this.tweens.add({
      targets: token,
      x: this.gridPoint.x,
      y: this.gridPoint.y,
      scale: { from: 0.9, to: 1.25 },
      alpha: { from: 1, to: 0.15 },
      duration: 700,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.destroyEffect(token);
        onComplete();
      },
    });
  }

  restoreRows(values) {
    this.gridStatus.setText("RESTORING ROWS");
    [0, 1].forEach((row, rowIndex) => {
      this.schedule(rowIndex * 580, () => {
        const rowCells = this.cells.filter((cell) => cell.row === row);
        this.flashBand(rowCells, "row");
        rowCells.forEach((cell, cellIndex) => {
          this.schedule(cellIndex * 150, () => {
            this.revealCellValue(
              cell,
              values[row]?.[cell.column] ?? cell.value,
            );
            this.activateCell(cell, false);
          });
        });
      });
    });
    this.schedule(1320, () => this.restoreColumns());
  }

  restoreColumns() {
    this.gridStatus.setText("VERIFYING COLUMNS");
    [0, 1].forEach((column, columnIndex) => {
      this.schedule(columnIndex * 520, () => {
        const columnCells = this.cells.filter((cell) => cell.column === column);
        this.flashBand(columnCells, "column");
        columnCells.forEach((cell) => this.activateCell(cell, true));
      });
    });
    this.schedule(1240, () => this.completeRestoration());
  }

  flashBand(cells, direction) {
    const xs = cells.map((cell) => cell.x);
    const ys = cells.map((cell) => cell.y);
    const width = direction === "row" ? Math.max(...xs) - Math.min(...xs) + 58 : 58;
    const height = direction === "column" ? Math.max(...ys) - Math.min(...ys) + 58 : 58;
    const band = this.add
      .rectangle(
        (Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...ys) + Math.max(...ys)) / 2,
        width,
        height,
        0x75eef0,
        0.12,
      )
      .setStrokeStyle(1, 0xc5ffff, 0.72)
      .setDepth(1.24)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.effects.push(band);
    this.tweens.add({
      targets: band,
      alpha: { from: 0.1, to: 0.7 },
      scaleX: direction === "row" ? { from: 0.2, to: 1 } : 1,
      scaleY: direction === "column" ? { from: 0.2, to: 1 } : 1,
      duration: 310,
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => this.destroyEffect(band),
    });
  }

  activateCell(cell, verificationPass) {
    this.playSfx?.("magicPulse", { rate: Phaser.Math.FloatBetween(0.97, 1.03) });
    cell.panel
      .setFillStyle(verificationPass ? 0x123934 : 0x132f38, 0.96)
      .setStrokeStyle(verificationPass ? 2 : 1, 0x9cf9ee, 0.9);
    cell.rune.setTint(cell.value === 1 ? 0xc7f6ff : 0xffffff).setAlpha(1);
    cell.valueText.setColor(cell.value === 1 ? "#bcefff" : "#d8dde2");
    this.tweens.add({
      targets: cell.glow,
      alpha: { from: 0, to: verificationPass ? 0.72 : 0.48 },
      scale: { from: 0.3, to: verificationPass ? 0.67 : 0.58 },
      duration: 300,
      yoyo: !verificationPass,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: cell.rune,
      scaleX: cell.rune.scaleX * 1.06,
      scaleY: cell.rune.scaleY * 1.06,
      duration: 150,
      yoyo: true,
      ease: "Sine.easeOut",
    });
    if (cell.value === 1 && !verificationPass) {
      this.playTone(760 + cell.index * 35, 0.024);
      this.schedule(70, () => this.playTone(980 + cell.index * 35, 0.017));
    } else {
      this.playTone(
        verificationPass ? 620 + cell.column * 90 : 440 + cell.row * 80,
        0.02,
      );
    }
  }

  revealCellValue(cell, value) {
    cell.valueText.setText("");
    const token = this.add
      .text(cell.x, cell.y, String(value), {
        fontFamily: "monospace",
        fontSize: "16px",
        fontStyle: "bold",
        color: value === 1 ? "#c8f6ff" : "#e0e4e8",
        stroke: "#07131d",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(2.1);
    this.effects.push(token);
    this.tweens.add({
      targets: token,
      x: cell.valueText.x,
      y: cell.valueText.y,
      scale: { from: 1.2, to: 0.62 },
      duration: 320,
      ease: "Sine.easeOut",
      onComplete: () => {
        cell.valueText.setText(String(value));
        this.destroyEffect(token);
      },
    });
  }

  completeRestoration() {
    this.playSfx?.("magicActivate");
    this.diwata.playIdle("right");
    this.gridStatus.setText("2/4 BLUE - WARD RESTORED").setColor("#baffdf");
    this.gridFrame.setStrokeStyle(2, 0xa9fff1, 0.95);
    this.drawSelectedConnection();
    this.tweens.add({
      targets: this.gridGlow,
      alpha: 0.52,
      scale: 1.65,
      duration: 520,
      ease: "Sine.easeOut",
    });
    this.floorCorruption.setFillStyle(0x3ed0a1, 0.13).setStrokeStyle(1, 0x8effd9, 0.48);
    this.floorWardLine.setFillStyle(0x9affdd, 0.75);
    this.tweens.killTweensOf([this.floorCorruption, this.floorWardLine]);
    this.tweens.add({
      targets: [this.floorCorruption, this.floorWardLine],
      alpha: { from: 0.25, to: 0.9 },
      duration: 480,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
    this.playCompletionChord();
    this.schedule(700, () => this.dissolveSeal());
  }

  dissolveSeal() {
    this.exitSeal.setTint(0xa9fff1).setAlpha(0.85);
    this.exitSealGlow.setFillStyle(0x75e9dc, 0.3);
    this.tweens.add({
      targets: [this.exitSeal, this.exitSealGlow],
      alpha: 0,
      scaleX: 0.72,
      scaleY: 1.28,
      duration: 720,
      ease: "Sine.easeIn",
      onComplete: () => this.runPlayerToExit(),
    });
  }

  runPlayerToExit() {
    this.mode = "exiting";
    this.player.setFlipX(false).play(PLAYER_RUN_KEY, true);
    this.cameras.main.startFollow(this.player, true, 0.05, 0.05);
    this.tweens.add({
      targets: this.player,
      x: this.exitPoint.x,
      duration: 2800,
      ease: "Linear",
      onComplete: () => {
        this.player.play(PLAYER_IDLE_KEY, true);
        this.mode = "complete";
        gameEvents.emit(GAME_LEVEL_OUTCOME, {
          levelNumber: LEVEL_NUMBER,
          status: "success",
          message: "The warding grid was restored and the shrine floor is safe.",
          shouldProceed: true,
        });
      },
    });
  }

  runFailure(message, submittedGrid) {
    this.mode = "failure";
    this.failureCount += 1;
    this.stopBlueShimmer();
    this.methodLabel.setColor("#ff9bb0");
    this.gridStatus.setText("WARD FLICKER").setColor("#f08da3");
    const hasSubmittedCells = Array.isArray(submittedGrid) && submittedGrid.length > 0;
    const incorrectCells = hasSubmittedCells
      ? this.cells.filter(
          (cell) =>
            Number(submittedGrid[cell.row]?.[cell.column]) !== cell.value,
        )
      : [];
    incorrectCells.forEach((cell, index) => {
      this.schedule(index * 90, () => {
        cell.panel.setStrokeStyle(1, 0xff5e82, 0.82);
        cell.rune.setTint(0xbd496c);
        cell.valueText
          .setText(String(submittedGrid[cell.row]?.[cell.column] ?? "?"))
          .setColor("#ff9bb0");
        this.tweens.add({
          targets: [cell.panel, cell.rune],
          alpha: { from: 0.28, to: 0.95 },
          duration: 90,
          yoyo: true,
          repeat: 2,
        });
      });
    });
    if (incorrectCells.length === 0) {
      this.gridFrame.setStrokeStyle(2, 0xff5e82, 0.85);
      this.tweens.add({
        targets: this.gridFrame,
        alpha: { from: 0.35, to: 1 },
        duration: 110,
        yoyo: true,
        repeat: 2,
      });
    }
    this.tweens.add({
      targets: [this.floorCorruption, this.floorWardLine],
      alpha: { from: 0.35, to: 1 },
      duration: 110,
      yoyo: true,
      repeat: 3,
    });
    this.playTone(185, 0.035, "sawtooth");

    this.schedule(760, () => {
      this.cells.forEach((cell) => {
        cell.panel.setFillStyle(0x111722, 0.94).setStrokeStyle(1, 0x546575, 0.62);
        cell.rune.clearTint().setAlpha(0.92);
        cell.valueText.setText("");
      });
      this.gridFrame.setStrokeStyle(2, 0x6c8e9d, 0.52).setAlpha(1);
      this.methodLabel.setColor("#a9c4c9");
      this.gridStatus.setText("BLUE = 1   OTHER = 0").setColor("#9fcad7");
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message:
          `${
            message ||
            "The ward flickered unevenly. Check the int[,] parameter, grid declaration and method call."
          }${
            this.failureCount >= 2
              ? " Check row order before changing the method."
              : ""
          }`,
      });
      this.mode = "idle";
      this.cells.filter((cell) => cell.value === 1).forEach((cell) => {
        this.startBlueShimmer(cell);
      });
    });
  }

  startReadingGuide() {
    const runGuide = () => {
      if (this.mode !== "idle") return;
      [0, 1].forEach((row, rowIndex) => {
        this.schedule(rowIndex * 620, () => {
          if (this.mode !== "idle") return;
          const rowCells = this.cells.filter((cell) => cell.row === row);
          this.flashReadingRow(rowCells, row);
        });
      });
    };
    this.schedule(1500, runGuide);
    const guideTimer = this.time.addEvent({
      delay: 6200,
      callback: runGuide,
      loop: true,
    });
    this.timers.push(guideTimer);
  }

  flashReadingRow(cells, row) {
    const startX = Math.min(...cells.map((cell) => cell.x)) - 24;
    const endX = Math.max(...cells.map((cell) => cell.x)) + 24;
    const y = cells[0].y;
    const guide = this.add
      .circle(startX, y, 3, 0x9de9f3, 0.9)
      .setDepth(1.3)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.effects.push(guide);
    this.tweens.add({
      targets: guide,
      x: endX,
      alpha: { from: 0.25, to: 0.9 },
      duration: 520,
      ease: "Sine.easeInOut",
      onComplete: () => this.destroyEffect(guide),
    });
    this.tweens.add({
      targets: [...cells.map((cell) => cell.panel), this.rowLabels[row]],
      alpha: { from: 0.62, to: 1 },
      duration: 260,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
  }

  startBlueShimmer(cell) {
    cell.glow.setAlpha(0.06).setTint(0x62dfff);
    const glowTween = this.tweens.add({
      targets: cell.glow,
      alpha: { from: 0.05, to: 0.2 },
      scale: { from: 0.46, to: 0.55 },
      duration: 1350,
      delay: cell.index * 260,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    const runeTween = this.tweens.add({
      targets: cell.rune,
      alpha: { from: 0.82, to: 1 },
      duration: 1500,
      delay: 180 + cell.index * 240,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    const markerTween = cell.selectionMarker
      ? this.tweens.add({
          targets: cell.selectionMarker,
          alpha: { from: 0.55, to: 1 },
          scale: { from: 0.86, to: 1.08 },
          duration: 940,
          delay: 120 + cell.index * 210,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        })
      : null;
    this.idleRuneTweens.push(
      glowTween,
      runeTween,
      ...(markerTween ? [markerTween] : []),
    );
  }

  stopBlueShimmer() {
    this.idleRuneTweens.forEach((tween) => tween.stop());
    this.idleRuneTweens.length = 0;
  }

  drawSelectedConnection() {
    const selectedCells = this.cells.filter((cell) => cell.value === 1);
    if (selectedCells.length < 2) return;
    const connection = this.add.graphics().setDepth(1.08).setAlpha(0);
    connection.lineStyle(8, 0x4adff2, 0.12);
    connection.beginPath();
    connection.moveTo(selectedCells[0].x, selectedCells[0].y);
    connection.lineTo(selectedCells[1].x, selectedCells[1].y);
    connection.strokePath();
    connection.lineStyle(2, 0xc5fbff, 0.88);
    connection.beginPath();
    connection.moveTo(selectedCells[0].x, selectedCells[0].y);
    connection.lineTo(selectedCells[1].x, selectedCells[1].y);
    connection.strokePath();
    this.effects.push(connection);
    this.tweens.add({
      targets: connection,
      alpha: { from: 0, to: 1 },
      duration: 360,
      yoyo: true,
      hold: 440,
      ease: "Sine.easeInOut",
      onComplete: () => this.destroyEffect(connection),
    });
  }

  emitTrail(from, to) {
    Array.from({ length: 9 }, (_, index) => {
      const mote = this.add
        .circle(
          from.x + Phaser.Math.Between(-3, 3),
          from.y + Phaser.Math.Between(-3, 3),
          Phaser.Math.FloatBetween(1.2, 2.6),
          index % 2 === 0 ? 0xa8ffff : 0xffdf89,
          0.82,
        )
        .setDepth(2.4)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.effects.push(mote);
      this.tweens.add({
        targets: mote,
        x: to.x + Phaser.Math.Between(-6, 6),
        y: to.y + Phaser.Math.Between(-6, 6),
        alpha: 0,
        duration: 360 + index * 22,
        delay: index * 22,
        ease: "Sine.easeInOut",
        onComplete: () => this.destroyEffect(mote),
      });
      return mote;
    });
  }

  playTone(frequency, volume, type = "sine") {
    const context = this.sound?.context;
    if (!context || context.state === "closed") return;
    if (context.state === "suspended") context.resume().catch(() => {});
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.28);
  }

  playCompletionChord() {
    [392, 523.25, 659.25, 783.99].forEach((frequency, index) => {
      this.schedule(index * 85, () => this.playTone(frequency, 0.023));
    });
  }

  resolveMapObjects() {
    const points = {};
    this.map.objects.forEach((layer) => {
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

  setupCamera() {
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.scale.height);
    this.cameras.main.scrollX = 0;
  }

  schedule(delay, callback) {
    const timer = this.time.delayedCall(delay, callback);
    this.timers.push(timer);
    return timer;
  }

  destroyEffect(effect) {
    if (!effect?.active) return;
    Phaser.Utils.Array.Remove(this.effects, effect);
    effect.destroy();
  }

  cleanup() {
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.timers.forEach((timer) => timer.remove(false));
    this.effects.forEach((effect) => effect.destroy());
    this.stopBlueShimmer();
    this.diwata?.destroy();
  }
}
