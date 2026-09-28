export const initialBuiltInModuleContentState = Object.freeze({
  status: "idle",
  requestKey: null,
  content: null,
  error: null,
});

export const builtInModuleContentReducer = (state, action) => {
  if (action.type === "BEGIN_REQUEST") {
    return {
      status: "loading",
      requestKey: action.requestKey,
      content: null,
      error: null,
    };
  }

  if (action.requestKey !== state.requestKey) return state;

  if (action.type === "REQUEST_SUCCEEDED") {
    return {
      status: "ready",
      requestKey: state.requestKey,
      content: action.content,
      error: null,
    };
  }

  if (action.type === "REQUEST_FAILED") {
    if (action.error?.kind === "silent") return state;
    return {
      status: "error",
      requestKey: state.requestKey,
      content: null,
      error: action.error,
    };
  }

  return state;
};

export const visibleBuiltInModuleContentState = (state, requestContext) => {
  if (state.requestKey?.startsWith(`${requestContext}:`)) return state;
  return {
    status: "loading",
    requestKey: null,
    content: null,
    error: null,
  };
};

const errorStatus = (error) => Number(error?.status ?? error?.response?.status) || null;
const errorCode = (error) => error?.code ?? error?.response?.data?.code ?? null;
const errorDetails = (error) => error?.details ?? error?.response?.data?.details ?? {};

export const classifyBuiltInLessonContentError = (error) => {
  if (["AbortError", "CanceledError"].includes(error?.name)
    || ["ERR_CANCELED", "REQUEST_ABORTED"].includes(error?.code)) {
    return { kind: "silent", retryable: false };
  }

  const status = errorStatus(error);
  const code = errorCode(error);
  const details = errorDetails(error);

  if (status === 400 && code === "INVALID_CLASSROOM_ID") {
    return {
      kind: "invalid-classroom",
      message: "The classroom link is invalid.",
      retryable: false,
    };
  }

  if (status === 401) {
    return {
      kind: "auth",
      message: "Your session has expired. Sign in again to continue.",
      retryable: false,
    };
  }

  if (status === 403 && code === "LESSON_PREREQUISITE_REQUIRED") {
    return {
      kind: "locked",
      reason: "prerequisite",
      message: "Complete the previous lesson before opening this module.",
      nextAction: details.nextAction ?? null,
      prerequisiteLessonKey: details.prerequisiteLessonKey ?? null,
      retryable: false,
    };
  }

  if (status === 403 && code === "PRE_ASSESSMENT_REQUIRED") {
    return {
      kind: "locked",
      reason: "pre-assessment",
      message: "Complete the required pre-assessment before opening this module.",
      nextAction: details.nextAction ?? null,
      assessmentId: details.assessmentId ?? null,
      retryable: false,
    };
  }

  if (status === 403) {
    return {
      kind: "forbidden",
      message: "This module is unavailable for your current classroom access.",
      retryable: false,
    };
  }

  if (status === 404) {
    return {
      kind: "not-found",
      message: "This module could not be found.",
      retryable: false,
    };
  }

  return {
    kind: "retryable",
    message: "The module could not be loaded. Check your connection and try again.",
    retryable: true,
  };
};

export const parsePositiveClassroomId = (value) => {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export const withClassroomIdQuery = (path, classroomId) => {
  if (!Number.isSafeInteger(classroomId) || classroomId <= 0) return path;
  return `${path}${path.includes("?") ? "&" : "?"}classroomId=${encodeURIComponent(classroomId)}`;
};
