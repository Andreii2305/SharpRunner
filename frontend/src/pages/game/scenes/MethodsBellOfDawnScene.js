import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_DIALOGUE_CLOSED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";
import LayeredLpcCharacter from "../characters/LayeredLpcCharacter";
import { DIWATA_FAIRY_CONFIG } from "../characters/diwataFairyConfig";

const LEVEL_NUMBER = 15;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const MAP_KEY = "methods_level_2_bell_of_dawn";
const MAP_PATH = `${ASSET_BASE}/maps/methods-level-2-bell-of-dawn.tmj`;
const PLAYER_SCALE = 2;
const PLAYER_SPEED = 170;
const DIWATA_SCALE = 1.25;
const WORLD_WIDTH = 1280;
const WORLD_HEIGHT = 576;
const GROUND_Y = 500;
const BELL_GOLD = 0xf2c96d;
const DAWN_BLUE = 0x9ee8ff;
const GHOST_BLUE = 0xa9d8ff;
const FAIL_RED = 0xff6875;
const PORTAL_ANIM_KEY = "methods-bell-barrier-portal";

export default class MethodsBellOfDawnScene extends Phaser.Scene {
  constructor() {
    super("MethodsBellOfDawnScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("methods_bell_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("methods_bell_decor", `${GH_BASE}/Decor.png`);
    this.load.image("methods_bell_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("methods_bell_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("methods_bell_house", `${GH_BASE}/House_Tiles.png`);
    this.load.image("methods_bell_other", `${GH_BASE}/Other_Tiles2.png`);
    this.load.image("methods_bell_other_flipped", `${GH_BASE}/Other_Tiles2(Flipped).png`);
    this.load.image("methods_bell_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("methods_bell_willow_big", `${GH_BASE}/Weeping_Willow1Big.png`);
    this.load.image("methods_bell_willow", `${GH_BASE}/Weeping_Willow1.png`);
    this.load.image("methods_bell_tree_1", `${GH_BASE}/Tree1.png`);
    this.load.image("methods_bell_large_pine", `${GH_BASE}/Large_Pine_Tree.png`);
    this.load.image("methods_bell_wheat", `${GH_BASE}/Pixel_Art_Wheat.png`);
    this.load.image("methods_bell_signage_1", `${ASSET_BASE}/other/signage1.png`);
    this.load.image("methods_bell_signage_2", `${ASSET_BASE}/other/signage2.png`);
    this.load.image("methods_bell_unlit_candle", `${ASSET_BASE}/other/unlit_candle.png`);
    this.load.image("methods_bell_unlit_candle_tileset", `${ASSET_BASE}/other/unlit_candle_tileset.png`);
    this.load.image("methods_bell_torch", `${ASSET_BASE}/other/torch.png`);
    this.load.image("methods_bell_bell_tile", `${ASSET_BASE}/other/bell.png`);
    this.load.audio("methods_bell_ring", `${ASSET_BASE}/sounds/bellring.mp3`);
    this.load.spritesheet(
      "methods_bell_ghost",
      `${ASSET_BASE}/characters/npc/ghost/FREE_VERSION/MiniGhost_Idle.png`,
      { frameWidth: 32, frameHeight: 32 },
    );
    this.load.spritesheet(
      "methods_bell_portal",
      `${GH_BASE}/Animated_Sprites/GandalfHardcore_Portal_sheet.png`,
      { frameWidth: 64, frameHeight: 64 },
    );
    this.load.spritesheet(
      "methods_bell_player",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
    this.load.image("methods_bell_bg5", `${BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("methods_bell_bg4", `${BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("methods_bell_bg3", `${BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("methods_bell_bg2", `${BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("methods_bell_bg1", `${BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
  }

  create() {
    this.scale.resize(1024, WORLD_HEIGHT);
    const map = this.make.tilemap({ key: MAP_KEY });
    this.offsetY = this.scale.height - map.heightInPixels;
    this.sequenceMode = "idle";
    this.sequenceTimers = [];
    this.temporaryEffects = [];
    this.lastBellRingAt = -Infinity;

    this.createBackgrounds();
    this.createTileLayers(map);
    this.createAnimations();

    this.points = this.resolveMapPoints(map);
    this.spawnPoint = this.points.player_spawn ?? { x: 116, y: GROUND_Y };
    this.diwataPoint = this.points.diwata_spawn ?? { x: 500, y: GROUND_Y - 52 };
    this.bellPoint = this.points.bell_point ?? { x: 450, y: GROUND_Y - 94 };
    this.ghostPoints = [1, 2, 3].map((number, index) => (
      this.points[`ghost_${number}`] ?? { x: 640 + index * 90, y: GROUND_Y - 74 }
    ));
    this.barrierPoint = this.points.exit_barrier ?? this.points.ghost_barrier ?? { x: 910, y: GROUND_Y };
    this.exitPoint = this.points.level_exit ?? this.points.exit_barrier ?? { x: map.widthInPixels - 84, y: this.spawnPoint.y };
    this.groundY = Math.max(this.spawnPoint.y, this.barrierPoint.y, this.exitPoint.y);

    this.createBell();
    this.createDiwata();
    this.createGhosts();
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

    if (this.sequenceMode === "walkingToExit") {
      this.player.play("methods-bell-player-run", true);
      this.player.setFlipX(false);
      this.player.x = Math.min(this.player.x + step, this.exitPoint.x);
      if (this.player.x >= this.exitPoint.x) this.finishSuccess();
    }
  }

  createBackgrounds() {
    [
      ["methods_bell_bg5", 0.08, -8, 0.78, 0],
      ["methods_bell_bg4", 0.14, -7, 0.7, 0],
      ["methods_bell_bg3", 0.32, -6, 0.62, 88],
      ["methods_bell_bg2", 0.58, -5, 0.58, 176],
      ["methods_bell_bg1", 0.82, -4, 0.5, 225],
    ].forEach(([key, factor, depth, alpha, y]) => {
      this.add
        .tileSprite(0, y, WORLD_WIDTH, WORLD_HEIGHT - y, key)
        .setOrigin(0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x20384c)
        .setAlpha(alpha);
    });
    this.add.rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 0x030711, 0.22).setOrigin(0).setDepth(-3);
  }

  createGround() {
    this.add.rectangle(0, GROUND_Y, WORLD_WIDTH, 78, 0x121016, 1).setOrigin(0, 0).setDepth(0.1);
    this.add.rectangle(0, GROUND_Y - 4, WORLD_WIDTH, 6, 0x93bf4f, 1).setOrigin(0, 0).setDepth(0.2);
    this.add.rectangle(0, GROUND_Y + 2, WORLD_WIDTH, 2, 0x2a201f, 1).setOrigin(0, 0).setDepth(0.21);
    for (let x = 36; x < WORLD_WIDTH; x += 72) {
      this.add
        .ellipse(x, GROUND_Y - 3, 34, 5, 0x6c8f3e, 0.38)
        .setOrigin(0.5)
        .setDepth(0.22);
    }
  }

  createTileLayers(map) {
    const tilesets = [
      map.addTilesetImage("Floor_Tiles2", "methods_bell_floor"),
      map.addTilesetImage("Decor", "methods_bell_decor"),
      map.addTilesetImage("Garden_Decorations", "methods_bell_garden"),
      map.addTilesetImage("Pine_Trees", "methods_bell_pines"),
      map.addTilesetImage("House_Tiles", "methods_bell_house"),
      map.addTilesetImage("Other_Tiles2", "methods_bell_other"),
      map.addTilesetImage("Other_Tiles2(Flipped)", "methods_bell_other_flipped"),
      map.addTilesetImage("Pine_forest_sheet", "methods_bell_forest"),
      map.addTilesetImage("Weeping_Willow1Big", "methods_bell_willow_big"),
      map.addTilesetImage("Weeping_Willow1", "methods_bell_willow"),
      map.addTilesetImage("Tree1", "methods_bell_tree_1"),
      map.addTilesetImage("Large_Pine_Tree", "methods_bell_large_pine"),
      map.addTilesetImage("Pixel_Art_Wheat", "methods_bell_wheat"),
      map.addTilesetImage("signage1", "methods_bell_signage_1"),
      map.addTilesetImage("signage2", "methods_bell_signage_2"),
      map.addTilesetImage("unlit_candle", "methods_bell_unlit_candle"),
      map.addTilesetImage("unlit_candle_tileset", "methods_bell_unlit_candle_tileset"),
      map.addTilesetImage("torch", "methods_bell_torch"),
      map.addTilesetImage("bell", "methods_bell_bell_tile"),
    ].filter(Boolean);

    ["platform", "trees", "decoration", "front_decoration"].forEach((name, index) => {
      const layer = map.createLayer(name, tilesets, 0, this.offsetY);
      if (layer) layer.setDepth(0.1 + index * 0.25);
    });
  }

  createAnimations() {
    [
      ["methods-bell-player-idle", 0, 5, 6],
      ["methods-bell-player-run", 16, 23, 12],
      ["methods-bell-player-hurt", 48, 55, 10],
      ["methods-bell-player-cast", 64, 71, 10],
    ].forEach(([key, start, end, frameRate]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("methods_bell_player", { start, end }),
        frameRate,
        repeat: key.includes("hurt") || key.includes("cast") ? 0 : -1,
      });
    });

    if (!this.anims.exists("methods-bell-ghost-idle")) {
      this.anims.create({
        key: "methods-bell-ghost-idle",
        frames: this.anims.generateFrameNumbers("methods_bell_ghost", { start: 0, end: 8 }),
        frameRate: 10,
        repeat: -1,
      });
    }

    if (!this.anims.exists(PORTAL_ANIM_KEY)) {
      this.anims.create({
        key: PORTAL_ANIM_KEY,
        frames: this.anims.generateFrameNumbers("methods_bell_portal", { start: 0, end: 9 }),
        frameRate: 9,
        repeat: -1,
      });
    }
  }

  createBell() {
    this.bell = this.add.container(this.bellPoint.x, this.bellPoint.y).setDepth(1.5);
    const warmGlow = this.add
      .ellipse(0, -8, 118, 88, BELL_GOLD, 0.075)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    const bellGlow = this.add
      .ellipse(0, -8, 96, 80, DAWN_BLUE, 0.08)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    const bellPulse = this.add
      .ellipse(0, -8, 54, 34)
      .setStrokeStyle(2, BELL_GOLD, 0.28)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.bellWarmGlow = warmGlow;
    this.bellGlow = bellGlow;
    this.bellPulse = bellPulse;
    this.bell.add([warmGlow, bellGlow, bellPulse]);
    this.startBellIdleGlow();
  }

  startBellIdleGlow() {
    this.tweens.killTweensOf([this.bellWarmGlow, this.bellGlow]);
    this.tweens.add({
      targets: [this.bellWarmGlow, this.bellGlow],
      alpha: "+=0.05",
      scaleX: 1.08,
      scaleY: 1.06,
      duration: 1450,
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
        depth: 1.55,
        scale: DIWATA_SCALE,
      },
    );
    this.diwataGlow = this.add
      .ellipse(this.diwataPoint.x, this.diwataPoint.y - 32, 48, 66, 0x9effd5, 0.08)
      .setDepth(1.35)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.startDiwataIdle();
  }

  startDiwataIdle() {
    this.tweens.killTweensOf([this.diwata, this.diwataGlow]);
    this.tweens.add({
      targets: [this.diwata, this.diwataGlow],
      y: "-=5",
      duration: 1550,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createGhosts() {
    this.ghosts = this.ghostPoints.map((point, index) => {
      const ghost = this.add.container(point.x, point.y).setDepth(1.65);
      const aura = this.add
        .ellipse(0, 0, 54, 62, GHOST_BLUE, 0.1)
        .setBlendMode(Phaser.BlendModes.SCREEN);
      const sprite = this.add
        .sprite(0, 0, "methods_bell_ghost", 0)
        .setOrigin(0.5)
        .setScale(2.15)
        .setAlpha(0.82)
        .play("methods-bell-ghost-idle");
      ghost.add([aura, sprite]);
      ghost.sprite = sprite;
      ghost.aura = aura;
      this.startGhostIdle(ghost, index);
      return ghost;
    });
  }

  startGhostIdle(ghost, index) {
    this.tweens.killTweensOf(ghost);
    this.tweens.add({
      targets: ghost,
      y: this.ghostPoints[index].y - 8,
      duration: 1300 + index * 170,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createBarrier() {
    this.barrier = this.add.container(this.barrierPoint.x, this.barrierPoint.y).setDepth(1.45);
    this.barrierGlow = this.add
      .ellipse(0, -42, 84, 120, 0x8feeff, 0.12)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.barrierCore = this.add
      .sprite(0, -4, "methods_bell_portal", 0)
      .setOrigin(0.5, 1)
      .setScale(1.36)
      .setAlpha(0.72)
      .setTint(0xb8f4ff)
      .play(PORTAL_ANIM_KEY);
    this.barrierLabel = this.add
      .text(0, -112, "ghost wall", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d9f3ff",
        backgroundColor: "#07141fde",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5);
    this.barrier.add([this.barrierGlow, this.barrierCore, this.barrierLabel]);

    this.tweens.add({
      targets: [this.barrierGlow, this.barrierCore],
      alpha: "+=0.1",
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createPlayer() {
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "methods_bell_player", 0)
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.9)
      .play("methods-bell-player-idle");
  }

  createLabels() {
    this.statusText = this.add
      .text(this.bellPoint.x, this.bellPoint.y - 92, "RingBell() is ready", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#f3e6c4",
        backgroundColor: "#07141fdd",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.hintText = this.add
      .text(this.ghostPoints[1].x, this.ghostPoints[1].y - 98, "call the bell from Main", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d9f3ff",
        backgroundColor: "#07141fcc",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setAlpha(0.82);
  }

  onCodeEvaluated({ levelNumber, isCorrect, message }) {
    if (Number(levelNumber) !== LEVEL_NUMBER) return;
    this.resetAttempt();
    if (isCorrect) this.startSuccess();
    else this.startFailure(message);
  }

  onDialogueClosed({ levelNumber }) {
    if (Number(levelNumber) !== LEVEL_NUMBER || this.openingPreviewPlayed) return;
    this.openingPreviewPlayed = true;
    this.schedule(220, () => {
      if (this.sequenceMode !== "idle") return;
      this.hintText.setText("ghosts block the road").setColor("#d9f3ff");
      this.panTo(this.ghostPoints[1].x, 760);
    });
    this.schedule(1280, () => {
      if (this.sequenceMode !== "idle") return;
      this.statusText.setText("RingBell() is ready").setColor("#ffe7aa");
      this.hintText.setText("the bell can push them back").setColor("#ffe7aa");
      this.panTo(this.bellPoint.x, 760);
      this.previewBellPulse();
    });
    this.schedule(2380, () => {
      if (this.sequenceMode !== "idle") return;
      this.hintText.setText("call the bell from Main").setColor("#d9f3ff");
      this.panTo(this.spawnPoint.x, 820);
    });
  }

  resetAttempt() {
    this.sequenceTimers.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.temporaryEffects.forEach((effect) => effect.destroy());
    this.temporaryEffects = [];
    this.tweens.killTweensOf([
      this.player,
      this.bell,
      this.bellWarmGlow,
      this.bellGlow,
      this.bellPulse,
      this.diwata,
      this.diwataGlow,
      this.barrier,
      this.barrierCore,
      this.barrierGlow,
      ...this.ghosts,
    ]);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y).setAlpha(1).setTint(0xffffff);
    this.player.play("methods-bell-player-idle", true);
    this.bell.setAngle(0).setScale(1);
    this.bellWarmGlow.setAlpha(0.075).setScale(1);
    this.bellGlow.setAlpha(0.08).setScale(1);
    this.bellPulse.setAlpha(1).setScale(1);
    this.startBellIdleGlow();
    this.diwata?.setPosition(this.diwataPoint.x, this.diwataPoint.y - 8).playIdle("left");
    this.diwataGlow?.setPosition(this.diwataPoint.x, this.diwataPoint.y - 32).setAlpha(0.08);
    this.startDiwataIdle();
    this.barrier.setPosition(this.barrierPoint.x, this.barrierPoint.y).setAlpha(1).setScale(1);
    this.barrierCore.setAlpha(0.72).setScale(1.36).setTint(0xb8f4ff).play(PORTAL_ANIM_KEY, true);
    this.barrierGlow.setAlpha(0.12);
    this.ghosts.forEach((ghost, index) => {
      ghost
        .setPosition(this.ghostPoints[index].x, this.ghostPoints[index].y)
        .setAlpha(1)
        .setScale(1)
        .setAngle(0)
        .setVisible(true);
      ghost.sprite?.setAlpha(0.82).play("methods-bell-ghost-idle", true);
      ghost.aura?.setAlpha(0.1).setScale(1);
      this.startGhostIdle(ghost, index);
    });
    this.statusText.setText("RingBell() is ready").setColor("#f3e6c4");
    this.hintText.setText("call the bell from Main").setColor("#d9f3ff").setAlpha(0.82);
    this.sequenceMode = "idle";
    this.cameras.main.stopFollow();
    this.panTo(this.spawnPoint.x, 220);
  }

  startSuccess() {
    this.sequenceMode = "ringing";
    this.player.play("methods-bell-player-cast", true);
    this.statusText.setText("RingBell(); called").setColor("#bfffe5");
    this.hintText.setText("the sound reaches the ghosts").setColor("#ffe7aa");
    this.createMainCallCue();
    this.panTo(this.bellPoint.x, 420);
    this.schedule(260, () => this.ringBell());
    this.schedule(760, () => this.fadeGhosts());
    this.schedule(1500, () => this.clearGhosts());
    this.schedule(1900, () => this.openBarrier());
  }

  ringBell() {
    this.playBellChime();
    this.createBellBrightBeat();
    this.createBellSparks();
    this.tweens.add({
      targets: this.bell,
      angle: { from: -6, to: 6 },
      duration: 72,
      yoyo: true,
      repeat: 6,
      ease: "Sine.easeInOut",
      onComplete: () => this.bell.setAngle(0),
    });
    this.tweens.add({
      targets: [this.bellWarmGlow, this.bellGlow],
      alpha: 0.42,
      scaleX: 1.95,
      scaleY: 1.55,
      duration: 420,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: this.bellPulse,
      alpha: 0,
      scaleX: 2.2,
      scaleY: 1.8,
      duration: 520,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeOut",
    });
    for (let index = 0; index < 5; index += 1) {
      this.createSoundWave(index);
    }
    this.ghosts.forEach((ghost, index) => {
      this.schedule(520 + index * 140, () => this.createGhostImpact(ghost));
    });
  }

  createMainCallCue() {
    const cue = this.add
      .text(this.player.x + 16, this.player.y - 92, "Main called RingBell();", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d9fff0",
        backgroundColor: "#07141fde",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.2);
    this.temporaryEffects.push(cue);
    this.tweens.add({
      targets: cue,
      y: cue.y - 16,
      alpha: 0,
      duration: 1250,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, cue);
        cue.destroy();
      },
    });
  }

  createBellBrightBeat() {
    const flash = this.add
      .ellipse(this.bellPoint.x, this.bellPoint.y - 10, 132, 92, BELL_GOLD, 0.34)
      .setDepth(1.7)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    const core = this.add
      .ellipse(this.bellPoint.x, this.bellPoint.y - 10, 64, 46, 0xffffff, 0.2)
      .setDepth(1.71)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.temporaryEffects.push(flash, core);
    this.tweens.add({
      targets: [flash, core],
      alpha: 0,
      scaleX: 1.85,
      scaleY: 1.45,
      duration: 520,
      ease: "Sine.easeOut",
      onComplete: () => {
        [flash, core].forEach((effect) => {
          Phaser.Utils.Array.Remove(this.temporaryEffects, effect);
          effect.destroy();
        });
      },
    });
  }

  playBellChime() {
    const now = this.time.now;
    if (now - this.lastBellRingAt < 1400) return;
    this.lastBellRingAt = now;
    this.sound.play("methods_bell_ring", { volume: 0.62 });
  }

  createBellSparks() {
    for (let index = 0; index < 18; index += 1) {
      const angle = Phaser.Math.DegToRad(Phaser.Math.Between(205, 335));
      const distance = Phaser.Math.Between(18, 62);
      const spark = this.add
        .circle(
          this.bellPoint.x + Phaser.Math.Between(-10, 10),
          this.bellPoint.y - Phaser.Math.Between(2, 24),
          Phaser.Math.FloatBetween(1.4, 2.7),
          index % 3 === 0 ? DAWN_BLUE : BELL_GOLD,
          Phaser.Math.FloatBetween(0.55, 0.9),
        )
        .setDepth(2.05)
        .setBlendMode(Phaser.BlendModes.SCREEN);
      this.temporaryEffects.push(spark);
      this.tweens.add({
        targets: spark,
        x: spark.x + Math.cos(angle) * distance,
        y: spark.y + Math.sin(angle) * distance - Phaser.Math.Between(6, 18),
        alpha: 0,
        scale: 0.25,
        duration: Phaser.Math.Between(380, 760),
        delay: index * 12,
        ease: "Sine.easeOut",
        onComplete: () => {
          Phaser.Utils.Array.Remove(this.temporaryEffects, spark);
          spark.destroy();
        },
      });
    }
  }

  createSoundWave(index) {
    const wave = this.add
      .ellipse(this.bellPoint.x, this.bellPoint.y + 4, 48, 34)
      .setStrokeStyle(index % 2 === 0 ? 2 : 1, index % 2 === 0 ? DAWN_BLUE : BELL_GOLD, 0.46)
      .setDepth(1.8)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.temporaryEffects.push(wave);
    this.tweens.add({
      targets: wave,
      x: this.ghostPoints[2].x + 36,
      scaleX: 5.3,
      scaleY: 2.15,
      alpha: 0,
      duration: 860,
      delay: index * 110,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, wave);
        wave.destroy();
      },
    });
  }

  previewBellPulse() {
    this.tweens.add({
      targets: [this.bellWarmGlow, this.bellGlow],
      alpha: 0.22,
      scaleX: 1.35,
      scaleY: 1.18,
      duration: 300,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
  }

  createGhostImpact(ghost) {
    if (!ghost || ghost.alpha <= 0) return;
    const ghostIndex = this.ghosts.indexOf(ghost);
    const impact = this.add
      .ellipse(ghost.x, ghost.y, 70, 56)
      .setStrokeStyle(2, DAWN_BLUE, 0.42)
      .setDepth(1.9)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.temporaryEffects.push(impact);
    this.tweens.killTweensOf(ghost);
    this.tweens.add({
      targets: ghost,
      x: ghost.x + 18 + ghostIndex * 8,
      y: ghost.y - 10 - ghostIndex * 5,
      scale: 0.92,
      duration: 180,
      yoyo: true,
      repeat: 1,
      ease: "Back.easeOut",
    });
    this.tweens.add({
      targets: [ghost.aura, ghost.sprite],
      alpha: 0.38,
      duration: 95,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: impact,
      alpha: 0,
      scaleX: 1.55,
      scaleY: 1.35,
      duration: 420,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, impact);
        impact.destroy();
      },
    });
  }

  fadeGhosts() {
    this.panTo(this.ghostPoints[1].x, 520);
    this.ghosts.forEach((ghost, index) => {
      this.tweens.killTweensOf(ghost);
      this.createGhostVanishBurst(ghost, index);
      this.tweens.add({
        targets: ghost,
        alpha: 0,
        y: ghost.y - (index === 1 ? 86 : 64),
        x: ghost.x + 44 + index * 16,
        angle: index === 1 ? 10 : -8 + index * 8,
        scale: 0.5,
        duration: 440,
        delay: index * 70,
        ease: "Sine.easeInOut",
        onComplete: () => {
          ghost.setVisible(false);
        },
      });
    });
  }

  createGhostVanishBurst(ghost, index) {
    const burst = this.add
      .ellipse(ghost.x, ghost.y, 42, 50, index % 2 === 0 ? DAWN_BLUE : BELL_GOLD, 0.24)
      .setDepth(1.88)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.temporaryEffects.push(burst);
    this.tweens.add({
      targets: burst,
      alpha: 0,
      scaleX: 2,
      scaleY: 1.6,
      duration: 430,
      delay: index * 70,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, burst);
        burst.destroy();
      },
    });
  }

  clearGhosts() {
    this.ghosts.forEach((ghost) => {
      this.tweens.killTweensOf(ghost);
      ghost.setAlpha(0).setVisible(false);
    });
    this.hintText.setText("the ghosts are gone").setColor("#bfffe5");
  }

  openBarrier() {
    this.barrierLabel.setText("path opened");
    this.tweens.add({
      targets: [this.barrierGlow, this.barrierCore],
      alpha: 0.98,
      scaleX: 1.55,
      scaleY: 1.55,
      duration: 340,
      ease: "Sine.easeOut",
    });
    this.schedule(520, () => {
      this.tweens.add({
        targets: this.barrier,
        alpha: 0,
        y: this.barrierPoint.y - 24,
        scaleY: 1.22,
        duration: 660,
        ease: "Sine.easeIn",
        onComplete: () => {
          this.sequenceMode = "walkingToExit";
          this.cameras.main.startFollow(this.player, true, 0.08, 0.08, -260, 0);
        },
      });
    });
  }

  startFailure(message = "") {
    this.sequenceMode = "failure";
    this.statusText.setText("RingBell(); was never called").setColor("#ffb8b8");
    this.hintText.setText("the bell moves, but no sound answers").setColor("#ffcccc");
    this.player.play("methods-bell-player-hurt", true);
    this.panTo(this.bellPoint.x, 440);
    this.schedule(220, () => this.createSilentBellAttempt());
    this.schedule(760, () => {
      this.ghosts.forEach((ghost, index) => {
        this.tweens.add({
          targets: ghost,
          x: ghost.x - 34,
          alpha: 0.72,
          scale: 1.12,
          duration: 360,
          delay: index * 70,
          yoyo: true,
          repeat: 1,
          ease: "Sine.easeInOut",
        });
      });
    });
    this.tweens.add({
      targets: this.barrier,
      x: this.barrierPoint.x - 8,
      delay: 760,
      duration: 80,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
      onComplete: () => this.barrier.setX(this.barrierPoint.x),
    });
    this.schedule(1060, () => this.panTo(this.ghostPoints[1].x, 560));
    this.schedule(2180, () => {
      this.resetAttempt();
      this.statusText.setText("try again").setColor("#f3e6c4");
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message: message || "Call RingBell(); exactly once inside Main.",
      });
    });
  }

  createSilentBellAttempt() {
    this.tweens.add({
      targets: this.bell,
      angle: { from: -2, to: 2 },
      duration: 96,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
      onComplete: () => this.bell.setAngle(0),
    });
    this.tweens.add({
      targets: [this.bellWarmGlow, this.bellGlow],
      alpha: 0.03,
      scaleX: 0.92,
      scaleY: 0.92,
      duration: 260,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
    const mute = this.add
      .text(this.bellPoint.x, this.bellPoint.y - 52, "...", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#ffcccc",
        backgroundColor: "#07141fde",
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(2.1);
    this.temporaryEffects.push(mute);
    this.tweens.add({
      targets: mute,
      y: mute.y - 14,
      alpha: 0,
      duration: 520,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, mute);
        mute.destroy();
      },
    });
  }

  finishSuccess() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    this.cameras.main.stopFollow();
    this.player.play("methods-bell-player-idle", true);
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: "RingBell was called from Main. The Bell of Dawn pushed the ghosts back.",
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
          y: object.y + this.offsetY + (object.height || 0) / 2,
        };
      });
    });
    return points;
  }

  setupCamera(map) {
    const worldWidth = map?.widthInPixels ?? WORLD_WIDTH;
    const worldHeight = map?.heightInPixels ?? WORLD_HEIGHT;
    this.cameraBounds = { minX: 0, maxX: Math.max(0, worldWidth - this.scale.width) };
    this.cameras.main.setBounds(0, this.offsetY ?? 0, worldWidth, worldHeight);
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
    this.sequenceTimers?.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.temporaryEffects = [];
  }
}
