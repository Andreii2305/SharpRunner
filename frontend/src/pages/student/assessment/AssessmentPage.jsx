import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  discoverAssessment,
  getAttempt,
  getAttemptResult,
  getProgress,
  saveResponse,
  startOrResumeAttempt,
  submitAttempt,
} from "../../../services/studentAssessmentService.js";
import {
  assessmentReducer,
  createAssessmentState,
  getAnswerSummary,
  getAttemptControllerIdentity,
  getSubmissionReadiness,
} from "./assessmentState.js";
import AssessmentPlayer from "./AssessmentPlayer.jsx";
import AssessmentResult from "./AssessmentResult.jsx";
import AssessmentSubmitReview from "./AssessmentSubmitReview.jsx";
import { createAssessmentPlayerController } from "./assessmentPlayerController.js";
import {
  createAssessmentSubmissionController,
  createAttemptSubmissionKeyStore,
} from "./assessmentSubmissionController.js";
import {
  assessmentActionsForOutcome,
  createAssessmentRouteOrchestrator,
  parseAssessmentPageRoute,
} from "./assessmentRouteOrchestrator.js";
import { createAssessmentSessionGuard } from "./assessmentSessionGuard.js";

const shellCopy = {
  LOADING: {
    title: "Loading assessment",
    message: "Checking your lesson progress and assessment status…",
    role: "status",
  },
  INVALID_ROUTE: {
    title: "Invalid assessment link",
    message: "This assessment link is not valid.",
    role: "alert",
  },
  AUTH_REQUIRED: {
    title: "Sign in required",
    message: "Sign in to open this assessment.",
    role: "alert",
  },
  FORBIDDEN: {
    title: "Assessment unavailable",
    message: "You do not have access to this classroom assessment.",
    role: "alert",
  },
  UNAVAILABLE: {
    title: "Assessment unavailable",
    message: "This assessment is not currently available.",
    role: "alert",
  },
  LOCKED: {
    title: "Assessment locked",
    message: "Complete the required lesson step before opening this assessment.",
    role: "status",
  },
  COMPLETED: {
    title: "Assessment already completed",
    message: "Your submitted attempt is recorded. Results will be available in the results checkpoint.",
    role: "status",
  },
  SUBMITTED: {
    title: "Assessment submitted",
    message: "Your attempt is recorded. Results and any available next steps will appear in the results checkpoint.",
    role: "status",
  },
  RETAKE_AVAILABLE: {
    title: "Retake available",
    message: "Your submitted attempt is recorded. A new attempt will only begin after you choose to retake it.",
    role: "status",
  },
  EXHAUSTED: {
    title: "Assessment attempts exhausted",
    message: "No additional attempts are currently available.",
    role: "status",
  },
  ACTIVE: {
    title: "Active attempt loaded",
    message: "Your in-progress assessment was restored. The assessment player will appear in the next checkpoint.",
    role: "status",
  },
  ERROR: {
    title: "Unable to load assessment",
    message: "The assessment could not be loaded. Please try again.",
    role: "alert",
  },
  RESULT_ERROR: {
    title: "Unable to load assessment result",
    message: "Your submitted attempt is unchanged. Try loading this result again.",
    role: "alert",
  },
};

const returnHref = (outcome) => outcome?.route?.classroomId
  ? `/Map?classroomId=${encodeURIComponent(outcome.route.classroomId)}`
  : "/Map";

export function AssessmentStatusView({ outcome, onRetry }) {
  const visibleOutcome = outcome?.kind === "STALE" ? { kind: "LOADING" } : outcome;
  const copy = shellCopy[visibleOutcome?.kind] ?? shellCopy.ERROR;
  const latestSubmittedAttemptId = visibleOutcome?.latestSubmittedAttemptId ?? undefined;

  return (
    <main
      role={copy.role}
      aria-live="polite"
      data-latest-submitted-attempt-id={latestSubmittedAttemptId}
      style={{ maxWidth: "48rem", margin: "4rem auto", padding: "2rem" }}
    >
      <h1>{copy.title}</h1>
      <p>{copy.message}</p>
      {["ERROR", "RESULT_ERROR"].includes(visibleOutcome?.kind) && (
        <button type="button" onClick={onRetry}>Try again</button>
      )}
      {visibleOutcome?.kind === "AUTH_REQUIRED" ? (
        <p><a href="/login">Sign in</a></p>
      ) : visibleOutcome?.kind !== "LOADING" && (
        <p><a href={returnHref(visibleOutcome)}>Return to lesson map</a></p>
      )}
    </main>
  );
}

