import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
  GAME_LEVEL_DIALOGUE_TRIGGERED,
  GAME_LEVEL_DIALOGUE_CLOSED,
} from "../gameEvents";

const LEVEL_NUMBER = 4;
const PLAYER_SCALE = 2;
const PLAYER_GRAVITY = 1100;
const PLAYER_WALK_SPEED = 140;
const NPC_SCALE = 1.1;
const NPC_FRAME_SIZE = 96;
const BOAT_FRAME_WIDTH = 80;
const BOAT_FRAME_HEIGHT = 32;
const BOAT_SCALE = 2.5;
const BOAT_ANIMATION_KEY = "l4-boat-row";
const BOAT_DEPTH = 0.4;
const WATER_LAYER_DEPTH = -0.7;
const WATER_OVERLAY_DEPTH = 0.45;
const BOAT_BOARDING_INSET_X = 18;
const RIVER_EDGE_BOARDING_OFFSET_X = 64;
const BOAT_CROSS_DURATION_MS = 4200;
const BOAT_BOARD_DURATION_MS = 850;
const PLAYER_BOAT_OFFSET_X = 12;
const PLAYER_BOAT_OFFSET_Y = -24;
const PLAYER_DISEMBARK_OFFSET_X = 96;
const LANDING_PLATFORM_WIDTH = 520;
const LANDING_PLATFORM_HEIGHT = 24;
const COIN_ANIMATION_KEY = "coin-spin";
const DEFAULT_TOLL_COIN_COUNT = 20;
const MAX_VISIBLE_TOLL_COINS = 60;
const WATER_SCROLL_SPEED = 0.7;
const EXIT_REACH_TOLERANCE_PX = 24;
const NON_FATAL_FAILURE_DELAY_MS = 260;
const INTRO_APPEAR_DURATION_MS = 520;
const NPC_IDLE_ANIMATION_KEY = "npc-idle-l4";
const TOLL_DIALOGUE_ID = "level4-toll-collector";
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_ASSET_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const GH_BG_BASE = `${GH_ASSET_BASE}/GandalfHardcore_Background_layers/Normal_BG`;

const PLAYER_ANIMATIONS = [
  { key: "player-idle", start: 0, end: 5, frameRate: 6, repeat: -1 },
  { key: "player-run", start: 16, end: 23, frameRate: 12, repeat: -1 },
  { key: "player-jump", start: 24, end: 31, frameRate: 10, repeat: -1 },
  { key: "player-death", start: 40, end: 47, frameRate: 10, repeat: 0 },
  { key: "player-downed", start: 48, end: 51, frameRate: 6, repeat: -1 },
];

export default class LevelFourScene extends Phaser.Scene {
  constructor() {
    super("LevelFourScene");
  }

