import Phaser from "phaser";
import {
  CAMERA_DRAG_THRESHOLD,
  CAMERA_ZOOM,
  getHorizontalScrollRange,
} from "./cameraMath.js";

export const RESPONSIVE_CAMERA_AVAILABILITY = "responsive-camera-availability";

/**
 * A scene plugin that turns Phaser's responsive canvas into a bounded world
 * viewport. Scenes continue to own gameplay and cinematic camera decisions;
 * this plugin only supplies resize-safe inspection, follow suspension, and
 * recentering.
 */
export default class ResponsiveCameraPlugin extends Phaser.Plugins.ScenePlugin {
  constructor(scene, pluginManager, pluginKey) {
    super(scene, pluginManager, pluginKey);
    this.camera = null;
    this.drag = null;
    this.suspendedFollow = null;
    this.isAvailable = false;
  }

  boot() {
    const events = this.systems.events;
    events.on(Phaser.Scenes.Events.CREATE, this.onSceneCreate, this);
    events.on(Phaser.Scenes.Events.POST_UPDATE, this.updateAvailability, this);
    events.on(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  onSceneCreate() {
    this.camera = this.scene.cameras?.main ?? null;
    if (!this.camera || this.scene.scene.key.startsWith("AudioBootScene:")) return;

    this.camera.setZoom(CAMERA_ZOOM);
    this.camera.roundPixels = true;
    this.scene.layoutCameraUi?.(this.camera.width, this.camera.height);
    this.updateDeadzone();
    this.updateAvailability();

    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
  }

  getBounds() {
    if (!this.camera) return null;
    return this.camera.getBounds(new Phaser.Geom.Rectangle());
  }

  getScrollRange() {
    const bounds = this.getBounds();
    if (!bounds || !this.camera) return { min: 0, max: 0 };
    return getHorizontalScrollRange({
      boundsX: bounds.x,
      boundsWidth: bounds.width,
      viewportWidth: this.camera.width,
      zoom: this.camera.zoom,
    });
  }

  updateAvailability() {
    const range = this.getScrollRange();
    const nextAvailability = Boolean(
      range.max - range.min > 1
      && this.scene.manualCameraEnabled !== false
      && !this.camera?.panEffect?.isRunning,
    );
    if (nextAvailability === this.isAvailable) return;
    this.isAvailable = nextAvailability;
    this.scene.game.events.emit(RESPONSIVE_CAMERA_AVAILABILITY, {
      sceneKey: this.scene.scene.key,
      available: nextAvailability,
    });
  }

  updateDeadzone() {
    if (!this.camera?.followTarget) return;
    const width = Math.max(120, Math.round(this.camera.width * 0.34));
    const height = Math.max(90, Math.round(this.camera.height * 0.38));
    this.camera.setDeadzone(width, height);
  }

  canInspect(currentlyOver = []) {
    return Boolean(
      this.isAvailable
      && this.scene.manualCameraEnabled !== false
      && !this.camera?.panEffect?.isRunning
      && currentlyOver.length === 0,
    );
  }

  onPointerDown(pointer, currentlyOver = []) {
    if (!this.canInspect(currentlyOver) || pointer.rightButtonDown()) return;
    this.scene.skipOpeningCameraPreview?.();
    this.scene.fadeRouteHint?.();
    this.drag = {
      pointerId: pointer.id,
      startX: pointer.x,
      startY: pointer.y,
      scrollX: this.camera.scrollX,
      active: false,
    };
  }

  onPointerMove(pointer) {
    if (!this.drag || this.drag.pointerId !== pointer.id || !pointer.isDown) return;
    const deltaX = pointer.x - this.drag.startX;
    const deltaY = pointer.y - this.drag.startY;

    if (!this.drag.active) {
      if (Math.hypot(deltaX, deltaY) < CAMERA_DRAG_THRESHOLD) return;
      if (Math.abs(deltaY) > Math.abs(deltaX) * 1.25) {
        this.drag = null;
        return;
      }
      this.drag.active = true;
      this.suspendFollow();
    }

    const range = this.getScrollRange();
    this.camera.scrollX = Phaser.Math.Clamp(
      this.drag.scrollX - deltaX / this.camera.zoom,
      range.min,
      range.max,
    );
  }

  onPointerUp(pointer) {
    if (this.drag?.pointerId === pointer.id) this.drag = null;
  }

  suspendFollow() {
    const target = this.camera?.followTarget;
    if (!target) return;
    this.suspendedFollow = {
      target,
      roundPixels: this.camera.roundPixels,
      lerpX: this.camera.lerp.x,
      lerpY: this.camera.lerp.y,
      offsetX: this.camera.followOffset.x,
      offsetY: this.camera.followOffset.y,
    };
    this.camera.stopFollow();
  }

  recenter() {
    if (!this.camera || !this.isAvailable || this.camera.panEffect?.isRunning) return;
    const follow = this.suspendedFollow;
    const target = follow?.target ?? this.camera.followTarget ?? this.scene.player;
    if (!target?.active) return;

    this.drag = null;
    this.camera.pan(target.x, target.y, 280, "Sine.easeInOut", true, (_camera, progress) => {
      if (progress < 1 || !follow?.target?.active) return;
      this.camera.startFollow(
        follow.target,
        follow.roundPixels,
        follow.lerpX,
        follow.lerpY,
        follow.offsetX,
        follow.offsetY,
      );
      this.suspendedFollow = null;
      this.updateDeadzone();
    });
  }

  onResize(gameSize) {
    if (!this.camera || gameSize.width < 2 || gameSize.height < 2) return;
    this.camera.setZoom(CAMERA_ZOOM);
    this.scene.layoutCameraUi?.(gameSize.width, gameSize.height);
    this.updateDeadzone();
    const range = this.getScrollRange();
    this.camera.scrollX = Phaser.Math.Clamp(this.camera.scrollX, range.min, range.max);
    this.updateAvailability();
  }

  shutdown() {
    if (this.scene?.scale) {
      this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    }
    if (this.scene?.input) {
      this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
      this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    }
    if (this.scene?.game && this.isAvailable) {
      this.scene.game.events.emit(RESPONSIVE_CAMERA_AVAILABILITY, {
        sceneKey: this.scene.scene.key,
        available: false,
      });
    }
    this.drag = null;
    this.suspendedFollow = null;
    this.camera = null;
    this.isAvailable = false;
  }

  destroy() {
    this.shutdown();
    this.systems?.events.off(Phaser.Scenes.Events.CREATE, this.onSceneCreate, this);
    this.systems?.events.off(Phaser.Scenes.Events.POST_UPDATE, this.updateAvailability, this);
    this.systems?.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    super.destroy();
  }
}
