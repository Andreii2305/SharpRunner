const GAME_INTERRUPTION_KEY_PATTERN = /^[A-Za-z0-9_-]{8,96}$/;

const GAME_INTERRUPTION_SESSION_STATUS = Object.freeze({
  CURRENT: "CURRENT",
  SUPERSEDED: "SUPERSEDED",
  COMPLETED: "COMPLETED",
});

const GAME_INTERRUPTION_EVENT_TYPE = Object.freeze({
  FULLSCREEN_EXIT: "fullscreen_exit",
  HIDDEN: "hidden",
});

const GAME_INTERRUPTION_HISTORY_LIMITS = Object.freeze({
  keyLength: 96,
  levelKeyLength: 64,
  maximumDeduction: 100,
});

const isBoundedTwoDecimalDeduction = (value) => {
  if (value === null || value === undefined || value === "") return false;
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return false;
  const numeric = Number(text);
  return Number.isFinite(numeric)
    && numeric >= 0
    && numeric <= GAME_INTERRUPTION_HISTORY_LIMITS.maximumDeduction;
};

module.exports = {
  GAME_INTERRUPTION_EVENT_TYPE,
  GAME_INTERRUPTION_HISTORY_LIMITS,
  GAME_INTERRUPTION_KEY_PATTERN,
  GAME_INTERRUPTION_SESSION_STATUS,
  isBoundedTwoDecimalDeduction,
};
