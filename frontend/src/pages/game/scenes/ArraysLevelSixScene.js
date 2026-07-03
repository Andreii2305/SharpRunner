import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";

const LEVEL_NUMBER = 11;
const PLAYER_SCALE = 2;
const PLAYER_DEPTH = 1.55;
const PLAYER_WALK_SPEED = 190;
const FAILURE_WALK_SPEED = 170;
const CAMERA_PREVIEW_DELAY = 520;
const CAMERA_PREVIEW_DURATION = 1500;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_ASSET_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const GH_BG_BASE = `${GH_ASSET_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const LEVEL_MAP_KEY = "arrays_level_6_branching_path";
const LEVEL_MAP_PATH = `${ASSET_BASE}/maps/arrays-level-6-tikbalang-branching-path.tmj`;
const MANANGY_FRAME_SIZE = 256;
const PLAYER_SPAWN_Y_OFFSET = -8;
const WATER_TILE_COLUMNS = 20;
const WATER_TILE_FRAME_MS = 130;
const EXPECTED_PATH_MAP = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const ROUTE_ROWS = ["top", "mid", "bottom"];
const ROUTE_LABELS = ["upper", "middle", "lower"];
const PLAYER_ANIMATIONS = [
  { key: "player-idle-arrays-6", start: 0, end: 5, frameRate: 6, repeat: -1 },
  { key: "player-run-arrays-6", start: 16, end: 23, frameRate: 12, repeat: -1 },
  { key: "player-death-arrays-6", start: 48, end: 55, frameRate: 10, repeat: 0 },
  {
    key: "player-climb-arrays-6",
    texture: "player_climb_sheet_blue",
    start: 40,
    end: 47,
    frameRate: 9,
    repeat: -1,
  },
];

export default class ArraysLevelSixScene extends Phaser.Scene {
  constructor() {
    super("ArraysLevelSixScene");
  }

  preload() {
    this.load.spritesheet(
      "player_sheet_blue",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    this.load.spritesheet(
      "player_climb_sheet_blue",
      `${ASSET_BASE}/characters/players/char_blue_2.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    this.load.spritesheet(
      "arrays_6_manangy_idle",
      `${ASSET_BASE}/characters/monsters/Manangy-fly_idle.png`,
      { frameWidth: MANANGY_FRAME_SIZE, frameHeight: MANANGY_FRAME_SIZE },
    );
    this.load.tilemapTiledJSON(LEVEL_MAP_KEY, LEVEL_MAP_PATH);
    this.load.image("arrays_6_floor_tiles", `${GH_ASSET_BASE}/Floor_Tiles2.png`);
    this.load.image("arrays_6_decor_tiles", `${GH_ASSET_BASE}/Decor.png`);
    this.load.image("arrays_6_garden_decor_tiles", `${GH_ASSET_BASE}/Garden_Decorations.png`);
    this.load.image("arrays_6_pine_trees_tiles", `${GH_ASSET_BASE}/Pine_Trees.png`);
    this.load.image("arrays_6_house_tiles", `${GH_ASSET_BASE}/House_Tiles.png`);
    this.load.image("arrays_6_other_tiles_2", `${GH_ASSET_BASE}/Other_Tiles2.png`);
    this.load.image("arrays_6_pine_forest_tiles", `${GH_ASSET_BASE}/Pine_forest_sheet.png`);
    this.load.image("arrays_6_large_tent_tiles", `${GH_ASSET_BASE}/Large_Tent.png`);
    this.load.image(
      "arrays_6_lamp_post_tall",
      `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze/Lamp-Post-2-TALL.png`,
    );
    this.load.image(
      "arrays_6_lamp_post_short",
      `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze/Lamp-Post-2-SHORT.png`,
    );
    this.load.image("arrays_6_bg5", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("arrays_6_bg_castle", `${GH_BG_BASE}/Background_Castle.png`);
    this.load.image("arrays_6_bg4", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("arrays_6_bg3", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("arrays_6_bg2", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("arrays_6_bg1", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
    this.load.image("arrays_6_ladder_1", `${ASSET_BASE}/other/ladder/128x585/ladder1.png`);
    this.load.image("arrays_6_ladder_2", `${ASSET_BASE}/other/ladder/128x585/ladder2.png`);
    this.load.image(
      "arrays_6_water_tiles",
      `${GH_ASSET_BASE}/Animated_Sprites/GandalfHardcore_Animated_Water_Tiles.png`,
    );
  }

  create() {
    this.scale.resize(1024, 576);
    const map = this.make.tilemap({ key: LEVEL_MAP_KEY });
    const offsetY = this.scale.height - map.heightInPixels;

    this.createParallaxBackgrounds(map);
    this.createAnimations();
    this.createTileMapLayers(map, offsetY);
    this.points = this.resolveMapPoints(map, offsetY);
    this.waterHazards = this.resolveWaterHazards(map, offsetY);

    const spawnPoint = this.points.player_spawn ?? { x: 96, y: 448 + offsetY };
    this.spawnPoint = {
      x: spawnPoint.x,
      y: spawnPoint.y + PLAYER_SPAWN_Y_OFFSET,
    };
    this.pathPanelPoint = this.points.path_panel ?? { x: 160, y: 282 + offsetY };
    this.monsterPoint = this.points.monster_spawn ?? { x: 1260, y: 170 + offsetY };
    this.exitPoint = this.points.level_exit ?? { x: map.widthInPixels - 80, y: this.spawnPoint.y };
    this.sequenceTimers = [];
    this.sequenceMode = "idle";
    this.previewStarted = false;

    this.createRoutePanel();
    this.createCheckpointMarkers();
    this.createMonster();
    this.createPlayer();
    this.createWaterGlints();

    this.cameras.main.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);
    this.cameras.main.centerOn(this.spawnPoint.x + 300, this.scale.height / 2);
    this.cameras.main.setBackgroundColor("#050916");
    this.setupManualCameraControls(map, offsetY);
    this.startOpeningCameraPreview();
    this.player.play("player-idle-arrays-6");

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);
  }

  update(time) {
    this.updateWaterAnimation(time);

    if (!this.player) return;

    if (this.sequenceMode === "walkingRoute") {
      this.walkRoute();
      return;
    }

    if (this.sequenceMode === "walkingFailureRoute") {
      this.walkFailureRoute();
      return;
    }

    if (this.sequenceMode === "idle") {
      this.playAnimation("player-idle-arrays-6");
    }
  }

  createParallaxBackgrounds(map) {
    const worldWidth = map?.widthInPixels ?? 1600;
    const backgrounds = [
      { key: "arrays_6_bg5", factor: 0.08, depth: -8, alpha: 0.82, y: 0 },
      { key: "arrays_6_bg_castle", factor: 0.08, depth: -7, alpha: 0.28, y: 0 },
      { key: "arrays_6_bg4", factor: 0.12, depth: -6, alpha: 0.72, y: 0 },
      { key: "arrays_6_bg3", factor: 0.34, depth: -5, alpha: 0.66, y: 90 },
      { key: "arrays_6_bg2", factor: 0.6, depth: -4, alpha: 0.64, y: 184 },
      { key: "arrays_6_bg1", factor: 0.82, depth: -3, alpha: 0.55, y: 230 },
    ];

    backgrounds.forEach(({ key, factor, depth, alpha, y }) => {
      this.add
        .tileSprite(0, y, worldWidth, this.scale.height - y, key)
        .setOrigin(0, 0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x243e58)
        .setAlpha(alpha);
    });

    this.add
      .rectangle(0, 0, worldWidth, this.scale.height, 0x030711, 0.34)
      .setOrigin(0, 0)
      .setDepth(-2);
  }

  createTileMapLayers(map, offsetY) {
    const floorTileset = map.addTilesetImage("Floor_Tiles2", "arrays_6_floor_tiles");
    const decorTileset = map.addTilesetImage("Decor", "arrays_6_decor_tiles");
    const gardenDecorTileset = map.addTilesetImage(
      "Garden_Decorations",
      "arrays_6_garden_decor_tiles",
    );
    const pineTreesTileset = map.addTilesetImage("Pine_Trees", "arrays_6_pine_trees_tiles");
    const houseTileset = map.addTilesetImage("House_Tiles", "arrays_6_house_tiles");
    const otherTileset = map.addTilesetImage("Other_Tiles2", "arrays_6_other_tiles_2");
    const pineForestTileset = map.addTilesetImage(
      "Pine_forest_sheet",
      "arrays_6_pine_forest_tiles",
    );
    const largeTentTileset = map.addTilesetImage("Large_Tent", "arrays_6_large_tent_tiles");
    const lampPostTallTileset = map.addTilesetImage(
      "Lamp Post 2 TALL",
      "arrays_6_lamp_post_tall",
    );
    const lampPostShortTileset = map.addTilesetImage(
      "Lamp Post 2 SHORT",
      "arrays_6_lamp_post_short",
    );
    const ladderOneTileset = map.addTilesetImage("ladder1", "arrays_6_ladder_1");
    const ladderTwoTileset = map.addTilesetImage("ladder2", "arrays_6_ladder_2");
    const waterTileset =
      map.addTilesetImage("Animated_Water_Tiles", "arrays_6_water_tiles") ??
      map.addTilesetImage("GandalfHardcore_Animated_Water_Tiles", "arrays_6_water_tiles");
    const allTilesets = [
      floorTileset,
      decorTileset,
      gardenDecorTileset,
      pineTreesTileset,
      houseTileset,
      otherTileset,
      pineForestTileset,
      largeTentTileset,
      lampPostTallTileset,
      lampPostShortTileset,
      ladderOneTileset,
      ladderTwoTileset,
      waterTileset,
    ].filter(Boolean);

    this.waterTileset = waterTileset ?? null;
    this.waterAnimationLastTime = 0;
    this.waterAnimationFrame = 0;

    this.createVisualTileLayer(map, "top-platform", allTilesets, offsetY, 0.12, 0xffffff, 1);
    this.createVisualTileLayer(map, "mid-platform", allTilesets, offsetY, 0.13, 0xffffff, 1);
    this.createVisualTileLayer(map, "bottom-platform", allTilesets, offsetY, 0.14, 0xffffff, 1);
    this.waterLayer = this.createVisualTileLayer(map, "water", allTilesets, offsetY, 0.18, 0xffffff, 0.98);
    this.createVisualTileLayer(map, "trees", allTilesets, offsetY, 0.19, 0xd7e0d8, 0.94);
    this.createVisualTileLayer(map, "decoration", allTilesets, offsetY, 0.2, 0xc9d3e1, 0.92);
    this.createVisualTileLayer(map, "front_decoration", allTilesets, offsetY, 1.35, 0xdde6f2, 0.96);
  }

  createVisualTileLayer(map, layerName, tilesets, offsetY, depth, tint, alpha) {
    const layer = map.createLayer(layerName, tilesets, 0, offsetY);
    if (!layer) return null;
    layer.setDepth(depth);
    layer.setAlpha(alpha);
    layer.setTint(tint);
    return layer;
  }

  updateWaterAnimation(time = 0) {
    if (!this.waterLayer || !this.waterTileset) return;
    if (time - this.waterAnimationLastTime < WATER_TILE_FRAME_MS) return;

    this.waterAnimationLastTime = time;
    this.waterAnimationFrame = (this.waterAnimationFrame + 1) % WATER_TILE_COLUMNS;
    const firstGid = this.waterTileset.firstgid;
    const tileCount = this.waterTileset.total ?? this.waterTileset.tileTotal ?? 220;

    this.waterLayer.forEachTile((tile) => {
      if (!tile || tile.index < firstGid || tile.index >= firstGid + tileCount) return;
      const localIndex = tile.index - firstGid;
      const rowStart = Math.floor(localIndex / WATER_TILE_COLUMNS) * WATER_TILE_COLUMNS;
      tile.index = firstGid + rowStart + this.waterAnimationFrame;
    });
  }

  setupManualCameraControls(map, offsetY) {
    this.manualCameraEnabled = true;
    this.cameraDragState = null;
    this.cameraBounds = {
      minX: 0,
      maxX: Math.max(0, map.widthInPixels - this.scale.width),
      minY: offsetY,
      maxY: offsetY,
    };

    this.input.on("pointerdown", this.onCameraPointerDown, this);
    this.input.on("pointermove", this.onCameraPointerMove, this);
    this.input.on("pointerup", this.onCameraPointerUp, this);
    this.input.on("pointerupoutside", this.onCameraPointerUp, this);
    this.input.on("wheel", this.onCameraWheel, this);
  }

  onCameraPointerDown(pointer) {
    this.skipOpeningCameraPreview();
    this.fadeRouteHint();
    if (!this.manualCameraEnabled || pointer.rightButtonDown()) return;
    this.cameraDragState = {
      pointerId: pointer.id,
      x: pointer.x,
      scrollX: this.cameras.main.scrollX,
    };
  }

  onCameraPointerMove(pointer) {
    if (!this.manualCameraEnabled || !this.cameraDragState) return;
    if (this.cameraDragState.pointerId !== pointer.id) return;
    const deltaX = pointer.x - this.cameraDragState.x;
    this.setCameraScrollX(this.cameraDragState.scrollX - deltaX);
  }

  onCameraPointerUp(pointer) {
    if (!this.cameraDragState || this.cameraDragState.pointerId !== pointer.id) return;
    this.cameraDragState = null;
  }

  onCameraWheel(pointer, gameObjects, deltaX, deltaY) {
    this.skipOpeningCameraPreview();
    this.fadeRouteHint();
    if (!this.manualCameraEnabled) return;
    const scrollDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
    this.setCameraScrollX(this.cameras.main.scrollX + scrollDelta);
  }

  setCameraScrollX(scrollX) {
    const clamped = Phaser.Math.Clamp(
      scrollX,
      this.cameraBounds?.minX ?? 0,
      this.cameraBounds?.maxX ?? 0,
    );
    this.cameras.main.setScroll(clamped, this.cameraBounds?.minY ?? this.cameras.main.scrollY);
  }

  enableManualCamera() {
    this.skipOpeningCameraPreview();
    this.cameras.main.stopFollow();
    this.manualCameraEnabled = true;
  }

  followPlayerCamera() {
    this.skipOpeningCameraPreview();
    this.manualCameraEnabled = false;
    this.cameraDragState = null;
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
  }

  startOpeningCameraPreview() {
    if (this.previewStarted || (this.cameraBounds?.maxX ?? 0) <= 24) return;
    this.previewStarted = true;
    this.manualCameraEnabled = false;
    this.cameraDragState = null;
    const startX = Phaser.Math.Clamp(
      this.spawnPoint.x - 180,
      this.cameraBounds.minX,
      this.cameraBounds.maxX,
    );
    const previewX = Phaser.Math.Clamp(
      this.cameraBounds.maxX,
      this.cameraBounds.minX,
      this.cameraBounds.maxX,
    );
    this.cameras.main.setScroll(startX, this.cameraBounds.minY);

    this.previewTween = this.tweens.add({
      targets: this.cameras.main,
      scrollX: previewX,
      delay: CAMERA_PREVIEW_DELAY,
      duration: CAMERA_PREVIEW_DURATION,
      hold: 260,
      yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.previewTween = null;
        this.manualCameraEnabled = true;
        this.setCameraScrollX(startX);
      },
    });
  }

  skipOpeningCameraPreview() {
    if (!this.previewTween) return;
    this.previewTween.stop();
    this.previewTween = null;
    this.manualCameraEnabled = true;
  }

  resolveMapPoints(map, offsetY) {
    const points = {};
    ["objects", "Objects", "triggers", "Triggers", "hazzards", "hazards", "Hazards"].forEach(
      (layerName) => {
        const layer = map.getObjectLayer(layerName);
        if (!layer) return;
        layer.objects.forEach((obj) => {
          const name = obj.name?.trim();
          if (!name) return;
          points[name] = {
            x: obj.x + (obj.width || 0) / 2,
            y: obj.y + offsetY + (obj.height || 0),
          };
        });
      },
    );
    return points;
  }

  resolveWaterHazards(map, offsetY) {
    const hazards = [];
    ["hazzards", "hazards", "Hazards"].forEach((layerName) => {
      const layer = map.getObjectLayer(layerName);
      if (!layer) return;
      layer.objects.forEach((obj) => {
        const name = obj.name?.trim() ?? "";
        if (!name.toLowerCase().includes("water")) return;
        hazards.push({
          name,
          x: obj.x,
          y: obj.y + offsetY,
          width: obj.width || 0,
          height: obj.height || 0,
        });
      });
    });
    return hazards;
  }

  createAnimations() {
    PLAYER_ANIMATIONS.forEach(({ key, texture = "player_sheet_blue", start, end, frameRate, repeat }) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(texture, { start, end }),
        frameRate,
        repeat,
      });
    });

    if (!this.anims.exists("arrays-6-manangy-idle")) {
      this.anims.create({
        key: "arrays-6-manangy-idle",
        frames: this.anims.generateFrameNumbers("arrays_6_manangy_idle", {
          start: 0,
          end: 24,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }
  }

  createRoutePanel() {
    this.panelItems = [];
    this.routePanel = this.add.container(24, 24).setDepth(2).setScrollFactor(0);
    this.routeHint = this.add
      .text(0, 0, "drag or wheel to scan the trail", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#c9ecf5",
        backgroundColor: "rgba(4, 9, 18, 0.46)",
        padding: { x: 8, y: 3 },
        align: "center",
      })
      .setOrigin(0, 0)
      .setAlpha(0.82);
    this.routePanel.add(this.routeHint);
  }

  fadeRouteHint() {
    if (!this.routeHint || this.routeHintFaded) return;
    this.routeHintFaded = true;
    this.tweens.add({
      targets: this.routeHint,
      alpha: 0,
      duration: 420,
      ease: "Sine.easeOut",
    });
  }

  createWaterGlints() {
    this.waterGlints = [];
    if (!this.waterHazards?.length) return;

    this.waterHazards.forEach((hazard, hazardIndex) => {
      const glintCount = Math.min(3, Math.max(1, Math.floor(hazard.width / 240)));
      for (let i = 0; i < glintCount; i += 1) {
        const x = hazard.x + ((i + 1) * hazard.width) / (glintCount + 1);
        const y = hazard.y + Math.min(13, Math.max(7, hazard.height * 0.22));
        const glint = this.add
          .ellipse(x, y, 18, 4, 0xa8ffff, 0)
          .setDepth(1.05)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.waterGlints.push(glint);
        this.tweens.add({
          targets: glint,
          alpha: { from: 0, to: 0.42 },
          scaleX: { from: 0.45, to: 1.35 },
          duration: 900 + hazardIndex * 70,
          delay: hazardIndex * 220 + i * 430,
          yoyo: true,
          repeat: -1,
          repeatDelay: 1900 + i * 240,
          ease: "Sine.easeInOut",
        });
      }
    });
  }

  createCheckpointMarkers() {
    this.routePoints = [];
    this.routeMarkers = [];
    this.routePointGrid = Array.from({ length: ROUTE_ROWS.length }, () => []);

    for (let checkpoint = 1; checkpoint <= 3; checkpoint += 1) {
      ROUTE_ROWS.forEach((rowName, rowIndex) => {
        const point = this.points[`${rowName}_checkpoint_${checkpoint}`];
        if (!point) return;
        const isSafe = EXPECTED_PATH_MAP[rowIndex][checkpoint - 1] === 1;
        const routePoint = { x: point.x, y: point.y, checkpoint, rowIndex, isSafe };
        this.routePointGrid[rowIndex][checkpoint - 1] = routePoint;
        const marker = this.add
          .text(point.x, point.y - 38, `${checkpoint}`, {
            fontFamily: "monospace",
            fontSize: "12px",
            color: "#d4edf5",
            backgroundColor: "rgba(4, 9, 18, 0.58)",
            padding: { x: 5, y: 2 },
          })
          .setOrigin(0.5)
          .setDepth(1.62)
          .setAlpha(0.78);
        this.routeMarkers.push({ checkpoint, rowIndex, isSafe, marker });
        if (isSafe) {
          this.routePoints.push(routePoint);
        }
      });
    }

    this.routePoints.sort((a, b) => a.checkpoint - b.checkpoint);
  }

  createMonster() {
    this.monster = this.add
      .container(this.monsterPoint.x, this.monsterPoint.y)
      .setDepth(1.15);
    this.monsterAura = this.add
      .ellipse(0, 18, 150, 172, 0xb46cff, 0.055)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.monsterInnerGlow = this.add
      .ellipse(0, 12, 88, 112, 0xff3f91, 0.075)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.monsterSprite = this.add
      .sprite(0, 0, "arrays_6_manangy_idle", 0)
      .setOrigin(0.5)
      .setScale(0.55)
      .setFlipX(true);
    this.monsterSprite.play("arrays-6-manangy-idle");
    this.monster.add([this.monsterAura, this.monsterInnerGlow, this.monsterSprite]);
    this.monsterLabel = this.add
      .text(this.monsterPoint.x, this.monsterPoint.y - 96, "Choose wrong, and the forest loops.", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#ffd6e5",
        backgroundColor: "rgba(4, 9, 18, 0.72)",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(1.25);

    this.tweens.add({
      targets: this.monster,
      y: this.monster.y - 8,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: [this.monsterAura, this.monsterInnerGlow],
      alpha: { from: 0.045, to: 0.11 },
      scaleX: { from: 0.94, to: 1.08 },
      scaleY: { from: 0.94, to: 1.06 },
      duration: 1700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createPlayer() {
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "player_sheet_blue")
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(PLAYER_DEPTH);
  }

  onCodeEvaluated({ levelNumber, isCorrect, values, message }) {
    if (levelNumber !== LEVEL_NUMBER) return;
    this.fadeRouteHint();
    this.resetAttemptState();

    if (isCorrect) {
      this.startSuccessSequence();
      return;
    }

    this.startFailureSequence(values?.pathMap, message);
  }

  resetAttemptState() {
    this.sequenceTimers?.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.tweens.killTweensOf([
      this.player,
      this.monster,
      this.monsterAura,
      this.monsterInnerGlow,
      this.monsterLabel,
      ...this.panelItems.flatMap(({ box, marker }) => [box, marker]),
      ...this.routeMarkers.map(({ marker }) => marker),
    ]);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y).setAlpha(1).setScale(PLAYER_SCALE);
    this.enableManualCamera();
    this.monster.setPosition(this.monsterPoint.x, this.monsterPoint.y).setAlpha(1).setScale(1);
    this.monsterSprite?.setScale(0.55).setFlipX(true).clearTint().setAlpha(1);
    this.monsterAura?.setAlpha(0.055).setScale(1);
    this.monsterInnerGlow?.setAlpha(0.075).setScale(1);
    this.monsterLabel
      ?.setText("Choose wrong, and the trail sinks.")
      .setColor("#ffd6e5")
      .setAlpha(1);
    this.panelItems.forEach(({ value, box, marker }) => {
      const isSafe = value === 1;
      box
        .setFillStyle(isSafe ? 0x1f270e : 0x101624, 0.76)
        .setStrokeStyle(1, isSafe ? 0xe7d36a : 0x495872, isSafe ? 0.72 : 0.46)
        .setScale(1);
      marker
        .setColor(isSafe ? "#ffe98b" : "#8fa3bd")
        .setAlpha(1)
        .setScale(1);
    });
    this.routeMarkers.forEach(({ marker }) => {
      marker
        .setColor("#d4edf5")
        .setScale(1)
        .setAlpha(0.78);
    });
    this.splashRipples?.forEach((ripple) => ripple.destroy());
    this.splashRipples = [];
    this.sequenceMode = "idle";
    this.playAnimation("player-idle-arrays-6");
  }

  startSuccessSequence() {
    this.sequenceMode = "restoring";
    this.followPlayerCamera();
    this.monsterLabel?.setText("No... you read the trail.").setColor("#fff0ad");

    this.routePoints.forEach((routePoint, index) => {
      this.schedule(index * 340, () => {
        this.highlightCheckpoint(routePoint.checkpoint, routePoint.rowIndex);
      });
    });

    this.schedule(this.routePoints.length * 340 + 280, () => {
      this.tweens.add({
        targets: [this.monster, this.monsterLabel],
        x: "+=70",
        y: "-=30",
        alpha: 0,
        duration: 520,
        ease: "Back.easeIn",
        onComplete: () => {
          this.routeTravelTargets = this.buildRouteTravelTargets();
          this.routeTargetIndex = 0;
          this.sequenceMode = "walkingRoute";
        },
      });
    });
  }

  highlightCheckpoint(checkpoint, rowIndex) {
    this.panelItems
      .filter((item) => item.colIndex === checkpoint - 1)
      .forEach(({ value, box, marker }) => {
        const isSafe = value === 1;
        box
          .setFillStyle(isSafe ? 0x49390e : 0x0b1018, isSafe ? 0.94 : 0.48)
          .setStrokeStyle(2, isSafe ? 0xffe98b : 0x334256, isSafe ? 1 : 0.3);
        marker.setAlpha(isSafe ? 1 : 0.44).setColor(isSafe ? "#fff5b8" : "#63758d");
        this.tweens.add({
          targets: [box, marker],
          scaleX: isSafe ? 1.08 : 0.96,
          scaleY: isSafe ? 1.08 : 0.96,
          duration: 160,
          yoyo: true,
          ease: "Sine.easeOut",
        });
      });

    this.routeMarkers
      .filter((item) => item.checkpoint === checkpoint)
      .forEach(({ marker, isSafe }) => {
        marker
          .setColor(isSafe ? "#fff4b8" : "#5f7483")
          .setAlpha(isSafe ? 0.95 : 0.24);
        this.tweens.add({
          targets: marker,
          scaleX: isSafe ? 1.34 : 0.96,
          scaleY: isSafe ? 1.34 : 0.96,
          duration: 150,
          hold: isSafe ? 80 : 0,
          yoyo: true,
          ease: "Sine.easeInOut",
        });
      });
  }

  startFailureSequence(submittedPathMap, validationMessage = "") {
    this.sequenceMode = "failure";
    const submittedRows = Array.isArray(submittedPathMap) ? submittedPathMap : [];
    const canPreviewFailure = this.canPreviewFailureRoute(submittedRows, validationMessage);

    this.monsterLabel
      ?.setText(canPreviewFailure ? "That path sinks." : this.getFailureLine(submittedPathMap, validationMessage))
      .setColor("#ffc5c5");

    this.panelItems.forEach(({ rowIndex, colIndex, value, box, marker }, index) => {
      const submittedValue = submittedRows[rowIndex]?.[colIndex];
      const isRight = submittedValue === value;
      this.schedule(index * 55, () => {
        box
          .setFillStyle(isRight ? 0x183121 : 0x652431, 0.9)
          .setStrokeStyle(2, isRight ? 0x5fd38a : 0xff8585, 0.86);
        marker.setText(submittedValue ?? "?").setColor(isRight ? "#baffcf" : "#ffc5c5");
      });
    });

    if (canPreviewFailure) {
      this.startFailedRouteSequence(submittedRows);
      return;
    }

    this.tweens.add({
      targets: this.monster,
      x: this.monster.x - 26,
      duration: 120,
      yoyo: true,
      repeat: 3,
      ease: "Sine.easeInOut",
    });
    this.player.play("player-death-arrays-6", true);

    this.schedule(820, () => {
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message: "The forest rejects the map. Use a 3x3 int[,] pathMap with the safe route.",
      });
    });
  }

  canPreviewFailureRoute(submittedRows, validationMessage = "") {
    const normalizedMessage = validationMessage.toLowerCase();
    if (
      normalizedMessage.includes("unexpected array") ||
      normalizedMessage.includes("only \"pathmap\"") ||
      normalizedMessage.includes("exactly one 2d")
    ) {
      return false;
    }
    if (!Array.isArray(submittedRows) || submittedRows.length !== 3) return false;
    return submittedRows.every((row) => Array.isArray(row) && row.length === 3);
  }

  startFailedRouteSequence(submittedRows) {
    this.followPlayerCamera();
    this.highlightSubmittedRoute(submittedRows);
    this.failureTravelTargets = this.buildFailureTravelTargets(submittedRows);
    this.failureTargetIndex = 0;
    const mistakeTarget = this.failureTravelTargets.find((target) => target.type === "sink") ??
      this.failureTravelTargets.find((target) => target.type === "collapse") ??
      this.failureTravelTargets[this.failureTravelTargets.length - 1];

    this.tweens.add({
      targets: this.monster,
      x: mistakeTarget ? Phaser.Math.Linear(this.monster.x, mistakeTarget.x, 0.35) : this.monster.x - 18,
      y: mistakeTarget ? Phaser.Math.Linear(this.monster.y, mistakeTarget.y - 128, 0.28) : this.monster.y,
      duration: 620,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.monsterSprite,
      scaleX: 0.61,
      scaleY: 0.61,
      duration: 220,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });

    this.schedule(420, () => {
      this.sequenceMode = "walkingFailureRoute";
      this.fadeUnselectedRouteMarkers(submittedRows);
    });
  }

  highlightSubmittedRoute(submittedRows) {
    this.routeMarkers.forEach(({ marker, rowIndex, checkpoint, isSafe }) => {
      const selected = submittedRows[rowIndex]?.[checkpoint - 1] === 1;
      marker
        .setColor(selected ? (isSafe ? "#d8ffd9" : "#ffb8b8") : "#526776")
        .setAlpha(selected ? 0.95 : 0.24);
    });
  }

  fadeUnselectedRouteMarkers(submittedRows) {
    this.routeMarkers.forEach(({ marker, rowIndex, checkpoint }) => {
      const selected = submittedRows[rowIndex]?.[checkpoint - 1] === 1;
      this.tweens.add({
        targets: marker,
        alpha: selected ? 0.72 : 0.12,
        duration: 360,
        ease: "Sine.easeOut",
      });
    });
  }

  buildFailureTravelTargets(submittedRows) {
    const targets = [];
    let currentY = this.player.y;
    let fallbackPoint = null;

    for (let colIndex = 0; colIndex < 3; colIndex += 1) {
      const selectedRow = submittedRows.findIndex((row) => row?.[colIndex] === 1);
      const rowIndex = selectedRow >= 0 ? selectedRow : EXPECTED_PATH_MAP.findIndex((row) => row[colIndex] === 1);
      const routePoint = this.routePointGrid[rowIndex]?.[colIndex];
      if (!routePoint) continue;
      fallbackPoint = routePoint;

      targets.push({ type: "run", x: routePoint.x, y: currentY });
      if (Math.abs(routePoint.y - currentY) > 4) {
        targets.push({ type: "climbFailure", x: routePoint.x, y: routePoint.y });
      }

      currentY = routePoint.y;

      if (!routePoint.isSafe || selectedRow < 0) {
        break;
      }
    }

    const waterTarget = this.findFailureWaterTarget(fallbackPoint, currentY);
    if (waterTarget) {
      targets.push({ type: "run", x: waterTarget.x, y: currentY });
      targets.push({ type: "sink", x: waterTarget.x, y: waterTarget.y });
    } else {
      targets.push({ type: "collapse", x: fallbackPoint?.x ?? this.player.x, y: currentY });
    }

    return targets;
  }

  findFailureWaterTarget(routePoint, currentY) {
    if (!routePoint || !this.waterHazards?.length) return null;
    const hazard =
      this.waterHazards.find((area) => (
        routePoint.x >= area.x &&
        routePoint.x <= area.x + area.width &&
        Math.abs(area.y - currentY) <= 72
      )) ??
      this.waterHazards
        .filter((area) => Math.abs(area.y - currentY) <= 96)
        .sort((a, b) => Math.abs((a.x + a.width / 2) - routePoint.x) - Math.abs((b.x + b.width / 2) - routePoint.x))[0];

    if (!hazard) return null;
    return {
      x: Phaser.Math.Clamp(routePoint.x, hazard.x + 20, hazard.x + Math.max(20, hazard.width - 20)),
      y: hazard.y + Math.min(30, Math.max(16, hazard.height * 0.55)),
    };
  }

  walkFailureRoute() {
    const target = this.failureTravelTargets?.[this.failureTargetIndex];
    if (!target) {
      this.finishFailureSequence();
      return;
    }

    if (target.type === "climbFailure") {
      this.startFailureClimb(target);
      return;
    }

    if (target.type === "sink") {
      this.startWaterSink(target);
      return;
    }

    if (target.type === "collapse") {
      this.player.play("player-death-arrays-6", true);
      this.failureTargetIndex += 1;
      this.schedule(620, () => this.finishFailureSequence());
      return;
    }

    this.playAnimation("player-run-arrays-6");
    this.player.setFlipX(false);
    this.createFootDust(this.player.x - 9, this.player.y - 3);
    const dx = target.x - this.player.x;
    if (Math.abs(dx) <= 4) {
      this.player.setPosition(target.x, target.y);
      this.failureTargetIndex += 1;
      return;
    }

    const step = (FAILURE_WALK_SPEED * this.game.loop.delta) / 1000;
    this.player.y = target.y;
    this.player.x += Math.sign(dx) * Math.min(step, Math.abs(dx));
  }

  startFailureClimb(target) {
    this.sequenceMode = "climbingFailureRoute";
    this.playAnimation("player-idle-arrays-6");
    this.player.setFlipX(false);
    this.player.setX(target.x);

    this.schedule(150, () => {
      this.playAnimation("player-climb-arrays-6");
      this.tweens.add({
        targets: this.player,
        y: target.y,
        duration: Math.abs(target.y - this.player.y) > 80 ? 780 : 560,
        ease: "Sine.easeInOut",
        onComplete: () => {
          this.player.setPosition(target.x, target.y);
          this.playAnimation("player-idle-arrays-6");
          this.createFootDust(target.x, target.y - 3);
          this.schedule(140, () => {
            this.failureTargetIndex += 1;
            this.sequenceMode = "walkingFailureRoute";
          });
        },
      });
    });
  }

  startWaterSink(target) {
    this.sequenceMode = "sinkingFailureRoute";
    this.playAnimation("player-idle-arrays-6");
    this.player.setPosition(target.x, this.player.y);
    this.monsterLabel?.setText("The water remembers wrong turns.").setColor("#ffc5c5");
    this.createWaterSplash(target.x, this.player.y - 8);

    this.tweens.add({
      targets: this.player,
      y: target.y,
      alpha: 0.18,
      duration: 620,
      ease: "Sine.easeIn",
      onComplete: () => {
        this.failureTargetIndex += 1;
        this.finishFailureSequence();
      },
    });
  }

  createWaterSplash(x, y) {
    this.splashRipples = this.splashRipples ?? [];
    [0, 110, 220].forEach((delay, index) => {
      const ripple = this.add
        .ellipse(x, y + index * 2, 18, 7, 0x74f7ff, 0)
        .setStrokeStyle(2, 0x74f7ff, 0.72)
        .setDepth(1.7)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.splashRipples.push(ripple);
      this.tweens.add({
        targets: ripple,
        scaleX: 2.2 + index * 0.34,
        scaleY: 1.7 + index * 0.18,
        alpha: { from: 0.76, to: 0 },
        delay,
        duration: 520,
        ease: "Sine.easeOut",
        onComplete: () => ripple.destroy(),
      });
    });

    for (let i = 0; i < 8; i += 1) {
      const droplet = this.add
        .circle(x, y, 2, 0x8af8ff, 0.82)
        .setDepth(1.72)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.splashRipples.push(droplet);
      this.tweens.add({
        targets: droplet,
        x: x + Phaser.Math.Between(-34, 34),
        y: y + Phaser.Math.Between(-20, 4),
        alpha: 0,
        scale: 0.2,
        duration: 430 + Phaser.Math.Between(0, 140),
        ease: "Quad.easeOut",
        onComplete: () => droplet.destroy(),
      });
    }
  }

  finishFailureSequence() {
    if (this.sequenceMode === "failureComplete") return;
    this.sequenceMode = "failureComplete";
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "failure",
      message: "The forest rejects the map. Use a 3x3 int[,] pathMap with the safe route.",
    });
  }

  getFailureLine(submittedPathMap, validationMessage = "") {
    const normalizedMessage = validationMessage.toLowerCase();
    if (
      normalizedMessage.includes("unexpected array") ||
      normalizedMessage.includes("only \"pathmap\"") ||
      normalizedMessage.includes("exactly one 2d")
    ) {
      return "That is not a map.";
    }
    if (
      normalizedMessage.includes("rows") ||
      normalizedMessage.includes("columns") ||
      !Array.isArray(submittedPathMap)
    ) {
      return "Your route map has the wrong shape.";
    }
    return "That path loops back into darkness.";
  }

  walkRoute() {
    const target = this.routeTravelTargets?.[this.routeTargetIndex];
    if (!target) {
      this.finishSuccessSequence();
      return;
    }

    this.playAnimation("player-run-arrays-6");
    this.player.setFlipX(false);
    this.createFootDust(this.player.x - 9, this.player.y - 3);

    if (target.type === "climb") {
      this.startRouteClimb(target);
      return;
    }

    const dx = target.x - this.player.x;
    if (Math.abs(dx) <= 4) {
      this.player.setPosition(target.x, target.y);
      this.routeTargetIndex += 1;
      return;
    }

    const step = (PLAYER_WALK_SPEED * this.game.loop.delta) / 1000;
    this.player.y = target.y;
    this.player.x += Math.sign(dx) * Math.min(step, Math.abs(dx));
  }

  buildRouteTravelTargets() {
    const targets = [];
    let currentY = this.player.y;

    this.routePoints.forEach((routePoint) => {
      targets.push({
        type: "run",
        x: routePoint.x,
        y: currentY,
      });

      if (Math.abs(routePoint.y - currentY) > 4) {
        targets.push({
          type: "climb",
          x: routePoint.x,
          y: routePoint.y,
        });
      }

      currentY = routePoint.y;
    });

    targets.push({
      type: "run",
      x: this.exitPoint.x,
      y: currentY,
    });

    return targets;
  }

  startRouteClimb(target) {
    this.sequenceMode = "climbingRoute";
    this.playAnimation("player-idle-arrays-6");
    this.player.setFlipX(false);
    this.player.setX(target.x);

    this.schedule(160, () => {
      this.playAnimation("player-climb-arrays-6");
      this.tweens.add({
        targets: this.player,
        y: target.y,
        duration: Math.abs(target.y - this.player.y) > 80 ? 780 : 560,
        ease: "Sine.easeInOut",
        onComplete: () => {
          this.player.setPosition(target.x, target.y);
          this.playAnimation("player-idle-arrays-6");
          this.createFootDust(target.x, target.y - 3);
          this.schedule(140, () => {
            this.routeTargetIndex += 1;
            this.playAnimation("player-run-arrays-6");
            this.sequenceMode = "walkingRoute";
          });
        },
      });
    });
  }

  finishSuccessSequence() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "exiting";
    this.playAnimation("player-idle-arrays-6");
    this.createFootDust(this.player.x, this.player.y - 3);
    this.schedule(240, () => {
      this.tweens.add({
        targets: this.player,
        x: this.player.x + 34,
        alpha: 0,
        duration: 520,
        ease: "Sine.easeInOut",
        onComplete: () => {
          this.sequenceMode = "complete";
          gameEvents.emit(GAME_LEVEL_OUTCOME, {
            levelNumber: LEVEL_NUMBER,
            status: "success",
            message: "Branching path restored. Arrays Level 6 cleared.",
            shouldProceed: true,
          });
        },
      });
    });
  }

  createFootDust(x, y) {
    if (this.lastDustTime && this.time.now - this.lastDustTime < 180) return;
    this.lastDustTime = this.time.now;
    const dust = this.add
      .ellipse(x, y, 10, 5, 0xcbd4cc, 0.34)
      .setDepth(1.48)
      .setAlpha(0.34);
    this.tweens.add({
      targets: dust,
      x: x - 12,
      scaleX: 1.75,
      scaleY: 0.72,
      alpha: 0,
      duration: 360,
      ease: "Sine.easeOut",
      onComplete: () => dust.destroy(),
    });
  }

  schedule(delay, callback) {
    const timer = this.time.delayedCall(delay, callback);
    this.sequenceTimers.push(timer);
    return timer;
  }

  playAnimation(key) {
    if (!this.player || this.player.anims.currentAnim?.key === key) return;
    this.player.play(key, true);
  }

  cleanupScene() {
    this.previewTween?.stop();
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.input.off("pointerdown", this.onCameraPointerDown, this);
    this.input.off("pointermove", this.onCameraPointerMove, this);
    this.input.off("pointerup", this.onCameraPointerUp, this);
    this.input.off("pointerupoutside", this.onCameraPointerUp, this);
    this.input.off("wheel", this.onCameraWheel, this);
    this.sequenceTimers?.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.splashRipples?.forEach((ripple) => ripple.destroy());
    this.splashRipples = [];
    this.waterGlints?.forEach((glint) => glint.destroy());
    this.waterGlints = [];
  }
}
