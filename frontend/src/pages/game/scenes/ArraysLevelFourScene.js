import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
  GAME_LEVEL_DIALOGUE_TRIGGERED,
  GAME_LEVEL_DIALOGUE_CLOSED,
} from "../gameEvents";

const LEVEL_NUMBER = 9;
const VILLAGER_THANKS_DIALOGUE_ID = "arrays-4-villager-thanks";
const PLAYER_SCALE = 2;
const PLAYER_GRAVITY = 1100;
const PLAYER_WALK_SPEED = 150;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_ASSET_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const GH_BG_BASE = `${GH_ASSET_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const LANTERN_BASE = `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack`;
const POST_BASE = `${LANTERN_BASE}/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze`;
const FARMER_BASE = `${ASSET_BASE}/characters/gandalfChar`;
const FARMER_SHEET_BASE = `${FARMER_BASE}/gandalfHardcoreCharacterAssetPack`;
const INVENTORY_ITEMS = ["candle", "key", "map"];
const REQUIRED_ITEM = "key";
const REQUIRED_INDEX = 1;
const FARMER_FRAME_WIDTH = 80;
const FARMER_FRAME_HEIGHT = 64;
const FARMER_WALK_DURATION_MS = 1500;
const FARMER_LAYER_KEYS = [
  "arrays_4_farmer_skin",
  "arrays_4_farmer_pants",
  "arrays_4_farmer_shirt",
  "arrays_4_farmer_hat",
  "arrays_4_farmer_hoe",
];
const PLAYER_ANIMATIONS = [
  { key: "player-idle-arrays-4", start: 0, end: 5, frameRate: 6, repeat: -1 },
  { key: "player-run-arrays-4", start: 16, end: 23, frameRate: 12, repeat: -1 },
  { key: "player-jump-arrays-4", start: 24, end: 31, frameRate: 10, repeat: -1 },
  { key: "player-death-arrays-4", start: 40, end: 47, frameRate: 10, repeat: 0 },
];

export default class ArraysLevelFourScene extends Phaser.Scene {
  constructor() {
    super("ArraysLevelFourScene");
  }

  preload() {
    this.load.tilemapTiledJSON(
      "arrays_level_4_base",
      `${ASSET_BASE}/maps/arrays-level-4-midnight-inventory.tmj`,
    );
    this.load.image("arrays_4_floor_tiles", `${GH_ASSET_BASE}/Floor_Tiles2.png`);
    this.load.image("arrays_4_decor_tiles", `${GH_ASSET_BASE}/Decor.png`);
    this.load.image("arrays_4_garden_decor_tiles", `${GH_ASSET_BASE}/Garden_Decorations.png`);
    this.load.image("arrays_4_pine_trees_tiles", `${GH_ASSET_BASE}/Pine_Trees.png`);
    this.load.image("arrays_4_house_tiles", `${GH_ASSET_BASE}/House_Tiles.png`);
    this.load.image("arrays_4_other_tiles_2", `${GH_ASSET_BASE}/Other_Tiles2.png`);
    this.load.image("arrays_4_pine_forest_tiles", `${GH_ASSET_BASE}/Pine_forest_sheet.png`);
    this.load.image("arrays_4_large_tent_tiles", `${GH_ASSET_BASE}/Large_Tent.png`);
    this.load.image("arrays_4_lamp_post_tall", `${POST_BASE}/Lamp-Post-2-TALL.png`);
    this.load.image("arrays_4_lamp_post_short", `${POST_BASE}/Lamp-Post-2-SHORT.png`);
    this.load.image("arrays_4_supply_box", `${ASSET_BASE}/other/box/1.png`);
    this.load.spritesheet("arrays_4_key", `${ASSET_BASE}/other/key.png`, {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet(
      "arrays_4_farmer_skin",
      `${FARMER_SHEET_BASE}/characterSkinColors/maleSkin3.png`,
      { frameWidth: FARMER_FRAME_WIDTH, frameHeight: FARMER_FRAME_HEIGHT },
    );
    this.load.spritesheet(
      "arrays_4_farmer_pants",
      `${FARMER_SHEET_BASE}/maleClothing/greenPants.png`,
      { frameWidth: FARMER_FRAME_WIDTH, frameHeight: FARMER_FRAME_HEIGHT },
    );
    this.load.spritesheet(
      "arrays_4_farmer_shirt",
      `${FARMER_SHEET_BASE}/maleClothing/Shirt.png`,
      { frameWidth: FARMER_FRAME_WIDTH, frameHeight: FARMER_FRAME_HEIGHT },
    );
    this.load.spritesheet(
      "arrays_4_farmer_hat",
      `${FARMER_BASE}/gandalfHardcore39xHats/maleHat/farmingHatM.png`,
      { frameWidth: FARMER_FRAME_WIDTH, frameHeight: FARMER_FRAME_HEIGHT },
    );
    this.load.spritesheet(
      "arrays_4_farmer_hoe",
      `${FARMER_BASE}/gandalfHardcore35xHandItems/maleHand/hoeM.png`,
      { frameWidth: FARMER_FRAME_WIDTH, frameHeight: FARMER_FRAME_HEIGHT },
    );
    this.load.spritesheet(
      "player_sheet_blue",
      `${ASSET_BASE}/characters/players/char_blue.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    this.load.image("arrays_4_bg5", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("arrays_4_bg_castle", `${GH_BG_BASE}/Background_Castle.png`);
    this.load.image("arrays_4_bg4", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("arrays_4_bg3", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("arrays_4_bg2", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("arrays_4_bg1", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
  }

  create() {
    this.scale.resize(1024, 576);
    const map = this.make.tilemap({ key: "arrays_level_4_base" });
    const offsetY = this.scale.height - map.heightInPixels;

    this.createParallaxBackgrounds(map);
    this.createPlayerAnimations();
    this.createVillagerAnimation();

    const floorTileset = map.addTilesetImage("Floor_Tiles2", "arrays_4_floor_tiles");
    const decorTileset = map.addTilesetImage("Decor", "arrays_4_decor_tiles");
    const gardenDecorTileset = map.addTilesetImage(
      "Garden_Decorations",
      "arrays_4_garden_decor_tiles",
    );
    const pineTreesTileset = map.addTilesetImage("Pine_Trees", "arrays_4_pine_trees_tiles");
    const houseTileset = map.addTilesetImage("House_Tiles", "arrays_4_house_tiles");
    const otherTileset = map.addTilesetImage("Other_Tiles2", "arrays_4_other_tiles_2");
    const pineForestTileset = map.addTilesetImage(
      "Pine_forest_sheet",
      "arrays_4_pine_forest_tiles",
    );
    const largeTentTileset = map.addTilesetImage("Large_Tent", "arrays_4_large_tent_tiles");
    const lampPostTallTileset = map.addTilesetImage(
      "Lamp Post 2 TALL",
      "arrays_4_lamp_post_tall",
    );
    const lampPostShortTileset = map.addTilesetImage(
      "Lamp Post 2 SHORT",
      "arrays_4_lamp_post_short",
    );
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
    ].filter(Boolean);

    const platformLayer = map.createLayer("platform", allTilesets, 0, offsetY);
    if (platformLayer) {
      platformLayer.setDepth(0);
      platformLayer.setCollision([2, 11], true);
    }
    this.createVisualTileLayer(map, "trees", allTilesets, offsetY, 0.01);
    this.createVisualTileLayer(map, "decoration", allTilesets, offsetY, 0.02);
    this.createVisualTileLayer(map, "front_decoration", allTilesets, offsetY, 0.03);

    this.cameras.main.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);
    this.physics.world.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);

    this.points = this.resolveMapPoints(map, offsetY);
    this.spawnPoint = this.points.player_spawn ?? { x: 96, y: 448 + offsetY };
    this.villagerPoint = this.points.villager_spawn ?? { x: 320, y: this.spawnPoint.y };
    this.doorPoint = this.points.house_door ?? { x: 660, y: this.spawnPoint.y - 15 };
    this.exitPoint = this.points.level_exit ?? { x: map.widthInPixels - 150, y: this.spawnPoint.y - 58 };
    this.floorY = this.spawnPoint.y;
    this.cratePoints = INVENTORY_ITEMS.map((_, index) => {
      const point = this.points[`crate_${index + 1}`];
      return point ?? { x: 415 + index * 72, y: this.floorY - 15 };
    });

    this.createPathDarkness(map);
    this.createVillager();
    this.createInventoryCrates();
    this.createHouseDoor();
    this.createPlayer();

    if (platformLayer) {
      this.physics.add.collider(this.player, platformLayer);
    }

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.sequenceMode = "idle";
    this.sequenceTimers = [];
    this.carriedItem = null;
    this.awaitingThanksDialogueClose = false;
    this.player.play("player-idle-arrays-4");

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.on(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);
  }

  update() {
    if (!this.player?.body) return;
    const onGround = this.player.body.blocked.down || this.player.body.touching.down;

    if (this.sequenceMode === "walkingToExit") {
      this.player.setVelocityX(PLAYER_WALK_SPEED);
      this.player.setFlipX(false);
      this.playAnimation(onGround ? "player-run-arrays-4" : "player-jump-arrays-4");

      if (this.player.x >= this.exitPoint.x) {
        this.finishSuccessSequence();
      }
      return;
    }

    if (this.sequenceMode !== "idle") {
      this.player.setVelocityX(0);
      return;
    }

    this.player.setVelocityX(0);
    this.playAnimation(onGround ? "player-idle-arrays-4" : "player-jump-arrays-4");
  }

  createParallaxBackgrounds(map) {
    const worldWidth = map?.widthInPixels ?? this.scale.width;
    const backgrounds = [
      { key: "arrays_4_bg5", factor: 0.1, depth: -8, alpha: 0.84, y: 0 },
      { key: "arrays_4_bg_castle", factor: 0.1, depth: -7, alpha: 0.48, y: 0 },
      { key: "arrays_4_bg4", factor: 0.1, depth: -6, alpha: 0.74, y: 0 },
      { key: "arrays_4_bg3", factor: 0.4, depth: -5, alpha: 0.72, y: 94 },
      { key: "arrays_4_bg2", factor: 0.7, depth: -4, alpha: 0.68, y: 186 },
      { key: "arrays_4_bg1", factor: 0.9, depth: -3, alpha: 0.64, y: 232 },
    ];

    backgrounds.forEach(({ key, factor, depth, alpha, y }) => {
      const bg = this.add.tileSprite(0, y, worldWidth, this.scale.height - y, key);
      bg.setOrigin(0, 0);
      bg.setScrollFactor(factor, 0);
      bg.setDepth(depth);
      bg.setTint(0x202a4d);
      bg.setAlpha(alpha);
    });

    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x050916, 0.3)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-2);
  }

  createVisualTileLayer(map, layerName, tilesets, offsetY, depth) {
    const layer = map.createLayer(layerName, tilesets, 0, offsetY);
    if (!layer) return null;
    layer.setDepth(depth);
    layer.setAlpha(0.88);
    layer.setTint(0xb9c2d4);
    return layer;
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

  createVillagerAnimation() {
    FARMER_LAYER_KEYS.forEach((layerKey) => {
      const idleAnimationKey = `${layerKey}_idle`;
      if (!this.anims.exists(idleAnimationKey)) {
        this.anims.create({
          key: idleAnimationKey,
          frames: this.anims.generateFrameNumbers(layerKey, { start: 0, end: 4 }),
          frameRate: 6,
          repeat: -1,
        });
      }

      const walkAnimationKey = `${layerKey}_walk`;
      if (this.anims.exists(walkAnimationKey)) return;
      this.anims.create({
        key: walkAnimationKey,
        frames: this.anims.generateFrameNumbers(layerKey, { start: 10, end: 17 }),
        frameRate: 6,
        repeat: -1,
      });
    });

    if (!this.anims.exists("arrays-4-key-spin")) {
      this.anims.create({
        key: "arrays-4-key-spin",
        frames: this.anims.generateFrameNumbers("arrays_4_key", { start: 0, end: 11 }),
        frameRate: 12,
        repeat: -1,
      });
    }
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

  createPathDarkness(map) {
    const darknessTopY = this.floorY + 5;
    const darknessHeight = Math.max(112, map.heightInPixels - darknessTopY + 96);
    this.add
      .rectangle(
        map.widthInPixels / 2,
        darknessTopY + darknessHeight / 2,
        map.widthInPixels,
        darknessHeight,
        0x010409,
        0.5,
      )
      .setDepth(0.04);
  }

  createVillager() {
    this.villagerSprites = FARMER_LAYER_KEYS.map((key) =>
      this.add
        .sprite(0, 0, key, 0)
        .setOrigin(0.5, 1)
        .setFlipX(true),
    );
    this.villager = this.add
      .container(this.villagerPoint.x, this.floorY + 1, this.villagerSprites)
      .setScale(1.35)
      .setDepth(1.14);
    this.villagerShadow = this.add
      .ellipse(this.villagerPoint.x, this.floorY + 4, 46, 10, 0x02050a, 0.44)
      .setDepth(1.05);

    this.villagerLabel = this.add
      .text(this.villagerPoint.x, this.floorY - 82, "bring me the key", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#ffe9ad",
        backgroundColor: "rgba(5, 10, 21, 0.78)",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(1.3);
    this.playVillagerAnimation("idle");
  }

  playVillagerAnimation(animationType) {
    this.villagerSprites?.forEach((sprite) => {
      const key = `${sprite.texture.key}_${animationType}`;
      if (sprite.anims.currentAnim?.key === key) return;
      sprite.play(key, true);
    });
  }

  setVillagerFacing(direction) {
    const shouldFlip = direction === "right";
    this.villagerSprites?.forEach((sprite) => sprite.setFlipX(shouldFlip));
  }

  createInventoryCrates() {
    this.crates = this.cratePoints.map((point, index) => {
      const item = INVENTORY_ITEMS[index];
      const x = point.x;
      const y = Math.min(point.y + 7, this.floorY - 25);
      const container = this.add.container(x, y).setDepth(1.15);
      const shadow = this.add.ellipse(0, 18, 46, 9, 0x02050a, 0.48);
      const crate = this.add
        .image(0, 0, "arrays_4_supply_box")
        .setOrigin(0.5)
        .setScale(0.085)
        .setTint(item === REQUIRED_ITEM ? 0xc9b58c : 0x9eb0bf);
      const lid = this.add
        .rectangle(0, -10, 33, 9, item === REQUIRED_ITEM ? 0x8a5b20 : 0x4d5d69, 0.86)
        .setStrokeStyle(1, 0x24160a, 0.66);
      const keyInside = this.add
        .sprite(0, -16, "arrays_4_key", 0)
        .setOrigin(0.5)
        .setScale(0.42)
        .setTint(0xffe7a3)
        .setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD);
      const glow = this.add
        .ellipse(0, -2, 50, 40, item === REQUIRED_ITEM ? 0xf8d76b : 0x7ca0cc, 0)
        .setBlendMode(Phaser.BlendModes.ADD);
      container.add([shadow, glow, crate, lid, keyInside]);

      const itemLabel = this.add
        .text(x, y + 36, item, {
          fontFamily: "monospace",
          fontSize: "13px",
          color: item === REQUIRED_ITEM ? "#fff5bf" : "#dbe8ff",
          backgroundColor:
            item === REQUIRED_ITEM ? "rgba(70, 48, 8, 0.78)" : "rgba(9, 22, 43, 0.78)",
          padding: { x: 7, y: 3 },
        })
        .setOrigin(0.5)
        .setDepth(1.35);

      return {
        item,
        index,
        container,
        crate,
        lid,
        keyInside,
        glow,
        itemLabel,
        homeX: x,
        homeY: y,
      };
    });
  }

  createHouseDoor() {
    const x = this.doorPoint.x;
    const y = Math.min(this.doorPoint.y, this.floorY - 15);
    this.doorGlow = this.add
      .ellipse(x, y - 34, 106, 142, 0xffd56b, 0.1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(0.9);
    this.doorShadow = this.add
      .ellipse(x, this.floorY + 4, 82, 14, 0x02050a, 0.42)
      .setDepth(0.91);
    this.lockPlate = this.add
      .rectangle(x, y - 56, 44, 48, 0x151c2a, 0.86)
      .setStrokeStyle(2, 0xd9c08a, 0.7)
      .setDepth(1.2);
    this.lockBar = this.add
      .rectangle(x, y - 73, 28, 12, 0x2a3344, 0.96)
      .setStrokeStyle(1, 0xd9c08a, 0.66)
      .setDepth(1.22);
    this.keyhole = this.add
      .circle(x, y - 49, 6, 0x050916, 0.94)
      .setStrokeStyle(1, 0xd9c08a, 0.72)
      .setDepth(1.24);
    this.keyholeSlot = this.add
      .rectangle(x, y - 38, 5, 16, 0x050916, 0.94)
      .setDepth(1.24);
    this.doorLabel = this.add
      .text(x, y - 118, "LOCKED", {
        fontFamily: "monospace",
        fontSize: "15px",
        color: "#dbe8ff",
        backgroundColor: "rgba(5, 10, 21, 0.78)",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(1.35);
  }

  createPlayer() {
    this.player = this.physics.add.sprite(
      this.spawnPoint.x,
      this.spawnPoint.y,
      "player_sheet_blue",
    );
    this.player
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(1.25)
      .setCollideWorldBounds(true)
      .setGravityY(PLAYER_GRAVITY);
  }

  onCodeEvaluated({ levelNumber, isCorrect, values }) {
    if (levelNumber !== LEVEL_NUMBER) return;
    this.resetAttemptState();

    if (isCorrect) {
      this.startSuccessSequence();
      return;
    }

    const selectedIndex = Number.isInteger(values?.attackIndex)
      ? values.attackIndex
      : this.findSelectedIndex(values);
    this.startFailureSequence(selectedIndex);
  }

  findSelectedIndex(values) {
    const inventory = values?.inventory;
    const selected = values?.selectedItem;
    if (Array.isArray(inventory) && selected) {
      const index = inventory.indexOf(selected);
      if (index >= 0) return index;
    }
    return 0;
  }

  resetAttemptState() {
    this.sequenceTimers?.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.tweens.killTweensOf(this.player);
    this.tweens.killTweensOf([
      this.doorGlow,
      this.lockPlate,
      this.lockBar,
      this.keyhole,
      this.keyholeSlot,
      this.doorLabel,
      this.villager,
      this.villagerShadow,
      this.villagerLabel,
    ]);
    this.carriedItem?.destroy();
    this.carriedItem = null;

    this.crates?.forEach(({ item, container, crate, lid, keyInside, glow, itemLabel, homeX, homeY }) => {
      this.tweens.killTweensOf([container, crate, lid, keyInside, glow, itemLabel]);
      container.setPosition(homeX, homeY).setScale(1).setAngle(0).setAlpha(1);
      crate.setTint(item === REQUIRED_ITEM ? 0xc9b58c : 0x9eb0bf);
      lid.setPosition(0, -10).setRotation(0).setAlpha(1);
      keyInside.setAlpha(0).setPosition(0, -16).setScale(0.42);
      glow.setAlpha(0).setScale(1);
      itemLabel.setAlpha(1).setY(homeY + 36);
    });

    this.doorGlow?.setAlpha(0.1).setScale(1);
    this.lockPlate?.setAlpha(1).setFillStyle(0x151c2a, 0.86);
    this.lockBar?.setAlpha(1).setAngle(0);
    this.keyhole?.setAlpha(1);
    this.keyholeSlot?.setAlpha(1);
    this.doorLabel?.setText("LOCKED").setAlpha(1).setColor("#dbe8ff");
    this.villager?.setPosition(this.villagerPoint.x, this.floorY + 1).setScale(1.35);
    this.villagerShadow?.setPosition(this.villagerPoint.x, this.floorY + 4).setAlpha(0.44);
    this.villagerLabel?.setText("bring me the key").setAlpha(1);
    this.setVillagerFacing("left");
    this.playVillagerAnimation("idle");

    this.sequenceMode = "idle";
    this.player.body.enable = true;
    this.player.setAlpha(1);
    this.player.setScale(PLAYER_SCALE);
    this.player.setGravityY(PLAYER_GRAVITY);
    this.player.setVelocity(0, 0);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y);
    this.player.body.reset(this.spawnPoint.x, this.spawnPoint.y);
    this.playAnimation("player-idle-arrays-4");
  }

  startSuccessSequence() {
    this.sequenceMode = "selectingItem";
    const crate = this.crates[REQUIRED_INDEX];
    this.movePlayerTo(crate.container.x - 28, () => {
      this.openKeyCrate(crate, () => {
        this.collectCrate(crate, true, () => {
          this.giveKeyToVillager();
        });
      });
    });
  }

  startFailureSequence(selectedIndex) {
    this.sequenceMode = "selectingItem";
    const boundedIndex = Phaser.Math.Clamp(selectedIndex, 0, this.crates.length - 1);
    const crate = this.crates[boundedIndex] ?? this.crates[0];
    this.movePlayerTo(crate.container.x - 28, () => {
      this.collectCrate(crate, false, () => {
        this.rejectWrongItem(crate.item);
      });
    });
  }

  collectCrate(crate, isCorrect, onComplete) {
    crate.crate.setTint(isCorrect ? 0xffe7a3 : 0xff7d7d);
    this.tweens.add({
      targets: crate.glow,
      alpha: isCorrect ? 0.7 : 0.55,
      scaleX: 1.18,
      scaleY: 1,
      duration: 180,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: crate.itemLabel,
      y: crate.container.y + 44,
      duration: 180,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: crate.container,
      x: this.player.x + 20,
      y: this.player.y - 58,
      scaleX: 0.62,
      scaleY: 0.62,
      alpha: 0,
      duration: 360,
      ease: "Back.easeIn",
      onComplete: () => {
        crate.itemLabel.setAlpha(0);
        this.createCarriedItem(crate.item, isCorrect);
        onComplete?.();
      },
    });
  }

  openKeyCrate(crate, onComplete) {
    crate.keyInside.play("arrays-4-key-spin");
    this.tweens.add({
      targets: crate.glow,
      alpha: 0.76,
      scaleX: 1.18,
      scaleY: 1.08,
      duration: 180,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: crate.lid,
      y: -24,
      rotation: -0.62,
      duration: 280,
      ease: "Back.easeOut",
    });
    this.tweens.add({
      targets: crate.keyInside,
      alpha: 1,
      y: -38,
      scaleX: 1,
      scaleY: 1,
      duration: 360,
      ease: "Back.easeOut",
      onComplete,
    });
  }

  createCarriedItem(item, isCorrect) {
    this.carriedItem = this.add
      .sprite(
        this.player.x + 16,
        this.player.y - 82,
        item === REQUIRED_ITEM ? "arrays_4_key" : "arrays_4_supply_box",
        0,
      )
      .setOrigin(0.5)
      .setScale(item === REQUIRED_ITEM ? 0.9 : 0.04)
      .setTint(isCorrect ? 0xffe7a3 : 0xff7d7d)
      .setDepth(1.45);
    if (item === REQUIRED_ITEM) {
      this.carriedItem.play("arrays-4-key-spin");
      this.tweens.add({
        targets: this.carriedItem,
        y: this.carriedItem.y - 6,
        duration: 340,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  giveKeyToVillager() {
    this.sequenceMode = "givingKey";
    this.movePlayerTo(this.villagerPoint.x - 44, () => {
      this.villagerLabel.setAlpha(0);
      this.tweens.add({
        targets: this.carriedItem,
        x: this.villagerPoint.x + 10,
        y: this.floorY - 64,
        scaleX: 0.84,
        scaleY: 0.84,
        duration: 360,
        ease: "Sine.easeInOut",
        onComplete: () => {
          this.carriedItem.stop();
          this.setVillagerFacing("right");
          this.playVillagerAnimation("walk");
          this.tweens.add({
            targets: [this.villager, this.villagerShadow],
            x: this.doorPoint.x - 52,
            duration: FARMER_WALK_DURATION_MS,
            ease: "Sine.easeInOut",
            onComplete: () => {
              this.playVillagerAnimation("idle");
            },
          });
          this.tweens.add({
            targets: this.carriedItem,
            x: this.doorPoint.x - 42,
            y: this.floorY - 66,
            duration: FARMER_WALK_DURATION_MS,
            ease: "Sine.easeInOut",
            onComplete: () => this.unlockDoor(),
          });
        },
      });
    });
  }

  unlockDoor() {
    this.sequenceMode = "unlockingDoor";
    this.tweens.add({
      targets: this.carriedItem,
      x: this.lockPlate.x - 2,
      y: this.lockPlate.y + 8,
      duration: 300,
      ease: "Sine.easeInOut",
    });
    this.schedule(320, () => {
      this.doorLabel.setText("OPEN").setColor("#fff5bf");
      this.tweens.add({
        targets: [this.doorGlow, this.lockPlate, this.keyhole, this.keyholeSlot, this.carriedItem],
        alpha: 0.85,
        scaleX: 1.22,
        scaleY: 1.22,
        duration: 240,
        yoyo: true,
        ease: "Sine.easeOut",
        onComplete: () => {
          this.lockBar.setAngle(-32);
          this.lockBar.setFillStyle(0x8b6a2f, 0.92);
          this.keyhole.setAlpha(0);
          this.keyholeSlot.setAlpha(0);
          this.lockPlate.setAlpha(0.24);
          this.carriedItem?.destroy();
          this.carriedItem = null;
          this.player.setVelocity(0, 0);
          this.playAnimation("player-idle-arrays-4");
          this.sequenceMode = "thanksDialogue";
          this.schedule(650, () => {
            this.triggerThanksDialogue();
          });
        },
      });
    });
  }

  triggerThanksDialogue() {
    this.awaitingThanksDialogueClose = true;
    gameEvents.emit(GAME_LEVEL_DIALOGUE_TRIGGERED, {
      levelNumber: LEVEL_NUMBER,
      dialogueId: VILLAGER_THANKS_DIALOGUE_ID,
      dialogueSteps: [
        {
          speaker: "Villager",
          portraitImage: "villager1_portrait.png",
          portraitAlt: "Farmer villager portrait",
          lines: [
            { text: "Thank you, Kai. The house is open again.", tone: "normal" },
            { text: "You found the key by choosing the second inventory slot.", tone: "accent" },
          ],
        },
      ],
    });
  }

  onDialogueClosed({ levelNumber, dialogueId } = {}) {
    if (levelNumber !== LEVEL_NUMBER) return;
    if (dialogueId !== VILLAGER_THANKS_DIALOGUE_ID || !this.awaitingThanksDialogueClose) return;

    this.awaitingThanksDialogueClose = false;
    this.finishSuccessSequence();
  }

  rejectWrongItem(item) {
    this.sequenceMode = "failure";
    this.movePlayerTo(this.doorPoint.x - 48, () => {
      this.doorLabel.setText(`${item} won't open it`).setColor("#ffb8b8");
      this.villagerLabel.setText("wrong index");
      this.tweens.add({
        targets: [this.lockPlate, this.carriedItem],
        x: "+=10",
        duration: 70,
        yoyo: true,
        repeat: 3,
        ease: "Sine.easeInOut",
        onComplete: () => {
          gameEvents.emit(GAME_LEVEL_OUTCOME, {
            levelNumber: LEVEL_NUMBER,
            status: "failure",
            message: `The door needs the key at inventory[${REQUIRED_INDEX}], not ${item}.`,
          });
        },
      });
    });
  }

  movePlayerTo(targetX, onComplete) {
    const distance = Math.abs(targetX - this.player.x);
    const duration = Math.max(260, (distance / PLAYER_WALK_SPEED) * 1000);
    const carriedOffset = this.carriedItem
      ? { x: this.carriedItem.x - this.player.x, y: this.carriedItem.y - this.player.y }
      : null;

    this.player.setFlipX(targetX < this.player.x);
    this.playAnimation("player-run-arrays-4");
    if (carriedOffset) {
      this.tweens.add({
        targets: this.carriedItem,
        x: targetX + carriedOffset.x,
        y: this.player.y + carriedOffset.y,
        duration,
        ease: "Linear",
      });
    }
    this.tweens.add({
      targets: this.player,
      x: targetX,
      duration,
      ease: "Linear",
      onComplete: () => {
        this.player.setVelocityX(0);
        this.playAnimation("player-idle-arrays-4");
        onComplete?.();
      },
    });
  }

  schedule(delay, callback) {
    const timer = this.time.delayedCall(delay, callback);
    this.sequenceTimers.push(timer);
    return timer;
  }

  finishSuccessSequence() {
    this.sequenceMode = "complete";
    this.player.setVelocity(0, 0);
    this.playAnimation("player-idle-arrays-4");
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: "Inventory key selected. Arrays Level 4 cleared.",
      shouldProceed: true,
    });
  }

  playAnimation(key) {
    if (!this.player || this.player.anims.currentAnim?.key === key) return;
    this.player.play(key, true);
  }

  cleanupScene() {
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    gameEvents.off(GAME_LEVEL_DIALOGUE_CLOSED, this.onDialogueClosed, this);
    this.sequenceTimers?.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
  }
}
