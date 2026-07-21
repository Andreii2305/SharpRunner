import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_DIALOGUE_CLOSED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";
import LayeredLpcCharacter from "../characters/LayeredLpcCharacter";
import { DIWATA_FAIRY_CONFIG } from "../characters/diwataFairyConfig";

const LEVEL_NUMBER = 17;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const MAP_KEY = "methods_level_4_seal_cursed_shrine";
const MAP_PATH = `${ASSET_BASE}/maps/methods-level-4-seal-cursed-shrine.tmj`;
const PLAYER_SCALE = 2;
const PLAYER_SPEED = 170;
const DIWATA_SCALE = 1.25;
const SHRINE_DISPLAY_WIDTH = 210;
const SEAL_TEAL = 0x7ff6d1;
const SEAL_GOLD = 0xf2c96d;
const FAIL_RED = 0xff6875;
const PORTAL_ANIM_KEY = "methods-4-seal-portal";
const METHOD_NAME = "SealShrine";

export default class MethodsSealCursedShrineScene extends Phaser.Scene {
  constructor() {
    super("MethodsSealCursedShrineScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("methods_4_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("methods_4_decor", `${GH_BASE}/Decor.png`);
    this.load.image("methods_4_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("methods_4_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("methods_4_house", `${GH_BASE}/House_Tiles.png`);
    this.load.image("methods_4_other", `${GH_BASE}/Other_Tiles2.png`);
    this.load.image("methods_4_other_flipped", `${GH_BASE}/Other_Tiles2(Flipped).png`);
    this.load.image("methods_4_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("methods_4_willow_big", `${GH_BASE}/Weeping_Willow1Big.png`);
    this.load.image("methods_4_willow", `${GH_BASE}/Weeping_Willow1.png`);
    this.load.image("methods_4_tree_1", `${GH_BASE}/Tree1.png`);
    this.load.image("methods_4_large_pine", `${GH_BASE}/Large_Pine_Tree.png`);
    this.load.image("methods_4_wheat", `${GH_BASE}/Pixel_Art_Wheat.png`);
    this.load.image("methods_4_signage_1", `${ASSET_BASE}/other/signage1.png`);
    this.load.image("methods_4_signage_2", `${ASSET_BASE}/other/signage2.png`);
    this.load.image("methods_4_unlit_candle", `${ASSET_BASE}/other/unlit_candle.png`);
    this.load.image("methods_4_unlit_candle_tileset", `${ASSET_BASE}/other/unlit_candle_tileset.png`);
    this.load.image("methods_4_cursed_shrine", `${ASSET_BASE}/other/cursed_shrine.png`);
    this.load.image("methods_4_sealed_shrine", `${ASSET_BASE}/other/sealed_shrine.png`);
    this.load.spritesheet(
      "methods_4_portal",
      `${GH_BASE}/Animated_Sprites/GandalfHardcore_Portal_sheet.png`,
      { frameWidth: 64, frameHeight: 64 },
    );
    this.load.spritesheet(
      "methods_4_manananggal",
      `${ASSET_BASE}/characters/monsters/Manangy-fly_idle.png`,
      { frameWidth: 256, frameHeight: 256 },
    );
    this.load.spritesheet(
      "methods_4_player",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
    this.load.image("methods_4_bg5", `${BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("methods_4_bg4", `${BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("methods_4_bg3", `${BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("methods_4_bg2", `${BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("methods_4_bg1", `${BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
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
    this.spawnPoint = this.points.player_spawn ?? { x: 96, y: 500 };
    this.diwataPoint = this.points.diwata_spawn ?? { x: 500, y: 460 };
    this.shrinePoint = this.points.broken_shrine ?? { x: 680, y: this.spawnPoint.y };
    this.sealPoint = this.points.seal_circle ?? { x: this.shrinePoint.x, y: this.shrinePoint.y - 38 };
    this.monsterPoint = this.points.manananggal_spawn ?? { x: this.shrinePoint.x + 180, y: this.shrinePoint.y - 150 };
    this.barrierPoint =
      this.points.exit_shrine_barrier ?? this.points.exit_barrier ?? { x: this.shrinePoint.x + 330, y: this.spawnPoint.y };
    this.exitPoint = this.points.level_exit ?? { x: this.barrierPoint.x + 92, y: this.spawnPoint.y };
    this.groundY = Math.max(this.spawnPoint.y, this.shrinePoint.y, this.barrierPoint.y, this.exitPoint.y);

    this.createBrokenShrine();
    this.createSealCircle();
    this.createDiwata();
    this.createManananggal();
    this.createBarrier();
    this.createPlayer();
    this.createLabels();
    this.createMethodPanel();
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
      this.player.play("methods-4-player-run", true);
      this.player.setFlipX(false);
      this.player.x = Math.min(this.player.x + step, this.exitPoint.x);
      if (this.player.x >= this.exitPoint.x) this.finishSuccess();
    }
  }

  createBackgrounds(map) {
    [
      ["methods_4_bg5", 0.08, -8, 0.78, 0],
      ["methods_4_bg4", 0.14, -7, 0.7, 0],
      ["methods_4_bg3", 0.32, -6, 0.62, 88],
      ["methods_4_bg2", 0.58, -5, 0.58, 176],
      ["methods_4_bg1", 0.82, -4, 0.5, 225],
    ].forEach(([key, factor, depth, alpha, y]) => {
      this.add
        .tileSprite(0, y, map.widthInPixels, this.scale.height - y, key)
        .setOrigin(0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x20384c)
        .setAlpha(alpha);
    });
    this.ambientShadow = this.add
      .rectangle(0, 0, map.widthInPixels, 576, 0x02040a, 0.32)
      .setOrigin(0)
      .setDepth(-3);
  }

  createTileLayers(map) {
    const tilesets = [
      map.addTilesetImage("Floor_Tiles2", "methods_4_floor"),
      map.addTilesetImage("Decor", "methods_4_decor"),
      map.addTilesetImage("Garden_Decorations", "methods_4_garden"),
      map.addTilesetImage("Pine_Trees", "methods_4_pines"),
      map.addTilesetImage("House_Tiles", "methods_4_house"),
      map.addTilesetImage("Other_Tiles2", "methods_4_other"),
      map.addTilesetImage("Other_Tiles2(Flipped)", "methods_4_other_flipped"),
      map.addTilesetImage("Pine_forest_sheet", "methods_4_forest"),
      map.addTilesetImage("Weeping_Willow1Big", "methods_4_willow_big"),
      map.addTilesetImage("Weeping_Willow1", "methods_4_willow"),
      map.addTilesetImage("Tree1", "methods_4_tree_1"),
      map.addTilesetImage("Large_Pine_Tree", "methods_4_large_pine"),
      map.addTilesetImage("Pixel_Art_Wheat", "methods_4_wheat"),
      map.addTilesetImage("signage1", "methods_4_signage_1"),
      map.addTilesetImage("signage2", "methods_4_signage_2"),
      map.addTilesetImage("unlit_candle", "methods_4_unlit_candle"),
      map.addTilesetImage("unlit_candle_tileset", "methods_4_unlit_candle_tileset"),
    ].filter(Boolean);

    ["platform", "trees", "decoration", "front_decoration"].forEach((name, index) => {
      const layer = map.createLayer(name, tilesets, 0, this.offsetY);
      if (layer) layer.setDepth(0.1 + index * 0.25);
    });
  }

  createAnimations() {
    [
      ["methods-4-player-idle", 0, 5, 6],
      ["methods-4-player-run", 16, 23, 12],
      ["methods-4-player-hurt", 48, 55, 10],
      ["methods-4-player-cast", 64, 71, 10],
    ].forEach(([key, start, end, frameRate]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("methods_4_player", { start, end }),
        frameRate,
        repeat: key.includes("hurt") || key.includes("cast") ? 0 : -1,
      });
    });
    if (!this.anims.exists("methods-4-manananggal-idle")) {
      this.anims.create({
        key: "methods-4-manananggal-idle",
        frames: this.anims.generateFrameNumbers("methods_4_manananggal", { start: 0, end: 7 }),
        frameRate: 8,
        repeat: -1,
      });
    }
    if (!this.anims.exists(PORTAL_ANIM_KEY)) {
      this.anims.create({
        key: PORTAL_ANIM_KEY,
        frames: this.anims.generateFrameNumbers("methods_4_portal", { start: 0, end: 9 }),
        frameRate: 9,
        repeat: -1,
      });
    }
  }

  createBrokenShrine() {
    this.shrine = this.add.container(this.shrinePoint.x, this.shrinePoint.y).setDepth(1.28);
    this.shrineShadow = this.add.ellipse(0, -8, 170, 28, 0x02040a, 0.52);
    this.cursedShrine = this.add
      .image(0, 0, "methods_4_cursed_shrine")
      .setOrigin(0.5, 1)
      .setDisplaySize(SHRINE_DISPLAY_WIDTH, SHRINE_DISPLAY_WIDTH)
      .setAlpha(0.96)
      .setTint(0xc9bed7);
    this.sealedShrine = this.add
      .image(0, 0, "methods_4_sealed_shrine")
      .setOrigin(0.5, 1)
      .setDisplaySize(SHRINE_DISPLAY_WIDTH, SHRINE_DISPLAY_WIDTH)
      .setAlpha(0)
      .setTint(0xc9f8ff)
      .setBlendMode(Phaser.BlendModes.NORMAL);
    this.shrineCurse = this.add
      .ellipse(0, -100, 116, 150, 0x5d2c82, 0.16)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.shrineSealGlow = this.add
      .ellipse(0, -96, 144, 162, SEAL_TEAL, 0)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.shrine.add([
      this.shrineShadow,
      this.shrineCurse,
      this.cursedShrine,
      this.sealedShrine,
      this.shrineSealGlow,
    ]);
    this.startShrineIdle();
  }

  startShrineIdle() {
    this.tweens.killTweensOf([this.shrineCurse, this.shrineSealGlow]);
    this.tweens.add({
      targets: this.shrineCurse,
      alpha: 0.24,
      scaleX: 1.06,
      scaleY: 1.04,
      duration: 1350,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createSealCircle() {
    this.seal = this.add.container(this.sealPoint.x, this.sealPoint.y).setDepth(1.72);
    this.sealGlow = this.add
      .ellipse(0, 0, 96, 92, SEAL_TEAL, 0.08)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.sealRing = this.add
      .ellipse(0, 0, 88, 32)
      .setStrokeStyle(2, SEAL_TEAL, 0.3)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.sealInnerRing = this.add
      .ellipse(0, 0, 48, 16)
      .setStrokeStyle(1, SEAL_GOLD, 0.24)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.seal.add([this.sealGlow, this.sealRing, this.sealInnerRing]);
    this.startSealIdle();
  }

  startSealIdle() {
    this.tweens.killTweensOf([this.sealGlow, this.sealRing, this.sealInnerRing]);
    this.tweens.add({
      targets: [this.sealGlow, this.sealRing, this.sealInnerRing],
      alpha: "+=0.14",
      scaleX: 1.08,
      scaleY: 1.14,
      duration: 1400,
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
        direction: this.spawnPoint.x < this.diwataPoint.x ? "left" : "right",
        depth: 1.5,
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

  createManananggal() {
    this.monster = this.add.container(this.monsterPoint.x, this.monsterPoint.y).setDepth(1.76);
    this.monsterAura = this.add
      .ellipse(0, 10, 130, 108, 0x5e1738, 0.16)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.monsterSprite = this.add
      .sprite(0, 0, "methods_4_manananggal", 0)
      .setOrigin(0.5)
      .setScale(0.58)
      .setTint(0x9e6274)
      .setFlipX(true)
      .play("methods-4-manananggal-idle");
    this.monster.add([this.monsterAura, this.monsterSprite]);
    this.startMonsterIdle();
  }

  startMonsterIdle() {
    this.tweens.killTweensOf(this.monster);
    this.tweens.add({
      targets: this.monster,
      y: this.monsterPoint.y - 12,
      x: this.monsterPoint.x + 14,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createBarrier() {
    this.barrier = this.add.container(this.barrierPoint.x, this.barrierPoint.y).setDepth(1.5);
    this.barrierGlow = this.add
      .ellipse(0, -48, 84, 120, 0x8feeff, 0.11)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.barrierCore = this.add
      .sprite(0, -4, "methods_4_portal", 0)
      .setOrigin(0.5, 1)
      .setScale(1.34)
      .setAlpha(0.7)
      .setTint(0xb8f4ff)
      .play(PORTAL_ANIM_KEY);
    this.barrierLabel = this.add
      .text(0, -112, "open breach", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d9f3ff",
        backgroundColor: "#07141fde",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5);
    this.barrier.add([this.barrierGlow, this.barrierCore, this.barrierLabel]);
    this.startBarrierIdle();
  }

  startBarrierIdle() {
    this.tweens.killTweensOf([this.barrierGlow, this.barrierCore]);
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
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "methods_4_player", 0)
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.9)
      .play("methods-4-player-idle");
  }

  createLabels() {
    this.statusText = this.add
      .text(this.sealPoint.x, this.sealPoint.y - 84, "ritual seal", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#f3e6c4",
        backgroundColor: "#07141fdd",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.hintText = this.add
      .text(this.monsterPoint.x, this.monsterPoint.y - 95, "seal the cursed shrine", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffd9df",
        backgroundColor: "#07141fcc",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setAlpha(0.84);
    this.shrineSealLabel = this.add
      .text(this.shrinePoint.x, this.shrinePoint.y - 188, "sealed by SealShrine()", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#dfffea",
        backgroundColor: "#07141fde",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.15)
      .setAlpha(0);
    this.diwataSuccessLine = this.add
      .text(this.diwataPoint.x, this.diwataPoint.y - 108, "The name stores the ritual. The call awakens it.", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#dfffea",
        backgroundColor: "#07141fde",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(2.15)
      .setAlpha(0);
  }

  createMethodPanel() {
    const x = this.shrinePoint.x - 180;
    const y = this.shrinePoint.y - 180;
    this.methodPanel = this.add.container(x, y).setDepth(2.2);
    this.methodPanelBg = this.add
      .rectangle(0, 0, 196, 90, 0x07141f, 0.78)
      .setStrokeStyle(1, 0x6fb9cc, 0.42);
    this.methodPanelTitle = this.add
      .text(0, -34, "unnamed ritual", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#a9d6e2",
      })
      .setOrigin(0.5);
    this.methodDefineText = this.add
      .text(0, -12, "define the ritual", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#f3e6c4",
      })
      .setOrigin(0.5);
    this.methodBodyText = this.add
      .text(0, 10, "then call it from Main", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#f3e6c4",
      })
      .setOrigin(0.5);
    this.methodCallText = this.add
      .text(0, 32, "the shrine waits", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#88a7b8",
      })
      .setOrigin(0.5);
    this.methodFlowLine = this.add
      .line(0, 0, x + 82, y + 28, this.shrinePoint.x - 58, this.shrinePoint.y - 86, SEAL_TEAL, 0)
      .setOrigin(0)
      .setDepth(2.08)
      .setLineWidth(2)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.methodPanel.add([
      this.methodPanelBg,
      this.methodPanelTitle,
      this.methodDefineText,
      this.methodBodyText,
      this.methodCallText,
    ]);
    this.startMethodPanelIdle();
  }

  startMethodPanelIdle() {
    this.tweens.killTweensOf(this.methodPanel);
    this.tweens.add({
      targets: this.methodPanel,
      scaleX: 1.018,
      scaleY: 1.018,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  onCodeEvaluated({ levelNumber, isCorrect, message, sourceCode }) {
    if (Number(levelNumber) !== LEVEL_NUMBER) return;
    this.resetAttempt();
    if (isCorrect) this.startSuccess();
    else this.startFailure(message, this.classifyMethodAttempt(sourceCode, message));
  }

  classifyMethodAttempt(sourceCode = "", message = "") {
    const code = String(sourceCode ?? "").replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "");
    const definitionRegex = /\bstatic\s+void\s+SealShrine\s*\(\s*\)\s*\{/;
    const mainMatch = code.match(/\bstatic\s+void\s+Main\s*\(\s*string\s*\[\s*\]\s+args\s*\)\s*\{([\s\S]*?)\}/);
    const callRegex = /\bSealShrine\s*\(\s*\)\s*;/;
    const defined = definitionRegex.test(code);
    const called = Boolean(mainMatch && callRegex.test(mainMatch[1]));
    if (!defined) return "missingDefinition";
    if (!called) return "missingCall";
    if (/Define static void SealShrine/i.test(message)) return "missingDefinition";
    if (/Call SealShrine/i.test(message)) return "missingCall";
    return "generic";
  }

  onDialogueClosed({ levelNumber }) {
    if (Number(levelNumber) !== LEVEL_NUMBER || this.openingPreviewPlayed) return;
    this.openingPreviewPlayed = true;
    this.schedule(240, () => {
      if (this.sequenceMode !== "idle") return;
      this.hintText.setText("the shrine breach is exposed").setColor("#ffd9df");
      this.panTo(this.shrinePoint.x, 780);
    });
    this.schedule(1320, () => {
      if (this.sequenceMode !== "idle") return;
      this.hintText.setText("the creature circles above it").setColor("#ffb7c4");
      this.panTo(this.monsterPoint.x, 760);
    });
    this.schedule(2400, () => {
      if (this.sequenceMode !== "idle") return;
      this.statusText.setText("ritual seal").setColor("#f3e6c4");
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
      this.diwata,
      this.diwataGlow,
      this.shrine,
      this.seal,
      this.sealGlow,
      this.sealRing,
      this.sealInnerRing,
      this.monster,
      this.monsterSprite,
      this.monsterAura,
      this.barrier,
      this.barrierCore,
      this.barrierGlow,
      this.ambientShadow,
      this.statusText,
      this.hintText,
      this.shrineSealLabel,
      this.diwataSuccessLine,
      this.methodPanel,
      this.methodPanelBg,
      this.methodCallText,
      this.methodFlowLine,
    ]);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y).setAlpha(1).setTint(0xffffff);
    this.player.play("methods-4-player-idle", true);
    this.shrine.setPosition(this.shrinePoint.x, this.shrinePoint.y).setAlpha(1).setScale(1).setAngle(0);
    this.cursedShrine.setAlpha(0.96).setTint(0xc9bed7).setDisplaySize(SHRINE_DISPLAY_WIDTH, SHRINE_DISPLAY_WIDTH);
    this.sealedShrine.setAlpha(0).setTint(0xc9f8ff).setDisplaySize(SHRINE_DISPLAY_WIDTH, SHRINE_DISPLAY_WIDTH);
    this.shrineCurse.setAlpha(0.16).setScale(1);
    this.shrineSealGlow.setAlpha(0).setScale(1);
    this.startShrineIdle();
    this.seal.setPosition(this.sealPoint.x, this.sealPoint.y).setAlpha(1).setScale(1).setAngle(0);
    this.sealGlow.setFillStyle(SEAL_TEAL, 0.08).setAlpha(0.18).setScale(1);
    this.sealRing.setStrokeStyle(2, SEAL_TEAL, 0.3).setAlpha(1).setScale(1);
    this.sealInnerRing.setStrokeStyle(1, SEAL_GOLD, 0.24).setAlpha(1).setScale(1);
    this.startSealIdle();
    this.diwata?.setPosition(this.diwataPoint.x, this.diwataPoint.y - 8);
    this.diwataGlow?.setPosition(this.diwataPoint.x, this.diwataPoint.y - 32).setAlpha(0.08);
    this.diwata?.playIdle(this.spawnPoint.x < this.diwataPoint.x ? "left" : "right");
    this.startDiwataIdle();
    this.monster.setPosition(this.monsterPoint.x, this.monsterPoint.y).setAlpha(1).setScale(1);
    this.monsterSprite.setAlpha(1).setTint(0x9e6274).setFlipX(true).play("methods-4-manananggal-idle", true);
    this.monsterAura.setAlpha(0.16).setScale(1);
    this.startMonsterIdle();
    this.barrier.setPosition(this.barrierPoint.x, this.barrierPoint.y).setAlpha(1).setScale(1);
    this.barrierCore.setAlpha(0.7).setScale(1.34).setTint(0xb8f4ff).play(PORTAL_ANIM_KEY, true);
    this.barrierGlow.setAlpha(0.11).setScale(1);
    this.barrierLabel.setText("open breach").setColor("#d9f3ff");
    this.startBarrierIdle();
    this.ambientShadow.setAlpha(0.32);
    this.statusText.setText("ritual seal").setColor("#f3e6c4");
    this.hintText.setText("seal the cursed shrine").setColor("#ffd9df").setAlpha(0.84);
    this.shrineSealLabel.setPosition(this.shrinePoint.x, this.shrinePoint.y - 188).setAlpha(0);
    this.diwataSuccessLine.setPosition(this.diwataPoint.x, this.diwataPoint.y - 108).setAlpha(0);
    this.methodPanel.setAlpha(1).setScale(1);
    this.methodPanelBg.setAlpha(1).setStrokeStyle(1, 0x6fb9cc, 0.42);
    this.methodPanelTitle.setText("unnamed ritual").setColor("#a9d6e2").setAlpha(1);
    this.methodDefineText.setText("define the ritual").setColor("#f3e6c4").setAlpha(1);
    this.methodBodyText.setText("then call it from Main").setColor("#f3e6c4").setAlpha(1);
    this.methodCallText.setText("the shrine waits").setColor("#88a7b8").setAlpha(1);
    this.methodFlowLine.setAlpha(0);
    this.startMethodPanelIdle();
    this.sequenceMode = "idle";
    this.cameras.main.stopFollow();
    this.panTo(this.spawnPoint.x, 220);
  }

  startSuccess() {
    this.sequenceMode = "sealing";
    this.tweens.killTweensOf(this.methodPanel);
    this.methodPanel.setScale(1);
    this.player.play("methods-4-player-cast", true);
    this.statusText.setText("method defined").setColor("#bfffe5");
    this.hintText.setText("definition first").setColor("#ffe7aa");
    this.methodPanelTitle.setText("named ritual").setColor("#bfffe5");
    this.methodDefineText.setText("method defined").setColor("#bfffe5");
    this.methodBodyText.setText("ready inside Program").setColor("#f3e6c4");
    this.methodPanelBg.setStrokeStyle(1, SEAL_TEAL, 0.78);
    this.tweens.add({
      targets: [this.methodPanelBg, this.methodDefineText, this.methodBodyText],
      alpha: 0.45,
      duration: 180,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
    });
    this.diwata?.playAnimation("spellcast", this.spawnPoint.x < this.diwataPoint.x ? "left" : "right");
    this.panTo(this.shrinePoint.x, 480);
    this.schedule(540, () => this.showMethodCallFlow());
    this.schedule(1020, () => this.activateSeal());
    this.schedule(1060, () => this.retreatMonster());
    this.schedule(1680, () => this.closeShrine());
    this.schedule(2480, () => this.openBarrier());
  }

  showMethodCallFlow() {
    this.statusText.setText("SealShrine(); called").setColor("#bfffe5");
    this.hintText.setText("Main sends the call").setColor("#ffe7aa");
    this.methodCallText.setText("Main calls the ritual").setColor("#bfffe5");
    this.tweens.add({
      targets: this.methodFlowLine,
      alpha: 0.88,
      duration: 360,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
    });
  }

  activateSeal() {
    this.createSealRunes();
    this.tweens.add({
      targets: [this.sealGlow, this.sealRing, this.sealInnerRing],
      alpha: 0.82,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 520,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: this.ambientShadow,
      alpha: 0.18,
      duration: 900,
      ease: "Sine.easeOut",
    });
  }

  createSealRunes() {
    for (let index = 0; index < 12; index += 1) {
      const angle = (Math.PI * 2 * index) / 12;
      const x = this.sealPoint.x + Math.cos(angle) * 42;
      const y = this.sealPoint.y + Math.sin(angle) * 18;
      const rune = this.add
        .text(x, y, index % 2 === 0 ? "|" : "-", {
          fontFamily: "monospace",
          fontSize: "13px",
          color: "#d9fff0",
        })
        .setOrigin(0.5)
        .setDepth(2.06)
        .setBlendMode(Phaser.BlendModes.SCREEN);
      this.temporaryEffects.push(rune);
      this.tweens.add({
        targets: rune,
        alpha: 0,
        scale: 1.9,
        duration: 760,
        delay: index * 24,
        ease: "Sine.easeOut",
        onComplete: () => {
          Phaser.Utils.Array.Remove(this.temporaryEffects, rune);
          rune.destroy();
        },
      });
    }
  }

  retreatMonster() {
    this.hintText.setText("the creature retreats").setColor("#bfffe5");
    this.tweens.killTweensOf(this.monster);
    this.tweens.add({
      targets: this.monster,
      x: this.monster.x + 170,
      y: this.monster.y - 120,
      alpha: 0,
      scale: 0.74,
      duration: 820,
      ease: "Sine.easeInOut",
    });
  }

  closeShrine() {
    this.statusText.setText("shrine sealed").setColor("#dfffea");
    this.barrierLabel.setText("sealed").setColor("#bfffe5");
    this.createShrineSealFlash();
    this.tweens.killTweensOf([this.shrineCurse, this.shrineSealGlow]);
    this.tweens.add({
      targets: this.shrineCurse,
      alpha: 0,
      scale: 0.82,
      duration: 420,
      ease: "Sine.easeIn",
    });
    this.tweens.add({
      targets: this.cursedShrine,
      alpha: 0,
      duration: 520,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.sealedShrine,
      alpha: 1,
      duration: 620,
      ease: "Sine.easeOut",
    });
    this.schedule(660, () => {
      this.tweens.add({
        targets: this.shrineSealLabel,
        alpha: 1,
        y: this.shrinePoint.y - 198,
        duration: 420,
        ease: "Sine.easeOut",
      });
    });
    this.tweens.add({
      targets: this.shrineSealGlow,
      alpha: 0.38,
      scaleX: 1.16,
      scaleY: 1.1,
      duration: 520,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
    this.schedule(900, () => this.startSealedShrineGlow());
    this.schedule(760, () => this.showDiwataSuccessLine());
    this.tweens.add({
      targets: this.shrine,
      alpha: 1,
      scaleX: 1.08,
      scaleY: 1.04,
      duration: 340,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
  }

  showDiwataSuccessLine() {
    this.tweens.add({
      targets: this.diwataSuccessLine,
      alpha: 1,
      y: this.diwataPoint.y - 116,
      duration: 360,
      ease: "Sine.easeOut",
    });
  }

  startSealedShrineGlow() {
    this.shrineSealGlow.setAlpha(0.2).setScale(1);
    this.tweens.add({
      targets: this.shrineSealGlow,
      alpha: 0.36,
      scaleX: 1.08,
      scaleY: 1.04,
      duration: 1280,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createShrineSealFlash() {
    const flash = this.add
      .ellipse(this.shrinePoint.x, this.shrinePoint.y - 96, 188, 176, SEAL_TEAL, 0.28)
      .setDepth(1.74)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.temporaryEffects.push(flash);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 1.55,
      scaleY: 1.45,
      duration: 720,
      ease: "Sine.easeOut",
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.temporaryEffects, flash);
        flash.destroy();
      },
    });
  }

  openBarrier() {
    this.panTo(this.barrierPoint.x, 520);
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

  startFailure(message = "", reason = "generic") {
    this.sequenceMode = "failure";
    const missingDefinition = reason === "missingDefinition";
    const missingCall = reason === "missingCall";
    this.statusText
      .setText(missingDefinition ? "SealShrine() not defined" : missingCall ? "SealShrine(); not called" : "seal incomplete")
      .setColor("#ffb8b8");
    this.hintText
      .setText(missingDefinition ? "the ritual has no name" : missingCall ? "Main never sends the call" : "the shrine breach flares")
      .setColor("#ffcccc");
    this.methodPanelBg.setStrokeStyle(1, FAIL_RED, 0.72);
    this.methodDefineText.setColor(missingDefinition ? "#ffb8b8" : "#f3e6c4");
    this.methodBodyText.setColor(missingDefinition ? "#ffb8b8" : "#f3e6c4");
    this.methodCallText
      .setText(missingDefinition ? "define this method first" : missingCall ? "missing: SealShrine();" : "check the method and call")
      .setColor("#ffb8b8");
    this.player.play("methods-4-player-hurt", true);
    this.panTo(this.shrinePoint.x, 420);
    if (missingDefinition) {
      this.tweens.add({
        targets: [this.sealGlow, this.sealRing, this.sealInnerRing, this.methodPanel],
        alpha: 0.28,
        duration: 180,
        yoyo: true,
        repeat: 2,
        ease: "Sine.easeInOut",
      });
    }
    if (missingCall) {
      this.tweens.add({
        targets: this.methodFlowLine,
        alpha: 0.3,
        duration: 160,
        yoyo: true,
        repeat: 3,
        ease: "Sine.easeInOut",
      });
    }
    this.tweens.add({
      targets: [this.shrine, this.seal],
      x: "-=8",
      duration: 80,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: [this.sealGlow, this.sealRing, this.sealInnerRing],
      alpha: 0.12,
      scaleX: 0.82,
      scaleY: 0.82,
      duration: 150,
      yoyo: true,
      repeat: 3,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.shrineCurse,
      alpha: 0.38,
      scaleX: 1.18,
      scaleY: 1.12,
      duration: 180,
      yoyo: true,
      repeat: 3,
      ease: "Sine.easeInOut",
    });
    this.schedule(580, () => this.reactMonster(reason));
    this.schedule(1740, () => {
      this.resetAttempt();
      this.statusText.setText("try again").setColor("#f3e6c4");
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message: message || "Define SealShrine(), then call SealShrine(); inside Main.",
      });
    });
  }

  reactMonster(reason = "generic") {
    if (reason === "missingDefinition") {
      this.mockMonster();
      return;
    }
    this.swoopMonster(reason);
  }

  mockMonster() {
    this.hintText.setText("the creature waits and laughs").setColor("#ffcccc");
    this.panTo(this.monsterPoint.x, 520);
    this.tweens.killTweensOf(this.monster);
    this.tweens.add({
      targets: this.monster,
      angle: 7,
      scale: 1.08,
      duration: 90,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.monster.setAngle(0).setScale(1).setAlpha(1);
        this.startMonsterIdle();
      },
    });
  }

  swoopMonster(reason = "generic") {
    if (reason === "missingCall") {
      this.hintText.setText("the unused ritual leaves Kai exposed").setColor("#ffcccc");
    } else {
      this.hintText.setText("SealShrine(); must be called").setColor("#ffcccc");
    }
    this.panTo(this.monsterPoint.x, 520);
    this.tweens.killTweensOf(this.monster);
    const startX = this.monster.x;
    const startY = this.monster.y;
    const targetX = reason === "missingCall" ? this.player.x + 54 : this.player.x + 88;
    const targetY = reason === "missingCall" ? this.player.y - 72 : this.player.y - 94;
    this.tweens.add({
      targets: this.monster,
      x: targetX,
      y: targetY,
      scale: reason === "missingCall" ? 1.22 : 1.12,
      duration: 420,
      yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.monster.setPosition(startX, startY).setScale(1).setAlpha(1);
        this.startMonsterIdle();
      },
    });
  }

  finishSuccess() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    this.cameras.main.stopFollow();
    this.player.play("methods-4-player-idle", true);
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: "SealShrine was defined and called. The cursed shrine sealed and the creature retreated.",
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
    this.sequenceTimers?.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.temporaryEffects = [];
  }
}
