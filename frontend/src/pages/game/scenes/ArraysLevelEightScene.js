import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";

const LEVEL_NUMBER = 13;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const MAP_KEY = "arrays_level_8_cursed_jars";
const MAP_PATH = `${ASSET_BASE}/maps/arrays-level-8-cursed-jars.tmj`;
const JAR_COLORS = ["blue", "green", "purple", "orange"];
const JAR_TEXTURES = [
  "arrays_8_jar_blue",
  "arrays_8_jar_green",
  "arrays_8_jar_purple",
  "arrays_8_jar_orange",
];
const CURSED_INDEX = 2;
const PLAYER_SCALE = 2;
const PLAYER_SPEED = 190;
const JAR_SCALE = 1.4;
const JAR_INSPECT_SCALE = 1.48;

export default class ArraysLevelEightScene extends Phaser.Scene {
  constructor() {
    super("ArraysLevelEightScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("arrays_8_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("arrays_8_decor", `${GH_BASE}/Decor.png`);
    this.load.image("arrays_8_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("arrays_8_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("arrays_8_house", `${GH_BASE}/House_Tiles.png`);
    this.load.image("arrays_8_other", `${GH_BASE}/Other_Tiles2.png`);
    this.load.image("arrays_8_other_flipped", `${GH_BASE}/Other_Tiles2(Flipped).png`);
    this.load.image("arrays_8_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("arrays_8_willow", `${GH_BASE}/Weeping_Willow1Big.png`);
    this.load.image("arrays_8_signage_1", `${ASSET_BASE}/other/signage1.png`);
    this.load.image("arrays_8_signage_2", `${ASSET_BASE}/other/signage2.png`);
    this.load.image("arrays_8_jar_blue", `${ASSET_BASE}/other/jars/32x32/Blue.png`);
    this.load.image("arrays_8_jar_green", `${ASSET_BASE}/other/jars/32x32/Green.png`);
    this.load.image("arrays_8_jar_purple", `${ASSET_BASE}/other/jars/32x32/Purple.png`);
    this.load.image("arrays_8_jar_orange", `${ASSET_BASE}/other/jars/32x32/Orange.png`);
    this.load.spritesheet(
      "arrays_8_cursed_portal",
      `${GH_BASE}/Animated_Sprites/GandalfHardcore_Portal_sheet.png`,
      { frameWidth: 64, frameHeight: 64 },
    );
    this.load.spritesheet(
      "arrays_8_manananggal",
      `${ASSET_BASE}/characters/monsters/Manangy-fly_idle.png`,
      { frameWidth: 256, frameHeight: 256 },
    );
    this.load.spritesheet(
      "arrays_8_player",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    this.load.image("arrays_8_bg5", `${BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("arrays_8_bg4", `${BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("arrays_8_bg3", `${BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("arrays_8_bg2", `${BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("arrays_8_bg1", `${BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
  }

  create() {
    this.scale.resize(1024, 576);
    const map = this.make.tilemap({ key: MAP_KEY });
    this.offsetY = this.scale.height - map.heightInPixels;
    this.sequenceTimers = [];
    this.sequenceMode = "idle";

    this.createBackgrounds(map);
    this.createTileLayers(map);
    this.points = this.resolveMapPoints(map);
    this.spawnPoint = this.points.player_spawn ?? { x: 96, y: 448 };
    this.exitPoint = this.points.level_exit ?? { x: map.widthInPixels - 80, y: this.spawnPoint.y };
    this.jarPoints = JAR_COLORS.map((_, index) =>
      this.points[`jar_${index}`] ??
      this.points[`tag_${index}`] ??
      { x: 430 + index * 170, y: this.spawnPoint.y },
    );
    this.barrierPoint =
      this.points.barrier_spawn ??
      this.points.barrier ??
      { x: this.exitPoint.x - 105, y: this.spawnPoint.y };
    this.counterPoint = this.points.counter_panel ?? { x: 810, y: 185 };

    this.createAnimations();
    this.createJars();
    this.createBarrier();
    this.createCounter();
    this.createPlayer();
    this.createAmbientWhispers();

    this.cameras.main.setBounds(0, this.offsetY, map.widthInPixels, map.heightInPixels);
    this.setupCamera(map);
    this.setCameraX(this.spawnPoint.x - 120);
    this.cameras.main.setBackgroundColor("#050916");
    this.player.play("arrays-8-player-idle");

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  update() {
    if (this.sequenceMode === "collectingPass") {
      this.player.play("arrays-8-player-run", true);
      this.player.setFlipX(false);
      this.player.x += (PLAYER_SPEED * 1.15 * this.game.loop.delta) / 1000;

      [0, 1, 3].forEach((index) => {
        if (this.collectedSafeIndexes.has(index)) return;
        if (Math.abs(this.player.x - this.jarPoints[index].x) <= 34) {
          this.collectSafeJar(index);
        }
      });

      const reachedCursedJar =
        !this.cursedJarAcknowledged &&
        this.player.x >= this.jarPoints[CURSED_INDEX].x - 18;
      if (reachedCursedJar) {
        this.cursedJarAcknowledged = true;
        this.sequenceMode = "observingCursed";
        this.player.play("arrays-8-player-idle", true);
        this.player.setFlipX(true);
        this.schedule(360, () => {
          if (this.sequenceMode !== "observingCursed") return;
          this.player.setFlipX(false);
          this.sequenceMode = "collectingPass";
        });
        return;
      }

      const passedLastJar = this.player.x >= this.jarPoints[3].x + 52;
      if (passedLastJar && this.collectedSafeIndexes.size === 3) {
        this.sequenceMode = "waitingForRetreat";
        this.player.play("arrays-8-player-idle", true);
        this.cameras.main.stopFollow();
        this.scanLabel.setText("scanned 4/4").setColor("#b8f3d3");
        this.counterText.setText("3 SAFE").setColor("#9af0bd");
        this.schedule(320, () => this.openBarrier());
      }
      return;
    }

    if (this.sequenceMode === "walkingToExit") {
      this.player.play("arrays-8-player-run", true);
      this.player.setFlipX(false);
      this.player.x += (PLAYER_SPEED * this.game.loop.delta) / 1000;
      if (this.player.x >= this.exitPoint.x) this.finishSuccess();
    }
  }

  createBackgrounds(map) {
    [
      ["arrays_8_bg5", 0.08, -8, 0.78, 0],
      ["arrays_8_bg4", 0.14, -7, 0.7, 0],
      ["arrays_8_bg3", 0.32, -6, 0.62, 88],
      ["arrays_8_bg2", 0.58, -5, 0.58, 176],
      ["arrays_8_bg1", 0.82, -4, 0.5, 225],
    ].forEach(([key, factor, depth, alpha, y]) => {
      this.add
        .tileSprite(0, y, map.widthInPixels, this.scale.height - y, key)
        .setOrigin(0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x1d3448)
        .setAlpha(alpha);
    });
    this.add.rectangle(0, 0, map.widthInPixels, 576, 0x030711, 0.34).setOrigin(0).setDepth(-3);
  }

  createTileLayers(map) {
    const tilesets = [
      map.addTilesetImage("Floor_Tiles2", "arrays_8_floor"),
      map.addTilesetImage("Decor", "arrays_8_decor"),
      map.addTilesetImage("Garden_Decorations", "arrays_8_garden"),
      map.addTilesetImage("Pine_Trees", "arrays_8_pines"),
      map.addTilesetImage("House_Tiles", "arrays_8_house"),
      map.addTilesetImage("Other_Tiles2", "arrays_8_other"),
      map.addTilesetImage("Other_Tiles2(Flipped)", "arrays_8_other_flipped"),
      map.addTilesetImage("Pine_forest_sheet", "arrays_8_forest"),
      map.addTilesetImage("Weeping_Willow1Big", "arrays_8_willow"),
      map.addTilesetImage("signage1", "arrays_8_signage_1"),
      map.addTilesetImage("signage2", "arrays_8_signage_2"),
    ].filter(Boolean);
    ["platform", "trees", "decoration", "jars", "front_decoration"].forEach((name, index) => {
      const layer = map.createLayer(name, tilesets, 0, this.offsetY);
      if (layer) layer.setDepth(0.1 + index * 0.2);
    });
  }

  createAnimations() {
    [
      ["arrays-8-player-idle", 0, 5, 6],
      ["arrays-8-player-run", 16, 23, 12],
      ["arrays-8-player-hurt", 48, 55, 10],
    ].forEach(([key, start, end, frameRate]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("arrays_8_player", { start, end }),
        frameRate,
        repeat: key.includes("hurt") ? 0 : -1,
      });
    });
    if (!this.anims.exists("arrays-8-cursed-portal")) {
      this.anims.create({
        key: "arrays-8-cursed-portal",
        frames: this.anims.generateFrameNumbers("arrays_8_cursed_portal", {
          start: 0,
          end: 9,
        }),
        frameRate: 9,
        repeat: -1,
      });
    }
    if (!this.anims.exists("arrays-8-manananggal-idle")) {
      this.anims.create({
        key: "arrays-8-manananggal-idle",
        frames: this.anims.generateFrameNumbers("arrays_8_manananggal", {
          start: 0,
          end: 7,
        }),
        frameRate: 8,
        repeat: -1,
      });
    }
  }

  createJars() {
    this.jars = this.jarPoints.map((point, index) => {
      const isCursed = index === CURSED_INDEX;
      const aura = this.add
        .ellipse(
          point.x,
          point.y - 22,
          44,
          48,
          0x80d9d0,
          0.06,
        )
        .setDepth(1.2);
      const portalGlow = isCursed
        ? this.add
            .ellipse(point.x, point.y - 26, 60, 52, 0x69409b, 0.2)
            .setAlpha(0)
            .setDepth(1.21)
        : null;
      const portalAura = isCursed
        ? this.add
            .sprite(point.x, point.y, "arrays_8_cursed_portal", 0)
            .setOrigin(0.5, 1)
            .setScale(1)
            .setAlpha(0)
            .setTintFill(0x7550a4)
            .setDepth(1.24)
            .play("arrays-8-cursed-portal")
        : null;
      const sprite = this.add
        .image(point.x, point.y, JAR_TEXTURES[index])
        .setOrigin(0.5, 1)
        .setScale(JAR_SCALE)
        .setTint(0xffffff)
        .setDepth(1.35);
      const indexText = this.add
        .text(point.x, point.y - 72, `[${index}]`, {
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#a9c3ca",
          backgroundColor: "#07131ddd",
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(1.5)
        .setAlpha(0.74);
      const statusText = this.add
        .text(point.x, point.y - 53, "", {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#a9f3cc",
          backgroundColor: "#07131ddd",
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(1.52)
        .setAlpha(0);
      return { aura, portalGlow, portalAura, sprite, indexText, statusText };
    });
  }

  createBarrier() {
    this.barrier = this.add.container(this.barrierPoint.x, this.barrierPoint.y).setDepth(1.4);
    const glow = this.add
      .ellipse(0, -76, 118, 132, 0x5e1738, 0.18)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    const shadow = this.add.ellipse(0, -8, 92, 18, 0x02040a, 0.42);
    this.manananggal = this.add
      .sprite(0, -78, "arrays_8_manananggal", 0)
      .setScale(0.62)
      .setTint(0x87505e)
      .setFlipX(true)
      .play("arrays-8-manananggal-idle");
    this.manananggalLabel = this.add
      .text(0, -153, "Find the cursed seal.", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffd9df",
        backgroundColor: "#071019dd",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5);
    this.barrier.add([glow, shadow, this.manananggal, this.manananggalLabel]);
    this.tweens.add({
      targets: glow,
      alpha: 0.3,
      scale: 1.08,
      duration: 1450,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createCounter() {
    const x = this.counterPoint.x;
    const y = Math.max(72, this.counterPoint.y - 95);
    this.counterPanel = this.add.container(x, y).setDepth(2).setScrollFactor(1);
    const panel = this.add.rectangle(0, 0, 164, 88, 0x07141f, 0.9)
      .setStrokeStyle(1, 0x5f8d95, 0.8);
    this.scanLabel = this.add.text(0, -27, "scanned 0/4", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#b8d3d7",
    }).setOrigin(0.5);
    this.counterText = this.add.text(0, 1, "WAITING", {
      fontFamily: "monospace",
      fontSize: "15px",
      color: "#f4e7bd",
    }).setOrigin(0.5);
    this.inventorySlots = [-1, 0, 1].map((offset) =>
      this.add
        .rectangle(offset * 22, 28, 14, 10, 0x172832, 1)
        .setStrokeStyle(1, 0x66818a, 0.85),
    );
    this.counterPanel.add([
      panel,
      this.scanLabel,
      this.counterText,
      ...this.inventorySlots,
    ]);
  }

  createPlayer() {
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "arrays_8_player", 0)
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.7);
  }

  createAmbientWhispers() {
    this.jars.forEach(({ aura }, index) => {
      this.tweens.add({
        targets: aura,
        alpha: 0.14,
        scale: 1.12,
        duration: 1250 + index * 170,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });
  }

  onCodeEvaluated({ levelNumber, isCorrect, values, message }) {
    if (Number(levelNumber) !== LEVEL_NUMBER) return;
    this.resetAttempt();
    const visited = Array.isArray(values?.visitedIndexes) ? values.visitedIndexes : [];
    if (isCorrect) this.startSuccess();
    else this.startFailure(visited, message);
  }

  resetAttempt() {
    this.sequenceTimers.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.tweens.killTweensOf([this.player, this.barrier, this.counterText]);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y).setAlpha(1).setTint(0xffffff);
    this.player.play("arrays-8-player-idle", true);
    this.barrier.setAlpha(1).setScale(1);
    this.barrier.setPosition(this.barrierPoint.x, this.barrierPoint.y);
    this.manananggal.setTint(0x87505e).setAlpha(1);
    this.manananggalLabel.setText("Find the cursed seal.").setColor("#ffd9df");
    this.manananggalRetreated = false;
    this.cursedJarAcknowledged = false;
    this.scannedCount = 0;
    this.collectedSafeIndexes = new Set();
    this.scanLabel.setText("scanned 0/4").setColor("#b8d3d7");
    this.counterText.setText("WAITING").setColor("#f4e7bd").setScale(1);
    this.inventorySlots.forEach((slot) =>
      slot.setFillStyle(0x172832, 1).setStrokeStyle(1, 0x66818a, 0.85),
    );
    this.jars.forEach(({ aura, portalGlow, portalAura, sprite, indexText, statusText }, index) => {
      aura
        .setFillStyle(0x80d9d0, 0.06)
        .setAlpha(0.08)
        .setScale(1);
      portalGlow?.setAlpha(0).setScale(1).setFillStyle(0x69409b, 0.2);
      portalAura?.setAlpha(0).setScale(1).setTintFill(0x7550a4);
      sprite
        .setPosition(this.jarPoints[index].x, this.jarPoints[index].y)
        .setTint(0xffffff)
        .setAlpha(1)
        .setScale(JAR_SCALE)
        .setAngle(0);
      indexText.setColor("#a9c3ca").setAlpha(0.74);
      statusText.setText("").setAlpha(0).setColor("#a9f3cc");
    });
    this.sequenceMode = "idle";
    this.manualCameraEnabled = true;
  }

  startSuccess() {
    this.sequenceMode = "checking";
    this.manualCameraEnabled = false;
    this.jarPoints.forEach((point, index) => {
      this.schedule(index * 620, () => this.inspectJar(index));
    });
    this.schedule(this.jarPoints.length * 620 + 300, () => this.collectSafeJars());
  }

  inspectJar(index, revealHiddenCurse = true) {
    const jar = this.jars[index];
    const point = this.jarPoints[index];
    this.panTo(point.x);
    this.scannedCount = Math.max(this.scannedCount, index + 1);
    this.scanLabel.setText(`scanned ${this.scannedCount}/${this.jars.length}`);
    jar.indexText.setColor("#fff0a8").setAlpha(1);
    jar.aura.setFillStyle(0x74d9d1, 0.32).setAlpha(1);
    jar.statusText
      .setText(index === CURSED_INDEX ? "SCANNING" : "SAFE")
      .setColor(index === CURSED_INDEX ? "#e4c1ff" : "#a9f3cc")
      .setAlpha(1);
    this.tweens.add({
      targets: jar.sprite,
      scale: JAR_INSPECT_SCALE,
      duration: 150,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
    if (index === CURSED_INDEX && revealHiddenCurse) this.revealCurse();
  }

  revealCurse() {
    const jar = this.jars[CURSED_INDEX];
    this.panTo(this.jarPoints[CURSED_INDEX].x);
    jar.aura.setFillStyle(0xff294f, 0.42).setAlpha(1);
    jar.statusText.setText("CURSED").setColor("#ff9aaa").setAlpha(1);
    jar.portalGlow?.setFillStyle(0xff244f, 0.42).setAlpha(0.72);
    jar.portalAura?.setTintFill(0xc92f54).setAlpha(1);
    this.tweens.add({
      targets: [jar.portalGlow, jar.portalAura],
      alpha: 0.58,
      scale: 1.08,
      duration: 760,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
    });
    jar.sprite.setTint(0xff6677);
    this.tweens.add({
      targets: jar.sprite,
      x: jar.sprite.x + 5,
      angle: 4,
      duration: 70,
      yoyo: true,
      repeat: 6,
    });
    this.counterText.setText("CURSE FOUND").setColor("#ff8a9b");
    this.tweens.add({
      targets: this.counterText,
      scale: 1.18,
      duration: 180,
      yoyo: true,
    });
    this.createSmoke(this.jarPoints[CURSED_INDEX].x, this.jarPoints[CURSED_INDEX].y - 22);
    this.schedule(720, () => {
      if (this.sequenceMode === "failure") return;
      jar.statusText.setText("SEALED").setColor("#d5b2ff").setAlpha(1);
    });
    this.retreatManananggal();
  }

  retreatManananggal() {
    if (this.manananggalRetreated) return;
    this.manananggalRetreated = true;
    this.manananggalLabel.setText("The seal is exposed!").setColor("#ffb1c1");
    this.tweens.add({
      targets: this.barrier,
      alpha: 0,
      y: this.barrierPoint.y - 70,
      scale: 0.88,
      duration: 760,
      ease: "Sine.easeInOut",
    });
  }

  collectSafeJars() {
    this.sequenceMode = "collectingPass";
    this.collectedSafeIndexes = new Set();
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08, -260, 0);
  }

  collectSafeJar(index) {
    this.collectedSafeIndexes.add(index);
    const jar = this.jars[index];
    const collectedCount = this.collectedSafeIndexes.size;
    const pickupX = this.player.x + PLAYER_SPEED * 1.15 * 0.28;
    const pickupY = this.player.y - 40;

    this.counterText
      .setText(`COLLECTED ${collectedCount}/3`)
      .setColor("#9af0bd");
    this.inventorySlots[collectedCount - 1]
      ?.setFillStyle(0x58c98b, 1)
      .setStrokeStyle(1, 0xc6ffe0, 1);
    jar.aura.setFillStyle(0x79e6ba, 0.3).setAlpha(1);
    this.createPickupBurst(jar.sprite.x, jar.sprite.y - 18, pickupX, pickupY);
    this.tweens.add({
      targets: jar.sprite,
      x: pickupX,
      y: pickupY,
      angle: index % 2 === 0 ? 14 : -14,
      scale: 0.26,
      alpha: 0,
      duration: 330,
      ease: "Cubic.easeIn",
      onComplete: () => {
        this.player.setTint(0xc9ffe1);
        this.schedule(110, () => this.player?.setTint(0xffffff));
      },
    });
    this.tweens.add({
      targets: [jar.aura, jar.indexText, jar.statusText],
      alpha: 0,
      scale: 1.22,
      duration: 240,
      ease: "Sine.easeIn",
    });
  }

  createPickupBurst(originX, originY, targetX, targetY) {
    const ring = this.add
      .circle(originX, originY, 9, 0x8ff0bd, 0.2)
      .setStrokeStyle(2, 0xbaffd6, 0.9)
      .setDepth(1.8)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: ring,
      scale: 2.1,
      alpha: 0,
      duration: 360,
      ease: "Sine.easeOut",
      onComplete: () => ring.destroy(),
    });

    [-12, -6, 0, 7, 13].forEach((offset, sparkIndex) => {
      const spark = this.add
        .circle(originX + offset, originY + Phaser.Math.Between(-5, 5), 2, 0xbaffd6, 0.9)
        .setDepth(1.82)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: spark,
        x: targetX + Phaser.Math.Between(-5, 5),
        y: targetY + Phaser.Math.Between(-6, 6),
        alpha: 0,
        scale: 0.35,
        delay: sparkIndex * 22,
        duration: 280,
        ease: "Cubic.easeIn",
        onComplete: () => spark.destroy(),
      });
    });
  }

  openBarrier() {
    if (!this.manananggalRetreated) this.retreatManananggal();
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08, -260, 0);
    this.sequenceMode = "walkingToExit";
  }

  startFailure(visited, message = "") {
    this.sequenceMode = "failure";
    this.manualCameraEnabled = false;
    const safeVisited = visited.length ? visited.slice(0, 4) : [0];
    safeVisited.forEach((index, order) => {
      if (!this.jars[index]) return;
      this.schedule(order * 400, () => this.inspectJar(index, false));
    });
    this.schedule(safeVisited.length * 400 + 220, () => {
      const focusIndex = Math.min(safeVisited.length, this.jars.length - 1);
      this.panTo(this.jarPoints[focusIndex].x);
      this.scanLabel
        .setText(`scanned ${safeVisited.length}/${this.jars.length}`)
        .setColor("#ffb4b4");
      this.counterText.setText("SCAN INCOMPLETE").setColor("#ff9aaa");
      this.jars[focusIndex].sprite.setTint(0x744052);
      this.jars[focusIndex].aura.setFillStyle(0x7b1735, 0.34).setAlpha(1);
      this.jars.forEach((jar, index) => {
        if (safeVisited.includes(index)) return;
        this.tweens.add({
          targets: [jar.sprite, jar.indexText],
          alpha: 0.35,
          duration: 260,
        });
      });
      this.createSmoke(this.jarPoints[focusIndex].x, this.jarPoints[focusIndex].y - 20);
      this.player.play("arrays-8-player-hurt", true);
    });
    this.schedule(safeVisited.length * 400 + 720, () => {
      this.panTo(this.barrierPoint.x);
      this.manananggal.setTint(0xc44759);
      this.manananggalLabel.setText("Scan every jar.").setColor("#ffadb8");
      this.tweens.add({
        targets: this.barrier,
        x: this.barrierPoint.x - 16,
        duration: 90,
        yoyo: true,
        repeat: 5,
        ease: "Sine.easeInOut",
      });
    });
    this.schedule(safeVisited.length * 400 + 1450, () => {
      this.panTo(this.spawnPoint.x);
    });
    this.schedule(safeVisited.length * 400 + 2050, () => {
      this.resetAttempt();
      this.counterText.setText("TRY AGAIN").setColor("#f4e7bd");
      this.manualCameraEnabled = true;
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message: message || "Use ScanJar(jars[i]) to inspect every color.",
      });
    });
  }

  createSmoke(x, y) {
    [-18, -6, 7, 19].forEach((offset, index) => {
      const puff = this.add
        .circle(x + offset, y, 8 + index * 2, 0x51152b, 0.5)
        .setDepth(1.65)
        .setBlendMode(Phaser.BlendModes.SCREEN);
      this.tweens.add({
        targets: puff,
        y: y - 38 - index * 5,
        x: puff.x + Phaser.Math.Between(-8, 8),
        alpha: 0,
        scale: 1.7,
        duration: 720 + index * 90,
        onComplete: () => puff.destroy(),
      });
    });
  }

  finishSuccess() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    this.cameras.main.stopFollow();
    this.player.play("arrays-8-player-idle", true);
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: "Scan complete: 3 safe jars collected. The cursed jar remains sealed.",
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
    this.manualCameraEnabled = true;
    this.cameraBounds = { minX: 0, maxX: Math.max(0, map.widthInPixels - 1024) };
    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);
    this.input.on("pointerupoutside", this.onPointerUp, this);
    this.input.on("wheel", this.onWheel, this);
  }

  onPointerDown(pointer) {
    if (!this.manualCameraEnabled || pointer.rightButtonDown()) return;
    this.drag = { id: pointer.id, x: pointer.x, scrollX: this.cameras.main.scrollX };
  }

  onPointerMove(pointer) {
    if (!this.manualCameraEnabled || this.drag?.id !== pointer.id) return;
    this.setCameraX(this.drag.scrollX - (pointer.x - this.drag.x));
  }

  onPointerUp(pointer) {
    if (this.drag?.id === pointer.id) this.drag = null;
  }

  onWheel(_pointer, _objects, deltaX, deltaY) {
    if (!this.manualCameraEnabled) return;
    this.setCameraX(this.cameras.main.scrollX + (Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY));
  }

  setCameraX(value) {
    this.cameras.main.scrollX = Phaser.Math.Clamp(
      value,
      this.cameraBounds?.minX ?? 0,
      this.cameraBounds?.maxX ?? 0,
    );
  }

  panTo(worldX) {
    this.tweens.add({
      targets: this.cameras.main,
      scrollX: Phaser.Math.Clamp(
        worldX - this.scale.width * 0.48,
        this.cameraBounds.minX,
        this.cameraBounds.maxX,
      ),
      duration: 430,
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
    this.input.off("pointerdown", this.onPointerDown, this);
    this.input.off("pointermove", this.onPointerMove, this);
    this.input.off("pointerup", this.onPointerUp, this);
    this.input.off("pointerupoutside", this.onPointerUp, this);
    this.input.off("wheel", this.onWheel, this);
    this.sequenceTimers.forEach((timer) => timer.remove(false));
  }
}
