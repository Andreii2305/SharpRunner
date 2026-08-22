const XP_REWARDS = Object.freeze({
  levelCompletion: 20,
  firstAttemptBonus: 10,
  noHintBonus: 5,
});

const DEFAULT_HINT_UNLOCK_THRESHOLD = 3;
const MIN_HINT_UNLOCK_THRESHOLD = 1;
const MAX_HINT_UNLOCK_THRESHOLD = 10;

const GAMIFICATION_PREFERENCES = Object.freeze([
  "progress",
  "competition",
  "rewards",
  "story",
]);

const LEARNING_GAME_INTERESTS = Object.freeze([
  "challenges",
  "exploration",
  "competition",
  "rewards",
]);

module.exports = {
  XP_REWARDS,
  DEFAULT_HINT_UNLOCK_THRESHOLD,
  MIN_HINT_UNLOCK_THRESHOLD,
  MAX_HINT_UNLOCK_THRESHOLD,
  GAMIFICATION_PREFERENCES,
  LEARNING_GAME_INTERESTS,
};
