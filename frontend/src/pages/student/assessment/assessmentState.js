const LESSON_KEYS = new Set([
  "arrays",
  "functions",
  "functions-with-arrays",
  "final",
]);
const ASSESSMENT_TYPES = new Set(["PRE", "POST"]);

const positiveInteger = (value) => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export const parseAssessmentRoute = ({
  classroomId,
  lessonKey,
  type,
  attemptId = null,
} = {}) => {
  const parsedClassroomId = positiveInteger(classroomId);
  const normalizedLessonKey = typeof lessonKey === "string" ? lessonKey.trim() : "";
  const normalizedType = typeof type === "string" ? type.trim().toUpperCase() : "";
  const parsedAttemptId = attemptId === null || attemptId === undefined || attemptId === ""
    ? null
    : positiveInteger(attemptId);

  if (
    !parsedClassroomId
    || !LESSON_KEYS.has(normalizedLessonKey)
    || !ASSESSMENT_TYPES.has(normalizedType)
    || (attemptId !== null && attemptId !== undefined && attemptId !== "" && !parsedAttemptId)
  ) {
    return null;
  }

  return {
    classroomId: parsedClassroomId,
    lessonKey: normalizedLessonKey,
    type: normalizedType,
    attemptId: parsedAttemptId,
    routeKey: `${parsedClassroomId}:${normalizedLessonKey}:${normalizedType.toLowerCase()}`,
  };
};

export const classifyAssessmentDiscovery = (payload) => {
  if (!payload?.status?.available || !payload?.assessment) return "unavailable";
  if (!payload.status.unlocked) return "locked";
  if (payload.status.activeAttemptId) return "active";
  if (payload.status.latestSubmittedAttemptId) return "result";
  return "ready";
};

export const createAssessmentState = ({ routeKey = null, requestGeneration = 0 } = {}) => ({
  screen: routeKey ? "idle" : "loading",
  routeKey,
  requestGeneration,
  discovery: null,
  discoveryMode: null,
  assessment: null,
  attempt: null,
  attemptLoadVersion: 0,
  orderedQuestions: [],
  currentQuestionIndex: 0,
  selectedByQuestion: {},
  savedByQuestion: {},
  sourceByQuestion: {},
  savedSourceByQuestion: {},
  responseExistsByQuestion: {},
  revisionByQuestion: {},
  saveStateByQuestion: {},
  codingRunByQuestion: {},
  submitReviewOpen: false,
  submitStatus: "idle",
  result: null,
  progression: null,
  progressionError: null,
  retakeStatus: "idle",
  retakeError: null,
  externalSyncRequired: false,
  externalSyncStatus: "idle",
  externalSyncError: null,
  error: null,
});

const matchesContext = (state, action) => (
  action.routeKey === state.routeKey
  && action.requestGeneration === state.requestGeneration
);

const choicesFor = (state, questionId) => state.orderedQuestions
  .find((question) => question.id === questionId)?.choices ?? null;

const acceptedChoice = (state, questionId, selectedChoiceId) => {
  const choices = choicesFor(state, questionId);
  return choices?.some((choice) => choice.id === selectedChoiceId) === true;
};

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);

const responseMaps = (questions, responses = []) => {
  const selectedByQuestion = {};
  const sourceByQuestion = {};
  const savedSourceByQuestion = {};
  const responseExistsByQuestion = {};

  for (const response of responses) {
    if (response?.questionId === undefined) continue;
    responseExistsByQuestion[response.questionId] = true;
    if (hasOwn(response, "selectedChoiceId")) {
      selectedByQuestion[response.questionId] = response.selectedChoiceId;
    }
    if (hasOwn(response, "sourceCode")) {
      sourceByQuestion[response.questionId] = response.sourceCode;
      savedSourceByQuestion[response.questionId] = response.sourceCode;
    }
  }

  for (const question of questions) {
    if (question.questionType !== "CODING" || hasOwn(sourceByQuestion, question.id)) continue;
    sourceByQuestion[question.id] = typeof question.starterCode === "string"
      ? question.starterCode
      : "";
  }

  return {
    selectedByQuestion,
    sourceByQuestion,
    savedSourceByQuestion,
    responseExistsByQuestion,
  };
};

const initialSaveStates = (questions, savedByQuestion) => Object.fromEntries(
  questions.map((question) => [question.id, {
    status: "clean",
    revision: 0,
    error: null,
  }]).filter(([questionId]) => savedByQuestion[questionId] !== undefined),
);

