import Phaser from "phaser";
import {
  gameEvents,
  LEVEL_ONE_CODE_EVALUATED,
  LEVEL_ONE_OUTCOME,
} from "../gameEvents";

const PLAYER_SCALE = 2;
const PLAYER_GRAVITY = 1100;
const PLAYER_WALK_SPEED = 140;
const GOAL_PADDING = 96;

const ANIMATIONS = [
  { key: "player-idle", start: 0, end: 5, frameRate: 6, repeat: -1 },
  { key: "player-run", start: 16, end: 23, frameRate: 12, repeat: -1 },
  { key: "player-jump", start: 24, end: 31, frameRate: 10, repeat: -1 },
  { key: "player-death", start: 40, end: 47, frameRate: 10, repeat: 0 },
  { key: "player-downed", start: 48, end: 51, frameRate: 6, repeat: -1 },
];

export default class LevelOneScene extends Phaser.Scene {
  constructor() {
    super("LevelOneScene");
  }

  preload() {
    this.load.image(
      "level1_bg",
      "/SharpRunner/game/assets/backgrounds/level1_bg.png"
    );

    this.load.image(
      "greenzone_tiles",
      "/SharpRunner/game/assets/tiles/greenzone_tileset.png"
    );

    this.load.image("decor_tiles", "/SharpRunner/game/assets/tiles/Objects.png");

    this.load.tilemapTiledJSON(
      "level1",
      "/SharpRunner/game/assets/maps/level1.tmj"
    );

    this.load.spritesheet(
      "player_sheet_blue",
      "/SharpRunner/game/assets/characters/players/char_blue.png",
      { frameWidth: 56, frameHeight: 56 }
    );
  }

  create() {
    const map = this.make.tilemap({ key: "level1" });
    const camera = this.cameras.main;

    const bg = this.add
      .image(0, 0, "level1_bg")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-10);
    bg.setDisplaySize(camera.width, camera.height);

    const greenzoneTileset = map.addTilesetImage(
      "greenzone_tileset",
      "greenzone_tiles"
    );
    const decorTileset = map.addTilesetImage("Objects", "decor_tiles");

    const offsetY = this.scale.height - map.heightInPixels;
    const layersByName = {};

    map.layers.forEach((layerData) => {
      const layerName = layerData.name;
      if (layerName === "Objects") return;

      const layer = map.createLayer(
        layerName,
        [greenzoneTileset, decorTileset],
        0,
        offsetY
      );
      layersByName[layerName] = layer;

      if (layerName === "Decor_Back") layer.setDepth(-1);
      if (layerName === "Ground") layer.setDepth(0);
      if (layerName === "Platforms") layer.setDepth(1);
      if (layerName === "Decor_Front") layer.setDepth(2);
    });

    camera.setBounds(0, offsetY, map.widthInPixels, map.heightInPixels);
    camera.scrollY = offsetY;
    this.physics.world.setBounds(
      0,
      offsetY,
      map.widthInPixels,
      map.heightInPixels
    );

    const spawnPoint = this.resolveSpawnPoint(map, offsetY);
    this.spawnPoint = spawnPoint;
    this.goalX = map.widthInPixels - GOAL_PADDING;
    this.createPlayerAnimations();

    this.player = this.physics.add.sprite(
      spawnPoint.x,
      spawnPoint.y,
      "player_sheet_blue"
    );
    this.player.setOrigin(0.5, 1);
    this.player.setScale(PLAYER_SCALE);
    this.player.setDepth(1);
    this.player.setCollideWorldBounds(true);
    this.player.setGravityY(PLAYER_GRAVITY);

    ["Ground", "Platforms"].forEach((layerName) => {
      const layer = layersByName[layerName];
      if (!layer) return;
      layer.setCollisionByExclusion([-1], true);
      this.physics.add.collider(this.player, layer);
    });

    camera.startFollow(this.player, true, 0.12, 0.12);

    this.sequenceMode = "idle";
    this.isDead = false;
    this.isDowned = false;
    this.failureTimer = null;

    this.player.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      this.onPlayerAnimationComplete,
      this
    );

    gameEvents.on(LEVEL_ONE_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);

    this.player.play("player-idle");
    this.scale.resize(1024, 576);
  }

  update() {
    if (!this.player || !this.player.body) return;

    const onGround =
      this.player.body.blocked.down || this.player.body.touching.down;

    if (this.sequenceMode === "success") {
      this.player.setVelocityX(PLAYER_WALK_SPEED);
      this.player.setFlipX(false);

      if (!onGround) {
        this.playAnimation("player-jump");
        return;
      }

      this.playAnimation("player-run");

      if (this.player.x >= this.goalX) {
        this.finishSuccessSequence();
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

  resolveSpawnPoint(map, offsetY) {
    const objectLayer = map.getObjectLayer("Objects");
    let spawnPoint = null;

    if (objectLayer) {
      objectLayer.objects.forEach((obj) => {
        if (obj.name === "player_spawn") {
          spawnPoint = { x: obj.x, y: obj.y + offsetY };
        }
      });
    }

    if (spawnPoint) return spawnPoint;

    console.warn("player_spawn not found, using fallback spawn");
    return { x: 1000, y: offsetY + map.heightInPixels - 50 };
  }

  playAnimation(key) {
    const currentKey = this.player.anims.currentAnim?.key;
    if (currentKey === key) return;
    this.player.play(key, true);
  }

  onCodeEvaluated({ isCorrect }) {
    if (typeof isCorrect !== "boolean") return;

    this.resetAttemptState();

    if (isCorrect) {
      this.startSuccessSequence();
      return;
    }

    this.startFailureSequence();
  }

  resetAttemptState() {
    if (this.failureTimer) {
      this.failureTimer.remove(false);
      this.failureTimer = null;
    }

    this.sequenceMode = "idle";
    this.isDead = false;
    this.player.setVelocity(0, 0);
    this.isDowned = false;

    this.player.setGravityY(PLAYER_GRAVITY);
    this.player.setFlipX(false);
    this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y);
    this.player.body.reset(this.spawnPoint.x, this.spawnPoint.y);
    this.playAnimation("player-idle");
  }

  startSuccessSequence() {
    this.sequenceMode = "success";
    this.player.setGravityY(PLAYER_GRAVITY);
    this.playAnimation("player-run");
  }

  finishSuccessSequence() {
    this.sequenceMode = "idle";
    this.player.setVelocityX(0);
    this.playAnimation("player-idle");

    gameEvents.emit(LEVEL_ONE_OUTCOME, {
      status: "success",
      message: "Gate opened. Level 1 cleared.",
    });
  }

  startFailureSequence() {
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
        gameEvents.emit(LEVEL_ONE_OUTCOME, {
          status: "failure",
          message: "You failed. Declare a variable to make the hero move.",
        });
      });
    }
  }

  cleanupScene() {
    gameEvents.off(LEVEL_ONE_CODE_EVALUATED, this.onCodeEvaluated, this);

    if (this.failureTimer) {
      this.failureTimer.remove(false);
      this.failureTimer = null;
    }
  }
}
