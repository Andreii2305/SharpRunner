# Gameplay SFX Mapping

Gameplay effects are registered in `frontend/src/pages/game/audio/gameSfx.js` and preloaded once by the Phaser audio boot scene in `Game.jsx`. Scenes request effects by logical name; the registry owns paths, default volumes, cooldowns, pitch limits, and loop defaults. Phaser's master sound volume and mute continue to use the persisted SFX settings.

| Global level | Existing visual/gameplay event | SFX |
| --- | --- | --- |
| Tutorial 1 | Portal teleport / failed impact | `magic_activate.wav` / `impact_soft.wav` |
| Tutorial 2 | Gate opens / failed impact | `magic_activate.wav` / `impact_soft.wav` |
| Tutorial 3 | Villager unfreezes / coins collected | `magic_pulse.mp3` / `item_collect.mp3` |
| Tutorial 4 | Toll coins collected / boarding begins | `item_collect.mp3` / `magic_activate.wav` |
| Tutorial 5 | Wizard casts / portal activates | `magic_pulse.mp3` / `magic_activate.wav` |
| Arrays 1 | Each lantern ignites / gate activates | `fire_ignite.mp3` / `magic_activate.wav` |
| Arrays 2 | Supply collected / wrong crate / enemy retreats | `item_collect.mp3` / `object_shake.mp3` / `enemy_retreat.mp3` |
| Arrays 3 | Active flame ambience / flame wall removed | `fire.mp3` / `impact_soft.wav`, `fire_extinguish.mp3` |
| Arrays 4 | Correct or wrong crate / door unlocks | `item_collect.mp3` or `object_shake.mp3` / `magic_activate.wav` |
| Arrays 5 | Ward scan / full ward activates | `magic_pulse.mp3` / `magic_activate.wav` |
| Arrays 6 | Path reveal / failed route | `magic_activate.wav` / quiet `error_magic.wav` |
| Arrays 7 | Normal or corrupted tag scan / tag burns | `scan.mp3` or `scan_error.mp3` / `fire_ignite.mp3` |
| Arrays 8 | Jar scan / curse reveal / safe pickup / enemy retreat | `scan.mp3`, `scan_error.mp3`, `magic_pulse.mp3`, `item_collect.mp3`, `enemy_retreat.mp3` |
| Functions 1 | Ritual charge / rune pulse / barrier opens | `energy_charge.mp3`, `magic_pulse.mp3`, `magic_activate.wav` |
| Functions 2 | Magical bell activation / ghosts fade | `magic_activate.wav` / `ghost_fade.wav` |
| Functions 3 | Flame ignites and loops / barrier extinguishes | `fire_ignite.mp3`, `fire.mp3` / `fire_extinguish.mp3` |
| Functions 4 | Seal charges / activates / monster retreats | `energy_charge.mp3`, `magic_activate.wav`, `enemy_retreat.mp3` |
| Functions 5 | Stone scan / motes reveal / barrier opens | `scan.mp3`, `magic_pulse.mp3`, `magic_activate.wav` |
| Functions 6 | Route scan / safe path opens | `scan.mp3` / `magic_activate.wav` |
| Functions 7 | Offering placed / barrier accepts or rejects | `item_collect.mp3`, `magic_activate.wav` or quiet `error_magic.wav` |
| Functions 8 | Salt cast / strong hit / Aswang retreat | `magic_pulse.mp3`, `impact_soft.wav`, `boss_hit.mp3`, `enemy_retreat.mp3` |
| Functions 9 | Power charge / shield forms / shield hit | `energy_charge.mp3`, `magic_activate.wav`, `shield_hit.mp3` |
| Functions 10 | Healing charge / field / recovery glow | `energy_charge.mp3`, `heal.mp3`, `magic_pulse.mp3` |
| Functions 11 | Each stair grows / shrine charges / base case | `step_spawn.mp3`, `energy_charge.mp3`, `magic_pulse.mp3` |
| Functions + Arrays 1 | Lantern ignition / road seal dissolves | `fire_ignite.mp3` / `magic_activate.wav` |
| Functions + Arrays 2 | Clean or cursed charm scan / count returns | `scan.mp3` or `scan_error.mp3` / `magic_pulse.mp3` |
| Functions + Arrays 3 | Grid charge / cell pulse / full activation | `energy_charge.mp3`, `magic_pulse.mp3`, `magic_activate.wav` |
| Functions + Arrays 4 | Grave scan / spirits fade and release / moon returns | `scan.mp3`, `scan_error.mp3`, `ghost_fade.wav`, `spirit_release.mp3`, `moon_restore.mp3` |
| Final | Compile charge / phase hits / retreat / dawn | `energy_charge.mp3`, `magic_pulse.mp3`, `boss_hit.mp3`, `enemy_retreat.mp3`, `moon_restore.mp3` |

Every scene's existing completion outcome plays `success_magic.wav` once. A completed in-world failure plays the restrained `error_magic.wav`; compiler feedback itself does not directly trigger gameplay audio. Dialogue continues to use the centralized `medium-text-blip-dialogue.mp3` manager.

Repeated scans, lanterns, spirits, grid cells, and stairs use subtle pitch changes. `fire.mp3` has single-instance ownership and is stopped when the matching fire disappears or when the scene shuts down. All playback is best effort; missing or blocked audio never gates an animation or gameplay callback.

## Future dedicated assets

- `bell_ring.wav` for a consistent final bell source (the current Bell of Dawn scene already has a legacy `bellring.mp3`)
- `gate_open.wav` for non-magical gates
- `crate_open.wav` for physical crate lids
- `lantern_ignite.wav` only if a distinct lantern timbre is desired later

