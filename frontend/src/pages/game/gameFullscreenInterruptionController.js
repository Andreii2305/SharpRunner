const ENTER_FAILURE = "Fullscreen could not be started. Gameplay remains paused.";
const EXIT_FAILURE = "Could not exit fullscreen. Gameplay remains in its current state.";
const UNSUPPORTED = "Fullscreen is not available in this browser. Gameplay remains paused.";
const NOT_VISIBLE = "Return to the game before continuing.";
const DEFAULT_SIGNAL_CORRELATION_WINDOW_MS = 250;

export const initialGameFullscreenInterruptionState = Object.freeze({
  status: "unavailable",
  gameplayPermitted: false,
  interruptionCount: 0,
  interruptionReason: null,
  error: null,
});

export const createGameFullscreenInterruptionController = ({
  documentTarget = globalThis.document,
  onStateChange = () => {},
  onInterruption = () => {},
  now = () => Date.now(),
  correlationWindowMs = DEFAULT_SIGNAL_CORRELATION_WINDOW_MS,
} = {}) => {
  let disposed = false;
  let generation = 0;
  let operationSequence = 0;
  let scope = null;
  let state = initialGameFullscreenInterruptionState;
  let enterOperation = null;
  let exitOperation = null;
  let ownedSession = null;
  let lastVisibility = documentTarget?.visibilityState ?? "visible";
  let hasEnteredGameplay = false;
  let completionBoundaryActive = false;
  let recentFullscreenExitAt = null;
  const signalCorrelationWindow = Number.isFinite(correlationWindowMs)
    && correlationWindowMs >= 0
    ? correlationWindowMs
    : DEFAULT_SIGNAL_CORRELATION_WINDOW_MS;

  const publish = (nextState) => {
    state = Object.freeze(nextState);
    if (!disposed) onStateChange(state);
    return state;
  };

  const scopedState = (overrides = {}) => ({
    status: "gated",
    gameplayPermitted: false,
    interruptionCount: state.interruptionCount,
    interruptionReason: state.interruptionReason,
    error: null,
    ...overrides,
  });

  const hasScope = () => Boolean(
    scope
    && scope.accountId != null
    && scope.classroomId != null
    && scope.levelIdentity
    && scope.element,
  );

  const supportsFullscreen = () => (
    hasScope()
    && documentTarget?.fullscreenEnabled !== false
    && typeof scope.element.requestFullscreen === "function"
    && typeof documentTarget?.exitFullscreen === "function"
  );

  const isCurrentEnter = (operation) => Boolean(
    !disposed
    && operation
    && enterOperation === operation
    && scope
    && operation.generation === generation
    && operation.accountId === scope.accountId
    && operation.classroomId === scope.classroomId
    && operation.levelIdentity === scope.levelIdentity
    && operation.element === scope.element,
  );

  const settleEnter = (operation, permitted) => {
    if (operation.settled) return;
    operation.settled = true;
    operation.resolve(permitted);
    if (enterOperation === operation) enterOperation = null;
  };

  const permitGameplay = ({ operation = null } = {}) => {
    if (!hasScope()
      || documentTarget?.visibilityState !== "visible"
      || documentTarget?.fullscreenElement !== scope.element) return false;

    if (operation) {
      ownedSession = {
        operationId: operation.id,
        generation: operation.generation,
        element: operation.element,
      };
    }

    hasEnteredGameplay = true;
    recentFullscreenExitAt = null;

    publish(scopedState({
      status: "permitted",
      gameplayPermitted: true,
      interruptionReason: null,
      error: null,
    }));
    return true;
  };

  const completeEntryWhenReady = (operation) => {
    if (!isCurrentEnter(operation)) {
      settleEnter(operation, false);
      return;
    }
    if (!operation.requestResolved || !operation.observedExactBoundary) return;
    if (!permitGameplay({ operation })) {
      publish(scopedState({ status: "error", error: ENTER_FAILURE }));
      settleEnter(operation, false);
      return;
    }
    settleEnter(operation, true);
  };

  const interrupt = ({ type, reason, allowWhilePaused = false }) => {
    if (completionBoundaryActive
      || !hasEnteredGameplay
      || (!allowWhilePaused && !state.gameplayPermitted)) return false;
    const timestamp = now();

    // Browsers may report one tab/app switch as both fullscreen loss and hidden.
    // Consume a hidden signal arriving within this bounded window after a counted
    // fullscreen exit; a later hidden transition is a separate interruption.
    if (type === "hidden" && recentFullscreenExitAt != null) {
      const elapsed = timestamp - recentFullscreenExitAt;
      if (elapsed >= 0 && elapsed <= signalCorrelationWindow) {
        recentFullscreenExitAt = null;
        return false;
      }
    }

    if (type === "fullscreen_exit") recentFullscreenExitAt = timestamp;
    else recentFullscreenExitAt = null;
    const interruptionCount = state.interruptionCount + 1;
    publish(scopedState({
      status: "interrupted",
      gameplayPermitted: false,
      interruptionCount,
      interruptionReason: reason,
      error: null,
    }));
    onInterruption({ type, count: interruptionCount });
    return true;
  };

  const handleFullscreenChange = () => {
    if (disposed) return;
    const fullscreenElement = documentTarget?.fullscreenElement ?? null;

    if (enterOperation && isCurrentEnter(enterOperation) && fullscreenElement === scope.element) {
      enterOperation.observedExactBoundary = true;
      completeEntryWhenReady(enterOperation);
    }

    if (ownedSession && fullscreenElement !== ownedSession.element) ownedSession = null;
    if (state.gameplayPermitted && (!scope || fullscreenElement !== scope.element)) {
      interrupt({ type: "fullscreen_exit", reason: "fullscreen-exit" });
    }
  };

  const handleVisibilityChange = () => {
    if (disposed) return;
    const nextVisibility = documentTarget?.visibilityState ?? "visible";
    const becameHidden = lastVisibility === "visible" && nextVisibility === "hidden";
    lastVisibility = nextVisibility;
    if (nextVisibility === "visible") recentFullscreenExitAt = null;
    if (becameHidden) {
      interrupt({ type: "hidden", reason: "hidden", allowWhilePaused: true });
    }
  };

  documentTarget?.addEventListener?.("fullscreenchange", handleFullscreenChange);
  documentTarget?.addEventListener?.("visibilitychange", handleVisibilityChange);

  const requestOwnedExit = ({ cleanup = false } = {}) => {
    const session = ownedSession;
    if (!session || documentTarget?.fullscreenElement !== session.element) {
      if (session) ownedSession = null;
      return null;
    }
    if (exitOperation?.sessionOperationId === session.operationId) return exitOperation.promise;

    const operation = {
      id: ++operationSequence,
      sessionOperationId: session.operationId,
      element: session.element,
      generation: session.generation,
      cleanup,
      promise: null,
    };
    let request;
    try {
      request = documentTarget.exitFullscreen();
    } catch (error) {
      request = Promise.reject(error);
    }

    operation.promise = Promise.resolve(request)
      .then(() => documentTarget?.fullscreenElement !== operation.element)
      .catch(() => false)
      .then((exited) => {
        if (exitOperation !== operation) return false;
        if (exited) {
          if (ownedSession?.operationId === operation.sessionOperationId) ownedSession = null;
          return true;
        }
        if (!cleanup
          && !disposed
          && ownedSession?.operationId === operation.sessionOperationId
          && documentTarget?.fullscreenElement === operation.element) {
          publish({ ...state, error: EXIT_FAILURE });
        }
        return false;
      })
      .finally(() => {
        if (exitOperation === operation) exitOperation = null;
      });
    exitOperation = operation;
    return operation.promise;
  };

  const resetScopeState = (available) => publish({
    status: available ? "gated" : "unavailable",
    gameplayPermitted: false,
    interruptionCount: 0,
    interruptionReason: null,
    error: null,
  });

  const setScope = ({ accountId, classroomId, levelIdentity, element } = {}) => {
    if (disposed) return state;
    if (scope
      && scope.accountId === accountId
      && scope.classroomId === classroomId
      && scope.levelIdentity === levelIdentity
      && scope.element === element) return state;

    const previousOwnedSession = ownedSession;
    generation += 1;
    if (enterOperation) settleEnter(enterOperation, false);
    scope = { accountId, classroomId, levelIdentity, element };
    lastVisibility = documentTarget?.visibilityState ?? "visible";
    hasEnteredGameplay = false;
    completionBoundaryActive = false;
    recentFullscreenExitAt = null;
    resetScopeState(hasScope());

    if (previousOwnedSession
      && documentTarget?.fullscreenElement === previousOwnedSession.element) {
      ownedSession = previousOwnedSession;
      requestOwnedExit({ cleanup: true });
    } else {
      ownedSession = null;
    }

    if (hasScope() && !supportsFullscreen()) {
      publish(scopedState({ status: "unsupported", error: UNSUPPORTED }));
    }
    return state;
  };

  const continueGameplay = () => {
    if (disposed || completionBoundaryActive || !hasScope()) return null;
    if (enterOperation && isCurrentEnter(enterOperation)) return enterOperation.promise;
    if (documentTarget?.visibilityState !== "visible") {
      publish(scopedState({ status: "interrupted", error: NOT_VISIBLE }));
      return Promise.resolve(false);
    }
    if (documentTarget?.fullscreenElement === scope.element) {
      return Promise.resolve(permitGameplay());
    }
    if (!supportsFullscreen()) {
      publish(scopedState({ status: "unsupported", error: UNSUPPORTED }));
      return null;
    }
    if (documentTarget?.fullscreenElement) {
      publish(scopedState({ status: "error", error: ENTER_FAILURE }));
      return Promise.resolve(false);
    }

    const operation = {
      id: ++operationSequence,
      generation,
      accountId: scope.accountId,
      classroomId: scope.classroomId,
      levelIdentity: scope.levelIdentity,
      element: scope.element,
      requestResolved: false,
      observedExactBoundary: false,
      settled: false,
      resolve: null,
      promise: null,
    };
    operation.promise = new Promise((resolve) => { operation.resolve = resolve; });
    enterOperation = operation;
    publish(scopedState({ status: "requesting" }));

    let request;
    try {
      request = operation.element.requestFullscreen();
    } catch (error) {
      request = Promise.reject(error);
    }

    Promise.resolve(request).then(() => {
      if (!isCurrentEnter(operation)) {
        settleEnter(operation, false);
        return;
      }
      operation.requestResolved = true;
      completeEntryWhenReady(operation);
    }, () => {
      if (isCurrentEnter(operation)) {
        publish(scopedState({ status: "error", error: ENTER_FAILURE }));
      }
      settleEnter(operation, false);
    });
    return operation.promise;
  };

  const exitFullscreen = () => {
    if (disposed || !ownedSession) return null;
    return requestOwnedExit();
  };

  const invalidate = () => setScope({
    accountId: null,
    classroomId: null,
    levelIdentity: null,
    element: null,
  });

  return {
    setScope,
    continueGameplay,
    exitFullscreen,
    beginCompletionBoundary() {
      if (disposed || !hasScope()) return false;
      completionBoundaryActive = true;
      recentFullscreenExitAt = null;
      publish(scopedState({ status: "gated", gameplayPermitted: false }));
      return true;
    },
    resetCompletionBoundary() {
      if (disposed || !hasScope() || !completionBoundaryActive) return false;
      completionBoundaryActive = false;
      recentFullscreenExitAt = null;
      publish(scopedState({ status: "gated", gameplayPermitted: false }));
      return true;
    },
    invalidate,
    getState: () => state,
    dispose() {
      if (disposed) return;
      generation += 1;
      if (enterOperation) settleEnter(enterOperation, false);
      state = {
        status: "unavailable",
        gameplayPermitted: false,
        interruptionCount: 0,
        interruptionReason: null,
        error: null,
      };
      disposed = true;
      requestOwnedExit({ cleanup: true });
      documentTarget?.removeEventListener?.("fullscreenchange", handleFullscreenChange);
      documentTarget?.removeEventListener?.("visibilitychange", handleVisibilityChange);
      scope = null;
    },
  };
};
