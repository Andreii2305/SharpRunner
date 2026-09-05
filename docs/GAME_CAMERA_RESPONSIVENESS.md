# Game Camera Responsiveness

SharpRunner uses the GAME panel as a responsive Phaser viewport. Level maps keep their authored 32-pixel tile scale; smaller screens show less of the world and navigate it with the camera instead of shrinking the entire map.

## Root cause and scale policy

The game was configured with `Phaser.Scale.RESIZE`, but every playable scene called `scale.resize(1024, 576)` during creation. That replaced the parent-driven viewport with a fixed canvas and prevented later panel and orientation changes from behaving as real camera resizes.

Scenes no longer force a logical canvas size. Phaser follows the current GAME panel, including when mobile tabs or orientation change. Camera zoom is fixed at `1`; there is no fit-to-world zoom and no value below the authored scale. Pixel rounding and pixelated canvas rendering remain enabled.

## Shared behavior

`ResponsiveCameraPlugin` is installed as a Phaser scene plugin and runs after each scene's own `create` method. It preserves scene-owned camera bounds, follows, pans, and physics while adding:

- horizontal mouse/touch drag when the bounded world is wider than the viewport;
- a 12-pixel drag threshold and horizontal-intent check so taps and vertical gestures remain taps/scrolls;
- no drag start over Phaser interactive objects;
- clamping from the camera's real world bounds and current viewport width;
- temporary follow suspension during manual inspection;
- a 44-by-44 HTML **Recenter Camera** control that returns to the player/focal target and restores the previous follow lerp and offset;
- resize handling that keeps zoom readable, refreshes the dead zone, clamps scroll, and does not recreate the Phaser game.

The recenter control is hidden when the map fits. React does not poll camera state or rerender per frame. Dialogue, hints, tabs, editor controls, and other HTML overlays remain screen-space and sit above the camera control.

## Level audit

| Levels | World width | Camera mode | Notes |
| --- | ---: | --- | --- |
| Tutorials 1-2 | 1024-1056 | Follow with inspection when needed | Level 1 fits at the authored desktop width; narrower panels can inspect it. |
| Tutorials 3-5 | 1600 | Follow with inspection | Existing player follow and physics bounds are retained. |
| Arrays 1-2 | 1920 | Follow with inspection | Widest maps; map bounds supply the full pan range. |
| Arrays 3-5 | 1600 | Follow with inspection | Existing follow remains authoritative. |
| Arrays 6-8 | 1600 | Inspection plus scripted/follow sequences | Their existing sequence locks and cinematic focus remain; duplicated raw pointer registration was removed. |
| Methods 1 | 1600 | Scripted sequence plus inspection | Existing follow offsets are restored by recenter. |
| Methods 2-10 | 1280 | Scripted sequence plus inspection | Scene-specific focus/follow timing is unchanged. |
| Endless Bamboo Stairs | 1280 | Scripted progression plus follow | Current generated staircase is horizontal within the 576-pixel map; its sequence follow and pan remain scene-owned. |
| Functions with Arrays 1-3 | 1280 | Scripted sequence plus inspection | Existing event animation and final player follow are retained. |
| Ancient Cemetery | 1280 | Scripted focus plus inspection | The existing spirit-release pan and final player follow are retained. |
| Bakunawa finale | 1280 | Boss/scripted camera | Manual inspection is disabled so the existing opening and six-phase boss framing remains authoritative. |

All map heights remain their authored 544 or 576 pixels. Physics bounds, object coordinates, spawn points, collisions, and tilemap geometry are unchanged.

## Scripted pans and lifecycle

Existing important-event pans remain in the scenes that authored them, including the Tikbalang route preview, Kapre/tag sequence, Methods ritual targets, recursion progression, Ancient Cemetery spirit release, and Bakunawa boss phases. Camera completion does not control code validation or scoring.

The plugin removes its pointer and scale listeners on scene shutdown/destroy. GAME/CODE/LESSON tab switches only hide panels; they do not remount the level. Returning to GAME triggers the existing resize notification, allowing Phaser to measure the visible parent without resetting scene state.
