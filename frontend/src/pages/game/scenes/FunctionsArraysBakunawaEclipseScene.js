import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_DIALOGUE_CLOSED,
  GAME_LEVEL_DIALOGUE_TRIGGERED,
  GAME_LEVEL_OUTCOME,
  GAME_ACCESSIBILITY_CHANGED,
  GAME_LEVEL_RESET,
} from "../gameEvents";
import LayeredLpcCharacter from "../characters/LayeredLpcCharacter";
import { DIWATA_FAIRY_CONFIG } from "../characters/diwataFairyConfig";

const LEVEL_NUMBER = 30;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const MAP_KEY = "functions_arrays_level_5_bakunawa_eclipse";
const MAP_PATH = `${ASSET_BASE}/maps/functions-arrays-level-5-bakunawa-eclipse.tmj`;
const PHASE_NAMES = ["ARRAY", "TRAVERSE", "REPAIR", "RETURN", "2D GRID", "RECURSE"];
const OPENING_DIALOGUE_ID = "bakunawa-after-eclipse";
const CLOSING_DIALOGUE_ID = "bakunawa-dawn-restored";
const OPENING_SEEN_KEY = "sharprunner:level-30-opening-seen";
const AUDIO_PREFERENCE_KEY = "sharprunner:game-audio-muted";
const MOTION_PREFERENCE_KEY = "sharprunner:game-reduced-motion";
const PHASE_PROGRESS_KEY = "sharprunner:level-30-completed-phases";
const MOON_PHASE_TINTS = [0x727b8e, 0x7d879a, 0x8994a8, 0x98a5b9, 0xaab9ca, 0xc2d4df];
const HUD_STYLE = {
  fontFamily: 'Consolas, "Courier New", monospace',
  fontSize: "11px",
  color: "#c7dce8",
};

