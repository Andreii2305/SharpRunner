import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";

const LEVEL_NUMBER = 12;
const PLAYER_SCALE = 2;
const PLAYER_SPEED = 185;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_ASSET_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const GH_BG_BASE = `${GH_ASSET_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const LEVEL_MAP_KEY = "arrays_level_7_kapre_name_tags";
const LEVEL_MAP_PATH = `${ASSET_BASE}/maps/arrays-level-7-kapre-name-tags.tmj`;
const NAME_TAGS = ["Lina", "Tomas", "Mira", "Niko"];
const CORRUPTED_INDEX = 2;
const MANANGY_FRAME_SIZE = 256;
const SIGN_TEXT_OFFSET_Y = 28;
const PLAYER_ANIMATIONS = [
  { key: "player-idle-arrays-7", start: 0, end: 5, frameRate: 6, repeat: -1 },
  { key: "player-run-arrays-7", start: 16, end: 23, frameRate: 12, repeat: -1 },
  { key: "player-death-arrays-7", start: 48, end: 55, frameRate: 10, repeat: 0 },
];

export default class ArraysLevelSevenScene extends Phaser.Scene {
  constructor() {
    super("ArraysLevelSevenScene");
  }

  preload() {
    this.load.tilemapTiledJSON(LEVEL_MAP_KEY, LEVEL_MAP_PATH);
    this.load.image("arrays_7_floor_tiles", `${GH_ASSET_BASE}/Floor_Tiles2.png`);
    this.load.image("arrays_7_decor_tiles", `${GH_ASSET_BASE}/Decor.png`);
    this.load.image("arrays_7_garden_decor_tiles", `${GH_ASSET_BASE}/Garden_Decorations.png`);
    this.load.image("arrays_7_pine_trees_tiles", `${GH_ASSET_BASE}/Pine_Trees.png`);
    this.load.image("arrays_7_house_tiles", `${GH_ASSET_BASE}/House_Tiles.png`);
    this.load.image("arrays_7_other_tiles_2", `${GH_ASSET_BASE}/Other_Tiles2.png`);
    this.load.image("arrays_7_other_tiles_2_flipped", `${GH_ASSET_BASE}/Other_Tiles2(Flipped).png`);
    this.load.image("arrays_7_pine_forest_tiles", `${GH_ASSET_BASE}/Pine_forest_sheet.png`);
    this.load.image("arrays_7_weeping_willow_big", `${GH_ASSET_BASE}/Weeping_Willow1Big.png`);
    this.load.image("arrays_7_large_tent_tiles", `${GH_ASSET_BASE}/Large_Tent.png`);
    this.load.image(
      "arrays_7_lamp_post_tall",
      `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze/Lamp-Post-2-TALL.png`,
    );
    this.load.image(
      "arrays_7_lamp_post_short",
      `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze/Lamp-Post-2-SHORT.png`,
    );
    this.load.image("arrays_7_signage_1", `${ASSET_BASE}/other/signage1.png`);
    this.load.image("arrays_7_signage_2", `${ASSET_BASE}/other/signage2.png`);
    this.load.spritesheet(
      "player_sheet_blue_arrays_7",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    this.load.spritesheet(
      "arrays_7_kapre_idle",
      `${ASSET_BASE}/characters/monsters/Manangy-fly_idle.png`,
      { frameWidth: MANANGY_FRAME_SIZE, frameHeight: MANANGY_FRAME_SIZE },
    );
    this.load.image("arrays_7_bg5", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("arrays_7_bg_castle", `${GH_BG_BASE}/Background_Castle.png`);
    this.load.image("arrays_7_bg4", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("arrays_7_bg3", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("arrays_7_bg2", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("arrays_7_bg1", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
  }

  create() {
    this.scale.resize(1024, 576);
    const map = this.make.tilemap({ key: LEVEL_MAP_KEY });
    const offsetY = this.scale.height - map.heightInPixels;

    this.sequenceTimers = [];
    this.sequenceMode = "idle";
    this.createParallaxBackgrounds(map);
    this.createAnimations();
    this.createTileMapLayers(map, offsetY);
    this.points = this.resolveMapPoints(map, offsetY);

    this.spawnPoint = this.points.player_spawn ?? { x: 96, y: 448 + offsetY };
    this.exitPoint = this.points.level_exit ?? { x: map.widthInPixels - 96, y: this.spawnPoint.y };
    this.kaprePoint = this.points.kapre_spawn ?? this.points.spirit_spawn ?? { x: this.exitPoint.x - 180, y: this.spawnPoint.y - 42 };
    this.gatePoint = this.points.gate ?? this.points.ward_gate ?? { x: this.exitPoint.x - 72, y: this.spawnPoint.y };
    this.tagPoints = NAME_TAGS.map((_, index) => (
      this.points[`tag_${index}`] ?? { x: 450 + index * 110, y: this.spawnPoint.y - 92 }
    ));

    this.createAtmosphere(map);
    this.createNameTags();
    this.createKapre();
    this.createGate();
    this.createPlayer();

    this.cameras.main.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);
    this.setupManualCameraControls(map, offsetY);
    this.setCameraScrollX(this.spawnPoint.x - 180);
    this.cameras.main.setBackgroundColor("#050916");
    this.player.play("player-idle-arrays-7");

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);
  }

  update() {
    if (!this.player) return;

    if (this.sequenceMode === "walkingToExit") {
      this.playAnimation("player-run-arrays-7");
      this.player.setFlipX(false);
      this.player.x += (PLAYER_SPEED * this.game.loop.delta) / 1000;
      if (this.player.x >= this.exitPoint.x) {
        this.finishSuccessSequence();
      }
      return;
    }

    if (this.sequenceMode === "idle") {
      this.playAnimation("player-idle-arrays-7");
    }
  }

  createParallaxBackgrounds(map) {
    const worldWidth = map?.widthInPixels ?? this.scale.width;
    const backgrounds = [
      { key: "arrays_7_bg5", factor: 0.08, depth: -8, alpha: 0.82, y: 0 },
      { key: "arrays_7_bg_castle", factor: 0.08, depth: -7, alpha: 0.3, y: 0 },
      { key: "arrays_7_bg4", factor: 0.12, depth: -6, alpha: 0.72, y: 0 },
      { key: "arrays_7_bg3", factor: 0.34, depth: -5, alpha: 0.66, y: 90 },
      { key: "arrays_7_bg2", factor: 0.62, depth: -4, alpha: 0.62, y: 184 },
      { key: "arrays_7_bg1", factor: 0.84, depth: -3, alpha: 0.52, y: 230 },
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
    const tilesets = [
      map.addTilesetImage("Floor_Tiles2", "arrays_7_floor_tiles"),
      map.addTilesetImage("Decor", "arrays_7_decor_tiles"),
      map.addTilesetImage("Garden_Decorations", "arrays_7_garden_decor_tiles"),
      map.addTilesetImage("Pine_Trees", "arrays_7_pine_trees_tiles"),
      map.addTilesetImage("House_Tiles", "arrays_7_house_tiles"),
      map.addTilesetImage("Other_Tiles2", "arrays_7_other_tiles_2"),
      map.addTilesetImage("Other_Tiles2(Flipped)", "arrays_7_other_tiles_2_flipped"),
      map.addTilesetImage("Pine_forest_sheet", "arrays_7_pine_forest_tiles"),
      map.addTilesetImage("Weeping_Willow1Big", "arrays_7_weeping_willow_big"),
      map.addTilesetImage("Large_Tent", "arrays_7_large_tent_tiles"),
      map.addTilesetImage("Lamp Post 2 TALL", "arrays_7_lamp_post_tall"),
      map.addTilesetImage("Lamp Post 2 SHORT", "arrays_7_lamp_post_short"),
      map.addTilesetImage("signage1", "arrays_7_signage_1"),
      map.addTilesetImage("signage2", "arrays_7_signage_2"),
    ].filter(Boolean);

    this.createVisualTileLayer(map, "platform", tilesets, offsetY, 0.1, 0xffffff, 1);
    this.createVisualTileLayer(map, "trees", tilesets, offsetY, 0.18, 0xd4dfd6, 0.94);
    this.createVisualTileLayer(map, "decoration", tilesets, offsetY, 0.2, 0xcfd8df, 0.94);
    this.createVisualTileLayer(map, "front_decoration", tilesets, offsetY, 1.35, 0xe4edf3, 0.96);
  }

  createVisualTileLayer(map, layerName, tilesets, offsetY, depth, tint, alpha) {
    const layer = map.createLayer(layerName, tilesets, 0, offsetY);
    if (!layer) return null;
    layer.setDepth(depth);
    layer.setTint(tint);
    layer.setAlpha(alpha);
    return layer;
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
    this.cameras.main.stopFollow();
    this.manualCameraEnabled = true;
  }

  followPlayerCamera() {
    this.manualCameraEnabled = false;
    this.cameraDragState = null;
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
  }

  createAtmosphere(map) {
    const worldWidth = map?.widthInPixels ?? this.scale.width;
    this.add
      .rectangle(0, 0, worldWidth, this.scale.height, 0x07101b, 0.16)
      .setOrigin(0, 0)
      .setDepth(0.24);
  }

  createAnimations() {
    PLAYER_ANIMATIONS.forEach(({ key, start, end, frameRate, repeat }) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("player_sheet_blue_arrays_7", { start, end }),
        frameRate,
        repeat,
      });
    });

    if (!this.anims.exists("arrays-7-kapre-idle")) {
      this.anims.create({
        key: "arrays-7-kapre-idle",
        frames: this.anims.generateFrameNumbers("arrays_7_kapre_idle", { start: 0, end: 24 }),
        frameRate: 9,
        repeat: -1,
      });
    }
  }

  createNameTags() {
    this.nameTags = this.tagPoints.map((point, index) => {
      const container = this.add.container(point.x, point.y + SIGN_TEXT_OFFSET_Y).setDepth(1.52);
      const checkGlow = this.add
        .ellipse(0, 1, 58, 25, index === CORRUPTED_INDEX ? 0xff2f4f : 0xffdf8e, 0)
        .setBlendMode(Phaser.BlendModes.ADD);
      const nameText = this.add
        .text(0, 0, NAME_TAGS[index], {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "15px",
          fontStyle: "bold",
          color: "#251207",
          align: "center",
        })
        .setOrigin(0.5)
        .setStroke("#ffe2a0", 3)
        .setShadow(1, 2, "#120804", 2, true, true);
      const indexText = this.add
        .text(0, -31, `[${index}]`, {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#d7eef2",
          align: "center",
        })
        .setOrigin(0.5)
        .setAlpha(0.58)
        .setStroke("#07101b", 3);
      const clue = this.add
        .circle(0, -15, 3, 0xff3048, index === CORRUPTED_INDEX ? 0.24 : 0)
        .setBlendMode(Phaser.BlendModes.ADD);
      const checkMark = this.add
        .text(0, -44, "OK", {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "10px",
          fontStyle: "bold",
          color: "#b8ffd1",
          align: "center",
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setScale(0.55)
        .setStroke("#08351b", 3);
      container.add([checkGlow, clue, nameText, indexText, checkMark]);
      if (index === CORRUPTED_INDEX) {
        this.tweens.add({
          targets: clue,
          alpha: 0.04,
          scale: 1.8,
          duration: 1550,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
      return {
        container,
        checkGlow,
        checkMark,
        clue,
        indexText,
        nameText,
        checked: false,
      };
    });
    this.createArrayMemoryGuide();
    this.startNameTagIdlePulse();
  }

  createArrayMemoryGuide() {
    const firstTag = this.nameTags[0];
    const lastTag = this.nameTags[this.nameTags.length - 1];
    if (!firstTag || !lastTag) return;

    const y = Math.max(...this.nameTags.map((tag) => tag.container.y)) + 25;
    const startX = firstTag.container.x - 30;
    const endX = lastTag.container.x + 30;
    this.arrayGuide = this.add.container(0, 0).setDepth(1.48).setAlpha(0.46);

    const line = this.add
      .rectangle((startX + endX) / 2, y, endX - startX, 1, 0x9edff0, 0.42)
      .setBlendMode(Phaser.BlendModes.ADD);
    const leftCap = this.add.rectangle(startX, y - 4, 1, 8, 0x9edff0, 0.42);
    const rightCap = this.add.rectangle(endX, y - 4, 1, 8, 0x9edff0, 0.42);
    const arrayName = this.add
      .text(startX - 8, y + 8, "names[]", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#bcecff",
      })
      .setOrigin(1, 0.5)
      .setStroke("#07101b", 3);
    this.arrayGuide.add([line, leftCap, rightCap, arrayName]);
  }

  startNameTagIdlePulse() {
    this.stopNameTagIdlePulse();
    this.nameTagPulseTweens = this.nameTags.map((tag, index) =>
      this.tweens.add({
        targets: tag.container,
        scaleX: 1.025,
        scaleY: 1.025,
        duration: 900 + index * 70,
        delay: index * 110,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      }),
    );
  }

  stopNameTagIdlePulse() {
    this.nameTagPulseTweens?.forEach((tween) => tween.remove(false));
    this.nameTagPulseTweens = [];
  }

  createKapre() {
    this.kapre = this.add.container(this.kaprePoint.x, this.kaprePoint.y - 40).setDepth(1.5);
    const aura = this.add
      .ellipse(0, 18, 136, 148, 0x6b1020, 0.18)
      .setBlendMode(Phaser.BlendModes.ADD);
    const coreGlow = this.add
      .ellipse(0, 12, 86, 112, 0xff3158, 0.07)
      .setBlendMode(Phaser.BlendModes.ADD);
    const sprite = this.add
      .sprite(0, 0, "arrays_7_kapre_idle", 0)
      .setScale(0.66)
      .setTint(0x6f303b)
      .setAlpha(0.96)
      .setFlipX(true);
    sprite.play("arrays-7-kapre-idle");
    this.kapreAura = aura;
    this.kapreCoreGlow = coreGlow;
    this.kapreSprite = sprite;
    this.kapre.add([aura, coreGlow, sprite]);
    this.startKapreIdleTween();
    this.kapreLabel = this.add
      .text(this.kaprePoint.x, this.kaprePoint.y - 142, "Find the cursed name.", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#ffe8b0",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setStroke("#050916", 4)
      .setShadow(0, 2, "#000000", 3, true, true)
      .setDepth(1.55);
  }

  startKapreIdleTween() {
    this.tweens.add({
      targets: this.kapre,
      y: this.kapre.y - 6,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createGate() {
    this.gate = this.add.container(this.gatePoint.x, this.gatePoint.y - 28).setDepth(1.45);
  }

  createPlayer() {
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "player_sheet_blue_arrays_7")
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.6);
  }

  onCodeEvaluated({ levelNumber, isCorrect, values, message }) {
    if (levelNumber !== LEVEL_NUMBER) return;
    this.resetAttemptState();

    if (isCorrect) {
      this.startSuccessSequence(values?.visitedIndexes ?? [0, 1, 2, 3]);
      return;
    }

    this.startFailureSequence(values?.visitedIndexes ?? [], message);
  }

  resetAttemptState() {
    this.sequenceTimers?.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.stopNameTagIdlePulse();
    this.tweens.killTweensOf([
      this.player,
      this.kapre,
      this.kapreAura,
      this.kapreCoreGlow,
      this.kapreSprite,
      this.kapreLabel,
      this.gate,
      this.arrayGuide,
      ...this.nameTags.flatMap(({ container, checkGlow, checkMark, clue, indexText, nameText }) => [
        container,
        checkGlow,
        checkMark,
        clue,
        indexText,
        nameText,
      ]),
    ]);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y).setAlpha(1).setScale(PLAYER_SCALE);
    this.enableManualCamera();
    this.kapre.setPosition(this.kaprePoint.x, this.kaprePoint.y - 40).setAlpha(1).setScale(1);
    this.kapreAura?.setFillStyle(0x6b1020, 0.18).setAlpha(1);
    this.kapreCoreGlow?.setFillStyle(0xff3158, 0.07).setAlpha(1);
    this.kapreSprite?.setTint(0x6f303b).setAlpha(0.96).setScale(0.66);
    this.startKapreIdleTween();
    this.kapreLabel.setText("Find the cursed name.").setColor("#ffe8b0").setAlpha(1);
    this.gate.setAlpha(1).setScale(1);
    this.arrayGuide?.setAlpha(0.46);
    this.nameTags.forEach((tag, index) => {
      tag.container.setAlpha(1).setScale(1);
      tag.container.setPosition(this.tagPoints[index].x, this.tagPoints[index].y + SIGN_TEXT_OFFSET_Y);
      tag.checkGlow.setAlpha(0).setFillStyle(tag === this.nameTags[CORRUPTED_INDEX] ? 0xff2f4f : 0xffdf8e, 0);
      tag.checkMark.setAlpha(0).setScale(0.55).setColor("#b8ffd1").setStroke("#08351b", 3);
      tag.clue
        .setAlpha(tag === this.nameTags[CORRUPTED_INDEX] ? 0.24 : 0)
        .setScale(1)
        .setFillStyle(0xff3048, tag === this.nameTags[CORRUPTED_INDEX] ? 0.24 : 0);
      tag.indexText.setAlpha(0.58).setColor("#d7eef2");
      tag.nameText
        .setColor("#251207")
        .setAlpha(1)
        .setScale(1)
        .setStroke("#ffe2a0", 3);
      tag.checked = false;
    });
    const corruptedTag = this.nameTags[CORRUPTED_INDEX];
    if (corruptedTag) {
      this.tweens.add({
        targets: corruptedTag.clue,
        alpha: 0.04,
        scale: 1.8,
        duration: 1550,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    this.startNameTagIdlePulse();
    this.sequenceMode = "idle";
    this.playAnimation("player-idle-arrays-7");
  }

  startSuccessSequence(visitedIndexes) {
    this.sequenceMode = "checking";
    this.stopNameTagIdlePulse();
    this.manualCameraEnabled = false;
    this.cameraDragState = null;
    this.kapreLabel.setText("Search each sign... no skips.").setColor("#d8ffd9");
    this.arrayGuide?.setAlpha(0.7);
    this.createTraversalScanLine();
    NAME_TAGS.forEach((_, index) => {
      this.schedule(index * 420, () => this.checkTag(index, true));
    });
    this.schedule(NAME_TAGS.length * 420 + 240, () => this.burnCorruptedTag());
    this.schedule(NAME_TAGS.length * 420 + 620, () => this.panCameraToKapre());
    this.schedule(NAME_TAGS.length * 420 + 1180, () => this.openGateAndExit());
  }

  startFailureSequence(visitedIndexes, message = "") {
    this.sequenceMode = "failure";
    this.stopNameTagIdlePulse();
    const safeVisited = visitedIndexes.length ? visitedIndexes : [0];
    this.manualCameraEnabled = false;
    this.cameraDragState = null;
    this.kapreLabel.setText(this.getFailureLine(message)).setColor("#ffc5c5");
    safeVisited.forEach((index, order) => {
      if (index < 0 || index >= this.nameTags.length) return;
      this.schedule(order * 360, () => this.checkTag(index, false));
    });
    this.schedule(safeVisited.length * 360 + 80, () => {
      this.panCameraToKapre();
    });
    this.schedule(safeVisited.length * 360 + 640, () => {
      this.nameTags.forEach((tag, index) => {
        if (safeVisited.includes(index)) return;
        this.tweens.add({
          targets: tag.container,
          alpha: 0.34,
          duration: 240,
          ease: "Sine.easeOut",
        });
        this.tweens.add({
          targets: tag.container,
          x: tag.container.x + 4,
          duration: 70,
          yoyo: true,
          repeat: 5,
          ease: "Sine.easeInOut",
        });
      });
      this.tweens.add({
        targets: this.kapre,
        x: this.kapre.x - 20,
        duration: 110,
        yoyo: true,
        repeat: 4,
        ease: "Sine.easeInOut",
      });
      this.kapreLabel.setText("You skipped one.").setColor("#ffb0b0");
      this.kapreCoreGlow?.setFillStyle(0xff2545, 0.24).setAlpha(1);
      this.kapreSprite?.setTint(0xb83b4a);
      this.tweens.add({
        targets: this.kapreSprite,
        alpha: 0.58,
        duration: 120,
        yoyo: true,
        repeat: 5,
        ease: "Sine.easeInOut",
      });
      this.player.play("player-death-arrays-7", true);
    });
    this.schedule(safeVisited.length * 360 + 1420, () => {
      this.panCameraToPlayer();
    });
    this.schedule(safeVisited.length * 360 + 1980, () => {
      this.restoreAfterFailure();
      this.enableManualCamera();
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message: "Traversal failed. Use a for loop to check every names[i] value.",
      });
    });
  }

  restoreAfterFailure() {
    this.kapreLabel.setText("Try again: check every index.").setColor("#ffe8b0").setAlpha(1);
    this.arrayGuide?.setAlpha(0.46);
    this.nameTags.forEach((tag, index) => {
      tag.container.setPosition(this.tagPoints[index].x, this.tagPoints[index].y + SIGN_TEXT_OFFSET_Y);
      tag.container.setAlpha(1).setScale(1);
      tag.checkGlow.setAlpha(0);
      tag.checkMark.setAlpha(0).setScale(0.55);
      tag.indexText.setAlpha(0.58).setColor("#d7eef2");
      tag.nameText.setColor("#251207").setAlpha(1).setStroke("#ffe2a0", 3);
    });
    this.startNameTagIdlePulse();
  }

  panCameraToKapre() {
    const targetX = this.kaprePoint.x - this.scale.width * 0.45;
    this.tweens.add({
      targets: this.cameras.main,
      scrollX: Phaser.Math.Clamp(
        targetX,
        this.cameraBounds?.minX ?? 0,
        this.cameraBounds?.maxX ?? 0,
      ),
      duration: 520,
      ease: "Sine.easeInOut",
    });
  }

  panCameraToPlayer() {
    const targetX = this.player.x - this.scale.width * 0.18;
    this.tweens.add({
      targets: this.cameras.main,
      scrollX: Phaser.Math.Clamp(
        targetX,
        this.cameraBounds?.minX ?? 0,
        this.cameraBounds?.maxX ?? 0,
      ),
      duration: 520,
      ease: "Sine.easeInOut",
    });
  }

  createTraversalScanLine() {
    const firstTag = this.nameTags[0];
    const lastTag = this.nameTags[this.nameTags.length - 1];
    if (!firstTag || !lastTag) return;

    const scanLine = this.add
      .rectangle(firstTag.container.x - 28, firstTag.container.y - 6, 5, 82, 0x9dfff3, 0.42)
      .setDepth(1.6)
      .setBlendMode(Phaser.BlendModes.ADD);
    const scanSpark = this.add
      .circle(firstTag.container.x - 28, firstTag.container.y - 48, 4, 0xe5fff8, 0.72)
      .setDepth(1.61)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: [scanLine, scanSpark],
      x: lastTag.container.x + 28,
      duration: NAME_TAGS.length * 420,
      ease: "Sine.easeInOut",
      onComplete: () => {
        scanLine.destroy();
        scanSpark.destroy();
      },
    });
  }

  checkTag(index, successTone) {
    const tag = this.nameTags[index];
    if (!tag) return;
    tag.checked = true;
    tag.checkGlow
      .setFillStyle(successTone ? 0x98ffb8 : 0xff6170, successTone ? 0.22 : 0.3)
      .setAlpha(successTone ? 0.22 : 0.3);
    tag.nameText
      .setColor(successTone ? "#154622" : "#6e1b18")
      .setStroke(successTone ? "#c9f2b6" : "#ffc0a8", 2);
    tag.indexText.setColor(successTone ? "#dcffe5" : "#ffc5c5").setAlpha(0.95);
    tag.checkMark
      .setColor(successTone ? "#b8ffd1" : "#ffb4b4")
      .setStroke(successTone ? "#08351b" : "#4c1010", 3)
      .setAlpha(1);
    this.tweens.add({
      targets: tag.container,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 150,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: tag.checkGlow,
      alpha: 0.04,
      duration: 360,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: tag.checkMark,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      ease: "Back.easeOut",
    });
  }

  burnCorruptedTag() {
    const tag = this.nameTags[CORRUPTED_INDEX];
    if (!tag) return;
    this.kapreLabel.setText("The corrupted tag is found.").setColor("#fff0ad");
    tag.checkGlow.setFillStyle(0xff4a1f, 0.42).setAlpha(0.42);
    tag.clue.setFillStyle(0xffdf75, 0.7).setAlpha(0.7).setScale(2.2);
    tag.checkMark.setColor("#ffe6a0").setStroke("#4a1806", 3);
    tag.indexText.setColor("#ffe7a6").setAlpha(1);
    tag.nameText.setColor("#b94b17").setStroke("#ffcf8a", 2);
    this.createCurseSmoke(tag.container.x, tag.container.y - 6);
    this.tweens.add({
      targets: tag.nameText,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 240,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: [tag.checkGlow, tag.clue],
      alpha: 0.12,
      duration: 720,
      ease: "Sine.easeOut",
    });
  }

  openGateAndExit() {
    this.kapreLabel.setText("Every index was checked.").setColor("#d8ffd9");
    this.tweens.add({
      targets: this.kapre,
      alpha: 0,
      y: this.kapre.y - 42,
      scaleX: 0.92,
      scaleY: 0.92,
      duration: 620,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.kapreLabel,
      alpha: 0,
      y: this.kapreLabel.y - 12,
      duration: 620,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.gate,
      alpha: 0,
      scaleY: 0.72,
      duration: 620,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.panCameraToPlayer();
        this.schedule(560, () => {
          this.followPlayerCamera();
          this.sequenceMode = "walkingToExit";
        });
      },
    });
  }

  createCurseSmoke(x, y) {
    const smokePuffs = [-18, -6, 8, 20].map((offsetX, index) =>
      this.add
        .ellipse(x + offsetX, y + Phaser.Math.Between(-5, 5), 18 + index * 3, 12 + index * 2, 0x2a1a1a, 0.36)
        .setDepth(1.57)
        .setBlendMode(Phaser.BlendModes.SCREEN),
    );

    smokePuffs.forEach((puff, index) => {
      this.tweens.add({
        targets: puff,
        y: puff.y - 26 - index * 4,
        x: puff.x + Phaser.Math.Between(-8, 8),
        alpha: 0,
        scaleX: 1.9,
        scaleY: 1.7,
        duration: 720 + index * 90,
        ease: "Sine.easeOut",
        onComplete: () => puff.destroy(),
      });
    });
  }

  finishSuccessSequence() {
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    this.playAnimation("player-idle-arrays-7");
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: "Traversal complete: every names[i] was checked.",
      shouldProceed: true,
    });
  }

  getFailureLine(message = "") {
    const normalized = message.toLowerCase();
    if (normalized.includes("correct order")) return "Those are not the signs.";
    if (normalized.includes("starts at 0")) return "Start at index 0.";
    if (normalized.includes("increments")) return "Use i++ to move forward.";
    if (normalized.includes(".length")) return "Use names.Length.";
    if (normalized.includes("inside the loop")) return "Use CheckName(names[i]).";
    if (normalized.includes("for loop")) return "The loop stopped too early.";
    return "Some names were skipped.";
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
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.input.off("pointerdown", this.onCameraPointerDown, this);
    this.input.off("pointermove", this.onCameraPointerMove, this);
    this.input.off("pointerup", this.onCameraPointerUp, this);
    this.input.off("pointerupoutside", this.onCameraPointerUp, this);
    this.input.off("wheel", this.onCameraWheel, this);
    this.sequenceTimers?.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
  }
}
