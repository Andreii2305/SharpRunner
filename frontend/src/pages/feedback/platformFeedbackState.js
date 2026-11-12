const MESSAGE_LIMIT = 1000;

const positiveId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0
  ? Number(value)
  : null;
const countCharacters = (value) => [...value].length;
const normalizeMessage = (value) => typeof value === "string" ? value.trim() : "";
const canceled = (error) => error?.name === "AbortError" || error?.code === "ERR_CANCELED";

const retryAfterMs = (error) => {
  const raw = error?.response?.headers?.["retry-after"]
    ?? error?.response?.headers?.get?.("retry-after");
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 60_000;
};

const createOperationKey = () => {
  const random = globalThis.crypto?.randomUUID?.().replaceAll("-", "");
  return `platform_${random || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
};

export const initialPlatformFeedbackState = () => ({
  status: "idle",
  loading: false,
  feedback: [],
  page: 1,
  limit: 20,
  total: null,
  totalPages: null,
  error: "",
  message: "",
  characterCount: 0,
  mutationPhase: "editing",
  mutationErrorKind: "",
  mutationError: "",
  retryAt: null,
  savedFeedback: null,
  historyRefreshError: "",
});

const validateHistory = (payload, requestedPage) => {
  if (!Array.isArray(payload?.feedback)
    || payload.page !== requestedPage
    || payload.limit !== 20
    || !Number.isSafeInteger(payload.total)
    || payload.total < payload.feedback.length
    || !Number.isSafeInteger(payload.totalPages)
    || payload.totalPages < 0
    || payload.feedback.some((entry) => !positiveId(entry?.id)
      || typeof entry?.message !== "string"
      || typeof entry?.createdAt !== "string")) {
    throw new Error("The platform feedback response was incomplete.");
  }
  return payload;
};

const validateSaved = (payload, operation) => {
  const item = payload?.feedback;
  if (typeof payload?.changed !== "boolean"
    || !positiveId(item?.id)
    || item.message !== operation.message
    || typeof item.createdAt !== "string") {
    throw new Error("The platform feedback confirmation was incomplete.");
  }
  return item;
};

const errorMessage = (error, fallback) => error?.response?.data?.message
  || error?.message
  || fallback;

export const createPlatformFeedbackController = ({
  list,
  submit,
  createKey = createOperationKey,
  now = () => Date.now(),
  onChange = () => {},
}) => {
  let state = initialPlatformFeedbackState();
  let accountId = null;
  let eligible = false;
  let active = true;
  let generation = 0;
  let loadSequence = 0;
  let loadRequest = null;
  let mutationRequest = null;
  let operation = null;

  const snapshot = () => ({ ...state, feedback: [...state.feedback] });
  const publish = (patch) => {
    state = { ...state, ...patch };
    if (active) onChange(snapshot());
  };
  const scopeCurrent = (token, requestedAccount) => active
    && token === generation
    && requestedAccount === accountId
    && eligible;
  const abortRequests = () => {
    loadRequest?.abort.abort();
    mutationRequest?.abort.abort();
    loadRequest = null;
    mutationRequest = null;
  };

  const runLoad = ({ forcePage } = {}) => {
    if (!active || !eligible || !accountId) return Promise.resolve(false);
    if (loadRequest) return loadRequest.promise;
    const requestedPage = forcePage ?? state.page;
    const token = generation;
    const requestedAccount = accountId;
    const sequence = ++loadSequence;
    const abort = new AbortController();
    publish({ status: "loading", loading: true, feedback: [], total: null, totalPages: null, error: "" });
    const promise = (async () => {
      try {
        const payload = validateHistory(await list({ page: requestedPage, limit: 20, signal: abort.signal }), requestedPage);
        if (!scopeCurrent(token, requestedAccount) || sequence !== loadSequence) return false;
        publish({
          status: "success",
          loading: false,
          feedback: payload.feedback,
          page: payload.page,
          limit: payload.limit,
          total: payload.total,
          totalPages: payload.totalPages,
          error: "",
        });
        return true;
      } catch (error) {
        if (!scopeCurrent(token, requestedAccount) || sequence !== loadSequence || canceled(error)) return false;
        publish({
          status: "error",
          loading: false,
          feedback: [],
          total: null,
          totalPages: null,
          error: errorMessage(error, "Unable to load private platform feedback."),
        });
        return false;
      } finally {
        if (loadRequest?.sequence === sequence) loadRequest = null;
      }
    })();
    loadRequest = { abort, promise, sequence };
    return promise;
  };

  const execute = (currentOperation) => {
    if (mutationRequest) return mutationRequest.promise;
    const token = generation;
    const requestedAccount = accountId;
    const abort = new AbortController();
    currentOperation.status = "sending";
    publish({ mutationPhase: "sending", mutationErrorKind: "", mutationError: "", retryAt: null });
    const promise = (async () => {
      try {
        const payload = await submit({
          message: currentOperation.message,
          idempotencyKey: currentOperation.idempotencyKey,
          signal: abort.signal,
        });
        if (!scopeCurrent(token, requestedAccount) || operation !== currentOperation) return false;
        const savedFeedback = validateSaved(payload, currentOperation);
        currentOperation.status = "success";
        operation = null;
        publish({
          mutationPhase: "success",
          mutationErrorKind: "",
          mutationError: "",
          retryAt: null,
          savedFeedback,
          historyRefreshError: "",
        });
        const refreshed = await runLoad({ forcePage: 1 });
        if (scopeCurrent(token, requestedAccount) && !refreshed) {
          publish({ historyRefreshError: "Feedback was saved, but history could not be refreshed." });
        }
        return true;
      } catch (error) {
        if (!scopeCurrent(token, requestedAccount) || operation !== currentOperation || canceled(error)) return false;
        const status = Number(error?.response?.status);
        if (!error?.response || (status >= 500 && status <= 599)) {
          currentOperation.status = "uncertain";
          publish({
            mutationPhase: "uncertain",
            mutationErrorKind: "uncertain",
            mutationError: "The save result is uncertain. Retry the same private feedback to confirm it.",
          });
          return false;
        }
        if (status === 429) {
          currentOperation.status = "rate-limited";
          currentOperation.retryAt = now() + retryAfterMs(error);
          publish({
            mutationPhase: "rate-limited",
            mutationErrorKind: "rate-limit",
            mutationError: "Too many requests. Retry this same feedback after the waiting period.",
            retryAt: currentOperation.retryAt,
          });
          return false;
        }
        operation = null;
        publish({
          mutationPhase: "error",
          mutationErrorKind: "definitive",
          mutationError: errorMessage(error, "Unable to save private platform feedback."),
          retryAt: null,
        });
        return false;
      } finally {
        if (mutationRequest?.operation === currentOperation) mutationRequest = null;
      }
    })();
    mutationRequest = { abort, promise, operation: currentOperation };
    return promise;
  };

  const controller = {
    getState: snapshot,
    activate() {
      active = true;
      if (operation?.status === "sending") operation.status = "uncertain";
      if (operation?.status === "uncertain") {
        state = {
          ...state,
          mutationPhase: "uncertain",
          mutationErrorKind: "uncertain",
          mutationError: "The save result is uncertain. Retry the same private feedback to confirm it.",
        };
      }
      onChange(snapshot());
    },
    deactivate() {
      if (!active) return;
      active = false;
      generation += 1;
      if (operation?.status === "sending") operation.status = "uncertain";
      abortRequests();
    },
    setScope(next = {}) {
      const nextAccount = positiveId(next.accountId);
      const nextEligible = next.eligible === true;
      if (nextAccount === accountId && nextEligible === eligible) return false;
      generation += 1;
      abortRequests();
      accountId = nextAccount;
      eligible = nextEligible;
      operation = null;
      state = initialPlatformFeedbackState();
      onChange(snapshot());
      return true;
    },
    load: runLoad,
    retryLoad: runLoad,
    setPage(page) {
      if (!active || !positiveId(page) || loadRequest || page === state.page) return false;
      publish({
        status: "idle",
        loading: false,
        feedback: [],
        page: Number(page),
        total: null,
        totalPages: null,
        error: "",
      });
      return true;
    },
    updateMessage(value) {
      if (!active || mutationRequest || operation) return false;
      const message = typeof value === "string" ? value : "";
      publish({
        message,
        characterCount: countCharacters(normalizeMessage(message)),
        mutationPhase: "editing",
        mutationErrorKind: "",
        mutationError: "",
        savedFeedback: null,
      });
      return true;
    },
    submit() {
      if (!active || !eligible || !accountId) return Promise.resolve(false);
      if (mutationRequest) return mutationRequest.promise;
      if (operation) return Promise.resolve(false);
      const message = normalizeMessage(state.message);
      const count = countCharacters(message);
      if (!message || count > MESSAGE_LIMIT) {
        publish({
          mutationPhase: "error",
          mutationErrorKind: "validation",
          mutationError: !message
            ? "Enter private feedback before submitting."
            : "Private feedback must be 1,000 characters or fewer.",
        });
        return Promise.resolve(false);
      }
      operation = { accountId, message, idempotencyKey: createKey(), status: "sending", retryAt: null };
      publish({ message, characterCount: count });
      return execute(operation);
    },
    retrySubmission() {
      if (!active || !operation || mutationRequest
        || !["uncertain", "rate-limited"].includes(operation.status)) {
        return mutationRequest?.promise ?? Promise.resolve(false);
      }
      if (operation.status === "rate-limited" && now() < operation.retryAt) return Promise.resolve(false);
      return execute(operation);
    },
    sendAnother() {
      if (!active || state.mutationPhase !== "success") return false;
      operation = null;
      publish({
        message: "",
        characterCount: 0,
        mutationPhase: "editing",
        mutationErrorKind: "",
        mutationError: "",
        retryAt: null,
        savedFeedback: null,
        historyRefreshError: "",
      });
      return true;
    },
  };
  return controller;
};
