const conflictCodes = new Set([
  "ATTEMPT_ALREADY_SUBMITTED",
  "ASSESSMENT_LOCKED",
  "ASSESSMENT_VERSION_CONFLICT",
]);

const isImmutableConflict = (error) => (
  error?.status === 409
  || conflictCodes.has(error?.code)
);

const normalizedQuestionId = (value) => {
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return Number(value);
  return value;
};

const notify = (callback, event) => {
  if (typeof callback !== "function") return;
  callback(event);
};

export const createAssessmentSaveCoordinator = ({
  attemptId: initialAttemptId,
  initialSavedByQuestion = {},
  initialSavedSourceByQuestion = {},
  saveResponse,
  onSaveStarted,
  onSaveSucceeded,
  onSaveFailed,
  onConflict,
}) => {
  if (typeof saveResponse !== "function") {
    throw new TypeError("saveResponse must be a function");
  }

  let attemptId = initialAttemptId;
  let epoch = 0;
  let disposed = false;
  let halted = false;
  let entries = new Map();

  const makeEntry = (questionId, kind, savedValue) => ({
    questionId,
    kind,
    ...(kind === "choice"
      ? { desiredChoiceId: savedValue, savedChoiceId: savedValue }
      : { desiredSourceCode: savedValue, savedSourceCode: savedValue }),
    revision: 0,
    status: "clean",
    error: null,
    inFlight: null,
    terminalConflict: false,
    forceWrite: false,
    debounceTimer: null,
  });

  const seed = (savedByQuestion, savedSourceByQuestion) => {
    entries = new Map();
    for (const [rawQuestionId, savedChoiceId] of Object.entries(savedByQuestion ?? {})) {
      const questionId = normalizedQuestionId(rawQuestionId);
      entries.set(questionId, makeEntry(questionId, "choice", savedChoiceId));
    }
    for (const [rawQuestionId, savedSourceCode] of Object.entries(savedSourceByQuestion ?? {})) {
      const questionId = normalizedQuestionId(rawQuestionId);
      entries.set(questionId, makeEntry(questionId, "source", savedSourceCode));
    }
  };

  seed(initialSavedByQuestion, initialSavedSourceByQuestion);

  const entryFor = (rawQuestionId, kind) => {
    const questionId = normalizedQuestionId(rawQuestionId);
    if (!entries.has(questionId)) {
      entries.set(questionId, makeEntry(questionId, kind, undefined));
    }
    const entry = entries.get(questionId);
    if (entry.kind !== kind) return null;
    return entry;
  };

  const desiredValue = (entry) => (
    entry.kind === "choice" ? entry.desiredChoiceId : entry.desiredSourceCode
  );
  const savedValue = (entry) => (
    entry.kind === "choice" ? entry.savedChoiceId : entry.savedSourceCode
  );
  const setSavedValue = (entry, value) => {
    if (entry.kind === "choice") entry.savedChoiceId = value;
    else entry.savedSourceCode = value;
  };
  const valuePayload = (entry, value = desiredValue(entry)) => (
    entry.kind === "choice" ? { selectedChoiceId: value } : { sourceCode: value }
  );
  const clearDebounce = (entry) => {
    if (entry.debounceTimer !== null) clearTimeout(entry.debounceTimer);
    entry.debounceTimer = null;
  };

  const start = (entry) => {
    if (
      disposed
      || halted
      || entry.inFlight
      || entry.terminalConflict
      || (desiredValue(entry) === savedValue(entry) && !entry.forceWrite)
    ) return false;

    clearDebounce(entry);
    const requestEpoch = epoch;
    const requestAttemptId = attemptId;
    const requestValue = desiredValue(entry);
    const revision = entry.revision;
    const event = {
      attemptId: requestAttemptId,
      questionId: entry.questionId,
      ...valuePayload(entry, requestValue),
      revision,
    };

    entry.status = "saving";
    entry.error = null;
    notify(onSaveStarted, event);

    let operation;
    try {
      operation = Promise.resolve(saveResponse({
        attemptId: requestAttemptId,
        questionId: entry.questionId,
        ...valuePayload(entry, requestValue),
      }));
    } catch (error) {
      operation = Promise.reject(error);
    }

    const settled = operation.then(
      (response) => {
        if (
          disposed
          || requestEpoch !== epoch
          || entries.get(entry.questionId) !== entry
        ) return;

        if (halted) {
          entry.inFlight = null;
          return;
        }

        entry.inFlight = null;
        setSavedValue(entry, requestValue);
        entry.error = null;
        entry.terminalConflict = false;
        entry.forceWrite = false;
        entry.status = desiredValue(entry) === savedValue(entry) ? "clean" : "dirty";
        notify(onSaveSucceeded, { ...event, response });
        if (desiredValue(entry) !== savedValue(entry) && entry.debounceTimer === null) start(entry);
      },
      (error) => {
        if (
          disposed
          || requestEpoch !== epoch
          || entries.get(entry.questionId) !== entry
        ) return;

        entry.inFlight = null;
        entry.terminalConflict = isImmutableConflict(error);
        if (halted && !entry.terminalConflict) return;
        entry.error = error;
        entry.forceWrite = !entry.terminalConflict;
        entry.status = entry.terminalConflict ? "conflict" : "error";
        const failedEvent = {
          ...event,
          ...valuePayload(entry),
          revision: entry.revision,
          ...(entry.kind === "choice"
            ? { failedSelectedChoiceId: requestValue }
            : { failedSourceCode: requestValue }),
          failedRevision: revision,
          error,
        };
        if (entry.terminalConflict) {
          halted = true;
          notify(onConflict, failedEvent);
        } else {
          notify(onSaveFailed, failedEvent);
        }
      },
    );
    entry.inFlight = settled;
    return true;
  };

  const select = (questionId, selectedChoiceId) => {
    if (disposed || halted) return false;
    const entry = entryFor(questionId, "choice");
    if (!entry) return false;
    if (entry.terminalConflict) return false;
    if (entry.desiredChoiceId === selectedChoiceId) return false;

    const failedError = entry.status === "error" ? entry.error : null;
    entry.desiredChoiceId = selectedChoiceId;
    entry.revision += 1;

    if (entry.desiredChoiceId === entry.savedChoiceId && !entry.forceWrite) {
      if (!entry.inFlight) {
        entry.status = "clean";
        entry.error = null;
      }
      return true;
    }

    if (!entry.inFlight) {
      if (failedError) {
        entry.status = "error";
        entry.error = failedError;
        return true;
      }
      entry.error = null;
      entry.status = "dirty";
      start(entry);
    }
    return true;
  };

  const updateSource = (questionId, sourceCode, { debounceMs = 500 } = {}) => {
    if (disposed || halted || typeof sourceCode !== "string") return false;
    const entry = entryFor(questionId, "source");
    if (!entry || entry.terminalConflict) return false;
    if (entry.desiredSourceCode === sourceCode) return false;

    const failedError = entry.status === "error" ? entry.error : null;
    entry.desiredSourceCode = sourceCode;
    entry.revision += 1;
    clearDebounce(entry);

    if (entry.desiredSourceCode === entry.savedSourceCode && !entry.forceWrite) {
      if (!entry.inFlight) {
        entry.status = "clean";
        entry.error = null;
      }
      return true;
    }

    if (failedError && !entry.inFlight) {
      entry.status = "error";
      entry.error = failedError;
      return true;
    }

    entry.error = null;
    entry.status = entry.inFlight ? "saving" : "dirty";
    entry.debounceTimer = setTimeout(() => {
      entry.debounceTimer = null;
      start(entry);
    }, Math.max(0, Number(debounceMs) || 0));
    return true;
  };

  const retry = (questionId) => {
    if (disposed || halted) return false;
    const entry = entries.get(normalizedQuestionId(questionId));
    if (!entry || entry.inFlight || entry.terminalConflict || !entry.error) return false;
    entry.error = null;
    entry.status = "dirty";
    return start(entry);
  };

  const flushAll = async () => {
    while (!disposed) {
      const failed = [...entries.values()].find((entry) => entry.error);
      if (failed) throw failed.error;

      for (const entry of entries.values()) {
        clearDebounce(entry);
        if (
          !entry.inFlight
          && (desiredValue(entry) !== savedValue(entry) || entry.forceWrite)
        ) start(entry);
      }

      const inFlight = [...entries.values()]
        .map((entry) => entry.inFlight)
        .filter(Boolean);
      if (inFlight.length === 0) return;
      await Promise.all(inFlight);
    }
  };

  const getSnapshot = (questionId) => {
    const entry = entries.get(normalizedQuestionId(questionId));
    if (!entry) return null;
    const common = {
      questionId: entry.questionId,
      revision: entry.revision,
      status: entry.status,
      error: entry.error,
    };
    return entry.kind === "choice"
      ? {
        questionId: common.questionId,
        desiredChoiceId: entry.desiredChoiceId,
        savedChoiceId: entry.savedChoiceId,
        revision: common.revision,
        status: common.status,
        error: common.error,
      }
      : {
        questionId: common.questionId,
        desiredSourceCode: entry.desiredSourceCode,
        savedSourceCode: entry.savedSourceCode,
        revision: common.revision,
        status: common.status,
        error: common.error,
      };
  };

  const reset = ({
    attemptId: nextAttemptId,
    initialSavedByQuestion: nextSavedByQuestion = {},
    initialSavedSourceByQuestion: nextSavedSourceByQuestion = {},
  }) => {
    if (disposed) return false;
    epoch += 1;
    attemptId = nextAttemptId;
    halted = false;
    for (const entry of entries.values()) clearDebounce(entry);
    seed(nextSavedByQuestion, nextSavedSourceByQuestion);
    return true;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    epoch += 1;
    for (const entry of entries.values()) clearDebounce(entry);
  };

  return {
    select,
    updateSource,
    retry,
    flushAll,
    getSnapshot,
    reset,
    dispose,
  };
};
