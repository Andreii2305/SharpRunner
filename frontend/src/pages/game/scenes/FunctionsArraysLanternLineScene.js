import Phaser from "phaser";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
} from "../gameEvents";
import LayeredLpcCharacter from "../characters/LayeredLpcCharacter";
import { DIWATA_FAIRY_CONFIG } from "../characters/diwataFairyConfig";

const LEVEL_NUMBER = 26;
const ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const GH_BASE = `${ASSET_BASE}/tiles/GandalfHardcore_FREE_Platformer_Assets`;
const BG_BASE = `${GH_BASE}/GandalfHardcore_Background_layers/Normal_BG`;
const LANTERN_BASE = `${ASSET_BASE}/other/Pixel-Art-Lantern-Pack`;
const MAP_KEY = "functions_arrays_level_1_lantern_line";
const MAP_PATH = `${ASSET_BASE}/maps/functions-arrays-level-1-process-lantern-line.tmj`;
const GLOW_TEXTURE = "functions_arrays_lantern_glow";
const CYAN = 0x81eaff;
const GOLD = 0xffd56a;

export default class FunctionsArraysLanternLineScene extends Phaser.Scene {
  constructor() {
    super("FunctionsArraysLanternLineScene");
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_PATH);
    this.load.image("fa1_floor", `${GH_BASE}/Floor_Tiles2.png`);
    this.load.image("fa1_decor", `${GH_BASE}/Decor.png`);
    this.load.image("fa1_garden", `${GH_BASE}/Garden_Decorations.png`);
    this.load.image("fa1_pines", `${GH_BASE}/Pine_Trees.png`);
    this.load.image("fa1_forest", `${GH_BASE}/Pine_forest_sheet.png`);
    this.load.image("fa1_exit", `${ASSET_BASE}/other/exit_sign.png`);
    this.load.image(
      "fa1_post_tall",
      `${LANTERN_BASE}/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze/Lamp-Post-2-TALL.png`,
    );
    this.load.image(
      "fa1_post_short",
      `${LANTERN_BASE}/Bonus-Content-Lamp-Posts-and-Chains/Lamp-Posts-Bronze/Lamp-Post-2-SHORT.png`,
    );
    this.load.image(
      "fa1_lantern",
      `${LANTERN_BASE}/Lanterns-Smaller-Versions/Lantern-1/Silver-Red-Roof/Yellow-Light/Lantern-1-Small-Red-Roof-and-Yellow_000.png`,
    );
    this.load.spritesheet(
      "fa1_player",
      `${ASSET_BASE}/characters/players/char_blue_1.png`,
      { frameWidth: 56, frameHeight: 56 },
    );
    LayeredLpcCharacter.preload(this, DIWATA_FAIRY_CONFIG);
    [1, 2, 3, 4, 5].forEach((number) => {
      this.load.image(
        `fa1_bg${number}`,
        `${BG_BASE}/GandalfHardcore_Background_layers_layer_${number}.png`,
      );
    });
  }

  create() {
    this.scale.resize(1024, 576);
    this.map = this.make.tilemap({ key: MAP_KEY });
    this.offsetY = this.scale.height - this.map.heightInPixels;
    this.mode = "idle";
    this.timers = [];
    this.effects = [];

    this.createBackgrounds();
    this.createTileLayers();
    this.createAnimations();
    this.createGlowTexture();
    this.points = this.resolveMapObjects();
    this.spawnPoint = this.points.player_spawn ?? { x: 80, y: 322 };
    this.diwataPoint = this.points.diwata_spawn ?? { x: 280, y: 322 };
    this.exitPoint = this.points.level_exit ?? { x: 1134, y: 322 };
    this.lanternPoints = [0, 1, 2]
      .map((index) => this.points[`lantern_${index}`])
      .filter(Boolean);

    this.createEnvironmentShade();
    this.createLanterns();
    this.createCharacters();
    this.createRoadSeal();
    this.setupCamera();

    gameEvents.on(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  createBackgrounds() {
    [
      ["fa1_bg5", 0.08, -8, 0.76, 0],
      ["fa1_bg4", 0.14, -7, 0.68, 0],
      ["fa1_bg3", 0.3, -6, 0.6, 88],
      ["fa1_bg2", 0.54, -5, 0.58, 174],
      ["fa1_bg1", 0.8, -4, 0.5, 224],
    ].forEach(([key, factor, depth, alpha, y]) => {
      this.add
        .tileSprite(0, y, this.map.widthInPixels, this.scale.height - y, key)
        .setOrigin(0)
        .setScrollFactor(factor, 0)
        .setDepth(depth)
        .setTint(0x20394c)
        .setAlpha(alpha);
    });
    this.add
      .rectangle(0, 0, this.map.widthInPixels, 576, 0x04140f, 0.34)
      .setOrigin(0)
      .setDepth(-3);
  }

  createTileLayers() {
    const tilesets = [
      this.map.addTilesetImage("Floor_Tiles2", "fa1_floor"),
      this.map.addTilesetImage("Lamp Post 2 TALL", "fa1_post_tall"),
      this.map.addTilesetImage("Lamp Post 2 SHORT", "fa1_post_short"),
      this.map.addTilesetImage("Decor", "fa1_decor"),
      this.map.addTilesetImage("Garden_Decorations", "fa1_garden"),
      this.map.addTilesetImage("Pine_Trees", "fa1_pines"),
      this.map.addTilesetImage("Pine_forest_sheet", "fa1_forest"),
      this.map.addTilesetImage("exit_sign", "fa1_exit"),
    ].filter(Boolean);

    ["platform", "trees", "decoration", "front_decoration"].forEach(
      (name, index) => {
        const layer = this.map.createLayer(name, tilesets, 0, this.offsetY);
        if (layer) layer.setDepth(0.05 + index * 0.24);
      },
    );
  }

  createAnimations() {
    [
      ["fa1-player-idle", 0, 5, 6, -1],
      ["fa1-player-run", 16, 23, 12, -1],
    ].forEach(([key, start, end, frameRate, repeat]) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers("fa1_player", { start, end }),
        frameRate,
        repeat,
      });
    });
  }

  createGlowTexture() {
    if (this.textures.exists(GLOW_TEXTURE)) return;
    const size = 160;
    const texture = this.textures.createCanvas(GLOW_TEXTURE, size, size);
    const context = texture.getContext();
    const gradient = context.createRadialGradient(80, 80, 3, 80, 80, 78);
    gradient.addColorStop(0, "rgba(255,251,205,1)");
    gradient.addColorStop(0.16, "rgba(255,211,92,0.9)");
    gradient.addColorStop(0.52, "rgba(255,164,42,0.42)");
    gradient.addColorStop(0.78, "rgba(255,132,24,0.14)");
    gradient.addColorStop(1, "rgba(255,130,20,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    texture.refresh();
  }

  createLanterns() {
    const groundY = this.spawnPoint.y;
    this.lanterns = this.lanternPoints.map((point, index) => {
      const desiredHeight = Math.max(94, groundY - point.y + 22);
      const postScale = Phaser.Math.Clamp(desiredHeight / 272, 0.38, 0.52);
      const post = this.add
        .image(point.x, groundY + 1, "fa1_post_tall")
        .setOrigin(0.5, 1)
        .setScale(postScale)
        .setDepth(0.92)
        .setTint(0x725f50);
      const glow = this.add
        .image(point.x, point.y, GLOW_TEXTURE)
        .setScale(0.5)
        .setAlpha(0)
        .setDepth(1.05)
        .setBlendMode(Phaser.BlendModes.ADD);
      const environmentGlow = this.add
        .image(point.x, point.y + 24, GLOW_TEXTURE)
        .setScale(1.75, 1.12)
        .setAlpha(0)
        .setDepth(0.88)
        .setBlendMode(Phaser.BlendModes.ADD);
      const lantern = this.add
        .image(point.x, point.y, "fa1_lantern")
        .setScale(0.92)
        .setAlpha(0.5)
        .setTint(0x46515c)
        .setDepth(1.15);
      const label = this.add
        .text(point.x, point.y - 29, `[${index}]`, {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#8da6aa",
          backgroundColor: "#07131d99",
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(1.3);
      return {
        post,
        glow,
        environmentGlow,
        lantern,
        label,
        lit: false,
      };
    });
  }

  createEnvironmentShade() {
    this.environmentShade = this.add
      .rectangle(
        0,
        0,
        this.map.widthInPixels,
        this.spawnPoint.y + 4,
        0x020b0f,
        0.48,
      )
      .setOrigin(0)
      .setDepth(0.84);
  }

  createCharacters() {
    this.diwataAura = this.add
      .ellipse(this.diwataPoint.x, this.diwataPoint.y - 34, 70, 92, 0x7effca, 0.09)
      .setDepth(1.18);
    this.diwata = new LayeredLpcCharacter(
      this,
      this.diwataPoint.x,
      this.diwataPoint.y - 8,
      DIWATA_FAIRY_CONFIG,
      { scale: 1.25, direction: "right", animationName: "idle" },
    ).setDepth(1.62);
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, "fa1_player")
      .setOrigin(0.5, 1)
      .setScale(2)
      .setDepth(1.72)
      .play("fa1-player-idle");
  }

  createRoadSeal() {
    const x = this.exitPoint.x - 42;
    this.roadSeal = this.add
      .ellipse(x, this.spawnPoint.y - 48, 66, 104, 0x18233a, 0.38)
      .setStrokeStyle(1, 0x8468a5, 0.24)
      .setDepth(1.4);
    this.sealLabel = this.add
      .text(x, this.spawnPoint.y - 108, "dark road", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#8e9aa8",
        backgroundColor: "#07131dbb",
        padding: { x: 5, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(1.5);
  }

  onCodeEvaluated({ levelNumber, isCorrect, message, values }) {
    if (Number(levelNumber) !== LEVEL_NUMBER || this.mode !== "idle") return;
    if (isCorrect) this.runSuccess();
    else this.runFailure(message, values?.lanterns);
  }

  runSuccess() {
    this.mode = "running";
    this.diwata.playAnimation("spellcast", "right");
    this.tweens.add({
      targets: this.diwataAura,
      alpha: { from: 0.09, to: 0.34 },
      scaleX: { from: 1, to: 1.18 },
      scaleY: { from: 1, to: 1.12 },
      duration: 620,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });

    this.lanterns.forEach((lantern, index) => {
      this.schedule(280 + index * 720, () => {
        const previous =
          index === 0
            ? { x: this.diwata.x + 20, y: this.diwata.y - 42 }
            : {
                x: this.lanterns[index - 1].lantern.x,
                y: this.lanterns[index - 1].lantern.y,
              };
        this.sendLightTrail(previous, {
          x: lantern.lantern.x,
          y: lantern.lantern.y,
        });
        this.schedule(360, () => {
          this.lightLantern(lantern);
          this.playLanternChime(index);
        });
      });
    });
    this.schedule(480 + this.lanterns.length * 720, () => {
      this.diwata.playIdle("right");
      this.playRestoredChord();
      this.dissolveRoadSeal(() => this.runPlayerToExit());
    });
  }

  lightLantern(item) {
    this.playSfx?.("fireIgnite", { rate: Phaser.Math.FloatBetween(0.97, 1.03) });
    item.lit = true;
    item.lantern.setTint(0xffdc76);
    this.tweens.add({
      targets: item.lantern,
      alpha: 1,
      scale: { from: 0.92, to: 1.04 },
      duration: 220,
      yoyo: true,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: item.glow,
      alpha: { from: 0, to: 0.82 },
      scale: { from: 0.3, to: 0.9 },
      duration: 560,
      ease: "Quad.easeOut",
      onComplete: () => {
        item.glow.setAlpha(0.6).setScale(0.74);
        this.tweens.add({
          targets: item.glow,
          alpha: { from: 0.5, to: 0.7 },
          scale: { from: 0.68, to: 0.8 },
          duration: 1450,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      },
    });
    this.tweens.add({
      targets: item.environmentGlow,
      alpha: 0.3,
      scaleX: 2.2,
      scaleY: 1.42,
      duration: 620,
      ease: "Quad.easeOut",
    });

    const litCount = this.lanterns.filter((lantern) => lantern.lit).length;
    this.tweens.add({
      targets: this.environmentShade,
      alpha: Math.max(0.2, 0.48 - litCount * 0.09),
      duration: 620,
      ease: "Sine.easeOut",
    });
  }

  sendLightTrail(from, to) {
    const motes = Array.from({ length: 7 }, (_, index) => {
      const mote = this.add
        .circle(
          from.x + Phaser.Math.Between(-3, 3),
          from.y + Phaser.Math.Between(-4, 4),
          index === 0 ? 4 : Phaser.Math.FloatBetween(1.3, 2.6),
          index % 2 === 0 ? CYAN : GOLD,
          index === 0 ? 0.95 : 0.7,
        )
        .setDepth(2.45)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.effects.push(mote);
      this.tweens.add({
        targets: mote,
        x: to.x + Phaser.Math.Between(-3, 3),
        y: to.y + Phaser.Math.Between(-4, 4),
        alpha: index === 0 ? 0.95 : 0.12,
        scale: index === 0 ? 1.35 : 0.45,
        duration: 350 + index * 22,
        delay: index * 24,
        ease: "Sine.easeInOut",
        onComplete: () => this.destroyEffect(mote),
      });
      return mote;
    });
    return motes;
  }

  playLanternChime(index) {
    const frequencies = [523.25, 659.25, 783.99];
    const frequency = frequencies[index] ?? frequencies.at(-1);
    this.playSynthTone([
      {
        frequency,
        endFrequency: frequency * 1.01,
        duration: 0.34,
        volume: 0.045,
        type: "sine",
      },
      {
        frequency: frequency * 2,
        endFrequency: frequency * 2.02,
        duration: 0.18,
        volume: 0.018,
        type: "sine",
        delay: 0.025,
      },
    ]);
  }

  playRestoredChord() {
    this.playSynthTone(
      [523.25, 659.25, 783.99].map((frequency, index) => ({
        frequency,
        endFrequency: frequency * 1.005,
        duration: 0.58,
        volume: 0.026,
        type: "sine",
        delay: index * 0.035,
      })),
    );
  }

  playSynthTone(notes) {
    const context = this.sound?.context;
    if (!context || context.state === "closed") return;
    if (context.state === "suspended") context.resume().catch(() => {});

    notes.forEach(
      ({
        frequency,
        endFrequency,
        duration,
        volume,
        type,
        delay = 0,
      }) => {
        const start = context.currentTime + delay;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(
          Math.max(1, endFrequency),
          start + duration,
        );
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
      },
    );
  }

  dissolveRoadSeal(onComplete) {
    this.playSfx?.("magicActivate");
    const centerX = this.roadSeal.x;
    const centerY = this.roadSeal.y;
    const particles = Array.from({ length: 22 }, (_, index) => {
      const angle = Phaser.Math.FloatBetween(Math.PI, Math.PI * 2);
      const radius = Phaser.Math.FloatBetween(10, 35);
      const particle = this.add
        .circle(
          centerX + Math.cos(angle) * radius,
          centerY + Phaser.Math.Between(-42, 42),
          Phaser.Math.FloatBetween(1.2, 3.2),
          index % 3 === 0 ? CYAN : 0x9b7acb,
          0.72,
        )
        .setDepth(1.55)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.effects.push(particle);
      this.tweens.add({
        targets: particle,
        x: particle.x + Math.cos(angle) * Phaser.Math.Between(18, 42),
        y: particle.y - Phaser.Math.Between(18, 58),
        alpha: 0,
        scale: 0.25,
        duration: Phaser.Math.Between(520, 850),
        delay: index * 18,
        ease: "Quad.easeOut",
        onComplete: () => this.destroyEffect(particle),
      });
      return particle;
    });

    this.tweens.add({
      targets: [this.roadSeal, this.sealLabel],
      alpha: 0,
      scaleX: 1.18,
      scaleY: 0.82,
      duration: 640,
      ease: "Quad.easeOut",
      onComplete: () => {
        particles.forEach((particle) => {
          if (particle.active) this.destroyEffect(particle);
        });
        onComplete?.();
      },
    });
  }

  destroyEffect(effect) {
    if (!effect?.active) return;
    Phaser.Utils.Array.Remove(this.effects, effect);
    effect.destroy();
  }

  runPlayerToExit() {
    this.player.setFlipX(false).play("fa1-player-run", true);
    this.cameras.main.startFollow(this.player, true, 0.045, 0.045);
    this.tweens.add({
      targets: this.player,
      x: this.exitPoint.x,
      duration: 2700,
      ease: "Linear",
      onComplete: () => {
        this.player.play("fa1-player-idle", true);
        this.mode = "complete";
        gameEvents.emit(GAME_LEVEL_OUTCOME, {
          levelNumber: LEVEL_NUMBER,
          status: "success",
          message: "The lantern line is restored.",
          shouldProceed: true,
        });
      },
    });
  }

  runFailure(message, signals) {
    this.mode = "failure";
    const canPreviewSignals =
      Array.isArray(signals) &&
      signals.length === this.lanterns.length &&
      signals.some((value) => value !== 1);

    if (canPreviewSignals) {
      this.previewFailureSignals(signals, message);
      return;
    }

    const targets = this.lanterns.flatMap(({ lantern, label }) => [
      lantern,
      label,
    ]);
    this.lanterns.forEach(({ lantern, label }) => {
      lantern.setTint(0x7d3d48);
      label.setColor("#ff8b96");
    });
    this.tweens.add({
      targets,
      alpha: 0.24,
      duration: 120,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        this.lanterns.forEach(({ lantern, label }) => {
          lantern.setTint(0x46515c).setAlpha(0.5);
          label.setColor("#8da6aa").setAlpha(1);
        });
        gameEvents.emit(GAME_LEVEL_OUTCOME, {
          levelNumber: LEVEL_NUMBER,
          status: "failure",
          message:
            message ||
            "The array did not reach the lantern method. Check its declaration and method call.",
        });
        this.mode = "idle";
      },
    });
  }

  previewFailureSignals(signals, message) {
    const activeSignalCount = signals.filter((signal) => signal === 1).length;
    this.tweens.add({
      targets: this.environmentShade,
      alpha: Math.max(0.25, 0.48 - activeSignalCount * 0.07),
      duration: 260,
      ease: "Sine.easeOut",
    });

    this.lanterns.forEach((item, index) => {
      const signal = signals[index];
      if (signal === 1) {
        item.lantern.setTint(0xffdc76).setAlpha(1);
        item.glow.setAlpha(0.58).setScale(0.72);
        item.environmentGlow.setAlpha(0.22).setScale(1.95, 1.28);
        item.label.setColor("#ffe18a");
        this.tweens.add({
          targets: [item.lantern, item.glow],
          scale: "+=0.07",
          duration: 240,
          yoyo: true,
          ease: "Sine.easeOut",
        });
        return;
      }

      if (signal === 0) {
        item.lantern.setTint(0x303943).setAlpha(0.34);
        item.glow.setAlpha(0);
        item.environmentGlow.setAlpha(0);
        item.label.setColor("#667a80");
        return;
      }

      item.lantern.setTint(0xa23f4d).setAlpha(0.72);
      item.glow.setAlpha(0);
      item.environmentGlow.setAlpha(0);
      item.label.setColor("#ff8b96");
    });

    this.schedule(1050, () => {
      this.lanterns.forEach((item) => {
        item.lantern.setTint(0x46515c).setAlpha(0.5).setScale(0.92);
        item.glow.setAlpha(0).setScale(0.5);
        item.environmentGlow.setAlpha(0).setScale(1.75, 1.12);
        item.label.setColor("#8da6aa").setAlpha(1);
      });
      this.environmentShade.setAlpha(0.48);
      gameEvents.emit(GAME_LEVEL_OUTCOME, {
        levelNumber: LEVEL_NUMBER,
        status: "failure",
        message:
          message ||
          "Each lantern needs an on signal. Use 1 for on and 0 for off.",
      });
      this.mode = "idle";
    });
  }

  setupCamera() {
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.scale.height);
    this.cameras.main.scrollX = 0;
  }

  resolveMapObjects() {
    const points = {};
    this.map.objects.forEach((layer) => {
      layer.objects?.forEach((object) => {
        if (!object.name) return;
        points[object.name] = {
          x: object.x,
          y: object.y + this.offsetY,
          width: object.width,
          height: object.height,
        };
      });
    });
    return points;
  }

  schedule(delay, callback) {
    const timer = this.time.delayedCall(delay, callback);
    this.timers.push(timer);
    return timer;
  }

  cleanup() {
    gameEvents.off(GAME_LEVEL_CODE_EVALUATED, this.onCodeEvaluated, this);
    this.timers.forEach((timer) => timer.remove(false));
    this.effects.forEach((effect) => effect.destroy());
    this.diwata?.destroy();
  }
}
