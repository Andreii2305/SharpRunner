import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";

const LEVEL_NUMBER = 8;
const PLAYER_SCALE = 2;
const PLAYER_GRAVITY = 1100;
const PLAYER_WALK_SPEED = 150;
const FLAME_LINE_APPROACH_GAP = 86;
const FLAME_ATTACK_GAP = 54;
const BOSS_INDEX = 2;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_ASSET_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const GH_BG_BASE = `${GH_ASSET_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const LANTERN_BASE = `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack`;
const POST_BASE = `${LANTERN_BASE}/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze`;
const FIRE_SHEET_PATH = encodeURI(
  `${ASSET_BASE}/other/Pixel Fire Asset Pack v3.2/Pixel Fire Asset Pack v3.2 Colored/Pixel Fire Asset Pack v3.2 Red/Group 4 - 1/Group 4 - 1.png`,
);
const WISP_SHEET_PATH =
  `${ASSET_BASE}/characters/gandalfChar/gandalfHardcorePetCompanion/gandalfHardcoreWisp.png`;

const PLAYER_ANIMATIONS = [
  { key: "player-idle-arrays-3", start: 0, end: 5, frameRate: 6, repeat: -1 },
  { key: "player-attack-arrays-3", start: 8, end: 15, frameRate: 14, repeat: 0 },
  { key: "player-run-arrays-3", start: 16, end: 23, frameRate: 12, repeat: -1 },
  { key: "player-jump-arrays-3", start: 24, end: 31, frameRate: 10, repeat: -1 },
];

export default class ArraysLevelThreeScene extends Phaser.Scene {
  constructor() {
    super("ArraysLevelThreeScene");
  }

  preload() {
    this.load.tilemapTiledJSON(
      "arrays_level_3_base",
      `${ASSET_BASE}/maps/arrays-level-3-road-of-santelmo.tmj`,
    );
    this.load.image("arrays_3_floor_tiles", `${GH_ASSET_BASE}/Floor_Tiles2.png`);
    this.load.image("arrays_3_decor_tiles", `${GH_ASSET_BASE}/Decor.png`);
    this.load.image("arrays_3_garden_decor_tiles", `${GH_ASSET_BASE}/Garden_Decorations.png`);
    this.load.image("arrays_3_pine_trees_tiles", `${GH_ASSET_BASE}/Pine_Trees.png`);
    this.load.image("arrays_3_house_tiles", `${GH_ASSET_BASE}/House_Tiles.png`);
    this.load.image("arrays_3_other_tiles_2", `${GH_ASSET_BASE}/Other_Tiles2.png`);
    this.load.image("arrays_3_pine_forest_tiles", `${GH_ASSET_BASE}/Pine_forest_sheet.png`);
    this.load.image("arrays_3_lamp_post_tall", `${POST_BASE}/Lamp-Post-2-TALL.png`);
    this.load.image("arrays_3_lamp_post_short", `${POST_BASE}/Lamp-Post-2-SHORT.png`);
    this.load.spritesheet("arrays_3_fire", FIRE_SHEET_PATH, {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("arrays_3_wisp", WISP_SHEET_PATH, {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet(
      "player_sheet_blue",
      `${ASSET_BASE}/characters/players/char_blue.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    this.load.image("arrays_3_bg5", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_5.png`);
    this.load.image("arrays_3_bg_castle", `${GH_BG_BASE}/Background_Castle.png`);
    this.load.image("arrays_3_bg4", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_4.png`);
    this.load.image("arrays_3_bg3", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_3.png`);
    this.load.image("arrays_3_bg2", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_2.png`);
    this.load.image("arrays_3_bg1", `${GH_BG_BASE}/GandalfHardcore_Background_layers_layer_1.png`);
  }

  create() {
    this.scale.resize(1024, 576);
    const map = this.make.tilemap({ key: "arrays_level_3_base" });
    const offsetY = this.scale.height - map.heightInPixels;

    this.createParallaxBackgrounds(map);
    this.createPlayerAnimations();
    this.createFlameAnimations();
    this.createGlowTexture();

    const floorTileset = map.addTilesetImage("Floor_Tiles2", "arrays_3_floor_tiles");
    const decorTileset = map.addTilesetImage("Decor", "arrays_3_decor_tiles");
    const gardenDecorTileset = map.addTilesetImage(
      "Garden_Decorations",
      "arrays_3_garden_decor_tiles",
    );
    const pineTreesTileset = map.addTilesetImage("Pine_Trees", "arrays_3_pine_trees_tiles");
    const houseTileset = map.addTilesetImage("House_Tiles", "arrays_3_house_tiles");
    const otherTileset = map.addTilesetImage("Other_Tiles2", "arrays_3_other_tiles_2");
    const pineForestTileset = map.addTilesetImage(
      "Pine_forest_sheet",
      "arrays_3_pine_forest_tiles",
    );
    const lampPostTallTileset = map.addTilesetImage(
      "Lamp Post 2 TALL",
      "arrays_3_lamp_post_tall",
    );
    const lampPostShortTileset = map.addTilesetImage(
      "Lamp Post 2 SHORT",
      "arrays_3_lamp_post_short",
    );
    const allTilesets = [
      floorTileset,
      decorTileset,
      gardenDecorTileset,
      pineTreesTileset,
      houseTileset,
      otherTileset,
      pineForestTileset,
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
    this.floorY = this.spawnPoint.y;
    this.exitPoint = this.points.level_exit ?? { x: map.widthInPixels - 150, y: this.floorY - 64 };
    this.flamePoints = Array.from({ length: 4 }, (_, index) => {
      const point = this.points[`flame_${index}`];
      return point ?? { x: 520 + index * 140, y: this.floorY - 48 };
    });

    this.createPathDarkness(map);
    this.createFlameTrial();
    this.createPlayer();

    if (platformLayer) {
      this.physics.add.collider(this.player, platformLayer);
    }

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.sequenceMode = "idle";
    this.sequenceTimers = [];
    this.player.play("player-idle-arrays-3");

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);
  }

  update() {
    if (!this.player?.body) return;
    const onGround = this.player.body.blocked.down || this.player.body.touching.down;

    if (this.sequenceMode === "walkingToExit") {
      this.player.setVelocityX(PLAYER_WALK_SPEED);
      this.player.setFlipX(false);
      this.playAnimation(onGround ? "player-run-arrays-3" : "player-jump-arrays-3");

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
    this.playAnimation(onGround ? "player-idle-arrays-3" : "player-jump-arrays-3");
  }

  createParallaxBackgrounds(map) {
    const worldWidth = map?.widthInPixels ?? this.scale.width;
    const backgrounds = [
      { key: "arrays_3_bg5", factor: 0.1, depth: -8, alpha: 0.86, y: 0 },
      { key: "arrays_3_bg_castle", factor: 0.1, depth: -7, alpha: 0.48, y: 0 },
      { key: "arrays_3_bg4", factor: 0.1, depth: -6, alpha: 0.76, y: 0 },
      { key: "arrays_3_bg3", factor: 0.4, depth: -5, alpha: 0.74, y: 94 },
      { key: "arrays_3_bg2", factor: 0.7, depth: -4, alpha: 0.68, y: 186 },
      { key: "arrays_3_bg1", factor: 0.9, depth: -3, alpha: 0.64, y: 232 },
    ];

    backgrounds.forEach(({ key, factor, depth, alpha, y }) => {
      const bg = this.add.tileSprite(0, y, worldWidth, this.scale.height - y, key);
      bg.setOrigin(0, 0);
      bg.setScrollFactor(factor, 0);
      bg.setDepth(depth);
      bg.setTint(0x2a4266);
      bg.setAlpha(alpha);
    });

    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x06101d, 0.18)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-2);
  }

  createVisualTileLayer(map, layerName, tilesets, offsetY, depth) {
    const layer = map.createLayer(layerName, tilesets, 0, offsetY);
    if (!layer) return null;
    layer.setDepth(depth);
    layer.setAlpha(0.88);
    layer.setTint(0xc2cad6);
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

  createFlameAnimations() {
    if (!this.anims.exists("arrays-3-normal-fire")) {
      this.anims.create({
        key: "arrays-3-normal-fire",
        frames: this.anims.generateFrameNumbers("arrays_3_fire", { start: 0, end: 15 }),
        frameRate: 14,
        repeat: -1,
      });
    }
    if (!this.anims.exists("arrays-3-boss-wisp")) {
      this.anims.create({
        key: "arrays-3-boss-wisp",
        frames: this.anims.generateFrameNumbers("arrays_3_wisp", { start: 0, end: 4 }),
        frameRate: 8,
        repeat: -1,
      });
    }
  }

  createGlowTexture() {
    if (this.textures.exists("arrays-3-soft-glow")) return;

    const size = 128;
    const texture = this.textures.createCanvas("arrays-3-soft-glow", size, size);
    const context = texture.getContext();
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      2,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.18, "rgba(255,255,255,0.58)");
    gradient.addColorStop(0.48, "rgba(255,255,255,0.18)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    texture.refresh();
  }

  resolveMapPoints(map, offsetY) {
    const points = {};
    ["objects", "Objects", "triggers", "Triggers", "hazzards", "hazards", "Hazards"].forEach(
      (layerName) => {
        const layer = map.getObjectLayer(layerName);
        if (!layer) return;
        layer.objects.forEach((obj) => {
          if (!obj.name) return;
          points[obj.name] = {
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
        0.48,
      )
      .setDepth(0.04);
  }

  createFlameTrial() {
    this.flames = this.flamePoints.map((point, index) => {
      const isBoss = index === BOSS_INDEX;
      const x = point.x;
      const y = Math.min(point.y, this.floorY - 42);
      const glowColor = isBoss ? 0x6ee7ff : 0xff5b24;
      const glow = this.add
        .image(x, y + 4, "arrays-3-soft-glow")
        .setOrigin(0.5)
        .setScale(isBoss ? 0.76 : 0.68, isBoss ? 1.02 : 0.92)
        .setTint(glowColor)
        .setAlpha(isBoss ? 0.5 : 0.38)
        .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(1.02);
      const plumeGlow = this.add
        .image(x, y - 8, "arrays-3-soft-glow")
        .setOrigin(0.5)
        .setScale(isBoss ? 0.42 : 0.36, isBoss ? 1.18 : 1.02)
        .setTint(isBoss ? 0x7df6ff : 0xff7b2c)
        .setAlpha(isBoss ? 0.36 : 0.3)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(1.03);
      const innerGlow = this.add
        .image(x, y + 2, "arrays-3-soft-glow")
        .setOrigin(0.5)
        .setScale(isBoss ? 0.34 : 0.26, isBoss ? 0.42 : 0.34)
        .setTint(isBoss ? 0xb5fbff : 0xffd077)
        .setAlpha(isBoss ? 0.5 : 0.42)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(1.04);
      const groundGlow = this.add
        .ellipse(x, this.floorY - 3, isBoss ? 76 : 62, 10, glowColor, isBoss ? 0.22 : 0.15)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(0.08);
      const groundHotspot = this.add
        .ellipse(x, this.floorY - 10, isBoss ? 34 : 28, 8, isBoss ? 0xa8fbff : 0xffc16a, 0.2)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(0.09);
      const sprite = this.add
        .sprite(x, y, isBoss ? "arrays_3_wisp" : "arrays_3_fire", 0)
        .setOrigin(0.5)
        .setScale(isBoss ? 1.68 : 1.82)
        .setDepth(1.12);
      sprite.play(isBoss ? "arrays-3-boss-wisp" : "arrays-3-normal-fire");
      const embers = this.createFlameEmbers(x, y, isBoss, index);

      const label = this.add
        .text(x, y + 58, String(index), {
          fontFamily: "monospace",
          fontSize: "16px",
          color: "#f8e7b2",
          backgroundColor: "rgba(4, 9, 18, 0.78)",
          padding: { x: 8, y: 4 },
        })
        .setOrigin(0.5)
        .setDepth(1.2);

      const flame = {
        index,
        isBoss,
        x,
        y,
        sprite,
        glow,
        plumeGlow,
        innerGlow,
        groundGlow,
        groundHotspot,
        embers,
        label,
      };
      this.startFlameIdleTweens(flame);
      return flame;
    });
  }

  startFlameIdleTweens(flame) {
    this.tweens.add({
      targets: [flame.sprite, flame.glow, flame.plumeGlow, flame.innerGlow],
      y: flame.y - 8,
      duration: 780 + flame.index * 110,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: [
        flame.glow,
        flame.plumeGlow,
        flame.innerGlow,
        flame.groundGlow,
        flame.groundHotspot,
      ],
      alpha: `+=${flame.isBoss ? 0.14 : 0.1}`,
      duration: 520 + flame.index * 90,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createFlameEmbers(x, y, isBoss, flameIndex) {
    return Array.from({ length: isBoss ? 7 : 5 }, (_, emberIndex) => {
      const ember = this.add
        .circle(
          x + Phaser.Math.Between(-12, 12),
          y + Phaser.Math.Between(-8, 12),
          isBoss ? Phaser.Math.FloatBetween(1.2, 2.2) : Phaser.Math.FloatBetween(1, 1.8),
          isBoss ? 0x9ff7ff : 0xffd07a,
          isBoss ? 0.62 : 0.52,
        )
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(1.1);

      this.tweens.add({
        targets: ember,
        x: x + Phaser.Math.Between(-22, 22),
        y: y - Phaser.Math.Between(28, 54),
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(760, 1180),
        delay: emberIndex * 130 + flameIndex * 60,
        repeat: -1,
        repeatDelay: Phaser.Math.Between(120, 420),
        ease: "Sine.easeOut",
        onRepeat: () => {
          ember
            .setPosition(x + Phaser.Math.Between(-12, 12), y + Phaser.Math.Between(-8, 12))
            .setScale(1)
            .setAlpha(isBoss ? 0.62 : 0.52);
        },
      });

      return ember;
    });
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
    const selectedIndex = Number.isInteger(values?.attackIndex) ? values.attackIndex : 0;

    if (isCorrect) {
      this.startSuccessSequence();
      return;
    }

    this.startFailureSequence(selectedIndex);
  }

  resetAttemptState() {
    this.sequenceTimers?.forEach((timer) => timer.remove(false));
    this.sequenceTimers = [];
    this.tweens.killTweensOf(this.player);
    this.player.body.enable = true;
    this.player.setAlpha(1);
    this.player.setScale(PLAYER_SCALE);
    this.player.setGravityY(PLAYER_GRAVITY);
    this.player.setVelocity(0, 0);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y);
    this.player.body.reset(this.spawnPoint.x, this.spawnPoint.y);
    this.playAnimation("player-idle-arrays-3");
    this.flames?.forEach((flame) => {
      this.tweens.killTweensOf([
        flame.sprite,
        flame.glow,
        flame.plumeGlow,
        flame.innerGlow,
        flame.groundGlow,
        flame.groundHotspot,
        flame.label,
      ]);
      flame.sprite
        .setAlpha(1)
        .setTint(0xffffff)
        .setScale(flame.isBoss ? 1.68 : 1.82)
        .setPosition(flame.x, flame.y);
      flame.glow
        .setAlpha(flame.isBoss ? 0.5 : 0.38)
        .setScale(flame.isBoss ? 0.76 : 0.68, flame.isBoss ? 1.02 : 0.92)
        .setPosition(flame.x, flame.y + 4);
      flame.plumeGlow
        .setAlpha(flame.isBoss ? 0.36 : 0.3)
        .setScale(flame.isBoss ? 0.42 : 0.36, flame.isBoss ? 1.18 : 1.02)
        .setPosition(flame.x, flame.y - 8);
      flame.innerGlow
        .setAlpha(flame.isBoss ? 0.5 : 0.42)
        .setScale(flame.isBoss ? 0.34 : 0.26, flame.isBoss ? 0.42 : 0.34)
        .setPosition(flame.x, flame.y + 2);
      flame.groundGlow
        .setAlpha(flame.isBoss ? 0.22 : 0.15)
        .setScale(1)
        .setPosition(flame.x, this.floorY - 3);
      flame.groundHotspot
        .setAlpha(0.2)
        .setScale(1)
        .setPosition(flame.x, this.floorY - 10);
      flame.embers.forEach((ember) => {
        ember
          .setAlpha(flame.isBoss ? 0.62 : 0.52)
          .setScale(1)
          .setPosition(
            flame.x + Phaser.Math.Between(-12, 12),
            flame.y + Phaser.Math.Between(-8, 12),
          );
      });
      flame.label.setAlpha(1);
      this.startFlameIdleTweens(flame);
    });
    this.sequenceMode = "idle";
  }

  startSuccessSequence() {
    this.sequenceMode = "attacking";
    const bossFlame = this.flames[BOSS_INDEX];
    this.moveToAttackPosition(bossFlame, () => {
      this.attackFlame(bossFlame, true, () => {
        this.openFlameWall();
      });
    });
  }

  startFailureSequence(selectedIndex) {
    this.sequenceMode = "attacking";
    const boundedIndex = Phaser.Math.Clamp(selectedIndex, 0, this.flames.length - 1);
    const targetFlame = this.flames[boundedIndex] ?? this.flames[0];
    this.moveToAttackPosition(targetFlame, () => {
      this.attackFlame(targetFlame, false, () => {
        this.pushPlayerBack();
      });
    });
  }

  moveToAttackPosition(flame, onComplete) {
    const lineApproachX = this.flames[0].x - FLAME_LINE_APPROACH_GAP;
    const attackX = flame.x - FLAME_ATTACK_GAP;

    this.movePlayerTo(lineApproachX, () => {
      if (attackX <= lineApproachX + 48) {
        this.movePlayerTo(attackX, onComplete);
        return;
      }

      this.jumpPlayerTo(attackX, onComplete);
    });
  }

  attackFlame(flame, isCorrect, onComplete) {
    this.player.setFlipX(false);
    this.player.play("player-attack-arrays-3", true);
    const slash = this.add
      .graphics()
      .setDepth(1.5);
    slash.lineStyle(3, isCorrect ? 0x9ff7ff : 0xffd27a, 0.88);
    slash.beginPath();
    slash.moveTo(this.player.x + 24, this.player.y - 74);
    slash.lineTo(this.player.x + 72, this.player.y - 36);
    slash.strokePath();

    this.tweens.add({
      targets: slash,
      alpha: 0,
      x: 18,
      duration: 220,
      ease: "Sine.easeOut",
      onComplete: () => slash.destroy(),
    });

    this.tweens.add({
      targets: [
        flame.glow,
        flame.plumeGlow,
        flame.innerGlow,
        flame.groundGlow,
        flame.groundHotspot,
        ...flame.embers,
      ],
      alpha: isCorrect ? 0.84 : 0.72,
      scaleX: isCorrect ? 1.25 : 1.12,
      scaleY: isCorrect ? 1.25 : 1.12,
      duration: 180,
      yoyo: !isCorrect,
      ease: "Sine.easeOut",
    });
    flame.sprite.setTint(isCorrect ? 0x9ff7ff : 0xff2020);
    this.tweens.add({
      targets: flame.sprite,
      scaleX: isCorrect ? 2.2 : 2.05,
      scaleY: isCorrect ? 2.2 : 2.05,
      duration: 180,
      yoyo: !isCorrect,
      ease: "Back.easeOut",
    });

    this.schedule(360, onComplete);
  }

  openFlameWall() {
    const bossFlame = this.flames[BOSS_INDEX];
    this.tweens.add({
      targets: [
        bossFlame.sprite,
        bossFlame.glow,
        bossFlame.plumeGlow,
        bossFlame.innerGlow,
        bossFlame.groundGlow,
        bossFlame.groundHotspot,
        ...bossFlame.embers,
        bossFlame.label,
      ],
      alpha: 0,
      scaleX: 0.2,
      scaleY: 0.2,
      duration: 420,
      ease: "Back.easeIn",
    });
    this.flames.forEach((flame) => {
      if (flame.index === BOSS_INDEX) return;
      this.tweens.add({
        targets: [
          flame.sprite,
          flame.glow,
          flame.plumeGlow,
          flame.innerGlow,
          flame.groundGlow,
          flame.groundHotspot,
          ...flame.embers,
          flame.label,
        ],
        alpha: 0,
        duration: 520,
        ease: "Sine.easeIn",
      });
    });
    this.schedule(620, () => {
      this.sequenceMode = "walkingToExit";
      this.player.body.enable = true;
      this.player.setVelocityX(PLAYER_WALK_SPEED);
      this.playAnimation("player-run-arrays-3");
    });
  }

  pushPlayerBack() {
    this.tweens.add({
      targets: this.player,
      x: Math.max(this.spawnPoint.x, this.player.x - 150),
      duration: 360,
      ease: "Back.easeOut",
      onComplete: () => {
        this.sequenceMode = "failure";
        this.playAnimation("player-idle-arrays-3");
        gameEvents.emit(GAME_LEVEL_OUTCOME, {
          levelNumber: LEVEL_NUMBER,
          status: "failure",
          message: "Kai attacked a normal flame. The boss fire keeps the flame line closed.",
        });
      },
    });
  }

  movePlayerTo(targetX, onComplete) {
    const distance = Math.abs(targetX - this.player.x);
    const duration = Math.max(260, (distance / PLAYER_WALK_SPEED) * 1000);
    this.player.setFlipX(targetX < this.player.x);
    this.playAnimation("player-run-arrays-3");
    this.tweens.add({
      targets: this.player,
      x: targetX,
      duration,
      ease: "Linear",
      onComplete: () => {
        this.player.setVelocityX(0);
        this.playAnimation("player-idle-arrays-3");
        onComplete?.();
      },
    });
  }

  jumpPlayerTo(targetX, onComplete) {
    const startX = this.player.x;
    const startY = this.floorY;
    const distance = Math.abs(targetX - startX);
    const jumpHeight = Phaser.Math.Clamp(distance * 0.34, 78, 138);
    const duration = Math.max(460, (distance / (PLAYER_WALK_SPEED * 1.42)) * 1000);
    const progress = { value: 0 };

    this.player.setFlipX(targetX < startX);
    this.player.body.enable = false;
    this.playAnimation("player-jump-arrays-3");

    this.tweens.add({
      targets: progress,
      value: 1,
      duration,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        const t = progress.value;
        this.player.x = Phaser.Math.Linear(startX, targetX, t);
        this.player.y = startY - Math.sin(t * Math.PI) * jumpHeight;
      },
      onComplete: () => {
        this.player.setPosition(targetX, startY);
        this.player.body.enable = true;
        this.player.body.reset(targetX, startY);
        this.player.setVelocity(0, 0);
        this.playAnimation("player-idle-arrays-3");
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
    if (this.sequenceMode === "complete") return;
    this.sequenceMode = "complete";
    this.player.setVelocity(0, 0);
    this.playAnimation("player-idle-arrays-3");
    gameEvents.emit(GAME_LEVEL_OUTCOME, {
      levelNumber: LEVEL_NUMBER,
      status: "success",
      message: "Boss fire destroyed. Arrays Level 3 cleared.",
      shouldProceed: true,
    });
  }

  playAnimation(key) {
    if (!this.player || this.player.anims.currentAnim?.key === key) return;
    this.player.play(key, true);
  }

  cleanupScene() {
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.sequenceTimers?.forEach((timer) => timer.remove(false));
  }
}
