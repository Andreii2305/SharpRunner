import { parseAssessmentRoute } from "./assessmentState.js";

const CANONICAL_ROUTE_TYPES = new Set(["pre", "post"]);
const PROGRESSION_EXEMPT_LESSONS = new Set(["final"]);
const LOCKED_ERROR_CODES = new Set([
  "ASSESSMENT_LOCKED",
  "LESSON_PREREQUISITE_REQUIRED",
  "PRE_ASSESSMENT_REQUIRED",
  "POST_ASSESSMENT_LOCKED",
]);

const isPositiveInteger = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;

export const parseAssessmentPageRoute = (params = {}) => {
  if (typeof params.type !== "string" || !CANONICAL_ROUTE_TYPES.has(params.type)) return null;
  return parseAssessmentRoute(params);
};

const stateMismatch = () => Object.assign(
  new Error("The assessment state could not be verified"),
  { name: "AssessmentRouteStateError", code: "ASSESSMENT_STATE_MISMATCH" },
);

const isCanceled = (error) => (
  error?.name === "AbortError"
  || error?.name === "CanceledError"
  || error?.code === "ERR_CANCELED"
);

const classifyError = (error, isCurrent) => {
  if (!isCurrent() || isCanceled(error)) return { kind: "STALE" };
  if (error?.status === 401) return { kind: "AUTH_REQUIRED", error };
  if (LOCKED_ERROR_CODES.has(error?.code)) return { kind: "LOCKED", error };
  if (error?.status === 403) return { kind: "FORBIDDEN", error };
  if (error?.status === 404) return { kind: "UNAVAILABLE", error };
  if (error?.code === "MAX_ATTEMPTS_REACHED") return { kind: "EXHAUSTED", error };
  return { kind: "ERROR", error };
};

const assessmentFields = (route) => route.type === "PRE"
  ? {
      assessmentId: "preAssessmentId",
      unlocked: "preUnlocked",
      inProgress: "preAttemptInProgress",
      completed: "preCompleted",
    }
  : {
      assessmentId: "postAssessmentId",
      unlocked: "postUnlocked",
      inProgress: "postAttemptInProgress",
      completed: "postCompleted",
    };

const context = (route, progression, lessonProgression, discovery = null) => ({
  route,
  progression,
  lessonProgression,
  discovery,
});

export const assessmentActionsForOutcome = (outcome, {
  routeKey,
  requestGeneration,
} = {}) => {
  const actionContext = { routeKey, requestGeneration };
  const actions = [];
  if (outcome?.progression) {
    actions.push({
      type: "PROGRESSION_REFRESHED",
      payload: outcome.progression,
      ...actionContext,
    });
  }
  if (outcome?.discovery) {
    actions.push({
      type: "DISCOVERY_SUCCEEDED",
      payload: outcome.discovery,
      ...actionContext,
    });
  }
  if (outcome?.kind === "ACTIVE" && outcome.envelope) {
    actions.push({
      type: "ATTEMPT_LOADED",
      payload: outcome.envelope,
      ...actionContext,
    });
  }
  if (outcome?.kind === "RESULT" && outcome.resultEnvelope) {
    actions.push({
      type: "RESULT_LOADED",
      payload: outcome.resultEnvelope,
      ...actionContext,
    });
  }
  return actions;
};

const verifyDiscovery = (route, assessmentId, discovery) => {
  const assessment = discovery?.assessment;
  const status = discovery?.status;
  if (!assessment || !status) return;

  if (
    !isPositiveInteger(assessment.id)
    || (assessmentId !== null && Number(assessment.id) !== assessmentId)
    || assessment.lessonKey !== route.lessonKey
    || String(assessment.type).toUpperCase() !== route.type
    || (status.lessonKey !== undefined && status.lessonKey !== route.lessonKey)
    || (status.type !== undefined && String(status.type).toUpperCase() !== route.type)
  ) {
    throw stateMismatch();
  }
};