const isSourceAction = (action) => hasOwn(action, "sourceCode");
const saveActionMatches = (state, action) => (
  state.revisionByQuestion[action.questionId] === action.revision
  && (isSourceAction(action)
    ? state.sourceByQuestion[action.questionId] === action.sourceCode
    : state.selectedByQuestion[action.questionId] === action.selectedChoiceId)
);

const discoveryScreen = (mode) => {
  if (mode === "unavailable" || mode === "locked") return mode;
  return "ready";
};

export const assessmentReducer = (state, action) => {
  if (action.type === "ROUTE_CHANGED") {
    return {
      ...createAssessmentState({
        routeKey: action.routeKey,
        requestGeneration: action.requestGeneration,
      }),
      screen: "loading",
    };
  }

  if (!matchesContext(state, action)) return state;

  switch (action.type) {
    case "DISCOVERY_SUCCEEDED": {
      const discoveryMode = classifyAssessmentDiscovery(action.payload);
      return {
        ...state,
        screen: discoveryScreen(discoveryMode),
        discovery: action.payload,
        discoveryMode,
        error: null,
      };
    }
    case "DISCOVERY_FAILED":
    case "ATTEMPT_FAILED":
    case "RESULT_FAILED":
      return { ...state, screen: "error", error: action.error };
    case "ATTEMPT_LOADED": {
      const assessment = action.payload?.assessment ?? null;
      const attempt = action.payload?.attempt ?? null;
      const orderedQuestions = Array.isArray(assessment?.questions)
        ? assessment.questions.slice()
        : [];
      const maps = responseMaps(orderedQuestions, attempt?.responses);
      const savedByQuestion = maps.selectedByQuestion;
      return {
        ...state,
        screen: "active",
        assessment,
        attempt,
        attemptLoadVersion: state.attemptLoadVersion + 1,
        orderedQuestions,
        currentQuestionIndex: 0,
        selectedByQuestion: { ...savedByQuestion },
        savedByQuestion,
        sourceByQuestion: maps.sourceByQuestion,
        savedSourceByQuestion: maps.savedSourceByQuestion,
        responseExistsByQuestion: maps.responseExistsByQuestion,
        revisionByQuestion: {},
        saveStateByQuestion: initialSaveStates(orderedQuestions, savedByQuestion),
        codingRunByQuestion: {},
        submitReviewOpen: false,
        submitStatus: attempt?.status === "GRADING" ? "grading" : "idle",
        result: null,
        progressionError: null,
        retakeStatus: "idle",
        retakeError: null,
        externalSyncRequired: false,
        externalSyncStatus: "idle",
        externalSyncError: null,
        error: null,
      };
    }
    case "QUESTION_CHANGED": {
      const lastIndex = Math.max(0, state.orderedQuestions.length - 1);
      const nextIndex = Math.min(lastIndex, Math.max(0, Number(action.index) || 0));
      return nextIndex === state.currentQuestionIndex
        ? state
        : { ...state, currentQuestionIndex: nextIndex };
    }
    case "NEXT_QUESTION": {
      const lastIndex = Math.max(0, state.orderedQuestions.length - 1);
      if (state.currentQuestionIndex >= lastIndex) return state;
      return { ...state, currentQuestionIndex: state.currentQuestionIndex + 1 };
    }
    case "PREVIOUS_QUESTION":
      if (state.currentQuestionIndex <= 0) return state;
      return { ...state, currentQuestionIndex: state.currentQuestionIndex - 1 };
    case "CHOICE_SELECTED": {
      if (!acceptedChoice(state, action.questionId, action.selectedChoiceId)) return state;
      if (state.selectedByQuestion[action.questionId] === action.selectedChoiceId) return state;
      const revision = (state.revisionByQuestion[action.questionId] ?? 0) + 1;
      const clean = state.savedByQuestion[action.questionId] === action.selectedChoiceId;
      return {
        ...state,
        selectedByQuestion: {
          ...state.selectedByQuestion,
          [action.questionId]: action.selectedChoiceId,
        },
        revisionByQuestion: {
          ...state.revisionByQuestion,
          [action.questionId]: revision,
        },
        saveStateByQuestion: {
          ...state.saveStateByQuestion,
          [action.questionId]: {
            status: clean
              ? (action.saveInFlight ? "saving" : "clean")
              : (action.preserveSaveError ? "error" : "dirty"),
            revision,
            error: clean ? null : (action.preserveSaveError ? action.saveError : null),
          },
        },
      };
    }
    case "SOURCE_CHANGED": {
      const question = state.orderedQuestions.find(({ id }) => id === action.questionId);
      if (question?.questionType !== "CODING" || typeof action.sourceCode !== "string") return state;
      if (
        state.sourceByQuestion[action.questionId] === action.sourceCode
        && !(action.forceSave && state.responseExistsByQuestion[action.questionId] !== true)
      ) return state;
      const revision = (state.revisionByQuestion[action.questionId] ?? 0) + 1;
      const clean = state.savedSourceByQuestion[action.questionId] === action.sourceCode
        && state.responseExistsByQuestion[action.questionId] === true;
      return {
        ...state,
        sourceByQuestion: {
          ...state.sourceByQuestion,
          [action.questionId]: action.sourceCode,
        },
        codingRunByQuestion: {
          ...state.codingRunByQuestion,
          [action.questionId]: undefined,
        },
        revisionByQuestion: {
          ...state.revisionByQuestion,
          [action.questionId]: revision,
        },
        saveStateByQuestion: {
          ...state.saveStateByQuestion,
          [action.questionId]: {
            status: clean
              ? (action.saveInFlight ? "saving" : "clean")
              : (action.preserveSaveError ? "error" : "dirty"),
            revision,
            error: clean ? null : (action.preserveSaveError ? action.saveError : null),
          },
        },
      };
    }
    case "SAVE_STARTED": {
      if (!saveActionMatches(state, action)) return state;
      return {
        ...state,
        saveStateByQuestion: {
          ...state.saveStateByQuestion,
          [action.questionId]: {
            status: "saving",
            revision: action.revision,
            error: null,
          },
        },
      };
    }
    case "SAVE_SUCCEEDED": {
      if (!saveActionMatches(state, action)) return state;
      return {
        ...state,
        ...(isSourceAction(action)
          ? {
            savedSourceByQuestion: {
              ...state.savedSourceByQuestion,
              [action.questionId]: action.sourceCode,
            },
            responseExistsByQuestion: {
              ...state.responseExistsByQuestion,
              [action.questionId]: true,
            },
          }
          : {
            savedByQuestion: {
              ...state.savedByQuestion,
              [action.questionId]: action.selectedChoiceId,
            },
            responseExistsByQuestion: {
              ...state.responseExistsByQuestion,
              [action.questionId]: true,
            },
          }),
        saveStateByQuestion: {
          ...state.saveStateByQuestion,
          [action.questionId]: {
            status: "clean",
            revision: action.revision,
            error: null,
          },
        },
      };
    }
    case "SAVE_FAILED": {
      if (!saveActionMatches(state, action)) return state;
      return {
        ...state,
        saveStateByQuestion: {
          ...state.saveStateByQuestion,
          [action.questionId]: {
            status: "error",
            revision: action.revision,
            error: action.error,
          },
        },
      };
    }
    case "SAVE_CONFLICTED": {
      if (!saveActionMatches(state, action)) return state;
      return {
        ...state,
        saveStateByQuestion: {
          ...state.saveStateByQuestion,
          [action.questionId]: {
            status: "conflict",
            revision: action.revision,
            error: action.error,
          },
        },
      };
    }
    case "CODING_RUN_STARTED":
      return {
        ...state,
        codingRunByQuestion: {
          ...state.codingRunByQuestion,
          [action.questionId]: { status: "running", result: null, message: null },
        },
      };
    case "CODING_RUN_SUCCEEDED":
      return {
        ...state,
        codingRunByQuestion: {
          ...state.codingRunByQuestion,
          [action.questionId]: { status: "succeeded", result: action.result, message: null },
        },
      };
    case "CODING_RUN_FAILED":
      return {
        ...state,
        codingRunByQuestion: {
          ...state.codingRunByQuestion,
          [action.questionId]: { status: "error", result: null, message: action.message },
        },
      };
    case "SUBMIT_REVIEW_OPENED":
      return { ...state, submitReviewOpen: true };
    case "SUBMIT_REVIEW_CLOSED":
      return { ...state, submitReviewOpen: false };
    case "SUBMIT_STARTED":
      return { ...state, submitReviewOpen: false, submitStatus: "submitting", error: null };
    case "SUBMIT_GRADING_STARTED":
      return {
        ...state,
        submitReviewOpen: false,
        submitStatus: "grading",
        attempt: state.attempt ? { ...state.attempt, status: "GRADING" } : state.attempt,
        error: null,
      };
    case "SUBMIT_GRADING_PENDING":
      return { ...state, submitReviewOpen: false, submitStatus: "grading-pending", error: null };
    case "SUBMIT_GRADING_POLL_FAILED":
      return {
        ...state,
        submitReviewOpen: false,
        submitStatus: "grading-error",
        error: action.error,
      };
    case "SUBMIT_GRADING_RELEASED":
      return {
        ...state,
        submitReviewOpen: false,
        submitStatus: "error",
        attempt: state.attempt ? { ...state.attempt, status: "IN_PROGRESS" } : state.attempt,
        error: action.error,
      };
    case "SUBMIT_RECOVERY_STARTED":
      return {
        ...state,
        submitReviewOpen: false,
        submitStatus: "recovering-result",
        error: null,
      };
    case "SUBMIT_SUCCEEDED":
      return {
        ...state,
        screen: "result",
        submitReviewOpen: false,
        submitStatus: "succeeded",
        result: action.payload,
        progression: null,
        progressionError: null,
        externalSyncRequired: false,
        externalSyncStatus: "idle",
        externalSyncError: null,
        error: null,
      };
    case "SUBMIT_FAILED":
      return { ...state, submitStatus: "error", error: action.error };
    case "SUBMIT_RECOVERY_FAILED":
      return {
        ...state,
        submitReviewOpen: false,
        submitStatus: "recovery-error",
        error: action.error,
      };
    case "RESULT_LOADED":
      return {
        ...state,
        screen: "result",
        result: action.payload,
        progressionError: null,
        externalSyncRequired: false,
        externalSyncStatus: "idle",
        externalSyncError: null,
        error: null,
      };
    case "SERVER_STATE_INVALIDATED":
      return {
        ...state,
        submitReviewOpen: false,
        externalSyncRequired: true,
        externalSyncStatus: "required",
        externalSyncError: null,
      };
    case "SERVER_SYNC_STARTED":
      return {
        ...state,
        submitReviewOpen: false,
        externalSyncStatus: "checking",
        externalSyncError: null,
      };
    case "SERVER_SYNC_FAILED":
      return {
        ...state,
        externalSyncStatus: state.externalSyncRequired ? "required" : "error",
        externalSyncError: action.error,
      };
    case "PROGRESSION_REFRESHED":
      return { ...state, progression: action.payload, progressionError: null };
    case "PROGRESSION_REFRESH_FAILED":
      return { ...state, progressionError: action.error };
    case "RETAKE_STARTED":
      return { ...state, retakeStatus: "starting", retakeError: null };
    case "RETAKE_FAILED":
      return { ...state, retakeStatus: "error", retakeError: action.error };
    default:
      return state;
  }
};