export default class FunctionsArraysBakunawaEclipseScene extends Phaser.Scene {
  constructor() {
    super("FunctionsArraysBakunawaEclipseScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("final_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("final_decor", `${GH_BASE}/Decor.png`);
    this.load.image("final_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("final_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("final_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("final_other", `${GH_BASE}/Other_Tiles2.png`);
    this.load.image("final_other_flipped", `${GH_BASE}/Other_Tiles2(Flipped).png`);
    this.load.image("final_exit", `${ASSET_BASE}/other/exit_sign.png`);
    this.load.image(
      "final_lamp_tall",
      `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze/Lamp-Post-2-TALL.png`,
    );
    this.load.image(
      "final_lamp_short",
      `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze/Lamp-Post-2-SHORT.png`,
    );
    this.load.image(
      "final_moon",
      `${ASSET_BASE}/other/Moon_Phases_Alt_128x128/Moon_Phase_1_Alt.png`,
    );
    this.load.spritesheet(
      "final_bakunawa",
      `${ASSET_BASE}/characters/monsters/boss_demon_slime_FREE_v1.0/spritesheets/demon_slime_FREE_v1.0_288x160_spritesheet.png`,
      { frameWidth: 288, frameHeight: 160 },
    );
    this.load.spritesheet(
      "final_fireball",
      `${ASSET_BASE}/other/Fireball_Pack/Fireball_Pack/Fireball_Sprite_Sheet.png`,
      { frameWidth: 32, frameHeight: 32 },
    );
    this.load.spritesheet(
      "final_player",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    this.load.audio(
      "final_magicbeam",
      `${ASSET_BASE}/sounds/projectile_magicbeam_sound.mp3`,
    );
    this.load.audio("final_dawn_bell", `${ASSET_BASE}/sounds/bellring.mp3`);
    for (let index = 1; index <= 5; index += 1) {
      this.load.image(
        `final_bg${index}`,
        `${BG_BASE}/GandalfHardcore_Background_layers_layer_${index}.png`,
      );
    }
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
  }

  create() {
    this.scale.resize(1024, 576);
    this.map = this.make.tilemap({ key: MAP_KEY });
    this.offsetY = this.scale.height - this.map.heightInPixels;
    this.mode = "intro";
    this.isMuted = this.readPreference(AUDIO_PREFERENCE_KEY);
    this.reducedMotion = this.readPreference(
      MOTION_PREFERENCE_KEY,
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    );
    this.sound.mute = this.isMuted;
    this.tweens.timeScale = this.reducedMotion ? 3 : 1;
    this.timers = [];
    this.effects = [];
    this.completedPhaseCount = this.readPhaseProgress();
    this.points = this.resolveMapObjects();
    this.spawnPoint = this.points.player_spawn ?? { x: 160, y: 480 };
    this.guidePoint = this.points.guide_spawn ?? { x: 270, y: 480 };
    this.wardPoint = this.points.ward_focus ?? { x: 400, y: 430 };
    this.moonPoint = this.points.moon_center ?? { x: 700, y: 125 };
    this.bossPoint = this.points.bakunawa_spawn ?? { x: 1050, y: 455 };
    this.projectilePoint = this.points.boss_projectile_spawn ?? { x: 930, y: 350 };
    this.playerImpact = this.points.player_impact_point ?? { x: 390, y: 410 };
    this.bossImpact = this.points.boss_impact_point ?? { x: 1000, y: 385 };
    this.exitPoint = this.points.level_complete ?? { x: 1180, y: 480 };

    this.createBackgrounds();
    this.createTileLayers();
    this.createAnimations();
    this.createGlowTexture();
    this.createMoon();
    this.createWard();
    this.createCharacters();
    this.createBoss();
    this.createHud();
    this.setupCamera();

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.on(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    gameEvents.on(GAME_ACCESSIBILITY_CHANGED, this.onAccessibilityChanged, this);
    gameEvents.on(GAME_LEVEL_RESET, this.onLevelReset, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  createBackgrounds() {
    [
      ["final_bg5", 0.08, -8, 0.54, 0],
      ["final_bg4", 0.14, -7, 0.48, 0],
      ["final_bg3", 0.3, -6, 0.42, 88],
      ["final_bg2", 0.55, -5, 0.4, 174],
      ["final_bg1", 0.82, -4, 0.36, 224],
    ].forEach(([key, factor, depth, alpha, y]) => {
      this.add
        .tileSprite(0, y, this.map.widthInPixels, this.scale.height - y, key)
        .setOrigin(0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x17243a)
        .setAlpha(alpha);
    });
    this.eclipseShade = this.add
      .rectangle(0, 0, this.map.widthInPixels, 576, 0x02040c, 0.12)
      .setOrigin(0)
      .setDepth(-3);
  }

  createTileLayers() {
    const tilesets = [
      this.map.addTilesetImage("Floor_Tiles2", "final_floor"),
      this.map.addTilesetImage("Lamp Post 2 TALL", "final_lamp_tall"),
      this.map.addTilesetImage("Lamp Post 2 SHORT", "final_lamp_short"),
      this.map.addTilesetImage("Decor", "final_decor"),
      this.map.addTilesetImage("Garden_Decorations", "final_garden"),
      this.map.addTilesetImage("Pine_Trees", "final_pines"),
      this.map.addTilesetImage("Pine_forest_sheet", "final_forest"),
      this.map.addTilesetImage("Other_Tiles2", "final_other"),
      this.map.addTilesetImage("Other_Tiles2(Flipped)", "final_other_flipped"),
      this.map.addTilesetImage("exit_sign", "final_exit"),
    ].filter(Boolean);
    this.worldLayers = ["platform", "trees", "decoration", "front_decoration"]
      .map((name, index) => {
        const layer = this.map.createLayer(name, tilesets, 0, this.offsetY);
        if (!layer) return null;
        layer.setDepth(0.05 + index * 0.22);
        if (name !== "platform") layer.setTint(0x586071);
        return layer;
      })
      .filter(Boolean);
  }

  createAnimations() {
    const animations = [
      ["final-player-idle", "final_player", 0, 5, 6, -1],
      ["final-player-run", "final_player", 16, 23, 12, -1],
      ["final-player-hurt", "final_player", 48, 55, 10, 0],
      ["final-player-cast", "final_player", 64, 71, 10, 0],
      ["final-boss-idle", "final_bakunawa", 0, 5, 6, -1],
      ["final-boss-walk", "final_bakunawa", 22, 33, 10, -1],
      ["final-boss-attack", "final_bakunawa", 44, 58, 12, 0],
      ["final-boss-hit", "final_bakunawa", 66, 70, 10, 0],
      ["final-boss-death", "final_bakunawa", 88, 109, 12, 0],
      ["final-purple-fireball", "final_fireball", 4, 7, 12, -1],
    ];
    animations.forEach(([key, texture, start, end, frameRate, repeat]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(texture, { start, end }),
        frameRate,
        repeat,
      });
    });
  }

  createGlowTexture() {
    if (this.textures.exists("final_radial_glow")) return;
    const texture = this.textures.createCanvas("final_radial_glow", 192, 192);
    const context = texture.getContext();
    const gradient = context.createRadialGradient(96, 96, 2, 96, 96, 94);
    gradient.addColorStop(0, "rgba(226,251,255,0.95)");
    gradient.addColorStop(0.28, "rgba(78,202,255,0.45)");
    gradient.addColorStop(1, "rgba(24,83,180,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 192, 192);
    texture.refresh();
  }

  createMoon() {
    this.moonHalo = this.add
      .image(this.moonPoint.x, this.moonPoint.y + this.offsetY, "final_radial_glow")
      .setScale(0.9)
      .setAlpha(0.42)
      .setDepth(-2.2)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.moon = this.add
      .image(this.moonPoint.x, this.moonPoint.y + this.offsetY, "final_moon")
      .setScale(0.72)
      .setTint(0xffffff)
      .setAlpha(0.92)
      .setDepth(-2.1);
    this.moonShards = [];
    const radius = 47;
    for (let index = 0; index < 6; index += 1) {
      const start = -Math.PI / 2 + index * (Math.PI / 3);
      const end = start + Math.PI / 3;
      const shard = this.add.graphics().setDepth(-2).setAlpha(0);
      shard.fillStyle(0x030612, 0.96);
      shard.beginPath();
      shard.moveTo(this.moon.x, this.moon.y);
      shard.lineTo(this.moon.x + Math.cos(start) * radius, this.moon.y + Math.sin(start) * radius);
      shard.lineTo(this.moon.x + Math.cos(end) * radius, this.moon.y + Math.sin(end) * radius);
      shard.closePath();
      shard.fillPath();
      this.moonShards.push(shard);
    }
  }

  createWard() {
    this.wardNodes = [];
    for (let index = 0; index < 6; index += 1) {
      const angle = -Math.PI / 2 + index * (Math.PI / 3);
      const node = this.add
        .circle(
          this.wardPoint.x + Math.cos(angle) * 46,
          this.wardPoint.y + this.offsetY - 38 + Math.sin(angle) * 27,
          4,
          0x365166,
          0.55,
        )
        .setStrokeStyle(1, 0x6d8797, 0.7)
        .setDepth(1.7);
      this.wardNodes.push(node);
    }
    this.wardRing = this.add
      .ellipse(this.wardPoint.x, this.wardPoint.y + this.offsetY - 38, 112, 68, 0x133242, 0.08)
      .setStrokeStyle(1, 0x659eb2, 0.35)
      .setDepth(1.55);
  }

  createCharacters() {
    const floorY = this.spawnPoint.y + this.offsetY;
    this.player = this.add
      .sprite(this.spawnPoint.x, floorY, "final_player")
      .setOrigin(0.5, 1)
      .setScale(2)
      .setDepth(2)
      .play("final-player-idle");
    this.diwataAura = this.add
      .ellipse(this.guidePoint.x, this.guidePoint.y + this.offsetY - 34, 66, 88, 0x62d4c8, 0.08)
      .setDepth(1.55);
    this.diwata = new LayeredLpcCharacter(
      this,
      this.guidePoint.x,
      this.guidePoint.y + this.offsetY - 8,
      DIWATA_FAIRY_CONFIG,
      { scale: 1.2, direction: "right", animationName: "idle" },
    ).setDepth(1.9);
  }

  createBoss() {
    const bossY = this.bossPoint.y + this.offsetY + 4;
    this.bossAura = this.add
      .image(this.bossPoint.x + 100, bossY - 78, "final_radial_glow")
      .setTint(0x9d3fff)
      .setScale(1.1, 0.78)
      .setAlpha(0)
      .setDepth(1.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.boss = this.add
      .sprite(this.bossPoint.x + 100, bossY, "final_bakunawa")
      .setOrigin(0.5, 1)
      .setScale(0.82)
      .setFlipX(false)
      .setAlpha(0)
      .setDepth(2.1)
      .play("final-boss-idle");
    this.boss.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (animation) => {
      if (this.mode === "complete" || animation.key === "final-boss-death") return;
      this.boss.play("final-boss-idle", true);
    });
    this.projectile = this.add
      .sprite(this.projectilePoint.x, this.projectilePoint.y + this.offsetY, "final_fireball")
      .setScale(2.2)
      .setAlpha(0)
      .setDepth(2.6);

    const eclipseCore = this.add.circle(0, 0, 17, 0x010108, 1).setStrokeStyle(2, 0x8e4ab5, 0.9);
    const eclipseRing = this.add.circle(0, 0, 25, 0x251031, 0.28).setStrokeStyle(2, 0xb06bd1, 0.5);
    const eclipseSmoke = [
      this.add.circle(-18, 8, 9, 0x18091f, 0.72),
      this.add.circle(15, -8, 8, 0x230c2e, 0.68),
      this.add.circle(12, 14, 6, 0x090511, 0.8),
    ];
    this.eclipseOrb = this.add
      .container(this.projectilePoint.x, this.projectilePoint.y + this.offsetY, [
        eclipseSmoke[0],
        eclipseSmoke[1],
        eclipseSmoke[2],
        eclipseRing,
        eclipseCore,
      ])
      .setAlpha(0)
      .setScale(0.45)
      .setDepth(3);
    this.eclipseRing = eclipseRing;
    this.eclipseSmoke = eclipseSmoke;
  }

  createHud() {
    this.phasePanel = this.add.container(18, 18).setScrollFactor(0).setDepth(30);
    const panel = this.add
      .rectangle(0, 0, 232, 76, 0x06121c, 0.92)
      .setOrigin(0)
      .setStrokeStyle(1, 0x456f82, 0.85);
    const title = this.add.text(12, 9, "THE LAST COMPILE", {
      ...HUD_STYLE,
      color: "#e0f2f8",
    });
    this.phaseText = this.add.text(12, 29, "Six seals await", HUD_STYLE);
    this.phaseMarks = PHASE_NAMES.map((name, index) =>
      this.add
        .text(12 + index * 36, 51, String(index + 1), {
          ...HUD_STYLE,
          color: "#657c88",
          backgroundColor: "#0b1b26",
          padding: { x: 8, y: 2 },
        })
        .setOrigin(0, 0.5)
        .setData("name", name),
    );
    this.phasePanel.add([panel, title, this.phaseText, ...this.phaseMarks]);

    this.bossHud = this.add.container(772, 18).setScrollFactor(0).setDepth(30);
    const bossPanel = this.add.rectangle(0, 0, 232, 54, 0x160817, 0.9).setOrigin(0).setStrokeStyle(1, 0x965279, 0.85);
    const bossName = this.add.text(12, 8, "BAKUNAWA  ECLIPSE", { ...HUD_STYLE, color: "#f0c8dc" });
    this.bossHealthBack = this.add.rectangle(12, 32, 208, 9, 0x241521, 1).setOrigin(0, 0.5);
    this.bossHealth = this.add.rectangle(12, 32, 208, 9, 0xc35683, 1).setOrigin(0, 0.5);
    this.bossHud.add([bossPanel, bossName, this.bossHealthBack, this.bossHealth]);

    this.skipOpeningButton = this.add
      .text(512, 20, "Skip intro", {
        ...HUD_STYLE,
        color: "#b8cbd5",
        backgroundColor: "#07141dcc",
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(31)
      .setInteractive({ useHandCursor: true })
      .setVisible(this.hasSeenOpening());
    this.skipOpeningButton.on("pointerover", () => this.skipOpeningButton.setColor("#ffffff"));
    this.skipOpeningButton.on("pointerout", () => this.skipOpeningButton.setColor("#b8cbd5"));
    this.skipOpeningButton.on("pointerdown", () => this.skipOpening());
  }

  onCodeEvaluated({ levelNumber, isCorrect, message, values }) {
    if (Number(levelNumber) !== LEVEL_NUMBER || this.mode !== "idle") return;
    if (isCorrect) {
      this.startFinalCompile();
      return;
    }
    this.startFailure(values?.failurePhase ?? 1, values?.completedPhases ?? 0, message);
  }

  startFailure(phase, completedPhases, message) {
    this.playSfx?.("impactSoft");
    this.mode = "failure";
    const failedIndex = Phaser.Math.Clamp(Number(phase) - 1, 0, PHASE_NAMES.length - 1);
    const validatedCount = Phaser.Math.Clamp(Number(completedPhases), 0, PHASE_NAMES.length);
    const newlyValidated = [];
    for (let index = this.completedPhaseCount; index < validatedCount; index += 1) {
      newlyValidated.push(index);
    }
    newlyValidated.forEach((index, order) => {
      this.schedule(order * 300, () => this.completePhase(index, PHASE_NAMES[index]));
    });
    const failureDelay = newlyValidated.length * 300;
    this.failedPhaseIndex = failedIndex;
    this.schedule(failureDelay, () => {
      this.phaseText
        .setText(`Phase ${failedIndex + 1}: ${PHASE_NAMES[failedIndex]} needs repair`)
        .setColor("#ff9aaa");
      this.phaseMarks[failedIndex].setColor("#fff1f4").setBackgroundColor("#7b263e");
      this.wardNodes[failedIndex].setFillStyle(0xd94f70, 0.9).setStrokeStyle(2, 0xffafbd, 0.9);
      this.tweens.add({
        targets: [this.phaseMarks[failedIndex], this.wardNodes[failedIndex]],
        scale: 1.22,
        duration: 180,
        yoyo: true,
        repeat: 1,
        ease: "Sine.easeInOut",
      });
      this.panCamera(this.bossPoint.x - 190, 288, 380);
    });
    this.schedule(failureDelay + 280, () => {
      this.boss.play("final-boss-attack", true);
      this.sound.play("final_magicbeam", { volume: 0.35 });
      this.projectile
        .setPosition(this.projectilePoint.x, this.projectilePoint.y + this.offsetY)
        .setAlpha(1)
        .setRotation(Math.PI)
        .play("final-purple-fireball", true);
      this.tweens.add({
        targets: this.projectile,
        x: this.playerImpact.x,
        y: this.playerImpact.y + this.offsetY,
        duration: 720,
        ease: "Sine.easeIn",
        onComplete: () => this.finishFailure(message),
      });
    });
  }

  finishFailure(message) {
    this.projectile.setAlpha(0).stop();
    this.player.play("final-player-hurt", true);
    this.shakeCamera(180, 0.004);
    this.createBurst(this.playerImpact.x, this.playerImpact.y + this.offsetY - 28, 0xd75a8c);
    this.schedule(650, () => {
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message,
      });
      this.player.play("final-player-idle", true);
      this.panCamera(480, 288, 520);
      this.schedule(550, () => {
        const failedIndex = this.failedPhaseIndex ?? 0;
        this.phaseMarks[failedIndex].setColor("#657c88").setBackgroundColor("#0b1b26").setScale(1);
        this.wardNodes[failedIndex]
          .setFillStyle(0x365166, 0.55)
          .setStrokeStyle(1, 0x6d8797, 0.7)
          .setScale(1);
        this.phaseText
          .setText(`${this.completedPhaseCount}/6 seals restored - repair phase ${failedIndex + 1}`)
          .setColor("#c7dce8");
        this.failedPhaseIndex = null;
        this.mode = "idle";
      });
    });
  }

  startFinalCompile() {
    this.playSfx?.("energyCharge");
    this.mode = "compiling";
    this.diwata.playAnimation("spellcast", "right");
    this.player.play("final-player-cast", true);
    this.panCamera(this.points.arena_camera_focus?.x ?? 650, 288, 620);
    const remainingPhases = PHASE_NAMES.map((name, index) => ({ name, index })).filter(
      ({ index }) => index >= this.completedPhaseCount,
    );
    remainingPhases.forEach(({ name, index }, order) => {
      this.schedule(480 + order * 920, () => this.completePhase(index, name));
    });
    this.schedule(480 + remainingPhases.length * 920, () => this.defeatBakunawa());
  }

  completePhase(index, name) {
    this.playSfx?.("magicPulse", { rate: Math.min(1.05, 0.96 + index * 0.015) });
    this.playSfx?.("bossHit");
    if (index < this.completedPhaseCount) return;
    this.completedPhaseCount = index + 1;
    this.writePhaseProgress(this.completedPhaseCount);
    this.phaseText.setText(`Phase ${index + 1}: ${name}`).setColor("#bff5ff");
    this.phaseMarks[index].setColor("#071319").setBackgroundColor("#7ee7f2");
    this.wardNodes[index].setFillStyle(0x9af5ff, 1).setStrokeStyle(2, 0xffffff, 0.9);
    this.tweens.add({
      targets: this.wardNodes[index],
      scale: 2.2,
      duration: 180,
      yoyo: true,
      ease: "Back.easeOut",
    });
    this.tweens.add({
      targets: [this.phaseText, this.phaseMarks[index]],
      scale: 1.08,
      duration: 150,
      yoyo: true,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: this.wardRing,
      alpha: 0.72,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 210,
      yoyo: true,
      ease: "Sine.easeOut",
    });
    this.tweens.add({ targets: this.moonShards[index], alpha: 0, duration: 620, ease: "Sine.easeOut" });
    this.moon.setTint(MOON_PHASE_TINTS[index]);
    this.tweens.add({
      targets: this.moon,
      alpha: 0.74 + index * 0.04,
      scale: 0.73 + index * 0.012,
      duration: 520,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: this.moonHalo,
      alpha: 0.14 + index * 0.055,
      scale: 0.92 + index * 0.035,
      duration: 520,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: this.eclipseShade,
      alpha: Math.max(0.12, 0.43 - index * 0.052),
      duration: 520,
    });
    this.tweens.add({
      targets: this.bossHealth,
      scaleX: Math.max(0, 1 - (index + 1) / 6),
      duration: 420,
      ease: "Sine.easeOut",
    });
    this.boss.play("final-boss-hit", true);
    this.boss.setTintFill(0xf7d6ff);
    this.schedule(110, () => {
      if (this.boss?.active && this.mode !== "complete") this.boss.clearTint();
    });
    this.tweens.add({
      targets: this.boss,
      x: this.bossPoint.x + 12 + index * 5,
      duration: 130,
      yoyo: true,
      ease: "Quad.easeOut",
    });
    this.createWardBolt(index);
    this.createBurst(this.bossImpact.x, this.bossImpact.y + this.offsetY - 42, 0x7ee7f2, 12);
    this.shakeCamera(90 + index * 18, 0.0018 + index * 0.0003);
  }

  createWardBolt(index) {
    const source = this.wardNodes[index];
    const bolt = this.add.graphics().setDepth(2.5).setBlendMode(Phaser.BlendModes.ADD);
    bolt.lineStyle(3, 0xa8f5ff, 0.88);
    bolt.lineBetween(source.x, source.y, this.bossImpact.x, this.bossImpact.y + this.offsetY - 40);
    bolt.lineStyle(1, 0xffffff, 0.72);
    bolt.lineBetween(source.x, source.y - 3, this.bossImpact.x - 8, this.bossImpact.y + this.offsetY - 48);
    this.effects.push(bolt);
    this.tweens.add({
      targets: bolt,
      alpha: 0,
      duration: 340,
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.effects, bolt);
        bolt.destroy();
      },
    });
  }

  defeatBakunawa() {
    this.mode = "complete";
    this.phaseText.setText("COMPILATION SUCCESSFUL").setColor("#f5e9a8");
    this.boss.play("final-boss-death", true);
    this.tweens.add({ targets: this.bossAura, alpha: 0, scale: 1.8, duration: 1300 });
    this.schedule(1720, () => this.dissolveBakunawa());
    this.schedule(2450, () => this.restoreDawn());
    this.schedule(4300, () => this.presentVictoryTableau());
  }

  dissolveBakunawa() {
    this.playSfx?.("enemyRetreat");
    const bossTop = this.boss.y - this.boss.displayHeight * 0.72;
    for (let index = 0; index < 34; index += 1) {
      const mote = this.add
        .circle(
          this.boss.x + Phaser.Math.Between(-72, 72),
          bossTop + Phaser.Math.Between(0, Math.round(this.boss.displayHeight * 0.68)),
          Phaser.Math.Between(2, 5),
          Phaser.Math.RND.pick([0x743a91, 0xb55788, 0xe08b54]),
          0.9,
        )
        .setDepth(2.9)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.effects.push(mote);
      this.tweens.add({
        targets: mote,
        x: mote.x + Phaser.Math.Between(-44, 44),
        y: mote.y - Phaser.Math.Between(45, 115),
        alpha: 0,
        scale: 0.15,
        duration: Phaser.Math.Between(620, 1100),
        ease: "Sine.easeOut",
        onComplete: () => {
          Phaser.Utils.Array.Remove(this.effects, mote);
          mote.destroy();
        },
      });
    }
    this.boss.setTint(0x8b587f);
    this.tweens.add({ targets: this.boss, alpha: 0, duration: 760, ease: "Sine.easeIn" });
  }

  restoreDawn() {
    this.playSfx?.("moonRestore");
    this.moon.setTint(0xffffff);
    this.sound.play("final_dawn_bell", { volume: 0.24, rate: 0.9 });
    this.tweens.add({
      targets: this.moon,
      alpha: 0.9,
      scale: 0.82,
      duration: 1400,
      ease: "Sine.easeOut",
    });
    this.tweens.add({ targets: this.moonHalo, alpha: 0.46, scale: 1.18, duration: 1400 });
    this.tweens.add({ targets: this.eclipseShade, alpha: 0.08, duration: 1800 });
    this.worldLayers.forEach((layer) => {
      if (layer.layer.name !== "platform") layer.setTint(0xb9c8b0);
    });
    this.createDawnRays();
  }

  createDawnRays() {
    for (let index = 0; index < 7; index += 1) {
      const ray = this.add
        .rectangle(this.moon.x + (index - 3) * 32, -40, 12, 350, 0xbcecff, 0.08)
        .setOrigin(0.5, 0)
        .setRotation((index - 3) * 0.07)
        .setDepth(-1.8)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.effects.push(ray);
      this.tweens.add({ targets: ray, alpha: 0.22, duration: 900, yoyo: true, repeat: 1 });
    }
  }

  presentVictoryTableau() {
    this.phaseText.setText("DAWN RESTORED").setColor("#fff0a8");
    this.panCamera(this.moon.x - 80, 288, 700);
    this.player.setFlipX(false).play("final-player-run", true);
    this.diwata.playAnimation("walk", "right");
    const playerTargetX = this.moon.x - 58;
    const diwataTargetX = this.moon.x - 142;
    this.tweens.add({
      targets: this.player,
      x: playerTargetX,
      duration: 920,
      ease: "Sine.easeInOut",
      onComplete: () => this.player.play("final-player-idle", true),
    });
    this.tweens.add({
      targets: [this.diwata, this.diwataAura],
      x: diwataTargetX,
      duration: 860,
      ease: "Sine.easeInOut",
      onComplete: () => this.diwata.playIdle("right"),
    });
    this.schedule(1250, () => this.triggerClosingDialogue());
  }

  triggerClosingDialogue() {
    this.awaitingClosingDialogue = true;
    gameEvents.emit(GAME_LEVEL_DIALOGUE_TRIGGERED, {
      levelNumber: LEVEL_NUMBER,
      dialogueId: CLOSING_DIALOGUE_ID,
      dialogueSteps: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "You restored the moon by joining every lesson into one final program.",
              tone: "goal",
            },
            {
              text: "Arrays held the seals. Methods carried their power. Your logic brought back the dawn.",
              tone: "normal",
            },
          ],
        },
        {
          speaker: "Kai",
          portraitImage: "portrait_player_main.png",
          portraitAlt: "Kai portrait",
          lines: [
            { text: "Then this is not the end. It is the first program I can build on my own.", tone: "accent" },
          ],
        },
      ],
    });
  }

