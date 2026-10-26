const MESSAGE_LIMIT = 1000;

export const normalizeFeedbackMessage = (value) => typeof value === "string" ? value.trim() : "";
export const countFeedbackCharacters = (value) => [...(typeof value === "string" ? value : "")].length;

export const initialStudentClassroomFeedbackSubmissionState = () => ({
  classroomsStatus: "idle",
  classroomsLoading: false,
  classrooms: [],
  classroomsError: "",
  selectedClassroomId: "",
  message: "",
  characterCount: 0,
  phase: "editing",
  submissionErrorKind: "",
  submissionError: "",
  retryAt: null,
  feedback: null,
  historyRefreshStatus: "idle",
  historyRefreshError: "",
});

const identity = (value) => `${value ?? ""}`.trim() || null;
const positiveId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const canceled = (error) => error?.code === "ERR_CANCELED"
  || error?.name === "AbortError"
  || error?.name === "CanceledError";
const defaultKey = () => globalThis.crypto?.randomUUID?.()
  || `feedback_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
const retryAfterMs = (error) => {
  const raw = error?.response?.headers?.["retry-after"] ?? error?.response?.data?.retryAfter;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : 60_000;
};

const errorPresentation = (error) => {
  const code = error?.response?.data?.code;
  if (code === "INVALID_REQUEST") return { kind: "validation", message: "Check the classroom and message, then try again." };
  if (code === "CLASSROOM_INACTIVE" || code === "CLASSROOM_NOT_FOUND") {
    return { kind: "unavailable", message: "This classroom is no longer available for new feedback." };
  }
  if (code === "IDEMPOTENCY_KEY_CONFLICT") {
    return { kind: "conflict", message: "This submission could not be matched safely. Review the feedback before starting another submission." };
  }
  if (code === "FORBIDDEN" || error?.response?.status === 403) {
    return { kind: "authorization", message: "You no longer have access to submit feedback to this classroom." };
  }
  return { kind: "error", message: "The feedback could not be submitted. Review it and try again." };
};

const validClassroomPayload = (payload) => {
  if (!Array.isArray(payload?.classrooms)) throw new Error("The classroom response was incomplete.");
  return payload.classrooms.filter((classroom) => positiveId(classroom?.id) && classroom?.isActive !== false);
};

export const createStudentClassroomFeedbackSubmissionController = ({
  loadClassrooms: requestClassrooms,
  submit: requestSubmit,
  refreshHistory = async () => true,
  createKey = defaultKey,
  now = () => Date.now(),
  onChange = () => {},
} = {}) => {
  let state = initialStudentClassroomFeedbackSubmissionState();
  let accountId = null;
  let isStudent = false;
  let disposed = false;
  let generation = 0;
  let classroomSequence = 0;
  let submitSequence = 0;
  let refreshSequence = 0;
  let classroomRequest = null;
  let submitRequest = null;
  let operation = null;
  let classroomsLoadedFor = null;

  const publish = (changes) => {
    state = { ...state, ...changes };
    onChange({ ...state });
  };
  const abortAll = () => {
    generation += 1;
    classroomSequence += 1;
    submitSequence += 1;
    refreshSequence += 1;
    classroomRequest?.abort.abort();
    submitRequest?.abort.abort();
    classroomRequest = null;
    submitRequest = null;
  };
  const scopeCurrent = (token, requestedAccount) => !disposed
    && token === generation
    && isStudent
    && accountId === requestedAccount;
  const operationLocked = () => ["sending", "uncertain", "rate-limited", "success"].includes(state.phase);
  const validResult = (result, currentOperation) => (
    (result?.changed === true || result?.changed === false)
    && Number(result?.feedback?.classroomId) === currentOperation.classroomId
    && result?.feedback?.message === currentOperation.message
    && positiveId(result?.feedback?.id)
  );

  const runHistoryRefresh = async (token, requestedAccount) => {
    refreshSequence += 1;
    const sequence = refreshSequence;
    publish({ historyRefreshStatus: "loading", historyRefreshError: "" });
    let refreshed = false;
    try {
      refreshed = await refreshHistory();
    } catch {
      refreshed = false;
    }
    if (!scopeCurrent(token, requestedAccount) || sequence !== refreshSequence || state.phase !== "success") return false;
    publish(refreshed
      ? { historyRefreshStatus: "success", historyRefreshError: "" }
      : { historyRefreshStatus: "error", historyRefreshError: "Your feedback was saved, but the history could not refresh." });
    return refreshed === true;
  };

  const execute = (currentOperation) => {
    if (submitRequest?.operation === currentOperation) return submitRequest.promise;
    submitSequence += 1;
    const sequence = submitSequence;
    const token = generation;
    const requestedAccount = accountId;
    const abort = new AbortController();
    currentOperation.status = "sending";
    publish({
      phase: "sending", submissionErrorKind: "", submissionError: "", retryAt: null,
      historyRefreshStatus: "idle", historyRefreshError: "",
    });
    const promise = (async () => {
      try {
        const result = await requestSubmit({
          classroomId: currentOperation.classroomId,
          message: currentOperation.message,
          idempotencyKey: currentOperation.idempotencyKey,
          signal: abort.signal,
        });
        if (!scopeCurrent(token, requestedAccount) || sequence !== submitSequence || operation !== currentOperation) return false;
        if (!validResult(result, currentOperation)) throw new Error("Incomplete feedback response");
        submitRequest = null;
        currentOperation.status = "success";
        publish({
          phase: "success", submissionErrorKind: "", submissionError: "", retryAt: null,
          feedback: result.feedback,
        });
        await runHistoryRefresh(token, requestedAccount);
        return true;
      } catch (error) {
        if (!scopeCurrent(token, requestedAccount) || sequence !== submitSequence || operation !== currentOperation || canceled(error)) return false;
        submitRequest = null;
        const status = Number(error?.response?.status);
        if (!error?.response || (status >= 500 && status <= 599)) {
          currentOperation.status = "uncertain";
          publish({
            phase: "uncertain",
            submissionErrorKind: "uncertain",
            submissionError: "The result is uncertain. Retry the same feedback to confirm whether it was saved.",
          });
          return false;
        }
        if (status === 429 || error?.response?.data?.code === "FEEDBACK_RATE_LIMITED") {
          currentOperation.status = "rate-limited";
          currentOperation.retryAt = now() + retryAfterMs(error);
          publish({
            phase: "rate-limited",
            submissionErrorKind: "rate-limit",
            submissionError: "Too many feedback requests. Wait before retrying this same feedback.",
            retryAt: currentOperation.retryAt,
          });
          return false;
        }
        operation = null;
        const presentation = errorPresentation(error);
        publish({ phase: "error", submissionErrorKind: presentation.kind, submissionError: presentation.message, retryAt: null });
        return false;
      } finally {
        if (submitRequest?.promise === promise) submitRequest = null;
      }
    })();
    submitRequest = { operation: currentOperation, abort, promise };
    return promise;
  };

  const controller = {
    getState: () => ({ ...state, classrooms: [...state.classrooms] }),
    activate() { disposed = false; },
    setScope(next = {}) {
      if (disposed) return false;
      const nextAccount = identity(next.accountId);
      const nextIsStudent = next.isStudent === true;
      if (nextAccount === accountId && nextIsStudent === isStudent) return false;
      abortAll();
      accountId = nextAccount;
      isStudent = nextIsStudent;
      operation = null;
      classroomsLoadedFor = null;
      state = initialStudentClassroomFeedbackSubmissionState();
      onChange({ ...state });
      return true;
    },
    loadClassrooms({ force = false } = {}) {
      if (disposed || !isStudent || !accountId) return Promise.resolve(false);
      if (classroomRequest) return classroomRequest.promise;
      if (!force && classroomsLoadedFor === accountId) return Promise.resolve(true);
      classroomSequence += 1;
      const sequence = classroomSequence;
      const token = generation;
      const requestedAccount = accountId;
      const abort = new AbortController();
      publish({ classroomsStatus: "loading", classroomsLoading: true, classroomsError: "" });
      const promise = (async () => {
        try {
          const payload = await requestClassrooms({ signal: abort.signal });
          if (!scopeCurrent(token, requestedAccount) || sequence !== classroomSequence) return false;
          const classrooms = validClassroomPayload(payload);
          const selectionExists = classrooms.some((item) => `${item.id}` === state.selectedClassroomId);
          publish({
            classroomsStatus: "success", classroomsLoading: false, classrooms, classroomsError: "",
            selectedClassroomId: operationLocked() || selectionExists ? state.selectedClassroomId : "",
          });
          classroomsLoadedFor = requestedAccount;
          return true;
        } catch (error) {
          if (!scopeCurrent(token, requestedAccount) || sequence !== classroomSequence || canceled(error)) return false;
          publish({ classroomsStatus: "error", classroomsLoading: false, classrooms: [], classroomsError: "Unable to load classrooms." });
          return false;
        } finally {
          if (scopeCurrent(token, requestedAccount) && sequence === classroomSequence) {
            classroomRequest = null;
            if (state.classroomsLoading) publish({ classroomsLoading: false });
          }
        }
      })();
      classroomRequest = { abort, promise };
      return promise;
    },
    retryClassrooms() { return controller.loadClassrooms({ force: true }); },
    selectClassroom(value) {
      if (disposed || operationLocked()) return false;
      const normalized = `${value ?? ""}`;
      if (normalized && !state.classrooms.some((item) => `${item.id}` === normalized)) return false;
      publish({ selectedClassroomId: normalized, phase: "editing", submissionErrorKind: "", submissionError: "" });
      return true;
    },
    updateMessage(value) {
      if (disposed || operationLocked()) return false;
      const message = typeof value === "string" ? value : "";
      publish({
        message,
        characterCount: countFeedbackCharacters(normalizeFeedbackMessage(message)),
        phase: "editing",
        submissionErrorKind: "",
        submissionError: "",
      });
      return true;
    },
    submit() {
      if (disposed || !isStudent || !accountId) return Promise.resolve(false);
      if (submitRequest) return submitRequest.promise;
      if (operationLocked()) return Promise.resolve(false);
      const classroomId = Number(state.selectedClassroomId);
      const message = normalizeFeedbackMessage(state.message);
      const count = countFeedbackCharacters(message);
      if (!positiveId(classroomId) || !state.classrooms.some((item) => Number(item.id) === classroomId)) {
        publish({ phase: "error", submissionErrorKind: "validation", submissionError: "Select a classroom before submitting feedback." });
        return Promise.resolve(false);
      }
      if (!message || count > MESSAGE_LIMIT) {
        publish({
          phase: "error", submissionErrorKind: "validation",
          submissionError: !message ? "Enter feedback before submitting." : "Feedback must be 1,000 characters or fewer.",
        });
        return Promise.resolve(false);
      }
      operation = {
        accountId, classroomId, message, idempotencyKey: createKey(), status: "sending", retryAt: null,
      };
      publish({ message, characterCount: count });
      return execute(operation);
    },
    retrySubmission() {
      if (disposed || !operation || submitRequest || !["uncertain", "rate-limited"].includes(operation.status)) {
        return submitRequest?.promise ?? Promise.resolve(false);
      }
      if (operation.status === "rate-limited" && now() < operation.retryAt) return Promise.resolve(false);
      return execute(operation);
    },
    retryHistoryRefresh() {
      if (disposed || state.phase !== "success" || state.historyRefreshStatus !== "error") return Promise.resolve(false);
      return runHistoryRefresh(generation, accountId);
    },
    sendAnother() {
      if (disposed || state.phase !== "success") return false;
      refreshSequence += 1;
      operation = null;
      publish({
        selectedClassroomId: "", message: "", characterCount: 0, phase: "editing",
        submissionErrorKind: "", submissionError: "", retryAt: null, feedback: null,
        historyRefreshStatus: "idle", historyRefreshError: "",
      });
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      accountId = null;
      isStudent = false;
      operation = null;
      abortAll();
      state = initialStudentClassroomFeedbackSubmissionState();
    },
  };
  return controller;
};