export const getCurrentQuestion = (state) => (
  state.orderedQuestions[state.currentQuestionIndex] ?? null
);

export const getAttemptControllerIdentity = (state) => {
  if (!state?.attempt?.attemptId || !state.routeKey) return null;
  return `${state.routeKey}:${state.requestGeneration}:${state.attempt.attemptId}`
    + `:${state.attemptLoadVersion}`;
};

export const getAnswerSummary = (state) => {
  const unansweredQuestionIds = state.orderedQuestions
    .filter((question) => {
      if (question.questionType === "CODING") {
        return state.responseExistsByQuestion[question.id] !== true
          || typeof state.savedSourceByQuestion[question.id] !== "string"
          || state.savedSourceByQuestion[question.id].trim().length === 0;
      }
      return state.selectedByQuestion[question.id] === undefined
        || state.selectedByQuestion[question.id] === null;
    })
    .map(({ id }) => id);
  return {
    total: state.orderedQuestions.length,
    answered: state.orderedQuestions.length - unansweredQuestionIds.length,
    unansweredQuestionIds,
  };
};

export const getSubmissionReadiness = (state) => {
  const dirtyQuestionIds = [];
  const savingQuestionIds = [];
  const failedQuestionIds = [];

  for (const question of state.orderedQuestions) {
    const questionId = question.id;
    const dirty = question.questionType === "CODING"
      ? state.sourceByQuestion[questionId] !== state.savedSourceByQuestion[questionId]
        || state.responseExistsByQuestion[questionId] !== true
      : state.selectedByQuestion[questionId] !== state.savedByQuestion[questionId];
    if (dirty) {
      dirtyQuestionIds.push(questionId);
    }
    const saveState = state.saveStateByQuestion[questionId];
    if (saveState?.status === "saving") savingQuestionIds.push(questionId);
    if (saveState?.status === "error" || saveState?.status === "conflict") {
      failedQuestionIds.push(questionId);
    }
  }

  return {
    ready: dirtyQuestionIds.length === 0
      && savingQuestionIds.length === 0
      && failedQuestionIds.length === 0,
    dirtyQuestionIds,
    savingQuestionIds,
    failedQuestionIds,
  };
};
