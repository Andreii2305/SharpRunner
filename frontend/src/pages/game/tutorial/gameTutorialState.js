const STORAGE_PREFIX = "sharprunner:game-tutorial-completed:v1";

export const getTutorialStorageKey = (userId) =>
  userId == null || userId === "" ? null : `${STORAGE_PREFIX}:${encodeURIComponent(String(userId))}`;

export const readTutorialCompletion = (storage, userId) => {
  const key = getTutorialStorageKey(userId);
  if (!key || !storage) return false;
  try {
    return storage.getItem(key) === "true";
  } catch {
    return false;
  }
};

export const shouldOpenTutorial = (storage, userId, { replay = false } = {}) =>
  replay || !readTutorialCompletion(storage, userId);

export const markTutorialComplete = (storage, userId) => {
  const key = getTutorialStorageKey(userId);
  if (!key || !storage) return false;
  try {
    storage.setItem(key, "true");
    return true;
  } catch {
    return false;
  }
};

export const moveTutorialStep = (current, direction, stepCount) => {
  const last = Math.max(0, stepCount - 1);
  return Math.min(last, Math.max(0, current + (direction === "next" ? 1 : -1)));
};
