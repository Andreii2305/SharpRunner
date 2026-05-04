import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
  GAME_LEVEL_DIALOGUE_TRIGGERED,
  GAME_LEVEL_DIALOGUE_CLOSED,
} from "../gameEvents";

const LEVEL_NUMBER       = 5;
const PLAYER_SCALE       = 2;
const PLAYER_GRAVITY     = 1100;
const PLAYER_WALK_SPEED  = 140;
const WIZARD_SCALE       = 0.75;      // 231×190 × 0.75 ≈ 173×143 px
const WIZARD_FRAME_W     = 231;
const WIZARD_FRAME_H     = 190;
const WIZARD_FOOT_PADDING = 49;
const CAULDRON_SCALE     = 1.5;
const CAULDRON_FRAME_W   = 32;
const CAULDRON_FRAME_H   = 32;
const PORTAL_SCALE       = 1.25;
const PORTAL_FRAME_W     = 64;
const PORTAL_FRAME_H     = 64;
const SEAL_RADIUS        = 28;
const MEASUREMENT_VALUE  = 4.5;
const APPROACH_TOLERANCE = 90;
const CAULDRON_REACH_TOL = 50;
const PORTAL_REACH_TOL   = 18;
const INTRO_APPEAR_MS    = 520;
const WIZARD_DIALOGUE_ID = "level5-wizard";
const NPC_IDLE_KEY       = "wizard-idle-l5";
const NPC_CAST_KEY       = "wizard-cast-l5";
const CAULDRON_IDLE_KEY  = "cauldron-idle";
const CAULDRON_BOIL_KEY  = "cauldron-boil";
const PORTAL_IDLE_KEY    = "level5-portal-idle";
const STAIR_RAMP_NAMES   = new Set(["stair_ramp", "stairs_ramp", "ramp"]);

const ASSET_BASE    = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE       = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const GH_BG_BASE    = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const WIZARD_BASE   = `${ASSET_BASE}/characters/npc/WizardPack`;

const PLAYER_ANIMS = [
  { key: "player-idle", start: 0,  end: 5,  frameRate: 6,  repeat: -1 },
  { key: "player-run",  start: 16, end: 23, frameRate: 12, repeat: -1 },
  { key: "player-jump", start: 24, end: 31, frameRate: 10, repeat: -1 },
];

export default class LevelFiveScene extends Phaser.Scene {
  constructor() {
    super("LevelFiveScene");
  }

