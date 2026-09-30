const positiveId = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
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

const step = (id, label, state) => ({ id, label, state });

const stepState = (lesson) => {
  const currentAction = lesson.nextAction;
  const preCurrent = ["TAKE_PRE", "RESUME_PRE"].includes(currentAction);
  const postCurrent = ["TAKE_POST", "RESUME_POST", "RETRY_POST", "POST_RECOVERY_REQUIRED"]
    .includes(currentAction);
  const steps = [];

  if (lesson.preRequired || lesson.preAssessmentId != null) {
    steps.push(step(
      "pre",
      "Pre-Test",
      lesson.preCompleted ? "complete" : preCurrent ? "current" : "locked",
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

  if (lesson.postRequired || lesson.postAssessmentId != null) {
    const postSatisfied = lesson.postPassed === true
      || (lesson.postCompleted === true && lesson.postPassingRequired === false)
      || lesson.lessonCompleted === true;
    steps.push(step(
      "post",
      "Post-Test",
      postSatisfied
        ? "complete"
        : postCurrent ? "current" : lesson.postUnlocked ? "available" : "locked",
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
  steps: stepState(lesson ?? {}),
  action: actionFor({ lesson: lesson ?? {}, classroomId, gameHref }),
});
