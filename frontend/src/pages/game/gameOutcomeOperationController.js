const normalizeScope = ({ accountId, classroomId, levelIdentity } = {}) => ({
  accountId: accountId == null ? null : String(accountId),
  classroomId: classroomId == null ? null : String(classroomId),
  levelIdentity: levelIdentity == null ? null : String(levelIdentity),
});

const scopesMatch = (left, right) => (
  left?.accountId === right?.accountId
  && left?.classroomId === right?.classroomId
  && left?.levelIdentity === right?.levelIdentity
);

export const createGameOutcomeOperationController = () => {
  let disposed = false;
  let generation = 0;
  let scope = null;

  const invalidate = () => {
    generation += 1;
  };

  const setScope = (nextScope) => {
    if (disposed) return false;
    const normalized = normalizeScope(nextScope);
    if (scopesMatch(scope, normalized)) return false;
    scope = normalized;
    invalidate();
    return true;
  };

  const begin = () => {
    if (disposed || !scope) return null;
    const operationGeneration = generation;
    const operationScope = scope;
    const isCurrent = () => (
      !disposed
      && generation === operationGeneration
      && scopesMatch(scope, operationScope)
    );

    return Object.freeze({
      apply(callback) {
        if (!isCurrent()) return false;
        callback();
        return true;
      },
      isCurrent,
      async wait(promise) {
        const value = await promise;
        return { current: isCurrent(), value };
      },
    });
  };

  return {
    begin,
    invalidate,
    setScope,
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate();
      scope = null;
    },
  };
};

export const ensureGameOutcomeOperationController = (controllerRef, scope) => {
  if (!controllerRef.current) {
    controllerRef.current = createGameOutcomeOperationController();
  }
  controllerRef.current.setScope(scope);
  return controllerRef.current;
};

export const disposeGameOutcomeOperationController = (controllerRef, controller) => {
  if (controllerRef.current !== controller) return false;
  controller.dispose();
  controllerRef.current = null;
  return true;
};

export const getOrStartGameCompletionRequest = (requestRef, startRequest) => {
  if (!requestRef.current) requestRef.current = startRequest();
  return requestRef.current;
};

export const clearGameCompletionRequest = (requestRef, request) => {
  if (requestRef.current !== request) return false;
  requestRef.current = null;
  return true;
};

export const invalidateGameOutcomeForReset = (controller, requestRef) => {
  controller?.invalidate();
  const detachedRequest = requestRef?.current ?? null;
  if (requestRef) requestRef.current = null;
  return detachedRequest;
};
