import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
  GAME_LEVEL_DIALOGUE_TRIGGERED,
  GAME_LEVEL_DIALOGUE_CLOSED,
} from "../gameEvents";

const PLAYER_SCALE = 2;
const PLAYER_GRAVITY = 1100;
const PLAYER_WALK_SPEED = 140;
const NPC_SCALE = 1.1;
const NPC_FRAME_SIZE = 96;
const NPC_IDLE_ANIMATION_KEY = "npc-idle";
const PORTAL_SCALE = 1.5;
const PORTAL_ANIMATION_KEY = "portal-spin";
const PORTAL_FRAME_WIDTH = 32;
const PORTAL_FRAME_HEIGHT = 32;
const LEVEL_NUMBER = 2;
const GOAL_PADDING = 96;
const TARGET_REACH_TOLERANCE_PX = 8;
const NPC_APPROACH_OFFSET_X = 72;
const INTRO_APPEAR_DURATION_MS = 520;
const INTRO_PORTAL_FADE_DURATION_MS = 360;
const NON_FATAL_FAILURE_DELAY_MS = 260;
const SUCCESS_HOLD_DELAY_MS = 420;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;

const ANIMATIONS = [
  { key: "player-idle", start: 0, end: 5, frameRate: 6, repeat: -1 },
  { key: "player-run", start: 16, end: 23, frameRate: 12, repeat: -1 },
  { key: "player-jump", start: 24, end: 31, frameRate: 10, repeat: -1 },
  { key: "player-death", start: 40, end: 47, frameRate: 10, repeat: 0 },
  { key: "player-downed", start: 48, end: 51, frameRate: 6, repeat: -1 },
];

export default class LevelTwoScene extends Phaser.Scene {
  constructor() {
    super("LevelTwoScene");
  }

  preload() {
    this.load.image("level2_bg", `${ASSET_BASE}/backgrounds/level1_bg.png`);
    this.load.image(
      "greenzone_tiles",
      `${ASSET_BASE}/tiles/greenzone_tileset.png`
    );
    this.load.image("decor_tiles", `${ASSET_BASE}/tiles/Objects.png`);
    this.load.tilemapTiledJSON(
      "level2",
      `${ASSET_BASE}/maps/level2.tmj?v=20260325-1`
    );

    this.load.spritesheet(
      "player_sheet_blue",
      `${ASSET_BASE}/characters/players/char_blue.png`,
      { frameWidth: 56, frameHeight: 56 }
    );
    this.load.spritesheet(
      "portal_sheet",
      `${ASSET_BASE}/tiles/Dimensional_Portal.png`,
      { frameWidth: PORTAL_FRAME_WIDTH, frameHeight: PORTAL_FRAME_HEIGHT }
    );
    this.load.spritesheet(
      "npc_idle_sheet",
      `${ASSET_BASE}/characters/npc/gatekeeper_Idle.png`,
      { frameWidth: NPC_FRAME_SIZE, frameHeight: NPC_FRAME_SIZE }
    );
  }

  create() {
    this.normalizeMapData();

    const map = this.make.tilemap({ key: "level2" });
    const camera = this.cameras.main;

    const bg = this.add
      .image(0, 0, "level2_bg")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-10);
    bg.setDisplaySize(camera.width, camera.height);

    const greenzoneTileset = map.addTilesetImage(
      "greenzone_tileset",
      "greenzone_tiles"
    );
    const decorTileset = map.addTilesetImage("Objects", "decor_tiles");
    const validTilesets = [greenzoneTileset, decorTileset].filter(Boolean);
    const offsetY = this.scale.height - map.heightInPixels;
    const layersByName = {};

    const tileLayerNames = map.layers.map((layerData) => layerData.name);

