const STANDARD_VIEW_MESSAGE = "Fullscreen exited. You can continue in standard view.";
const ENTER_FAILURE_MESSAGE = "Fullscreen could not be started. You can continue in standard view or try again.";
const EXIT_FAILURE_MESSAGE = "Could not exit fullscreen. Use the browser controls or try again.";
const UNSUPPORTED_MESSAGE = "Fullscreen is not available in this browser. You can continue in standard view.";

export const initialAssessmentFullscreenState = Object.freeze({
  status: "checking",
  message: "Checking fullscreen availability.",
});

export const isAssessmentFullscreenEligible = ({ outcome, assessmentState } = {}) => (
  outcome?.kind === "ACTIVE"
  && assessmentState?.screen === "active"
  && assessmentState?.attempt?.status === "IN_PROGRESS"
  && ["PRE", "POST"].includes(`${assessmentState?.assessment?.type ?? ""}`.toUpperCase())
);

export const createAssessmentFullscreenController = ({
  documentTarget = globalThis.document,
  onStateChange = () => {},
} = {}) => {
  let disposed = false;
  let scopeVersion = 0;
  let operationSequence = 0;
  let scope = { identity: null, element: null, eligible: false, version: scopeVersion };
  let state = initialAssessmentFullscreenState;
  let enterOperation = null;
  let exitOperation = null;
  let ownedSession = null;
  const latestEnterByElement = new WeakMap();

  const updateState = (nextState) => {
    state = nextState;
    if (!disposed) onStateChange(nextState);
    return nextState;
  };

  const supportsFullscreen = (element = scope.element) => (
    documentTarget?.fullscreenEnabled !== false
    && typeof element?.requestFullscreen === "function"
    && typeof documentTarget?.exitFullscreen === "function"
  );

  const availableState = (message = null) => ({ status: "available", message });

  const isCurrentOperation = (operation) => (
    !disposed
    && operation.scopeVersion === scope.version
    && operation.identity === scope.identity
    && operation.element === scope.element
    && scope.eligible
  );

  const claimSession = (operation) => {
    if (!isCurrentOperation(operation) || documentTarget?.fullscreenElement !== operation.element) {
      return false;
    }
    ownedSession = {
      operationId: operation.id,
      element: operation.element,
      scopeVersion: operation.scopeVersion,
    };
    updateState({ status: "fullscreen", message: null });
    return true;
  };

  const beginExit = (session, { interactive }) => {
    if (!session || documentTarget?.fullscreenElement !== session.element) return null;
    if (exitOperation) return exitOperation.promise;

    const operation = {
      id: ++operationSequence,
      sessionOperationId: session.operationId,
      element: session.element,
      interactive,
      promise: null,
    };
    if (interactive && !disposed) updateState({ status: "exiting", message: null });

    let requestedExit;
    try {
      requestedExit = documentTarget.exitFullscreen();
    } catch (error) {
      requestedExit = Promise.reject(error);
    }

    operation.promise = Promise.resolve(requestedExit)
      .then(() => {
        if (documentTarget?.fullscreenElement === operation.element) {
          if (interactive && !disposed && ownedSession?.operationId === operation.sessionOperationId) {
            updateState({ status: "fullscreen", message: EXIT_FAILURE_MESSAGE });
          }
          return false;
        }
        const latest = latestEnterByElement.get(operation.element);
        if (latest?.id === operation.sessionOperationId) latestEnterByElement.delete(operation.element);
        if (ownedSession?.operationId === operation.sessionOperationId) ownedSession = null;
        if (!disposed) {
          updateState(scope.eligible
            ? availableState(STANDARD_VIEW_MESSAGE)
            : { status: "unavailable", message: null });
        }
        return true;
      }, () => {
        if (!disposed && ownedSession?.operationId === operation.sessionOperationId) {
          if (documentTarget?.fullscreenElement === operation.element) {
            updateState({ status: "fullscreen", message: EXIT_FAILURE_MESSAGE });
          } else {
            ownedSession = null;
            updateState(scope.eligible
              ? availableState(STANDARD_VIEW_MESSAGE)
              : { status: "unavailable", message: null });
          }
        }
        return false;
      })
      .finally(() => {
        if (exitOperation === operation) exitOperation = null;
      });
    exitOperation = operation;
    return operation.promise;
  };

  const releaseOwnedSession = () => {
    const session = ownedSession;
    if (!session || documentTarget?.fullscreenElement !== session.element) {
      ownedSession = null;
      return null;
    }
    return beginExit(session, { interactive: false });
  };

  const handleFullscreenChange = () => {
    const fullscreenElement = documentTarget?.fullscreenElement ?? null;
    if (fullscreenElement === scope.element && scope.eligible) {
      const latest = latestEnterByElement.get(scope.element);
      if (latest && isCurrentOperation(latest)) claimSession(latest);
      return;
    }

    if (ownedSession && fullscreenElement !== ownedSession.element) {
      const previousSession = ownedSession;
      ownedSession = null;
      const latest = latestEnterByElement.get(previousSession.element);
      if (latest?.id === previousSession.operationId) {
        latestEnterByElement.delete(previousSession.element);
      }
      if (scope.eligible && supportsFullscreen()) updateState(availableState(STANDARD_VIEW_MESSAGE));
    }
  };

  documentTarget?.addEventListener?.("fullscreenchange", handleFullscreenChange);

  const setScope = ({ identity, element, eligible }) => {
    const normalizedEligibility = eligible === true && Boolean(identity) && Boolean(element);
    if (
      scope.identity === identity
      && scope.element === element
      && scope.eligible === normalizedEligibility
    ) return state;

    scopeVersion += 1;
    scope = { identity, element, eligible: normalizedEligibility, version: scopeVersion };
    enterOperation = null;
    const cleanup = releaseOwnedSession();

    if (cleanup) return updateState({ status: "exiting", message: null });

    if (!normalizedEligibility) return updateState({ status: "unavailable", message: null });
    if (!supportsFullscreen(element)) {
      return updateState({ status: "unsupported", message: UNSUPPORTED_MESSAGE });
    }
    return updateState(availableState());
  };

  const enter = () => {
    if (disposed || !scope.eligible || !scope.element) return null;
    if (!supportsFullscreen()) {
      updateState({ status: "unsupported", message: UNSUPPORTED_MESSAGE });
      return null;
    }
    if (enterOperation && isCurrentOperation(enterOperation)) return enterOperation.promise;
    if (exitOperation) return exitOperation.promise;
    if (documentTarget?.fullscreenElement) {
      if (ownedSession && documentTarget.fullscreenElement === ownedSession.element) {
        updateState({ status: "fullscreen", message: null });
      } else {
        updateState({ status: "error", message: ENTER_FAILURE_MESSAGE });
      }
      return null;
    }

    const operation = {
      id: ++operationSequence,
      identity: scope.identity,
      element: scope.element,
      scopeVersion: scope.version,
      promise: null,
    };
    latestEnterByElement.set(operation.element, operation);
    updateState({ status: "requesting", message: null });

    let request;
    try {
      request = operation.element.requestFullscreen();
    } catch (error) {
      request = Promise.reject(error);
    }

    operation.promise = Promise.resolve(request)
      .then(() => {
        if (isCurrentOperation(operation)) {
          if (!claimSession(operation)) {
            if (latestEnterByElement.get(operation.element)?.id === operation.id) {
              latestEnterByElement.delete(operation.element);
            }
            updateState({ status: "error", message: ENTER_FAILURE_MESSAGE });
          }
          return state.status === "fullscreen";
        }

        const latest = latestEnterByElement.get(operation.element);
        if (latest?.id === operation.id) latestEnterByElement.delete(operation.element);
        // A stale promise cannot prove it caused fullscreen. Only a session
        // claimed while its scope was current is safe for controller cleanup.
        return false;
      }, () => {
        if (latestEnterByElement.get(operation.element)?.id === operation.id) {
          latestEnterByElement.delete(operation.element);
        }
        if (isCurrentOperation(operation)) {
          updateState({ status: "error", message: ENTER_FAILURE_MESSAGE });
        }
        return false;
      })
      .finally(() => {
        if (enterOperation === operation) enterOperation = null;
      });
    enterOperation = operation;
    return operation.promise;
  };

  const exit = () => {
    if (
      disposed
      || !ownedSession
      || documentTarget?.fullscreenElement !== ownedSession.element
    ) return null;
    return beginExit(ownedSession, { interactive: true });
  };

  const invalidate = () => setScope({ identity: null, element: null, eligible: false });

  return {
    setScope,
    enter,
    exit,
    invalidate,
    getState: () => state,
    dispose() {
      if (disposed) return;
      scopeVersion += 1;
      scope = { identity: null, element: null, eligible: false, version: scopeVersion };
      enterOperation = null;
      releaseOwnedSession();
      disposed = true;
      documentTarget?.removeEventListener?.("fullscreenchange", handleFullscreenChange);
    },
  };
};
