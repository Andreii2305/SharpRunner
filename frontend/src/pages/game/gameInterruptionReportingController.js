const EVENT_TYPES = new Set(["fullscreen_exit", "hidden"]);
const CURRENT = "CURRENT";
const COMPLETION_BATCH_LIMIT = 100;

const positiveSafeInteger = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeScope = ({ accountId, classroomId, levelKey } = {}) => {
  const normalizedAccountId = positiveSafeInteger(accountId);
  const normalizedClassroomId = positiveSafeInteger(classroomId);
  const normalizedLevelKey = typeof levelKey === "string" ? levelKey.trim() : "";
  if (!normalizedAccountId || !normalizedClassroomId || !normalizedLevelKey) return null;
  return {
    accountId: normalizedAccountId,
    classroomId: normalizedClassroomId,
    levelKey: normalizedLevelKey,
  };
};

const sameScope = (left, right) => Boolean(
  left
  && right
  && left.accountId === right.accountId
  && left.classroomId === right.classroomId
  && left.levelKey === right.levelKey,
);

const canceled = (error) => error?.code === "ERR_CANCELED"
  || error?.name === "AbortError"
  || error?.name === "CanceledError";

const retryAfterMs = (error) => {
  const raw = error?.response?.headers?.["retry-after"] ?? error?.response?.data?.retryAfter;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : 60_000;
};

const classifyError = (error) => {
  const status = Number(error?.response?.status);
  if (!error?.response || (status >= 500 && status <= 599)) {
    return { kind: "uncertain", code: "DELIVERY_UNCERTAIN", message: "The request result is uncertain." };
  }
  const code = typeof error.response.data?.code === "string"
    ? error.response.data.code
    : "REQUEST_FAILED";
  const message = typeof error.response.data?.message === "string"
    ? error.response.data.message
    : "The request could not be completed.";
  if (status === 429) return { kind: "rate-limited", code, message };
  return { kind: "definitive", code, message };
};

export const createGameInterruptionKey = (kind) => {
  const random = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
  return `${kind}_${random}`.slice(0, 96);
};

export const initialGameInterruptionReportingState = Object.freeze({
  sessionStatus: "idle",
  session: null,
  sessionError: null,
  deliveryStatus: "idle",
  deliveryError: null,
  retryAt: null,
  pendingCount: 0,
  intakeClosed: false,
  completionPending: false,
});

const initialState = () => ({ ...initialGameInterruptionReportingState });

const validRateSnapshots = (session) => {
  const score = session?.scoreDeductionSnapshot;
  const xp = session?.xpDeductionSnapshot;
  return typeof score === "number"
    && Number.isFinite(score)
    && score >= 0
    && score <= 100
    && typeof xp === "number"
    && Number.isSafeInteger(xp)
    && xp >= 0
    && xp <= 100;
};

