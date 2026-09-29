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

  const seed = (savedByQuestion) => {
    entries = new Map();
    for (const [rawQuestionId, savedChoiceId] of Object.entries(savedByQuestion ?? {})) {
      const questionId = normalizedQuestionId(rawQuestionId);
      entries.set(questionId, {
        questionId,
        desiredChoiceId: savedChoiceId,
        savedChoiceId,
        revision: 0,
        status: "clean",
        error: null,
        inFlight: null,
        terminalConflict: false,
        forceWrite: false,
      });
    }
  };

  seed(initialSavedByQuestion);

  const entryFor = (rawQuestionId) => {
    const questionId = normalizedQuestionId(rawQuestionId);
    if (!entries.has(questionId)) {
      entries.set(questionId, {
        questionId,
        desiredChoiceId: undefined,
        savedChoiceId: undefined,
        revision: 0,
        status: "clean",
        error: null,
        inFlight: null,
        terminalConflict: false,
        forceWrite: false,
      });
    }
    return entries.get(questionId);
  };

  const start = (entry) => {
    if (
      disposed
      || halted
      || entry.inFlight
      || entry.terminalConflict
      || (entry.desiredChoiceId === entry.savedChoiceId && !entry.forceWrite)
    ) return false;

    const requestEpoch = epoch;
    const requestAttemptId = attemptId;
    const selectedChoiceId = entry.desiredChoiceId;
    const revision = entry.revision;
    const event = {
      attemptId: requestAttemptId,
      questionId: entry.questionId,
      selectedChoiceId,
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
        selectedChoiceId,
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
        entry.savedChoiceId = selectedChoiceId;
        entry.error = null;
        entry.terminalConflict = false;
        entry.forceWrite = false;
        entry.status = entry.desiredChoiceId === entry.savedChoiceId ? "clean" : "dirty";
        notify(onSaveSucceeded, { ...event, response });
        if (entry.desiredChoiceId !== entry.savedChoiceId) start(entry);
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
          selectedChoiceId: entry.desiredChoiceId,
          revision: entry.revision,
          failedSelectedChoiceId: selectedChoiceId,
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
    const entry = entryFor(questionId);
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
        if (
          !entry.inFlight
          && (entry.desiredChoiceId !== entry.savedChoiceId || entry.forceWrite)
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
    return {
      questionId: entry.questionId,
      desiredChoiceId: entry.desiredChoiceId,
      savedChoiceId: entry.savedChoiceId,
      revision: entry.revision,
      status: entry.status,
      error: entry.error,
    };
  };

  const reset = ({
    attemptId: nextAttemptId,
    initialSavedByQuestion: nextSavedByQuestion = {},
  }) => {
    if (disposed) return false;
    epoch += 1;
    attemptId = nextAttemptId;
    halted = false;
    seed(nextSavedByQuestion);
    return true;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    epoch += 1;
  };

  return {
    select,
    retry,
    flushAll,
    getSnapshot,
    reset,
    dispose,
  };
};
