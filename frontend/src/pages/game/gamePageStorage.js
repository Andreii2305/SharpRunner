export const readGameDraft = (storage, key) => {
  if (!storage || !key) return null;
  try { return storage.getItem(key) ?? null; } catch { return null; }
};

export const removeGameDraft = (storage, key) => {
  if (!storage || !key) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

export const readGameAuthHeaders = (readHeaders) => {
  try { return readHeaders() ?? {}; } catch { return {}; }
};
