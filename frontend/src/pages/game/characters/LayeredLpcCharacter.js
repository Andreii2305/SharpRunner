import Phaser from "phaser";

export default class LayeredLpcCharacter extends Phaser.GameObjects.Container {
  static preload(scene, config) {
    config.layers.forEach((layer) => {
      if (layer.type === "spritesheet") {
        scene.load.spritesheet(
          LayeredLpcCharacter.layerTextureKey(config.key, layer.name),
          layer.path,
          { frameWidth: config.frameWidth, frameHeight: config.frameHeight },
        );
        return;
      }

      Object.entries(config.animations).forEach(([animationName, animation]) => {
        animation.directions.forEach((direction) => {
          animation.frames.forEach((frame) => {
            scene.load.image(
              LayeredLpcCharacter.frameTextureKey(
                config.key,
                layer.name,
                animationName,
                direction,
                frame,
              ),
              layer.path(animationName, direction, frame),
            );
          });
        });
      });
    });
  }

  static layerTextureKey(characterKey, layerName) {
    return `${characterKey}_${layerName}`;
  }

  static frameTextureKey(characterKey, layerName, animationName, direction, frame) {
    return `${characterKey}_${layerName}_${animationName}_${direction}_${frame}`;
  }

  constructor(scene, x, y, config, options = {}) {
    super(scene, x, y);
    this.scene = scene;
    this.config = config;
    this.direction = options.direction ?? config.defaultDirection ?? "down";
    this.animationName = options.animationName ?? "idle";
    this.frameIndex = 0;
    this.animationTimer = null;
    this.layerSprites = new Map();

    config.layers
      .slice()
      .sort((a, b) => a.depth - b.depth)
      .forEach((layer) => {
        const resolvedFrame = this.resolveFrame(layer, this.animationName, this.direction, 1, 0);
        const sprite = scene.add
          .sprite(0, 0, resolvedFrame.key, resolvedFrame.frame)
          .setOrigin(0.5, 1);
        this.layerSprites.set(layer.name, sprite);
        this.add(sprite);
      });

    this.setScale(options.scale ?? 1);
    this.setDepth(options.depth ?? 0);
    scene.add.existing(this);
    this.playAnimation(this.animationName, this.direction);
  }

  playAnimation(animationName, direction = this.direction) {
    const animation = this.config.animations[animationName] ?? this.config.animations.idle;
    if (!animation) return;

    this.stopAnimation();
    this.animationName = animationName;
    this.direction = animation.directions.includes(direction)
      ? direction
      : this.config.defaultDirection ?? animation.directions[0];
    this.frameIndex = 0;
    this.applyFrame(animation.frames[0] ?? 1);

    if (animation.frames.length <= 1) return;
    this.animationTimer = this.scene.time.addEvent({
      delay: 1000 / (animation.frameRate || 6),
      loop: true,
      callback: () => {
        this.frameIndex = (this.frameIndex + 1) % animation.frames.length;
        this.applyFrame(animation.frames[this.frameIndex], this.frameIndex);
      },
    });
  }

  setDirection(direction) {
    this.playAnimation(this.animationName, direction);
  }

  playIdle(direction = this.direction) {
    this.playAnimation("idle", direction);
  }

  playWalk(direction = this.direction) {
    this.playAnimation("walk", direction);
  }

  stopAnimation() {
    this.animationTimer?.remove(false);
    this.animationTimer = null;
  }

  setLayerVisible(layerName, visible) {
    this.layerSprites.get(layerName)?.setVisible(visible);
  }

  destroy(fromScene) {
    this.stopAnimation();
    super.destroy(fromScene);
  }

  applyFrame(frame, sequenceIndex = 0) {
    this.config.layers.forEach((layer) => {
      const resolvedFrame = this.resolveFrame(
        layer,
        this.animationName,
        this.direction,
        frame,
        sequenceIndex,
      );
      this.layerSprites.get(layer.name)?.setTexture(resolvedFrame.key, resolvedFrame.frame);
    });
  }

  resolveFrame(layer, animationName, direction, frame, sequenceIndex) {
    const fallback = layer.animationFallbacks?.[animationName];
    const resolvedAnimationName = fallback?.animation ?? animationName;
    const animation =
      this.config.animations[resolvedAnimationName] ??
      this.config.animations[animationName] ??
      this.config.animations.idle;
    const safeDirection = animation?.directions.includes(direction)
      ? direction
      : this.config.defaultDirection;
    const frameCycle = fallback?.frames ?? animation?.frames ?? [0];
    const safeFrame = frameCycle[sequenceIndex % frameCycle.length] ?? frame;

    if (layer.type === "spritesheet") {
      const directionIndex = this.config.directions.indexOf(safeDirection);
      const animationRow = animation.row + Math.max(0, directionIndex);
      return {
        key: LayeredLpcCharacter.layerTextureKey(this.config.key, layer.name),
        frame: animationRow * this.config.columns + safeFrame,
      };
    }

    return {
      key: LayeredLpcCharacter.frameTextureKey(
        this.config.key,
        layer.name,
        resolvedAnimationName,
        safeDirection,
        safeFrame,
      ),
      frame: undefined,
    };
  }
}
