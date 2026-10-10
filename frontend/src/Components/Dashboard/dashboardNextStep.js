import {
  buildMapHref,
  createLessonProgressionViewModel,
} from "../../utils/lessonProgressionNavigation.js";

const SUPPORTED_ACTIONS = new Set([
  "TAKE_PRE",
  "RESUME_PRE",
  "PLAY_GAME",
  "TAKE_POST",
  "RESUME_POST",
  "RETRY_POST",
  "POST_RECOVERY_REQUIRED",
  "COMPLETE_PREREQUISITE_LESSON",
  "LESSON_COMPLETE",
]);

const positiveId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

export const initialDashboardProgressionState = {
  generation: 0,
  status: "idle",
  classroom: null,
  progress: null,
  error: null,
};

export const dashboardProgressionReducer = (state, action) => {
  if (action.type === "load-started") {
    if (action.generation < state.generation) return state;
    return {
      generation: action.generation,
      status: "loading",
      classroom: null,
      progress: null,
      error: null,
    };
  }

  if (action.generation !== state.generation) return state;
  switch (action.type) {
    case "load-succeeded":
      return {
        ...state,
        status: "ready",
        classroom: action.classroom,
        progress: action.progress,
        error: null,
      };
    case "load-unenrolled":
      return {
        ...state,
        status: "unenrolled",
        classroom: null,
        progress: null,
        error: null,
      };
    case "load-failed":
      return {
        ...state,
        status: "error",
        classroom: action.classroom ?? null,
        progress: null,
        error: action.error ?? "Progress could not be loaded",
      };
    default:
      return state;
  }
};

const retryableError = (message = "We couldn't load your learning progress.") => ({
  kind: "error",
  eyebrow: "Next step",
  title: "Progress unavailable",
  description: message,
  action: null,
  secondaryAction: null,
  canRetry: true,
});

const hasStartedLesson = (lesson) => [
  "gameStarted",
  "gameCompleted",
  "preAttemptInProgress",
  "preCompleted",
  "postAttemptInProgress",
  "postCompleted",
  "lessonCompleted",
].some((field) => lesson?.[field] === true);

const validatedReadyProgression = (state) => {
  const classroomId = positiveId(state.classroom?.id);
  if (!classroomId || positiveId(state.progress?.classroomId) !== classroomId) return null;

  const summary = state.progress?.summary;
  const nextAction = summary?.nextAction;
  if (!SUPPORTED_ACTIONS.has(nextAction)) return null;
  if (nextAction === "LESSON_COMPLETE" && summary.nextActionLessonKey == null) {
    return { classroomId, summary, lesson: null };
  }

  const lessonKey = typeof summary?.nextActionLessonKey === "string"
    ? summary.nextActionLessonKey.trim()
    : "";
  const lesson = lessonKey
    ? state.progress?.lessons?.find((candidate) => candidate?.lessonKey === lessonKey)
    : null;
  if (lesson && lesson.nextAction !== nextAction) return null;
  if (!lesson) {
    if (!lessonKey || nextAction === "PLAY_GAME") return null;
    return {
      classroomId,
      summary,
      lesson: { lessonKey, nextAction },
      hasLessonDetail: false,
    };
  }
  return { classroomId, summary, lesson, hasLessonDetail: true };
};

export const createDashboardNextStepViewModel = (state) => {
  if (state?.status === "idle" || state?.status === "loading") {
    return {
      kind: "loading",
      eyebrow: "Next step",
      title: "Finding your next activity",
      description: "Checking your classroom progress…",
      action: null,
      secondaryAction: null,
      canRetry: false,
    };
  }
  if (state?.status === "error") return retryableError(state.error);
  if (state?.status === "unenrolled") {
    return {
      kind: "unenrolled",
      eyebrow: "Next step",
      title: "Join a classroom to begin",
      description: "Your teacher's classroom connects you to lessons and assessments.",
      action: {
        label: "Join a classroom",
        href: "/join-class",
        disabled: false,
        kind: "enroll",
      },
      secondaryAction: null,
      canRetry: false,
    };
  }
  if (state?.status !== "ready") return retryableError();

  const validated = validatedReadyProgression(state);
  if (!validated) return retryableError("Your progress response was incomplete. Try loading it again.");
  const { classroomId, summary, lesson, hasLessonDetail } = validated;
  const mapAction = {
    kind: "map",
    label: "View map",
    href: buildMapHref(classroomId),
    disabled: false,
  };

  if (!lesson) {
    return {
      kind: "completed",
      eyebrow: "Learning path complete",
      title: "You completed every available lesson",
      description: "Review your route and results on the lesson map.",
      action: mapAction,
      secondaryAction: null,
      canRetry: false,
    };
  }

  const progressionModel = createLessonProgressionViewModel({ lesson, classroomId });
  const action = progressionModel.action;
  const isBlocked = action.disabled || action.kind === "blocked";
  const isUnstartedAction = ["TAKE_PRE", "PLAY_GAME"].includes(lesson.nextAction);
  const isNew = isUnstartedAction
    && Number(summary.totalLevelsCleared) === 0
    && !state.progress.lessons.some(hasStartedLesson);
  const lessonName = lesson.lessonTitle
    || (action.kind === "assessment" ? "Your next assessment" : "Your next lesson");
  const recoveryRequired = lesson.nextAction === "POST_RECOVERY_REQUIRED";

  return {
    kind: isBlocked ? "blocked" : isNew ? "new" : "ready",
    eyebrow: isNew ? "Start here" : "Next step",
    title: isBlocked ? "Your next lesson is currently blocked" : lessonName,
    description: recoveryRequired
      ? "You have used all Post-Test attempts. Contact your teacher for help continuing."
      : isBlocked
        ? "Open the map to review what must be completed first."
        : hasLessonDetail === false
          ? "Continue from the assessment selected by your classroom progress."
          : `Continue ${lessonName} from the point your classroom progress allows.`,
    action,
    secondaryAction: action.href === mapAction.href ? null : mapAction,
    canRetry: false,
  };
};

export const fulfilledDashboardSections = (results) => {
  const patch = {};
  if (results.leaderboard?.status === "fulfilled") {
    patch.leaderboard = results.leaderboard.value.data?.leaderboard ?? [];
    patch.leaderboardMeta = {
      classSize: results.leaderboard.value.data?.classSize ?? null,
      currentUserRank: results.leaderboard.value.data?.currentUserRank ?? null,
    };
  }
  if (results.announcements?.status === "fulfilled") {
    patch.announcements = results.announcements.value.data?.announcements ?? [];
  }
  if (results.notifications?.status === "fulfilled") {
    patch.notifications = results.notifications.value.data?.notifications ?? [];
  }
  if (results.profile?.status === "fulfilled") {
    patch.profile = results.profile.value.data?.user ?? null;
  }
  return patch;
};