const verifyAttemptEnvelope = (route, assessmentId, envelope, expectedAttemptId = null) => {
  const assessment = envelope?.assessment;
  const attempt = envelope?.attempt;
  if (
    !assessment
    || !attempt
    || Number(assessment.id) !== assessmentId
    || assessment.lessonKey !== route.lessonKey
    || String(assessment.type).toUpperCase() !== route.type
    || !isPositiveInteger(attempt.attemptId)
    || attempt.status !== "IN_PROGRESS"
    || (expectedAttemptId !== null && Number(attempt.attemptId) !== expectedAttemptId)
  ) {
    throw stateMismatch();
  }
};

const verifyResultEnvelope = (route, attemptId, envelope) => {
  const result = envelope?.result;
  if (
    !result
    || Number(result.attemptId) !== Number(attemptId)
    || String(result.type).toUpperCase() !== route.type
    || result.status !== "SUBMITTED"
  ) {
    throw stateMismatch();
  }
};

export const createAssessmentRouteOrchestrator = (services) => {
  const inFlightStarts = new Map();

  const startOnce = (key, args) => {
    if (inFlightStarts.has(key)) return inFlightStarts.get(key);

    let request;
    try {
      request = Promise.resolve(services.startOrResumeAttempt(args));
    } catch (error) {
      request = Promise.reject(error);
    }
    inFlightStarts.set(key, request);
    const clear = () => {
      if (inFlightStarts.get(key) === request) inFlightStarts.delete(key);
    };
    request.then(clear, clear);
    return request;
  };

  const loadSubmittedResult = async ({
    route,
    latestSubmittedAttemptId,
    resultDisposition,
    signal,
    isCurrent,
    shared,
  }) => {
    if (!isPositiveInteger(latestSubmittedAttemptId)) throw stateMismatch();
    try {
      const resultEnvelope = await services.getAttemptResult({
        attemptId: latestSubmittedAttemptId,
        signal,
      });
      if (!isCurrent()) return { kind: "STALE" };
      verifyResultEnvelope(route, latestSubmittedAttemptId, resultEnvelope);
      return {
        kind: "RESULT",
        resultDisposition,
        latestSubmittedAttemptId,
        resultEnvelope,
        ...shared,
      };
    } catch (error) {
      const classified = classifyError(error, isCurrent);
      if (classified.kind !== "ERROR") return { ...classified, ...shared };
      return {
        kind: "RESULT_ERROR",
        error,
        latestSubmittedAttemptId,
        resultDisposition,
        ...shared,
      };
    }
  };

  const resolve = async ({
    params,
    generation = 0,
    signal,
    isCurrent = () => true,
    allowStart = true,
  } = {}) => {
    const route = parseAssessmentPageRoute(params);
    if (!route) return { kind: "INVALID_ROUTE" };
    if (!isCurrent()) return { kind: "STALE" };

    try {
      const progression = await services.getProgress({
        classroomId: route.classroomId,
        signal,
      });
      if (!isCurrent()) return { kind: "STALE" };

      if (Number(progression?.classroomId) !== route.classroomId) throw stateMismatch();
      const lessonProgression = progression?.lessons?.find(
        (lesson) => lesson?.lessonKey === route.lessonKey,
      );
      if (!lessonProgression) return { kind: "UNAVAILABLE", route, progression };

      const fields = assessmentFields(route);
      const projectedAssessmentId = Number(lessonProgression[fields.assessmentId]);
      const assessmentId = isPositiveInteger(projectedAssessmentId)
        ? projectedAssessmentId
        : null;
      const progressionExempt = PROGRESSION_EXEMPT_LESSONS.has(route.lessonKey);
      if (assessmentId === null && !progressionExempt) {
        return {
          kind: "UNAVAILABLE",
          ...context(route, progression, lessonProgression),
        };
      }

      const knownAssessmentState = (
        lessonProgression[fields.inProgress] === true
        || lessonProgression[fields.completed] === true
        || (route.type === "POST" && lessonProgression.postAttemptsExhausted === true)
      );
      if (
        lessonProgression[fields.unlocked] !== true
        && !knownAssessmentState
        && !progressionExempt
      ) {
        return {
          kind: "LOCKED",
          ...context(route, progression, lessonProgression),
        };
      }

      const discovery = await services.discoverAssessment({
        classroomId: route.classroomId,
        lessonKey: route.lessonKey,
        type: route.type,
        signal,
      });
      if (!isCurrent()) return { kind: "STALE" };

      if (!discovery?.status?.available || !discovery?.assessment) {
        return {
          kind: "UNAVAILABLE",
          ...context(route, progression, lessonProgression, discovery),
        };
      }
      verifyDiscovery(route, assessmentId, discovery);
      const discoveredAssessmentId = Number(discovery.assessment.id);

      if (discovery.status.unlocked !== true && !knownAssessmentState) {
        return {
          kind: "LOCKED",
          ...context(route, progression, lessonProgression, discovery),
        };
      }

      const shared = context(route, progression, lessonProgression, discovery);
      const activeAttemptId = Number(discovery.status.activeAttemptId);
      if (isPositiveInteger(activeAttemptId)) {
        const envelope = await services.getAttempt({ attemptId: activeAttemptId, signal });
        if (!isCurrent()) return { kind: "STALE" };
        verifyAttemptEnvelope(route, discoveredAssessmentId, envelope, activeAttemptId);
        return { kind: "ACTIVE", source: "resume", envelope, ...shared };
      }

      const latestSubmittedAttemptId = isPositiveInteger(discovery.status.latestSubmittedAttemptId)
        ? Number(discovery.status.latestSubmittedAttemptId)
        : null;
      const hasSubmittedAttempt = (
        discovery.status.hasSubmittedAttempt === true
        || latestSubmittedAttemptId !== null
      );

      if (
        route.type === "PRE"
        && (lessonProgression.preCompleted === true || discovery.status.diagnosticCompleted === true)
      ) {
        return loadSubmittedResult({
          route,
          latestSubmittedAttemptId,
          resultDisposition: "COMPLETED",
          signal,
          isCurrent,
          shared,
        });
      }

      if (route.type === "POST") {
        if (progressionExempt && hasSubmittedAttempt) {
          if (discovery.status.latestSubmitted?.passed === true) {
            return loadSubmittedResult({
              route, latestSubmittedAttemptId, resultDisposition: "COMPLETED", signal, isCurrent, shared,
            });
          }
          if (Number(discovery.status.attemptsRemaining) === 0) {
            return loadSubmittedResult({
              route, latestSubmittedAttemptId, resultDisposition: "EXHAUSTED", signal, isCurrent, shared,
            });
          }
          return loadSubmittedResult({
            route, latestSubmittedAttemptId, resultDisposition: "SUBMITTED", signal, isCurrent, shared,
          });
        }
        if (
          lessonProgression.postPassed === true
          || (
            lessonProgression.postCompleted === true
            && lessonProgression.postPassingRequired === false
          )
        ) {
          return loadSubmittedResult({
            route, latestSubmittedAttemptId, resultDisposition: "COMPLETED", signal, isCurrent, shared,
          });
        }
        if (lessonProgression.postAttemptsExhausted === true) {
          return loadSubmittedResult({
            route, latestSubmittedAttemptId, resultDisposition: "EXHAUSTED", signal, isCurrent, shared,
          });
        }
        if (lessonProgression.postCompleted === true && !hasSubmittedAttempt) {
          throw stateMismatch();
        }
        if (hasSubmittedAttempt) {
          return loadSubmittedResult({
            route, latestSubmittedAttemptId, resultDisposition: "RETAKE_AVAILABLE", signal, isCurrent, shared,
          });
        }
      }

      if (hasSubmittedAttempt) {
        return loadSubmittedResult({
          route, latestSubmittedAttemptId, resultDisposition: "COMPLETED", signal, isCurrent, shared,
        });
      }

      if (!allowStart) throw stateMismatch();

      const startKey = `${route.routeKey}:${generation}`;
      const envelope = await startOnce(startKey, { assessmentId: discoveredAssessmentId, signal });
      if (!isCurrent()) return { kind: "STALE" };
      verifyAttemptEnvelope(route, discoveredAssessmentId, envelope);
      return { kind: "ACTIVE", source: "start", envelope, ...shared };
    } catch (error) {
      return classifyError(error, isCurrent);
    }
  };

  const load = (args = {}) => resolve({ ...args, allowStart: true });
  const revalidate = (args = {}) => resolve({ ...args, allowStart: false });

  const loadResult = async ({
    params,
    attemptId,
    signal,
    isCurrent = () => true,
  } = {}) => {
    const route = parseAssessmentPageRoute(params);
    if (!route) return { kind: "INVALID_ROUTE" };
    if (!isCurrent()) return { kind: "STALE" };
    return loadSubmittedResult({
      route,
      latestSubmittedAttemptId: Number(attemptId),
      resultDisposition: "SUBMITTED",
      signal,
      isCurrent,
      shared: { route },
    });
  };

  const retake = async ({
    params,
    generation = 0,
    signal,
    isCurrent = () => true,
  } = {}) => {
    const route = parseAssessmentPageRoute(params);
    if (!route || route.type !== "POST") return { kind: "INVALID_ROUTE" };
    if (!isCurrent()) return { kind: "STALE" };

    try {
      const progression = await services.getProgress({
        classroomId: route.classroomId,
        signal,
      });
      if (!isCurrent()) return { kind: "STALE" };
      if (Number(progression?.classroomId) !== route.classroomId) throw stateMismatch();
      const lessonProgression = progression?.lessons?.find(
        (lesson) => lesson?.lessonKey === route.lessonKey,
      );
      if (!lessonProgression) return { kind: "UNAVAILABLE", route, progression };
      const shared = context(route, progression, lessonProgression);

      if (
        lessonProgression.postPassed === true
        || (
          lessonProgression.postPassingRequired === false
          && lessonProgression.postCompleted === true
        )
      ) return { kind: "COMPLETED", ...shared };
      const attemptsExhausted = (
        lessonProgression.postAttemptsExhausted === true
        || Number(lessonProgression.postAttemptsRemaining) <= 0
      );
      const activeRecoveryExpected = lessonProgression.postAttemptInProgress === true;
      if (attemptsExhausted && !activeRecoveryExpected) {
        return { kind: "EXHAUSTED", ...shared };
      }
      if (lessonProgression.postPassingRequired !== true) throw stateMismatch();

      const discovery = await services.discoverAssessment({
        classroomId: route.classroomId,
        lessonKey: route.lessonKey,
        type: route.type,
        signal,
      });
      if (!isCurrent()) return { kind: "STALE" };
      if (!discovery?.status?.available || !discovery?.assessment) {
        return { kind: "UNAVAILABLE", ...shared, discovery };
      }
      const assessmentId = Number(discovery.assessment.id);
      verifyDiscovery(route, Number(lessonProgression.postAssessmentId) || null, discovery);

      const activeAttemptId = Number(discovery.status.activeAttemptId);
      if (isPositiveInteger(activeAttemptId)) {
        const envelope = await services.getAttempt({ attemptId: activeAttemptId, signal });
        if (!isCurrent()) return { kind: "STALE" };
        verifyAttemptEnvelope(route, assessmentId, envelope, activeAttemptId);
        return { kind: "ACTIVE", source: "resume", envelope, ...shared, discovery };
      }
      if (attemptsExhausted) return { kind: "EXHAUSTED", ...shared, discovery };
      if (
        discovery.status.hasSubmittedAttempt !== true
        || Number(discovery.status.attemptsRemaining) <= 0
      ) throw stateMismatch();

      const envelope = await startOnce(
        `retake:${route.routeKey}:${generation}`,
        { assessmentId, signal },
      );
      if (!isCurrent()) return { kind: "STALE" };
      verifyAttemptEnvelope(route, assessmentId, envelope);
      return { kind: "ACTIVE", source: "retake", envelope, ...shared, discovery };
    } catch (error) {
      return classifyError(error, isCurrent);
    }
  };

  return { load, loadResult, revalidate, retake };
};
