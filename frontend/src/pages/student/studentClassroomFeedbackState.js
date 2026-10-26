const identity = (value) => `${value ?? ""}`.trim() || null;
const canceled = (error) => error?.code === "ERR_CANCELED"
  || error?.name === "AbortError"
  || error?.name === "CanceledError";

export const initialStudentClassroomFeedbackState = (page = 1) => ({
  status: "idle",
  loading: false,
  feedback: [],
  page,
  limit: 20,
  total: null,
  totalPages: null,
  error: "",
});

const normalizePayload = (payload, requestedPage) => {
  if (!Array.isArray(payload?.feedback)
    || payload.page !== requestedPage
    || payload.limit !== 20
    || !Number.isSafeInteger(payload.total)
    || payload.total < payload.feedback.length
    || !Number.isSafeInteger(payload.totalPages)
    || payload.totalPages < 0) {
    throw new Error("The feedback history response was incomplete.");
  }
  return {
    status: "success",
    loading: false,
    feedback: payload.feedback,
    page: payload.page,
    limit: payload.limit,
    total: payload.total,
    totalPages: payload.totalPages,
    error: "",
  };
};

const errorMessage = (error) => error?.response?.data?.message
  || error?.message
  || "Unable to load classroom feedback history.";

export const createStudentClassroomFeedbackController = ({ request, onChange = () => {} }) => {
  let state = initialStudentClassroomFeedbackState();
  let accountId = null;
  let isStudent = false;
  let generation = 0;
  let sequence = 0;
  let abortController = null;
  let activeRequest = null;
  let loadedKey = null;
  let disposed = false;

  const requestKey = () => `${accountId ?? ""}:${state.page}`;
  const publish = (nextState) => {
    state = nextState;
    onChange(nextState);
  };
  const invalidate = () => {
    generation += 1;
    sequence += 1;
    abortController?.abort();
    abortController = null;
    activeRequest = null;
  };
  const current = (requestGeneration, requestSequence, requestedAccountId, requestedPage) => (
    !disposed
    && isStudent
    && generation === requestGeneration
    && sequence === requestSequence
    && accountId === requestedAccountId
    && state.page === requestedPage
  );

  const controller = {
    activate() {
      disposed = false;
    },
    setScope(nextScope = {}) {
      if (disposed) return false;
      const nextAccountId = identity(nextScope.accountId);
      const nextIsStudent = nextScope.isStudent === true;
      if (nextAccountId === accountId && nextIsStudent === isStudent) return false;
      invalidate();
      accountId = nextAccountId;
      isStudent = nextIsStudent;
      loadedKey = null;
      publish(initialStudentClassroomFeedbackState());
      return true;
    },
    setPage(nextPage) {
      if (disposed || !isStudent || !Number.isSafeInteger(nextPage) || nextPage < 1 || nextPage === state.page) return false;
      invalidate();
      loadedKey = null;
      publish(initialStudentClassroomFeedbackState(nextPage));
      return true;
    },
    load({ force = false } = {}) {
      if (disposed || !isStudent || !accountId) return Promise.resolve(false);
      const key = requestKey();
      if (activeRequest?.key === key) return activeRequest.promise;
      if (!force && loadedKey === key) return Promise.resolve(true);

      sequence += 1;
      const requestSequence = sequence;
      const requestGeneration = generation;
      const requestedAccountId = accountId;
      const requestedPage = state.page;
      abortController?.abort();
      const abort = new AbortController();
      abortController = abort;
      publish({ ...state, status: "loading", loading: true, feedback: [], total: null, totalPages: null, error: "" });

      const promise = (async () => {
        try {
          const response = await request({ page: requestedPage, limit: 20, signal: abort.signal });
          if (!current(requestGeneration, requestSequence, requestedAccountId, requestedPage)) return false;
          publish(normalizePayload(response, requestedPage));
          loadedKey = key;
          return true;
        } catch (error) {
          if (!current(requestGeneration, requestSequence, requestedAccountId, requestedPage) || canceled(error)) return false;
          publish({ ...initialStudentClassroomFeedbackState(requestedPage), status: "error", error: errorMessage(error) });
          return false;
        } finally {
          if (current(requestGeneration, requestSequence, requestedAccountId, requestedPage)) {
            abortController = null;
            activeRequest = null;
            if (state.loading) publish({ ...state, loading: false });
          }
        }
      })();
      activeRequest = { key, promise };
      return promise;
    },
    retry() {
      return controller.load({ force: true });
    },
    refreshFromFirstPage() {
      if (disposed || !isStudent || !accountId) return Promise.resolve(false);
      invalidate();
      loadedKey = null;
      publish(initialStudentClassroomFeedbackState());
      return controller.load({ force: true });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate();
    },
  };
  return controller;
};
