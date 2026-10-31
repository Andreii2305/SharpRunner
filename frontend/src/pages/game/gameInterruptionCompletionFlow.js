const initialState = () => ({
  status: "idle",
  error: null,
  pendingCount: 0,
});

const normalizeScope = ({ accountId, classroomId, levelKey } = {}) => {
  const normalized = {
    accountId: Number(accountId),
    classroomId: Number(classroomId),
    levelKey: typeof levelKey === "string" ? levelKey.trim() : "",
  };
  if (!Number.isSafeInteger(normalized.accountId) || normalized.accountId <= 0
    || !Number.isSafeInteger(normalized.classroomId) || normalized.classroomId <= 0
    || !normalized.levelKey) return null;
  return normalized;
};

const sameScope = (left, right) => Boolean(
  left
  && right
  && left.accountId === right.accountId
  && left.classroomId === right.classroomId
  && left.levelKey === right.levelKey,
);

const strictPositiveSafeInteger = (value) => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export const validateGameCompletionResponseScope = (payload, requestedScope) => {
  const expectedClassroomId = strictPositiveSafeInteger(requestedScope?.classroomId);
  const responseClassroomId = strictPositiveSafeInteger(payload?.classroomId);
  const expectedLevelKey = typeof requestedScope?.levelKey === "string"
    ? requestedScope.levelKey
    : "";
  if (!expectedClassroomId || responseClassroomId !== expectedClassroomId || !expectedLevelKey) {
    return false;
  }
  return Array.isArray(payload?.levels)
    && payload.levels.some((level) => level?.levelKey === expectedLevelKey);
};

const canceled = (error) => error?.code === "ERR_CANCELED"
  || error?.name === "AbortError"
  || error?.name === "CanceledError";

const errorState = (error) => {
  const status = Number(error?.response?.status);
  if (!error?.response || (status >= 500 && status <= 599)) {
    return {
      status: "uncertain",
      error: {
        code: "COMPLETION_UNCERTAIN",
        message: "The save result is uncertain. Retry the same completion without running the code again.",
      },
    };
  }
  return {
    status: "error",
    error: {
      code: error.response.data?.code ?? "COMPLETION_FAILED",
      message: error.response.data?.message ?? "The completed level could not be saved.",
    },
  };
};