export function AssessmentPageContent({
  outcome,
  assessmentState,
  reviewReady,
  onRetry,
  onSelect,
  onPrevious,
  onNext,
  onGoToQuestion,
  onRetrySave,
  onRecoverConflict,
  onRetrySync,
  onReadyToReview,
  onReturnToQuestions,
  onOpenConfirmation,
  onCancelConfirmation,
  onConfirmSubmit,
  onRetryResultRecovery,
  onRetake,
  onRetryProgression,
}) {
  if (assessmentState?.screen === "result" && assessmentState.result) {
    return (
      <AssessmentResult
        envelope={assessmentState.result}
        progression={assessmentState.progression}
        progressionError={assessmentState.progressionError}
        route={outcome?.route}
        questions={assessmentState.orderedQuestions}
        retakeStatus={assessmentState.retakeStatus}
        externalSyncStatus={assessmentState.externalSyncStatus}
        retakeError={assessmentState.retakeError}
        onRetake={onRetake}
        onRetryProgression={onRetryProgression}
      />
    );
  }

  if (outcome?.kind === "ACTIVE" && assessmentState?.screen === "active") {
    if (["recovering-result", "recovery-error"].includes(assessmentState.submitStatus)) {
      const failed = assessmentState.submitStatus === "recovery-error";
      return (
        <main className="assessment-page" role={failed ? "alert" : "status"} aria-live="polite">
          <h1>{failed ? "Unable to load submitted result" : "Loading submitted result"}</h1>
          <p>Your assessment is already submitted and can no longer be edited.</p>
          {failed && (
            <button type="button" onClick={onRetryResultRecovery}>Try loading result again</button>
          )}
        </main>
      );
    }
    if (
      reviewReady
      && assessmentState.externalSyncRequired !== true
      && assessmentState.externalSyncStatus !== "checking"
    ) {
      const summary = getAnswerSummary(assessmentState);
      const readiness = getSubmissionReadiness(assessmentState);
      return (
        <AssessmentSubmitReview
          summary={summary}
          readiness={readiness}
          confirmationOpen={assessmentState.submitReviewOpen}
          submitting={assessmentState.submitStatus === "submitting"}
          submissionError={assessmentState.submitStatus === "error" ? assessmentState.error : null}
          onReturnToQuestions={onReturnToQuestions}
          onFirstUnanswered={() => {
            const firstQuestionId = summary.unansweredQuestionIds[0];
            const index = assessmentState.orderedQuestions.findIndex(({ id }) => id === firstQuestionId);
            if (index >= 0) onGoToQuestion(index);
          }}
          onOpenConfirmation={onOpenConfirmation}
          onCancelConfirmation={onCancelConfirmation}
          onConfirm={onConfirmSubmit}
        />
      );
    }

    return (
      <AssessmentPlayer
        state={assessmentState}
        onSelect={onSelect}
        onPrevious={onPrevious}
        onNext={onNext}
        onGoToQuestion={onGoToQuestion}
        onRetrySave={onRetrySave}
        onRecoverConflict={onRecoverConflict}
        onRetrySync={onRetrySync}
        onReadyToReview={onReadyToReview}
      />
    );
  }

  return <AssessmentStatusView outcome={outcome} onRetry={onRetry} />;
}

