import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";
import LayeredLpcCharacter from "../characters/LayeredLpcCharacter";
import { DIWATA_FAIRY_CONFIG } from "../characters/diwataFairyConfig";

const LEVEL_NUMBER = 29;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const MAP_KEY = "functions_arrays_level_4_ancient_cemetery";
const MAP_PATH = `${ASSET_BASE}/maps/functions-arrays-level-4-ancient-cemetery.tmj`;
const GRAVE_VALUES = [
  [1, 0, 1, 1],
  [0, 1, 0, 1],
  [1, 1, 0, 0],
];
const BLESSED_COUNT = GRAVE_VALUES.flat().filter((value) => value === 1).length;

const HUD_STYLE = {
  fontFamily: 'Consolas, "Courier New", monospace',
  fontSize: "12px",
  color: "#c8dbe7",
};

export default class FunctionsArraysAncientCemeteryScene extends Phaser.Scene {
  constructor() {
    super("FunctionsArraysAncientCemeteryScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("fa4_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("fa4_decor", `${GH_BASE}/Decor.png`);
    this.load.image("fa4_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("fa4_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("fa4_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("fa4_other_tiles", `${GH_BASE}/Other_Tiles2.png`);
    this.load.image("fa4_other_tiles_flipped", `${GH_BASE}/Other_Tiles2(Flipped).png`);
    this.load.image("fa4_exit", `${ASSET_BASE}/other/exit_sign.png`);
    this.load.image(
      "fa4_release_moon",
      `${ASSET_BASE}/other/Moon_Phases_Alt_128x128/Moon_Phase_1_Alt.png`,
    );
    this.load.image(
      "fa4_post_tall",
      `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze/Lamp-Post-2-TALL.png`,
    );
    this.load.image(
      "fa4_post_short",
      `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze/Lamp-Post-2-SHORT.png`,
    );
    this.load.spritesheet(
      "fa4_player",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    [1, 2, 3, 4, 5].forEach((number) => {
      this.load.image(
        `cemetery-tomb-${number}`,
        `${ASSET_BASE}/other/tombstone/tomb${number}.png`,
      );
      this.load.image(
        `fa4_bg${number}`,
        `${BG_BASE}/GandalfHardcore_Background_layers_layer_${number}.png`,
      );
    });
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
  }

  create() {
    this.map = this.make.tilemap({ key: MAP_KEY });
    this.offsetY = this.scale.height - this.map.heightInPixels;
    this.mode = "idle";
    this.timers = [];
    this.effects = [];
    this.spirits = [];
    this.corruptionEffects = [];

    [1, 2, 3, 4, 5].forEach((number) => {
      this.textures
        .get(`cemetery-tomb-${number}`)
        .setFilter(Phaser.Textures.FilterMode.NEAREST);
    });

    this.createBackgrounds();
    this.createTileLayers();
    this.createAnimations();
    this.createGlowTexture();
    this.points = this.resolveMapObjects();
    this.spawnPoint = this.points.player_spawn ?? { x: 80, y: 387 };
    this.guidePoint = this.points.guide_spawn ?? { x: 246, y: 363 };
    this.exitPoint = this.points.level_complete ?? { x: 1200, y: 384 };
    this.releasePoint = this.points.spirit_release_focus ?? { x: 640, y: 54 };
    this.floorY = this.spawnPoint.y;

    this.createAtmosphere();
    this.createCemeteryRows();
    this.createReleaseSky();
    this.createCharacters();
    this.createScanHud();
    this.setupCamera();

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  createBackgrounds() {
    [
      ["fa4_bg5", 0.08, -8, 0.66, 0],
      ["fa4_bg4", 0.14, -7, 0.58, 0],
      ["fa4_bg3", 0.3, -6, 0.5, 88],
      ["fa4_bg2", 0.55, -5, 0.48, 174],
      ["fa4_bg1", 0.82, -4, 0.42, 224],
    ].forEach(([key, factor, depth, alpha, y]) => {
      this.add
        .tileSprite(0, y, this.map.widthInPixels, this.scale.height - y, key)
        .setOrigin(0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x1a2b3c)
        .setAlpha(alpha);
    });
    this.add
      .rectangle(0, 0, this.map.widthInPixels, 576, 0x020811, 0.4)
      .setOrigin(0)
      .setDepth(-3);
  }

  createTileLayers() {
    const tilesets = [
      this.map.addTilesetImage("Floor_Tiles2", "fa4_floor"),
      this.map.addTilesetImage("Lamp Post 2 TALL", "fa4_post_tall"),
      this.map.addTilesetImage("Lamp Post 2 SHORT", "fa4_post_short"),
      this.map.addTilesetImage("Decor", "fa4_decor"),
      this.map.addTilesetImage("Garden_Decorations", "fa4_garden"),
      this.map.addTilesetImage("Pine_Trees", "fa4_pines"),
      this.map.addTilesetImage("Pine_forest_sheet", "fa4_forest"),
      this.map.addTilesetImage("Other_Tiles2", "fa4_other_tiles"),
      this.map.addTilesetImage("Other_Tiles2(Flipped)", "fa4_other_tiles_flipped"),
      this.map.addTilesetImage("exit_sign", "fa4_exit"),
    ].filter(Boolean);
    ["platform", "trees", "decoration", "front_decoration"].forEach(
      (name, index) => {
        const layer = this.map.createLayer(name, tilesets, 0, this.offsetY);
        if (!layer) return;
        layer.setDepth(0.05 + index * 0.24);
        if (name === "decoration") layer.setTint(0x77786f);
        if (name === "front_decoration") layer.setTint(0x686b65);
      },
    );
  }

  createAnimations() {
    [
      ["fa4-player-idle", 0, 5, 6, -1],
      ["fa4-player-run", 16, 23, 12, -1],
    ].forEach(([key, start, end, frameRate, repeat]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("fa4_player", { start, end }),
        frameRate,
        repeat,
      });
    });
  }

  createGlowTexture() {
    if (this.textures.exists("fa4_cemetery_glow")) return;
    const texture = this.textures.createCanvas("fa4_cemetery_glow", 128, 128);
    const context = texture.getContext();
    const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 62);
    gradient.addColorStop(0, "rgba(226,250,255,0.98)");
    gradient.addColorStop(0.25, "rgba(78,198,255,0.58)");
    gradient.addColorStop(1, "rgba(34,103,190,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    texture.refresh();
  }

  createAtmosphere() {
    this.fog = Array.from({ length: 7 }, (_, index) => {
      const cloud = this.add
        .ellipse(
          90 + index * 190,
          390 - (index % 2) * 48,
          220,
          34,
          0x9ab2c0,
          0.035,
        )
        .setDepth(1.08);
      this.tweens.add({
        targets: cloud,
        x: cloud.x + 90,
        alpha: { from: 0.02, to: 0.07 },
        duration: 6000 + index * 480,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      return cloud;
    });
  }

  createCemeteryRows() {
    this.rowHighlights = [];
    this.graves = [];
    for (let row = 0; row < GRAVE_VALUES.length; row += 1) {
      const rowPoints = GRAVE_VALUES[row].map((_, column) =>
        this.points[`grave_${row}_${column}`],
      );
      const availablePoints = rowPoints.filter(Boolean);
      const baseline = availablePoints[0]?.y ?? 192 + row * 96;
      const left = Math.min(...availablePoints.map((point) => point.x));
      const right = Math.max(...availablePoints.map((point) => point.x));
      const highlight = this.add
        .rectangle((left + right) / 2, baseline - 25, right - left + 62, 58, 0x5cb7d8, 0)
        .setStrokeStyle(1, 0x8bdcf2, 0)
        .setDepth(1.12);
      const rowLabel = this.add
        .text(left - 48, baseline - 48, `ROW ${row}`, {
          ...HUD_STYLE,
          fontSize: "10px",
          color: "#718e9c",
        })
        .setDepth(1.8);
      this.rowHighlights.push({ highlight, rowLabel });

      GRAVE_VALUES[row].forEach((value, column) => {
        const point = rowPoints[column] ?? {
          x: 512 + column * 64,
          y: baseline,
        };
        const glow = this.add
          .image(point.x, point.y - 23, "fa4_cemetery_glow")
          .setScale(0.48)
          .setAlpha(0)
          .setDepth(1.2)
          .setBlendMode(Phaser.BlendModes.ADD);
        const tomb = this.add
          .image(point.x, point.y, `cemetery-tomb-${((row * 4 + column) % 5) + 1}`)
          .setOrigin(0.5, 1)
          .setScale(0.9)
          .setDepth(1.5);
        const coordinate = this.add
          .text(point.x, point.y - 55, `[${row},${column}]`, {
            ...HUD_STYLE,
            fontSize: "9px",
            color: "#6f8792",
            backgroundColor: "#06101999",
            padding: { x: 3, y: 2 },
          })
          .setOrigin(0.5)
          .setDepth(1.8);
        const valueText = this.add
          .text(point.x, point.y - 39, "", {
            ...HUD_STYLE,
            fontSize: "11px",
            color: "#e6f7ff",
          })
          .setOrigin(0.5)
          .setDepth(1.9);
        this.graves.push({ row, column, value, point, tomb, glow, coordinate, valueText });
      });
    }
  }

  createReleaseSky() {
    const moonX = this.releasePoint.x + 205;
    this.moonHalo = this.add
      .image(moonX, this.releasePoint.y + 18, "fa4_cemetery_glow")
      .setScale(0.82)
      .setAlpha(0.08)
      .setDepth(-2.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.releaseMoon = this.add
      .image(moonX, this.releasePoint.y + 18, "fa4_release_moon")
      .setScale(0.68)
      .setAlpha(0.58)
      .setDepth(-2.4);
    this.tweens.add({
      targets: [this.releaseMoon, this.moonHalo],
      y: "+=3",
      duration: 5200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.heavenGlow = this.add
      .image(this.releasePoint.x, this.releasePoint.y, "fa4_cemetery_glow")
      .setScale(1.35, 0.62)
      .setAlpha(0)
      .setDepth(1.25)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.releaseLabel = this.add
      .text(this.releasePoint.x, this.releasePoint.y + 48, "", {
        ...HUD_STYLE,
        fontSize: "10px",
        color: "#d9f7ff",
      })
      .setOrigin(0.5)
      .setDepth(2);
  }

  createCharacters() {
    this.diwataAura = this.add
      .ellipse(this.guidePoint.x, this.guidePoint.y - 34, 70, 92, 0x77e9ce, 0.07)
      .setDepth(1.25);
    this.diwata = new LayeredLpcCharacter(
      this,
      this.guidePoint.x,
      this.guidePoint.y - 8,
      DIWATA_FAIRY_CONFIG,
      { scale: 1.25, direction: "right", animationName: "idle" },
    ).setDepth(1.65);
    this.player = this.add
      .sprite(this.spawnPoint.x, this.floorY, "fa4_player")
      .setOrigin(0.5, 1)
      .setScale(2)
      .setDepth(1.72)
      .play("fa4-player-idle");
  }

  createScanHud() {
    this.hud = this.add.container(18, 18).setScrollFactor(0).setDepth(20);
    const panel = this.add.rectangle(0, 0, 218, 92, 0x06121c, 0.92).setOrigin(0).setStrokeStyle(1, 0x4e788d, 0.8);
    const title = this.add.text(12, 9, "CEMETERY SCAN", {
      ...HUD_STYLE,
      color: "#d8edf6",
      fontSize: "11px",
    });
    this.hudRow = this.add.text(12, 30, "Current Row       -", HUD_STYLE);
    this.hudColumn = this.add.text(12, 45, "Current Column    -", HUD_STYLE);
    this.hudBlessed = this.add.text(12, 60, "Blessed Spirits   0", HUD_STYLE);
    this.hudProgress = this.add.text(12, 75, "Progress           0 / 12", HUD_STYLE);
    this.hud.add([panel, title, this.hudRow, this.hudColumn, this.hudBlessed, this.hudProgress]);
    this.scanReadout = this.add
      .text(420, 38, "Every row. Every column.", {
        ...HUD_STYLE,
        color: "#9cb8c5",
        backgroundColor: "#061019cc",
        padding: { x: 7, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(20)
      .setOrigin(0.5);
  }

  layoutCameraUi(width) {
    if (!this.hud || !this.scanReadout) return;
    const compact = width < 520;
    this.hud.setScale(compact ? 0.82 : 1).setPosition(18, 18);
    this.scanReadout.setPosition(
      Phaser.Math.Clamp(width / 2, compact ? 120 : 150, Math.max(120, width - 120)),
      compact ? 108 : 38,
    );
  }

  onCodeEvaluated({ levelNumber, isCorrect, message, values }) {
    if (Number(levelNumber) !== LEVEL_NUMBER || this.mode !== "idle") return;
    this.clearScanState();
    if (isCorrect) {
      this.startCompleteScan(values?.graves ?? GRAVE_VALUES, values?.blessed ?? BLESSED_COUNT);
      return;
    }
    this.startFailedScan(message, values ?? {});
  }

  startCompleteScan(values, blessedCount) {
    this.mode = "scanning";
    this.diwata.playAnimation("spellcast", "right");
    this.scanReadout.setText("Scanning Row 0").setColor("#bfeeff");
    let found = 0;
    this.graves.forEach((grave, index) => {
      this.schedule(index * 180, () => {
        const value = Number(values[grave.row]?.[grave.column]);
        if (index % 4 === 0) this.highlightRow(grave.row);
        this.inspectGrave(grave, value, index);
        if (value === 1) found += 1;
        this.updateHud(grave.row, grave.column, found, index + 1);
      });
    });
    this.schedule(this.graves.length * 180 + 220, () => {
      this.rowHighlights.forEach(({ highlight }) => highlight.setFillStyle(0x5cb7d8, 0));
      this.hudRow.setText("Current Row       complete");
      this.hudColumn.setText("Current Column    complete");
      this.scanReadout.setText(`BLESSED SPIRITS FOUND: ${blessedCount}`).setColor("#bff4ff");
      this.diwata.playIdle("right");
      this.releaseSpirits();
    });
  }

  startFailedScan(message, values) {
    this.mode = "failure";
    const failureType = values.failureType ?? "incomplete_scan";
    const visited = values.visitedCells ?? [];
    const visualMessage = {
      missing_counter: "The scan has no blessed-spirit counter.",
      missing_outer_loop: "The cemetery rows were never traversed.",
      missing_inner_loop: "Rows reached; graves inside were skipped.",
      wrong_access: "Use both coordinates: graves[row, col].",
      counting_corrupted: "Purple graves are corrupted, not blessed.",
      missing_increment: "Blessed graves were found, but the count stayed still.",
      missing_return: "The scan finished, but no total returned.",
      wrong_dimensions: "The cemetery must remain a 3 by 4 grid.",
    }[failureType];
    if (visualMessage) {
      this.scanReadout.setText(visualMessage).setColor("#ffb2c0");
    }
    if (failureType === "missing_inner_loop") {
      this.rowHighlights.forEach(({ highlight }, index) => {
        this.schedule(index * 220, () => highlight.setFillStyle(0xff6688, 0.12).setStrokeStyle(1, 0xff8da4, 0.7));
      });
    } else if (visited.length) {
      visited.slice(0, 12).forEach(([row, column], index) => {
        const grave = this.graves.find((item) => item.row === row && item.column === column);
        if (!grave) return;
        this.schedule(index * 95, () => {
          grave.tomb.setTint(0xd4778d);
          grave.valueText.setText("?").setColor("#ff9fb3");
          this.updateHud(row, column, 0, index + 1);
        });
      });
    } else {
      this.scanReadout.setText("The cemetery scan could not begin.").setColor("#ffb2c0");
      this.cameras.main.shake(180, 0.0025);
    }
    this.schedule(Math.max(900, visited.length * 95 + 250), () => {
      if (visualMessage) {
        this.scanReadout.setText(visualMessage).setColor("#ffb2c0");
      }
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message: message || "Every grave must be inspected before the spirits can answer.",
      });
      this.schedule(350, () => {
        this.clearScanState();
        this.mode = "idle";
      });
    });
  }

  highlightRow(row) {
    this.rowHighlights.forEach(({ highlight, rowLabel }, index) => {
      const active = index === row;
      highlight
        .setFillStyle(0x4db9dc, active ? 0.11 : 0)
        .setStrokeStyle(1, 0x8bdcf2, active ? 0.72 : 0);
      rowLabel.setColor(active ? "#c7f2ff" : "#718e9c");
    });
    this.scanReadout.setText(`Scanning Row ${row}`);
  }

  inspectGrave(grave, value, index) {
    this.playSfx?.(value === 1 ? "scan" : "scanError", {
      rate: Math.min(1.05, 0.97 + (index % 5) * 0.02),
    });
    grave.valueText.setText(`= ${value}`);
    grave.coordinate.setColor("#d5eaf2");
    this.tweens.add({
      targets: grave.tomb,
      scale: 0.98,
      duration: 90,
      yoyo: true,
      ease: "Sine.easeOut",
    });
    if (value === 1) {
      grave.tomb.setTint(0xb9e9ff);
      grave.glow.setAlpha(0.72);
      this.createSpirit(grave, index);
      this.playTone(560 + index * 18, 0.022);
      return;
    }
    grave.tomb.setTint(0x8b668e);
    this.createCorruption(grave);
    this.playTone(205, 0.018, "triangle");
  }

  createSpirit(grave, index) {
    const spirit = this.add.container(grave.point.x, grave.point.y - 35).setDepth(2.05).setAlpha(0);
    const glow = this.add.image(0, 0, "fa4_cemetery_glow").setScale(0.24).setAlpha(0.8).setBlendMode(Phaser.BlendModes.ADD);
    const tail = this.add.ellipse(0, 8, 7, 18, 0x62c9ff, 0.48);
    const core = this.add.circle(0, -2, 5, 0xdaf7ff, 0.96).setStrokeStyle(1, 0x6bcaff, 0.9);
    spirit.add([glow, tail, core]);
    this.spirits.push(spirit);
    this.tweens.add({
      targets: spirit,
      y: spirit.y - 25,
      alpha: 1,
      duration: 380,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: spirit,
          y: spirit.y - 6,
          x: spirit.x + (index % 2 === 0 ? 4 : -4),
          duration: 900 + index * 35,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      },
    });
  }

  createCorruption(grave) {
    const smoke = this.add.container(grave.point.x, grave.point.y - 26).setDepth(2);
    for (let index = 0; index < 3; index += 1) {
      const puff = this.add.circle((index - 1) * 6, index * -5, 5 + index, 0x743a83, 0.2);
      smoke.add(puff);
      this.tweens.add({
        targets: puff,
        y: puff.y - 18,
        x: puff.x + (index - 1) * 5,
        alpha: { from: 0.28, to: 0.06 },
        scale: { from: 0.7, to: 1.25 },
        duration: 1200 + index * 180,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    this.corruptionEffects.push(smoke);
  }

  updateHud(row, column, blessed, progress) {
    this.hudRow.setText(`Current Row       ${row}`);
    this.hudColumn.setText(`Current Column    ${column}`);
    this.hudBlessed.setText(`Blessed Spirits   ${blessed}`);
    this.hudProgress.setText(`Progress          ${String(progress).padStart(2, " ")} / 12`);
    this.scanReadout.setText(`graves[${row},${column}] = ${GRAVE_VALUES[row][column]}`);
  }

  releaseSpirits() {
    this.playSfx?.("ghostFade");
    this.mode = "releasing";
    this.scanReadout.setText("THE GUARDIAN SPIRITS ARE FREE").setColor("#d9f8ff");
    this.releaseLabel.setText("THE FORGOTTEN ASCEND");
    this.diwata.playAnimation("spellcast", "right");
    this.cameras.main.pan(this.releasePoint.x, 220, 700, "Sine.easeInOut");
    this.tweens.add({
      targets: this.releaseMoon,
      alpha: 0.82,
      scale: 0.78,
      duration: 1900,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: this.moonHalo,
      alpha: 0.3,
      scale: 1.08,
      duration: 1900,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: this.heavenGlow,
      alpha: 0.72,
      scaleX: 1.7,
      scaleY: 0.82,
      duration: 900,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
    const blessedGraves = this.graves.filter((grave) => grave.value === 1);
    this.spirits.forEach((spirit, index) => {
      this.tweens.killTweensOf(spirit);
      this.schedule(index * 135 + 280, () => {
        this.playReleaseChime(index);
      });
      for (let trailIndex = 0; trailIndex < 5; trailIndex += 1) {
        this.schedule(index * 135 + 320 + trailIndex * 210, () => {
          this.createSpiritTrail(spirit, index, trailIndex);
        });
      }
      this.tweens.add({
        targets: spirit,
        x: this.releasePoint.x + (index - 3) * 24,
        y: this.releasePoint.y - 42 - (index % 3) * 16,
        scale: 0.24,
        alpha: 0,
        angle: index % 2 === 0 ? 18 : -18,
        duration: 1450 + index * 70,
        delay: index * 135,
        ease: "Sine.easeIn",
        onComplete: () => {
          const grave = blessedGraves[index];
          if (grave) {
            grave.tomb.setTint(0xc5ced1).setAlpha(0.94);
            grave.glow.setAlpha(0.1);
            grave.coordinate.setColor("#87979d");
            grave.valueText.setColor("#aab8bd");
          }
          spirit.destroy();
        },
      });
    });
    this.corruptionEffects.forEach((effect, index) => {
      this.tweens.add({
        targets: effect,
        alpha: 0,
        y: effect.y - 20,
        duration: 520,
        delay: 600 + index * 70,
      });
    });
    this.schedule(this.spirits.length * 135 + 1750, () => this.finishSpiritRelease());
  }

  finishSpiritRelease() {
    this.playSfx?.("moonRestore");
    this.releaseLabel
      .setText("The forgotten are finally at peace.")
      .setColor("#e4f2f4");
    this.scanReadout.setText("SEVEN SPIRITS RETURNED TO THE SKY").setColor("#c9e7ed");
    this.diwata.playIdle("right");
    this.playChord();
    this.tweens.add({
      targets: [this.releaseMoon, this.moonHalo, this.heavenGlow],
      alpha: 0.5,
      duration: 1300,
      ease: "Sine.easeInOut",
    });
    this.schedule(2650, () => this.runPlayerToExit());
  }

  runPlayerToExit() {
    this.mode = "exiting";
    this.player.setFlipX(false).play("fa4-player-run", true);
    this.cameras.main.startFollow(this.player, true, 0.07, 0.07);
    this.tweens.add({
      targets: this.player,
      x: this.exitPoint.x,
      duration: Math.max(1900, Math.abs(this.exitPoint.x - this.player.x) * 4),
      ease: "Linear",
      onComplete: () => {
        this.player.play("fa4-player-idle", true);
        this.mode = "complete";
        gameEvents.emit(GAME_LEVEL_OUTCOME, {
          levelNumber: LEVEL_NUMBER,
          status: "success",
          message: `${BLESSED_COUNT} guardian spirits were freed. The cemetery path is blessed.`,
          shouldProceed: true,
        });
      },
    });
  }

  clearScanState() {
    this.timers.forEach((timer) => timer.remove(false));
    this.timers = [];
    this.spirits.forEach((spirit) => spirit.destroy());
    this.spirits = [];
    this.corruptionEffects.forEach((effect) => effect.destroy());
    this.corruptionEffects = [];
    this.rowHighlights?.forEach(({ highlight, rowLabel }) => {
      highlight.setFillStyle(0x5cb7d8, 0).setStrokeStyle(1, 0x8bdcf2, 0);
      rowLabel.setColor("#718e9c");
    });
    this.graves?.forEach((grave) => {
      grave.tomb.clearTint().setScale(0.9);
      grave.glow.setAlpha(0);
      grave.coordinate.setColor("#6f8792");
      grave.valueText.setText("").setColor("#e6f7ff");
    });
    this.hudRow?.setText("Current Row       -");
    this.hudColumn?.setText("Current Column    -");
    this.hudBlessed?.setText("Blessed Spirits   0");
    this.hudProgress?.setText("Progress           0 / 12");
    this.scanReadout?.setText("Every row. Every column.").setColor("#9cb8c5");
  }

  setupCamera() {
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.scale.height);
    this.cameras.main.scrollX = 0;
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

  schedule(delay, callback) {
    const timer = this.time.delayedCall(delay, callback);
    this.timers.push(timer);
    return timer;
  }

  playTone(frequency, volume, type = "sine") {
    const context = this.sound?.context;
    if (!context || context.state === "closed") return;
    if (context.state === "suspended") context.resume().catch(() => {});
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.27);
  }

  playChord() {
    [392, 493.88, 587.33, 783.99].forEach((frequency, index) => {
      this.schedule(index * 95, () => this.playTone(frequency, 0.021));
    });
  }

  playReleaseChime(index) {
    const frequencies = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77];
    this.playTone(frequencies[index] ?? 987.77, 0.018, "sine");
  }

  createSpiritTrail(spirit, spiritIndex, trailIndex) {
    if (trailIndex === 0) {
      this.playSfx?.("spiritRelease", { rate: Math.min(1.05, 0.97 + (spiritIndex % 5) * 0.02) });
    }
    if (!spirit?.active) return;
    const trail = this.add
      .circle(
        spirit.x + ((spiritIndex + trailIndex) % 3 - 1) * 3,
        spirit.y + 8,
        1.5,
        0xbcecff,
        0.48,
      )
      .setDepth(1.95)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.effects.push(trail);
    this.tweens.add({
      targets: trail,
      y: trail.y + 13,
      alpha: 0,
      scale: 0.35,
      duration: 620,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.effects, trail);
        trail.destroy();
      },
    });
  }

  cleanup() {
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.timers.forEach((timer) => timer.remove(false));
    this.effects.forEach((effect) => effect.destroy());
    this.spirits.forEach((spirit) => spirit.destroy());
    this.corruptionEffects.forEach((effect) => effect.destroy());
    this.diwata?.destroy();
  }
}
