import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_DIALOGUE_CLOSED,
  GAME_LEVEL_DIALOGUE_TRIGGERED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";
import LayeredLpcCharacter from "../characters/LayeredLpcCharacter";
import { DIWATA_FAIRY_CONFIG } from "../characters/diwataFairyConfig";

const LEVEL_NUMBER = 23;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const MAP_KEY = "methods_level_10_healing_ritual";
const MAP_PATH = `${ASSET_BASE}/maps/methods-level-10-healing-ritual.tmj`;
const PLAYER_SCALE = 2;
const DIWATA_SCALE = 1.25;
const MONSTER_SCALE = 0.45;
const TARGET_HEALING = 10;
const WOUNDED_HEALING = 2;
const HEAL_GREEN = 0x9dffb1;
const CRITICAL_RED = 0xff5b68;
const WATER_BLUE = 0x9ce7ff;
const HERB_GREEN = 0x98e86f;
const FAIL_RED = 0xff6677;
const AFTER_ATTACK_DIALOGUE_ID = "methods-10-after-attack";

export default class MethodsHealingRitualScene extends Phaser.Scene {
  constructor() {
    super("MethodsHealingRitualScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("methods_10_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("methods_10_decor", `${GH_BASE}/Decor.png`);
    this.load.image("methods_10_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("methods_10_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("methods_10_house", `${GH_BASE}/House_Tiles.png`);
    this.load.image("methods_10_other", `${GH_BASE}/Other_Tiles2.png`);
    this.load.image("methods_10_other_flipped", `${GH_BASE}/Other_Tiles2(Flipped).png`);
    this.load.image("methods_10_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("methods_10_willow_big", `${GH_BASE}/Weeping_Willow1Big.png`);
    this.load.image("methods_10_willow", `${GH_BASE}/Weeping_Willow1.png`);
    this.load.image("methods_10_tree_1", `${GH_BASE}/Tree1.png`);
    this.load.image("methods_10_tree_2", `${GH_BASE}/Tree2.png`);
    this.load.image("methods_10_large_pine", `${GH_BASE}/Large_Pine_Tree.png`);
    this.load.image("methods_10_wheat", `${GH_BASE}/Pixel_Art_Wheat.png`);
    this.load.image("methods_10_altar", `${ASSET_BASE}/other/anting_anting_altar.png`);
    this.load.image("methods_10_exit_sign", `${ASSET_BASE}/other/exit_sign.png`);
    this.load.image("methods_10_water_jar", `${ASSET_BASE}/other/jars/32x32/Light blue.png`);
    this.load.audio("methods_10_heal_sound", `${ASSET_BASE}/sounds/heal_sound.mp3`);
    this.load.audio("methods_10_magicbeam_sound", `${ASSET_BASE}/sounds/projectile_magicbeam_sound.mp3`);
    this.load.image(
      "methods_10_herb",
      `${ASSET_BASE}/other/Herbs pack 16x16 free/Herbs pack 16x16 free/Bunches/bay_leaf 16.png`,
    );
    this.load.image("methods_10_heart_fx", `${ASSET_BASE}/characters/gandalfChar/gandalfHardcoreCharacterEffects/characterEffectsHeartsPink.png`);
    this.load.spritesheet(
      "methods_10_projectile",
      `${ASSET_BASE}/other/Fireball_Pack/Fireball_Pack/Fireball_Sprite_Sheet.png`,
      { frameWidth: 32, frameHeight: 32 },
    );
    this.load.spritesheet(
      "methods_10_monster",
      `${ASSET_BASE}/characters/monsters/Manangy-fly_idle.png`,
      { frameWidth: 256, frameHeight: 256 },
    );
    this.load.spritesheet("methods_10_player", `${ASSET_BASE}/characters/players/char_blue_1.png`, {
      frameWidth: 56,
      frameHeight: 56,
    });
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
    this.load.image("methods_10_bg5", `${BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("methods_10_bg4", `${BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("methods_10_bg3", `${BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("methods_10_bg2", `${BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("methods_10_bg1", `${BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
  }

  create() {
    this.scale.resize(1024, 576);
    const map = this.make.tilemap({ key: MAP_KEY });
    this.offsetY = this.scale.height - map.heightInPixels;
    this.sequenceMode = "idle";
    this.sequenceTimers = [];
    this.temporaryEffects = [];
    this.openingPreviewPlayed = false;
    this.criticalPulseTween = null;
    this.lastProjectileTrailAt = 0;

    this.createBackgrounds(map);
    this.createTileLayers(map);
    this.createAnimations();

    this.points = this.resolveMapPoints(map);
    this.spawnPoint = this.points.player_spawn ?? { x: 120, y: 448 };
    this.diwataPoint = this.points.diwata_spawn ?? this.points.healing_point ?? { x: this.spawnPoint.x + 280, y: this.spawnPoint.y };
    this.healingPoint = this.points.healing_point ?? { x: this.diwataPoint.x, y: this.diwataPoint.y };
    this.heartBarPoint = this.points.heart_bar_point ?? { x: this.diwataPoint.x, y: this.diwataPoint.y - 126 };
    this.herbPoint = this.points.herb_point ?? { x: this.diwataPoint.x - 160, y: this.diwataPoint.y };
    this.waterPoint = this.points.water_point ?? { x: this.diwataPoint.x - 84, y: this.diwataPoint.y };
    this.returnPoint = this.points.return_value_point ?? { x: this.diwataPoint.x + 95, y: this.diwataPoint.y - 160 };
    this.projectileSpawnPoint = this.points.projectile_spawn ?? this.points.monster_spawn ?? {
      x: this.diwataPoint.x + 440,
      y: this.diwataPoint.y - 96,
    };
    this.monsterPoint = this.points.monster_spawn ?? this.points.aswang_spawn ?? {
      x: this.projectileSpawnPoint.x,
      y: this.projectileSpawnPoint.y,
    };
    this.projectileLaunchPoint = this.points.projectile_spawn
      ? { x: this.projectileSpawnPoint.x, y: this.projectileSpawnPoint.y - 96 }
      : this.projectileSpawnPoint;
    this.impactPoint = this.points.impact_spawn ?? this.points.impact_point ?? {
      x: this.diwataPoint.x + 18,
      y: this.diwataPoint.y - 54,
    };
    this.exitPoint = this.points.level_exit ?? { x: map.widthInPixels - 96, y: this.spawnPoint.y };

    this.createDiwata();
    this.createPlayer();
    this.createMonster();
    this.createIngredients();
    this.createHeartBar();
    this.createProjectile();
    this.createLabels();
    this.setupCamera(map);

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.on(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  createBackgrounds(map) {
    [
      ["methods_10_bg5", 0.08, -8, 0.78, 0],
      ["methods_10_bg4", 0.14, -7, 0.7, 0],
      ["methods_10_bg3", 0.32, -6, 0.62, 88],
      ["methods_10_bg2", 0.58, -5, 0.58, 176],
      ["methods_10_bg1", 0.82, -4, 0.5, 225],
    ].forEach(([key, factor, depth, alpha, y]) => {
      this.add
        .tileSprite(0, y, map.widthInPixels, this.scale.height - y, key)
        .setOrigin(0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x20384c)
        .setAlpha(alpha);
    });
    this.add.rectangle(0, 0, map.widthInPixels, 576, 0x02100b, 0.28).setOrigin(0).setDepth(-3);
  }

  createTileLayers(map) {
    const tilesets = [
      map.addTilesetImage("Floor_Tiles2", "methods_10_floor"),
      map.addTilesetImage("Decor", "methods_10_decor"),
      map.addTilesetImage("Garden_Decorations", "methods_10_garden"),
      map.addTilesetImage("Pine_Trees", "methods_10_pines"),
      map.addTilesetImage("House_Tiles", "methods_10_house"),
      map.addTilesetImage("Other_Tiles2", "methods_10_other"),
      map.addTilesetImage("Other_Tiles2(Flipped)", "methods_10_other_flipped"),
      map.addTilesetImage("Pine_forest_sheet", "methods_10_forest"),
      map.addTilesetImage("Weeping_Willow1Big", "methods_10_willow_big"),
      map.addTilesetImage("Weeping_Willow1", "methods_10_willow"),
      map.addTilesetImage("Tree1", "methods_10_tree_1"),
      map.addTilesetImage("Tree2", "methods_10_tree_2"),
      map.addTilesetImage("Large_Pine_Tree", "methods_10_large_pine"),
      map.addTilesetImage("Pixel_Art_Wheat", "methods_10_wheat"),
      map.addTilesetImage("anting_anting_altar", "methods_10_altar"),
      map.addTilesetImage("exit_sign", "methods_10_exit_sign"),
    ].filter(Boolean);

    ["platform", "trees", "decoration", "front_decoration"].forEach((name, index) => {
      const layer = map.createLayer(name, tilesets, 0, this.offsetY);
      if (layer) layer.setDepth(0.05 + index * 0.25);
    });
  }

  createAnimations() {
    [
      ["methods-10-player-idle", 0, 5, 6],
      ["methods-10-player-run", 16, 23, 12],
      ["methods-10-player-hurt", 48, 55, 10],
      ["methods-10-player-cast", 64, 71, 10],
    ].forEach(([key, start, end, frameRate]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("methods_10_player", { start, end }),
        frameRate,
        repeat: key.includes("hurt") || key.includes("cast") ? 0 : -1,
      });
    });
    if (!this.anims.exists("methods-10-monster-idle")) {
      this.anims.create({
        key: "methods-10-monster-idle",
        frames: this.anims.generateFrameNumbers("methods_10_monster", { start: 0, end: 7 }),
        frameRate: 8,
        repeat: -1,
      });
    }
    if (!this.anims.exists("methods-10-purple-fireball")) {
      this.anims.create({
        key: "methods-10-purple-fireball",
        frames: this.anims.generateFrameNumbers("methods_10_projectile", { start: 4, end: 7 }),
        frameRate: 12,
        repeat: -1,
      });
    }
  }

  createDiwata() {
    this.diwataAura = this.add
      .ellipse(this.diwataPoint.x, this.diwataPoint.y - 32, 76, 96, 0x7effca, 0.1)
      .setDepth(1.18)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.diwata = new LayeredLpcCharacter(this, this.diwataPoint.x, this.diwataPoint.y - 8, DIWATA_FAIRY_CONFIG, {
      scale: DIWATA_SCALE,
      direction: "right",
      animationName: "idle",
    }).setDepth(1.62);
  }

  createPlayer() {
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "methods_10_player")
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.7)
      .play("methods-10-player-idle");
  }

  createMonster() {
    this.monsterAura = this.add
      .ellipse(this.monsterPoint.x, this.monsterPoint.y - 62, 112, 132, 0x451020, 0.28)
      .setDepth(1.2)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.monster = this.add
      .sprite(this.monsterPoint.x, this.monsterPoint.y - 8, "methods_10_monster")
      .setOrigin(0.5, 1)
      .setScale(MONSTER_SCALE)
      .setFlipX(true)
      .setTint(0xd8b8cf)
      .setDepth(1.82)
      .play("methods-10-monster-idle");
    this.tweens.add({
      targets: this.monsterAura,
      alpha: 0.42,
      scaleX: 1.08,
      scaleY: 1.05,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createIngredients() {
    this.herbIcon = this.add
      .image(this.herbPoint.x, this.herbPoint.y - 12, "methods_10_herb")
      .setOrigin(0.5, 1)
      .setScale(2.2)
      .setAlpha(0.5)
      .setDepth(2.05);
    this.waterIcon = this.add
      .image(this.waterPoint.x, this.waterPoint.y - 24, "methods_10_water_jar")
      .setOrigin(0.5, 1)
      .setScale(1.12)
      .setAlpha(0.5)
      .setDepth(2.05);
    this.herbValue = this.createValueBadge(this.herbPoint.x, this.herbPoint.y - 63, "5", HERB_GREEN);
    this.waterValue = this.createValueBadge(this.waterPoint.x, this.waterPoint.y - 63, "2", WATER_BLUE);
    [this.herbValue, this.waterValue].forEach(({ box, text }) => {
      box.setAlpha(0.16);
      text.setAlpha(0.16);
    });
  }

  createValueBadge(x, y, value, color) {
    const box = this.add
      .rectangle(x, y, 24, 20, 0x06131f, 0.72)
      .setStrokeStyle(1, color, 0.52)
      .setDepth(2.1);
    const text = this.add
      .text(x, y, value, {
        fontFamily: "monospace",
        fontSize: "15px",
        fontStyle: "bold",
        color: "#f8fbff",
        stroke: "#06131f",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(2.15);
    return { box, text };
  }

  createHeartBar() {
    const x = this.heartBarPoint.x;
    const y = this.heartBarPoint.y;
    this.heartPanel = this.add
      .rectangle(x, y, 156, 50, 0x07141f, 0.64)
      .setStrokeStyle(1, HEAL_GREEN, 0.34)
      .setDepth(2.12);
    this.heartLabel = this.add
      .text(x - 64, y - 20, "vitality", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#c8f7d1",
      })
      .setDepth(2.16);
    this.healingValueText = this.add
      .text(x + 50, y - 20, `${WOUNDED_HEALING}/${TARGET_HEALING}`, {
        fontFamily: "monospace",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#ffd6d6",
      })
      .setOrigin(0.5, 0)
      .setDepth(2.16);
    this.healingBarBg = this.add
      .rectangle(x, y + 10, 122, 13, 0x07110c, 0.58)
      .setStrokeStyle(1, HEAL_GREEN, 0.2)
      .setDepth(2.14);
    const segmentWidth = 9;
    const segmentGap = 3;
    const segmentStartX = x - ((TARGET_HEALING - 1) * (segmentWidth + segmentGap)) / 2;
    this.healingSegments = Array.from({ length: TARGET_HEALING }, (_, index) =>
      this.add
        .rectangle(
          segmentStartX + index * (segmentWidth + segmentGap),
          y + 10,
          segmentWidth,
          9,
          HEAL_GREEN,
          0.84,
        )
        .setDepth(2.16),
    );
    this.heartBarParts = [
      this.heartPanel,
      this.heartLabel,
      this.healingValueText,
      this.healingBarBg,
      ...this.healingSegments,
    ];
    this.setHealingAmount(TARGET_HEALING, true);
  }

  createProjectile() {
    this.projectile = this.add
      .sprite(this.projectileLaunchPoint.x, this.projectileLaunchPoint.y, "methods_10_projectile", 4)
      .setOrigin(0.5)
      .setScale(1.9)
      .setFlipX(true)
      .setTint(0xe8c8ff)
      .setAlpha(0)
      .setDepth(2.05)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  createLabels() {
    this.callText = this.add
      .text(this.healingPoint.x + 8, this.healingPoint.y - 100, "Heal(?, ?)", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#f2f7ed",
        backgroundColor: "#07141fcc",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.18);
    this.statusText = this.add
      .text(this.diwataPoint.x, this.diwataPoint.y - 94, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffd6d6",
        backgroundColor: "#07141faa",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.18);
  }

  onDialogueClosed({ levelNumber, dialogueId }) {
    if (Number(levelNumber) !== LEVEL_NUMBER) return;
    if (dialogueId === AFTER_ATTACK_DIALOGUE_ID) return;
    if (!this.openingPreviewPlayed) this.playOpeningAttack();
  }

  showAfterAttackDialogue() {
    this.revealIngredients();
    gameEvents.emit(GAME_LEVEL_DIALOGUE_TRIGGERED, {
      levelNumber: LEVEL_NUMBER,
      dialogueId: AFTER_ATTACK_DIALOGUE_ID,
      dialogueSteps: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "The shadow struck before I could raise a ward.",
              tone: "normal",
            },
            {
              text: "Herb power is 5. Water power is 2. The ritual must combine both.",
              tone: "accent",
            },
            {
              text: "Write a method that returns the healing value, then store it in Main.",
              tone: "goal",
            },
          ],
        },
        {
          speaker: "Kai",
          portraitImage: "portrait_player_main.png",
          portraitAlt: "Kai portrait",
          lines: [
            {
              text: "Heal must multiply both ingredients and return the result.",
              tone: "normal",
            },
          ],
        },
      ],
    });
  }

  revealIngredients() {
    const revealTargets = [
      this.herbIcon,
      this.waterIcon,
      this.herbValue.box,
      this.herbValue.text,
      this.waterValue.box,
      this.waterValue.text,
    ];
    this.tweens.add({
      targets: revealTargets,
      alpha: 1,
      duration: 260,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: [this.herbValue.box, this.herbValue.text, this.waterValue.box, this.waterValue.text],
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 180,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
  }

  onCodeEvaluated({ levelNumber, isCorrect, sourceCode }) {
    if (Number(levelNumber) !== LEVEL_NUMBER) return;
    if (["preview", "healing", "failed", "complete"].includes(this.sequenceMode)) return;
    this.lastSourceCode = sourceCode ?? "";
    this.resetAttempt();
    if (isCorrect) this.runHealingSequence();
    else this.runFailedHealingSequence();
  }

  playOpeningAttack() {
    if (this.openingPreviewPlayed) return;
    this.openingPreviewPlayed = true;
    this.sequenceMode = "preview";
    this.panTo(this.projectileSpawnPoint.x - 180, 520);
    this.schedule(190, () => this.chargeMonsterAttack());
    this.schedule(760, () => this.launchProjectile(this.impactPoint, () => this.damageDiwata()));
    this.schedule(1720, () => this.panTo(this.diwataPoint.x - 60, 640));
    this.schedule(2270, () => this.showAfterAttackDialogue());
    this.schedule(2480, () => {
      this.sequenceMode = "idle";
    });
  }

  chargeMonsterAttack() {
    const { x, y } = this.projectileLaunchPoint;
    const ring = this.add
      .circle(x, y, 34, 0x8d4bc7, 0.08)
      .setStrokeStyle(2, 0xd987ff, 0.8)
      .setScale(0.35)
      .setDepth(2.12)
      .setBlendMode(Phaser.BlendModes.ADD);
    const core = this.add
      .circle(x, y, 8, 0xc86cff, 0.72)
      .setDepth(2.13)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.temporaryEffects.push(ring, core);

    this.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0,
      duration: 520,
      ease: "Sine.easeOut",
      onComplete: () => this.destroyTemporary(ring),
    });
    this.tweens.add({
      targets: core,
      scale: 0.35,
      alpha: 0,
      duration: 500,
      ease: "Sine.easeIn",
      onComplete: () => this.destroyTemporary(core),
    });
    this.tweens.add({
      targets: [this.monster, this.monsterAura],
      alpha: 0.68,
      scaleX: "*=1.04",
      scaleY: "*=1.04",
      duration: 120,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });

    for (let index = 0; index < 10; index += 1) {
      const angle = Phaser.Math.DegToRad(index * 36);
      const mote = this.add
        .circle(x + Math.cos(angle) * 42, y + Math.sin(angle) * 30, 2.5, 0xd987ff, 0.82)
        .setDepth(2.14)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.temporaryEffects.push(mote);
      this.tweens.add({
        targets: mote,
        x,
        y,
        alpha: 0,
        scale: 0.25,
        delay: index * 18,
        duration: 330,
        ease: "Sine.easeIn",
        onComplete: () => this.destroyTemporary(mote),
      });
    }
  }

  damageDiwata() {
    this.playImpactSound();
    this.createBurst(this.impactPoint, FAIL_RED, 18, 58);
    this.cameras.main.shake(140, 0.003);
    this.diwata.playAnimation("hurt", "right");
    this.heartLabel.setText("healing").setColor("#ffd6d6");
    this.statusText.setText("healing needed").setColor("#ffd6d6");
    this.setHealingAmount(WOUNDED_HEALING, false, true);
    this.shakeDamageTargets();
    this.startCriticalPulse();
    this.tweens.add({
      targets: [this.diwata, this.diwataAura],
      alpha: 0.72,
      duration: 120,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
      onComplete: () => this.diwata.playAnimation("hurt", "right"),
    });
  }

  runHealingSequence() {
    this.sequenceMode = "healing";
    this.stopCriticalPulse();
    this.player.play("methods-10-player-cast", true);
    this.callText.setText("Heal(5, 2)").setColor("#f8fbff");
    this.statusText.setText("method returns 10").setColor("#c8f7d1");
    this.showArgumentFlow();
    this.showFormulaVisual("5 × 2 → 10", HEAL_GREEN, 1500);
    this.schedule(220, () => this.sendIngredientEssence());
    this.schedule(660, () => this.showReturnFlow());
    this.schedule(900, () => this.createHealingField());
    this.schedule(1040, () => this.fillHealingBar(TARGET_HEALING));
    this.schedule(1720, () => this.pulseCompletedHealth());
    this.schedule(1820, () => this.restoreDiwata());
    this.schedule(2920, () => this.finishSuccess());
  }

  runFailedHealingSequence() {
    this.sequenceMode = "failed";
    this.stopCriticalPulse();
    const guessedHealing = this.extractComputedHealing(this.lastSourceCode);
    const partialHealing = Phaser.Math.Clamp(guessedHealing, 0, TARGET_HEALING - 1);
    this.player.play("methods-10-player-cast", true);
    this.callText.setText("Heal(?, ?)").setColor("#ffb8c0");
    this.statusText.setText("not enough healing").setColor("#ffb8c0");
    this.showArgumentFlow(FAIL_RED);
    this.showFormulaVisual(`result ${partialHealing}/10`, FAIL_RED, 1350);
    this.schedule(420, () => this.fillHealingBar(partialHealing));
    this.schedule(980, () => {
      this.createBurst(this.diwataPoint, FAIL_RED, 10, 36);
      this.diwata.playAnimation("hurt", "right");
      this.player.play("methods-10-player-hurt", true);
    });
    this.schedule(1740, () => this.resetAttempt());
  }

  startCriticalPulse() {
    this.stopCriticalPulse();
    const criticalSegments = this.healingSegments.slice(0, WOUNDED_HEALING);
    this.criticalPulseTween = this.tweens.add({
      targets: [...criticalSegments, this.healingValueText],
      alpha: { from: 0.58, to: 1 },
      scaleY: { from: 0.88, to: 1.08 },
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  stopCriticalPulse() {
    this.criticalPulseTween?.stop();
    this.criticalPulseTween = null;
    this.healingSegments?.forEach((segment) => segment.setAlpha(1).setScale(1));
    this.healingValueText?.setAlpha(1).setScale(1);
  }

  showArgumentFlow(color = HEAL_GREEN) {
    this.createValueArrow(
      { x: this.herbValue.text.x, y: this.herbValue.text.y },
      { x: this.callText.x - 28, y: this.callText.y + 10 },
      color,
      80,
    );
    this.createValueArrow(
      { x: this.waterValue.text.x, y: this.waterValue.text.y },
      { x: this.callText.x + 28, y: this.callText.y + 10 },
      color === FAIL_RED ? FAIL_RED : WATER_BLUE,
      170,
    );
  }

  sendIngredientEssence() {
    [
      { source: this.herbIcon, color: HERB_GREEN },
      { source: this.waterIcon, color: WATER_BLUE },
    ].forEach(({ source, color }, sourceIndex) => {
      this.tweens.add({
        targets: source,
        scaleX: source.scaleX * 1.08,
        scaleY: source.scaleY * 1.08,
        duration: 180,
        yoyo: true,
        repeat: 1,
        ease: "Sine.easeInOut",
      });
      for (let index = 0; index < 9; index += 1) {
        const mote = this.add
          .circle(
            source.x + Phaser.Math.Between(-8, 8),
            source.y - Phaser.Math.Between(10, 30),
            Phaser.Math.Between(2, 4),
            color,
            0.9,
          )
          .setDepth(2.22)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.temporaryEffects.push(mote);
        this.tweens.add({
          targets: mote,
          x: this.diwataPoint.x + Phaser.Math.Between(-12, 12),
          y: this.diwataPoint.y - Phaser.Math.Between(34, 72),
          alpha: 0,
          scale: 0.35,
          delay: sourceIndex * 90 + index * 38,
          duration: 560,
          ease: "Sine.easeInOut",
          onComplete: () => this.destroyTemporary(mote),
        });
      }
    });
  }

  showFormulaVisual(text, color, duration = 1300) {
    const formula = this.add
      .text(this.heartBarPoint.x + 104, this.heartBarPoint.y + 9, text, {
        fontFamily: "monospace",
        fontSize: "12px",
        fontStyle: "bold",
        color: Phaser.Display.Color.IntegerToColor(color).rgba,
        backgroundColor: "#07141fdd",
        padding: { x: 7, y: 4 },
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(2.28);
    this.temporaryEffects.push(formula);
    this.tweens.add({
      targets: formula,
      alpha: 1,
      y: formula.y - 5,
      duration: 190,
      hold: Math.max(300, duration - 430),
      yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => this.destroyTemporary(formula),
    });
  }

  showReturnFlow() {
    const returnText = this.add
      .text(this.callText.x, this.callText.y - 28, "return 10", {
        fontFamily: "monospace",
        fontSize: "12px",
        fontStyle: "bold",
        color: "#d8ffcb",
        backgroundColor: "#07141fcc",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.25);
    this.temporaryEffects.push(returnText);
    this.tweens.add({
      targets: returnText,
      x: this.returnPoint.x,
      y: this.returnPoint.y,
      alpha: 0,
      duration: 650,
      ease: "Sine.easeInOut",
      onComplete: () => this.destroyTemporary(returnText),
    });
  }

  fillHealingBar(value) {
    const safeValue = Phaser.Math.Clamp(Math.round(value), 0, TARGET_HEALING);
    const isFull = safeValue === TARGET_HEALING;
    const color = isFull ? HEAL_GREEN : CRITICAL_RED;
    this.healingBarBg.setStrokeStyle(1, color, isFull ? 0.2 : 0.42);
    this.heartPanel.setStrokeStyle(1, color, isFull ? 0.34 : 0.5);
    this.healingValueText.setText(`${safeValue}/${TARGET_HEALING}`).setColor(isFull ? "#d8ffcb" : "#ffb8c0");
    this.healingSegments.forEach((segment, index) => {
      this.schedule(index * 48, () => {
        const filled = index < safeValue;
        segment.setFillStyle(filled ? color : 0x16221c, filled ? 0.94 : 0.52);
        if (!filled) return;
        segment.setScale(1, 0.35);
        this.tweens.add({
          targets: segment,
          scaleY: 1,
          duration: 150,
          ease: "Back.easeOut",
        });
      });
    });
    this.tweens.add({
      targets: [this.heartPanel, this.healingValueText],
      scaleX: 1.04,
      scaleY: 1.04,
      duration: 160,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
  }

  setHealingAmount(value, instant = false, critical = value < TARGET_HEALING) {
    const safeValue = Phaser.Math.Clamp(Math.round(value), 0, TARGET_HEALING);
    const color = critical ? CRITICAL_RED : HEAL_GREEN;
    this.healingBarBg.setStrokeStyle(1, color, critical ? 0.42 : 0.2);
    this.heartPanel.setStrokeStyle(1, color, critical ? 0.5 : 0.34);
    this.healingValueText.setText(`${safeValue}/${TARGET_HEALING}`).setColor(critical ? "#ffb8c0" : "#d8ffcb");
    this.healingSegments.forEach((segment, index) => {
      const filled = index < safeValue;
      segment
        .setFillStyle(filled ? color : 0x16221c, filled ? (critical ? 0.92 : 0.84) : 0.52)
        .setScale(1);
    });
    if (!instant) {
      this.tweens.add({
        targets: this.healingSegments,
        alpha: 0.4,
        duration: 120,
        yoyo: true,
        repeat: 1,
      });
    }
  }

  shakeDamageTargets() {
    const targets = [this.diwata, this.diwataAura, this.statusText, ...this.heartBarParts];
    this.tweens.add({
      targets,
      x: "+=7",
      duration: 45,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: [...this.healingSegments, this.heartPanel, this.healingValueText],
      alpha: 0.62,
      duration: 80,
      yoyo: true,
      repeat: 3,
      ease: "Sine.easeInOut",
    });
  }

  createHealingField() {
    this.playHealingSound();
    const field = this.add
      .ellipse(this.diwataPoint.x, this.diwataPoint.y - 42, 96, 118, HEAL_GREEN, 0.12)
      .setDepth(1.4)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    const ring = this.add
      .ellipse(this.diwataPoint.x, this.diwataPoint.y - 4, 104, 20, HEAL_GREEN, 0.14)
      .setStrokeStyle(2, 0xd8ffcb, 0.58)
      .setDepth(1.9)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.temporaryEffects.push(field, ring);
    this.tweens.add({
      targets: [field, ring],
      scaleX: 1.22,
      scaleY: 1.1,
      alpha: 0.38,
      duration: 520,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
    for (let index = 0; index < 26; index += 1) {
      const mote = this.add
        .circle(
          this.diwataPoint.x + Phaser.Math.Between(-44, 44),
          this.diwataPoint.y - Phaser.Math.Between(8, 72),
          Phaser.Math.Between(2, 4),
          index % 2 ? HEAL_GREEN : WATER_BLUE,
          0.82,
        )
        .setDepth(2.15)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.temporaryEffects.push(mote);
      this.tweens.add({
        targets: mote,
        x: this.diwataPoint.x + Phaser.Math.Between(-14, 14),
        y: this.diwataPoint.y - Phaser.Math.Between(38, 86),
        alpha: 0,
        scale: 0.25,
        delay: index * 22,
        duration: 580,
        ease: "Sine.easeOut",
        onComplete: () => this.destroyTemporary(mote),
      });
    }
  }

  pulseCompletedHealth() {
    this.tweens.add({
      targets: this.healingSegments,
      scaleX: 1.08,
      scaleY: 1.2,
      alpha: 1,
      duration: 130,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: [this.heartPanel, this.healingValueText],
      scaleX: 1.035,
      scaleY: 1.035,
      duration: 130,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
  }

  restoreDiwata() {
    this.heartLabel.setText("vitality").setColor("#c8f7d1");
    this.statusText.setText("restored").setColor("#d8ffcb");
    this.diwata.setAlpha(1);
    this.diwataAura.setAlpha(0.3);
    this.diwata.playAnimation("spellcast", "left");
    this.createBurst({ x: this.diwataPoint.x, y: this.diwataPoint.y - 20 }, HEAL_GREEN, 20, 52);
    this.tweens.add({
      targets: this.diwata,
      y: this.diwataPoint.y - 22,
      duration: 420,
      ease: "Sine.easeOut",
      onComplete: () => this.diwata.playAnimation("idle", "left"),
    });
    this.tweens.add({
      targets: this.diwataAura,
      y: this.diwataPoint.y - 46,
      alpha: 0.42,
      scaleX: 1.14,
      scaleY: 1.1,
      duration: 420,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.monster,
      x: this.monster.x + 140,
      y: this.monster.y - 42,
      alpha: 0,
      duration: 720,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.monsterAura,
      alpha: 0,
      duration: 640,
      ease: "Sine.easeInOut",
    });
  }

  playImpactSound() {
    this.playSynthTone([
      { frequency: 118, endFrequency: 62, duration: 0.16, volume: 0.075, type: "sawtooth" },
      { frequency: 72, endFrequency: 48, duration: 0.22, volume: 0.05, type: "sine" },
    ]);
  }

  playHealingSound() {
    if (!this.cache.audio.exists("methods_10_heal_sound")) return;
    this.sound.play("methods_10_heal_sound", { volume: 0.32 });
  }

  playSynthTone(notes) {
    const context = this.sound?.context;
    if (!context || context.state === "closed") return;
    if (context.state === "suspended") context.resume().catch(() => {});

    notes.forEach(({ frequency, endFrequency, duration, volume, type, delay = 0 }) => {
      const start = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    });
  }

  launchProjectile(target, onComplete) {
    if (this.cache.audio.exists("methods_10_magicbeam_sound")) {
      this.sound.play("methods_10_magicbeam_sound", { volume: 0.34 });
    }
    this.projectile
      .setPosition(this.projectileLaunchPoint.x, this.projectileLaunchPoint.y)
      .setAlpha(1)
      .setScale(1.9)
      .play("methods-10-purple-fireball", true);
    this.lastProjectileTrailAt = 0;
    this.tweens.add({
      targets: this.projectile,
      x: target.x,
      y: target.y - 40,
      duration: 620,
      ease: "Sine.easeIn",
      onUpdate: () => {
        if (this.time.now - this.lastProjectileTrailAt < 42) return;
        this.lastProjectileTrailAt = this.time.now;
        this.createProjectileTrail();
      },
      onComplete: () => {
        this.projectile.setAlpha(0).stop();
        onComplete?.();
      },
    });
  }

  createProjectileTrail() {
    for (let index = 0; index < 2; index += 1) {
      const trail = this.add
        .circle(
          this.projectile.x + Phaser.Math.Between(-8, 2),
          this.projectile.y + Phaser.Math.Between(-6, 6),
          Phaser.Math.Between(2, 4),
          index === 0 ? 0xc976ff : 0x7142c6,
          0.72,
        )
        .setDepth(2.08)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.temporaryEffects.push(trail);
      this.tweens.add({
        targets: trail,
        x: trail.x + Phaser.Math.Between(-16, -8),
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(230, 340),
        ease: "Sine.easeOut",
        onComplete: () => this.destroyTemporary(trail),
      });
    }
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
      hold: 430,
      ease: "Sine.easeInOut",
      onComplete: () => this.destroyTemporary(arrow),
    });
  }

  createBurst(point, color, count = 16, spread = 52) {
    for (let index = 0; index < count; index += 1) {
      const spark = this.add
        .circle(point.x, point.y - 38, Phaser.Math.Between(2, 5), color, 0.86)
        .setDepth(2.25)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.temporaryEffects.push(spark);
      this.tweens.add({
        targets: spark,
        x: spark.x + Phaser.Math.Between(-spread, spread),
        y: spark.y + Phaser.Math.Between(-spread, Math.round(spread * 0.7)),
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(420, 780),
        ease: "Sine.easeOut",
        onComplete: () => this.destroyTemporary(spark),
      });
    }
  }

  extractComputedHealing(sourceCode) {
    const code = sourceCode ?? "";
    const callMatch = code.match(/\bHeal\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/);
    if (!callMatch) return WOUNDED_HEALING;
    return Number(callMatch[1]) * Number(callMatch[2]);
  }

  resetAttempt() {
    this.stopCriticalPulse();
    this.sequenceTimers.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.temporaryEffects.forEach((effect) => effect.destroy());
    this.temporaryEffects = [];
    this.tweens.killTweensOf([
      this.player,
      this.diwata,
      this.diwataAura,
      this.monster,
      this.monsterAura,
      this.projectile,
      ...this.healingSegments,
      this.heartPanel,
      this.healingValueText,
    ]);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y).setAlpha(1).clearTint().play("methods-10-player-idle", true);
    this.diwata.setPosition(this.diwataPoint.x, this.diwataPoint.y - 8).setAlpha(0.86);
    this.diwata.playAnimation("hurt", "right");
    this.diwataAura.setPosition(this.diwataPoint.x, this.diwataPoint.y - 32).setAlpha(0.1).setScale(1);
    this.monster.setPosition(this.monsterPoint.x, this.monsterPoint.y - 8).setAlpha(1).setFlipX(true).play("methods-10-monster-idle", true);
    this.monsterAura.setPosition(this.monsterPoint.x, this.monsterPoint.y - 62).setAlpha(0.28).setScale(1);
    this.projectile.setPosition(this.projectileLaunchPoint.x, this.projectileLaunchPoint.y).setAlpha(0).stop();
    this.callText.setText("Heal(?, ?)").setColor("#f2f7ed");
    this.heartLabel.setText("healing").setColor("#ffd6d6");
    this.statusText.setText("healing needed").setColor("#ffd6d6");
    this.setHealingAmount(WOUNDED_HEALING, true);
    this.startCriticalPulse();
    this.sequenceMode = "idle";
  }

  finishSuccess() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      shouldProceed: true,
    });
  }

  setupCamera(map) {
    this.cameras.main.setBounds(0, 0, map.widthInPixels, this.scale.height);
    this.cameras.main.setZoom(1);
    this.panTo(this.spawnPoint.x + 300, 0);
  }

  panTo(x, duration = 600) {
    const halfWidth = this.scale.width / 2;
    const clampedX = Phaser.Math.Clamp(x, halfWidth, Math.max(halfWidth, this.cameras.main.getBounds().width - halfWidth));
    if (duration <= 0) {
      this.cameras.main.scrollX = clampedX - halfWidth;
      return;
    }
    this.cameras.main.pan(clampedX, this.scale.height / 2, duration, "Sine.easeInOut");
  }

  resolveMapPoints(map) {
    const points = {};
    map.objects.forEach((layer) => {
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
    this.sequenceTimers.push(timer);
    return timer;
  }

  destroyTemporary(effect) {
    Phaser.Utils.Array.Remove(this.temporaryEffects, effect);
    effect?.destroy();
  }

  cleanup() {
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.off(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.sequenceTimers?.forEach((timer) => timer.remove(false));
    this.stopCriticalPulse();
    this.temporaryEffects?.forEach((effect) => effect.destroy());
    this.diwata?.destroy();
  }
}
