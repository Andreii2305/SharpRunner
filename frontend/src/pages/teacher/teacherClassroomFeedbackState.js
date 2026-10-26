const identity = (value) => {
  const normalized = `${value ?? ""}`.trim();
  return normalized || null;
};

const positiveSafeIntegerIdentity = (value) => {
  const normalized = identity(value);
  if (!normalized || !/^[1-9][0-9]*$/.test(normalized)) return null;
  return Number.isSafeInteger(Number(normalized)) ? normalized : null;
};

const canceled = (error) => error?.code === "ERR_CANCELED" || error?.name === "AbortError";

export const initialTeacherClassroomFeedbackState = () => ({
  status: "idle",
  loading: false,
  feedback: [],
  page: 1,
  limit: 20,
  total: null,
  totalPages: null,
  error: "",
});

const normalizePayload = (payload, requestedClassroomId, requestedPage) => {
  if (!Array.isArray(payload?.feedback)
    || payload.page !== requestedPage
    || payload.limit !== 20
    || !Number.isSafeInteger(payload.total)
    || payload.total < payload.feedback.length
    || !Number.isSafeInteger(payload.totalPages)
    || payload.totalPages < 0
    || payload.feedback.some((entry) => positiveSafeIntegerIdentity(entry?.classroomId) !== requestedClassroomId)) {
    throw new Error("The classroom feedback response was incomplete.");
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

const feedbackErrorMessage = (error) => {
  if (error?.response?.status === 403) return "You no longer have access to this classroom feedback.";
  return error?.response?.data?.message || error?.message || "Unable to load classroom feedback.";
};

export const createTeacherClassroomFeedbackController = ({ request, onChange = () => {} }) => {
  let state = initialTeacherClassroomFeedbackState();
  let accountId = null;
  let classroomId = null;
  let isTeacher = false;
  let active = false;
  let generation = 0;
  let sequence = 0;
  let abortController = null;
  let disposed = false;

  const publish = (nextState) => {
    state = nextState;
    onChange(nextState);
  };
  const reset = () => publish(initialTeacherClassroomFeedbackState());
  const invalidate = () => {
    generation += 1;
    sequence += 1;
    abortController?.abort();
    abortController = null;
  };
  const isCurrent = (requestGeneration, requestSequence, requestedAccountId, requestedClassroomId, requestedPage) => (
    !disposed
    && active
    && isTeacher
    && requestGeneration === generation
    && requestSequence === sequence
    && requestedAccountId === accountId
    && requestedClassroomId === classroomId
    && requestedPage === state.page
  );

  const controller = {
    activate() {
      disposed = false;
    },
    setScope(nextScope = {}) {
      if (disposed) return false;
      const nextAccountId = identity(nextScope.accountId);
      const nextClassroomId = positiveSafeIntegerIdentity(nextScope.classroomId);
      const nextIsTeacher = nextScope.isTeacher === true;
      if (nextAccountId === accountId && nextClassroomId === classroomId && nextIsTeacher === isTeacher) return false;
      invalidate();
      accountId = nextAccountId;
      classroomId = nextClassroomId;
      isTeacher = nextIsTeacher;
      active = false;
      reset();
      return true;
    },
    async load() {
      if (disposed || !active || !isTeacher || !accountId || !classroomId) return false;
      sequence += 1;
      const requestSequence = sequence;
      const requestGeneration = generation;
      const requestedAccountId = accountId;
      const requestedClassroomId = classroomId;
      const requestedPage = state.page;
      abortController?.abort();
      const abort = new AbortController();
      abortController = abort;
      publish({ ...state, status: "loading", loading: true, feedback: [], total: null, totalPages: null, error: "" });
      try {
        const response = await request({ classroomId: requestedClassroomId, page: requestedPage, limit: 20, signal: abort.signal });
        if (!isCurrent(requestGeneration, requestSequence, requestedAccountId, requestedClassroomId, requestedPage)) return false;
        publish(normalizePayload(response, requestedClassroomId, requestedPage));
        return true;
      } catch (error) {
        if (!isCurrent(requestGeneration, requestSequence, requestedAccountId, requestedClassroomId, requestedPage) || canceled(error)) return false;
        publish({ ...state, status: "error", loading: false, feedback: [], total: null, totalPages: null, error: feedbackErrorMessage(error) });
        return false;
      } finally {
        if (isCurrent(requestGeneration, requestSequence, requestedAccountId, requestedClassroomId, requestedPage)) {
          abortController = null;
          if (state.loading) publish({ ...state, loading: false });
        }
      }
    },
    setActive(nextActive) {
      if (disposed) return Promise.resolve(false);
      const shouldActivate = nextActive === true && isTeacher;
      if (!shouldActivate) {
        if (active || state.status !== "idle") {
          invalidate();
          active = false;
          reset();
        }
        return Promise.resolve(false);
      }
      if (active) return Promise.resolve(false);
      active = true;
      return controller.load();
    },
    setPage(nextPage) {
      if (disposed || !active || !Number.isSafeInteger(nextPage) || nextPage < 1 || nextPage === state.page) return Promise.resolve(false);
      invalidate();
      publish({ ...initialTeacherClassroomFeedbackState(), page: nextPage });
      return controller.load();
    },
    retry() {
      return controller.load();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate();
      active = false;
    },
  };
  return controller;
};