  onDialogueClosed({ levelNumber, dialogueId } = {}) {
    if (Number(levelNumber) !== LEVEL_NUMBER) return;
    if (dialogueId !== CLOSING_DIALOGUE_ID || !this.awaitingClosingDialogue) return;
    this.awaitingClosingDialogue = false;
    this.runToDawn();
  }

  runToDawn() {
    this.clearPhaseProgress();
    this.diwata.playIdle("right");
    this.player.setFlipX(false).play("final-player-run", true);
    this.cameras.main.startFollow(this.player, true, 0.07, 0.07);
    this.tweens.add({
      targets: this.player,
      x: this.exitPoint.x,
      duration: Math.max(1900, Math.abs(this.exitPoint.x - this.player.x) * 3.4),
      ease: "Linear",
      onComplete: () => {
        this.player.play("final-player-idle", true);
        gameEvents.emit(GAME_LEVEL_OUTCOME, {
          levelNumber: LEVEL_NUMBER,
          status: "success",
          message: "Compilation successful. Umaga na.",
          shouldProceed: true,
        });
      },
    });
  }

  createBurst(x, y, color, count = 18) {
    for (let index = 0; index < count; index += 1) {
      const spark = this.add.circle(x, y, Phaser.Math.Between(2, 5), color, 0.9).setDepth(2.8).setBlendMode(Phaser.BlendModes.ADD);
      this.effects.push(spark);
      this.tweens.add({
        targets: spark,
        x: x + Phaser.Math.Between(-54, 54),
        y: y + Phaser.Math.Between(-54, 35),
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(380, 700),
        onComplete: () => {
          Phaser.Utils.Array.Remove(this.effects, spark);
          spark.destroy();
        },
      });
    }
  }

