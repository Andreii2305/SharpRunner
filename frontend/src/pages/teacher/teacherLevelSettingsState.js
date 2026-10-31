const SCORE_ERROR = "Enter a number from 0 to 100 with up to two decimal places.";
const XP_ERROR = "Enter a whole number from 0 to 100.";

const decimalPattern = /^(?:\d+|\d+\.\d{1,2}|\.\d{1,2})$/;
const integerPattern = /^\d+$/;

const validBoundedValue = (value, pattern) => {
  if (typeof value !== "number" && typeof value !== "string") return false;
  const text = String(value);
  if (!pattern.test(text)) return false;
  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100;
};

export const validateInterruptionDeductions = (setting) => {
  const errors = {};
  if (!validBoundedValue(setting?.interruptionScoreDeduction, decimalPattern)) {
    errors.interruptionScoreDeduction = SCORE_ERROR;
  }
  if (!validBoundedValue(setting?.interruptionXpDeduction, integerPattern)) {
    errors.interruptionXpDeduction = XP_ERROR;
  }
  return errors;
};

export const mergeLevelSettings = (defaults, rows) => {
  const overrides = new Map((rows ?? []).map((row) => [row.levelKey, row]));
  return defaults
    .map((setting) => {
      const row = overrides.get(setting.levelKey);
      if (!row) return setting;
      return {
        ...setting,
        ...row,
        displayOrder: Number.isInteger(row.displayOrder)
          ? row.displayOrder
          : setting.displayOrder,
        interruptionScoreDeduction: Number(row.interruptionScoreDeduction ?? 1),
        interruptionXpDeduction: Number(row.interruptionXpDeduction ?? 10),
      };
    })
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((setting, index) => ({ ...setting, displayOrder: index + 1 }));
};

export const buildLevelSettingsPayload = (settings, toIso) => ({
  settings: settings.map((setting) => ({
    levelKey: setting.levelKey,
    isEnabled: setting.isEnabled,
    unlockAt: toIso(setting.unlockAt),
    dueAt: toIso(setting.dueAt),
    hintsEnabled: setting.hintsEnabled,
    hintUnlockThreshold: Number(setting.hintUnlockThreshold),
    wrongAttemptDeduction: Number(setting.wrongAttemptDeduction),
    lateDeductionPerDay: Number(setting.lateDeductionPerDay),
    interruptionScoreDeduction: Number(setting.interruptionScoreDeduction),
    interruptionXpDeduction: Number(setting.interruptionXpDeduction),
  })),
});

export const createLevelSettingsRequestFence = (initialScope) => {
  let scope = String(initialScope ?? "");
  let generation = 0;

  return {
    setScope(nextScope) {
      const normalized = String(nextScope ?? "");
      if (normalized !== scope) {
        scope = normalized;
        generation += 1;
      }
    },
    invalidate() {
      generation += 1;
    },
    capture() {
      return { scope, generation };
    },
    isCurrent(token) {
      return Boolean(token)
        && token.scope === scope
        && token.generation === generation;
    },
  };
};

export const runFencedLevelSettingsOperation = async ({
  fence,
  operation,
  onSuccess,
  onError,
  onFinally,
}) => {
  const token = fence.capture();
  try {
    const result = await operation(token);
    if (fence.isCurrent(token)) onSuccess?.(result, token);
    return fence.isCurrent(token);
  } catch (error) {
    if (fence.isCurrent(token)) onError?.(error, token);
    return false;
  } finally {
    if (fence.isCurrent(token)) onFinally?.(token);
  }
};

export const createLevelSettingsMutationController = () => {
  let activeOperation = null;
  let nextOperationId = 1;

  return {
    begin(scope, kind) {
      if (activeOperation) return null;
      activeOperation = Object.freeze({
        id: nextOperationId,
        scope: String(scope ?? ""),
        kind,
      });
      nextOperationId += 1;
      return activeOperation;
    },
    finish(operation) {
      if (activeOperation !== operation) return false;
      activeOperation = null;
      return true;
    },
    isBusy() {
      return activeOperation !== null;
    },
    activeKind() {
      return activeOperation?.kind ?? null;
    },
    runWhenIdle(callback) {
      if (activeOperation) return false;
      callback();
      return true;
    },
  };
};

export const runExclusiveLevelSettingsMutation = async ({
  fence,
  mutations,
  kind,
  operation,
  onStart,
  onSuccess,
  onError,
  onSettled,
}) => {
  const token = fence.capture();
  const owner = mutations.begin(token.scope, kind);
  if (!owner) return { started: false, current: false };

  onStart?.(owner, token);
  let result;
  let error;
  try {
    result = await operation(token, owner);
    if (fence.isCurrent(token)) onSuccess?.(result, token, owner);
  } catch (caughtError) {
    error = caughtError;
    if (fence.isCurrent(token)) onError?.(caughtError, token, owner);
  } finally {
    const current = fence.isCurrent(token);
    if (mutations.finish(owner)) onSettled?.({ current, token, owner });
  }

  const current = fence.isCurrent(token);
  return error
    ? { started: true, current, error }
    : { started: true, current, result };
};