export const createGameInterruptionReportingController = ({
  startSession,
  recordEvent,
  createKey = createGameInterruptionKey,
  now = () => Date.now(),
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (timer) => globalThis.clearTimeout(timer),
  onChange = () => {},
} = {}) => {
  if (typeof startSession !== "function" || typeof recordEvent !== "function") {
    throw new TypeError("Game interruption reporting requests are required");
  }

  let disposed = false;
  let generation = 0;
  let scope = null;
  let sessionKey = null;
  let state = initialState();
  let sessionRequest = null;
  let eventRequest = null;
  let retryTimer = null;
  let queue = [];
  let completionSnapshot = null;

  const publish = (changes) => {
    state = { ...state, ...changes, pendingCount: queue.length };
    if (!disposed) onChange({ ...state });
  };

  const clearRetryTimer = () => {
    if (retryTimer != null) clearTimer(retryTimer);
    retryTimer = null;
  };

  const abortRequests = () => {
    generation += 1;
    sessionRequest?.abort.abort();
    eventRequest?.abort.abort();
    sessionRequest = null;
    eventRequest = null;
    clearRetryTimer();
  };

  const current = (token, requestedScope) => !disposed
    && token === generation
    && sameScope(scope, requestedScope);

  const validateSessionResponse = (payload, requestedScope) => {
    const session = payload?.session;
    if ((payload?.changed !== true && payload?.changed !== false)
      || !Number.isSafeInteger(session?.id)
      || session.id <= 0
      || session.classroomId !== requestedScope.classroomId
      || session.levelKey !== requestedScope.levelKey
      || !["CURRENT", "SUPERSEDED", "COMPLETED"].includes(session.lifecycleStatus)
      || !validRateSnapshots(session)) {
      return null;
    }
    return Object.freeze({
      ...session,
      id: session.id,
      classroomId: session.classroomId,
    });
  };

  const validateEventResponse = (payload, entry, activeSession, requestedScope) => {
    const event = payload?.event;
    return Boolean(
      (payload?.changed === true || payload?.changed === false)
      && Number.isSafeInteger(event?.id)
      && event.id > 0
      && event.sessionId === activeSession.id
      && event.classroomId === requestedScope.classroomId
      && event.levelKey === requestedScope.levelKey
      && event.eventType === entry.eventType
      && typeof event.receivedAt === "string"
      && event.receivedAt,
    );
  };

  const scheduleRetry = (error, token, requestedScope, callback) => {
    clearRetryTimer();
    const delay = retryAfterMs(error);
    const retryAt = now() + delay;
    retryTimer = setTimer(() => {
      retryTimer = null;
      if (current(token, requestedScope)) callback();
    }, delay);
    return retryAt;
  };

  let drainEvents;

  const startSessionRequest = () => {
    if (disposed || !scope || state.completionPending) return Promise.resolve(false);
    if (state.sessionStatus === "current") return Promise.resolve(true);
    if (state.sessionStatus === "terminal") return Promise.resolve(false);
    if (sessionRequest) return sessionRequest.promise;

    const token = generation;
    const requestedScope = { ...scope };
    const requestedKey = sessionKey;
    const abort = new AbortController();
    publish({ sessionStatus: "starting", sessionError: null, retryAt: null });
    const promise = (async () => {
      try {
        const payload = await startSession({
          classroomId: requestedScope.classroomId,
          levelKey: requestedScope.levelKey,
          sessionKey: requestedKey,
          signal: abort.signal,
        });
        if (!current(token, requestedScope) || sessionKey !== requestedKey) return false;
        const session = validateSessionResponse(payload, requestedScope);
        if (!session) {
          publish({
            sessionStatus: "error",
            sessionError: { code: "INVALID_SESSION_RESPONSE", message: "The session response was invalid." },
          });
          return false;
        }
        if (session.lifecycleStatus !== CURRENT) {
          publish({
            sessionStatus: "terminal",
            session,
            sessionError: {
              code: "SESSION_NOT_CURRENT",
              message: "The interruption session is no longer current.",
            },
          });
          return false;
        }
        publish({ sessionStatus: "current", session, sessionError: null, retryAt: null });
        void drainEvents();
        return true;
      } catch (error) {
        if (!current(token, requestedScope) || sessionKey !== requestedKey || canceled(error)) return false;
        const classification = classifyError(error);
        if (classification.kind === "rate-limited") {
          const retryAt = scheduleRetry(error, token, requestedScope, () => {
            if (state.sessionStatus === "rate-limited") void startSessionRequest();
          });
          publish({ sessionStatus: "rate-limited", sessionError: classification, retryAt });
          return false;
        }
        publish({
          sessionStatus: classification.kind === "uncertain" ? "uncertain" : "error",
          sessionError: classification,
          retryAt: null,
        });
        return false;
      } finally {
        if (sessionRequest?.promise === promise) sessionRequest = null;
      }
    })();
    sessionRequest = { abort, promise };
    return promise;
  };

  drainEvents = ({ force = false } = {}) => {
    if (disposed || !scope || state.completionPending || state.sessionStatus !== "current") {
      return Promise.resolve(false);
    }
    if (eventRequest) return eventRequest.promise;
    if (queue.length === 0) {
      publish({ deliveryStatus: "idle", deliveryError: null, retryAt: null });
      return Promise.resolve(true);
    }
    if (!force && ["uncertain", "rate-limited", "error"].includes(state.deliveryStatus)) {
      return Promise.resolve(false);
    }

    const entry = queue[0];
    const activeSession = state.session;
    const token = generation;
    const requestedScope = { ...scope };
    const abort = new AbortController();
    entry.status = "in-flight";
    publish({ deliveryStatus: "sending", deliveryError: null, retryAt: null });
    const promise = (async () => {
      try {
        const payload = await recordEvent({
          classroomId: requestedScope.classroomId,
          levelKey: requestedScope.levelKey,
          sessionId: activeSession.id,
          eventKey: entry.eventKey,
          eventType: entry.eventType,
          signal: abort.signal,
        });
        if (!current(token, requestedScope)
          || state.session?.id !== activeSession.id
          || queue[0] !== entry) return false;
        if (!validateEventResponse(payload, entry, activeSession, requestedScope)) {
          entry.status = "pending";
          publish({
            deliveryStatus: "error",
            deliveryError: { code: "INVALID_EVENT_RESPONSE", message: "The event response was invalid." },
          });
          return false;
        }
        queue = queue.slice(1);
        publish({ deliveryStatus: "idle", deliveryError: null, retryAt: null });
        return true;
      } catch (error) {
        if (!current(token, requestedScope) || queue[0] !== entry || canceled(error)) return false;
        entry.status = "pending";
        const classification = classifyError(error);
        if (classification.kind === "rate-limited") {
          const retryAt = scheduleRetry(error, token, requestedScope, () => {
            if (state.deliveryStatus === "rate-limited") void drainEvents({ force: true });
          });
          publish({ deliveryStatus: "rate-limited", deliveryError: classification, retryAt });
          return false;
        }
        publish({
          deliveryStatus: classification.kind === "uncertain" ? "uncertain" : "error",
          deliveryError: classification,
          retryAt: null,
        });
        return false;
      } finally {
        if (eventRequest?.promise === promise) {
          eventRequest = null;
          if (current(token, requestedScope)
            && queue.length > 0
            && state.deliveryStatus === "idle"
            && !state.completionPending) {
            void drainEvents();
          }
        }
      }
    })();
    eventRequest = { entry, abort, promise };
    return promise;
  };

  const snapshot = () => {
    const pendingCount = queue.length;
    const hasCurrentSession = state.sessionStatus === "current" && state.session?.lifecycleStatus === CURRENT;
    const drainRequired = pendingCount > COMPLETION_BATCH_LIMIT || (!hasCurrentSession && pendingCount > 0);
    const entries = !drainRequired && hasCurrentSession
      ? queue.map((entry) => Object.freeze({
        sessionId: state.session.id,
        eventKey: entry.eventKey,
        eventType: entry.eventType,
      }))
      : [];
    return Object.freeze({
      ready: hasCurrentSession && !drainRequired,
      drainRequired,
      pendingCount,
      sessionId: hasCurrentSession ? state.session.id : null,
      entries: Object.freeze(entries),
      scope: scope ? Object.freeze({ ...scope }) : null,
      generation,
    });
  };

  const controller = {
    getState: () => ({
      ...state,
      session: state.session ? { ...state.session } : null,
      sessionError: state.sessionError ? { ...state.sessionError } : null,
      deliveryError: state.deliveryError ? { ...state.deliveryError } : null,
    }),
    setScope(next) {
      if (disposed) return false;
      const normalized = normalizeScope(next);
      if (sameScope(scope, normalized)) return false;
      abortRequests();
      scope = normalized;
      sessionKey = normalized ? createKey("session") : null;
      queue = [];
      completionSnapshot = null;
      state = initialState();
      onChange({ ...state });
      return true;
    },
    startSession: startSessionRequest,
    retrySession() {
      if (!scope || !["uncertain", "rate-limited"].includes(state.sessionStatus)) {
        return sessionRequest?.promise ?? Promise.resolve(false);
      }
      if (state.sessionStatus === "rate-limited" && state.retryAt != null && now() < state.retryAt) {
        return Promise.resolve(false);
      }
      clearRetryTimer();
      return startSessionRequest();
    },
    acceptInterruption(interruption = {}) {
      if (disposed || !scope || state.intakeClosed || !EVENT_TYPES.has(interruption.type)) return false;
      queue = [...queue, {
        eventKey: createKey("event"),
        eventType: interruption.type,
        status: "pending",
      }];
      publish({});
      if (state.sessionStatus === "current") void drainEvents();
      else if (state.sessionStatus === "idle") void startSessionRequest();
      return true;
    },
    retryEvents() {
      if (!scope || !["uncertain", "rate-limited", "error"].includes(state.deliveryStatus)) {
        return eventRequest?.promise ?? Promise.resolve(false);
      }
      if (state.deliveryStatus === "rate-limited" && state.retryAt != null && now() < state.retryAt) {
        return Promise.resolve(false);
      }
      clearRetryTimer();
      return drainEvents({ force: true });
    },
    getPendingCompletionSnapshot: snapshot,
    closeIntakeForCompletion() {
      if (disposed || !scope || state.sessionStatus !== "current") return false;
      if (!state.intakeClosed) publish({ intakeClosed: true });
      return true;
    },
    beginCompletion() {
      if (completionSnapshot) return completionSnapshot;
      if (!controller.closeIntakeForCompletion()) return snapshot();
      const pending = snapshot();
      if (!pending.ready) return pending;
      generation += 1;
      sessionRequest?.abort.abort();
      eventRequest?.abort.abort();
      sessionRequest = null;
      eventRequest = null;
      clearRetryTimer();
      publish({ completionPending: true, deliveryStatus: "idle", deliveryError: null, retryAt: null });
      completionSnapshot = Object.freeze({ ...pending, generation });
      return completionSnapshot;
    },
    cancelCompletion() {
      if ((!state.completionPending && !state.intakeClosed) || disposed) return false;
      completionSnapshot = null;
      publish({ completionPending: false, intakeClosed: false });
      void drainEvents();
      return true;
    },
    confirmCompletion(pending) {
      if (!state.completionPending
        || !pending
        || !sameScope(scope, pending.scope)
        || pending.generation !== generation
        || pending.sessionId !== state.session?.id
        || pending.entries.length !== queue.length
        || pending.entries.some((entry, index) => entry.eventKey !== queue[index]?.eventKey)) {
        return false;
      }
      generation += 1;
      queue = [];
      completionSnapshot = null;
      publish({
        completionPending: false,
        intakeClosed: true,
        sessionStatus: "completed",
        deliveryStatus: "idle",
        deliveryError: null,
        retryAt: null,
      });
      return true;
    },
    dispose() {
      if (disposed) return;
      abortRequests();
      disposed = true;
      scope = null;
      sessionKey = null;
      queue = [];
      completionSnapshot = null;
      state = initialState();
    },
  };
  return controller;
};
