const SUBMISSION_KEY_PREFIX = "sharprunner:assessment-submit:";
const VALID_SUBMISSION_KEY = /^[A-Za-z0-9_-]{8,96}$/;

const safeStorage = (storage) => {
  if (storage) return storage;
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
};

const defaultUuid = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return `assessment-${Date.now().toString(36)}-${random}`;
};

export const createAttemptSubmissionKeyStore = ({
  storage,
  randomUUID = defaultUuid,
} = {}) => {
  const target = safeStorage(storage);
  const memory = new Map();

  return {
    get(attemptId) {
      const storageKey = `${SUBMISSION_KEY_PREFIX}${attemptId}`;
      let value = memory.get(storageKey) ?? null;
      if (!value && target) {
        try {
          value = target.getItem(storageKey);
        } catch {
          value = null;
        }
      }
      if (!VALID_SUBMISSION_KEY.test(value ?? "")) {
        value = randomUUID();
        if (!VALID_SUBMISSION_KEY.test(value)) {
          throw new Error("Unable to create a valid assessment submission key");
        }
        memory.set(storageKey, value);
        if (target) {
          try {
            target.setItem(storageKey, value);
          } catch {
            // The in-memory value still preserves retries for this page lifetime.
          }
        }
      } else {
        memory.set(storageKey, value);
      }
      return value;
    },
  };
};

const isAlreadySubmitted = (error) => (
  error?.status === 409 && error?.code === "ATTEMPT_ALREADY_SUBMITTED"
);

const isGrading = (payload) => payload?.result?.status === "GRADING";
const isSubmitted = (payload) => payload?.result?.status === "SUBMITTED";
const defaultWait = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

export const createAssessmentSubmissionController = ({
  attemptId,
  classroomId,
  routeKey,
  requestGeneration,
  getState,
  flushAll,
  submitAttempt,
  getAttemptResult,
  getProgress,
  getSubmissionReadiness,
  getIdempotencyKey,
  dispatch,
  isCurrent = () => true,
  onSubmitted,
  wait = defaultWait,
  gradingPollDelays = [500, 1000, 1500, 2500, 4000, 5000],
}) => {
  const actionContext = { routeKey, requestGeneration };
  let disposed = false;
  let inFlight = null;
  let immutable = false;
  let grading = getState()?.attempt?.status === "GRADING";
  const current = () => !disposed && isCurrent();
  const send = (type, payload = {}) => {
    if (current()) dispatch({ type, ...payload, ...actionContext });
  };

  const finish = async (result, recovered) => {
    if (!current()) return { kind: "STALE" };
    if (!isSubmitted(result)) {
      const error = new Error("Assessment result response was invalid");
      send("SUBMIT_RECOVERY_FAILED", { error });
      return { kind: "RECOVERY_FAILED", error };
    }
    grading = false;
    send("SUBMIT_SUCCEEDED", { payload: result });
    onSubmitted?.({ attemptId });

    let progression = null;
    try {
      progression = await getProgress({ classroomId });
      if (!current()) return { kind: "STALE" };
      send("PROGRESSION_REFRESHED", { payload: progression });
    } catch (error) {
      if (!current()) return { kind: "STALE" };
      send("PROGRESSION_REFRESH_FAILED", { error });
    }

    return { kind: "SUBMITTED", result, progression, recovered };
  };

  const pollForResult = async () => {
    grading = true;
    immutable = true;
    send("SUBMIT_GRADING_STARTED");
    for (const delay of gradingPollDelays) {
      await wait(delay);
      if (!current()) return { kind: "STALE" };
      let result;
      try {
        result = await getAttemptResult({ attemptId });
      } catch (error) {
        if (!current()) return { kind: "STALE" };
        if (error?.code === "ATTEMPT_IN_PROGRESS") {
          grading = false;
          immutable = false;
          send("SUBMIT_GRADING_RELEASED", { error });
          return { kind: "GRADING_RELEASED", error };
        }
        send("SUBMIT_GRADING_POLL_FAILED", { error });
        return { kind: "GRADING_POLL_FAILED", error };
      }
      if (isSubmitted(result)) return finish(result, true);
      if (!isGrading(result)) {
        const error = new Error("Assessment grading state is unavailable");
        send("SUBMIT_GRADING_POLL_FAILED", { error });
        return { kind: "GRADING_POLL_FAILED", error };
      }
    }
    try {
      const resumed = await submitAttempt({
        attemptId,
        idempotencyKey: getIdempotencyKey(attemptId),
      });
      if (!current()) return { kind: "STALE" };
      if (isSubmitted(resumed)) return finish(resumed, true);
      if (!isGrading(resumed)) {
        const error = new Error("Assessment grading state is unavailable");
        send("SUBMIT_GRADING_POLL_FAILED", { error });
        return { kind: "GRADING_POLL_FAILED", error };
      }
    } catch (error) {
      if (!current()) return { kind: "STALE" };
      if (error?.code === "CODING_EXECUTION_UNAVAILABLE") {
        grading = false;
        immutable = false;
        send("SUBMIT_GRADING_RELEASED", { error });
        return { kind: "GRADING_RELEASED", error };
      }
      if (error?.code !== "ATTEMPT_GRADING") {
        send("SUBMIT_GRADING_POLL_FAILED", { error });
        return { kind: "GRADING_POLL_FAILED", error };
      }
    }
    send("SUBMIT_GRADING_PENDING");
    return { kind: "GRADING_PENDING" };
  };

  const recoverResult = async () => {
    send("SUBMIT_RECOVERY_STARTED");
    try {
      const result = await getAttemptResult({ attemptId });
      if (isGrading(result)) return pollForResult();
      return finish(result, true);
    } catch (error) {
      if (!current()) return { kind: "STALE" };
      send("SUBMIT_RECOVERY_FAILED", { error });
      return { kind: "RECOVERY_FAILED", error };
    }
  };

  const execute = async () => {
    if (grading) return pollForResult();
    if (immutable) return recoverResult();
    const initialReadiness = getSubmissionReadiness(getState());
    if (!initialReadiness.ready) return { kind: "BLOCKED", readiness: initialReadiness };

    await flushAll();
    if (!current()) return { kind: "STALE" };
    const finalReadiness = getSubmissionReadiness(getState());
    if (!finalReadiness.ready) return { kind: "BLOCKED", readiness: finalReadiness };

    send("SUBMIT_STARTED");
    let result;
    let recovered = false;
    try {
      result = await submitAttempt({
        attemptId,
        idempotencyKey: getIdempotencyKey(attemptId),
      });
    } catch (error) {
      if (!current()) return { kind: "STALE" };
      if (!isAlreadySubmitted(error)) {
        send("SUBMIT_FAILED", { error });
        return { kind: "FAILED", error };
      }
      immutable = true;
      return recoverResult();
    }
    immutable = true;
    if (isGrading(result)) return pollForResult();
    if (!isSubmitted(result)) return recoverResult();
    return finish(result, recovered);
  };

  const run = (operation) => {
    if (inFlight) return inFlight;
    inFlight = operation().finally(() => { inFlight = null; });
    return inFlight;
  };

  return {
    submit() {
      return run(execute);
    },
    retryResultRecovery() {
      if (!immutable) return Promise.resolve({ kind: "NOT_IMMUTABLE" });
      return run(grading ? pollForResult : recoverResult);
    },
    resumeGrading() {
      grading = true;
      immutable = true;
      return run(pollForResult);
    },
    dispose() {
      disposed = true;
    },
  };
};