function AssessmentPage() {
  const params = useParams();
  const [assessmentState, dispatch] = useReducer(
    assessmentReducer,
    undefined,
    createAssessmentState,
  );
  const [outcome, setOutcome] = useState({ kind: "LOADING" });
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [reviewReady, setReviewReady] = useState(false);
  const requestGeneration = useRef(0);
  const playerController = useRef(null);
  const submissionController = useRef(null);
  const sessionGuard = useRef(null);
  const retakeInFlight = useRef(null);
  const latestState = useRef(assessmentState);
  latestState.current = assessmentState;
  const attemptControllerIdentity = getAttemptControllerIdentity(assessmentState);
  const submissionKeys = useMemo(() => createAttemptSubmissionKeyStore(), []);
  const orchestrator = useMemo(() => createAssessmentRouteOrchestrator({
    getProgress,
    discoverAssessment,
    getAttempt,
    getAttemptResult,
    startOrResumeAttempt,
  }), []);

  const { classroomId, lessonKey, type } = params;
  const parsedRoute = useMemo(
    () => parseAssessmentPageRoute({ classroomId, lessonKey, type }),
    [classroomId, lessonKey, type],
  );
  const routeKey = parsedRoute?.routeKey
    ?? `invalid:${classroomId ?? ""}:${lessonKey ?? ""}:${type ?? ""}`;
  const syncAttemptId = assessmentState.attempt?.attemptId
    ?? assessmentState.result?.result?.attemptId
    ?? null;
  const syncIdentity = syncAttemptId && assessmentState.routeKey
    ? `${assessmentState.routeKey}:${assessmentState.requestGeneration}:${syncAttemptId}`
    : null;

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++requestGeneration.current;
    const isCurrent = () => (
      !controller.signal.aborted
      && requestGeneration.current === generation
    );

    dispatch({
      type: "ROUTE_CHANGED",
      routeKey,
      requestGeneration: generation,
    });
    setReviewReady(false);
    retakeInFlight.current = null;
    setOutcome({ kind: "LOADING", route: parsedRoute });

    const loadAssessment = async () => {
      const nextOutcome = await orchestrator.load({
        params: { classroomId, lessonKey, type },
        generation,
        signal: controller.signal,
        isCurrent,
      });
      if (!isCurrent() || nextOutcome.kind === "STALE") return;

      for (const action of assessmentActionsForOutcome(nextOutcome, {
        routeKey,
        requestGeneration: generation,
      })) {
        dispatch(action);
      }
      setOutcome(nextOutcome);
    };

    loadAssessment();
    return () => controller.abort();
  }, [classroomId, lessonKey, orchestrator, parsedRoute, retryGeneration, routeKey, type]);

  const revalidateAssessment = useCallback(async ({ isActive = () => true } = {}) => {
    const current = latestState.current;
    if (!parsedRoute || !current.routeKey || !syncAttemptId) return { kind: "UNAVAILABLE" };
    const generation = current.requestGeneration;
    const currentRouteKey = current.routeKey;
    const isCurrent = () => (
      isActive()
      && requestGeneration.current === generation
      && latestState.current.routeKey === currentRouteKey
    );

    setReviewReady(false);
    dispatch({
      type: "SERVER_SYNC_STARTED",
      routeKey: currentRouteKey,
      requestGeneration: generation,
    });
    const nextOutcome = await orchestrator.revalidate({
      params: { classroomId, lessonKey, type },
      generation,
      isCurrent,
    });
    if (!isCurrent() || nextOutcome.kind === "STALE") return { kind: "STALE" };

    if (["ACTIVE", "RESULT"].includes(nextOutcome.kind)) {
      for (const action of assessmentActionsForOutcome(nextOutcome, {
        routeKey: currentRouteKey,
        requestGeneration: generation,
      })) dispatch(action);
      setOutcome(nextOutcome);
      return nextOutcome;
    }

    if (["ERROR", "RESULT_ERROR"].includes(nextOutcome.kind)) {
      dispatch({
        type: "SERVER_SYNC_FAILED",
        error: nextOutcome.error ?? new Error("Unable to verify assessment state"),
        routeKey: currentRouteKey,
        requestGeneration: generation,
      });
      return nextOutcome;
    }

    dispatch({
      type: "ROUTE_CHANGED",
      routeKey: currentRouteKey,
      requestGeneration: generation,
    });
    setOutcome(nextOutcome);
    return nextOutcome;
  }, [classroomId, lessonKey, orchestrator, parsedRoute, syncAttemptId, type]);

  useEffect(() => {
    if (!syncIdentity || !syncAttemptId) {
      sessionGuard.current = null;
      return undefined;
    }

    const guard = createAssessmentSessionGuard({
      attemptId: syncAttemptId,
      getState: () => latestState.current,
      revalidate: revalidateAssessment,
      onSyncRequired: ({ reason }) => {
        const current = latestState.current;
        setReviewReady(false);
        dispatch({
          type: "SERVER_STATE_INVALIDATED",
          reason,
          routeKey: current.routeKey,
          requestGeneration: current.requestGeneration,
        });
      },
    });
    sessionGuard.current = guard;
    return () => {
      guard.dispose();
      if (sessionGuard.current === guard) sessionGuard.current = null;
    };
  }, [revalidateAssessment, syncAttemptId, syncIdentity]);

  useEffect(() => {
    if (!attemptControllerIdentity || !assessmentState.attempt?.attemptId) {
      playerController.current = null;
      submissionController.current = null;
      return undefined;
    }

    const controller = createAssessmentPlayerController({
      attemptId: assessmentState.attempt.attemptId,
      initialSavedByQuestion: latestState.current.savedByQuestion,
      routeKey: assessmentState.routeKey,
      requestGeneration: assessmentState.requestGeneration,
      saveResponse,
      dispatch,
      getState: () => latestState.current,
      onSaved: () => sessionGuard.current?.announceSaved(),
    });
    playerController.current = controller;
    const submitController = createAssessmentSubmissionController({
      attemptId: assessmentState.attempt.attemptId,
      classroomId: parsedRoute.classroomId,
      routeKey: assessmentState.routeKey,
      requestGeneration: assessmentState.requestGeneration,
      getState: () => latestState.current,
      flushAll: controller.flushAll,
      submitAttempt,
      getAttemptResult,
      getProgress,
      getSubmissionReadiness,
      getIdempotencyKey: (attemptId) => submissionKeys.get(attemptId),
      dispatch,
      onSubmitted: () => sessionGuard.current?.announceSubmitted(),
      isCurrent: () => (
        requestGeneration.current === assessmentState.requestGeneration
        && latestState.current.attempt?.attemptId === assessmentState.attempt.attemptId
      ),
    });
    submissionController.current = submitController;

    return () => {
      submitController.dispose();
      controller.dispose();
      if (playerController.current === controller) playerController.current = null;
      if (submissionController.current === submitController) submissionController.current = null;
    };
  }, [
    attemptControllerIdentity,
    assessmentState.attempt?.attemptId,
    assessmentState.requestGeneration,
    assessmentState.routeKey,
    parsedRoute,
    submissionKeys,
  ]);

  const retry = useCallback(async () => {
    if (
      outcome?.kind === "RESULT_ERROR"
      && parsedRoute
      && Number.isSafeInteger(Number(outcome.latestSubmittedAttemptId))
      && Number(outcome.latestSubmittedAttemptId) > 0
    ) {
      const generation = requestGeneration.current;
      const previousOutcome = outcome;
      setOutcome({ kind: "LOADING", route: parsedRoute });
      const nextOutcome = await orchestrator.loadResult({
        params: { classroomId, lessonKey, type },
        attemptId: previousOutcome.latestSubmittedAttemptId,
        generation,
        isCurrent: () => requestGeneration.current === generation,
      });
      if (requestGeneration.current !== generation || nextOutcome.kind === "STALE") return;
      const mergedOutcome = { ...previousOutcome, ...nextOutcome };
      for (const action of assessmentActionsForOutcome(mergedOutcome, {
        routeKey,
        requestGeneration: generation,
      })) dispatch(action);
      setOutcome(mergedOutcome);
      return;
    }
    setReviewReady(false);
    setRetryGeneration((value) => value + 1);
  }, [classroomId, lessonKey, orchestrator, outcome, parsedRoute, routeKey, type]);
  const dispatchForCurrentAttempt = useCallback((action) => {
    const current = latestState.current;
    dispatch({
      ...action,
      routeKey: current.routeKey,
      requestGeneration: current.requestGeneration,
    });
  }, []);
  const selectChoice = useCallback((questionId, selectedChoiceId) => (
    playerController.current?.selectChoice(questionId, selectedChoiceId) ?? false
  ), []);
  const previousQuestion = useCallback(() => {
    dispatchForCurrentAttempt({ type: "PREVIOUS_QUESTION" });
  }, [dispatchForCurrentAttempt]);
  const nextQuestion = useCallback(() => {
    dispatchForCurrentAttempt({ type: "NEXT_QUESTION" });
  }, [dispatchForCurrentAttempt]);
  const goToQuestion = useCallback((index) => {
    setReviewReady(false);
    dispatchForCurrentAttempt({ type: "QUESTION_CHANGED", index });
  }, [dispatchForCurrentAttempt]);
  const retrySave = useCallback((questionId) => (
    playerController.current?.retrySave(questionId) ?? false
  ), []);
  const openConfirmation = useCallback(() => {
    const current = latestState.current;
    if (!getSubmissionReadiness(current).ready) return;
    dispatchForCurrentAttempt({ type: "SUBMIT_REVIEW_OPENED" });
  }, [dispatchForCurrentAttempt]);
  const cancelConfirmation = useCallback(() => {
    dispatchForCurrentAttempt({ type: "SUBMIT_REVIEW_CLOSED" });
  }, [dispatchForCurrentAttempt]);
  const confirmSubmit = useCallback(() => (
    submissionController.current?.submit()
  ), []);
  const retryResultRecovery = useCallback(() => (
    submissionController.current?.retryResultRecovery()
  ), []);
  const retryProgression = useCallback(async () => {
    const current = latestState.current;
    if (!parsedRoute || current.screen !== "result") return;
    try {
      const progression = await getProgress({ classroomId: parsedRoute.classroomId });
      if (
        requestGeneration.current === current.requestGeneration
        && latestState.current.routeKey === current.routeKey
      ) {
        dispatch({
          type: "PROGRESSION_REFRESHED",
          payload: progression,
          routeKey: current.routeKey,
          requestGeneration: current.requestGeneration,
        });
      }
    } catch (error) {
      if (
        requestGeneration.current === current.requestGeneration
        && latestState.current.routeKey === current.routeKey
      ) {
        dispatch({
          type: "PROGRESSION_REFRESH_FAILED",
          error,
          routeKey: current.routeKey,
          requestGeneration: current.requestGeneration,
        });
      }
    }
  }, [parsedRoute]);
  const startRetake = useCallback(() => {
    if (!parsedRoute || parsedRoute.type !== "POST") return Promise.resolve(null);
    if (retakeInFlight.current) return retakeInFlight.current;
    const current = latestState.current;
    dispatchForCurrentAttempt({ type: "RETAKE_STARTED" });
    const operation = orchestrator.retake({
      params: { classroomId, lessonKey, type },
      generation: current.requestGeneration,
      isCurrent: () => (
        requestGeneration.current === current.requestGeneration
        && latestState.current.routeKey === current.routeKey
      ),
    }).then((nextOutcome) => {
      if (nextOutcome.kind === "STALE") return nextOutcome;
      if (nextOutcome.kind === "ACTIVE") {
        for (const nextAction of assessmentActionsForOutcome(nextOutcome, {
          routeKey: current.routeKey,
          requestGeneration: current.requestGeneration,
        })) dispatch(nextAction);
        setReviewReady(false);
        setOutcome(nextOutcome);
        return nextOutcome;
      }
      if (nextOutcome.progression) {
        dispatch({
          type: "PROGRESSION_REFRESHED",
          payload: nextOutcome.progression,
          routeKey: current.routeKey,
          requestGeneration: current.requestGeneration,
        });
      }
      dispatch({
        type: "RETAKE_FAILED",
        error: nextOutcome.error ?? new Error("Retake unavailable"),
        routeKey: current.routeKey,
        requestGeneration: current.requestGeneration,
      });
      return nextOutcome;
    }).finally(() => {
      if (retakeInFlight.current === operation) retakeInFlight.current = null;
    });
    retakeInFlight.current = operation;
    return operation;
  }, [classroomId, dispatchForCurrentAttempt, lessonKey, orchestrator, parsedRoute, type]);

  return (
    <AssessmentPageContent
      outcome={outcome}
      assessmentState={assessmentState}
      reviewReady={reviewReady}
      onRetry={retry}
      onSelect={selectChoice}
      onPrevious={previousQuestion}
      onNext={nextQuestion}
      onGoToQuestion={goToQuestion}
      onRetrySave={retrySave}
      onRecoverConflict={retry}
      onRetrySync={() => sessionGuard.current?.revalidate("manual")}
      onReadyToReview={() => setReviewReady(true)}
      onReturnToQuestions={() => {
        cancelConfirmation();
        setReviewReady(false);
      }}
      onOpenConfirmation={openConfirmation}
      onCancelConfirmation={cancelConfirmation}
      onConfirmSubmit={confirmSubmit}
      onRetryResultRecovery={retryResultRecovery}
      onRetake={startRetake}
      onRetryProgression={retryProgression}
    />
  );
}

export default AssessmentPage;