    map.layers.forEach((layerData) => {
      const layerName = layerData.name;
      const layer = map.createLayer(layerName, validTilesets, 0, offsetY);
      if (!layer) {
        return;
      }

      layersByName[layerName] = layer;

      if (layerName === "Decor_Back") layer.setDepth(-1);
      if (
        layerName === "Ground" ||
        layerName === "Platform" ||
        layerName === "Platforms"
      ) {
        layer.setDepth(0);
      }
      if (layerName === "Decor_Front") layer.setDepth(2);
    });

    if (tileLayerNames.length === 0) {
      console.warn("[LevelTwoScene] No tile layers found in level2.tmj.");
    }

    camera.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);
    camera.scrollY = offsetY;
    this.physics.world.setBounds(
      0,
      offsetY,
      map.widthInPixels,
      map.heightInPixels
    );

    this.spawnPoint = this.resolveObjectPoint(map, offsetY, "player_spawn", {
      x: 160,
      y: offsetY + map.heightInPixels - 50,
    });
    this.portalPoint = this.resolveObjectPoint(map, offsetY, "portal_spawn", {
      x: 120,
      y: this.spawnPoint.y,
    });
    this.npcPoint = this.resolveObjectPoint(map, offsetY, "npc_spawn", {
      x: map.widthInPixels - GOAL_PADDING,
      y: this.spawnPoint.y,
    });

    this.createPlayerAnimations();
    this.createPortalAnimations();
    this.createNpcAnimations();

    this.player = this.physics.add.sprite(
      this.portalPoint.x,
      this.portalPoint.y,
      "player_sheet_blue"
    );
    this.player.setOrigin(0.5, 1);
    this.player.setScale(PLAYER_SCALE * 0.25);
    this.player.setDepth(1);
    this.player.setCollideWorldBounds(true);
    this.player.setGravityY(0);
    this.player.setAlpha(0);

    this.portal = this.add.sprite(
      this.portalPoint.x,
      this.portalPoint.y,
      "portal_sheet"
    );
    this.portal.setOrigin(0.5, 1);
    this.portal.setScale(PORTAL_SCALE);
    this.portal.setDepth(1.8);
    this.portal.play(PORTAL_ANIMATION_KEY);

    this.npc = this.add.sprite(this.npcPoint.x, this.npcPoint.y, "npc_idle_sheet");
    this.npc.setOrigin(0.5, 1);
    this.npc.setScale(NPC_SCALE);
    this.npc.setDepth(1);
    this.npc.play(NPC_IDLE_ANIMATION_KEY);

    ["Ground", "Platforms", "Platform"].forEach((layerName) => {
      const layer = layersByName[layerName];
      if (!layer) return;
      layer.setCollisionByExclusion([-1], true);
      this.physics.add.collider(this.player, layer);
    });

    camera.startFollow(this.player, true, 0.12, 0.12);

    this.sequenceMode = "intro";
    this.isDead = false;
    this.isDowned = false;
    this.failureTimer = null;
    this.introComplete = false;
    this.dialogueRequested = false;
    this.dialogueClosed = false;
    this.successTargetX = this.npcPoint.x;
    this.approachTargetX = this.npcPoint.x - NPC_APPROACH_OFFSET_X;
    this.failureMessage = "You failed. Declare the exact variable for this level.";
    this.pendingEvaluation = null;

    this.player.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      this.onPlayerAnimationComplete,
      this
    );

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.on(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);

    this.playAnimation("player-idle");
    this.scale.resize(1024, 576);
    this.startIntroSequence();
  }

  normalizeMapData() {
    const mapCacheEntry = this.cache.tilemap.get("level2");
    const mapData = mapCacheEntry?.data;

    if (!mapData || !Array.isArray(mapData.tilesets) || !Array.isArray(mapData.layers)) {
      return;
    }

    const sortedTilesets = [...mapData.tilesets].sort((a, b) => {
      const aFirst = Number.isInteger(a?.firstgid) ? a.firstgid : Number.MAX_SAFE_INTEGER;
      const bFirst = Number.isInteger(b?.firstgid) ? b.firstgid : Number.MAX_SAFE_INTEGER;
      return aFirst - bFirst;
    });

    const sourcedRanges = sortedTilesets
      .filter(
        (tileset) =>
          Boolean(tileset?.source) &&
          Number.isInteger(tileset?.firstgid) &&
          tileset.firstgid > 1
      )
      .map((tileset) => ({
        first: tileset.firstgid,
        // external source entries commonly omit tilecount in TMJ; use open-ended upper bound.
        last: Number.MAX_SAFE_INTEGER,
        offset: tileset.firstgid - 1,
      }))
      .sort((a, b) => b.first - a.first);

    const canonicalByName = new Map();
    const duplicateRanges = [];
    const dedupedTilesets = [];

    for (const tileset of sortedTilesets) {
      const name = typeof tileset?.name === "string" ? tileset.name : "";
      const firstgid = Number.isInteger(tileset?.firstgid) ? tileset.firstgid : null;
      const tilecount = Number.isInteger(tileset?.tilecount) ? tileset.tilecount : null;

      if (!name || !firstgid) {
        dedupedTilesets.push(tileset);
        continue;
      }

      const existing = canonicalByName.get(name);
      if (!existing) {
        canonicalByName.set(name, {
          firstgid,
          tilecount,
        });
        dedupedTilesets.push(tileset);
        continue;
      }

      const duplicateFirst = firstgid;
      const duplicateLast = tilecount ? duplicateFirst + tilecount - 1 : Number.MAX_SAFE_INTEGER;
      const offset = duplicateFirst - existing.firstgid;

      duplicateRanges.push({
        first: duplicateFirst,
        last: duplicateLast,
        offset,
      });
    }

    const normalizeGid = (gid) => {
      if (!Number.isInteger(gid) || gid <= 0) {
        return gid;
      }

      for (const range of sourcedRanges) {
        if (gid >= range.first && gid <= range.last) {
          return gid - range.offset;
        }
      }

      for (const range of duplicateRanges) {
        if (gid >= range.first && gid <= range.last) {
          return gid - range.offset;
        }
      }

      return gid;
    };

    mapData.layers.forEach((layer) => {
      if (layer.type !== "tilelayer" || !Array.isArray(layer.data)) {
        return;
      }

      layer.data = layer.data.map(normalizeGid);
    });

    mapData.tilesets = dedupedTilesets.filter((tileset) => !tileset.source);
  }

  update() {
    if (!this.player || !this.player.body) return;

    const onGround =
      this.player.body.blocked.down || this.player.body.touching.down;

    if (this.sequenceMode === "intro") {
      this.player.setVelocityX(0);
      this.playAnimation("player-idle");
      return;
    }

    if (this.sequenceMode === "approachNpc") {
      const direction = this.approachTargetX >= this.player.x ? 1 : -1;
      this.player.setVelocityX(direction * PLAYER_WALK_SPEED);
      this.player.setFlipX(direction < 0);

      if (!onGround) {
        this.playAnimation("player-jump");
        return;
      }

      this.playAnimation("player-run");

      if (Math.abs(this.player.x - this.approachTargetX) <= TARGET_REACH_TOLERANCE_PX) {
        this.player.setVelocityX(0);
        this.player.x = this.approachTargetX;
        this.player.setFlipX(false);
        this.playAnimation("player-idle");
        this.sequenceMode = "awaitingCode";
        this.triggerNpcDialogue();
      }

      return;
    }

    if (this.sequenceMode === "awaitingCode") {
      this.player.setVelocityX(0);
      if (!onGround) {
        this.playAnimation("player-jump");
        return;
      }
      this.playAnimation("player-idle");
      return;
    }

    if (this.sequenceMode === "success") {
      const direction = this.successTargetX >= this.player.x ? 1 : -1;
      this.player.setVelocityX(direction * PLAYER_WALK_SPEED);
      this.player.setFlipX(direction < 0);

      if (!onGround) {
        this.playAnimation("player-jump");
        return;
      }

      this.playAnimation("player-run");

      if (Math.abs(this.player.x - this.successTargetX) <= TARGET_REACH_TOLERANCE_PX) {
        this.player.setVelocityX(0);
        this.player.x = this.successTargetX;
        this.player.setFlipX(false);
        this.playAnimation("player-idle");
        this.sequenceMode = "awaitingCode";

        this.time.delayedCall(SUCCESS_HOLD_DELAY_MS, () => {
          gameEvents.emit(GAME_LEVEL_OUTCOME, {
            levelNumber: LEVEL_NUMBER,
            status: "success",
            message: 'Correct. NPC accepted: "Kai". Level 2 cleared.',
            shouldProceed: true,
          });
        });
      }

      return;
    }

    if (this.sequenceMode === "failure" || this.isDead || this.isDowned) {
      this.player.setVelocityX(0);
      return;
    }

    this.player.setVelocityX(0);

    if (!onGround) {
      this.playAnimation("player-jump");
      return;
    }

    this.playAnimation("player-idle");
  }

  createPlayerAnimations() {
    ANIMATIONS.forEach(({ key, start, end, frameRate, repeat }) => {
      if (this.anims.exists(key)) return;

      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("player_sheet_blue", {
          start,
          end,
        }),
        frameRate,
        repeat,
      });
    });
  }

  createPortalAnimations() {
    if (this.anims.exists(PORTAL_ANIMATION_KEY)) return;

    this.anims.create({
      key: PORTAL_ANIMATION_KEY,
      frames: this.anims.generateFrameNumbers("portal_sheet", {
        start: 0,
        end: 5,
      }),
      frameRate: 10,
      repeat: -1,
    });
  }

  createNpcAnimations() {
    if (this.anims.exists(NPC_IDLE_ANIMATION_KEY)) return;

    this.anims.create({
      key: NPC_IDLE_ANIMATION_KEY,
      frames: this.anims.generateFrameNumbers("npc_idle_sheet", {
        start: 0,
        end: 4,
      }),
      frameRate: 6,
      repeat: -1,
    });
  }

  resolveObjectPoint(map, offsetY, objectName, fallbackPoint) {
    const objectLayer = map.getObjectLayer("Objects");
    if (!objectLayer) return fallbackPoint;

    const object = objectLayer.objects.find((item) => item.name === objectName);
    if (!object) return fallbackPoint;

    return {
      x: object.x,
      y: object.y + offsetY,
    };
  }

  startIntroSequence() {
    this.player.body.enable = false;
    this.player.setVelocity(0, 0);
    this.player.setGravityY(0);
    this.player.setPosition(this.portalPoint.x, this.portalPoint.y);
    this.player.setAlpha(0);
    this.player.setScale(PLAYER_SCALE * 0.25);

    this.tweens.add({
      targets: this.player,
      alpha: 1,
      scaleX: PLAYER_SCALE,
      scaleY: PLAYER_SCALE,
      duration: INTRO_APPEAR_DURATION_MS,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.finishIntroSequence();
      },
    });
  }

  finishIntroSequence() {
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y);
    this.player.body.enable = true;
    this.player.body.reset(this.spawnPoint.x, this.spawnPoint.y);
    this.player.setGravityY(PLAYER_GRAVITY);
    this.playAnimation("player-idle");

    if (this.portal) {
      this.tweens.add({
        targets: this.portal,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: INTRO_PORTAL_FADE_DURATION_MS,
        ease: "Sine.easeIn",
        onComplete: () => {
          this.portal?.destroy();
          this.portal = null;
        },
      });
    }

    this.sequenceMode = "approachNpc";
    this.introComplete = true;

    if (this.pendingEvaluation) {
      const pending = this.pendingEvaluation;
      this.pendingEvaluation = null;
      this.onCodeEvaluated(pending);
    }
  }

  playAnimation(key) {
    const currentKey = this.player.anims.currentAnim?.key;
    if (currentKey === key) return;
    this.player.play(key, true);
  }

  onCodeEvaluated(payload) {
    if (!payload || payload.levelNumber !== LEVEL_NUMBER) return;
    if (typeof payload.isCorrect !== "boolean") return;

    if (!this.introComplete) {
      this.pendingEvaluation = payload;
      return;
    }

    if (!this.dialogueClosed) {
      this.startFailureSequence(
        "Talk to the NPC first, then declare your name.",
        { useDeathAnimation: false }
      );
      return;
    }

    this.resetAttemptState();

    if (payload.isCorrect) {
      this.startSuccessSequence();
      return;
    }

    this.startFailureSequence(
      'Invalid code. Declare exactly: string myName = "Kai";'
    );
  }

  resetAttemptState() {
    if (this.failureTimer) {
      this.failureTimer.remove(false);
      this.failureTimer = null;
    }

    this.sequenceMode = "awaitingCode";
    this.isDead = false;
    this.isDowned = false;

    this.tweens.killTweensOf(this.player);
    if (this.portal) {
      this.tweens.killTweensOf(this.portal);
    }

    this.player.body.enable = true;
    this.player.setGravityY(PLAYER_GRAVITY);
    this.player.setVelocity(0, 0);
    this.player.setFlipX(false);
    this.player.setAlpha(1);
    this.player.setScale(PLAYER_SCALE);
    this.player.setPosition(this.approachTargetX, this.spawnPoint.y);
    this.player.body.reset(this.approachTargetX, this.spawnPoint.y);
    this.playAnimation("player-idle");
  }

  startSuccessSequence() {
    const minX = this.physics.world.bounds.x + 16;
    const maxX = this.physics.world.bounds.right - 16;

    this.sequenceMode = "success";
    this.successTargetX = Phaser.Math.Clamp(
      this.npcPoint.x - 18,
      minX,
      maxX
    );
    this.player.setGravityY(PLAYER_GRAVITY);
    this.playAnimation("player-run");
  }

  triggerNpcDialogue() {
    if (this.dialogueRequested) {
      return;
    }

    this.dialogueRequested = true;
    gameEvents.emit(GAME_LEVEL_DIALOGUE_TRIGGERED, {
      levelNumber: LEVEL_NUMBER,
    });
  }

  onDialogueClosed({ levelNumber }) {
    if (levelNumber !== LEVEL_NUMBER) {
      return;
    }

    this.dialogueClosed = true;
    if (this.sequenceMode !== "success" && this.sequenceMode !== "failure") {
      this.sequenceMode = "awaitingCode";
      this.playAnimation("player-idle");
    }
  }

  emitFailureOutcome() {
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "failure",
      message: this.failureMessage,
    });
  }

  startFailureSequence(message, { useDeathAnimation = true } = {}) {
    this.failureMessage = message ?? this.failureMessage;

    if (!useDeathAnimation) {
      this.sequenceMode = "awaitingCode";
      this.isDead = false;
      this.isDowned = false;
      this.player.setVelocity(0, 0);
      this.player.setGravityY(PLAYER_GRAVITY);
      this.playAnimation("player-idle");

      this.failureTimer = this.time.delayedCall(NON_FATAL_FAILURE_DELAY_MS, () => {
        this.emitFailureOutcome();
      });
      return;
    }

    this.sequenceMode = "failure";
    this.startDeath();
  }

  startDeath() {
    this.isDead = true;
    this.player.setVelocity(0, 0);
    this.player.play("player-death", true);
  }

  onPlayerAnimationComplete(animation) {
    if (animation.key === "player-death" && this.sequenceMode === "failure") {
      this.isDowned = true;
      this.player.setVelocity(0, 0);
      this.player.setGravityY(0);
      this.player.play("player-downed");

      this.failureTimer = this.time.delayedCall(450, () => {
        this.emitFailureOutcome();
      });
    }
  }

  cleanupScene() {
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.off(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);

    if (this.failureTimer) {
      this.failureTimer.remove(false);
      this.failureTimer = null;
    }
  }
}
