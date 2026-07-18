import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_DIALOGUE_CLOSED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";
import LayeredLpcCharacter from "../characters/LayeredLpcCharacter";
import { DIWATA_FAIRY_CONFIG } from "../characters/diwataFairyConfig";

const LEVEL_NUMBER = 14;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const MAP_KEY = "methods_level_1_first_ritual";
const MAP_PATH = `${ASSET_BASE}/maps/methods-level-1-first-ritual.tmj`;
const PLAYER_SCALE = 2;
const PLAYER_SPEED = 170;
const RITUAL_STOP_OFFSET_X = 58;
const DIWATA_SCALE = 1.55;
const RITUAL_COLOR = 0x7ff6d1;
const RITUAL_GOLD = 0xf5d37a;
const RITUAL_FAIL = 0xff6b7a;
const BARRIER_PORTAL_KEY = "methods-1-barrier-portal";
const BARRIER_DIM_ALPHA = 0.64;
const BARRIER_DIM_GLOW_ALPHA = 0.08;
const BARRIER_DEFINED_ALPHA = 0.82;
const BARRIER_OPEN_ALPHA = 1;

export default class MethodsLevelOneScene extends Phaser.Scene {
  constructor() {
    super("MethodsLevelOneScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("methods_1_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("methods_1_decor", `${GH_BASE}/Decor.png`);
    this.load.image("methods_1_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("methods_1_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("methods_1_house", `${GH_BASE}/House_Tiles.png`);
    this.load.image("methods_1_other", `${GH_BASE}/Other_Tiles2.png`);
    this.load.image("methods_1_other_flipped", `${GH_BASE}/Other_Tiles2(Flipped).png`);
    this.load.image("methods_1_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("methods_1_willow", `${GH_BASE}/Weeping_Willow1Big.png`);
    this.load.image("methods_1_wheat", `${GH_BASE}/Pixel_Art_Wheat.png`);
    this.load.image("methods_1_signage_1", `${ASSET_BASE}/other/signage1.png`);
    this.load.image("methods_1_signage_2", `${ASSET_BASE}/other/signage2.png`);
    this.load.spritesheet(
      "methods_1_portal",
      `${GH_BASE}/Animated_Sprites/GandalfHardcore_Portal_sheet.png`,
      { frameWidth: 64, frameHeight: 64 },
    );
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
    this.load.spritesheet(
      "methods_1_player",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    this.load.image("methods_1_bg5", `${BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("methods_1_bg4", `${BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("methods_1_bg3", `${BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("methods_1_bg2", `${BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("methods_1_bg1", `${BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
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
    this.diwataPoint = this.points.diwata_spawn ?? { x: 520, y: this.spawnPoint.y };
    this.ritualPoint = this.points.ritual_circle ?? { x: 720, y: this.spawnPoint.y };
    this.barrierPoint =
      this.points.exit_barrier ??
      this.points.barrier ??
      { x: 980, y: this.spawnPoint.y };
    this.exitPoint = this.points.level_exit ?? { x: map.widthInPixels - 92, y: this.spawnPoint.y };
    this.groundY = Math.max(this.spawnPoint.y, this.exitPoint.y);
    this.barrierBasePoint = {
      x: this.barrierPoint.x,
      y: Math.max(this.barrierPoint.y, this.groundY),
    };

    this.createRitualCircle();
    this.createDiwata();
    this.createBarrier();
    this.createPlayer();
    this.createHintPanel();
    this.setupCamera(map);

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.on(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  update(_time, delta) {
    if (!this.player) return;
    const step = (PLAYER_SPEED * delta) / 1000;

    if (this.sequenceMode === "walkingToRitual") {
      this.player.play("methods-1-player-run", true);
      this.player.setFlipX(false);
      this.player.x = Math.min(this.player.x + step, this.ritualPoint.x - RITUAL_STOP_OFFSET_X);
      if (this.player.x >= this.ritualPoint.x - RITUAL_STOP_OFFSET_X) {
        this.sequenceMode = "activating";
        this.player.play("methods-1-player-idle", true);
        this.cameras.main.stopFollow();
        this.activateRitual();
      }
    }

    if (this.sequenceMode === "walkingToExit") {
      this.player.play("methods-1-player-run", true);
      this.player.setFlipX(false);
      this.player.x = Math.min(this.player.x + step, this.exitPoint.x);
      if (this.player.x >= this.exitPoint.x) this.finishSuccess();
    }
  }

  createBackgrounds(map) {
    [
      ["methods_1_bg5", 0.08, -8, 0.78, 0],
      ["methods_1_bg4", 0.14, -7, 0.7, 0],
      ["methods_1_bg3", 0.32, -6, 0.62, 88],
      ["methods_1_bg2", 0.58, -5, 0.58, 176],
      ["methods_1_bg1", 0.82, -4, 0.5, 225],
    ].forEach(([key, factor, depth, alpha, y]) => {
      this.add
        .tileSprite(0, y, map.widthInPixels, this.scale.height - y, key)
        .setOrigin(0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x20384c)
        .setAlpha(alpha);
    });
    this.add.rectangle(0, 0, map.widthInPixels, 576, 0x030711, 0.28).setOrigin(0).setDepth(-3);
  }

  createTileLayers(map) {
    const tilesets = [
      map.addTilesetImage("Floor_Tiles2", "methods_1_floor"),
      map.addTilesetImage("Decor", "methods_1_decor"),
      map.addTilesetImage("Garden_Decorations", "methods_1_garden"),
      map.addTilesetImage("Pine_Trees", "methods_1_pines"),
      map.addTilesetImage("House_Tiles", "methods_1_house"),
      map.addTilesetImage("Other_Tiles2", "methods_1_other"),
      map.addTilesetImage("Other_Tiles2(Flipped)", "methods_1_other_flipped"),
      map.addTilesetImage("Pine_forest_sheet", "methods_1_forest"),
      map.addTilesetImage("Weeping_Willow1Big", "methods_1_willow"),
      map.addTilesetImage("Pixel_Art_Wheat", "methods_1_wheat"),
      map.addTilesetImage("signage1", "methods_1_signage_1"),
      map.addTilesetImage("signage2", "methods_1_signage_2"),
    ].filter(Boolean);

    ["platform", "trees", "decoration", "front_decoration"].forEach((name, index) => {
      const layer = map.createLayer(name, tilesets, 0, this.offsetY);
      if (layer) layer.setDepth(0.1 + index * 0.25);
    });
  }

  createAnimations() {
    [
      ["methods-1-player-idle", 0, 5, 6],
      ["methods-1-player-run", 16, 23, 12],
      ["methods-1-player-hurt", 48, 55, 10],
    ].forEach(([key, start, end, frameRate]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("methods_1_player", { start, end }),
        frameRate,
        repeat: key.includes("hurt") ? 0 : -1,
      });
    });
    if (!this.anims.exists(BARRIER_PORTAL_KEY)) {
      this.anims.create({
        key: BARRIER_PORTAL_KEY,
        frames: this.anims.generateFrameNumbers("methods_1_portal", {
          start: 0,
          end: 9,
        }),
        frameRate: 9,
        repeat: -1,
      });
    }
  }

  createRitualCircle() {
    const x = this.ritualPoint.x;
    const y = this.ritualPoint.y + 2;
    this.ritual = this.add.container(x, y).setDepth(1.05);
    this.ritualGroundGlow = this.add
      .ellipse(0, 2, 104, 20, RITUAL_GOLD, 0.05)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.ritualGlow = this.add
      .ellipse(0, -1, 118, 26, RITUAL_COLOR, 0.045)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.outerRing = this.add.ellipse(0, 1, 106, 22).setStrokeStyle(1, RITUAL_COLOR, 0.28);
    this.middleRing = this.add.ellipse(0, 1, 72, 15).setStrokeStyle(1, RITUAL_GOLD, 0.18);
    this.innerRing = this.add.ellipse(0, 1, 36, 8).setStrokeStyle(1, 0xdffff0, 0.16);
    this.ritualBeam = this.add
      .rectangle(0, -44, 48, 96, RITUAL_COLOR, 0.04)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.ritualBeam.setAlpha(0);
    this.ritualGlyphs = [-34, 0, 34].map((glyphX, index) =>
      this.add
        .text(glyphX, index === 1 ? -4 : 5, index === 1 ? "{}" : "·", {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#e8fff5",
        })
        .setOrigin(0.5)
        .setAlpha(0.18),
    );
    this.runeMark = this.add
      .text(0, -26, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d9fff1",
        backgroundColor: "#07141fcc",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.ritual.add([
      this.ritualGroundGlow,
      this.ritualBeam,
      this.ritualGlow,
      this.outerRing,
      this.middleRing,
      this.innerRing,
      ...this.ritualGlyphs,
      this.runeMark,
    ]);
    this.startRitualIdleTweens();
  }

  startRitualIdleTweens() {
    this.tweens.add({
      targets: [this.outerRing, this.middleRing, this.innerRing],
      alpha: { from: 0.18, to: 0.4 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.ritualGlyphs,
      alpha: { from: 0.1, to: 0.24 },
      duration: 1800,
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
        depth: 1.45,
        scale: DIWATA_SCALE,
      },
    );
    this.diwataGlow = this.add
      .ellipse(this.diwataPoint.x, this.diwataPoint.y - 34, 54, 74, 0x9effd5, 0.09)
      .setDepth(1.35)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.diwataLabel = this.add
      .text(this.diwataPoint.x, this.diwataPoint.y - 108, "Define, then call.", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d9fff1",
        backgroundColor: "#07141fde",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(1.7);

    this.tweens.add({
      targets: [this.diwata, this.diwataGlow],
      y: "-=6",
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createBarrier() {
    this.barrier = this.add.container(this.barrierBasePoint.x, this.barrierBasePoint.y).setDepth(1.5);
    const aura = this.add
      .ellipse(0, -46, 92, 130, 0x8feeff, BARRIER_DIM_GLOW_ALPHA)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    const backGlow = this.add
      .ellipse(0, -43, 62, 94, 0x42dfff, BARRIER_DIM_GLOW_ALPHA)
      .setBlendMode(Phaser.BlendModes.ADD);
    const portal = this.add
      .sprite(0, -7, "methods_1_portal", 0)
      .setOrigin(0.5, 1)
      .setScale(1.42)
      .setAlpha(BARRIER_DIM_ALPHA)
      .setTint(0x8ec6d8)
      .play(BARRIER_PORTAL_KEY);
    const label = this.add
      .text(0, -116, "sealed path", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d9f3ff",
        backgroundColor: "#07141fde",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5);
    this.barrier.add([aura, backGlow, portal, label]);
    this.barrierGlow = aura;
    this.barrierCore = portal;
    this.barrierBackGlow = backGlow;
    this.tweens.add({
      targets: [aura, backGlow],
      alpha: 0.18,
      duration: 950,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: portal,
      scaleX: 1.5,
      scaleY: 1.48,
      alpha: BARRIER_DEFINED_ALPHA,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createPlayer() {
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "methods_1_player", 0)
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.8)
      .play("methods-1-player-idle");
  }

  createHintPanel() {
    this.statusText = this.add
      .text(this.barrierBasePoint.x, this.barrierBasePoint.y - 146, "method not called", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#f3e6c4",
        backgroundColor: "#07141fdd",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setAlpha(0.86);
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
      this.outerRing,
      this.innerRing,
      this.middleRing,
      this.ritualGroundGlow,
      this.ritualGlow,
      this.ritualBeam,
      ...this.ritualGlyphs,
      this.runeMark,
      this.barrier,
      this.barrierGlow,
      this.barrierCore,
      this.barrierBackGlow,
      this.statusText,
    ]);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y).setAlpha(1).setTint(0xffffff);
    this.player.play("methods-1-player-idle", true);
    this.diwata.playIdle("left");
    this.barrier.setPosition(this.barrierBasePoint.x, this.barrierBasePoint.y).setAlpha(1).setScale(1);
    this.outerRing.setStrokeStyle(2, RITUAL_COLOR, 0.42).setScale(1).setAlpha(1);
    this.middleRing.setStrokeStyle(1, RITUAL_GOLD, 0.26).setScale(1).setAlpha(1);
    this.innerRing.setStrokeStyle(1, 0xdffff0, 0.22).setScale(1).setAlpha(1);
    this.ritualGroundGlow.setFillStyle(RITUAL_GOLD, 0.08).setAlpha(1).setScale(1);
    this.ritualGlow.setFillStyle(RITUAL_COLOR, 0.08).setAlpha(1).setScale(1);
    this.ritualBeam.setFillStyle(RITUAL_COLOR, 0.045).setAlpha(0).setScale(1);
    this.ritualGlyphs.forEach((glyph) => glyph.setColor("#e8fff5").setAlpha(0.25).setScale(1));
    this.runeMark.setText("").setColor("#d9fff1").setAlpha(0);
    this.barrierGlow.setAlpha(BARRIER_DIM_GLOW_ALPHA).setScale(1);
    this.barrierBackGlow.setAlpha(BARRIER_DIM_GLOW_ALPHA).setScale(1);
    this.barrierCore
      .setAlpha(BARRIER_DIM_ALPHA)
      .setScale(1.42)
      .setTint(0x8ec6d8)
      .play(BARRIER_PORTAL_KEY, true);
    this.statusText.setText("method not called").setColor("#f3e6c4").setAlpha(0.86);
    this.diwataLabel.setText("Define, then call.").setColor("#d9fff1");
    this.startRitualIdleTweens();
    this.sequenceMode = "idle";
    this.cameras.main.stopFollow();
    this.panTo(this.spawnPoint.x, 280);
  }

  startSuccess() {
    this.sequenceMode = "walkingToRitual";
    this.statusText.setText("method named").setColor("#bfffe5");
    this.diwataLabel.setText("Now call the ritual.").setColor("#bfffe5");
    this.setBarrierStage("defined");
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08, -220, 0);
  }

  activateRitual() {
    this.panTo(this.ritualPoint.x, 520);
    this.statusText.setText("method named").setColor("#f5d98e");
    this.diwataLabel.setText("The action now has a name.").setColor("#f5d98e");
    this.pulseRitual(RITUAL_GOLD, { beam: false });

    this.schedule(620, () => {
      this.statusText.setText("ritual called").setColor("#bfffe5");
      this.diwataLabel.setText("Now the named action runs.").setColor("#ffffff");
      this.diwata.playAnimation("spellcast", "left");
      this.setBarrierStage("called");
      this.pulseRitual(RITUAL_COLOR, { beam: true });
      this.createRitualParticles();
      this.createRitualWave();
      this.createRitualToBarrierStreak();
    });

    this.schedule(1360, () => this.showBarrierOpening());
  }

  showBarrierOpening() {
    this.statusText.setText("seal responding").setColor("#dfffea");
    this.diwataLabel.setText("The call reaches the sealed path.").setColor("#ffffff");
    this.panTo(this.barrierBasePoint.x, 720);
    this.schedule(760, () => this.openBarrier());
  }

  setBarrierStage(stage) {
    const settings = {
      idle: {
        coreAlpha: BARRIER_DIM_ALPHA,
        coreTint: 0x8ec6d8,
        glowAlpha: BARRIER_DIM_GLOW_ALPHA,
        scale: 1.42,
      },
      defined: {
        coreAlpha: BARRIER_DEFINED_ALPHA,
        coreTint: 0xa9e7ff,
        glowAlpha: 0.18,
        scale: 1.44,
      },
      called: {
        coreAlpha: 0.94,
        coreTint: 0xc8ffff,
        glowAlpha: 0.27,
        scale: 1.48,
      },
      open: {
        coreAlpha: BARRIER_OPEN_ALPHA,
        coreTint: 0xffffff,
        glowAlpha: 0.38,
        scale: 1.54,
      },
    }[stage];
    if (!settings) return;

    this.barrierCore.setTint(settings.coreTint);
    this.tweens.add({
      targets: [this.barrierCore],
      alpha: settings.coreAlpha,
      scaleX: settings.scale,
      scaleY: settings.scale,
      duration: 360,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: [this.barrierGlow, this.barrierBackGlow],
      alpha: settings.glowAlpha,
      scaleX: stage === "open" ? 1.12 : 1,
      scaleY: stage === "open" ? 1.08 : 1,
      duration: 360,
      ease: "Sine.easeOut",
    });
  }

  pulseRitual(color, { beam = false } = {}) {
    this.ritualGlow.setFillStyle(color, 0.08);
    this.ritualGroundGlow.setFillStyle(color, 0.06);
    this.outerRing.setStrokeStyle(1, color, 0.38);
    this.middleRing.setStrokeStyle(1, color === RITUAL_GOLD ? RITUAL_COLOR : RITUAL_GOLD, 0.24);
    this.tweens.add({
      targets: [this.ritualGlow, this.ritualGroundGlow],
      alpha: 0.28,
      scaleX: 1.12,
      scaleY: 1.18,
      duration: 460,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: [this.outerRing, this.middleRing, this.innerRing],
      scaleX: 1.08,
      scaleY: 1.16,
      duration: 420,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
    if (beam) {
      this.tweens.add({
        targets: this.ritualBeam,
        alpha: 0.26,
        scaleY: 1.18,
        duration: 640,
        yoyo: true,
        repeat: 1,
        ease: "Sine.easeInOut",
      });
    }
    this.tweens.add({
      targets: this.ritualGlyphs,
      alpha: 0.68,
      scale: 1.1,
      duration: 360,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
  }

  createRitualParticles() {
    for (let index = 0; index < 24; index += 1) {
      const angle = (Math.PI * 2 * index) / 24;
      const spark = this.add
        .circle(
          this.ritualPoint.x + Math.cos(angle) * 44,
          this.ritualPoint.y + Math.sin(angle) * 10,
          index % 3 === 0 ? 2.4 : 1.8,
          index % 2 === 0 ? RITUAL_COLOR : RITUAL_GOLD,
          0.78,
        )
        .setDepth(1.7)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: spark,
        x: this.ritualPoint.x + Math.cos(angle) * 82,
        y: this.ritualPoint.y - 48 + Math.sin(angle) * 22,
        alpha: 0,
        scale: 0.4,
        duration: 820,
        delay: index * 14,
        ease: "Sine.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  createRitualWave() {
    const wave = this.add
      .ellipse(this.ritualPoint.x, this.ritualPoint.y + 3, 60, 16)
      .setStrokeStyle(2, RITUAL_COLOR, 0.55)
      .setDepth(1.65)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.tweens.add({
      targets: wave,
      scaleX: 2.55,
      scaleY: 2.1,
      alpha: 0,
      duration: 900,
      ease: "Sine.easeOut",
      onComplete: () => wave.destroy(),
    });
  }

  createRitualToBarrierStreak() {
    const startX = this.ritualPoint.x + 28;
    const startY = this.ritualPoint.y - 28;
    const endX = this.barrierBasePoint.x - 14;
    const endY = this.barrierBasePoint.y - 58;
    const distance = Phaser.Math.Distance.Between(startX, startY, endX, endY);
    const angle = Phaser.Math.Angle.Between(startX, startY, endX, endY);

    const streak = this.add
      .rectangle(startX, startY, 2, 3, RITUAL_COLOR, 0.9)
      .setOrigin(0, 0.5)
      .setRotation(angle)
      .setDepth(1.72)
      .setBlendMode(Phaser.BlendModes.ADD);
    const head = this.add
      .circle(startX, startY, 3, 0xe8fff5, 0.95)
      .setDepth(1.73)
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
          ease: "Sine.easeIn",
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
      duration: 440,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.tweens.add({
          targets: head,
          alpha: 0,
          scale: 2.2,
          duration: 240,
          ease: "Sine.easeOut",
          onComplete: () => {
            Phaser.Utils.Array.Remove(this.temporaryEffects, head);
            head.destroy();
          },
        });
      },
    });
  }

  openBarrier() {
    this.statusText.setText("path opened").setColor("#dfffea");
    this.setBarrierStage("open");
    this.createBarrierBreakParticles();
    this.tweens.add({
      targets: this.barrier,
      alpha: 0,
      scaleY: 1.25,
      y: this.barrierBasePoint.y - 22,
      duration: 680,
      ease: "Sine.easeIn",
      onComplete: () => {
        this.sequenceMode = "walkingToExit";
        this.cameras.main.startFollow(this.player, true, 0.08, 0.08, -260, 0);
      },
    });
  }

  createBarrierBreakParticles() {
    for (let index = 0; index < 18; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const shard = this.add
        .rectangle(
          this.barrierBasePoint.x + side * Phaser.Math.Between(2, 10),
          this.barrierBasePoint.y - Phaser.Math.Between(20, 88),
          3,
          Phaser.Math.Between(5, 10),
          0xbff6ff,
          0.72,
        )
        .setDepth(1.72)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: shard,
        x: shard.x + side * Phaser.Math.Between(22, 54),
        y: shard.y - Phaser.Math.Between(8, 34),
        alpha: 0,
        angle: side * Phaser.Math.Between(45, 110),
        duration: 620,
        delay: index * 16,
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
    this.runeMark.setText("").setColor("#ffb8b8").setAlpha(0);
    this.outerRing.setStrokeStyle(2, RITUAL_FAIL, 0.5);
    this.middleRing.setStrokeStyle(1, RITUAL_FAIL, 0.28);
    this.innerRing.setStrokeStyle(1, 0xffd0d0, 0.24);
    this.ritualGlyphs.forEach((glyph) => glyph.setColor("#ffb8b8"));
    this.player.play("methods-1-player-hurt", true);
    this.tweens.add({
      targets: [this.ritualGlow, this.ritualGroundGlow, this.runeMark],
      alpha: 0.14,
      duration: 120,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.barrier,
      x: this.barrierBasePoint.x - 10,
      duration: 85,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
    });
    this.schedule(520, () => {
      this.statusText.setText("still sealed").setColor("#ffcccc");
      this.panTo(this.barrierBasePoint.x, 560);
    });
    this.schedule(1680, () => {
      this.resetAttempt();
      this.statusText.setText("try again").setColor("#f3e6c4");
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message: message || "Define StartRitual, then call StartRitual(); inside Main.",
      });
    });
  }

  getFailureFeedback(message = "") {
    const normalized = String(message).toLowerCase();
    if (normalized.includes("define static void")) {
      return {
        status: "StartRitual() missing",
        guide: "Create the method before Main can call it.",
      };
    }
    if (normalized.includes("call startritual")) {
      return {
        status: "defined, but not called",
        guide: "A method only runs when Main calls it.",
      };
    }
    if (normalized.includes("main")) {
      return {
        status: "Main changed",
        guide: "Keep Main, then call StartRitual(); there.",
      };
    }
    return {
      status: "ritual incomplete",
      guide: "Define the method, then call it from Main.",
    };
  }

  finishSuccess() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    this.cameras.main.stopFollow();
    this.player.play("methods-1-player-idle", true);
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: "StartRitual was defined, then Main called it. The shrine opens.",
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
      this.statusText.setText("sealed path").setColor("#d9f3ff");
      this.panTo(this.barrierBasePoint.x, 950);
    });
    this.schedule(2050, () => {
      if (this.sequenceMode !== "idle") return;
      this.statusText.setText("method not called").setColor("#f3e6c4");
      this.panTo(this.spawnPoint.x, 950);
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