export const createGameInterruptionCompletionFlow = ({
  reportingController,
  sendCompletion,
  validateResponse = () => true,
  onSuccess = () => {},
  onError = () => {},
  onChange = () => {},
} = {}) => {
  if (!reportingController || typeof sendCompletion !== "function") {
    throw new TypeError("Completion reporting dependencies are required");
  }
  let disposed = false;
  let generation = 0;
  let scope = null;
  let operation = null;
  let request = null;
  let state = initialState();

  const publish = (changes) => {
    state = { ...state, ...changes };
    if (!disposed) onChange({ ...state });
  };
  const abort = () => {
    generation += 1;
    request?.abort.abort();
    request = null;
  };
  const current = (token, requestedScope, requestedOperation) => !disposed
    && token === generation
    && sameScope(scope, requestedScope)
    && operation === requestedOperation;

  const execute = () => {
    if (disposed || !scope || !operation) return Promise.resolve(false);
    if (request) return request.promise;
    if (!operation.snapshot) {
      if (!operation.reportingRequired) {
        operation.snapshot = Object.freeze({ entries: Object.freeze([]) });
        operation.interruptionEvents = operation.snapshot.entries;
      } else {
        const snapshot = reportingController.beginCompletion();
        if (!snapshot.ready) {
          publish({ status: snapshot.drainRequired ? "draining" : "error", error: snapshot.drainRequired
            ? null
            : { code: "SESSION_NOT_READY", message: "The interruption session is not ready." }, pendingCount: snapshot.pendingCount });
          return Promise.resolve(false);
        }
        operation.snapshot = snapshot;
        operation.interruptionEvents = snapshot.entries;
      }
    }

    const requestedOperation = operation;
    const requestedScope = { ...scope };
    const token = generation;
    const requestAbort = new AbortController();
    publish({ status: "saving", error: null, pendingCount: requestedOperation.interruptionEvents.length });
    const promise = (async () => {
      try {
        const payload = await sendCompletion({
          activityId: requestedOperation.activityId,
          sourceCode: requestedOperation.sourceCode,
          interruptionEvents: requestedOperation.interruptionEvents,
          signal: requestAbort.signal,
        });
        if (!current(token, requestedScope, requestedOperation)) return false;
        if (!validateGameCompletionResponseScope(payload, requestedScope)
          || !validateResponse(payload, requestedScope)) {
          publish({
            status: "error",
            error: { code: "INVALID_COMPLETION_RESPONSE", message: "The completion response could not be verified." },
          });
          return false;
        }
        if (requestedOperation.reportingRequired
          && !reportingController.confirmCompletion(requestedOperation.snapshot)) {
          publish({
            status: "error",
            error: { code: "COMPLETION_SCOPE_CHANGED", message: "The completion no longer matches this level." },
          });
          return false;
        }
        publish({ status: "success", error: null, pendingCount: 0 });
        onSuccess(payload, requestedScope);
        return true;
      } catch (error) {
        if (!current(token, requestedScope, requestedOperation) || canceled(error)) return false;
        const nextError = errorState(error);
        publish(nextError);
        onError(error, nextError, requestedScope);
        return false;
      } finally {
        if (request?.promise === promise) request = null;
      }
    })();
    request = { abort: requestAbort, promise };
    return promise;
  };

  return {
    getState: () => ({ ...state, error: state.error ? { ...state.error } : null }),
    setScope(next) {
      if (disposed) return false;
      const normalized = normalizeScope(next);
      if (sameScope(scope, normalized)) return false;
      abort();
      scope = normalized;
      operation = null;
      state = initialState();
      onChange({ ...state });
      return true;
    },
    begin(input = {}) {
      if (disposed || !scope) return Promise.resolve(false);
      if (request) return request.promise;
      if (!operation) {
        const reportingRequired = input.reportingRequired !== false;
        if (typeof input.activityId !== "string" || !input.activityId
          || typeof input.sourceCode !== "string"
          || (reportingRequired && !reportingController.closeIntakeForCompletion())) return Promise.resolve(false);
        operation = {
          activityId: input.activityId,
          sourceCode: input.sourceCode,
          reportingRequired,
          snapshot: null,
          interruptionEvents: null,
        };
      }
      return execute();
    },
    retry: execute,
    reset() {
      if (disposed) return false;
      abort();
      reportingController.cancelCompletion();
      operation = null;
      publish(initialState());
      return true;
    },
    dispose() {
      if (disposed) return;
      abort();
      disposed = true;
      scope = null;
      operation = null;
      state = initialState();
    },
  };
};

const normalizeLifecycleScope = ({ accountId, classroomId, levelKey } = {}) => {
  const normalized = normalizeScope({ accountId, classroomId, levelKey });
  return normalized ? Object.freeze(normalized) : null;
};

export const createGameInterruptionLifecycleController = ({
  createReportingController,
  createCompletionFlow = createGameInterruptionCompletionFlow,
  createKey,
} = {}) => {
  if (typeof createReportingController !== "function"
    || typeof createCompletionFlow !== "function"
    || typeof createKey !== "function") {
    throw new TypeError("Interruption lifecycle dependencies are required");
  }

  let active = null;
  let sessionScope = null;
  let sessionKey = null;

  const cleanup = (owned) => {
    if (!owned) return false;
    owned.completionFlow.dispose();
    owned.reportingController.dispose();
    if (active === owned) active = null;
    return true;
  };

  return {
    setup({ scope: scopeInput, reportingOptions, completionOptions } = {}) {
      const nextScope = normalizeLifecycleScope(scopeInput);
      if (!nextScope) throw new TypeError("A valid interruption lifecycle scope is required");
      if (active) cleanup(active);
      if (!sameScope(sessionScope, nextScope)) {
        sessionScope = nextScope;
        sessionKey = createKey("session");
      }

      const reportingController = createReportingController({
        ...reportingOptions,
        createKey: (kind) => kind === "session" ? sessionKey : createKey(kind),
      });
      const completionFlow = createCompletionFlow({
        ...completionOptions,
        reportingController,
      });
      reportingController.setScope(nextScope);
      completionFlow.setScope(nextScope);
      const owned = Object.freeze({ completionFlow, reportingController, scope: nextScope });
      active = owned;
      return owned;
    },
    cleanup,
    getReportingController: () => active?.reportingController ?? null,
    getCompletionFlow: () => active?.completionFlow ?? null,
  };
};
