import {
  createLevelEntryViewModel,
  createLessonProgressionViewModel,
  withExactClassroom,
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

const REGION_LESSON_KEYS = Object.freeze({
  tutorial: ["tutorial"],
  arrays: ["arrays"],
  functions: ["functions"],
  "functions-arrays": ["functions-with-arrays", "final"],
});
const CANONICAL_LESSON_KEYS = Object.freeze(
  Object.values(REGION_LESSON_KEYS).flat(),
);

const positiveId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const nonNegativeInteger = (value) => {
  if (value == null || typeof value === "boolean" || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

const boundedPercentage = (value) => {
  if (value == null || typeof value === "boolean" || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
    ? Math.round(parsed)
    : null;
};

const unavailableRegion = () => ({
  completedCount: null,
  totalCount: null,
  progressPercent: null,
  countText: "Progress unavailable",
  percentageText: "—",
  availability: "unknown",
  hasApplicableActivities: false,
});

const lessonMetric = (lesson) => {
  if (!lesson) return null;
  const totalCount = nonNegativeInteger(lesson.totalLevels);
  const completedCount = nonNegativeInteger(
    lesson.completedLevels ?? lesson.levelsCleared,
  );
  if (totalCount == null || completedCount == null || completedCount > totalCount) return null;
  const progressPercent = totalCount === 0 ? null : boundedPercentage(lesson.progressPercent);
  if (totalCount > 0 && progressPercent == null) return null;
  return { totalCount, completedCount, progressPercent };
};

const availabilityFor = (lessons) => {
  if (lessons.some((lesson) => lesson?.gameUnlocked === true)) return "available";
  if (lessons.every((lesson) => lesson?.gameUnlocked === false)) return "locked";
  return "unknown";
};

const createRegionMetric = (lessons) => {
  const metrics = lessons.map(lessonMetric);
  if (metrics.some((metric) => metric == null)) return unavailableRegion();

  const totalCount = metrics.reduce((total, metric) => total + metric.totalCount, 0);
  const completedCount = metrics.reduce((total, metric) => total + metric.completedCount, 0);
  const availability = availabilityFor(lessons);
  if (totalCount === 0) {
    return {
      completedCount: 0,
      totalCount: 0,
      progressPercent: null,
      countText: "No assigned game activities",
      percentageText: "—",
      availability,
      hasApplicableActivities: false,
    };
  }

  const weightedProgress = metrics.reduce(
    (total, metric) => total + metric.progressPercent * metric.totalCount,
    0,
  );
  const progressPercent = Math.round(weightedProgress / totalCount);
  const noun = totalCount === 1 ? "activity" : "activities";
  return {
    completedCount,
    totalCount,
    progressPercent,
    countText: `${completedCount} of ${totalCount} game ${noun} completed`,
    percentageText: `${progressPercent}%`,
    availability,
    hasApplicableActivities: true,
  };
};

const buildGameHref = (level, classroomId) => {
  const levelNumber = nonNegativeInteger(level?.levelNumber);
  if (!levelNumber || !positiveId(classroomId)) return null;
  switch (level.lessonKey) {
    case "tutorial":
      return withExactClassroom(`/tutorial/level/${levelNumber}`, classroomId);
    case "arrays":
      return withExactClassroom(`/array/level/${levelNumber}`, classroomId);
    case "functions":
      return withExactClassroom(`/function/level/${levelNumber}`, classroomId);
    case "functions-with-arrays":
      return withExactClassroom(`/function-with-array/level/${levelNumber}`, classroomId);
    case "final":
      return levelNumber === 1
        ? withExactClassroom("/function-with-array/level/5", classroomId)
        : null;
    default:
      return null;
  }
};

const validLevel = (level) => (
  level
  && typeof level.levelKey === "string"
  && typeof level.lessonKey === "string"
  && nonNegativeInteger(level.levelNumber) > 0
  && typeof level.isAccessible === "boolean"
  && typeof level.isCompleted === "boolean"
);

const hasRequiredLessonEligibility = (lesson) => (
  typeof lesson?.moduleUnlocked === "boolean"
  && typeof lesson?.gameUnlocked === "boolean"
  && typeof lesson?.gameStarted === "boolean"
  && typeof lesson?.lessonCompleted === "boolean"
  && typeof lesson?.nextAction === "string"
);

const hasCompleteCanonicalProjection = (lessons, summary) => {
  const totalLevels = nonNegativeInteger(summary?.totalLevels);
  const clearedLevels = nonNegativeInteger(
    summary?.totalLevelsCleared ?? summary?.completedLevels,
  );
  if (totalLevels == null || clearedLevels !== totalLevels) return false;

  const lessonsByKey = new Map(
    lessons.map((lesson) => [lesson?.lessonKey, lesson]),
  );
  const canonicalLessons = CANONICAL_LESSON_KEYS.map((lessonKey) => lessonsByKey.get(lessonKey));
  if (canonicalLessons.some((lesson) => (
    !hasRequiredLessonEligibility(lesson)
    || lesson.lessonCompleted !== true
    || lesson.nextAction !== "LESSON_COMPLETE"
    || lessonMetric(lesson) == null
  ))) return false;

  const projectedTotal = canonicalLessons.reduce(
    (total, lesson) => total + lessonMetric(lesson).totalCount,
    0,
  );
  return projectedTotal === totalLevels;
};

const unavailableNextStep = (description) => ({
  kind: "unavailable",
  title: "Next step unavailable",
  description,
  lessonKey: null,
  progression: null,
  action: null,
  canRetry: true,
});

const createNextStep = ({ classroomId, levels, lessons, summary }) => {
  if (!summary || !SUPPORTED_ACTIONS.has(summary.nextAction)) {
    return unavailableNextStep("Your classroom progress response was incomplete. Try again.");
  }
  if (summary.nextAction === "LESSON_COMPLETE") {
    if (summary.nextActionLessonKey != null || !hasCompleteCanonicalProjection(lessons, summary)) {
      return unavailableNextStep("Your classroom progress response did not agree on the next lesson.");
    }
    return {
      kind: "completed",
      title: "Curriculum complete",
      description: "You completed every available lesson activity.",
      lessonKey: null,
      progression: null,
      action: null,
      canRetry: false,
    };
  }

  const lessonKey = typeof summary.nextActionLessonKey === "string"
    ? summary.nextActionLessonKey.trim()
    : "";
  const matchingLesson = lessons.find((lesson) => lesson?.lessonKey === lessonKey);
  if (!lessonKey
    || !matchingLesson
    || matchingLesson.nextAction !== summary.nextAction
    || !hasRequiredLessonEligibility(matchingLesson)) {
    return unavailableNextStep("Your classroom progress response did not agree on the next lesson.");
  }

  let gameHref = null;
  if (matchingLesson.nextAction === "PLAY_GAME" && matchingLesson.gameStarted === true) {
    const nextLevel = levels.find((candidate) => (
      candidate?.lessonKey === lessonKey
      && candidate.isCompleted !== true
      && candidate.isAccessible === true
    ));
    gameHref = buildGameHref(nextLevel, classroomId);
    if (!gameHref) {
      return unavailableNextStep("The next game activity could not be confirmed. Try again.");
    }
  }

  const progression = createLessonProgressionViewModel({
    lesson: matchingLesson,
    classroomId,
    gameHref,
  });
  const action = progression.action;
  const blocked = action.disabled === true || action.kind === "blocked";
  return {
    kind: blocked ? "blocked" : "ready",
    title: matchingLesson.lessonTitle ?? "Your next lesson step",
    description: blocked
      ? "Complete the required lesson step before continuing."
      : "Continue from the point your classroom progress allows.",
    lessonKey,
    progression,
    action,
    canRetry: false,
  };
};

export const initialMapProgressState = Object.freeze({
  generation: 0,
  requestKey: null,
  status: "idle",
  progress: null,
  error: null,
  canRetry: false,
});

export const mapProgressReducer = (state, action) => {
  if (action.type === "load-started") {
    if (action.generation < state.generation) return state;
    return {
      generation: action.generation,
      requestKey: action.requestKey,
      status: "loading",
      progress: null,
      error: null,
      canRetry: false,
    };
  }
  if (action.generation !== state.generation || action.requestKey !== state.requestKey) {
    return state;
  }
  if (action.type === "load-succeeded") {
    return { ...state, status: "ready", progress: action.progress, error: null, canRetry: false };
  }
  if (action.type === "load-unenrolled") {
    return { ...state, status: "unenrolled", progress: null, error: null, canRetry: false };
  }
  if (action.type === "load-failed") {
    return {
      ...state,
      status: "error",
      progress: null,
      error: action.error ?? "Progress could not be loaded.",
      canRetry: true,
    };
  }
  return state;
};

export const createLessonMapViewModel = (progress, { selectedRegion = null } = {}) => {
  const classroomId = positiveId(progress?.classroomId);
  const levels = Array.isArray(progress?.levels) ? progress.levels : null;
  const lessons = Array.isArray(progress?.lessons) ? progress.lessons : null;
  const validResponse = classroomId != null && levels != null && lessons != null;
  const lessonsByKey = new Map(
    (lessons ?? []).filter((item) => typeof item?.lessonKey === "string")
      .map((item) => [item.lessonKey, item]),
  );
  const regions = Object.fromEntries(
    Object.entries(REGION_LESSON_KEYS).map(([regionKey, lessonKeys]) => [
      regionKey,
      createRegionMetric(lessonKeys.map((lessonKey) => lessonsByKey.get(lessonKey))),
    ]),
  );

  if (!validResponse) {
    return {
      status: "unavailable",
      classroomId,
      selectedRegion,
      regions,
      levelsByKey: new Map(),
      hasValidLevels: false,
      nextStep: unavailableNextStep("Learning progress could not be confirmed. Try again."),
    };
  }

  const levelsByKey = new Map(
    levels.filter((item) => typeof item?.levelKey === "string")
      .map((item) => [item.levelKey, item]),
  );
  const assignmentKnownLessonKeys = new Set(
    CANONICAL_LESSON_KEYS.filter((lessonKey) => {
      const metric = lessonMetric(lessonsByKey.get(lessonKey));
      if (!metric) return false;
      const projectedLevels = levels.filter((level) => level?.lessonKey === lessonKey);
      return projectedLevels.length === metric.totalCount
        && new Set(projectedLevels.map((level) => level.levelKey)).size === metric.totalCount
        && projectedLevels.every(validLevel);
    }),
  );
  const nextStep = createNextStep({ classroomId, levels, lessons, summary: progress.summary });
  const totalLevels = nonNegativeInteger(progress.summary?.totalLevels);
  const summaryUnavailable = totalLevels == null;
  const status = nextStep.kind === "unavailable" || summaryUnavailable
    ? "unavailable"
    : totalLevels === 0 && nextStep.kind === "completed"
      ? "empty"
      : nextStep.kind === "completed"
        ? "completed"
        : nextStep.kind === "blocked"
          ? "blocked"
          : "ready";

  return {
    status,
    classroomId,
    selectedRegion,
    regions,
    levelsByKey,
    assignmentKnownLessonKeys,
    hasValidLevels: true,
    nextStep: summaryUnavailable
      ? unavailableNextStep("The curriculum totals could not be confirmed. Try again.")
      : nextStep,
  };
};

export const createMapLevelEntry = (model, levelKey, gameHref) => {
  if (!model?.hasValidLevels || model.status === "unavailable") {
    return {
      kind: "unavailable",
      href: null,
      label: "Availability unavailable",
      routable: false,
      visualStatus: "unavailable",
      completed: false,
      disabled: true,
    };
  }
  const level = model.levelsByKey.get(levelKey);
  if (!level) {
    const lessonKey = typeof levelKey === "string"
      ? levelKey.match(/^(.*)-level-\d+$/)?.[1]
      : null;
    if (!lessonKey || !model.assignmentKnownLessonKeys.has(lessonKey)) {
      return {
        kind: "unavailable",
        href: null,
        label: "Availability unavailable",
        routable: false,
        visualStatus: "unavailable",
        completed: false,
        disabled: true,
      };
    }
    return {
      kind: "unassigned",
      href: null,
      label: "Not assigned",
      routable: false,
      visualStatus: "unassigned",
      completed: false,
      disabled: true,
    };
  }
  if (!validLevel(level)) {
    return {
      kind: "unavailable",
      href: null,
      label: "Availability unavailable",
      routable: false,
      visualStatus: "unavailable",
      completed: false,
      disabled: true,
    };
  }
  return createLevelEntryViewModel({ classroomId: model.classroomId, level, gameHref });
};

export const isConfirmedUnenrolled = (error, requestedClassroomId) => (
  requestedClassroomId == null
  && Number(error?.status) === 403
  && error?.code === "FORBIDDEN"
);