  preload() {
    this.load.spritesheet(
      "player_sheet_blue",
      `${ASSET_BASE}/characters/players/char_blue.png`,
      { frameWidth: 56, frameHeight: 56 }
    );
    this.load.spritesheet(
      "npc_idle_l4",
      `${ASSET_BASE}/characters/npc/gatekeeper_Idle.png`,
      { frameWidth: NPC_FRAME_SIZE, frameHeight: NPC_FRAME_SIZE }
    );
    this.load.spritesheet(
      "l4_boat",
      `${GH_ASSET_BASE}/Boat.png`,
      { frameWidth: BOAT_FRAME_WIDTH, frameHeight: BOAT_FRAME_HEIGHT }
    );
    this.load.spritesheet(
      "gold_coins",
      `${ASSET_BASE}/other/Coin_Gems/goldCoins.png`,
      { frameWidth: 16, frameHeight: 16 }
    );

    this.load.tilemapTiledJSON("level4", `${ASSET_BASE}/maps/level4.tmj`);

    this.load.image("l4_castle",    `${ASSET_BASE}/tiles/opp5_castle_tiles/opp5_castle_tiles/environment/tiles/castle/tile_castle_grey.png`);
    this.load.image("l4_floor2",    `${GH_ASSET_BASE}/Floor_Tiles2.png`);
    this.load.image("l4_other2",    `${GH_ASSET_BASE}/Other_Tiles2.png`);
    this.load.image("l4_dirt2",     `${GH_ASSET_BASE}/BG_Dirt2.png`);
    this.load.image("l4_decor",     `${GH_ASSET_BASE}/Decor.png`);
    this.load.image("l4_willow",    `${GH_ASSET_BASE}/Weeping_Willow1.png`);
    this.load.image("l4_pine",      `${GH_ASSET_BASE}/Pine_Trees.png`);
    this.load.image("l4_largepine", `${GH_ASSET_BASE}/Large_Pine_Tree.png`);

    this.load.image("l4_water", `${GH_ASSET_BASE}/Animated_Sprites/GandalfHardcore_Water_Tiles_sheet.png`);

    this.load.image("l4_bg5",      `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("l4_bg_castle", `${GH_BG_BASE}/Background_Castle.png`);
    this.load.image("l4_bg4",      `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("l4_bg3",      `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("l4_bg2",      `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("l4_bg1",      `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
  }

  create() {
    this.scale.resize(1024, 576);
    const map = this.make.tilemap({ key: "level4" });
    const camera = this.cameras.main;

    this.createParallaxBackgrounds();

    const tsCastle    = map.addTilesetImage("tile_castle_grey",                  "l4_castle");
    const tsFloor2    = map.addTilesetImage("Floor Tiles2",                      "l4_floor2");
    const tsOther2    = map.addTilesetImage("Other Tiles2",                      "l4_other2");
    const tsDirt2     = map.addTilesetImage("BG Dirt2",                          "l4_dirt2");
    const tsDecor     = map.addTilesetImage("Decor",                             "l4_decor");
    const tsWillow    = map.addTilesetImage("Weeping Willow1",                   "l4_willow");
    const tsPine      = map.addTilesetImage("Pine Trees",                        "l4_pine");
    const tsLargePine = map.addTilesetImage("Large_Pine_Tree",                   "l4_largepine");
    const tsWater     = map.addTilesetImage("GandalfHardcore_Water_Tiles_sheet", "l4_water");
    const allTilesets = [tsCastle, tsFloor2, tsOther2, tsDirt2, tsDecor, tsWillow, tsPine, tsLargePine, tsWater].filter(Boolean);

    const offsetY = this.scale.height - map.heightInPixels;
    const floorSurfaceY = offsetY + 14 * (map.tileHeight || 32);

    const platformBackLayer = map.createLayer("Platform_back", allTilesets, 0, offsetY);
    if (platformBackLayer) platformBackLayer.setDepth(-1);

    const groundLayer = map.createLayer("Ground", allTilesets, 0, offsetY);
    if (groundLayer) groundLayer.setDepth(-1);

    const waterLayer = map.createLayer("water", allTilesets, 0, offsetY);
    if (waterLayer) waterLayer.setDepth(WATER_LAYER_DEPTH);

    const platformLayer = map.createLayer("Platform", allTilesets, 0, offsetY);
    if (platformLayer) {
      platformLayer.setDepth(0);
      // Only Floor Tiles2 (GIDs 226-387) are walkable ground.
      // setCollisionByExclusion would also hit decorative cliff/tree tiles above and block the player.
      const floorTileIds = Array.from({ length: 162 }, (_, i) => 226 + i);
      platformLayer.setCollision(floorTileIds, true);
    }

    const treesLayer = map.createLayer("Trees", allTilesets, 0, offsetY);
    if (treesLayer) treesLayer.setDepth(0.5);

    const decorLayer = map.createLayer("Decor", allTilesets, 0, offsetY);
    if (decorLayer) decorLayer.setDepth(0.5);

    camera.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);
    this.physics.world.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);

    // Resolve object points
    let spawnPt     = { x: 77,   y: 444 + offsetY };
    let tollPt      = { x: 384,  y: 445 + offsetY };
    let boatSpawnPt = { x: 446,  y: 462 + offsetY };
    let boatExitPt  = { x: 1028, y: 456 + offsetY };
    let riverRect   = { x: 416,  y: 472 + offsetY, width: 643, height: 106 };

    const objectLayer = map.getObjectLayer("Objects");
    if (objectLayer) {
      objectLayer.objects.forEach((obj) => {
        if (obj.name === "player_spawn")   spawnPt     = { x: obj.x, y: obj.y + offsetY };
        if (obj.name === "toll_collector") tollPt      = { x: obj.x, y: obj.y + offsetY };
        if (obj.name === "boat_spawn")     boatSpawnPt = { x: obj.x, y: obj.y + offsetY };
        if (obj.name === "boat_exit")      boatExitPt  = { x: obj.x, y: obj.y + offsetY };
        if (obj.name === "river")          riverRect   = { x: obj.x, y: obj.y + offsetY, width: obj.width, height: obj.height };
      });
    }

    this.spawnPoint     = spawnPt;
    this.tollPoint      = tollPt;
    this.boatSpawnPoint = boatSpawnPt;
    this.boatExitPoint  = boatExitPt;
    this.exitWalkTargetX = boatExitPt.x + PLAYER_DISEMBARK_OFFSET_X + 80;
    this.disembarkPoint = {
      x: boatExitPt.x + PLAYER_DISEMBARK_OFFSET_X,
      y: floorSurfaceY,
    };
    const boatLeftEdgeX =
      boatSpawnPt.x - (BOAT_FRAME_WIDTH * BOAT_SCALE) / 2 + BOAT_BOARDING_INSET_X;
    this.boatBoardingX = Math.min(
      boatLeftEdgeX,
      riverRect.x - RIVER_EDGE_BOARDING_OFFSET_X
    );


    this.createBoatAnimation();

    // Boat is placed from the Tiled object marker, then animated in Phaser.
    this.boat = this.createBoat(boatSpawnPt.x, boatSpawnPt.y);

    // Animated water TileSprite — sits beneath the water tilemap layer
    this.waterTile = this.add
      .tileSprite(riverRect.x, riverRect.y, riverRect.width, riverRect.height, "l4_water")
      .setOrigin(0, 0)
      .setDepth(WATER_OVERLAY_DEPTH)
      .setAlpha(0.88);

    // Toll sign above NPC
    this.createTollSign(tollPt.x + 56, tollPt.y - NPC_FRAME_SIZE * NPC_SCALE - 12);

    this.createPlayerAnimations();
    this.createNpcAnimation();
    this.createCoinAnimation();

    this.player = this.physics.add.sprite(spawnPt.x, spawnPt.y, "player_sheet_blue");
    this.player
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1)
      .setAlpha(0)
      .setCollideWorldBounds(true)
      .setGravityY(0);

    if (platformLayer) this.physics.add.collider(this.player, platformLayer);

    this.landingPlatform = this.add.zone(
      boatExitPt.x + LANDING_PLATFORM_WIDTH / 2,
      floorSurfaceY + LANDING_PLATFORM_HEIGHT / 2,
      LANDING_PLATFORM_WIDTH,
      LANDING_PLATFORM_HEIGHT
    );
    this.physics.add.existing(this.landingPlatform, true);
    this.landingPlatform.body.setSize(
      LANDING_PLATFORM_WIDTH,
      LANDING_PLATFORM_HEIGHT
    );
    this.physics.add.collider(this.player, this.landingPlatform);

    this.tollCollector = this.add
      .sprite(tollPt.x, tollPt.y, "npc_idle_l4")
      .setOrigin(0.5, 1)
      .setScale(NPC_SCALE)
      .setDepth(1)
      .setFlipX(true);
    this.tollCollector.play(NPC_IDLE_ANIMATION_KEY);

    camera.startFollow(this.player, true, 0.12, 0.12);

    this.sequenceMode = "intro";
    this.isDead       = false;
    this.isDowned     = false;
    this.failureTimer = null;
    this.submittedCoinCount = DEFAULT_TOLL_COIN_COUNT;
    this.dialogueRequested = false;
    this.dialogueClosed = false;
    this.failureMessage = "Invalid code. Declare: int coins = 20;";

    this.player.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      this.onPlayerAnimationComplete,
      this
    );
    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.on(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);

    this.tweens.add({
      targets: this.player,
      alpha: 1,
      duration: INTRO_APPEAR_DURATION_MS,
      onComplete: () => {
        this.player.setGravityY(PLAYER_GRAVITY);
        this.sequenceMode = "walkToBooth";
        this.playAnimation("player-run");
      },
    });
  }

  createBoat(bx, by) {
    const container = this.add.container(bx, by);
    const s = this.add
      .sprite(0, 0, "l4_boat")
      .setOrigin(0.5, 1)
      .setScale(BOAT_SCALE)
      .setFrame(0);
    s.play(BOAT_ANIMATION_KEY);
    container.add(s);
    container.setDepth(BOAT_DEPTH);
    return container;
  }

  createTollSign(x, y) {
    const w = 108, h = 50;
    const bg = this.add.graphics();
    bg.fillStyle(0x4a2c0a, 0.95);
    bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
    bg.lineStyle(3, 0xd4a017, 1);
    bg.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);
    bg.setDepth(2);

    this.add.text(x, y - 9, "TOLL", {
      fontFamily: "monospace", fontSize: "13px",
      color: "#d4a017", fontStyle: "bold",
    }).setOrigin(0.5, 0.5).setDepth(3);

    this.tollCoinsText = this.add.text(x, y + 9, "20 COINS", {
      fontFamily: "monospace", fontSize: "11px", color: "#ffffff",
    }).setOrigin(0.5, 0.5).setDepth(3);
  }

  createParallaxBackgrounds() {
    const BG_H = 346, CANVAS_H = 576;
    const bgConfigs = [
      { key: "l4_bg5",       parallax: 0.1, depth: -9, offsetY: 0, height: CANVAS_H },
      { key: "l4_bg_castle", parallax: 0.1, depth: -8, offsetY: 94, tileOffsetX: -478 },
      { key: "l4_bg4",       parallax: 0.1, depth: -7, offsetY: 132 },
      { key: "l4_bg3",       parallax: 0.4, depth: -6, offsetY: 168 },
      { key: "l4_bg2",       parallax: 0.7, depth: -5, offsetY: 202 },
      { key: "l4_bg1",       parallax: 0.9, depth: -4, offsetY: 234 },
    ];
    this.bgLayers = bgConfigs.map(({ key, parallax, depth, offsetY, height, tileOffsetX = 0 }) =>
      ({
        sprite: this.add
          .tileSprite(0, offsetY, 1024, height ?? BG_H, key)
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(depth),
        parallax,
        tileOffsetX,
      })
    );
  }

  update() {
    if (!this.player || !this.player.body) return;

    if (this.bgLayers) {
      const camX = this.cameras.main.scrollX;
      this.bgLayers.forEach(({ sprite, parallax, tileOffsetX = 0 }) => {
        sprite.tilePositionX = camX * parallax + tileOffsetX;
      });
    }

    if (this.waterTile) this.waterTile.tilePositionX += WATER_SCROLL_SPEED;

    const onGround = this.player.body.blocked.down || this.player.body.touching.down;

    if (this.sequenceMode === "walkToBooth") {
      this.player.setVelocityX(PLAYER_WALK_SPEED);
      this.player.setFlipX(false);
      if (!onGround) { this.playAnimation("player-jump"); return; }
      this.playAnimation("player-run");
      if (this.player.x >= this.tollPoint.x - 60) {
        this.player.setVelocityX(0);
        this.player.x = this.tollPoint.x - 60;
        this.playAnimation("player-idle");
        this.triggerTollDialogue();
      }
      return;
    }

    if (this.sequenceMode === "walkToBoat") {
      this.player.setVelocityX(PLAYER_WALK_SPEED);
      this.player.setFlipX(false);
      if (this.player.x >= this.boatBoardingX) {
        this.player.setVelocityX(0);
        this.startBoardingSequence();
        return;
      }
      if (!onGround) { this.playAnimation("player-jump"); return; }
      this.playAnimation("player-run");
      return;
    }

    if (this.sequenceMode === "walkToExit") {
      if (!this.player.body.enable) {
        this.playAnimation("player-run");
        return;
      }
      this.player.setVelocityX(PLAYER_WALK_SPEED);
      this.player.setFlipX(false);
      if (!onGround) { this.playAnimation("player-jump"); return; }
      this.playAnimation("player-run");
      if (this.player.x >= this.exitWalkTargetX) {
        this.sequenceMode = "success";
        this.player.setVelocityX(0);
        this.finishSuccessSequence();
      }
      return;
    }

    if (
      ["failure", "crossing", "boarding", "disembarking", "payToll", "success"].includes(
        this.sequenceMode
      ) ||
      this.isDead ||
      this.isDowned
    ) {
      this.player.setVelocityX(0);
      return;
    }

    this.player.setVelocityX(0);
    if (!onGround) { this.playAnimation("player-jump"); return; }
    this.playAnimation("player-idle");
  }

  onCodeEvaluated({ levelNumber, isCorrect, values }) {
    if (levelNumber !== LEVEL_NUMBER) return;
    if (typeof isCorrect !== "boolean") return;
    if (this.sequenceMode !== "awaitingCode") return;

    this.clearFailureTimer();

    const submittedCoins = this.getSubmittedCoinCount(values);
    if (isCorrect) {
      this.submittedCoinCount = submittedCoins ?? DEFAULT_TOLL_COIN_COUNT;
      this.startPayTollSequence();
    } else {
      if (submittedCoins !== null) {
        this.startRejectedTollSequence(submittedCoins);
        return;
      }
      this.startFailureSequence();
    }
  }

  triggerTollDialogue() {
    if (this.dialogueRequested) {
      this.sequenceMode = this.dialogueClosed ? "awaitingCode" : "tollDialogue";
      return;
    }

    this.dialogueRequested = true;
    this.sequenceMode = "tollDialogue";
    gameEvents.emit(GAME_LEVEL_DIALOGUE_TRIGGERED, {
      levelNumber: LEVEL_NUMBER,
      dialogueId: TOLL_DIALOGUE_ID,
    });
  }

  onDialogueClosed({ levelNumber, dialogueId } = {}) {
    if (levelNumber !== LEVEL_NUMBER) return;
    if (dialogueId !== TOLL_DIALOGUE_ID) return;
    this.dialogueClosed = true;
    if (this.sequenceMode === "tollDialogue") {
      this.sequenceMode = "awaitingCode";
      this.playAnimation("player-idle");
    }
  }

  getSubmittedCoinCount(values) {
    const submittedCoins = Number(values?.coins);
    if (!Number.isFinite(submittedCoins)) return null;
    return Math.max(0, Math.trunc(submittedCoins));
  }

  startPayTollSequence() {
    this.sequenceMode = "payToll";
    this.player.setVelocity(0, 0);
    this.playAnimation("player-idle");
    this.resetTollCounter();

    this.playTollCoinSequence(this.submittedCoinCount, () => {
      this.tollCollector.setTint(0x44ff88);
      this.time.delayedCall(450, () => {
        this.tollCollector.clearTint();
        this.startBoardingSequence();
      });
    });
  }

  startRejectedTollSequence(coinCount) {
    this.sequenceMode = "payToll";
    this.player.setVelocity(0, 0);
    this.playAnimation("player-idle");
    this.resetTollCounter();

    this.playTollCoinSequence(coinCount, () => {
      this.tollCollector.setTint(0xff4444);
      this.time.delayedCall(450, () => {
        this.tollCollector.clearTint();
        this.startFailureSequence();
      });
    });
  }

  playTollCoinSequence(coinCount, onComplete) {
    const visibleCoinCount = Phaser.Math.Clamp(
      Number.isFinite(coinCount) ? Math.trunc(coinCount) : DEFAULT_TOLL_COIN_COUNT,
      0,
      MAX_VISIBLE_TOLL_COINS
    );

    if (visibleCoinCount <= 0) {
      onComplete?.();
      return;
    }

    const coinSprites = [];
    let dropped = 0;
    const startX = this.player.x + 12;
    const startY = this.player.y - 34;
    const landingCenterX = (this.player.x + this.tollCollector.x) / 2 + 8;
    const landingY = this.tollPoint.y - 10;

    for (let i = 0; i < visibleCoinCount; i++) {
      this.time.delayedCall(i * 45, () => {
        const landingX = landingCenterX + (Math.random() * 74 - 37);
        const peakX = (startX + landingX) / 2 + (Math.random() * 24 - 12);
        const peakY = startY - 58 - Math.random() * 20;
        const coin = this.add
          .sprite(startX, startY, "gold_coins")
          .setScale(1)
          .setDepth(5);

        coin.play(COIN_ANIMATION_KEY);
        coinSprites.push(coin);

        this.tweens.add({
          targets: coin,
          x: peakX,
          y: peakY,
          duration: 180,
          ease: "Sine.easeOut",
          onComplete: () => {
            this.tweens.add({
              targets: coin,
              x: landingX,
              y: landingY,
              duration: 300,
              ease: "Bounce.easeOut",
              onComplete: () => {
                dropped++;
                if (dropped === visibleCoinCount) {
                  this.time.delayedCall(350, () =>
                    this.collectTollCoins(coinSprites, onComplete)
                  );
                }
              },
            });
          },
        });
      });
    }
  }

  collectTollCoins(coins, onComplete) {
    if (!coins.length) {
      onComplete?.();
      return;
    }

    let collected = 0;
    coins.forEach((coin, i) => {
      this.time.delayedCall(i * 30, () => {
        this.tweens.add({
          targets: coin,
          x: this.tollCollector.x,
          y: this.tollCollector.y - NPC_FRAME_SIZE * NPC_SCALE * 0.45,
          scaleX: 0,
          scaleY: 0,
          duration: 260,
          ease: "Sine.easeIn",
          onComplete: () => {
            coin.destroy();
            this.decrementTollCounter();
            collected++;
            if (collected === coins.length) {
              onComplete?.();
            }
          },
        });
      });
    });
  }

  resetTollCounter() {
    this.remainingTollCoins = DEFAULT_TOLL_COIN_COUNT;
    this.updateTollCounterText();
  }

  decrementTollCounter() {
    this.remainingTollCoins = Math.max(0, (this.remainingTollCoins ?? 0) - 1);
    this.updateTollCounterText();
  }

  updateTollCounterText() {
    const count = Math.max(0, this.remainingTollCoins ?? DEFAULT_TOLL_COIN_COUNT);
    this.tollCoinsText?.setText(`${count} COINS`);
  }

  startBoardingSequence() {
    this.sequenceMode = "boarding";
    const riderPosition = this.getBoatRiderPosition();

    this.tweens.killTweensOf(this.player);
    this.player.setVelocity(0, 0);
    this.player.setGravityY(0);
    this.player.body.enable = false;
    this.player.setFlipX(false);
    this.playAnimation("player-run");

    this.tweens.add({
      targets: this.player,
      x: riderPosition.x,
      y: riderPosition.y,
      duration: BOAT_BOARD_DURATION_MS,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.player.setPosition(riderPosition.x, riderPosition.y);
        this.playAnimation("player-idle");
        this.time.delayedCall(200, () => this.startCrossingSequence());
      },
    });
  }

  startCrossingSequence() {
    this.sequenceMode = "crossing";
    this.playAnimation("player-idle");

    this.tweens.add({
      targets: this.boat,
      x: this.boatExitPoint.x,
      duration: BOAT_CROSS_DURATION_MS,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        this.player.setPosition(
          this.boat.x + PLAYER_BOAT_OFFSET_X,
          this.boat.y + PLAYER_BOAT_OFFSET_Y
        );
      },
      onComplete: () => this.startDisembarkSequence(),
    });
  }

  getBoatRiderPosition() {
    return {
      x: this.boat.x + PLAYER_BOAT_OFFSET_X,
      y: this.boat.y + PLAYER_BOAT_OFFSET_Y,
    };
  }

  startDisembarkSequence() {
    this.sequenceMode = "disembarking";
    this.player.body.enable = false;
    this.player.setGravityY(0);
    this.player.setVelocity(0, 0);
    this.player.setFlipX(false);
    this.player.setPosition(this.disembarkPoint.x, this.disembarkPoint.y);
    this.playAnimation("player-run");

    this.time.delayedCall(200, () => {
      this.startExitRunSequence();
    });
  }

  startExitRunSequence() {
    this.sequenceMode = "walkToExit";
    const distance = Math.max(0, this.exitWalkTargetX - this.player.x);
    const duration = Math.max(300, (distance / PLAYER_WALK_SPEED) * 1000);

    this.tweens.add({
      targets: this.player,
      x: this.exitWalkTargetX,
      y: this.disembarkPoint.y,
      duration,
      ease: "Linear",
      onComplete: () => {
        this.sequenceMode = "success";
        this.player.setVelocity(0, 0);
        this.playAnimation("player-idle");
        this.finishSuccessSequence();
      },
    });
  }

  startFailureSequence() {
    this.sequenceMode = "awaitingCode";
    this.player.setVelocity(0, 0);
    this.playAnimation("player-idle");

    this.tollCollector.setTint(0xff4444);
    this.time.delayedCall(400, () => this.tollCollector.clearTint());

    this.failureTimer = this.time.delayedCall(NON_FATAL_FAILURE_DELAY_MS, () => {
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message: this.failureMessage,
      });
    });
  }

  finishSuccessSequence() {
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: "Toll paid. River crossed. Level 4 cleared.",
      shouldProceed: true,
    });
  }

  onPlayerAnimationComplete() {}

  createPlayerAnimations() {
    PLAYER_ANIMATIONS.forEach(({ key, start, end, frameRate, repeat }) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("player_sheet_blue", { start, end }),
        frameRate,
        repeat,
      });
    });
  }

  createNpcAnimation() {
    if (this.anims.exists(NPC_IDLE_ANIMATION_KEY)) return;
    this.anims.create({
      key: NPC_IDLE_ANIMATION_KEY,
      frames: this.anims.generateFrameNumbers("npc_idle_l4", { start: 0, end: 4 }),
      frameRate: 6,
      repeat: -1,
    });
  }

  createCoinAnimation() {
    if (this.anims.exists(COIN_ANIMATION_KEY)) return;
    this.anims.create({
      key: COIN_ANIMATION_KEY,
      frames: this.anims.generateFrameNumbers("gold_coins", { start: 0, end: 4 }),
      frameRate: 12,
      repeat: -1,
    });
  }

  createBoatAnimation() {
    if (this.anims.exists(BOAT_ANIMATION_KEY)) return;
    this.anims.create({
      key: BOAT_ANIMATION_KEY,
      frames: this.anims.generateFrameNumbers("l4_boat", { start: 0, end: 9 }),
      frameRate: 8,
      repeat: -1,
    });
  }

  playAnimation(key) {
    if (this.player?.anims?.currentAnim?.key !== key) {
      this.player?.play(key, true);
    }
  }

  clearFailureTimer() {
    if (this.failureTimer) {
      this.failureTimer.remove(false);
      this.failureTimer = null;
    }
  }

  cleanupScene() {
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.off(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.clearFailureTimer();
  }
}
