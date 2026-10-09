const positiveId = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

const MODULE_UNLOCK_HINTS = Object.freeze({
  TAKE_PRE: "Complete the Pre-Test to unlock this module.",
  RESUME_PRE: "Finish the Pre-Test to unlock this module.",
  COMPLETE_PREREQUISITE_LESSON: "Complete the previous lesson to unlock this module.",
});

export const getLessonModuleAccess = (lesson) => {
  const canOpenModule = lesson?.moduleUnlocked !== false;
  return {
    canOpenModule,
    unlockHint: canOpenModule ? null : MODULE_UNLOCK_HINTS[lesson?.nextAction] ?? null,
  };
};

export const loadExactProgress = async ({ requestedClassroomId, getProgress, resolvePrimary, signal }) => {
  const hasExplicitClassroom = requestedClassroomId != null;
  const classroomId = hasExplicitClassroom
    ? positiveId(requestedClassroomId)
    : positiveId(await resolvePrimary({ signal }));
  if (!classroomId) throw new Error("Invalid classroom");
  const progress = await getProgress({ classroomId, signal });
  if (positiveId(progress?.classroomId) !== classroomId) throw new Error("Progress classroom mismatch");
  return progress;
};

const segment = (value) => encodeURIComponent(String(value ?? ""));

export const withExactClassroom = (path, classroomId) => {
  const id = positiveId(classroomId);
  if (!id) return path;
  return `${path}${path.includes("?") ? "&" : "?"}classroomId=${segment(id)}`;
};

export const buildMapHref = (classroomId) => withExactClassroom("/Map", classroomId);

export const buildModuleHref = (classroomId, lessonKey) => withExactClassroom(
  `/lesson/built-in/${segment(lessonKey)}`,
  classroomId,
);

export const buildAssessmentHref = ({ classroomId, lessonKey, type }) => (
  `/classrooms/${segment(positiveId(classroomId))}`
  + `/lessons/${segment(lessonKey)}/assessment/${segment(String(type).toLowerCase())}`
);

export const buildAssessmentResultHref = ({ classroomId, lessonKey, type, attemptId }) => (
  `${buildAssessmentHref({ classroomId, lessonKey, type })}/results/${segment(positiveId(attemptId))}`
);

export const buildAssessmentPageHref = ({ route, screen, resultAttemptId }) => {
  if (!route || !["active", "result"].includes(screen)) return null;
  if (screen === "active") return buildAssessmentHref(route);
  if (!positiveId(resultAttemptId)) return null;
  return buildAssessmentResultHref({ ...route, attemptId: resultAttemptId });
};

const LEVEL_ASSESSMENT_LESSONS = new Set([
  "arrays",
  "functions",
  "functions-with-arrays",
]);
const LEVEL_ASSESSMENT_ACTIONS = Object.freeze({
  TAKE_PRE: { type: "PRE", label: "Take Pre-Test" },
  RESUME_PRE: { type: "PRE", label: "Continue Pre-Test" },
  TAKE_POST: { type: "POST", label: "Take Post-Test" },
  RESUME_POST: { type: "POST", label: "Continue Post-Test" },
  RETRY_POST: { type: "POST", label: "Retry Post-Test" },
});

export const isLevelAssessmentRestriction = (payload) => {
  if (!payload || typeof payload !== "object") return false;
  const reason = payload.code ?? payload.accessReason;
  return payload.assessmentRequired === true
    || [
      "ASSESSMENT_STATE_INVALID",
      "PRE_ASSESSMENT_REQUIRED",
      "POST_ASSESSMENT_REQUIRED",
    ].includes(reason);
};

export const resolveLevelAssessmentAction = ({ classroomId, level } = {}) => {
  const resolvedClassroomId = positiveId(classroomId);
  const assessmentId = positiveId(level?.assessmentId);
  if (!resolvedClassroomId
    || level?.assessmentRequired !== true
    || !LEVEL_ASSESSMENT_LESSONS.has(level?.lessonKey)
    || !assessmentId) return null;

  if (level.assessmentAction === "POST_RECOVERY_REQUIRED") {
    if (level.assessmentType !== "POST") return null;
    return {
      kind: "recovery",
      href: null,
      label: "Post-Test attempts exhausted — contact your teacher",
      routable: false,
    };
  }

  const action = LEVEL_ASSESSMENT_ACTIONS[level.assessmentAction];
  if (!action || level.assessmentType !== action.type) return null;
  return {
    kind: "assessment",
    href: buildAssessmentHref({
      classroomId: resolvedClassroomId,
      lessonKey: level.lessonKey,
      type: action.type,
    }),
    label: action.label,
    routable: true,
  };
};

