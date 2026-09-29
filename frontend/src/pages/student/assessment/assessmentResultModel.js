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

export const createAssessmentResultModel = ({ envelope, progression, route }) => {
  const result = envelope?.result ?? {};
  const lesson = lessonFor(progression, route?.lessonKey);
  const type = String(result.type ?? route?.type ?? "").toUpperCase();
  const isPre = type === "PRE";
  let state = "SUBMITTED";

  if (isPre) {
    state = "DIAGNOSTIC_COMPLETE";
  } else if (lesson?.postPassingRequired === false && lesson?.postCompleted === true) {
    state = "COMPLETED";
  } else if (result.passed === true || lesson?.postPassed === true) {
    state = "PASSED";
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

  return {
    type,
    state,
    result,
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
    moduleUnlocked: isPre && lesson?.moduleUnlocked === true,
    retakeAllowed: state === "RETRY_AVAILABLE",
    returnHref: mapHref(route?.classroomId),
    moduleHref: `/lesson/built-in/${encodeURIComponent(route?.lessonKey ?? "")}`
      + `?classroomId=${encodeURIComponent(route?.classroomId ?? "")}`,
    nextHref: resolveAssessmentNextHref({
      nextAction: summary.nextAction ?? lesson?.nextAction,
      nextActionLessonKey: summary.nextActionLessonKey,
      route,
    }),
  };
};
