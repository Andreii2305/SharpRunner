const CHANNEL_PREFIX = "sharprunner:assessment-attempt:";
const CHANGE_EVENT = "ASSESSMENT_ATTEMPT_CHANGED";
const SUBMIT_EVENT = "ASSESSMENT_ATTEMPT_SUBMITTED";

export const hasUnresolvedAssessmentWork = (state) => {
  if (state?.screen !== "active") return false;
  return (state.orderedQuestions ?? []).some(({ id }) => {
    const saveState = state.saveStateByQuestion?.[id];
    return state.selectedByQuestion?.[id] !== state.savedByQuestion?.[id]
      || ["dirty", "saving", "error", "conflict"].includes(saveState?.status);
  });
};

const hasLocalTransition = (state) => (
  ["submitting", "recovering-result"].includes(state?.submitStatus)
  || state?.retakeStatus === "starting"
);

export const shouldWarnBeforeAssessmentUnload = (state) => (
  hasUnresolvedAssessmentWork(state) || hasLocalTransition(state)
);

export const createAssessmentSessionGuard = ({
  attemptId,
  getState,
  revalidate,
  onSyncRequired,
  onInterruption,
  onInterruptionSettled,
  shouldSettleInterruption,
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
  BroadcastChannelImpl = globalThis.BroadcastChannel,
}) => {
  let disposed = false;
  let inFlight = null;
  let queuedRevalidation = null;
  let interruptionPending = false;
  let interruptionCheck = null;
  let hiddenSinceVisible = false;
  let restoreFocusTarget = null;
  let channel = null;

  const requireSync = (reason) => {
    if (!disposed && typeof onSyncRequired === "function") {
      onSyncRequired({ reason, attemptId });
    }
  };

  const settleInterruption = (reason, result) => {
    if (!interruptionPending && !interruptionCheck) return false;
    interruptionPending = false;
    interruptionCheck = null;
    restoreFocusTarget = null;
    queuedRevalidation = null;
    onInterruptionSettled?.({ reason, attemptId, result });
    return true;
  };

  const runRevalidation = (reason, { force = false } = {}) => {
    if (disposed) return Promise.resolve({ kind: "DISPOSED" });
    if (!force && hasLocalTransition(getState?.())) {
      return Promise.resolve({ kind: "LOCAL_TRANSITION" });
    }
    if (!force && hasUnresolvedAssessmentWork(getState?.())) {
      requireSync(reason);
      return Promise.resolve({ kind: "SYNC_REQUIRED" });
    }
    if (inFlight) {
      if (!queuedRevalidation || force || !queuedRevalidation.force) {
        queuedRevalidation = { reason, force };
      }
      return inFlight;
    }

    let operation;
    try {
      operation = revalidate?.({
        reason,
        attemptId,
        isActive: () => !disposed,
      });
    } catch (error) {
      operation = Promise.reject(error);
    }
    inFlight = Promise.resolve(operation)
      .then((result) => {
        if (
          !disposed
          && shouldSettleInterruption?.({ reason, attemptId, result }) === true
        ) settleInterruption(reason, result);
        return result;
      })
      .finally(() => {
        inFlight = null;
        const queued = queuedRevalidation;
        queuedRevalidation = null;
        if (queued && !disposed) {
          runRevalidation(queued.reason, { force: queued.force });
        }
      });
    return inFlight;
  };

  const handleMessage = (event) => {
    const message = event?.data;
    if (Number(message?.attemptId) !== Number(attemptId)) return;
    if (message.type === CHANGE_EVENT) {
      runRevalidation("remote-change");
      return;
    }
    if (message.type === SUBMIT_EVENT) {
      if (hasUnresolvedAssessmentWork(getState?.())) requireSync("remote-submission");
      runRevalidation("remote-submission", { force: true });
    }
  };

  const handleFocus = () => {
    if (
      hiddenSinceVisible
      || interruptionPending
      || interruptionCheck
      || documentTarget?.visibilityState === "hidden"
    ) return;
    runRevalidation("focus");
  };
  const handleVisibility = () => {
    if (documentTarget?.visibilityState === "hidden") {
      hiddenSinceVisible = true;
      restoreFocusTarget = documentTarget?.activeElement ?? null;
      return;
    }
    if (documentTarget?.visibilityState !== "visible" || !hiddenSinceVisible) return;
    hiddenSinceVisible = false;
    if (interruptionPending) return;
    if (typeof onInterruption !== "function") {
      runRevalidation("visibility");
      return;
    }
    interruptionPending = true;
    const event = { reason: "visibility-return", attemptId };
    if (restoreFocusTarget) event.restoreFocusTarget = restoreFocusTarget;
    if (onInterruption(event) === false) {
      interruptionPending = false;
      restoreFocusTarget = null;
      runRevalidation("visibility");
    }
  };
  const handleBeforeUnload = (event) => {
    if (!shouldWarnBeforeAssessmentUnload(getState?.())) return;
    event?.preventDefault?.();
    if (event) event.returnValue = "";
  };

  windowTarget?.addEventListener?.("focus", handleFocus);
  windowTarget?.addEventListener?.("beforeunload", handleBeforeUnload);
  documentTarget?.addEventListener?.("visibilitychange", handleVisibility);

  if (typeof BroadcastChannelImpl === "function") {
    try {
      channel = new BroadcastChannelImpl(`${CHANNEL_PREFIX}${attemptId}`);
      channel.addEventListener?.("message", handleMessage);
    } catch {
      channel = null;
    }
  }

  const announce = (type) => {
    if (disposed || !channel) return false;
    try {
      channel.postMessage({ type, attemptId });
      return true;
    } catch {
      return false;
    }
  };

  return {
    announceSaved: () => announce(CHANGE_EVENT),
    announceSubmitted: () => announce(SUBMIT_EVENT),
    revalidate: runRevalidation,
    continueAfterInterruption() {
      if (disposed) return Promise.resolve({ kind: "DISPOSED" });
      if (interruptionCheck) return interruptionCheck;
      if (!interruptionPending) return Promise.resolve({ kind: "NO_INTERRUPTION" });
      interruptionPending = false;
      restoreFocusTarget = null;
      const check = runRevalidation("visibility-return");
      const trackedCheck = check.finally(() => {
        if (interruptionCheck === trackedCheck) interruptionCheck = null;
      });
      interruptionCheck = trackedCheck;
      return trackedCheck;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      windowTarget?.removeEventListener?.("focus", handleFocus);
      windowTarget?.removeEventListener?.("beforeunload", handleBeforeUnload);
      documentTarget?.removeEventListener?.("visibilitychange", handleVisibility);
      channel?.removeEventListener?.("message", handleMessage);
      channel?.close?.();
      channel = null;
      queuedRevalidation = null;
      interruptionPending = false;
      interruptionCheck = null;
      hiddenSinceVisible = false;
      restoreFocusTarget = null;
    },
  };
};
