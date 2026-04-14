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
const CASTLE_TILE_FRAME_SIZE = 32;
const CASTLE_TILE_COUNT = 225;
const CASTLE_FRAME_COMPAT_OFFSET = 80;
const GATE_TOP_OFFSET_Y = 64;
const GATE_MIDDLE_OFFSET_Y = 32;
const GATE_BOTTOM_OFFSET_Y = 0;
const GATE_COLUMN_OFFSET_X = 16;
const GATE_SPRITE_DEPTH = 0.75;
const GATE_ANIMATION_STEP_MS = 150;
const GATE_STAIR_APPROACH_OFFSET_X = 120;
const GATE_ENTRY_OFFSET_X = 8;
const GATE_ENTRY_OFFSET_Y = 0;
const GATE_ENTRY_NUDGE_X = 4;
const GATE_ENTRY_NUDGE_Y = 4;
const GATE_MIN_RUN_SEGMENT_MS = 260;
const GATE_ENTER_DURATION_MS = 420;
const GATE_FRAME_SEQUENCE = [
  {
    left: { top: 176, middle: 191, bottom: 286 },
    right: { top: 177, middle: 192, bottom: 287 },
  }, // closed gate
  {
    left: { top: 174, middle: 189, bottom: 284 },
    right: { top: 175, middle: 190, bottom: 285 },
  }, // open gate
];
const LEVEL_NUMBER = 2;
const GOAL_PADDING = 96;
const TARGET_REACH_TOLERANCE_PX = 8;
const NPC_APPROACH_OFFSET_X = 72;
const INTRO_APPEAR_DURATION_MS = 520;
const INTRO_PORTAL_FADE_DURATION_MS = 360;
const NON_FATAL_FAILURE_DELAY_MS = 260;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const INTRO_DIALOGUE_ID = "level2-intro";
const SUCCESS_DIALOGUE_ID = "level2-name-intro";

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

  //Note: No gate yet, hanap pa ng gate na asset para at ilagay sa map
  //Gate will open after Name is declared and when gatekeeper let character passed

  preload() {
    this.load.image("level2_bg", `${ASSET_BASE}/backgrounds/level1_bg.png`);
    this.load.image(
      "greenzone_tiles",
      `${ASSET_BASE}/tiles/greenzone_tileset.png`
    );
    this.load.image("decor_tiles", `${ASSET_BASE}/tiles/Objects.png`);
    this.load.image(
      "castle_tiles_grey",
      `${ASSET_BASE}/tiles/opp5_castle_tiles/opp5_castle_tiles/environment/tiles/castle/tile_castle_grey.png`
    );
    this.load.spritesheet(
      "castle_tiles_sheet",
      `${ASSET_BASE}/tiles/opp5_castle_tiles/opp5_castle_tiles/environment/tiles/castle/tile_castle_grey.png`,
      { frameWidth: CASTLE_TILE_FRAME_SIZE, frameHeight: CASTLE_TILE_FRAME_SIZE }
    );
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
    const castleTileset = map.addTilesetImage(
      "tile_castle_grey",
      "castle_tiles_grey"
    );
    const validTilesets = [greenzoneTileset, decorTileset, castleTileset].filter(Boolean);
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
    this.gatePoint = this.resolveObjectPoint(map, offsetY, "level2_Gate", {
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

    this.createLevelGate();

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
    this.awaitingSuccessDialogueClose = false;
    this.introducedName = "Kai";
    this.successTargetX = this.npcPoint.x;
    this.approachTargetX = this.npcPoint.x - NPC_APPROACH_OFFSET_X;
    this.failureMessage = "You failed. Declare the exact variable for this level.";
    this.pendingEvaluation = null;
    this.gateState = "closed";
    this.gateAnimationEvent = null;

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
      .map((tileset, index) => {
        if (
          !tileset?.source ||
          !Number.isInteger(tileset?.firstgid) ||
          tileset.firstgid <= 1
        ) {
          return null;
        }

        // External TSX refs can omit tilecount in TMJ.
        // Clamp remap range to the next tileset start so we don't rewrite unrelated gids.
        const nextTileset = sortedTilesets.find(
          (candidate, candidateIndex) =>
            candidateIndex > index &&
            Number.isInteger(candidate?.firstgid) &&
            candidate.firstgid > tileset.firstgid
        );
        const nextFirstGid = Number.isInteger(nextTileset?.firstgid)
          ? nextTileset.firstgid
          : null;
        const rangeLast =
          Number.isInteger(nextFirstGid) && nextFirstGid > tileset.firstgid
            ? nextFirstGid - 1
            : tileset.firstgid;

        return {
          first: tileset.firstgid,
          last: rangeLast,
          offset: tileset.firstgid - 1,
        };
      })
      .filter(Boolean)
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
      const duplicateTilecount =
        tilecount ?? existing.tilecount ?? 1;
      const duplicateLast = duplicateFirst + duplicateTilecount - 1;
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

    if (this.sequenceMode === "toGateScripted" || this.sequenceMode === "enterGate") {
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

  createLevelGate() {
    if (!this.gatePoint) {
      return;
    }

    const closedGateFrame = GATE_FRAME_SEQUENCE[0];
    const leftX = this.gatePoint.x - GATE_COLUMN_OFFSET_X;
    const rightX = this.gatePoint.x + GATE_COLUMN_OFFSET_X;

    this.gateTopLeft = this.add
      .sprite(
        leftX,
        this.gatePoint.y - GATE_TOP_OFFSET_Y,
        "castle_tiles_sheet",
        this.toCastleTilesFrame(closedGateFrame.left.top)
      )
      .setOrigin(0.5, 1)
      .setDepth(GATE_SPRITE_DEPTH);

    this.gateMiddleLeft = this.add
      .sprite(
        leftX,
        this.gatePoint.y - GATE_MIDDLE_OFFSET_Y,
        "castle_tiles_sheet",
        this.toCastleTilesFrame(closedGateFrame.left.middle)
      )
      .setOrigin(0.5, 1)
      .setDepth(GATE_SPRITE_DEPTH);

    this.gateBottomLeft = this.add
      .sprite(
        leftX,
        this.gatePoint.y + GATE_BOTTOM_OFFSET_Y,
        "castle_tiles_sheet",
        this.toCastleTilesFrame(closedGateFrame.left.bottom)
      )
      .setOrigin(0.5, 1)
      .setDepth(GATE_SPRITE_DEPTH);

    this.gateTopRight = this.add
      .sprite(
        rightX,
        this.gatePoint.y - GATE_TOP_OFFSET_Y,
        "castle_tiles_sheet",
        this.toCastleTilesFrame(closedGateFrame.right.top)
      )
      .setOrigin(0.5, 1)
      .setDepth(GATE_SPRITE_DEPTH);

    this.gateMiddleRight = this.add
      .sprite(
        rightX,
        this.gatePoint.y - GATE_MIDDLE_OFFSET_Y,
        "castle_tiles_sheet",
        this.toCastleTilesFrame(closedGateFrame.right.middle)
      )
      .setOrigin(0.5, 1)
      .setDepth(GATE_SPRITE_DEPTH);

    this.gateBottomRight = this.add
      .sprite(
        rightX,
        this.gatePoint.y + GATE_BOTTOM_OFFSET_Y,
        "castle_tiles_sheet",
        this.toCastleTilesFrame(closedGateFrame.right.bottom)
      )
      .setOrigin(0.5, 1)
      .setDepth(GATE_SPRITE_DEPTH);
  }

  toCastleTilesFrame(frameId) {
    if (!Number.isFinite(Number(frameId))) {
      return 0;
    }

    let frame = Math.trunc(Number(frameId));

    // Compatibility: some provided IDs are offset by +80 for this atlas.
    if (
      frame >= CASTLE_TILE_COUNT &&
      frame - CASTLE_FRAME_COMPAT_OFFSET >= 0 &&
      frame - CASTLE_FRAME_COMPAT_OFFSET < CASTLE_TILE_COUNT
    ) {
      frame -= CASTLE_FRAME_COMPAT_OFFSET;
    }

    if (frame < 0) {
      return 0;
    }

    if (frame >= CASTLE_TILE_COUNT) {
      return CASTLE_TILE_COUNT - 1;
    }

    return frame;
  }

  getGateSprites() {
    return [
      this.gateTopLeft,
      this.gateMiddleLeft,
      this.gateBottomLeft,
      this.gateTopRight,
      this.gateMiddleRight,
      this.gateBottomRight,
    ].filter(Boolean);
  }

  setGateFrameSet(frameSet) {
    if (!frameSet) {
      return;
    }

    if (this.gateTopLeft) {
      this.gateTopLeft.setFrame(this.toCastleTilesFrame(frameSet.left.top));
    }

    if (this.gateMiddleLeft) {
      this.gateMiddleLeft.setFrame(this.toCastleTilesFrame(frameSet.left.middle));
    }

    if (this.gateBottomLeft) {
      this.gateBottomLeft.setFrame(this.toCastleTilesFrame(frameSet.left.bottom));
    }

    if (this.gateTopRight) {
      this.gateTopRight.setFrame(this.toCastleTilesFrame(frameSet.right.top));
    }

    if (this.gateMiddleRight) {
      this.gateMiddleRight.setFrame(this.toCastleTilesFrame(frameSet.right.middle));
    }

    if (this.gateBottomRight) {
      this.gateBottomRight.setFrame(this.toCastleTilesFrame(frameSet.right.bottom));
    }
  }

  playGateOpenAnimation(onComplete) {
    if (this.gateState === "open") {
      onComplete?.();
      return;
    }

    if (this.gateState === "opening") {
      return;
    }

    this.gateState = "opening";
    this.setGateFrameSet(GATE_FRAME_SEQUENCE[0]);

    this.gateAnimationEvent = this.time.delayedCall(GATE_ANIMATION_STEP_MS, () => {
      this.setGateFrameSet(GATE_FRAME_SEQUENCE[1]);
      this.gateState = "open";
      this.gateAnimationEvent = null;
      onComplete?.();
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
      const introducedName = payload?.goalValues?.myName ?? "Kai";
      this.startSuccessSequence(introducedName);
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

  startSuccessSequence(introducedName) {
    this.sequenceMode = "awaitingSuccessDialogue";
    this.awaitingSuccessDialogueClose = false;
    this.introducedName = introducedName || "Kai";
    this.player.setVelocityX(0);
    this.player.setFlipX(false);
    this.player.setGravityY(PLAYER_GRAVITY);
    this.playAnimation("player-idle");
    this.triggerSuccessDialogue();
  }

  startRunToGateSequence() {
    if (!this.gatePoint) {
      this.finishSuccessSequence();
      return;
    }

    const minX = this.physics.world.bounds.x + 16;
    const maxX = this.physics.world.bounds.right - 16;
    const stairApproachX = Phaser.Math.Clamp(
      this.gatePoint.x - GATE_STAIR_APPROACH_OFFSET_X,
      minX,
      maxX
    );
    const gateEntryX = Phaser.Math.Clamp(
      this.gatePoint.x + GATE_ENTRY_OFFSET_X,
      minX,
      maxX
    );
    const gateEntryY = this.gatePoint.y + GATE_ENTRY_OFFSET_Y;

    this.sequenceMode = "toGateScripted";
    this.tweens.killTweensOf(this.player);
    this.player.setVelocity(0, 0);
    this.player.setFlipX(false);
    this.player.setGravityY(0);
    this.player.body.enable = false;
    this.playAnimation("player-run");

    const firstLegDistance = Math.abs(stairApproachX - this.player.x);
    const firstLegDuration = Math.max(
      GATE_MIN_RUN_SEGMENT_MS,
      Math.round((firstLegDistance / PLAYER_WALK_SPEED) * 1000)
    );

    this.tweens.add({
      targets: this.player,
      x: stairApproachX,
      y: this.spawnPoint.y,
      duration: firstLegDuration,
      ease: "Linear",
      onComplete: () => {
        const secondLegDistance = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          gateEntryX,
          gateEntryY
        );
        const secondLegDuration = Math.max(
          GATE_MIN_RUN_SEGMENT_MS,
          Math.round((secondLegDistance / PLAYER_WALK_SPEED) * 1000)
        );

        this.playAnimation("player-run");
        this.tweens.add({
          targets: this.player,
          x: gateEntryX,
          y: gateEntryY,
          duration: secondLegDuration,
          ease: "Linear",
          onComplete: () => {
            this.startGateEnterSequence(gateEntryX, gateEntryY);
          },
        });
      },
    });
  }

  startGateEnterSequence(gateEntryX, gateEntryY) {
    this.sequenceMode = "enterGate";
    this.player.setVelocity(0, 0);
    this.playAnimation("player-idle");

    this.tweens.add({
      targets: this.player,
      x: gateEntryX + GATE_ENTRY_NUDGE_X,
      y: gateEntryY + GATE_ENTRY_NUDGE_Y,
      alpha: 0,
      scaleX: PLAYER_SCALE * 0.18,
      scaleY: PLAYER_SCALE * 0.18,
      duration: GATE_ENTER_DURATION_MS,
      ease: "Sine.easeIn",
      onComplete: () => this.finishSuccessSequence(),
    });
  }

  finishSuccessSequence() {
    if (this.sequenceMode === "levelCleared") {
      return;
    }

    this.sequenceMode = "levelCleared";
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: `Correct. "${this.introducedName}" identified. Gate opened. Level 2 cleared.`,
      shouldProceed: true,
    });
  }

  triggerNpcDialogue() {
    if (this.dialogueRequested) {
      return;
    }

    this.dialogueRequested = true;
    gameEvents.emit(GAME_LEVEL_DIALOGUE_TRIGGERED, {
      levelNumber: LEVEL_NUMBER,
      dialogueId: INTRO_DIALOGUE_ID,
    });
  }

  triggerSuccessDialogue() {
    if (this.awaitingSuccessDialogueClose) {
      return;
    }

    const safeName = `${this.introducedName ?? "Kai"}`.trim() || "Kai";
    this.awaitingSuccessDialogueClose = true;

    gameEvents.emit(GAME_LEVEL_DIALOGUE_TRIGGERED, {
      levelNumber: LEVEL_NUMBER,
      dialogueId: SUCCESS_DIALOGUE_ID,
      dialogueSteps: [
        {
          speaker: "King Kai",
          portraitImage: "portrait_player_main.png",
          portraitAlt: "King Kai portrait",
          lines: [
            { text: `My name is ${safeName}.`, tone: "normal" },
            { text: "I am ready for the next challenge.", tone: "accent" },
          ],
        },
        {
          speaker: "Gatekeeper",
          portraitImage: "gatekeeper_portrait.png",
          portraitAlt: "Gatekeeper portrait",
          lines: [
            { text: `Welcome, ${safeName}. You may pass.`, tone: "normal" },
          ],
        },
      ],
    });
  }

  onDialogueClosed({ levelNumber, dialogueId } = {}) {
    if (levelNumber !== LEVEL_NUMBER) {
      return;
    }

    if (dialogueId === SUCCESS_DIALOGUE_ID && this.awaitingSuccessDialogueClose) {
      this.awaitingSuccessDialogueClose = false;
      this.playGateOpenAnimation(() => {
        this.startRunToGateSequence();
      });
      return;
    }

    if (dialogueId !== INTRO_DIALOGUE_ID && dialogueId !== null) {
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

    if (this.gateAnimationEvent) {
      this.gateAnimationEvent.remove(false);
      this.gateAnimationEvent = null;
    }
  }
}
