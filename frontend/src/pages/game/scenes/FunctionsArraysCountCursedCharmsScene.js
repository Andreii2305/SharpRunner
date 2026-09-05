import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";
import LayeredLpcCharacter from "../characters/LayeredLpcCharacter";
import { DIWATA_FAIRY_CONFIG } from "../characters/diwataFairyConfig";

const LEVEL_NUMBER = 27;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const ACCESSORY_BASE =
  `${ASSET_BASE}/other/free Accessories pack (by Batareya)/free Accessories pack (by Batareya)`;
const MAP_KEY = "functions_arrays_level_2_count_cursed_charms";
const MAP_PATH =
  `${ASSET_BASE}/maps/functions-arrays-level-2-count-cursed-charms.tmj`;
const PORTAL_ANIM_KEY = "functions-arrays-2-exit-seal";
const PLAYER_IDLE_KEY = "functions-arrays-2-player-idle";
const PLAYER_RUN_KEY = "functions-arrays-2-player-run";
const CLEAN = 1;
const CURSED = 0;
const CHARM_VALUES = [1, 0, 1, 1, 0, 1];

const ACCESSORIES = [
  ["golden collar.png", 0xf4cf71],
  ["iron earrings.png", 0xaab8c4],
  ["golden ring.png", 0xf3c95c],
  ["iron collar.png", 0x9faeba],
  ["golden earrings.png", 0xf5d475],
  ["iron ring.png", 0xa8b5c0],
];

