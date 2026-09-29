const CHANNEL_PREFIX = "sharprunner:assessment-attempt:";
const CHANGE_EVENT = "ASSESSMENT_ATTEMPT_CHANGED";
const SUBMIT_EVENT = "ASSESSMENT_ATTEMPT_SUBMITTED";

const hasUnresolvedWork = (state) => {
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
  hasUnresolvedWork(state) || hasLocalTransition(state)
);

export const createAssessmentSessionGuard = ({
  attemptId,
  getState,
  revalidate,
  onSyncRequired,
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
  BroadcastChannelImpl = globalThis.BroadcastChannel,
}) => {
  let disposed = false;
  let inFlight = null;
  let queuedRevalidation = null;
  let channel = null;

  const requireSync = (reason) => {
    if (!disposed && typeof onSyncRequired === "function") {
      onSyncRequired({ reason, attemptId });
    }
  };

  const runRevalidation = (reason, { force = false } = {}) => {
    if (disposed) return Promise.resolve({ kind: "DISPOSED" });
    if (!force && hasLocalTransition(getState?.())) {
      return Promise.resolve({ kind: "LOCAL_TRANSITION" });
    }
    if (!force && hasUnresolvedWork(getState?.())) {
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
    inFlight = Promise.resolve(operation).finally(() => {
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
      if (hasUnresolvedWork(getState?.())) requireSync("remote-submission");
      runRevalidation("remote-submission", { force: true });
    }
  };

  const handleFocus = () => { runRevalidation("focus"); };
  const handleVisibility = () => {
    if (documentTarget?.visibilityState === "visible") runRevalidation("visibility");
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
    },
  };
};
