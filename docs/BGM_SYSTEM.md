# Background Music System

SharpRunner owns background music in the game route through the centralized
`bgmManager.js` module. Music is separate from Phaser sound effects, so Phaser
scene recreation does not stack or restart chapter music. Only the track needed
by the current level is created and downloaded.

## Curriculum mapping

| Curriculum section | Verified global game IDs | BGM |
| --- | --- | --- |
| Tutorial / Prologue | 1-5 | `bgm_tutorial.mp3` |
| Arrays 1-8 | 6-13 | `bgm_malumay.mp3` |
| Functions 9-15 | 14-20 | `bgm_ritual.mp3` |
| Encounter levels 16-17 | 21-22 | `bgm_encounter.mp3` |
| Ancient Spirits / later journey 18-23 | 23, 24, 26-28 | `bgm_ancient_spirits.mp3` |
| Cemetery level 24 | 29 | `bgm_cemetery.mp3` |
| Final / Bakunawa | 30 | `bgm_bakunawa.mp3` |

Global game ID 24 combines curriculum Methods levels 11-12, and global ID 25
is not present in the current route/configuration. The mapping follows the
existing IDs without renaming or reordering levels.

## Playback and preferences

- Music loops at a quiet 10% default. The game control limits music to 0-40%.
- SFX has an independent 100% default and 0-100% control.
- Music and SFX each have an independent on/off setting.
- Changes are live and persist in local storage. The legacy game mute key stays
  synchronized with SFX mute for scenes that already read it directly.
- Moving between levels assigned the same track keeps the existing audio and
  playback position. A category change fades the old track out and the new
  track in over 750 ms, with only one active BGM owner.
- If autoplay is blocked, pointer, touch, or keyboard interaction retries music
  unobtrusively. Load/play failures log a development warning and never block a
  level.
- Leaving the game route fades and releases BGM. Final Bakunawa success fades
  the boss track without restarting it on the completion screen.
- The asset audit retains the existing 42 MB cap for non-BGM game assets and
  validates the seven lazy-loaded tracks separately against a 40 MB BGM cap.

## Dialogue voice blips

Narrative dialogue uses the shared `dialogueSfxManager.js` presentation layer
and `/game/assets/sounds/sfx/medium-text-blip-dialogue.mp3`. The manager reuses
one audio instance and plays a restrained blip after every third letter or
number, ignoring spaces and punctuation and enforcing a 55 ms minimum interval.
Each blip uses a 0.60 base volume multiplied by the live SFX volume and a subtle
0.95-1.05 playback-rate variation. SFX mute, zero volume, skipping text,
advancing a line, closing dialogue, and leaving the game stop playback without
affecting BGM or dialogue progression.