export const createLevelEntryViewModel = ({ classroomId, level, gameHref } = {}) => {
  const completed = level?.isCompleted === true;
  const assessment = resolveLevelAssessmentAction({ classroomId, level });
  if (assessment) {
    return {
      ...assessment,
      visualStatus: assessment.routable ? "assessment-required" : "assessment-recovery",
      completed,
      disabled: !assessment.routable,
    };
  }

  const malformedAssessment = level?.accessReason === "ASSESSMENT_STATE_INVALID"
    || level?.assessmentRequired === true
    || ["PRE_ASSESSMENT_REQUIRED", "POST_ASSESSMENT_REQUIRED"].includes(level?.accessReason);
  if (malformedAssessment) {
    return {
      kind: "invalid",
      href: null,
      label: "Level access changed — return to the map",
      routable: false,
      visualStatus: "assessment-invalid",
      completed,
      disabled: true,
    };
  }

  if (level?.isAccessible === true) {
    return {
      kind: "game",
      href: gameHref,
      label: completed ? "Replay level" : "Play level",
      routable: true,
      visualStatus: completed ? "completed" : "current",
      completed,
      disabled: false,
    };
  }
  return {
    kind: "locked",
    href: null,
    label: level?.lockReason === "deadline" ? "Deadline passed" : "Level locked",
    routable: false,
    visualStatus: level?.lockReason === "deadline" ? "expired" : "locked",
    completed,
    disabled: true,
  };
};

const step = (id, label, state, resultAction = null) => ({
  id,
  label,
  state,
  ...(resultAction ? { resultAction } : {}),
});

const stepState = (lesson) => {
  const currentAction = lesson.nextAction;
  const preCurrent = ["TAKE_PRE", "RESUME_PRE"].includes(currentAction);
  const postCurrent = ["TAKE_POST", "RESUME_POST", "RETRY_POST", "POST_RECOVERY_REQUIRED"]
    .includes(currentAction);
  const steps = [];

  const preResultAttemptId = positiveId(lesson.preLatestSubmittedAttemptId);
  const postResultAttemptId = positiveId(lesson.postLatestSubmittedAttemptId);
  if (lesson.preRequired || lesson.preAssessmentId != null || preResultAttemptId) {
    steps.push(step(
      "pre",
      "Pre-Test",
      lesson.preCompleted || preResultAttemptId ? "complete" : preCurrent ? "current" : "locked",
      preResultAttemptId ? {
        label: "View Result",
        href: buildAssessmentResultHref({
          classroomId: lesson.classroomId,
          lessonKey: lesson.lessonKey,
          type: "PRE",
          attemptId: preResultAttemptId,
        }),
      } : null,
    ));
  }

  steps.push(step(
    "module",
    "Module",
    !lesson.moduleUnlocked
      ? "locked"
      : lesson.gameStarted || lesson.gameCompleted
        ? "complete"
        : currentAction === "PLAY_GAME" ? "current" : "available",
  ));
  steps.push(step(
    "game",
    "Game Levels",
    lesson.gameCompleted
      ? "complete"
      : lesson.gameUnlocked && currentAction === "PLAY_GAME" ? "current" : "locked",
  ));

  if (lesson.postRequired || lesson.postAssessmentId != null || postResultAttemptId) {
    const postSatisfied = lesson.postPassed === true
      || (lesson.postCompleted === true && lesson.postPassingRequired === false)
      || lesson.lessonCompleted === true;
    steps.push(step(
      "post",
      "Post-Test",
      postSatisfied
        ? "complete"
        : postCurrent ? "current" : lesson.postUnlocked ? "available" : "locked",
      postResultAttemptId ? {
        label: "View Result",
        href: buildAssessmentResultHref({
          classroomId: lesson.classroomId,
          lessonKey: lesson.lessonKey,
          type: "POST",
          attemptId: postResultAttemptId,
        }),
      } : null,
    ));
  }

  return steps;
};

