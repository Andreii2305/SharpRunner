const mapHref = (classroomId) => `/Map?classroomId=${encodeURIComponent(classroomId)}`;

export const resolveAssessmentNextHref = ({
  nextAction,
  nextActionLessonKey,
  route,
}) => {
  const classroomId = route?.classroomId;
  const lessonKey = nextActionLessonKey ?? route?.lessonKey;
  const assessmentType = {
    TAKE_PRE: "pre",
    RESUME_PRE: "pre",
    TAKE_POST: "post",
    RESUME_POST: "post",
    RETRY_POST: "post",
  }[nextAction];
  if (assessmentType && classroomId && lessonKey) {
    return `/classrooms/${encodeURIComponent(classroomId)}`
      + `/lessons/${encodeURIComponent(lessonKey)}/assessment/${assessmentType}`;
  }
  return mapHref(classroomId);
};
const lessonFor = (progression, lessonKey) => progression?.lessons?.find(
  (lesson) => lesson?.lessonKey === lessonKey,
) ?? null;

const LESSON_TITLES = {
  arrays: "Arrays",
  functions: "Functions & Methods",
  "functions-with-arrays": "Functions with Arrays",
  final: "Final Challenge",
};

const createPreContinuation = ({ lesson, route, moduleHref }) => {
  const nextAction = lesson?.nextAction;
  const labels = {
    TAKE_POST: "Continue to Post-Test",
    RESUME_POST: "Continue Post-Test",
    RETRY_POST: "Retry Post-Test",
  };
  if (labels[nextAction]) {
    return {
      kind: "assessment",
      label: labels[nextAction],
      href: resolveAssessmentNextHref({
        nextAction,
        nextActionLessonKey: route?.lessonKey,
        route,
      }),
      disabled: false,
    };
  }
  if (nextAction === "PLAY_GAME" && lesson?.moduleUnlocked === true) {
    return {
      kind: "module",
      label: "Continue to module",
      href: moduleHref,
      disabled: false,
    };
  }
  if (nextAction === "POST_RECOVERY_REQUIRED") {
    return {
      kind: "recovery",
      label: "Post-Test attempts exhausted — contact your teacher",
      href: null,
      disabled: true,
    };
  }
  return {
    kind: "map",
    label: "Back to Lesson Map",
    href: mapHref(route?.classroomId),
    disabled: false,
  };
};

export const createAssessmentResultModel = ({ envelope, progression, route }) => {
  const result = envelope?.result ?? {};
  const lesson = lessonFor(progression, route?.lessonKey);
  const type = String(result.type ?? route?.type ?? "").toUpperCase();
  const isPre = type === "PRE";
  const attemptOutcome = isPre
    ? "DIAGNOSTIC"
    : result.passed === true ? "PASSED" : result.passed === false ? "FAILED" : "UNKNOWN";
  const requirementCompletedOnAnotherAttempt = !isPre
    && attemptOutcome === "FAILED"
    && lesson?.postPassed === true;
  let state = "SUBMITTED";

  if (isPre) {
    state = "DIAGNOSTIC_COMPLETE";
  } else if (attemptOutcome === "PASSED") {
    state = "PASSED";
  } else if (lesson?.postPassed === true) {
    state = "REQUIREMENT_COMPLETED";
  } else if (lesson?.postPassingRequired === false && lesson?.postCompleted === true) {
    state = "COMPLETED";
  } else if (lesson?.postAttemptsExhausted === true) {
    state = "EXHAUSTED";
  } else if (
    lesson?.postPassingRequired === true
    && Number(lesson?.postAttemptsRemaining) > 0
  ) {
    state = "RETRY_AVAILABLE";
  }

  const score = result.scoreVisible === true
    && result.pointsEarned !== undefined
    && result.maxPoints !== undefined
    && result.percentage !== undefined
    ? {
        pointsEarned: result.pointsEarned,
        maxPoints: result.maxPoints,
        percentage: result.percentage,
      }
    : null;
  const summary = progression?.summary ?? {};
  const moduleHref = `/lesson/built-in/${encodeURIComponent(route?.lessonKey ?? "")}`
    + `?classroomId=${encodeURIComponent(route?.classroomId ?? "")}`;

  return {
    type,
    state,
    attemptOutcome,
    requirementCompletedOnAnotherAttempt,
    result,
    assessment: envelope?.assessment ?? null,
    lessonTitle: lesson?.lessonTitle ?? LESSON_TITLES[route?.lessonKey] ?? route?.lessonKey ?? "Lesson",
    assessmentTitle: envelope?.assessment?.title ?? `${type} assessment`,
    attempts: envelope?.attempts ?? null,
    score,
    officialGrade: score ? (envelope?.officialGrade ?? null) : null,
    firstPost: score ? (envelope?.firstPost ?? null) : null,
    learningGain: score ? (envelope?.learningGain ?? null) : null,
    prePercentage: score ? envelope?.prePercentage : undefined,
    reviewAvailable: envelope?.reviewAvailable === true,
    review: envelope?.reviewAvailable === true && Array.isArray(envelope?.review)
      ? envelope.review
      : [],
    baselineEligible: isPre && result.baselineEligible === true,
    moduleUnlocked: isPre && lesson?.moduleUnlocked === true,
    retakeAllowed: state === "RETRY_AVAILABLE",
    returnHref: mapHref(route?.classroomId),
    moduleHref,
    continuation: isPre ? createPreContinuation({ lesson, route, moduleHref }) : null,
    nextHref: resolveAssessmentNextHref({
      nextAction: summary.nextAction ?? lesson?.nextAction,
      nextActionLessonKey: summary.nextActionLessonKey,
      route,
    }),
  };
};
