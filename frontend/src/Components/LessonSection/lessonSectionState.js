import {
  buildMapHref,
  createLessonAssessmentAccessViewModel,
  createLessonProgressionViewModel,
} from "../../utils/lessonProgressionNavigation.js";

const BLOCKED_ACTIONS = new Set([
  "COMPLETE_PREREQUISITE_LESSON",
  "POST_RECOVERY_REQUIRED",
]);

const ROW_OPTIONAL_ACTIONS = new Set([
  "TAKE_PRE",
  "RESUME_PRE",
  "TAKE_POST",
  "RESUME_POST",
  "RETRY_POST",
  ...BLOCKED_ACTIONS,
]);

const UNLOCK_HINTS = Object.freeze({
  TAKE_PRE: "Complete the Pre-Test to unlock this module.",
  RESUME_PRE: "Finish the Pre-Test to unlock this module.",
  COMPLETE_PREREQUISITE_LESSON: "Complete the previous lesson to unlock this module.",
});

const positiveId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const clampProgress = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const hasRequiredEligibility = (lesson) => (
  typeof lesson?.moduleUnlocked === "boolean"
  && typeof lesson?.gameUnlocked === "boolean"
  && typeof lesson?.lessonCompleted === "boolean"
  && typeof lesson?.nextAction === "string"
);

const hasStarted = (lesson) => [
  "gameStarted",
  "preAttemptInProgress",
  "preCompleted",
  "postAttemptInProgress",
  "postCompleted",
].some((field) => lesson?.[field] === true);

const visualStateFor = (lesson, assessmentModel) => {
  if (!hasRequiredEligibility(lesson)) {
    return {
      status: "blocked",
      statusLabel: "Unavailable",
      availabilityMessage: "Availability could not be confirmed.",
    };
  }
  if (lesson.lessonCompleted === true) {
    return { status: "completed", statusLabel: "Completed", availabilityMessage: null };
  }
  if (BLOCKED_ACTIONS.has(lesson.nextAction)) {
    return {
      status: "blocked",
      statusLabel: "Blocked",
      availabilityMessage: lesson.nextAction === "POST_RECOVERY_REQUIRED"
        ? "Post-Test attempts are exhausted. Contact your teacher."
        : UNLOCK_HINTS[lesson.nextAction],
    };
  }
  if (hasStarted(lesson)) {
    return { status: "active", statusLabel: "In progress", availabilityMessage: null };
  }
  if (lesson.moduleUnlocked === true
    || lesson.gameUnlocked === true
    || assessmentModel.rows.some((row) => row.action?.href)) {
    return { status: "available", statusLabel: "Available", availabilityMessage: null };
  }
  return {
    status: "blocked",
    statusLabel: "Blocked",
    availabilityMessage: UNLOCK_HINTS[lesson.nextAction] ?? "Complete the required lesson step to continue.",
  };
};

export const buildLessonCards = ({ lessonMeta = [], progressLessons = [], classroomId = null }) => {
  const metaByKey = new Map(lessonMeta.map((item) => [item.lessonKey, item]));
  return progressLessons
    .filter((lesson) => typeof lesson?.lessonKey === "string" && lesson.lessonKey.trim())
    .map((lesson) => {
      const lessonKey = lesson.lessonKey.trim();
      const meta = metaByKey.get(lessonKey);
      const title = lesson.lessonTitle ?? meta?.fallbackTitle ?? lessonKey;
      const assessmentModel = createLessonAssessmentAccessViewModel({ lesson, classroomId });
      const visualState = visualStateFor(lesson, assessmentModel);
      return {
        id: lessonKey,
        lessonKey,
        title,
        region: meta?.region ?? title,
        description: meta?.description ?? `Complete all activities in ${title}.`,
        progress: Number(lesson.totalLevels) === 0 ? null : clampProgress(lesson.progressPercent),
        route: meta?.route ?? `/lesson/built-in/${encodeURIComponent(lessonKey)}`,
        canOpenModule: lesson.moduleUnlocked === true,
        canOpenGame: lesson.gameUnlocked === true,
        unlockHint: lesson.moduleUnlocked === false ? UNLOCK_HINTS[lesson.nextAction] ?? null : null,
        assessmentModel,
        progression: lesson,
        ...visualState,
      };
    });
};