export default class FunctionsArraysCountCursedCharmsScene extends Phaser.Scene {
  constructor() {
    super("FunctionsArraysCountCursedCharmsScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("fa2_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("fa2_post_tall", `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze/Lamp-Post-2-TALL.png`);
    this.load.image("fa2_post_short", `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze/Lamp-Post-2-SHORT.png`);
    this.load.image("fa2_decor", `${GH_BASE}/Decor.png`);
    this.load.image("fa2_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("fa2_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("fa2_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("fa2_exit", `${ASSET_BASE}/other/exit_sign.png`);
    ACCESSORIES.forEach(([fileName], index) => {
      this.load.image(`fa2_charm_${index}`, `${ACCESSORY_BASE}/${fileName}`);
    });
    this.load.spritesheet(
      "fa2_portal",
      `${GH_BASE}/Animated_Sprites/GandalfHardcore_Portal_sheet.png`,
      { frameWidth: 64, frameHeight: 64 },
    );
    this.load.spritesheet(
      "fa2_player",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
    [1, 2, 3, 4, 5].forEach((number) => {
      this.load.image(
        `fa2_bg${number}`,
        `${BG_BASE}/GandalfHardcore_Background_layers_layer_${number}.png`,
      );
    });
  }

  create() {
    this.map = this.make.tilemap({ key: MAP_KEY });
    this.offsetY = this.scale.height - this.map.heightInPixels;
    this.mode = "idle";
    this.timers = [];
    this.effects = [];

    this.createBackgrounds();
    this.createTileLayers();
    this.createAnimations();
    this.createAuraTextures();
    this.points = this.resolveMapObjects();
    this.spawnPoint = this.points.player_spawn ?? { x: 80, y: 322 };
    this.diwataPoint = this.points.diwata_spawn ?? { x: 250, y: 322 };
    this.counterPoint = this.points.counter_point ?? { x: 950, y: 250 };
    this.sealPoint = this.points.exit_seal ?? { x: 1040, y: 322 };
    this.exitPoint = this.points.level_exit ?? { x: 1165, y: 322 };
    this.charmPoints = Array.from({ length: 6 }, (_, index) =>
      this.points[`charm_${index}`] ?? {
        x: 470 + index * 74,
        y: this.spawnPoint.y,
      });

    this.createCharms();
    this.createCounter();
    this.createCharacters();
    this.createExitSeal();
    this.setupCamera();

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  createBackgrounds() {
    [
      ["fa2_bg5", 0.08, -8, 0.72, 0],
      ["fa2_bg4", 0.14, -7, 0.64, 0],
      ["fa2_bg3", 0.3, -6, 0.58, 88],
      ["fa2_bg2", 0.54, -5, 0.56, 174],
      ["fa2_bg1", 0.8, -4, 0.48, 224],
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
      .rectangle(0, 0, this.map.widthInPixels, 576, 0x071019, 0.28)
      .setOrigin(0)
      .setDepth(-3);
  }

  createTileLayers() {
    const tilesets = [
      this.map.addTilesetImage("Floor_Tiles2", "fa2_floor"),
      this.map.addTilesetImage("Lamp Post 2 TALL", "fa2_post_tall"),
      this.map.addTilesetImage("Lamp Post 2 SHORT", "fa2_post_short"),
      this.map.addTilesetImage("Decor", "fa2_decor"),
      this.map.addTilesetImage("Garden_Decorations", "fa2_garden"),
      this.map.addTilesetImage("Pine_Trees", "fa2_pines"),
      this.map.addTilesetImage("Pine_forest_sheet", "fa2_forest"),
      this.map.addTilesetImage("exit_sign", "fa2_exit"),
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
        frames: this.anims.generateFrameNumbers("fa2_player", {
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
        frames: this.anims.generateFrameNumbers("fa2_player", {
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
        frames: this.anims.generateFrameNumbers("fa2_portal", {
          start: 0,
          end: 7,
        }),
        frameRate: 9,
        repeat: -1,
      });
    }
  }

  createAuraTextures() {
    this.createRadialTexture(
      "fa2_clean_aura",
      ["rgba(238,255,238,0.92)", "rgba(132,255,198,0.38)", "rgba(78,214,168,0)"],
    );
    this.createRadialTexture(
      "fa2_curse_aura",
      ["rgba(255,112,144,0.95)", "rgba(189,52,158,0.5)", "rgba(99,27,116,0)"],
    );
  }

  createRadialTexture(key, colors) {
    if (this.textures.exists(key)) return;
    const texture = this.textures.createCanvas(key, 128, 128);
    const context = texture.getContext();
    const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(0.38, colors[1]);
    gradient.addColorStop(1, colors[2]);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    texture.refresh();
  }

  createCharms() {
    this.charms = this.charmPoints.map((point, index) => {
      const baseY = point.y;
      const pedestal = this.add
        .ellipse(point.x, baseY - 2, 52, 12, 0x0b1720, 0.8)
        .setStrokeStyle(1, 0x8099a3, 0.28)
        .setDepth(1.08);
      const aura = this.add
        .image(point.x, baseY - 34, "fa2_clean_aura")
        .setScale(0.5)
        .setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(1.1);
      const accessory = this.add
        .image(point.x, baseY - 30, `fa2_charm_${index}`)
        .setScale(0.55)
        .setTint(0xd5d9d4)
        .setAlpha(0.88)
        .setDepth(1.22);
      const label = this.add
        .text(point.x, baseY - 70, `[${index}]`, {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#91a8b1",
          backgroundColor: "#07131da8",
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(1.35);
      const scanRing = this.add
        .ellipse(point.x, baseY - 32, 56, 70)
        .setStrokeStyle(1, 0x9cecff, 0)
        .setDepth(1.28);
      const cursedMarker = this.add
        .graphics({ x: point.x + 18, y: baseY - 54 })
        .setAlpha(0)
        .setDepth(1.42);
      cursedMarker.lineStyle(2, 0xc8f3ff, 0.95);
      cursedMarker.beginPath();
      cursedMarker.arc(0, 0, 8, 0.2, 2.72);
      cursedMarker.strokePath();
      cursedMarker.beginPath();
      cursedMarker.arc(0, 0, 8, 3.18, 5.96);
      cursedMarker.strokePath();
      cursedMarker.beginPath();
      cursedMarker.moveTo(-2, -8);
      cursedMarker.lineTo(1, -3);
      cursedMarker.lineTo(-1, 1);
      cursedMarker.lineTo(3, 7);
      cursedMarker.strokePath();
      return {
        index,
        value: CHARM_VALUES[index],
        tint: ACCESSORIES[index][1],
        pedestal,
        aura,
        accessory,
        label,
        scanRing,
        cursedMarker,
      };
    });

    this.loopCursor = this.add
      .text(this.charms[0].label.x, this.charms[0].label.y - 18, "i = 0", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#d7f8ff",
        backgroundColor: "#06131dcc",
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(1.5);

    const floatProfiles = [
      { distance: 4, duration: 1680, delay: 120 },
      { distance: 6, duration: 1940, delay: 610 },
      { distance: 5, duration: 1810, delay: 330 },
      { distance: 4, duration: 2070, delay: 840 },
      { distance: 6, duration: 1750, delay: 470 },
      { distance: 5, duration: 1990, delay: 980 },
    ];
    this.charms.forEach((charm, index) => {
      const profile = floatProfiles[index];
      this.tweens.add({
        targets: [
          charm.accessory,
          charm.aura,
          charm.scanRing,
          charm.cursedMarker,
        ],
        y: `-=${profile.distance}`,
        duration: profile.duration,
        delay: profile.delay,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });
  }

  createCounter() {
    const x = this.counterPoint.x;
    const y = this.counterPoint.y;
    this.counterPanel = this.add
      .rectangle(x, y, 120, 64, 0x07141f, 0.9)
      .setStrokeStyle(1, 0x6da3ad, 0.58)
      .setDepth(1.45);
    this.counterTitle = this.add
      .text(x, y - 19, "CURSED", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#93aeb6",
      })
      .setOrigin(0.5)
      .setDepth(1.5);
    this.counterValue = this.add
      .text(x, y - 1, "0", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: "#f1e6bd",
      })
      .setOrigin(0.5)
      .setDepth(1.5);
    this.counterProgress = this.add
      .text(x, y + 20, "SCANNED 0/6", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#78949d",
      })
      .setOrigin(0.5)
      .setDepth(1.5);
  }

  createCharacters() {
    this.diwataAura = this.add
      .ellipse(
        this.diwataPoint.x,
        this.diwataPoint.y - 35,
        70,
        92,
        0x79efcb,
        0.08,
      )
      .setDepth(1.2);
    this.diwata = new LayeredLpcCharacter(
      this,
      this.diwataPoint.x,
      this.diwataPoint.y - 8,
      DIWATA_FAIRY_CONFIG,
      { scale: 1.25, direction: "right", animationName: "idle" },
    ).setDepth(1.65);
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "fa2_player")
      .setOrigin(0.5, 1)
      .setScale(2)
      .setDepth(1.72)
      .play(PLAYER_IDLE_KEY);
  }

  createExitSeal() {
    this.exitSeal = this.add
      .sprite(this.sealPoint.x, this.sealPoint.y + 2, "fa2_portal")
      .setOrigin(0.5, 1)
      .setScale(1.22)
      .setTint(0x6e5c8b)
      .setAlpha(0.54)
      .setDepth(1.42)
      .play(PORTAL_ANIM_KEY);
    this.exitSealGlow = this.add
      .ellipse(
        this.sealPoint.x,
        this.sealPoint.y - 43,
        74,
        116,
        0x5f407c,
        0.15,
      )
      .setDepth(1.34);
  }

  onCodeEvaluated({ levelNumber, isCorrect, message, values }) {
    if (Number(levelNumber) !== LEVEL_NUMBER || this.mode !== "idle") return;
    if (isCorrect) {
      this.runScan(values?.charms ?? CHARM_VALUES);
      return;
    }
    this.runFailure(message, values?.charms, values?.visitedIndexes);
  }

  runScan(values) {
    this.mode = "scanning";
    this.diwata.playAnimation("spellcast", "right");
    this.counterValue.setText("0").setColor("#f1e6bd");
    this.counterProgress.setText(`SCANNED 0/${this.charms.length}`);
    this.loopCursor.setAlpha(0);
    this.charms.forEach((charm) => charm.cursedMarker.setAlpha(0));
    let cursedCount = 0;

    this.charms.forEach((charm, index) => {
      this.schedule(300 + index * 720, () => {
        this.focusCharm(charm);
        this.sendScanTrail(
          index === 0
            ? { x: this.diwata.x + 18, y: this.diwata.y - 42 }
            : {
                x: this.charms[index - 1].accessory.x,
                y: this.charms[index - 1].accessory.y,
              },
          { x: charm.accessory.x, y: charm.accessory.y },
        );
        this.schedule(320, () => {
          if (values[index] === CURSED) {
            cursedCount += 1;
            this.revealCursed(charm, cursedCount);
          } else {
            this.revealClean(charm);
          }
          this.counterProgress.setText(
            `SCANNED ${index + 1}/${this.charms.length}`,
          );
        });
      });
    });

    this.schedule(760 + this.charms.length * 720, () => {
      this.diwata.playIdle("right");
      this.tweens.add({
        targets: this.loopCursor,
        alpha: 0,
        y: "-=5",
        duration: 180,
        ease: "Sine.easeIn",
      });
      this.counterValue.setText(String(cursedCount)).setColor("#ff9fb4");
      this.playCompletionChord();
      this.schedule(520, () => {
        this.sendReturnedCountToSeal(cursedCount, () => this.cleanseCurses());
      });
    });
  }

  focusCharm(charm) {
    this.tweens.killTweensOf(this.loopCursor);
    this.loopCursor
      .setText(`i = ${charm.index}`)
      .setPosition(charm.label.x, charm.label.y - 18)
      .setAlpha(0)
      .setScale(0.92);
    this.tweens.add({
      targets: this.loopCursor,
      alpha: 1,
      scale: 1,
      duration: 180,
      ease: "Back.easeOut",
    });
    charm.scanRing.setStrokeStyle(1, 0x9cecff, 0.9).setAlpha(0);
    charm.label.setColor("#d5f7ff");
    this.tweens.add({
      targets: charm.scanRing,
      alpha: 0.85,
      scaleX: { from: 0.84, to: 1.08 },
      scaleY: { from: 0.84, to: 1.08 },
      duration: 250,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: charm.accessory,
      alpha: 1,
      duration: 180,
      yoyo: true,
      ease: "Sine.easeOut",
    });
  }

  revealClean(charm) {
    this.playSfx?.("scan", { rate: Phaser.Math.FloatBetween(0.97, 1.03) });
    charm.aura.setTexture("fa2_clean_aura").setTint(0xffffff);
    charm.accessory.setTint(charm.tint).setAlpha(1);
    charm.label.setColor("#bdf6d5");
    charm.scanRing.setStrokeStyle(1, 0x9fffd3, 0.9);
    this.tweens.add({
      targets: charm.aura,
      alpha: { from: 0, to: 0.66 },
      scale: { from: 0.35, to: 0.68 },
      duration: 320,
      yoyo: true,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: charm.scanRing,
      alpha: { from: 0, to: 0.9 },
      duration: 240,
      yoyo: true,
      ease: "Sine.easeOut",
    });
    this.playTone(620, 0.025);
  }

  revealCursed(charm, cursedCount) {
    this.playSfx?.("scanError");
    charm.aura.setTexture("fa2_curse_aura").setTint(0xffffff);
    charm.accessory.setTint(0xff7b9c).setAlpha(1);
    charm.label.setColor("#ff93aa");
    charm.scanRing.setStrokeStyle(2, 0xff668d, 1);
    charm.cursedMarker.setAlpha(0).setScale(0.72);
    this.tweens.add({
      targets: charm.cursedMarker,
      alpha: 1,
      scale: 1,
      duration: 280,
      ease: "Back.easeOut",
    });
    this.tweens.add({
      targets: charm.aura,
      alpha: { from: 0, to: 0.78 },
      scale: { from: 0.34, to: 0.74 },
      duration: 360,
      ease: "Back.easeOut",
    });
    this.tweens.add({
      targets: [charm.accessory, charm.scanRing],
      x: "+=2",
      duration: 55,
      yoyo: true,
      repeat: 4,
    });
    this.counterValue.setText(String(cursedCount)).setColor("#ff9fb4");
    this.tweens.add({
      targets: [this.counterPanel, this.counterValue],
      scale: { from: 1, to: 1.06 },
      duration: 130,
      yoyo: true,
    });
    this.playTone(220, 0.04, "sawtooth");
  }

  cleanseCurses() {
    const cursedCharms = this.charms.filter((charm) => charm.value === CURSED);
    cursedCharms.forEach((charm, index) => {
      this.schedule(index * 180, () => {
        charm.aura.setTexture("fa2_clean_aura").setTint(0xbcefff);
        charm.accessory.setTint(0xc6f5ff);
        charm.label.setColor("#a9e9ff");
        charm.scanRing.setStrokeStyle(1, 0x9cecff, 0.9);
        this.tweens.add({
          targets: charm.aura,
          alpha: 0.58,
          scale: 0.62,
          duration: 420,
          ease: "Sine.easeOut",
        });
      });
    });
    this.schedule(cursedCharms.length * 180 + 360, () => {
      this.dissolveSeal(() => this.runPlayerToExit());
    });
  }

  sendReturnedCountToSeal(count, onComplete) {
    this.playSfx?.("magicPulse");
    this.diwata.playAnimation("spellcast", "right");
    this.tweens.add({
      targets: this.diwataAura,
      alpha: { from: 0.08, to: 0.24 },
      scale: { from: 1, to: 1.08 },
      duration: 380,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
    const returnedValue = this.add
      .text(this.counterPoint.x, this.counterPoint.y - 2, String(count), {
        fontFamily: "monospace",
        fontSize: "20px",
        fontStyle: "bold",
        color: "#bdf6ff",
        stroke: "#276879",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(2.8)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.effects.push(returnedValue);
    this.counterProgress.setText("RETURNING COUNT").setColor("#a9e9f3");
    this.sendScanTrail(
      { x: this.counterPoint.x, y: this.counterPoint.y },
      { x: this.sealPoint.x, y: this.sealPoint.y - 42 },
    );
    this.tweens.add({
      targets: returnedValue,
      x: this.sealPoint.x,
      y: this.sealPoint.y - 42,
      scale: { from: 0.8, to: 1.25 },
      alpha: { from: 1, to: 0.2 },
      duration: 760,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.diwata.playIdle("right");
        this.destroyEffect(returnedValue);
        this.counterProgress.setText("COUNT RETURNED").setColor("#9bdac8");
        this.exitSeal.setTint(0xa4f4ff).setAlpha(0.82);
        this.exitSealGlow.setFillStyle(0x79deef, 0.3);
        this.tweens.add({
          targets: [this.exitSeal, this.exitSealGlow],
          scale: "+=0.08",
          duration: 180,
          yoyo: true,
          ease: "Sine.easeOut",
          onComplete,
        });
      },
    });
  }

  sendScanTrail(from, to) {
    Array.from({ length: 7 }, (_, index) => {
      const mote = this.add
        .circle(
          from.x + Phaser.Math.Between(-3, 3),
          from.y + Phaser.Math.Between(-4, 4),
          index === 0 ? 3.2 : Phaser.Math.FloatBetween(1.2, 2.2),
          index % 2 === 0 ? 0x9cecff : 0xf1dc8c,
          0.82,
        )
        .setDepth(2.5)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.effects.push(mote);
      this.tweens.add({
        targets: mote,
        x: to.x + Phaser.Math.Between(-3, 3),
        y: to.y + Phaser.Math.Between(-3, 3),
        alpha: 0.08,
        duration: 250 + index * 18,
        delay: index * 18,
        ease: "Sine.easeInOut",
        onComplete: () => this.destroyEffect(mote),
      });
      return mote;
    });
  }

  dissolveSeal(onComplete) {
    this.tweens.add({
      targets: [this.exitSeal, this.exitSealGlow],
      alpha: 0,
      scaleX: 0.72,
      scaleY: 1.3,
      duration: 720,
      ease: "Sine.easeIn",
      onComplete,
    });
  }

  runPlayerToExit() {
    this.mode = "exiting";
    this.player.setFlipX(false).play(PLAYER_RUN_KEY, true);
    this.cameras.main.startFollow(this.player, true, 0.05, 0.05);
    this.tweens.add({
      targets: this.player,
      x: this.exitPoint.x,
      duration: 2700,
      ease: "Linear",
      onComplete: () => {
        this.player.play(PLAYER_IDLE_KEY, true);
        this.mode = "complete";
        gameEvents.emit(GAME_LEVEL_OUTCOME, {
          levelNumber: LEVEL_NUMBER,
          status: "success",
          message: "Two cursed charms were found and cleansed.",
          shouldProceed: true,
        });
      },
    });
  }

  runFailure(message, values, visitedIndexes) {
    this.mode = "failure";
    this.loopCursor.setAlpha(0);
    const visited = Array.isArray(visitedIndexes) ? visitedIndexes : [];
    const canPreview = Array.isArray(values) && values.length === this.charms.length;
    const hasPartialTraversal =
      canPreview && visited.length > 0 && visited.length < this.charms.length;
    const lastVisited = hasPartialTraversal ? visited[visited.length - 1] : null;
    this.counterValue.setText("?").setColor("#ff8b9d");
    this.counterProgress
      .setText(
        hasPartialTraversal ? `SCAN ENDED AT [${lastVisited}]` : "SCAN STOPPED",
      )
      .setColor("#d87888");
    this.exitSeal.setTint(0xa94b68);
    this.exitSealGlow.setFillStyle(0x8f2949, 0.22);
    this.tweens.add({
      targets: [this.exitSeal, this.exitSealGlow],
      alpha: { from: 0.38, to: 0.68 },
      duration: 180,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
    });

    if (hasPartialTraversal) {
      this.charms.forEach((charm, index) => {
        if (visited.includes(index)) {
          charm.accessory.setAlpha(0.88);
          charm.label.setAlpha(1);
          charm.scanRing.setStrokeStyle(1, 0xff6f86, 0.75);
          this.tweens.add({
            targets: [charm.accessory, charm.scanRing],
            alpha: 0.35,
            duration: 130,
            yoyo: true,
            repeat: 2,
          });
          return;
        }
        charm.accessory.setAlpha(0.24);
        charm.aura.setAlpha(0.05);
        charm.label.setAlpha(0.32);
        charm.scanRing.setAlpha(0.12);
      });
    } else {
      this.tweens.add({
        targets: [this.counterPanel, this.counterValue],
        x: "+=3",
        duration: 60,
        yoyo: true,
        repeat: 4,
      });
    }

    this.schedule(720, () => {
      this.charms.forEach((charm) => {
        charm.accessory.setAlpha(0.88);
        charm.aura.setAlpha(0);
        charm.label.setAlpha(1);
        charm.scanRing.setAlpha(1).setStrokeStyle(1, 0x9cecff, 0);
      });
      this.counterValue.setText("0").setColor("#f1e6bd");
      this.counterProgress
        .setText(`SCANNED 0/${this.charms.length}`)
        .setColor("#78949d");
      this.exitSeal.setTint(0x6e5c8b).setAlpha(0.54);
      this.exitSealGlow.setFillStyle(0x5f407c, 0.15).setAlpha(1);
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message:
          message ||
          "The charm scan stopped. Check the method, loop, condition, and returned count.",
      });
      this.mode = "idle";
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
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.27);
  }

  playCompletionChord() {
    [392, 523.25, 659.25].forEach((frequency, index) => {
      this.schedule(index * 80, () => this.playTone(frequency, 0.024));
    });
  }

  destroyEffect(effect) {
    if (!effect?.active) return;
    Phaser.Utils.Array.Remove(this.effects, effect);
    effect.destroy();
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

  cleanup() {
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.timers.forEach((timer) => timer.remove(false));
    this.effects.forEach((effect) => effect.destroy());
    this.diwata?.destroy();
  }
}