  preload() {
    this.load.spritesheet("player_sheet_blue",
      `${ASSET_BASE}/characters/players/char_blue.png`,
      { frameWidth: 56, frameHeight: 56 }
    );

    this.load.spritesheet("l5_wizard",
      `${WIZARD_BASE}/Idle.png`,
      { frameWidth: WIZARD_FRAME_W, frameHeight: WIZARD_FRAME_H }
    );

    this.load.spritesheet("l5_wizard_cast",
      `${WIZARD_BASE}/Attack1.png`,
      { frameWidth: WIZARD_FRAME_W, frameHeight: WIZARD_FRAME_H }
    );

    this.load.spritesheet("l5_cauldron",
      `${GH_BASE}/Animated_Sprites/Campfire_with_food_sheet.png`,
      { frameWidth: CAULDRON_FRAME_W, frameHeight: CAULDRON_FRAME_H }
    );

    this.load.spritesheet("l5_portal",
      `${GH_BASE}/Animated_Sprites/GandalfHardcore_Portal_sheet.png`,
      { frameWidth: PORTAL_FRAME_W, frameHeight: PORTAL_FRAME_H }
    );

    this.load.tilemapTiledJSON("level5", `${ASSET_BASE}/maps/level5.tmj`);

    this.load.image("l5_castle",    `${ASSET_BASE}/tiles/opp5_castle_tiles/opp5_castle_tiles/environment/tiles/castle/tile_castle_grey.png`);
    this.load.image("l5_floor2",    `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("l5_other2",    `${GH_BASE}/Other_Tiles2.png`);
    this.load.image("l5_dirt2",     `${GH_BASE}/BG_Dirt2.png`);
    this.load.image("l5_decor",     `${GH_BASE}/Decor.png`);
    this.load.image("l5_willow",    `${GH_BASE}/Weeping_Willow1.png`);
    this.load.image("l5_pine",      `${GH_BASE}/Pine_Trees.png`);
    this.load.image("l5_largepine", `${GH_BASE}/Large_Pine_Tree.png`);
    this.load.image("l5_water",     `${GH_BASE}/Animated_Sprites/GandalfHardcore_Water_Tiles_sheet.png`);
    this.load.image("l5_house",     `${GH_BASE}/House_Tiles.png`);

    this.load.image("l5_bg5",       `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("l5_bg_castle", `${GH_BG_BASE}/Background_Castle.png`);
    this.load.image("l5_bg4",       `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("l5_bg3",       `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("l5_bg2",       `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("l5_bg1",       `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
  }

  create() {
    this.scale.resize(1024, 576);
    const map    = this.make.tilemap({ key: "level5" });
    const camera = this.cameras.main;

    this.createParallaxBackgrounds();

    const tsCastle    = map.addTilesetImage("tile_castle_grey",                  "l5_castle");
    const tsFloor2    = map.addTilesetImage("Floor Tiles2",                      "l5_floor2");
    const tsOther2    = map.addTilesetImage("Other Tiles2",                      "l5_other2");
    const tsDirt2     = map.addTilesetImage("BG Dirt2",                          "l5_dirt2");
    const tsDecor     = map.addTilesetImage("Decor",                             "l5_decor");
    const tsWillow    = map.addTilesetImage("Weeping Willow1",                   "l5_willow");
    const tsPine      = map.addTilesetImage("Pine Trees",                        "l5_pine");
    const tsLargePine = map.addTilesetImage("Large_Pine_Tree",                   "l5_largepine");
    const tsWater     = map.addTilesetImage("GandalfHardcore_Water_Tiles_sheet", "l5_water");
    const tsHouse     = map.addTilesetImage("House_Tiles",                       "l5_house");
    const allTilesets = [tsCastle, tsFloor2, tsOther2, tsDirt2, tsDecor, tsWillow, tsPine, tsLargePine, tsWater, tsHouse].filter(Boolean);

    const offsetY = this.scale.height - map.heightInPixels;

    const platformLayer = map.createLayer("Platform", allTilesets, 0, offsetY);
    if (platformLayer) {
      platformLayer.setDepth(0);
      platformLayer.setCollisionByExclusion([-1], true);
    }

    const castleBackLayer = map.createLayer("Castle_back", allTilesets, 0, offsetY);
    if (castleBackLayer) castleBackLayer.setDepth(0.05);

    const castleLayer = map.createLayer("castle", allTilesets, 0, offsetY);
    if (castleLayer) castleLayer.setDepth(0.08);

    const stairsLayer = map.createLayer("Stairs", allTilesets, 0, offsetY);
    if (stairsLayer) stairsLayer.setDepth(0.7);

    const houseLayer = map.createLayer("House", allTilesets, 0, offsetY);
    if (houseLayer) houseLayer.setDepth(0.1);

    const houseDecorBackLayer = map.createLayer("House_decor_back", allTilesets, 0, offsetY);
    if (houseDecorBackLayer) houseDecorBackLayer.setDepth(0.15);

    const treesLayer = map.createLayer("Trees", allTilesets, 0, offsetY);
    if (treesLayer) treesLayer.setDepth(0.5);

    const decorLayer = map.createLayer("Decor", allTilesets, 0, offsetY);
    if (decorLayer) decorLayer.setDepth(0.5);

    const houseDecorLayer = map.createLayer("House_decor", allTilesets, 0, offsetY);
    if (houseDecorLayer) houseDecorLayer.setDepth(0.8);

    const castleFrontLayer = map.createLayer("castle_front", allTilesets, 0, offsetY);
    if (castleFrontLayer) castleFrontLayer.setDepth(0.85);

    camera.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);
    this.physics.world.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);

    // Resolve object points — fallbacks match the .tmj values
    let spawnPt   = { x: 77,    y: 444 + offsetY };
    let wizardPt  = { x: 867.5, y: 441 + offsetY };
    let cauldronPt = { x: 921.5, y: 448 + offsetY };
    let portalPt = null;

    const objectLayer = map.getObjectLayer("Objects");
    this.stairRamps = [];
    if (objectLayer) {
      objectLayer.objects.forEach((obj) => {
        if (obj.name === "player_spawn")   spawnPt    = { x: obj.x, y: obj.y + offsetY };
        if (obj.name === "wizzard_spawn" || obj.name === "wizard_spawn") wizardPt = { x: obj.x, y: obj.y + offsetY };
        if (obj.name === "cauldron_spawn") cauldronPt = { x: obj.x, y: obj.y + offsetY };
        if (obj.name === "portal_spawn" || obj.name === "front_door_portal") portalPt = { x: obj.x, y: obj.y + offsetY };
        if (STAIR_RAMP_NAMES.has(obj.name) && obj.width > 0 && obj.height > 0) {
          this.stairRamps.push({
            x: obj.x,
            y: obj.y + offsetY,
            width: obj.width,
            height: obj.height,
            direction: this.getObjectProperty(obj, "direction") ?? "up-right",
          });
        }
      });
    }

    this.wizardPoint   = wizardPt;
    this.cauldronPoint = cauldronPt;
    this.portalPoint   = portalPt ?? { x: wizardPt.x - 32, y: wizardPt.y };

    // Keep the seal near the cauldron so it does not cover the wizard.
    this.sealX = cauldronPt.x - 12;
    this.sealY = cauldronPt.y - 48;

    this.createPlayerAnimations();
    this.createWizardAnimation();
    this.createCauldronAnimations();
    this.createPortalAnimation();

    // Wizard NPC — static sprite anchored to the floor (same y as cauldron)
    // The idle sheet has transparent pixels below the feet.
    const wizardFloorY = wizardPt.y + (WIZARD_FOOT_PADDING * WIZARD_SCALE);
    this.wizard = this.add.sprite(wizardPt.x, wizardFloorY, "l5_wizard")
      .setOrigin(0.5, 1)
      .setScale(WIZARD_SCALE)
      .setDepth(1)
      .setFlipX(true);
    this.wizard.play(NPC_IDLE_KEY);

    // Cauldron — slightly offset so it sits on the ground
    this.cauldron = this.add
      .sprite(cauldronPt.x, cauldronPt.y, "l5_cauldron")
      .setOrigin(0.5, 1)
      .setScale(CAULDRON_SCALE)
      .setDepth(1);
    this.cauldron.play(CAULDRON_IDLE_KEY);

    this.createSeal(this.sealX, this.sealY);
    this.createMeasurementSign(this.sealX, this.sealY - SEAL_RADIUS - 22);

    this.player = this.physics.add.sprite(spawnPt.x, spawnPt.y, "player_sheet_blue");
    this.player
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(2)
      .setAlpha(0)
      .setCollideWorldBounds(true)
      .setGravityY(0);

    if (platformLayer) this.physics.add.collider(this.player, platformLayer);

    camera.startFollow(this.player, true, 0.12, 0.12);

    this.sequenceMode      = "intro";
    this.dialogueRequested = false;
    this.dialogueClosed    = false;

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.on(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);

    this.tweens.add({
      targets: this.player,
      alpha: 1,
      duration: INTRO_APPEAR_MS,
      onComplete: () => {
        this.player.setGravityY(PLAYER_GRAVITY);
        this.sequenceMode = "walkToWizard";
        this.playAnimation("player-run");
      },
    });
  }

  // ─── Animations ───────────────────────────────────────────────────────────

  createPlayerAnimations() {
    PLAYER_ANIMS.forEach(({ key, start, end, frameRate, repeat }) => {
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers("player_sheet_blue", { start, end }),
          frameRate,
          repeat,
        });
      }
    });
  }

  createWizardAnimation() {
    if (!this.anims.exists(NPC_IDLE_KEY)) {
      this.anims.create({
        key: NPC_IDLE_KEY,
        frames: this.anims.generateFrameNumbers("l5_wizard", { start: 0, end: 5 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    if (!this.anims.exists(NPC_CAST_KEY)) {
      this.anims.create({
        key: NPC_CAST_KEY,
        frames: this.anims.generateFrameNumbers("l5_wizard_cast", { start: 0, end: 7 }),
        frameRate: 12,
        repeat: 0,
      });
    }
  }

  createCauldronAnimations() {
    // Campfire_with_food_sheet.png: 160×256, 32×32 frames → 5 cols × 8 rows = 40 frames
    if (!this.anims.exists(CAULDRON_IDLE_KEY)) {
      this.anims.create({
        key: CAULDRON_IDLE_KEY,
        frames: this.anims.generateFrameNumbers("l5_cauldron", { start: 0, end: 4 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    if (!this.anims.exists(CAULDRON_BOIL_KEY)) {
      this.anims.create({
        key: CAULDRON_BOIL_KEY,
        frames: this.anims.generateFrameNumbers("l5_cauldron", { start: 0, end: 39 }),
        frameRate: 14,
        repeat: -1,
      });
    }
  }

  // ─── Seal (drawn in Phaser graphics) ──────────────────────────────────────

  createPortalAnimation() {
    if (!this.anims.exists(PORTAL_IDLE_KEY)) {
      this.anims.create({
        key: PORTAL_IDLE_KEY,
        frames: this.anims.generateFrameNumbers("l5_portal", { start: 0, end: 9 }),
        frameRate: 12,
        repeat: -1,
      });
    }
  }

  createSeal(x, y) {
    const gfx = this.add.graphics();

    // Outer glow ring
    gfx.lineStyle(6, 0x9b3fd4, 0.6);
    gfx.strokeCircle(x, y, SEAL_RADIUS + 8);

    // Main ring
    gfx.lineStyle(3, 0xc47fff, 1);
    gfx.strokeCircle(x, y, SEAL_RADIUS);

    // Inner ring
    gfx.lineStyle(2, 0x9b3fd4, 0.8);
    gfx.strokeCircle(x, y, SEAL_RADIUS * 0.6);

    // 6 radial rune lines
    gfx.lineStyle(2, 0xc47fff, 0.9);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      gfx.lineBetween(
        x + Math.cos(angle) * SEAL_RADIUS * 0.25,
        y + Math.sin(angle) * SEAL_RADIUS * 0.25,
        x + Math.cos(angle) * SEAL_RADIUS * 0.9,
        y + Math.sin(angle) * SEAL_RADIUS * 0.9
      );
    }

    gfx.setDepth(1.5);
    this.sealGfx = gfx;

    // Pulsing glow fill
    const glow = this.add.graphics();
    glow.fillStyle(0x9b3fd4, 0.18);
    glow.fillCircle(x, y, SEAL_RADIUS + 8);
    glow.setDepth(1.4);
    this.sealGlow = glow;

    this.tweens.add({
      targets: glow,
      alpha: 0.05,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createMeasurementSign(x, y) {
    const w = 68, h = 30;
    const bg = this.add.graphics();
    bg.fillStyle(0x2a1040, 0.92);
    bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 5);
    bg.lineStyle(2, 0xc47fff, 1);
    bg.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 5);
    bg.setDepth(1.6);

    const label = this.add.text(x, y - 7, "SEAL", {
      fontFamily: "monospace", fontSize: "8px", color: "#c47fff", fontStyle: "bold",
    }).setOrigin(0.5, 0.5).setDepth(1.7);

    const value = this.add.text(x, y + 6, `${MEASUREMENT_VALUE}`, {
      fontFamily: "monospace", fontSize: "11px", color: "#ffffff", fontStyle: "bold",
    }).setOrigin(0.5, 0.5).setDepth(1.7);

    this.sealSignBg = bg;
    this.sealSignTexts = [label, value];
  }

  // ─── Parallax backgrounds (same pattern as all other levels) ──────────────

  createParallaxBackgrounds() {
    const BG_H = 346, CANVAS_H = 576;
    const configs = [
      { key: "l5_bg5",       parallax: 0.1, depth: -9, offsetY: 0, height: CANVAS_H },
      { key: "l5_bg_castle", parallax: 0.1, depth: -8, offsetY: 94, tileOffsetX: -478 },
      { key: "l5_bg4",       parallax: 0.1, depth: -7, offsetY: 132 },
      { key: "l5_bg3",       parallax: 0.4, depth: -6, offsetY: 168 },
      { key: "l5_bg2",       parallax: 0.7, depth: -5, offsetY: 202 },
      { key: "l5_bg1",       parallax: 0.9, depth: -4, offsetY: 234 },
    ];
    this.bgLayers = configs.map(({ key, parallax, depth, offsetY, height, tileOffsetX = 0 }) => ({
      sprite: this.add
        .tileSprite(0, offsetY, 1024, height ?? BG_H, key)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(depth),
      parallax,
      tileOffsetX,
    }));
  }

  // ─── Update loop ──────────────────────────────────────────────────────────

  update() {
    if (!this.player?.body) return;

    if (this.bgLayers) {
      const camX = this.cameras.main.scrollX;
      this.bgLayers.forEach(({ sprite, parallax, tileOffsetX = 0 }) => {
        sprite.tilePositionX = camX * parallax + tileOffsetX;
      });
    }

    const onGround = this.player.body.blocked.down || this.player.body.touching.down;
    const onRamp = this.applyStairRamps();

    if (this.sequenceMode === "walkToWizard") {
      this.player.setVelocityX(PLAYER_WALK_SPEED);
      this.player.setFlipX(false);
      if (!onGround && !onRamp) { this.playAnimation("player-jump"); return; }
      this.playAnimation("player-run");
      if (this.player.x >= this.wizardPoint.x - APPROACH_TOLERANCE) {
        this.player.setVelocityX(0);
        this.player.x = this.wizardPoint.x - APPROACH_TOLERANCE;
        this.playAnimation("player-idle");
        this.triggerWizardDialogue();
      }
      return;
    }

    if (this.sequenceMode === "walkToPortal") {
      const direction = Math.sign(this.portalPoint.x - this.player.x) || 1;
      this.player.setVelocityX(PLAYER_WALK_SPEED * direction);
      this.player.setFlipX(direction < 0);
      if (!onGround && !onRamp) { this.playAnimation("player-jump"); return; }
      this.playAnimation("player-run");
      if (Math.abs(this.player.x - this.portalPoint.x) <= PORTAL_REACH_TOL) {
        this.player.setVelocityX(0);
        this.player.x = this.portalPoint.x;
        this.startEnterPortalSequence();
      }
      return;
    }

    if (["wizardDialogue", "awaitingCode", "shattering", "wizardCasting", "portalAppearing", "enterPortal", "failure", "success"].includes(this.sequenceMode)) {
      this.player.setVelocityX(0);
      return;
    }

    this.player.setVelocityX(0);
    if (!onGround && !onRamp) { this.playAnimation("player-jump"); return; }
    this.playAnimation("player-idle");
  }

  // ─── Dialogue ─────────────────────────────────────────────────────────────

  triggerWizardDialogue() {
    if (this.dialogueRequested) {
      this.sequenceMode = this.dialogueClosed ? "awaitingCode" : "wizardDialogue";
      return;
    }
    this.dialogueRequested = true;
    this.sequenceMode = "wizardDialogue";
    gameEvents.emit(GAME_LEVEL_DIALOGUE_TRIGGERED, {
      levelNumber: LEVEL_NUMBER,
      dialogueId: WIZARD_DIALOGUE_ID,
    });
  }

  onDialogueClosed({ levelNumber, dialogueId } = {}) {
    if (levelNumber !== LEVEL_NUMBER) return;
    if (dialogueId !== WIZARD_DIALOGUE_ID) return;
    this.dialogueClosed = true;
    if (this.sequenceMode === "wizardDialogue") {
      this.sequenceMode = "awaitingCode";
      this.playAnimation("player-idle");
    }
  }

  // ─── Code evaluation ──────────────────────────────────────────────────────

  onCodeEvaluated({ levelNumber, isCorrect, message }) {
    if (levelNumber !== LEVEL_NUMBER) return;
    if (typeof isCorrect !== "boolean") return;
    if (this.sequenceMode !== "awaitingCode") return;

    if (isCorrect) {
      this.startShatterSequence();
    } else {
      this.startFailureSequence(message);
    }
  }

  // ─── Seal shatter ─────────────────────────────────────────────────────────

  startShatterSequence() {
    this.sequenceMode = "shattering";
    this.playAnimation("player-idle");

    // Flash the seal white before shattering
    this.sealGfx.setAlpha(0);
    const flashGfx = this.add.graphics();
    flashGfx.fillStyle(0xffffff, 0.9);
    flashGfx.fillCircle(this.sealX, this.sealY, SEAL_RADIUS + 10);
    flashGfx.setDepth(3);

    this.tweens.add({
      targets: flashGfx,
      alpha: 0,
      scaleX: 2.2,
      scaleY: 2.2,
      duration: 380,
      ease: "Sine.easeOut",
      onComplete: () => {
        flashGfx.destroy();
        this.sealGlow?.destroy();
        this.destroyMeasurementSign();
        // Activate cauldron
        this.cauldron.play(CAULDRON_BOIL_KEY);
        this.cauldron.setTint(0xaaffaa);
        this.time.delayedCall(300, () => this.cauldron.clearTint());
        this.time.delayedCall(700, () => {
          this.startWizardCastSequence();
        });
      },
    });
  }

  // ─── Failure ──────────────────────────────────────────────────────────────

  startWizardCastSequence() {
    this.sequenceMode = "wizardCasting";
    this.playAnimation("player-idle");
    this.wizard.play(NPC_CAST_KEY, true);

    this.time.delayedCall(650, () => {
      this.wizard.play(NPC_IDLE_KEY, true);
      this.startPortalSequence();
    });
  }

  startFailureSequence(message) {
    this.sequenceMode = "failure";

    const flashGfx = this.add.graphics();
    flashGfx.lineStyle(6, 0xff4444, 0.95);
    flashGfx.strokeCircle(this.sealX, this.sealY, SEAL_RADIUS + 8);
    flashGfx.setDepth(2);

    this.time.delayedCall(260, () => {
      flashGfx.destroy();
      this.time.delayedCall(80, () => {
        gameEvents.emit(GAME_LEVEL_OUTCOME, {
          levelNumber: LEVEL_NUMBER,
          status: "failure",
          message,
        });
        this.sequenceMode = "awaitingCode";
      });
    });
  }

  // ─── Success ──────────────────────────────────────────────────────────────

  startPortalSequence() {
    this.sequenceMode = "portalAppearing";
    this.playAnimation("player-idle");

    if (!this.portal) {
      this.portal = this.add
        .sprite(this.portalPoint.x, this.portalPoint.y, "l5_portal")
        .setOrigin(0.5, 1)
        .setScale(0.2)
        .setAlpha(0)
        .setDepth(1.9);
      this.portal.play(PORTAL_IDLE_KEY);
    }

    this.tweens.add({
      targets: this.portal,
      alpha: 1,
      scaleX: PORTAL_SCALE,
      scaleY: PORTAL_SCALE,
      duration: 420,
      ease: "Back.easeOut",
      onComplete: () => {
        this.sequenceMode = "walkToPortal";
        this.playAnimation("player-run");
      },
    });
  }

  startEnterPortalSequence() {
    this.sequenceMode = "enterPortal";
    this.playAnimation("player-idle");

    this.tweens.add({
      targets: this.player,
      alpha: 0,
      scaleX: PLAYER_SCALE * 0.35,
      scaleY: PLAYER_SCALE * 0.35,
      duration: 420,
      ease: "Sine.easeIn",
      onComplete: () => this.finishSuccessSequence(),
    });
  }

  finishSuccessSequence() {
    this.playAnimation("player-idle");

    this.tweens.add({
      targets: this.cauldron,
      scaleX: CAULDRON_SCALE * 1.15,
      scaleY: CAULDRON_SCALE * 1.15,
      duration: 200,
      yoyo: true,
      ease: "Sine.easeOut",
    });
    this.time.delayedCall(400, () => {
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "success",
        message: "Seal shattered. The cauldron awakens. Level 5 cleared.",
        shouldProceed: true,
      });
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  playAnimation(key) {
    if (!this.player) return;
    if (this.player.anims.currentAnim?.key === key) return;
    this.player.play(key, true);
  }

  applyStairRamps() {
    if (!this.player?.body || !this.stairRamps?.length) return false;

    const footX = this.player.x;
    const footY = this.player.y;

    for (const ramp of this.stairRamps) {
      if (footX < ramp.x || footX > ramp.x + ramp.width) continue;

      const progress = Phaser.Math.Clamp((footX - ramp.x) / ramp.width, 0, 1);
      const rampY =
        ramp.direction === "up-left"
          ? ramp.y + (progress * ramp.height)
          : ramp.y + ramp.height - (progress * ramp.height);

      if (footY < ramp.y - 12 || footY > ramp.y + ramp.height + 28) continue;

      this.player.y = rampY;
      this.player.body.setVelocityY(0);
      return true;
    }

    return false;
  }

  getObjectProperty(obj, key) {
    const property = obj.properties?.find((item) => item.name === key);
    return property?.value;
  }

  destroyMeasurementSign() {
    this.sealSignBg?.destroy();
    this.sealSignBg = null;

    this.sealSignTexts?.forEach((text) => text.destroy());
    this.sealSignTexts = null;
  }

  cleanupScene() {
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.off(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
  }
}