  setupCamera() {
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.scale.height);
    this.cameras.main.scrollX = 0;
    this.phaseText.setText("The moon is still whole");
    this.schedule(420, () => {
      this.panCamera(this.bossPoint.x - 170, 288, 720);
    });
    this.schedule(680, () => this.revealBakunawa());
    this.schedule(1720, () => this.castOpeningEclipse());
  }

  hasSeenOpening() {
    try {
      return window.localStorage.getItem(OPENING_SEEN_KEY) === "true";
    } catch {
      return false;
    }
  }

  markOpeningSeen() {
    try {
      window.localStorage.setItem(OPENING_SEEN_KEY, "true");
    } catch {
      // The cinematic remains fully playable when storage is unavailable.
    }
  }

  skipOpening() {
    if (this.mode !== "intro") return;
    this.timers.forEach((timer) => timer.remove(false));
    this.timers = [];
    this.tweens.killTweensOf([
      this.boss,
      this.bossAura,
      this.eclipseOrb,
      this.eclipseRing,
      this.moon,
      this.moonHalo,
      this.eclipseShade,
      ...this.eclipseSmoke,
      ...this.moonShards,
    ]);
    this.cameras.main.resetFX();
    this.cameras.main.scrollX = 0;
    this.boss.setPosition(this.bossPoint.x, this.bossPoint.y + this.offsetY + 4).setAlpha(1).clearTint();
    this.boss.play("final-boss-idle", true);
    this.bossAura.setPosition(this.bossPoint.x, this.boss.y - 78).setAlpha(0.24);
    this.eclipseOrb.setAlpha(0);
    this.moon.setTint(0x687080).setAlpha(0.7).setScale(0.72);
    this.moonHalo.setAlpha(0.1).setScale(0.9);
    this.eclipseShade.setAlpha(0.48);
    this.moonShards.forEach((shard) => shard.setAlpha(0.92));
    this.beginPostEclipseDialogue();
  }

  revealBakunawa() {
    this.phaseText.setText("Something enters the moonlight").setColor("#d6b6ce");
    this.boss.setAlpha(1).play("final-boss-walk", true);
    this.bossAura.setAlpha(0.24);
    this.tweens.add({
      targets: this.boss,
      x: this.bossPoint.x,
      duration: 820,
      ease: "Sine.easeOut",
      onComplete: () => this.boss.play("final-boss-idle", true),
    });
    this.tweens.add({
      targets: this.bossAura,
      x: this.bossPoint.x,
      duration: 820,
      ease: "Sine.easeOut",
    });
  }

  castOpeningEclipse() {
    this.phaseText.setText("Bakunawa invokes the eclipse").setColor("#e5b3d4");
    this.boss.play("final-boss-attack", true);
    this.sound.play("final_magicbeam", { volume: 0.13, rate: 0.52 });
    this.schedule(130, () => this.sound.play("final_magicbeam", { volume: 0.3, rate: 0.92 }));
    this.eclipseOrb
      .setPosition(this.projectilePoint.x, this.projectilePoint.y + this.offsetY)
      .setAlpha(1)
      .setScale(0.45);
    this.tweens.add({
      targets: this.eclipseRing,
      scale: 1.35,
      alpha: 0.15,
      duration: 260,
      yoyo: true,
      repeat: 3,
    });
    this.eclipseSmoke.forEach((smoke, index) => {
      this.tweens.add({
        targets: smoke,
        x: smoke.x + (index - 1) * 8,
        y: smoke.y - 10,
        alpha: 0.2,
        duration: 360 + index * 80,
        yoyo: true,
        repeat: 2,
      });
    });
    this.tweens.add({
      targets: this.eclipseOrb,
      x: this.moon.x,
      y: this.moon.y,
      scale: 0.9,
      angle: -150,
      duration: 1050,
      ease: "Cubic.easeIn",
      onComplete: () => {
        this.shakeCamera(90, 0.002);
        this.schedule(110, () => this.coverMoon());
      },
    });
    this.schedule(500, () => {
      this.panCamera(this.moon.x, 250, 620);
    });
  }

  coverMoon() {
    this.eclipseOrb.setAlpha(0);
    this.sound.play("final_magicbeam", { volume: 0.24, rate: 0.68 });
    this.shakeCamera(220, 0.004);
    this.createBurst(this.moon.x, this.moon.y, 0x9550bd, 22);
    this.moon.setTint(0x687080);
    this.tweens.add({ targets: this.moon, alpha: 0.7, duration: 360 });
    this.tweens.add({ targets: this.moonHalo, alpha: 0.1, scale: 0.9, duration: 420 });
    this.tweens.add({ targets: this.eclipseShade, alpha: 0.48, duration: 520 });
    this.moonShards.forEach((shard, index) => {
      this.schedule(index * 105, () => {
        this.tweens.add({ targets: shard, alpha: 0.92, duration: 190 });
        this.createEclipseSealPulse(index);
      });
    });
    this.phaseText.setText("Six seals hold the eclipse").setColor("#c7dce8");
    this.markOpeningSeen();
    this.skipOpeningButton?.setVisible(false);
    this.schedule(980, () => {
      this.panCamera(480, 288, 720);
      this.schedule(740, () => {
        this.beginPostEclipseDialogue();
      });
    });
  }

  beginPostEclipseDialogue() {
    this.skipOpeningButton?.setVisible(false);
    this.phaseText.setText("Six seals await").setColor("#c7dce8");
    this.restorePhaseProgress();
    this.mode = "idle";
    gameEvents.emit(GAME_LEVEL_DIALOGUE_TRIGGERED, {
      levelNumber: LEVEL_NUMBER,
      dialogueId: OPENING_DIALOGUE_ID,
    });
  }

  createEclipseSealPulse(index) {
    const angle = -Math.PI / 2 + (index + 0.5) * (Math.PI / 3);
    const pulse = this.add
      .circle(
        this.moon.x + Math.cos(angle) * 35,
        this.moon.y + Math.sin(angle) * 35,
        7,
        0x8c4aae,
        0.32,
      )
      .setStrokeStyle(1, 0xc482e4, 0.65)
      .setDepth(-1.9)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.effects.push(pulse);
    this.tweens.add({
      targets: pulse,
      scale: 2.4,
      alpha: 0,
      duration: 430,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.effects, pulse);
        pulse.destroy();
      },
    });
  }

  resolveMapObjects() {
    const points = {};
    this.map.objects.forEach((layer) => {
      layer.objects?.forEach((object) => {
        if (!object.name) return;
        points[object.name] = {
          x: object.x,
          y: object.y,
          width: object.width,
          height: object.height,
        };
      });
    });
    return points;
  }

  schedule(delay, callback) {
    const adjustedDelay = this.reducedMotion ? Math.max(30, delay * 0.32) : delay;
    const timer = this.time.delayedCall(adjustedDelay, callback);
    this.timers.push(timer);
    return timer;
  }

  cleanup() {
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.off(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    gameEvents.off(GAME_ACCESSIBILITY_CHANGED, this.onAccessibilityChanged, this);
    gameEvents.off(GAME_LEVEL_RESET, this.onLevelReset, this);
    this.timers.forEach((timer) => timer.remove(false));
    this.effects.forEach((effect) => effect.destroy());
    this.diwata?.destroy();
  }

  readPreference(key, fallback = false) {
    try {
      const saved = window.localStorage.getItem(key);
      return saved == null ? fallback : saved === "true";
    } catch {
      return fallback;
    }
  }

  readPhaseProgress() {
    try {
      const saved = Number(window.localStorage.getItem(PHASE_PROGRESS_KEY));
      return Number.isInteger(saved) ? Phaser.Math.Clamp(saved, 0, 6) : 0;
    } catch {
      return 0;
    }
  }

  writePhaseProgress(count) {
    try {
      window.localStorage.setItem(PHASE_PROGRESS_KEY, String(Phaser.Math.Clamp(count, 0, 6)));
    } catch {
      // Phase recovery is optional when storage is unavailable.
    }
  }

  clearPhaseProgress() {
    try {
      window.localStorage.removeItem(PHASE_PROGRESS_KEY);
    } catch {
      // Ignore unavailable storage.
    }
  }

  restorePhaseProgress() {
    const count = this.readPhaseProgress();
    this.completedPhaseCount = count;
    for (let index = 0; index < 6; index += 1) {
      const completed = index < count;
      this.phaseMarks[index]
        .setColor(completed ? "#071319" : "#657c88")
        .setBackgroundColor(completed ? "#7ee7f2" : "#0b1b26")
        .setScale(1);
      this.wardNodes[index]
        .setFillStyle(completed ? 0x9af5ff : 0x365166, completed ? 1 : 0.55)
        .setStrokeStyle(completed ? 2 : 1, completed ? 0xffffff : 0x6d8797, completed ? 0.9 : 0.7)
        .setScale(1);
      this.moonShards[index].setAlpha(completed ? 0 : 0.92);
    }

    if (count > 0) {
      const lastIndex = count - 1;
      this.moon.setTint(MOON_PHASE_TINTS[lastIndex]).setAlpha(0.74 + lastIndex * 0.04).setScale(0.73 + lastIndex * 0.012);
      this.moonHalo.setAlpha(0.14 + lastIndex * 0.055).setScale(0.92 + lastIndex * 0.035);
      this.eclipseShade.setAlpha(Math.max(0.12, 0.43 - lastIndex * 0.052));
      this.bossHealth.setScale(1 - count / 6, 1);
      this.phaseText.setText(`${count}/6 seals restored`).setColor("#bff5ff");
    }
  }

  onLevelReset({ levelNumber } = {}) {
    if (Number(levelNumber) !== LEVEL_NUMBER) return;
    this.clearPhaseProgress();
    this.completedPhaseCount = 0;
    this.restorePhaseProgress();
    this.moon.clearTint().setAlpha(0.72).setScale(0.72);
    this.moonHalo.setAlpha(0.1).setScale(0.9);
    this.eclipseShade.setAlpha(0.48);
    this.bossHealth.setScale(1, 1);
    this.phaseText.setText("Six seals await").setColor("#c7dce8");
  }

  onAccessibilityChanged({ isMuted, reducedMotion } = {}) {
    this.isMuted = Boolean(isMuted);
    this.reducedMotion = Boolean(reducedMotion);
    this.sound.mute = this.isMuted;
    this.tweens.timeScale = this.reducedMotion ? 3 : 1;
  }

  panCamera(x, y, duration) {
    if (this.reducedMotion) {
      this.cameras.main.centerOn(x, y);
      return;
    }
    this.cameras.main.pan(x, y, duration, "Sine.easeInOut");
  }

  shakeCamera(duration, intensity) {
    if (!this.reducedMotion) this.cameras.main.shake(duration, intensity);
  }
}
