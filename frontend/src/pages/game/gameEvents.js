import Phaser from "phaser";

export const gameEvents = new Phaser.Events.EventEmitter();

export const GAME_LEVEL_CODE_EVALUATED = "game:level:code-evaluated";
export const GAME_LEVEL_OUTCOME = "game:level:outcome";
export const GAME_LEVEL_DIALOGUE_TRIGGERED = "game:level:dialogue-triggered";
export const GAME_LEVEL_DIALOGUE_CLOSED = "game:level:dialogue-closed";

// Backward-compatible aliases while migrating older scene/page logic.
export const LEVEL_ONE_CODE_EVALUATED = GAME_LEVEL_CODE_EVALUATED;
export const LEVEL_ONE_OUTCOME = GAME_LEVEL_OUTCOME;
