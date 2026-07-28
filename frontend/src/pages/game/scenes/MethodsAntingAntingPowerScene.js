import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_DIALOGUE_CLOSED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";
import LayeredLpcCharacter from "../characters/LayeredLpcCharacter";
import { DIWATA_FAIRY_CONFIG } from "../characters/diwataFairyConfig";

const LEVEL_NUMBER = 22;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const MAP_KEY = "methods_level_9_anting_anting_power";
const MAP_PATH = `${ASSET_BASE}/maps/methods-level-9-anting-anting-power.tmj`;
const PLAYER_SCALE = 2;
const DIWATA_SCALE = 1.25;
const ENEMY_SCALE = 0.46;
const TARGET_POWER = 8;
const SHIELD_BLUE = 0x8df4ff;
const POWER_GOLD = 0xf4d37b;
const FAIL_RED = 0xff6677;
const SOURCE_AMULET_SCALE = 0.095;

export default class MethodsAntingAntingPowerScene extends Phaser.Scene {
  constructor() {
    super("MethodsAntingAntingPowerScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("methods_9_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("methods_9_decor", `${GH_BASE}/Decor.png`);
    this.load.image("methods_9_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("methods_9_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("methods_9_house", `${GH_BASE}/House_Tiles.png`);
    this.load.image("methods_9_other", `${GH_BASE}/Other_Tiles2.png`);
    this.load.image("methods_9_other_flipped", `${GH_BASE}/Other_Tiles2(Flipped).png`);
    this.load.image("methods_9_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("methods_9_willow_big", `${GH_BASE}/Weeping_Willow1Big.png`);
    this.load.image("methods_9_willow", `${GH_BASE}/Weeping_Willow1.png`);
    this.load.image("methods_9_tree_1", `${GH_BASE}/Tree1.png`);
    this.load.image("methods_9_large_pine", `${GH_BASE}/Large_Pine_Tree.png`);
    this.load.image("methods_9_wheat", `${GH_BASE}/Pixel_Art_Wheat.png`);
    this.load.image("methods_9_signage_1", `${ASSET_BASE}/other/signage1.png`);
    this.load.image("methods_9_signage_2", `${ASSET_BASE}/other/signage2.png`);
    this.load.image("methods_9_candle", `${ASSET_BASE}/other/unlit_candle.png`);
    this.load.image("methods_9_candle_tileset", `${ASSET_BASE}/other/unlit_candle_tileset.png`);
    this.load.image("methods_9_water", `${GH_BASE}/Animated_Sprites/GandalfHardcore_Animated_Water_Tiles.png`);
    this.load.image("methods_9_ladder", `${ASSET_BASE}/other/ladder/128x585/ladder2.png`);
    this.load.image("methods_9_shrine_offering", `${ASSET_BASE}/other/shrine_offering.png`);
    this.load.image("methods_9_altar", `${ASSET_BASE}/other/anting_anting_altar.png`);
    this.load.image("methods_9_exit_sign", `${ASSET_BASE}/other/exit_sign.png`);
    this.load.image("methods_9_blue_amulet", `${ASSET_BASE}/other/blue_amulet.png`);
    this.load.image("methods_9_gold_amulet", `${ASSET_BASE}/other/gold_amulet.png`);
    this.load.image("methods_9_shield", `${ASSET_BASE}/other/shield.png`);
    this.load.spritesheet(
      "methods_9_fireball",
      `${ASSET_BASE}/other/Fireball_Pack/Fireball_Pack/Fireball_Sprite_Sheet.png`,
      { frameWidth: 32, frameHeight: 32 },
    );
    this.load.spritesheet(
      "methods_9_enemy",
      `${ASSET_BASE}/characters/monsters/Manangy-fly_idle.png`,
      { frameWidth: 256, frameHeight: 256 },
    );
    this.load.spritesheet("methods_9_player", `${ASSET_BASE}/characters/players/char_blue_1.png`, {
      frameWidth: 56,
      frameHeight: 56,
    });
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
    this.load.image("methods_9_bg5", `${BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("methods_9_bg4", `${BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("methods_9_bg3", `${BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("methods_9_bg2", `${BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("methods_9_bg1", `${BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
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
    this.spawnPoint = this.points.player_spawn ?? { x: 360, y: 450 };
    this.diwataPoint = this.points.diwata_spawn ?? { x: 265, y: this.spawnPoint.y };
    this.antingPoint = this.points.amulet_point ?? this.points.anting_point ?? { x: 405, y: this.spawnPoint.y };
    this.enemyPoint = this.points.enemy_spawn ?? this.points.shadow_spawn ?? { x: 780, y: this.spawnPoint.y };
    this.projectileSpawnPoint = this.points.projectile_spawn ?? {
      x: this.enemyPoint.x - 56,
      y: this.enemyPoint.y - 92,
    };
    this.shieldPoint = this.points.shield_point ?? this.points.impact_point ?? { x: this.spawnPoint.x + 70, y: this.spawnPoint.y };
    this.impactPoint = this.points.projectile_target ?? this.points.impact_point ?? this.shieldPoint;
    this.exitPoint = this.points.level_exit ?? { x: map.widthInPixels - 96, y: this.spawnPoint.y };

    this.createDiwata();
    this.createPlayer();
    this.createMeter();
    this.createEnemy();
    this.createShadowProjectile();
    this.createLabels();
    this.setupCamera(map);

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.on(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  createBackgrounds(map) {
    [
      ["methods_9_bg5", 0.08, -8, 0.78, 0],
      ["methods_9_bg4", 0.14, -7, 0.7, 0],
      ["methods_9_bg3", 0.32, -6, 0.62, 88],
      ["methods_9_bg2", 0.58, -5, 0.58, 176],
      ["methods_9_bg1", 0.82, -4, 0.5, 225],
    ].forEach(([key, factor, depth, alpha, y]) => {
      this.add
        .tileSprite(0, y, map.widthInPixels, this.scale.height - y, key)
        .setOrigin(0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x20384c)
        .setAlpha(alpha);
    });
    this.add.rectangle(0, 0, map.widthInPixels, 576, 0x020610, 0.3).setOrigin(0).setDepth(-3);
  }

  createTileLayers(map) {
    const tilesets = [
      map.addTilesetImage("Floor_Tiles2", "methods_9_floor"),
      map.addTilesetImage("Decor", "methods_9_decor"),
      map.addTilesetImage("Garden_Decorations", "methods_9_garden"),
      map.addTilesetImage("Pine_Trees", "methods_9_pines"),
      map.addTilesetImage("House_Tiles", "methods_9_house"),
      map.addTilesetImage("Other_Tiles2", "methods_9_other"),
      map.addTilesetImage("Other_Tiles2(Flipped)", "methods_9_other_flipped"),
      map.addTilesetImage("Pine_forest_sheet", "methods_9_forest"),
      map.addTilesetImage("Weeping_Willow1Big", "methods_9_willow_big"),
      map.addTilesetImage("Weeping_Willow1", "methods_9_willow"),
      map.addTilesetImage("Tree1", "methods_9_tree_1"),
      map.addTilesetImage("Large_Pine_Tree", "methods_9_large_pine"),
      map.addTilesetImage("Pixel_Art_Wheat", "methods_9_wheat"),
      map.addTilesetImage("signage1", "methods_9_signage_1"),
      map.addTilesetImage("signage2", "methods_9_signage_2"),
      map.addTilesetImage("unlit_candle", "methods_9_candle"),
      map.addTilesetImage("unlit_candle_tileset", "methods_9_candle_tileset"),
      map.addTilesetImage("GandalfHardcore_Animated_Water_Tiles", "methods_9_water"),
      map.addTilesetImage("ladder2", "methods_9_ladder"),
      map.addTilesetImage("shrine_offering", "methods_9_shrine_offering"),
      map.addTilesetImage("anting_anting_altar", "methods_9_altar"),
      map.addTilesetImage("exit_sign", "methods_9_exit_sign"),
    ].filter(Boolean);

    ["platform", "trees", "decoration", "front_decoration"].forEach((name, index) => {
      const layer = map.createLayer(name, tilesets, 0, this.offsetY);
      if (layer) layer.setDepth(0.1 + index * 0.25);
    });
  }

  createAnimations() {
    [
      ["methods-9-player-idle", 0, 5, 6],
      ["methods-9-player-run", 16, 23, 12],
      ["methods-9-player-hurt", 48, 55, 10],
      ["methods-9-player-cast", 64, 71, 10],
    ].forEach(([key, start, end, frameRate]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("methods_9_player", { start, end }),
        frameRate,
        repeat: key.includes("hurt") || key.includes("cast") ? 0 : -1,
      });
    });
    if (!this.anims.exists("methods-9-enemy-idle")) {
      this.anims.create({
        key: "methods-9-enemy-idle",
        frames: this.anims.generateFrameNumbers("methods_9_enemy", { start: 0, end: 7 }),
        frameRate: 8,
        repeat: -1,
      });
    }
    if (!this.anims.exists("methods-9-purple-fireball")) {
      this.anims.create({
        key: "methods-9-purple-fireball",
        frames: this.anims.generateFrameNumbers("methods_9_fireball", { start: 4, end: 7 }),
        frameRate: 12,
        repeat: -1,
      });
    }
  }

  createDiwata() {
    this.diwata = new LayeredLpcCharacter(this, this.diwataPoint.x, this.diwataPoint.y - 8, {
      ...DIWATA_FAIRY_CONFIG,
      scale: DIWATA_SCALE,
      direction: "right",
      action: "idle",
    }).setDepth(1.55);
    this.diwataAura = this.add
      .ellipse(this.diwataPoint.x, this.diwataPoint.y - 32, 60, 82, 0x8df4ff, 0.12)
      .setDepth(1.2)
      .setBlendMode(Phaser.BlendModes.SCREEN);
  }

  createPlayer() {
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "methods_9_player")
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.7);
    this.player.play("methods-9-player-idle");
  }

  createMeter() {
    this.meterX = this.spawnPoint.x - 6;
    this.meterY = 96;
    this.add.rectangle(this.meterX, this.meterY, 158, 50, 0x07141f, 0.64).setStrokeStyle(1, SHIELD_BLUE, 0.28).setDepth(2);
    this.add.text(this.meterX - 68, this.meterY - 20, "power", {
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#b9dae3",
    }).setDepth(2.1);
    this.add.text(this.meterX + 55, this.meterY - 20, "8", {
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#f4d37b",
    }).setOrigin(0.5, 0).setDepth(2.1);
    this.meterFill = this.add.rectangle(this.meterX - 60, this.meterY + 10, 0, 9, SHIELD_BLUE, 0.8).setOrigin(0, 0.5).setDepth(2.1);
    this.add.rectangle(this.meterX, this.meterY + 10, 120, 9, 0x12283a, 0.35).setStrokeStyle(1, 0x8df4ff, 0.2).setDepth(2.05);
    this.targetTick = this.add.rectangle(this.meterX + 60, this.meterY + 10, 2, 18, POWER_GOLD, 0.66).setDepth(2.2);

    this.baseAmulet = this.add
      .image(this.antingPoint.x - 46, this.antingPoint.y - 45, "methods_9_blue_amulet")
      .setScale(SOURCE_AMULET_SCALE)
      .setDepth(1.9)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.bonusAmulet = this.add
      .image(this.antingPoint.x + 46, this.antingPoint.y - 45, "methods_9_gold_amulet")
      .setScale(SOURCE_AMULET_SCALE)
      .setDepth(1.9)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.baseBadge = this.add
      .rectangle(this.baseAmulet.x, this.baseAmulet.y - 36, 22, 18, 0x06131f, 0.74)
      .setStrokeStyle(1, SHIELD_BLUE, 0.45)
      .setDepth(2.18);
    this.bonusBadge = this.add
      .rectangle(this.bonusAmulet.x, this.bonusAmulet.y - 36, 22, 18, 0x1d1204, 0.74)
      .setStrokeStyle(1, POWER_GOLD, 0.48)
      .setDepth(2.18);
    this.baseText = this.add.text(this.baseAmulet.x, this.baseAmulet.y - 27, "5", {
      fontFamily: "monospace",
      fontSize: "15px",
      fontStyle: "bold",
      color: "#d8f8ff",
      stroke: "#06131f",
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(2.2);
    this.bonusText = this.add.text(this.bonusAmulet.x, this.bonusAmulet.y - 27, "3", {
      fontFamily: "monospace",
      fontSize: "15px",
      fontStyle: "bold",
      color: "#ffe9a8",
      stroke: "#1d1204",
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(2.2);
    this.baseText.setY(this.baseBadge.y);
    this.bonusText.setY(this.bonusBadge.y);
  }

  createValueArrow(from, to, color, delay = 0) {
    const arrow = this.add.graphics().setDepth(2.21).setBlendMode(Phaser.BlendModes.SCREEN);
    arrow.lineStyle(1, color, 0.72);
    arrow.lineBetween(from.x, from.y, to.x, to.y);
    arrow.fillStyle(color, 0.72);
    arrow.fillTriangle(to.x, to.y, to.x - 4, to.y - 3, to.x - 2, to.y + 4);
    arrow.setAlpha(0);
    this.temporaryEffects.push(arrow);
    this.tweens.add({
      targets: arrow,
      alpha: 0.82,
      delay,
      duration: 180,
      yoyo: true,
      hold: 520,
      ease: "Sine.easeInOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, arrow);
        arrow.destroy();
      },
    });
  }

  createEnemy() {
    this.enemyAura = this.add
      .ellipse(this.enemyPoint.x, this.enemyPoint.y - 62, 112, 142, 0x42101c, 0.34)
      .setDepth(1.32)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.enemy = this.add
      .sprite(this.enemyPoint.x, this.enemyPoint.y - 8, "methods_9_enemy")
      .setOrigin(0.5, 1)
      .setScale(ENEMY_SCALE)
      .setDepth(1.82)
      .setFlipX(true)
      .setTint(0xd4b8c4)
      .play("methods-9-enemy-idle");
    this.startEnemyAuraPulse();
  }

  startEnemyAuraPulse() {
    this.tweens.killTweensOf(this.enemyAura);
    this.tweens.add({
      targets: this.enemyAura,
      alpha: 0.48,
      scaleX: 1.08,
      scaleY: 1.06,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createShadowProjectile() {
    this.shadow = this.add
      .sprite(this.projectileSpawnPoint.x, this.projectileSpawnPoint.y, "methods_9_fireball", 4)
      .setOrigin(0.5)
      .setScale(2.05)
      .setDepth(1.9)
      .setAlpha(0)
      .setFlipX(true)
      .setTint(0xe7c8ff)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.shadowGlow = this.add
      .ellipse(this.shadow.x, this.shadow.y, 82, 54, 0x7b2cff, 0.16)
      .setDepth(1.2)
      .setBlendMode(Phaser.BlendModes.SCREEN)
      .setAlpha(0);
    this.tweens.add({
      targets: [this.shadow, this.shadowGlow],
      y: "-=8",
      duration: 1150,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createLabels() {
    this.callText = this.add.text(this.antingPoint.x, this.antingPoint.y - 104, "CalculatePower(?, ?)", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#f4e7cc",
      backgroundColor: "#07141fcc",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(2.2);
    this.powerText = this.add.text(this.meterX, this.meterY + 32, "waiting", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#b9dae3",
      backgroundColor: "#07141f99",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(2.2);
  }

  onCodeEvaluated({ levelNumber, isCorrect, sourceCode }) {
    if (Number(levelNumber) !== LEVEL_NUMBER) return;
    this.lastSourceCode = sourceCode ?? "";
    this.resetAttempt();
    if (isCorrect) this.runPowerSequence(true);
    else this.runPowerSequence(false);
  }

  onDialogueClosed({ levelNumber }) {
    if (Number(levelNumber) !== LEVEL_NUMBER) return;
    this.playOpeningPreview();
  }

  runPowerSequence(isCorrect) {
    const power = isCorrect ? TARGET_POWER : this.extractComputedPower(this.lastSourceCode);
    const visiblePower = Number.isFinite(power) ? Phaser.Math.Clamp(power, 0, 12) : 0;
    this.sequenceMode = "charging";
    this.callText.setText("CalculatePower(5, 3)").setColor(isCorrect ? "#f8fbff" : "#ffb8c0");
    this.player.play("methods-9-player-cast", true);
    this.pulsePowerSources(isCorrect);
    this.showArgumentFlow(isCorrect);
    this.createEnergyStream(this.baseAmulet, { x: this.meterX - 18, y: this.meterY + 10 }, SHIELD_BLUE, 80);
    this.createEnergyStream(this.bonusAmulet, { x: this.meterX + 18, y: this.meterY + 10 }, POWER_GOLD, 210);
    this.tweens.add({
      targets: this.meterFill,
        width: Phaser.Math.Clamp((visiblePower / TARGET_POWER) * 120, 0, 120),
      delay: 320,
      duration: 620,
      ease: "Sine.easeOut",
    });
    this.powerText.setText(`power = ${Number.isFinite(power) ? power : "?"}`).setColor(isCorrect ? "#f4d37b" : "#ffb8c0");
    if (isCorrect) {
      this.schedule(900, () => {
        this.flashMeterTarget();
        this.braceKai();
        this.showReturnValueFlow();
      });
      this.schedule(1120, () => this.createShieldWard());
      this.schedule(1360, () => this.launchShadow(true));
      return;
    }
    this.schedule(980, () => this.launchShadow(false));
  }

  showArgumentFlow(isCorrect) {
    const targetY = this.callText.y + 14;
    this.createValueArrow(
      { x: this.baseText.x, y: this.baseText.y - 2 },
      { x: this.callText.x - 34, y: targetY },
      isCorrect ? SHIELD_BLUE : FAIL_RED,
      70,
    );
    this.createValueArrow(
      { x: this.bonusText.x, y: this.bonusText.y - 2 },
      { x: this.callText.x + 34, y: targetY },
      isCorrect ? POWER_GOLD : FAIL_RED,
      160,
    );
  }

  showReturnValueFlow() {
    const returnText = this.add.text(this.callText.x, this.callText.y - 28, "return 8", {
      fontFamily: "monospace",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#f4d37b",
      backgroundColor: "#07141fcc",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(2.24);
    this.temporaryEffects.push(returnText);
    this.tweens.add({
      targets: returnText,
      x: this.meterX,
      y: this.meterY + 30,
      alpha: 0,
      duration: 560,
      ease: "Sine.easeInOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, returnText);
        returnText.destroy();
      },
    });
  }

  flashMeterTarget() {
    this.tweens.add({
      targets: [this.targetTick, this.powerText],
      alpha: 1,
      scaleX: 1.18,
      scaleY: 1.18,
      duration: 150,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
    this.createBurst({ x: this.meterX + 60, y: this.meterY + 50 }, POWER_GOLD, 8, 28);
  }

  braceKai() {
    this.player.play("methods-9-player-cast", true);
    this.tweens.add({
      targets: this.player,
      x: this.spawnPoint.x - 10,
      duration: 150,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
  }

  pulsePowerSources(isCorrect) {
    [this.baseAmulet, this.bonusAmulet].forEach((amulet, index) => {
      this.tweens.add({
        targets: amulet,
        scale: isCorrect ? 0.13 : 0.11,
        alpha: isCorrect ? 1 : 0.72,
        delay: index * 130,
        duration: 220,
        yoyo: true,
        ease: "Sine.easeInOut",
      });
    });
  }

  createEnergyStream(from, to, color, delay = 0) {
    for (let index = 0; index < 10; index += 1) {
      const mote = this.add
        .circle(from.x, from.y, Phaser.Math.Between(2, 4), color, 0.82)
        .setDepth(2.18)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0);
      this.temporaryEffects.push(mote);
      this.tweens.add({
        targets: mote,
        x: to.x + Phaser.Math.Between(-8, 8),
        y: to.y + Phaser.Math.Between(-8, 8),
        alpha: { from: 0, to: 1 },
        delay: delay + index * 28,
        duration: 390,
        ease: "Sine.easeInOut",
        onComplete: () => {
          Phaser.Utils.Array.Remove(this.temporaryEffects, mote);
          mote.destroy();
        },
      });
    }
  }

  launchShadow(isCorrect) {
    const targetX = isCorrect ? this.impactPoint.x : this.spawnPoint.x + 32;
    const targetY = isCorrect ? this.impactPoint.y - 54 : this.spawnPoint.y - 52;
    this.shadow
      .setPosition(this.projectileSpawnPoint.x, this.projectileSpawnPoint.y)
      .setAlpha(1)
      .setScale(2.05)
      .setRotation(-0.08)
      .play("methods-9-purple-fireball", true);
    this.shadowGlow.setPosition(this.projectileSpawnPoint.x, this.projectileSpawnPoint.y).setAlpha(0.18);
    this.tweens.add({
      targets: [this.enemy, this.enemyAura],
      x: "-=18",
      duration: 160,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: [this.shadow, this.shadowGlow],
      x: targetX,
      y: targetY,
      duration: 760,
      ease: "Sine.easeIn",
      onComplete: () => {
        if (isCorrect) this.pauseOnShieldImpact();
        else this.failShield();
      },
    });
  }

  pauseOnShieldImpact() {
    this.createShieldImpact();
    this.cameras.main.shake(130, 0.003);
    this.tweens.add({
      targets: [this.shadow, this.shadowGlow],
      scale: "+=0.24",
      alpha: 1,
      duration: 70,
      yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => this.schedule(90, () => this.blockShadow()),
    });
  }

  blockShadow() {
    this.createBurst(this.impactPoint, SHIELD_BLUE);
    this.shadow.setAlpha(0);
    this.shadow.stop();
    this.shadowGlow.setAlpha(0);
    this.enemy.setTint(0xffd6f4);
    this.tweens.add({
      targets: this.enemy,
      x: this.enemy.x + 34,
      duration: 120,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
      onComplete: () => this.enemy.setTint(0xd4b8c4),
    });
    this.tweens.add({
      targets: [this.enemy, this.enemyAura],
      x: this.enemyPoint.x + 150,
      alpha: 0,
      delay: 260,
      duration: 700,
      ease: "Sine.easeInOut",
    });
    this.schedule(980, () => this.finishSuccess());
  }

  createShieldWard() {
    const x = this.shieldPoint.x;
    const y = this.shieldPoint.y - 62;
    this.weakenEnemyAura();
    const glow = this.add
      .ellipse(x, y, 136, 164, SHIELD_BLUE, 0.12)
      .setDepth(1.82)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    const shieldImage = this.add
      .image(x, y - 2, "methods_9_shield")
      .setOrigin(0.5)
      .setScale(0.165)
      .setAlpha(0.96)
      .setFlipX(true)
      .setDepth(2.02)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    const rimPulse = this.add
      .ellipse(x, y, 98, 138, 0xffffff, 0.02)
      .setStrokeStyle(2, 0xc9ffff, 0.52)
      .setDepth(2.04)
      .setBlendMode(Phaser.BlendModes.ADD);
    const baseRing = this.add
      .ellipse(x, this.shieldPoint.y - 4, 108, 20, SHIELD_BLUE, 0.12)
      .setStrokeStyle(2, 0xc9ffff, 0.68)
      .setDepth(2.04)
      .setBlendMode(Phaser.BlendModes.SCREEN);

    const shieldParts = [glow, shieldImage, rimPulse, baseRing];
    this.temporaryEffects.push(...shieldParts);

    this.tweens.add({
      targets: [glow, rimPulse],
      scaleX: 1.08,
      scaleY: 1.05,
      alpha: "+=0.08",
      duration: 260,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: shieldImage,
      scale: 0.178,
      alpha: 1,
      duration: 260,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
    for (let index = 0; index < 26; index += 1) {
      const angle = Phaser.Math.FloatBetween(-1.25, 1.25);
      const radiusX = 50 + Phaser.Math.Between(-5, 8);
      const radiusY = 66 + Phaser.Math.Between(-6, 8);
      const mote = this.add
        .circle(x + Math.sin(angle) * radiusX, y + Math.cos(angle) * radiusY, Phaser.Math.Between(2, 4), 0xc9ffff, 0.86)
        .setDepth(2.12)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.temporaryEffects.push(mote);
      this.tweens.add({
        targets: mote,
        x: x + Math.sin(angle + 0.28) * (radiusX + 10),
        y: y + Math.cos(angle + 0.28) * (radiusY + 8),
        alpha: 0,
        scale: 0.25,
        delay: index * 14,
        duration: Phaser.Math.Between(420, 720),
        ease: "Sine.easeOut",
        onComplete: () => {
          Phaser.Utils.Array.Remove(this.temporaryEffects, mote);
          mote.destroy();
        },
      });
    }
  }

  weakenEnemyAura() {
    this.tweens.killTweensOf(this.enemyAura);
    this.tweens.add({
      targets: this.enemyAura,
      alpha: 0.16,
      scaleX: 0.84,
      scaleY: 0.84,
      duration: 360,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: this.enemy,
      tint: 0x9b7d96,
      duration: 360,
      ease: "Sine.easeOut",
    });
  }

  createShieldImpact() {
    const impactRing = this.add
      .ellipse(this.impactPoint.x, this.impactPoint.y - 54, 30, 74, 0xffffff, 0.1)
      .setStrokeStyle(2, 0xffffff, 0.82)
      .setDepth(2.16)
      .setBlendMode(Phaser.BlendModes.ADD);
    const slash = this.add.graphics().setDepth(2.17).setBlendMode(Phaser.BlendModes.ADD);
    slash.lineStyle(3, 0xc9ffff, 0.88);
    slash.lineBetween(this.impactPoint.x - 18, this.impactPoint.y - 84, this.impactPoint.x + 12, this.impactPoint.y - 24);
    slash.lineStyle(1, 0xffffff, 0.65);
    slash.lineBetween(this.impactPoint.x - 28, this.impactPoint.y - 62, this.impactPoint.x + 18, this.impactPoint.y - 44);
    this.temporaryEffects.push(impactRing, slash);
    this.tweens.add({
      targets: impactRing,
      scaleX: 2.1,
      scaleY: 1.35,
      alpha: 0,
      duration: 380,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: slash,
      alpha: 0,
      duration: 260,
      ease: "Sine.easeOut",
    });
  }

  failShield() {
    this.powerText.setText("not enough power").setColor("#ffb8c0");
    this.shadow.setAlpha(0).stop();
    this.shadowGlow.setAlpha(0);
    this.createBurst({ x: this.spawnPoint.x + 32, y: this.spawnPoint.y - 48 }, FAIL_RED);
    this.player.play("methods-9-player-hurt", true);
    this.schedule(900, () => {
      this.sequenceMode = "idle";
      this.player.play("methods-9-player-idle", true);
      this.resetAttempt();
    });
  }

  createBurst(point, color, count = 18, spread = 58) {
    for (let index = 0; index < count; index += 1) {
      const spark = this.add.circle(point.x, point.y - 42, Phaser.Math.Between(2, 5), color, 0.86)
        .setDepth(2.25)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.temporaryEffects.push(spark);
      this.tweens.add({
        targets: spark,
        x: spark.x + Phaser.Math.Between(-spread, spread),
        y: spark.y + Phaser.Math.Between(-spread, Math.round(spread * 0.72)),
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(420, 780),
        ease: "Sine.easeOut",
        onComplete: () => {
          Phaser.Utils.Array.Remove(this.temporaryEffects, spark);
          spark.destroy();
        },
      });
    }
  }

  playOpeningPreview() {
    this.schedule(260, () => this.panTo(this.enemyPoint.x - 140, 760));
    this.schedule(1360, () => this.panTo(this.spawnPoint.x + 180, 760));
  }

  resetAttempt() {
    this.sequenceTimers.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.temporaryEffects.forEach((effect) => effect.destroy());
    this.temporaryEffects = [];
    this.tweens.killTweensOf([
      this.player,
      this.enemy,
      this.enemyAura,
      this.shadow,
      this.shadowGlow,
      this.meterFill,
      this.baseAmulet,
      this.bonusAmulet,
      this.callText,
      this.powerText,
      this.targetTick,
    ]);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y).setAlpha(1).clearTint().play("methods-9-player-idle", true);
    this.enemy.setPosition(this.enemyPoint.x, this.enemyPoint.y - 8).setAlpha(1).setFlipX(true);
    this.enemyAura.setPosition(this.enemyPoint.x, this.enemyPoint.y - 62).setAlpha(0.34).setScale(1);
    this.startEnemyAuraPulse();
    this.shadow.setPosition(this.projectileSpawnPoint.x, this.projectileSpawnPoint.y).setAlpha(0);
    this.shadow.stop();
    this.shadowGlow.setPosition(this.projectileSpawnPoint.x, this.projectileSpawnPoint.y).setAlpha(0);
    this.meterFill.width = 0;
    this.targetTick.setScale(1).setAlpha(0.66);
    this.baseAmulet.setScale(SOURCE_AMULET_SCALE).setAlpha(1);
    this.bonusAmulet.setScale(SOURCE_AMULET_SCALE).setAlpha(1);
    this.callText.setText("CalculatePower(?, ?)").setColor("#f4e7cc");
    this.powerText.setText("waiting").setColor("#b9dae3").setScale(1);
    this.sequenceMode = "idle";
  }

  finishSuccess() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: "CalculatePower returned 8. The anting-anting shield blocked the shadow.",
      shouldProceed: true,
    });
  }

  extractComputedPower(sourceCode) {
    const match = (sourceCode ?? "").match(/\bCalculatePower\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/);
    if (!match) return NaN;
    return Number(match[1]) + Number(match[2]);
  }

  resolveMapPoints(map) {
    const points = {};
    map.getObjectLayer("objects")?.objects?.forEach((object) => {
      if (!object.name) return;
      points[object.name] = {
        x: object.x + (object.width ?? 0) / 2,
        y: object.y + (object.height ?? 0) + this.offsetY,
      };
    });
    return points;
  }

  setupCamera(map) {
    this.cameras.main.setBounds(0, 0, map.widthInPixels, this.scale.height);
    this.cameras.main.centerOn(this.spawnPoint.x + 210, this.scale.height / 2);
  }

  panTo(x, duration = 520) {
    this.cameras.main.pan(x, this.scale.height / 2, duration, "Sine.easeInOut");
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
  }
}
