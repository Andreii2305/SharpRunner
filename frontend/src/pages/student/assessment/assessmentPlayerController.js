import { createAssessmentSaveCoordinator } from "./assessmentSaveCoordinator.js";

export const createAssessmentPlayerController = ({
  attemptId,
  initialSavedByQuestion,
  routeKey,
  requestGeneration,
  saveResponse,
  dispatch,
  getState,
  onSaved,
}) => {
  const actionContext = { routeKey, requestGeneration };
  const send = (type, event) => dispatch({ type, ...event, ...actionContext });
  let terminalConflict = false;
  const mutationsBlocked = () => {
    if (terminalConflict) return true;
    const state = typeof getState === "function" ? getState() : null;
    if (state?.externalSyncRequired || state?.externalSyncStatus === "checking") return true;
    const submitStatus = state?.submitStatus;
    return ["submitting", "recovering-result", "recovery-error", "succeeded"].includes(submitStatus);
  };

  const coordinator = createAssessmentSaveCoordinator({
    attemptId,
    initialSavedByQuestion,
    saveResponse,
    onSaveStarted: (event) => send("SAVE_STARTED", event),
    onSaveSucceeded: (event) => {
      send("SAVE_SUCCEEDED", event);
      onSaved?.({ attemptId });
    },
    onSaveFailed: (event) => send("SAVE_FAILED", event),
    onConflict: (event) => {
      terminalConflict = true;
      send("SAVE_CONFLICTED", event);
    },
  });

  const selectChoice = (questionId, selectedChoiceId) => {
    if (mutationsBlocked()) return false;
    const snapshot = coordinator.getSnapshot(questionId);
    if (snapshot?.status === "conflict") return false;

    const currentState = typeof getState === "function" ? getState() : null;
    const question = currentState?.orderedQuestions?.find(({ id }) => id === questionId);
    if (
      currentState
      && !question?.choices?.some(({ id }) => id === selectedChoiceId)
    ) return false;

    send("CHOICE_SELECTED", {
      questionId,
      selectedChoiceId,
      preserveSaveError: snapshot?.status === "error",
      saveError: snapshot?.error ?? null,
      saveInFlight: snapshot?.status === "saving",
    });
    return coordinator.select(questionId, selectedChoiceId);
  };

  return {
    selectChoice,
    retrySave: (questionId) => (
      mutationsBlocked() ? false : coordinator.retry(questionId)
    ),
    flushAll: coordinator.flushAll,
    getSaveSnapshot: coordinator.getSnapshot,
    dispose: coordinator.dispose,
  };
};