export const initialLessonProgressionState = Object.freeze({
  generation: 0,
  status: "idle",
  classroomId: null,
  progress: null,
  error: null,
});

export const lessonProgressionReducer = (state, action) => {
  if (action.type === "load-started") {
    if (action.generation < state.generation) return state;
    return {
      generation: action.generation,
      status: "loading",
      classroomId: null,
      progress: null,
      error: null,
    };
  }
  if (action.generation !== state.generation) return state;
  if (action.type === "load-succeeded") {
    return {
      ...state,
      status: "ready",
      classroomId: positiveId(action.classroomId),
      progress: action.progress,
      error: null,
    };
  }
  if (action.type === "load-unenrolled") {
    return { ...state, status: "unenrolled", classroomId: null, progress: null, error: null };
  }
  if (action.type === "load-failed") {
    return {
      ...state,
      status: "error",
      classroomId: positiveId(action.classroomId),
      progress: null,
      error: action.error ?? "Learning progress could not be loaded.",
    };
  }
  return state;
};

const unavailable = (description) => ({
  kind: "error",
  title: "Learning progress unavailable",
  description,
  action: null,
  canRetry: true,
});

export const createLessonNextStepViewModel = (state) => {
  if (state?.status === "idle" || state?.status === "loading") {
    return {
      kind: "loading",
      title: "Finding your next lesson step",
      description: "Checking your classroom progress…",
      action: null,
      canRetry: false,
    };
  }
  if (state?.status === "error") return unavailable(state.error);
  if (state?.status === "unenrolled") {
    return {
      kind: "unenrolled",
      title: "Join a classroom to begin",
      description: "Your classroom connects you to lessons and assessments.",
      action: { kind: "enroll", label: "Join a classroom", href: "/join-class", disabled: false },
      canRetry: false,
    };
  }
  if (state?.status !== "ready") return unavailable("Learning progress could not be confirmed.");

  const classroomId = positiveId(state.classroomId);
  const progressClassroomId = positiveId(state.progress?.classroomId);
  if (!classroomId || progressClassroomId !== classroomId) {
    return unavailable("The progress response did not match your current classroom. Try again.");
  }
  const lessons = Array.isArray(state.progress?.lessons) ? state.progress.lessons : null;
  if (!lessons) return unavailable("The progress response was incomplete. Try again.");
  const summary = state.progress?.summary;
  if (summary?.totalLevels === 0
    && summary.nextAction === "LESSON_COMPLETE"
    && summary.nextActionLessonKey == null) {
    return {
      kind: "empty",
      title: "No curriculum is available yet",
      description: "Your classroom does not currently have built-in lesson progression.",
      action: null,
      canRetry: false,
    };
  }
  if (summary?.nextAction === "LESSON_COMPLETE" && summary.nextActionLessonKey == null) {
    return {
      kind: "completed",
      title: "Built-in curriculum complete",
      description: "You can review completed modules or revisit the lesson map.",
      action: { kind: "map", label: "View lesson map", href: buildMapHref(classroomId), disabled: false },
      canRetry: false,
    };
  }

  const lessonKey = typeof summary?.nextActionLessonKey === "string"
    ? summary.nextActionLessonKey.trim()
    : "";
  const detailedLesson = lessons.find((item) => item?.lessonKey === lessonKey);
  if (!lessonKey
    || (detailedLesson && detailedLesson.nextAction !== summary?.nextAction)
    || (!detailedLesson && !ROW_OPTIONAL_ACTIONS.has(summary?.nextAction))
    || (detailedLesson && !hasRequiredEligibility(detailedLesson))) {
    return unavailable("Your next lesson step could not be confirmed. Try again.");
  }
  const lesson = detailedLesson ?? { lessonKey, nextAction: summary.nextAction };

  const model = createLessonProgressionViewModel({
    lesson,
    classroomId,
    gameHref: buildMapHref(classroomId),
  });
  const blocked = model.action.disabled === true || model.action.kind === "blocked";
  return {
    kind: blocked ? "blocked" : "ready",
    title: lesson.lessonTitle ?? lessonKey,
    description: blocked
      ? "Complete the required lesson step before continuing."
      : "Continue from the point your classroom progress allows.",
    action: model.action,
    canRetry: false,
  };
};
