import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  discoverAssessment,
  getAttempt,
  getAttemptResult,
  getProgress,
  runCodingQuestion,
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
import styles from "./AssessmentPlayer.module.css";
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
import { buildAssessmentPageHref } from "../../../utils/lessonProgressionNavigation.js";

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
      className={`${styles.page} ${styles.statusPage}`}
      role={copy.role}
      aria-live="polite"
      data-view="assessment-status"
      data-latest-submitted-attempt-id={latestSubmittedAttemptId}
    >
      <section className={styles.statusCard}>
        <span className={styles.statusEyebrow}>Student assessment</span>
        <h1>{copy.title}</h1>
        <p>{copy.message}</p>
        {visibleOutcome?.kind !== "LOADING" && (
          <div className={styles.statusActions}>
            {["ERROR", "RESULT_ERROR"].includes(visibleOutcome?.kind) && (
              <button type="button" onClick={onRetry}>Try again</button>
            )}
            {visibleOutcome?.kind === "AUTH_REQUIRED" ? (
              <a href="/login">Sign in</a>
            ) : (
              <a href={returnHref(visibleOutcome)}>Return to lesson map</a>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

export function AssessmentPageContent({
  outcome,
  assessmentState,
  reviewReady,
  onRetry,
  onSelect,
  onSourceChange,
  onRunCode,
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
  onRetryGrading,
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
        <main className={`${styles.page} ${styles.statusPage}`} role={failed ? "alert" : "status"} aria-live="polite">
          <section className={styles.statusCard}>
            <h1>{failed ? "Unable to load submitted result" : "Loading submitted result"}</h1>
            <p>Your assessment is already submitted and can no longer be edited.</p>
            {failed && (
              <div className={styles.statusActions}>
                <button type="button" onClick={onRetryResultRecovery}>Try loading result again</button>
              </div>
            )}
          </section>
        </main>
      );
    }
    if (["grading", "grading-pending", "grading-error"].includes(assessmentState.submitStatus)) {
      const failed = assessmentState.submitStatus === "grading-error";
      const pending = assessmentState.submitStatus === "grading-pending";
      return (
        <main className={`${styles.page} ${styles.statusPage}`} role={failed ? "alert" : "status"} aria-live="polite">
          <section className={styles.statusCard}>
            <h1>{failed ? "Unable to check grading" : "Grading your assessment..."}</h1>
            <p>
              {failed
                ? "Your answers remain saved. Check the grading status again when your connection is available."
                : "Keep this page open while authoritative grading completes. Your answers cannot be edited during grading."}
            </p>
            {(failed || pending) && (
              <div className={styles.statusActions}>
                <button type="button" onClick={onRetryGrading}>Check grading status</button>
              </div>
            )}
          </section>
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
        onSourceChange={onSourceChange}
        onRunCode={onRunCode}
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
  const codingRunInFlight = useRef(new Map());
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

  const { classroomId, lessonKey, type, attemptId } = params;
  const parsedRoute = useMemo(
    () => parseAssessmentPageRoute({ classroomId, lessonKey, type, attemptId }),
    [attemptId, classroomId, lessonKey, type],
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
    if (typeof window === "undefined") return;
    const historyHref = buildAssessmentPageHref({
      route: parsedRoute,
      screen: assessmentState.screen,
      resultAttemptId: syncAttemptId,
    });
    if (historyHref && window.location.pathname !== historyHref) {
      window.history.replaceState(window.history.state, "", historyHref);
    }
  }, [assessmentState.screen, parsedRoute, syncAttemptId]);

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
    codingRunInFlight.current.clear();
    setOutcome({ kind: "LOADING", route: parsedRoute });

    const loadAssessment = async () => {
      const nextOutcome = await orchestrator.load({
        params: { classroomId, lessonKey, type, attemptId },
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
  }, [attemptId, classroomId, lessonKey, orchestrator, parsedRoute, retryGeneration, routeKey, type]);

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
      initialSavedSourceByQuestion: latestState.current.savedSourceByQuestion,
      routeKey: assessmentState.routeKey,
      requestGeneration: assessmentState.requestGeneration,
      saveResponse,
      dispatch,
      getState: () => latestState.current,
      onSaved: () => sessionGuard.current?.announceSaved(),
    });
    playerController.current = controller;
    for (const question of latestState.current.orderedQuestions) {
      if (
        question.questionType === "CODING"
        && latestState.current.responseExistsByQuestion?.[question.id] !== true
      ) {
        controller.updateSource(question.id, latestState.current.sourceByQuestion[question.id], {
          debounceMs: 500,
        });
      }
    }
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
    if (latestState.current.attempt?.status === "GRADING") submitController.resumeGrading();

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
  const updateSource = useCallback((questionId, sourceCode) => (
    playerController.current?.updateSource(questionId, sourceCode) ?? false
  ), []);
  const navigateAfterFlush = useCallback(async (action) => {
    try {
      await playerController.current?.flushAll();
      dispatchForCurrentAttempt(action);
      return true;
    } catch {
      return false;
    }
  }, [dispatchForCurrentAttempt]);
  const previousQuestion = useCallback(() => {
    navigateAfterFlush({ type: "PREVIOUS_QUESTION" });
  }, [navigateAfterFlush]);
  const nextQuestion = useCallback(() => {
    navigateAfterFlush({ type: "NEXT_QUESTION" });
  }, [navigateAfterFlush]);
  const goToQuestion = useCallback(async (index) => {
    if (!await navigateAfterFlush({ type: "QUESTION_CHANGED", index })) return;
    setReviewReady(false);
  }, [navigateAfterFlush]);
  const runCode = useCallback(async (questionId) => {
    const current = latestState.current;
    const attemptId = current.attempt?.attemptId;
    const question = current.orderedQuestions.find(({ id }) => id === questionId);
    if (!attemptId || question?.questionType !== "CODING" || current.attempt?.status === "GRADING") {
      return false;
    }
    const runKey = `${attemptId}:${questionId}`;
    const existing = codingRunInFlight.current.get(runKey);
    if (existing) return existing;
    const operation = (async () => {
      try {
        await playerController.current?.flushAll();
      } catch {
        dispatchForCurrentAttempt({
          type: "CODING_RUN_FAILED",
          questionId,
          message: "Save your code successfully before running it.",
        });
        return false;
      }
      dispatchForCurrentAttempt({ type: "CODING_RUN_STARTED", questionId });
      try {
        const payload = await runCodingQuestion({ attemptId, questionId });
        if (latestState.current.attempt?.attemptId !== attemptId) return false;
        dispatchForCurrentAttempt({ type: "CODING_RUN_SUCCEEDED", questionId, result: payload.result });
        return true;
      } catch (error) {
        if (latestState.current.attempt?.attemptId !== attemptId) return false;
        const message = error?.code === "CODING_RUN_RATE_LIMITED"
          ? "Too many code runs. Wait a moment and try again."
          : "Code execution is currently unavailable. Your saved code has not been lost.";
        dispatchForCurrentAttempt({ type: "CODING_RUN_FAILED", questionId, message });
        return false;
      }
    })();
    codingRunInFlight.current.set(runKey, operation);
    try {
      return await operation;
    } finally {
      if (codingRunInFlight.current.get(runKey) === operation) {
        codingRunInFlight.current.delete(runKey);
      }
    }
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
  const retryGrading = useCallback(() => (
    submissionController.current?.resumeGrading()
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
      onSourceChange={updateSource}
      onRunCode={runCode}
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
      onRetryGrading={retryGrading}
      onRetake={startRetake}
      onRetryProgression={retryProgression}
    />
  );
}

export default AssessmentPage;
