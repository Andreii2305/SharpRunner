import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
  GAME_LEVEL_DIALOGUE_TRIGGERED,
  GAME_LEVEL_DIALOGUE_CLOSED,
} from "../gameEvents";

const LEVEL_NUMBER = 3;
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
const INTRO_APPEAR_DURATION_MS = 520;
const INTRO_PORTAL_FADE_DURATION_MS = 360;
const TARGET_REACH_TOLERANCE_PX = 8;
const NPC_APPROACH_OFFSET_X = 72;
const NPC_AREA_APPROACH_OFFSET_X = 80;
const POST_COIN_EXIT_MARGIN_X = 80;
const NON_FATAL_FAILURE_DELAY_MS = 260;
const UNFREEZE_STEP_DELAY_MS = 700;
const UNFREEZE_TWEEN_DURATION_MS = 500;
const FROZEN_TINT = 0x88aaff;
const VILLAGER_SCALE = 1.5;
const GATE_FRAME_SEQUENCE = [
  {
    left: { top: 176, middle: 191, bottom: 286 },
    right: { top: 177, middle: 192, bottom: 287 },
  },
  {
    left: { top: 174, middle: 189, bottom: 284 },
    right: { top: 175, middle: 190, bottom: 285 },
  },
];
const GATEKEEPER_DIALOGUE_ID = "level3-gatekeeper";
const VILLAGER_THANKS_DIALOGUE_ID = "level3-villager-thanks";
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_ASSET_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const GH_BG_BASE = `${GH_ASSET_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const CHAR_PACK_BASE = `${ASSET_BASE}/characters/gandalfChar/gandalfHardcoreCharacterAssetPack`;
const CHAR_F_CLOTH_BASE = `${ASSET_BASE}/characters/gandalfChar/gandalfHardcore43xFemaleClothing`;
const LAYERED_VILLAGER_DEFS = [
  {
    layers: [
      { key: "vl0_skin",  path: `${CHAR_PACK_BASE}/characterSkinColors/femaleSkin1.png`, animKey: "vl0-skin-idle"  },
      { key: "vl0_dress", path: `${CHAR_F_CLOTH_BASE}/longDressBlue.png`,                animKey: "vl0-dress-idle" },
      { key: "vl0_hair",  path: `${CHAR_PACK_BASE}/femaleHair/femaleHair2.png`,          animKey: "vl0-hair-idle"  },
    ],
  },
  {
    layers: [
      { key: "vl1_skin",  path: `${CHAR_PACK_BASE}/characterSkinColors/maleSkin2.png`,  animKey: "vl1-skin-idle"  },
      { key: "vl1_shirt", path: `${CHAR_PACK_BASE}/maleClothing/greenShirtV2.png`,      animKey: "vl1-shirt-idle" },
      { key: "vl1_pants", path: `${CHAR_PACK_BASE}/maleClothing/greenPants.png`,        animKey: "vl1-pants-idle" },
      { key: "vl1_hair",  path: `${CHAR_PACK_BASE}/maleHair/maleHair3.png`,             animKey: "vl1-hair-idle"  },
    ],
  },
  {
    layers: [
      { key: "vl2_skin",  path: `${CHAR_PACK_BASE}/characterSkinColors/femaleSkin3.png`, animKey: "vl2-skin-idle"  },
      { key: "vl2_dress", path: `${CHAR_F_CLOTH_BASE}/longDressPurple.png`,              animKey: "vl2-dress-idle" },
      { key: "vl2_hair",  path: `${CHAR_PACK_BASE}/femaleHair/femaleHair4.png`,          animKey: "vl2-hair-idle"  },
    ],
  },
];

const PLAYER_ANIMATIONS = [
  { key: "player-idle", start: 0, end: 5, frameRate: 6, repeat: -1 },
  { key: "player-run", start: 16, end: 23, frameRate: 12, repeat: -1 },
  { key: "player-jump", start: 24, end: 31, frameRate: 10, repeat: -1 },
  { key: "player-death", start: 40, end: 47, frameRate: 10, repeat: 0 },
  { key: "player-downed", start: 48, end: 51, frameRate: 6, repeat: -1 },
];

export default class LevelThreeScene extends Phaser.Scene {
  constructor() {
    super("LevelThreeScene");
  }

  preload() {
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
    this.load.image(
      "castle_tiles_grey",
      `${ASSET_BASE}/tiles/opp5_castle_tiles/opp5_castle_tiles/environment/tiles/castle/tile_castle_grey.png`
    );
    this.load.spritesheet(
      "castle_tiles_sheet",
      `${ASSET_BASE}/tiles/opp5_castle_tiles/opp5_castle_tiles/environment/tiles/castle/tile_castle_grey.png`,
      { frameWidth: CASTLE_TILE_FRAME_SIZE, frameHeight: CASTLE_TILE_FRAME_SIZE }
    );
    this.load.image("l3_floor_tiles2", `${GH_ASSET_BASE}/Floor_Tiles2.png`);
    this.load.image("l3_other_tiles2", `${GH_ASSET_BASE}/Other_Tiles2.png`);
    this.load.image("l3_bg_dirt2", `${GH_ASSET_BASE}/BG_Dirt2.png`);
    this.load.image("l3_decor_tiles", `${GH_ASSET_BASE}/Decor.png`);
    this.load.image("l3_willow", `${GH_ASSET_BASE}/Weeping_Willow1.png`);
    this.load.image("l3_pine_trees", `${GH_ASSET_BASE}/Pine_Trees.png`);
    this.load.image("greenzone_tiles", `${ASSET_BASE}/tiles/greenzone_tileset.png`);
    this.load.tilemapTiledJSON("level3", `${ASSET_BASE}/maps/level3.tmj`);
    this.load.spritesheet(
      "gold_coins",
      `${ASSET_BASE}/other/Coin_Gems/goldCoins.png`,
      { frameWidth: 16, frameHeight: 16 }
    );
    this.load.image(
      "l3_bg5",
      `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`
    );
    this.load.image("l3_bg_castle", `${GH_BG_BASE}/Background_Castle.png`);
    this.load.image(
      "l3_bg4",
      `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`
    );
    this.load.image(
      "l3_bg3",
      `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`
    );
    this.load.image(
      "l3_bg2",
      `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`
    );
    this.load.image(
      "l3_bg1",
      `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`
    );
    LAYERED_VILLAGER_DEFS.forEach((charDef) => {
      charDef.layers.forEach(({ key, path }) => {
        this.load.spritesheet(key, path, { frameWidth: 80, frameHeight: 64 });
      });
    });
  }

  create() {
    this.scale.resize(1024, 576);

    this.normalizeMapData();

    const map = this.make.tilemap({ key: "level3" });
    const camera = this.cameras.main;

    this.createParallaxBackgrounds();

    const castleTileset = map.addTilesetImage("tile_castle_grey", "castle_tiles_grey");
    const floorTiles2 = map.addTilesetImage("Floor Tiles2", "l3_floor_tiles2");
    const otherTiles2 = map.addTilesetImage("Other Tiles2", "l3_other_tiles2");
    const bgDirt2 = map.addTilesetImage("BG Dirt2", "l3_bg_dirt2");
    const greenzoneTileset = map.addTilesetImage("greenzone_tileset", "greenzone_tiles");
    const decorTileset = map.addTilesetImage("Decor", "l3_decor_tiles");
    const willowTileset = map.addTilesetImage("Weeping Willow1", "l3_willow");
    const pineTileset = map.addTilesetImage("Pine Trees", "l3_pine_trees");

    const validTilesets = [
      castleTileset,
      floorTiles2,
      otherTiles2,
      bgDirt2,
      greenzoneTileset,
      decorTileset,
      willowTileset,
      pineTileset,
    ].filter(Boolean);

    const offsetY = this.scale.height - map.heightInPixels;

    const layerDepths = {
      Ground: -1,
      Platform_back: 0,
      Castle_back: 0,
      Castle: 0,
      Platform: 0,
      Castle_decor: 1,
      Decor: 1,
      Trees: 1,
    };

    const layersByName = {};
    map.layers.forEach((layerData) => {
      const layer = map.createLayer(layerData.name, validTilesets, 0, offsetY);
      if (!layer) return;
      layersByName[layerData.name] = layer;
      layer.setDepth(layerDepths[layerData.name] ?? 0);
    });

    camera.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);
    this.physics.world.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);
    this.postCoinExitTargetX = map.widthInPixels - POST_COIN_EXIT_MARGIN_X;

    // Floor surface in world coordinates (Platform layer row 14).
    const tileH = map.tileHeight || 32;
    const floorSurfaceY = offsetY + 14 * tileH;

    const fallbackSpawn = { x: 200, y: floorSurfaceY };
    this.spawnPoint = this.resolveObjectPoint(map, offsetY, "player_spawn", fallbackSpawn);
    // Clamp spawn to floor surface so the player doesn't appear inside tiles.
    this.spawnPoint.y = Math.min(this.spawnPoint.y, floorSurfaceY);

    this.gatePoint = this.resolveObjectPoint(map, offsetY, "level3_gate", {
      x: 110,
      y: floorSurfaceY,
    });
    // Clamp gate to floor surface so gate sprites aren't embedded in the ground.
    this.gatePoint.y = Math.min(this.gatePoint.y, floorSurfaceY);

    this.gatekeeperPoint = this.resolveObjectPoint(
      map,
      offsetY,
      "gatekeeper_spawn",
      { x: 760, y: floorSurfaceY }
    );

    this.coinDropPoint = this.resolveObjectPoint(map, offsetY, "coin_drops", null);

    const rawNpcPoints = ["npc1", "npc3", "npc2"]
      .map((name) => this.resolveObjectPointTrimmed(map, offsetY, name, null))
      .filter(Boolean);
    rawNpcPoints.sort((a, b) => a.x - b.x);
    this.frozenNpcPoints =
      rawNpcPoints.length >= 3
        ? rawNpcPoints
        : [
            { x: 1321, y: floorSurfaceY },
            { x: 1359, y: floorSurfaceY },
            { x: 1394, y: floorSurfaceY },
          ];

    const platformLayer = layersByName["Platform"];
    if (platformLayer) {
      platformLayer.setCollisionByExclusion([-1], true);
      // Arch/decorative tiles sit one row above the floor and must not be solid.
      platformLayer.setCollision([10, 50, 70, 181, 182, 183], false);
    }

    this.createPlayerAnimations();
    this.createNpcAnimations();
    this.createCoinAnimation();

    this.player = this.physics.add.sprite(
      this.gatePoint.x,
      this.gatePoint.y - 8,
      "player_sheet_blue"
    );
    this.player.setOrigin(0.5, 1).setScale(PLAYER_SCALE * 0.18).setDepth(1).setAlpha(0);
    this.player.setCollideWorldBounds(true).setGravityY(0);

    if (platformLayer) {
      this.physics.add.collider(this.player, platformLayer);
    }

    this.gatekeeper = this.add
      .sprite(this.gatekeeperPoint.x, this.gatekeeperPoint.y, "npc_idle_sheet")
      .setOrigin(0.5, 1)
      .setScale(NPC_SCALE)
      .setDepth(1)
      .setFlipX(true);
    this.gatekeeper.play(NPC_IDLE_ANIMATION_KEY);

    this.frozenNpcs = this.frozenNpcPoints.map((pt, i) => {
      const charDef = LAYERED_VILLAGER_DEFS[i % LAYERED_VILLAGER_DEFS.length];
      const flipX = i % 2 === 0;
      const sprites = charDef.layers.map(({ key, animKey }, layerIdx) => {
        const s = this.add
          .sprite(pt.x, pt.y, key)
          .setOrigin(0.5, 1)
          .setScale(VILLAGER_SCALE)
          .setDepth(1 + layerIdx * 0.01)
          .setTint(FROZEN_TINT)
          .setFrame(0);
        if (flipX) s.setFlipX(true);
        return { sprite: s, animKey };
      });
      return { sprites, x: pt.x, y: pt.y, displayH: 64 * VILLAGER_SCALE };
    });

    this.createLevelGate();
    camera.startFollow(this.player, true, 0.12, 0.12);

    this.sequenceMode = "intro";
    this.introComplete = false;
    this.isDead = false;
    this.isDowned = false;
    this.failureTimer = null;
    this.gateAnimationEvent = null;
    this.pendingEvaluation = null;
    this.dialogueClosed = false;
    this.voiceValues = null;
    this.unfreezeIndex = 0;
    this.gateState = "closed";
    this.failureMessage = "Invalid code. Check your string declarations.";
    this.approachTargetX = this.gatekeeperPoint.x - NPC_APPROACH_OFFSET_X;
    this.npcAreaTargetX =
      (this.frozenNpcPoints[0]?.x ?? 1321) - NPC_AREA_APPROACH_OFFSET_X;

    this.player.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      this.onPlayerAnimationComplete,
      this
    );
    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.on(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);

    this.playAnimation("player-idle");
    this.startIntroSequence();
  }

    createParallaxBackgrounds() {
    // Each image is 1024×346px. offsetY values come from the Tiled layer data
    // (bg_layer_05_distant was -64 on the old 50×20 map; after resize to 50×18
    // the map top is at y=0, so that layer now sits at 0).
    const BG_H = 346;
    const bgConfigs = [
      { key: "l3_bg5",       parallax: 0.1, depth: -9, offsetY:   0 },
      { key: "l3_bg_castle", parallax: 0.1, depth: -8, offsetY:  94, tileOffsetX: -478 },
      { key: "l3_bg4",       parallax: 0.1, depth: -7, offsetY: 132 },
      { key: "l3_bg3",       parallax: 0.4, depth: -6, offsetY: 168 },
      { key: "l3_bg2",       parallax: 0.7, depth: -5, offsetY: 202 },
      { key: "l3_bg1",       parallax: 0.9, depth: -4, offsetY: 234 },
    ];

    this.bgLayers = bgConfigs.map(({ key, parallax, depth, offsetY, tileOffsetX = 0 }) => {
      const sprite = this.add
        .tileSprite(0, offsetY, 1024, BG_H, key)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(depth);
      return { sprite, parallax, tileOffsetX };
    });
  }
  normalizeMapData() {
    const mapCacheEntry = this.cache.tilemap.get("level3");
    const mapData = mapCacheEntry?.data;
    if (
      !mapData ||
      !Array.isArray(mapData.tilesets) ||
      !Array.isArray(mapData.layers)
    ) {
      return;
    }

    const sortedTilesets = [...mapData.tilesets].sort((a, b) => {
      const af = Number.isInteger(a?.firstgid) ? a.firstgid : Number.MAX_SAFE_INTEGER;
      const bf = Number.isInteger(b?.firstgid) ? b.firstgid : Number.MAX_SAFE_INTEGER;
      return af - bf;
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
        const nextTileset = sortedTilesets.find(
          (c, ci) =>
            ci > index &&
            Number.isInteger(c?.firstgid) &&
            c.firstgid > tileset.firstgid
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
        canonicalByName.set(name, { firstgid, tilecount });
        dedupedTilesets.push(tileset);
        continue;
      }

      const duplicateFirst = firstgid;
      const duplicateTilecount = tilecount ?? existing.tilecount ?? 1;
      const duplicateLast = duplicateFirst + duplicateTilecount - 1;
      duplicateRanges.push({
        first: duplicateFirst,
        last: duplicateLast,
        offset: duplicateFirst - existing.firstgid,
      });
    }

    const normalizeGid = (gid) => {
      if (!Number.isInteger(gid) || gid <= 0) return gid;
      for (const range of sourcedRanges) {
        if (gid >= range.first && gid <= range.last) return gid - range.offset;
      }
      for (const range of duplicateRanges) {
        if (gid >= range.first && gid <= range.last) return gid - range.offset;
      }
      return gid;
    };

    mapData.layers.forEach((layer) => {
      if (layer.type !== "tilelayer" || !Array.isArray(layer.data)) return;
      layer.data = layer.data.map(normalizeGid);
    });

    mapData.tilesets = dedupedTilesets.filter((tileset) => !tileset.source);
  }

  update() {
    if (!this.player || !this.player.body) return;

    if (this.bgLayers) {
      const scrollX = this.cameras.main.scrollX;
      this.bgLayers.forEach(({ sprite, parallax, tileOffsetX = 0 }) => {
        sprite.tilePositionX = scrollX * parallax + tileOffsetX;
      });
    }

    const onGround = this.player.body.blocked.down || this.player.body.touching.down;

    if (this.sequenceMode === "intro") {
      this.player.setVelocityX(0);
      this.playAnimation("player-idle");
      return;
    }

    if (this.sequenceMode === "approachGatekeeper") {
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
        this.sequenceMode = "gatekeeperDialogue";
        this.triggerGatekeeperDialogue();
      }
      return;
    }

    if (this.sequenceMode === "approachNpcs") {
      const direction = this.npcAreaTargetX >= this.player.x ? 1 : -1;
      this.player.setVelocityX(direction * PLAYER_WALK_SPEED);
      this.player.setFlipX(direction < 0);
      if (!onGround) {
        this.playAnimation("player-jump");
        return;
      }
      this.playAnimation("player-run");
      if (Math.abs(this.player.x - this.npcAreaTargetX) <= TARGET_REACH_TOLERANCE_PX) {
        this.player.setVelocityX(0);
        this.player.x = this.npcAreaTargetX;
        this.player.setFlipX(false);
        this.playAnimation("player-idle");
        this.sequenceMode = "awaitingCode";
      }
      return;
    }

    if (
      this.sequenceMode === "gatekeeperDialogue" ||
      this.sequenceMode === "awaitingCode" ||
      this.sequenceMode === "unfreezing" ||
      this.sequenceMode === "exitRun" ||
      this.sequenceMode === "levelCleared"
    ) {
      if (this.sequenceMode === "exitRun") {
        this.playAnimation("player-run");
        return;
      }
      this.player.setVelocityX(0);
      if (!onGround) {
        this.playAnimation("player-jump");
        return;
      }
      this.playAnimation("player-idle");
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

  createNpcAnimations() {
    if (!this.anims.exists(NPC_IDLE_ANIMATION_KEY)) {
      this.anims.create({
        key: NPC_IDLE_ANIMATION_KEY,
        frames: this.anims.generateFrameNumbers("npc_idle_sheet", { start: 0, end: 4 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    LAYERED_VILLAGER_DEFS.forEach((charDef) => {
      charDef.layers.forEach(({ key, animKey }) => {
        if (!this.anims.exists(animKey)) {
          this.anims.create({
            key: animKey,
            frames: this.anims.generateFrameNumbers(key, { start: 0, end: 4 }),
            frameRate: 8,
            repeat: -1,
          });
        }
      });
    });
  }

  createPortalAnimations() {
    if (this.anims.exists(PORTAL_ANIMATION_KEY)) return;
    this.anims.create({
      key: PORTAL_ANIMATION_KEY,
      frames: this.anims.generateFrameNumbers("portal_sheet", { start: 0, end: 5 }),
      frameRate: 10,
      repeat: -1,
    });
  }

  createLevelGate() {
    if (!this.gatePoint) return;
    const closedFrame = GATE_FRAME_SEQUENCE[0];
    const leftX = this.gatePoint.x - GATE_COLUMN_OFFSET_X;
    const rightX = this.gatePoint.x + GATE_COLUMN_OFFSET_X;

    this.gateTopLeft = this.add
      .sprite(leftX, this.gatePoint.y - GATE_TOP_OFFSET_Y, "castle_tiles_sheet", this.toCastleTilesFrame(closedFrame.left.top))
      .setOrigin(0.5, 1).setDepth(GATE_SPRITE_DEPTH);
    this.gateMiddleLeft = this.add
      .sprite(leftX, this.gatePoint.y - GATE_MIDDLE_OFFSET_Y, "castle_tiles_sheet", this.toCastleTilesFrame(closedFrame.left.middle))
      .setOrigin(0.5, 1).setDepth(GATE_SPRITE_DEPTH);
    this.gateBottomLeft = this.add
      .sprite(leftX, this.gatePoint.y + GATE_BOTTOM_OFFSET_Y, "castle_tiles_sheet", this.toCastleTilesFrame(closedFrame.left.bottom))
      .setOrigin(0.5, 1).setDepth(GATE_SPRITE_DEPTH);
    this.gateTopRight = this.add
      .sprite(rightX, this.gatePoint.y - GATE_TOP_OFFSET_Y, "castle_tiles_sheet", this.toCastleTilesFrame(closedFrame.right.top))
      .setOrigin(0.5, 1).setDepth(GATE_SPRITE_DEPTH);
    this.gateMiddleRight = this.add
      .sprite(rightX, this.gatePoint.y - GATE_MIDDLE_OFFSET_Y, "castle_tiles_sheet", this.toCastleTilesFrame(closedFrame.right.middle))
      .setOrigin(0.5, 1).setDepth(GATE_SPRITE_DEPTH);
    this.gateBottomRight = this.add
      .sprite(rightX, this.gatePoint.y + GATE_BOTTOM_OFFSET_Y, "castle_tiles_sheet", this.toCastleTilesFrame(closedFrame.right.bottom))
      .setOrigin(0.5, 1).setDepth(GATE_SPRITE_DEPTH);
  }

  toCastleTilesFrame(frameId) {
    if (!Number.isFinite(Number(frameId))) return 0;
    let frame = Math.trunc(Number(frameId));
    if (
      frame >= CASTLE_TILE_COUNT &&
      frame - CASTLE_FRAME_COMPAT_OFFSET >= 0 &&
      frame - CASTLE_FRAME_COMPAT_OFFSET < CASTLE_TILE_COUNT
    ) {
      frame -= CASTLE_FRAME_COMPAT_OFFSET;
    }
    if (frame < 0) return 0;
    if (frame >= CASTLE_TILE_COUNT) return CASTLE_TILE_COUNT - 1;
    return frame;
  }

  setGateFrameSet(frameSet) {
    if (!frameSet) return;
    this.gateTopLeft?.setFrame(this.toCastleTilesFrame(frameSet.left.top));
    this.gateMiddleLeft?.setFrame(this.toCastleTilesFrame(frameSet.left.middle));
    this.gateBottomLeft?.setFrame(this.toCastleTilesFrame(frameSet.left.bottom));
    this.gateTopRight?.setFrame(this.toCastleTilesFrame(frameSet.right.top));
    this.gateMiddleRight?.setFrame(this.toCastleTilesFrame(frameSet.right.middle));
    this.gateBottomRight?.setFrame(this.toCastleTilesFrame(frameSet.right.bottom));
  }

  playGateOpenAnimation(onComplete) {
    if (this.gateState === "open") {
      onComplete?.();
      return;
    }
    if (this.gateState === "opening") return;
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
    return { x: object.x, y: object.y + offsetY };
  }

  resolveObjectPointTrimmed(map, offsetY, objectName, fallbackPoint) {
    const objectLayer = map.getObjectLayer("Objects");
    if (!objectLayer) return fallbackPoint;
    const object = objectLayer.objects.find(
      (item) => item.name?.trim() === objectName
    );
    if (!object) return fallbackPoint;
    return { x: object.x, y: object.y + offsetY };
  }

  startIntroSequence() {
    // Reverse of Level 2's gate-enter: player starts tiny + invisible at gate,
    // gate opens, then player grows and slides out to the right.
    this.player.body.enable = false;
    this.player.setVelocity(0, 0).setGravityY(0);
    this.player.setPosition(this.gatePoint.x, this.gatePoint.y - 8);
    this.player.setAlpha(0).setScale(PLAYER_SCALE * 0.18).setFlipX(false);
    this.playAnimation("player-idle");

    this.time.delayedCall(300, () => {
      this.playGateOpenAnimation(() => {
        this.tweens.add({
          targets: this.player,
          alpha: 1,
          scaleX: PLAYER_SCALE,
          scaleY: PLAYER_SCALE,
          x: this.gatePoint.x + 48,
          duration: INTRO_APPEAR_DURATION_MS,
          ease: "Sine.easeOut",
          onComplete: () => this.finishIntroSequence(),
        });
      });
    });
  }

  finishIntroSequence() {
    this.player.body.enable = true;
    this.player.body.reset(this.player.x, this.player.y);
    this.player.setGravityY(PLAYER_GRAVITY);
    this.introComplete = true;
    this.sequenceMode = "approachGatekeeper";

    if (this.pendingEvaluation) {
      const pending = this.pendingEvaluation;
      this.pendingEvaluation = null;
      this.onCodeEvaluated(pending);
    }
  }

  playAnimation(key) {
    if (this.player?.anims?.currentAnim?.key === key) return;
    this.player?.play(key, true);
  }

  triggerGatekeeperDialogue() {
    gameEvents.emit(GAME_LEVEL_DIALOGUE_TRIGGERED, {
      levelNumber: LEVEL_NUMBER,
      dialogueId: GATEKEEPER_DIALOGUE_ID,
      dialogueSteps: [
        {
          speaker: "Gatekeeper",
          portraitImage: "gatekeeper_portrait.png",
          portraitAlt: "Gatekeeper portrait",
          lines: [
            { text: "Traveler! A silence plague has swept through the village.", tone: "normal" },
            { text: "Three villagers are frozen — they cannot speak or move.", tone: "normal" },
          ],
        },
        {
          speaker: "Gatekeeper",
          portraitImage: "gatekeeper_portrait.png",
          portraitAlt: "Gatekeeper portrait",
          lines: [
            { text: "Give each of them a string variable — a voice.", tone: "accent" },
            { text: "Declare voice1, voice2, and voice3 with any message.", tone: "goal" },
          ],
        },
        {
          speaker: "King Kai",
          portraitImage: "portrait_player_main.png",
          portraitAlt: "King Kai portrait",
          lines: [
            { text: "I will write words for each of them.", tone: "normal" },
            { text: "Declare three string variables, then Run.", tone: "goal" },
          ],
        },
      ],
    });
  }

  onDialogueClosed({ levelNumber, dialogueId } = {}) {
    if (levelNumber !== LEVEL_NUMBER) return;

    if (dialogueId === GATEKEEPER_DIALOGUE_ID) {
      this.dialogueClosed = true;
      if (this.sequenceMode === "gatekeeperDialogue") {
        this.sequenceMode = "approachNpcs";
      }
    }

    if (dialogueId === VILLAGER_THANKS_DIALOGUE_ID) {
      this.playGateOpenAnimation(() => {
        this.time.delayedCall(300, () => this.playCoinGiftSequence());
      });
    }
  }

  onCodeEvaluated(payload) {
    if (!payload || payload.levelNumber !== LEVEL_NUMBER) return;
    if (typeof payload.isCorrect !== "boolean") return;

    if (!this.introComplete) {
      this.pendingEvaluation = payload;
      return;
    }

    if (!this.dialogueClosed) {
      // Don't interrupt the auto-walk sequence — just show the error message.
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message: "Talk to the gatekeeper first before declaring variables.",
      });
      return;
    }

    if (
      this.sequenceMode === "unfreezing" ||
      this.sequenceMode === "levelCleared"
    ) {
      return;
    }

    this.resetAttemptState();

    if (payload.isCorrect) {
      this.voiceValues = payload.values ?? {};
      this.startUnfreezeSequence();
      return;
    }

    this.startFailureSequence(
      "Invalid code. Declare voice1, voice2, and voice3 as non-empty strings."
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
    this.player.body.enable = true;
    this.player
      .setGravityY(PLAYER_GRAVITY)
      .setVelocity(0, 0)
      .setFlipX(false)
      .setAlpha(1)
      .setScale(PLAYER_SCALE);
    // 8px above floor so arcade physics detects the tile overlap on first frame.
    this.player.setPosition(this.npcAreaTargetX, this.spawnPoint.y - 8);
    this.player.body.reset(this.npcAreaTargetX, this.spawnPoint.y - 8);
    this.playAnimation("player-idle");
  }

  startUnfreezeSequence() {
    this.sequenceMode = "unfreezing";
    this.unfreezeIndex = 0;
    this.unfreezeNext();
  }

  unfreezeNext() {
    if (this.unfreezeIndex >= this.frozenNpcs.length) {
      this.onAllUnfrozen();
      return;
    }

    const npcEntry = this.frozenNpcs[this.unfreezeIndex];
    const varName = `voice${this.unfreezeIndex + 1}`;
    const voiceText = this.voiceValues?.[varName] ?? "...";

    const fromColor = Phaser.Display.Color.IntegerToColor(FROZEN_TINT);
    const toColor = Phaser.Display.Color.IntegerToColor(0xffffff);

    this.tweens.addCounter({
      from: 0,
      to: 100,
      duration: UNFREEZE_TWEEN_DURATION_MS,
      onUpdate: (tween) => {
        const t = Math.round(tween.getValue());
        const result = Phaser.Display.Color.Interpolate.ColorWithColor(
          fromColor,
          toColor,
          100,
          t
        );
        const tintColor = Phaser.Display.Color.GetColor(result.r, result.g, result.b);
        npcEntry.sprites.forEach(({ sprite }) => sprite.setTint(tintColor));
      },
      onComplete: () => {
        npcEntry.sprites.forEach(({ sprite, animKey }) => {
          sprite.clearTint();
          sprite.play(animKey);
        });
        this.showSpeechBubble(npcEntry, voiceText);
        this.unfreezeIndex++;
        this.time.delayedCall(UNFREEZE_STEP_DELAY_MS, () => this.unfreezeNext());
      },
    });
  }

  showSpeechBubble(npcEntry, text) {
    const displayText = `"${text}"`;
    const bubbleW = Math.max(100, displayText.length * 8 + 20);
    const bubbleH = 36;
    const bubbleX = npcEntry.x - bubbleW / 2;
    const npcDisplayH = npcEntry.displayH ?? Math.ceil(NPC_FRAME_SIZE * NPC_SCALE);
    const bubbleY = npcEntry.y - npcDisplayH - bubbleH - 6;

    const bg = this.add.graphics();
    bg.fillStyle(0xffffff, 0.9);
    bg.fillRoundedRect(bubbleX, bubbleY, bubbleW, bubbleH, 6);
    bg.lineStyle(2, 0x4488ff, 1);
    bg.strokeRoundedRect(bubbleX, bubbleY, bubbleW, bubbleH, 6);
    bg.setDepth(4);

    const label = this.add
      .text(npcEntry.x, bubbleY + bubbleH / 2, displayText, {
        fontSize: "12px",
        color: "#224488",
        fontFamily: "monospace",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(4);

    this.time.delayedCall(2200, () => {
      this.tweens.add({
        targets: [bg, label],
        alpha: 0,
        duration: 400,
        onComplete: () => {
          bg.destroy();
          label.destroy();
        },
      });
    });
  }

  onAllUnfrozen() {
    this.sequenceMode = "villagerThanks";
    this.time.delayedCall(600, () => {
      gameEvents.emit(GAME_LEVEL_DIALOGUE_TRIGGERED, {
        levelNumber: LEVEL_NUMBER,
        dialogueId: VILLAGER_THANKS_DIALOGUE_ID,
        dialogueSteps: [
          {
            speaker: "Villager",
            portraitImage: "villager1_portrait.png",
            portraitAlt: "Villager 1 portrait",
            lines: [
              { text: "King Kai... you did it. You gave us our voices back!", tone: "normal" },
              { text: "We have been frozen in silence for so long...", tone: "normal" },
            ],
          },
          {
            speaker: "Villager",
            portraitImage: "villager2_portrait.png",
            portraitAlt: "Villager 2 portrait",
            lines: [
              { text: "We have little, but please — take these coins as our thanks.", tone: "accent" },
              { text: "May they help you on the road ahead.", tone: "normal" },
            ],
          },
          {
            speaker: "Villager",
            portraitImage: "villager3_portrait.png",
            portraitAlt: "Villager 3 portrait",
            lines: [
              { text: "Please take them, King Kai. You saved us all.", tone: "normal" },
            ],
          },
          {
            speaker: "King Kai",
            portraitImage: "portrait_player_main.png",
            portraitAlt: "King Kai portrait",
            lines: [
              { text: "Thank you, friends. I will use them well.", tone: "goal" },
            ],
          },
        ],
      });
    });
  }

  playCoinGiftSequence() {
    const COINS_PER_NPC = [7, 7, 6];
    const totalCoins = COINS_PER_NPC.reduce((a, b) => a + b, 0);
    const floorY = this.player.y - 6;
    const landingCenterX = this.coinDropPoint?.x ?? this.player.x;

    const coinSprites = [];
    let dropped = 0;

    this.frozenNpcs.forEach((npcEntry, npcIdx) => {
      const count = COINS_PER_NPC[npcIdx] ?? 6;
      const npcDelay = npcIdx * 160;

      for (let i = 0; i < count; i++) {
        const coinDelay = npcDelay + i * 65;
        const landingX = landingCenterX + (Math.random() * 120 - 60);
        const peakX = (npcEntry.x + landingX) / 2;
        const peakY = npcEntry.y - 95;

        this.time.delayedCall(coinDelay, () => {
          const coin = this.add
            .sprite(npcEntry.x, npcEntry.y - 30, "gold_coins")
            .setScale(1.0)
            .setDepth(5);
          coin.play("coin-spin");
          coinSprites.push(coin);

          this.tweens.add({
            targets: coin,
            x: peakX,
            y: peakY,
            duration: 220,
            ease: "Sine.easeOut",
            onComplete: () => {
              this.tweens.add({
                targets: coin,
                x: landingX,
                y: floorY,
                duration: 340,
                ease: "Bounce.easeOut",
                onComplete: () => {
                  dropped++;
                  if (dropped === totalCoins) {
                    this.time.delayedCall(700, () => this.collectCoins(coinSprites));
                  }
                },
              });
            },
          });
        });
      }
    });
  }

  collectCoins(coins) {
    let collected = 0;
    coins.forEach((coin, i) => {
      this.time.delayedCall(i * 30, () => {
        this.tweens.add({
          targets: coin,
          x: this.player.x,
          y: this.player.y - 24,
          scaleX: 0,
          scaleY: 0,
          duration: 280,
          ease: "Sine.easeIn",
          onComplete: () => {
            coin.destroy();
            collected++;
            if (collected === coins.length) {
              this.player.setTint(0xffd700);
              this.time.delayedCall(350, () => {
                this.player.clearTint();
                this.time.delayedCall(400, () => this.startPostCoinExitRunSequence());
              });
            }
          },
        });
      });
    });
  }

  startPostCoinExitRunSequence() {
    this.sequenceMode = "exitRun";
    this.tweens.killTweensOf(this.player);
    this.player.setVelocity(0, 0).setGravityY(0).setFlipX(false);
    this.player.body.enable = false;
    this.playAnimation("player-run");

    const targetX = Math.max(this.player.x, this.postCoinExitTargetX ?? this.player.x + 240);
    const distance = targetX - this.player.x;
    const duration = Math.max(500, (distance / PLAYER_WALK_SPEED) * 1000);

    this.tweens.add({
      targets: this.player,
      x: targetX,
      y: this.player.y,
      duration,
      ease: "Linear",
      onComplete: () => {
        this.playAnimation("player-idle");
        this.finishLevelCleared();
      },
    });
  }

  finishLevelCleared() {
    if (this.sequenceMode !== "levelCleared") {
      this.sequenceMode = "levelCleared";
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "success",
        message: "All three voices restored. The route is now open. Level 3 cleared.",
        shouldProceed: true,
      });
    }
  }

  createCoinAnimation() {
    if (this.anims.exists("coin-spin")) return;
    this.anims.create({
      key: "coin-spin",
      frames: this.anims.generateFrameNumbers("gold_coins", { start: 0, end: 4 }),
      frameRate: 12,
      repeat: -1,
    });
  }

  startFailureSequence(message, { useDeathAnimation = true } = {}) {
    this.failureMessage = message ?? this.failureMessage;

    if (!useDeathAnimation) {
      this.sequenceMode = "awaitingCode";
      this.isDead = false;
      this.isDowned = false;
      this.player.setVelocity(0, 0).setGravityY(PLAYER_GRAVITY);
      this.playAnimation("player-idle");
      this.failureTimer = this.time.delayedCall(NON_FATAL_FAILURE_DELAY_MS, () =>
        this.emitFailureOutcome()
      );
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
      this.player.setVelocity(0, 0).setGravityY(0);
      this.player.play("player-downed");
      this.failureTimer = this.time.delayedCall(450, () => this.emitFailureOutcome());
    }
  }

  emitFailureOutcome() {
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "failure",
      message: this.failureMessage,
    });
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
