import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_DIALOGUE_CLOSED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";
import LayeredLpcCharacter from "../characters/LayeredLpcCharacter";
import { DIWATA_FAIRY_CONFIG } from "../characters/diwataFairyConfig";

const LEVEL_NUMBER = 21;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const MAP_KEY = "methods_level_8_salt_against_aswang";
const MAP_PATH = `${ASSET_BASE}/maps/methods-level-8-salt-against-aswang.tmj`;
const PLAYER_SCALE = 2;
const DIWATA_SCALE = 1.25;
const ASWANG_SCALE = 0.46;
const SALT_WHITE = 0xf8fbff;
const HIT_BLUE = 0xcff7ff;
const FAIL_RED = 0xff6677;
const REQUIRED_SALT_AMOUNT = 5;

export default class MethodsSaltAgainstAswangScene extends Phaser.Scene {
  constructor() {
    super("MethodsSaltAgainstAswangScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("methods_8_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("methods_8_decor", `${GH_BASE}/Decor.png`);
    this.load.image("methods_8_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("methods_8_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("methods_8_house", `${GH_BASE}/House_Tiles.png`);
    this.load.image("methods_8_other", `${GH_BASE}/Other_Tiles2.png`);
    this.load.image("methods_8_other_flipped", `${GH_BASE}/Other_Tiles2(Flipped).png`);
    this.load.image("methods_8_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("methods_8_willow_big", `${GH_BASE}/Weeping_Willow1Big.png`);
    this.load.image("methods_8_willow", `${GH_BASE}/Weeping_Willow1.png`);
    this.load.image("methods_8_tree_1", `${GH_BASE}/Tree1.png`);
    this.load.image("methods_8_large_pine", `${GH_BASE}/Large_Pine_Tree.png`);
    this.load.image("methods_8_wheat", `${GH_BASE}/Pixel_Art_Wheat.png`);
    this.load.image("methods_8_signage_1", `${ASSET_BASE}/other/signage1.png`);
    this.load.image("methods_8_signage_2", `${ASSET_BASE}/other/signage2.png`);
    this.load.spritesheet(
      "methods_8_aswang",
      `${ASSET_BASE}/characters/monsters/Manangy-fly_idle.png`,
      { frameWidth: 256, frameHeight: 256 },
    );
    this.load.spritesheet(
      "methods_8_player",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
    this.load.image("methods_8_bg5", `${BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("methods_8_bg4", `${BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("methods_8_bg3", `${BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("methods_8_bg2", `${BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("methods_8_bg1", `${BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
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
    this.throwPoint = this.points.salt_throw_point ?? this.points.player_spawn ?? { x: 120, y: 460 };
    this.spawnPoint = this.points.player_spawn ?? { x: this.throwPoint.x, y: this.throwPoint.y };
    this.diwataPoint = this.points.diwata_spawn ?? { x: this.spawnPoint.x + 160, y: this.spawnPoint.y };
    this.saltTarget = this.points.salt_target ?? this.points.aswang_spawn ?? { x: this.spawnPoint.x + 650, y: this.spawnPoint.y };
    this.aswangPoint = this.points.aswang_spawn ?? { x: this.saltTarget.x, y: this.saltTarget.y };
    this.exitPoint = this.points.level_exit ?? { x: this.aswangPoint.x + 105, y: this.spawnPoint.y };
    this.groundY = Math.max(this.spawnPoint.y, this.aswangPoint.y, this.exitPoint.y);
    this.distanceMarkers = this.createDistanceMarkerPoints();
    this.tooShortPoint = this.distanceMarkers[2] ?? this.saltTarget;
    this.overshootPoint = this.points.overshoot_point ?? {
      x: this.saltTarget.x + 120,
      y: this.saltTarget.y,
    };

    this.createDiwata();
    this.createAswang();
    this.createPlayer();
    this.createLabels();
    this.createDistanceMarkers();
    this.setupCamera(map);

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.on(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  createBackgrounds(map) {
    [
      ["methods_8_bg5", 0.08, -8, 0.78, 0],
      ["methods_8_bg4", 0.14, -7, 0.7, 0],
      ["methods_8_bg3", 0.32, -6, 0.62, 88],
      ["methods_8_bg2", 0.58, -5, 0.58, 176],
      ["methods_8_bg1", 0.82, -4, 0.5, 225],
    ].forEach(([key, factor, depth, alpha, y]) => {
      this.add
        .tileSprite(0, y, map.widthInPixels, this.scale.height - y, key)
        .setOrigin(0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x20384c)
        .setAlpha(alpha);
    });
    this.add.rectangle(0, 0, map.widthInPixels, 576, 0x09030a, 0.34).setOrigin(0).setDepth(-3);
  }

  createTileLayers(map) {
    const tilesets = [
      map.addTilesetImage("Floor_Tiles2", "methods_8_floor"),
      map.addTilesetImage("Decor", "methods_8_decor"),
      map.addTilesetImage("Garden_Decorations", "methods_8_garden"),
      map.addTilesetImage("Pine_Trees", "methods_8_pines"),
      map.addTilesetImage("House_Tiles", "methods_8_house"),
      map.addTilesetImage("Other_Tiles2", "methods_8_other"),
      map.addTilesetImage("Other_Tiles2(Flipped)", "methods_8_other_flipped"),
      map.addTilesetImage("Pine_forest_sheet", "methods_8_forest"),
      map.addTilesetImage("Weeping_Willow1Big", "methods_8_willow_big"),
      map.addTilesetImage("Weeping_Willow1", "methods_8_willow"),
      map.addTilesetImage("Tree1", "methods_8_tree_1"),
      map.addTilesetImage("Large_Pine_Tree", "methods_8_large_pine"),
      map.addTilesetImage("Pixel_Art_Wheat", "methods_8_wheat"),
      map.addTilesetImage("signage1", "methods_8_signage_1"),
      map.addTilesetImage("signage2", "methods_8_signage_2"),
    ].filter(Boolean);

    ["platform", "trees", "decoration", "front_decoration"].forEach((name, index) => {
      const layer = map.createLayer(name, tilesets, 0, this.offsetY);
      if (layer) layer.setDepth(0.05 + index * 0.25);
    });
  }

  createAnimations() {
    [
      ["methods-8-player-idle", 0, 5, 6],
      ["methods-8-player-run", 16, 23, 12],
      ["methods-8-player-hurt", 48, 55, 10],
      ["methods-8-player-cast", 64, 71, 10],
    ].forEach(([key, start, end, frameRate]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("methods_8_player", { start, end }),
        frameRate,
        repeat: key.includes("hurt") || key.includes("cast") ? 0 : -1,
      });
    });
    if (!this.anims.exists("methods-8-aswang-idle")) {
      this.anims.create({
        key: "methods-8-aswang-idle",
        frames: this.anims.generateFrameNumbers("methods_8_aswang", { start: 0, end: 7 }),
        frameRate: 8,
        repeat: -1,
      });
    }
  }

  createDiwata() {
    this.diwataHalo = this.add
      .ellipse(this.diwataPoint.x, this.diwataPoint.y - 35, 62, 86, 0x9fffe9, 0.11)
      .setDepth(1.3)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.diwata = new LayeredLpcCharacter(this, this.diwataPoint.x, this.diwataPoint.y, DIWATA_FAIRY_CONFIG, {
      scale: DIWATA_SCALE,
      depth: 1.86,
      direction: "right",
      animationName: "idle",
    });
  }

  createAswang() {
    this.aswangAura = this.add
      .ellipse(this.aswangPoint.x, this.aswangPoint.y - 56, 112, 142, 0x42101c, 0.36)
      .setDepth(1.35)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.aswang = this.add
      .sprite(this.aswangPoint.x, this.aswangPoint.y - 8, "methods_8_aswang", 0)
      .setOrigin(0.5, 1)
      .setScale(ASWANG_SCALE)
      .setDepth(1.82)
      .setFlipX(true)
      .setTint(0xd4b8c4)
      .play("methods-8-aswang-idle");
    this.tweens.add({
      targets: this.aswangAura,
      alpha: 0.48,
      scaleX: 1.08,
      scaleY: 1.06,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createPlayer() {
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "methods_8_player", 0)
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.9)
      .play("methods-8-player-idle");
  }

  createLabels() {
    this.callText = this.add
      .text(this.throwPoint.x + 44, this.throwPoint.y - 92, "ThrowSalt(?)", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#f4e7cc",
        backgroundColor: "#07141fd6",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(2.1);
    this.amountText = this.add
      .text(this.throwPoint.x + 4, this.throwPoint.y - 132, "", {
        fontFamily: "monospace",
        fontSize: "30px",
        fontStyle: "bold",
        color: "#f8fbff",
        stroke: "#1b2530",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(2.15);
  }

  createDistanceMarkerPoints() {
    return Array.from({ length: REQUIRED_SALT_AMOUNT }, (_, index) => {
      const amount = index + 1;
      const progress = amount / REQUIRED_SALT_AMOUNT;
      return {
        amount,
        x: Phaser.Math.Linear(this.throwPoint.x, this.saltTarget.x, progress),
        y: this.saltTarget.y,
      };
    });
  }

  createDistanceMarkers() {
    this.markerGroup = this.add.group();
    this.markerVisuals = new Map();
    this.distanceMarkers.forEach((marker) => {
      const markerY = this.groundY - 20;
      const isTarget = marker.amount === REQUIRED_SALT_AMOUNT;
      const ring = this.add
        .ellipse(marker.x, markerY, 27, 10, 0x203548, 0.055)
        .setStrokeStyle(1, 0x88abc0, 0.13)
        .setDepth(1.08)
        .setBlendMode(Phaser.BlendModes.SCREEN);
      const number = this.add
        .text(marker.x, markerY - 19, String(marker.amount), {
          fontFamily: "monospace",
          fontSize: "10px",
          fontStyle: "bold",
          color: "#546e79",
          backgroundColor: "#07141f33",
          padding: { x: 3, y: 1 },
        })
        .setOrigin(0.5)
        .setDepth(2.04);
      this.markerVisuals.set(marker.amount, { ring, number, isTarget });
      this.markerGroup.addMultiple([ring, number]);
    });
  }

  onCodeEvaluated({ levelNumber, isCorrect, sourceCode }) {
    if (Number(levelNumber) !== LEVEL_NUMBER) return;
    this.lastSourceCode = sourceCode ?? "";
    this.resetAttempt();
    if (isCorrect) this.startThrow(REQUIRED_SALT_AMOUNT, true);
    else this.startThrow(this.extractSaltAmount(this.lastSourceCode), false);
  }

  onDialogueClosed({ levelNumber }) {
    if (Number(levelNumber) !== LEVEL_NUMBER) return;
    this.playOpeningPreview();
  }

  startThrow(amount, isCorrect) {
    this.sequenceMode = "throwing";
    const displayAmount = Number.isFinite(amount) ? amount : "?";
    const target = this.resolveThrowTarget(amount, isCorrect);
    this.callText.setText(`ThrowSalt(${displayAmount})`).setColor(isCorrect ? "#f8fbff" : "#ffb8c0");
    this.amountText.setText(displayAmount).setColor(isCorrect ? "#f8fbff" : "#ffb8c0").setAlpha(1);
    this.player.play("methods-8-player-cast", true);
    this.panTo(this.aswangPoint.x - 110, 520);
    if (isCorrect) this.highlightTargetMarker();
    this.createThrowArc(target, isCorrect);
    this.schedule(260, () => this.throwSaltParticles(amount, isCorrect));
  }

  highlightTargetMarker() {
    const marker = this.markerVisuals?.get(REQUIRED_SALT_AMOUNT);
    if (!marker) return;
    const { ring, number } = marker;
    this.tweens.killTweensOf([ring, number]);
    ring.setFillStyle(HIT_BLUE, 0.13).setStrokeStyle(1, HIT_BLUE, 0.42).setScale(1.08, 1.12);
    number.setColor("#b9dae3").setBackgroundColor("#07141f66");
  }

  createThrowArc(target, isCorrect) {
    const arc = this.add.graphics().setDepth(2.05).setAlpha(0);
    arc.lineStyle(1, isCorrect ? HIT_BLUE : FAIL_RED, isCorrect ? 0.32 : 0.24);
    const startX = this.throwPoint.x + 6;
    const startY = this.throwPoint.y - 54;
    const peakY = Math.min(startY, target.y) - 46;
    const points = [];
    for (let index = 0; index <= 18; index += 1) {
      const progress = index / 18;
      points.push({
        x: Phaser.Math.Linear(startX, target.x, progress),
        y: Phaser.Math.Interpolation.Bezier([startY, peakY, target.y], progress),
      });
    }
    points.forEach((point, index) => {
      if (index % 2 === 0 || index === 0) return;
      const previous = points[index - 1];
      arc.lineBetween(previous.x, previous.y, point.x, point.y);
    });
    this.temporaryEffects.push(arc);
    this.tweens.add({
      targets: arc,
      alpha: { from: 0, to: 1 },
      duration: 120,
      yoyo: true,
      hold: 560,
      ease: "Sine.easeInOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, arc);
        arc.destroy();
      },
    });
  }

  throwSaltParticles(amount, isCorrect) {
    const target = this.resolveThrowTarget(amount, isCorrect);
    const particles = [];
    for (let index = 0; index < 26; index += 1) {
      const particle = this.add
        .circle(
          this.throwPoint.x + Phaser.Math.Between(-4, 10),
          this.throwPoint.y - Phaser.Math.Between(42, 68),
          Phaser.Math.Between(2, 4),
          SALT_WHITE,
          0.94,
        )
        .setDepth(2.16)
        .setBlendMode(Phaser.BlendModes.ADD);
      particles.push(particle);
      this.temporaryEffects.push(particle);
      const drift = Phaser.Math.Between(-34, 34);
      const peak = Math.min(particle.y, target.y) - Phaser.Math.Between(28, 58);
      this.tweens.add({
        targets: { progress: 0 },
        progress: 1,
        delay: index * 10,
        duration: 520 + Phaser.Math.Between(-70, 90),
        ease: "Sine.easeOut",
        onUpdate: (tween) => {
          const progress = tween.targets[0].progress;
          particle.x = Phaser.Math.Linear(this.throwPoint.x, target.x + drift, progress);
          particle.y = Phaser.Math.Interpolation.Bezier([this.throwPoint.y - 52, peak, target.y + Phaser.Math.Between(-12, 12)], progress);
          particle.setAlpha(1 - progress * 0.25);
        },
        onComplete: () => {
          Phaser.Utils.Array.Remove(this.temporaryEffects, particle);
          particle.destroy();
        },
      });
    }
    this.schedule(760, () => {
      if (isCorrect) this.hitAswang();
      else this.failThrow(amount);
    });
  }

  resolveThrowTarget(amount, isCorrect) {
    if (isCorrect) return this.saltTarget;
    if (Number.isFinite(amount) && amount >= 1 && amount <= REQUIRED_SALT_AMOUNT) {
      return this.distanceMarkers[Math.max(0, amount - 1)] ?? this.tooShortPoint;
    }
    if (!Number.isFinite(amount) || amount < REQUIRED_SALT_AMOUNT) return this.tooShortPoint;
    return this.overshootPoint;
  }

  hitAswang() {
    this.amountText.setAlpha(0);
    this.createLandingSparkle(this.saltTarget, HIT_BLUE);
    this.createHitBurst();
    this.aswang.setTint(HIT_BLUE);
    this.aswangAura.setTint(HIT_BLUE).setAlpha(0.58);
    this.schedule(140, () => {
      this.aswang.clearTint();
      this.aswangAura.clearTint();
    });
    this.tweens.add({
      targets: [this.aswang, this.aswangAura],
      x: "+=150",
      y: "-=44",
      alpha: 0,
      duration: 780,
      ease: "Sine.easeInOut",
    });
    this.schedule(860, () => {
      this.player.play("methods-8-player-idle", true);
      this.finishSuccess();
    });
  }

  failThrow(amount) {
    this.amountText.setAlpha(0);
    this.callText.setText(Number.isFinite(amount) && amount > REQUIRED_SALT_AMOUNT ? "too much" : "too weak").setColor("#ffb8c0");
    const target = this.resolveThrowTarget(amount, false);
    this.createLandingSparkle(target, FAIL_RED);
    this.createMissLabel(amount, target);
    this.flashMissMarker(amount);
    this.tweens.add({
      targets: [this.aswang, this.aswangAura],
      x: "-=20",
      duration: 120,
      yoyo: true,
      repeat: 3,
      ease: "Sine.easeInOut",
    });
    this.player.play("methods-8-player-hurt", true);
    this.schedule(900, () => {
      if (this.sequenceMode !== "throwing") return;
      this.callText.setText("ThrowSalt(?)").setColor("#f4e7cc");
      this.player.play("methods-8-player-idle", true);
      this.sequenceMode = "idle";
      this.panTo(this.spawnPoint.x, 420);
    });
  }

  flashMissMarker(amount) {
    const marker = this.markerVisuals?.get(amount);
    if (!marker) return;
    const { ring, number } = marker;
    this.tweens.killTweensOf([ring, number]);
    ring.setFillStyle(FAIL_RED, 0.13).setStrokeStyle(1, FAIL_RED, 0.44).setScale(1);
    number.setColor("#ffb8c0").setBackgroundColor("#2a0c1399");
    this.tweens.add({
      targets: [ring, number],
      alpha: 0.42,
      duration: 160,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
      onComplete: () => this.restoreMarker(amount),
    });
  }

  createMissLabel(amount, target) {
    const label = this.add
      .text(
        target.x,
        target.y - 48,
        Number.isFinite(amount) && amount > REQUIRED_SALT_AMOUNT ? "overshot" : "fell short",
        {
          fontFamily: "monospace",
          fontSize: "12px",
          fontStyle: "bold",
          color: "#ffb8c0",
          backgroundColor: "#160711cc",
          padding: { x: 6, y: 3 },
        },
      )
      .setOrigin(0.5)
      .setDepth(2.2)
      .setAlpha(0);
    this.temporaryEffects.push(label);
    this.tweens.add({
      targets: label,
      y: label.y - 8,
      alpha: { from: 0, to: 1 },
      duration: 180,
      hold: 520,
      yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, label);
        label.destroy();
      },
    });
  }

  restoreMarker(amount) {
    const marker = this.markerVisuals?.get(amount);
    if (!marker) return;
    const { ring, number } = marker;
    ring
      .setAlpha(1)
      .setScale(1)
      .setFillStyle(0x203548, 0.055)
      .setStrokeStyle(1, 0x88abc0, 0.13);
    number
      .setAlpha(1)
      .setColor("#546e79")
      .setBackgroundColor("#07141f33");
  }

  createLandingSparkle(target, color) {
    for (let index = 0; index < 14; index += 1) {
      const sparkle = this.add
        .circle(target.x + Phaser.Math.Between(-18, 18), target.y - 2, Phaser.Math.Between(1, 3), color, 0.82)
        .setDepth(2.17)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.temporaryEffects.push(sparkle);
      this.tweens.add({
        targets: sparkle,
        x: sparkle.x + Phaser.Math.Between(-24, 24),
        y: sparkle.y - Phaser.Math.Between(10, 34),
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(360, 680),
        ease: "Sine.easeOut",
        onComplete: () => {
          Phaser.Utils.Array.Remove(this.temporaryEffects, sparkle);
          sparkle.destroy();
        },
      });
    }
  }

  createHitBurst() {
    for (let index = 0; index < 20; index += 1) {
      const burst = this.add
        .circle(this.saltTarget.x, this.saltTarget.y - 14, Phaser.Math.Between(3, 7), HIT_BLUE, 0.9)
        .setDepth(2.18)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.temporaryEffects.push(burst);
      this.tweens.add({
        targets: burst,
        x: burst.x + Phaser.Math.Between(-70, 70),
        y: burst.y + Phaser.Math.Between(-64, 44),
        alpha: 0,
        scale: 0.3,
        duration: Phaser.Math.Between(520, 880),
        ease: "Sine.easeOut",
        onComplete: () => {
          Phaser.Utils.Array.Remove(this.temporaryEffects, burst);
          burst.destroy();
        },
      });
    }
  }

  playOpeningPreview() {
    this.schedule(260, () => {
      if (this.sequenceMode !== "idle") return;
      this.panTo(this.aswangPoint.x - 120, 760);
    });
    this.schedule(1380, () => {
      if (this.sequenceMode !== "idle") return;
      this.panTo(this.spawnPoint.x, 760);
    });
  }

  resetAttempt() {
    this.sequenceTimers.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.temporaryEffects.forEach((effect) => effect.destroy());
    this.temporaryEffects = [];
    this.tweens.killTweensOf([this.player, this.aswang, this.aswangAura, this.callText, this.amountText]);
    this.markerVisuals?.forEach((_marker, amount) => this.restoreMarker(amount));
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y).setAlpha(1).setTint(0xffffff);
    this.player.play("methods-8-player-idle", true);
    this.aswang.setPosition(this.aswangPoint.x, this.aswangPoint.y - 8).setAlpha(1).clearTint();
    this.aswangAura.setPosition(this.aswangPoint.x, this.aswangPoint.y - 56).setAlpha(0.36).clearTint();
    this.callText.setText("ThrowSalt(?)").setColor("#f4e7cc").setAlpha(1);
    this.amountText.setText("").setAlpha(0);
    this.sequenceMode = "idle";
    this.cameras.main.stopFollow();
    this.panTo(this.spawnPoint.x, 240);
  }

  finishSuccess() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    this.cameras.main.stopFollow();
    this.player.play("methods-8-player-idle", true);
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: `ThrowSalt received ${REQUIRED_SALT_AMOUNT}, so the measured salt reached the aswang.`,
      shouldProceed: true,
    });
  }

  extractSaltAmount(sourceCode) {
    const match = (sourceCode ?? "").match(/\bThrowSalt\s*\(\s*([^)]*?)\s*\)\s*;/);
    const value = Number(match?.[1]?.trim());
    return Number.isFinite(value) ? value : NaN;
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