const actionFor = ({ lesson, classroomId, gameHref }) => {
  const assessmentHref = (type) => buildAssessmentHref({
    classroomId,
    lessonKey: lesson.lessonKey,
    type,
  });
  switch (lesson.nextAction) {
    case "TAKE_PRE":
      return { kind: "assessment", label: "Take Pre-Test", href: assessmentHref("pre"), disabled: false };
    case "RESUME_PRE":
      return { kind: "assessment", label: "Continue Pre-Test", href: assessmentHref("pre"), disabled: false };
    case "PLAY_GAME":
      if (lesson.moduleUnlocked && !lesson.gameStarted) {
        return {
          kind: "module",
          label: "Open Module",
          href: buildModuleHref(classroomId, lesson.lessonKey),
          disabled: false,
        };
      }
      return {
        kind: "game",
        label: "Continue Game",
        href: gameHref ?? buildMapHref(classroomId),
        disabled: !lesson.gameUnlocked,
      };
    case "TAKE_POST":
      return { kind: "assessment", label: "Take Post-Test", href: assessmentHref("post"), disabled: false };
    case "RESUME_POST":
      return { kind: "assessment", label: "Continue Post-Test", href: assessmentHref("post"), disabled: false };
    case "RETRY_POST":
      return { kind: "assessment", label: "Retry Post-Test", href: assessmentHref("post"), disabled: false };
    case "POST_RECOVERY_REQUIRED":
      return { kind: "blocked", label: "Post-Test attempts exhausted", href: null, disabled: true };
    case "LESSON_COMPLETE":
      return { kind: "complete", label: "Lesson Complete", href: buildMapHref(classroomId), disabled: false };
    case "COMPLETE_PREREQUISITE_LESSON":
    default:
      return { kind: "blocked", label: "Complete previous lesson", href: null, disabled: true };
  }
};

export const createLessonProgressionViewModel = ({ lesson, classroomId, gameHref }) => ({
  lessonKey: lesson?.lessonKey ?? null,
  lessonCompleted: lesson?.lessonCompleted === true,
  steps: stepState({ ...(lesson ?? {}), classroomId }),
  action: actionFor({ lesson: lesson ?? {}, classroomId, gameHref }),
});

const ASSESSMENT_CARD_CONFIG = Object.freeze({
  PRE: {
    label: "Pre-Test",
    assessmentId: "preAssessmentId",
    required: "preRequired",
    unlocked: "preUnlocked",
    inProgress: "preAttemptInProgress",
    completed: "preCompleted",
    resultAttemptId: "preLatestSubmittedAttemptId",
    actions: {
      TAKE_PRE: "Take Test",
      RESUME_PRE: "Continue",
    },
  },
  POST: {
    label: "Post-Test",
    assessmentId: "postAssessmentId",
    required: "postRequired",
    unlocked: "postUnlocked",
    inProgress: "postAttemptInProgress",
    completed: "postCompleted",
    resultAttemptId: "postLatestSubmittedAttemptId",
    actions: {
      TAKE_POST: "Take Test",
      RESUME_POST: "Continue",
      RETRY_POST: "Retry",
    },
  },
});

const canUseAssessmentAction = ({ lesson, type, config }) => {
  const action = lesson?.nextAction;
  if (!config.actions[action]
    || !positiveId(lesson?.[config.assessmentId])
    || lesson?.[config.unlocked] !== true) return false;
  if (action === `RESUME_${type}`) return lesson?.[config.inProgress] === true;
  if (action === `TAKE_${type}`) {
    return lesson?.[config.inProgress] !== true && lesson?.[config.completed] !== true;
  }
  return type === "POST"
    && action === "RETRY_POST"
    && lesson?.postCompleted === true
    && Number(lesson?.postAttemptsRemaining) > 0;
};

export const createLessonAssessmentAccessViewModel = ({ lesson, classroomId } = {}) => {
  const resolvedClassroomId = positiveId(classroomId);
  const lessonKey = typeof lesson?.lessonKey === "string" ? lesson.lessonKey.trim() : "";
  if (!lessonKey) return { rows: [] };

  const rows = Object.entries(ASSESSMENT_CARD_CONFIG).flatMap(([type, config]) => {
    const resultAttemptId = positiveId(lesson?.[config.resultAttemptId]);
    const exists = lesson?.[config.required] === true
      || positiveId(lesson?.[config.assessmentId]) != null
      || lesson?.[config.inProgress] === true
      || lesson?.[config.completed] === true
      || resultAttemptId != null;
    if (!exists) return [];

    const actionAllowed = resolvedClassroomId != null
      && canUseAssessmentAction({ lesson, type, config });
    const action = actionAllowed ? {
      label: config.actions[lesson.nextAction],
      href: buildAssessmentHref({ classroomId: resolvedClassroomId, lessonKey, type }),
    } : null;
    const resultAction = resolvedClassroomId != null && resultAttemptId != null ? {
      label: "View Result",
      href: buildAssessmentResultHref({
        classroomId: resolvedClassroomId,
        lessonKey,
        type,
        attemptId: resultAttemptId,
      }),
    } : null;

    let status = "Not Started";
    if (action?.label === "Continue") status = "In Progress";
    else if (action) status = "Available";
    else if (resultAttemptId != null || lesson?.[config.completed] === true) status = "Completed";
    else if (lesson?.[config.unlocked] === false) status = "Locked";

    return [{
      type,
      label: config.label,
      status,
      resultAction,
      action,
    }];
  });

  return { rows };
};
