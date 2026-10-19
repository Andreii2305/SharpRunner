export const ACADEMIC_LESSONS = Object.freeze([
  { key: "arrays", title: "Arrays", assessmentApplicable: true },
  { key: "functions", title: "Functions", assessmentApplicable: true },
  { key: "functions-with-arrays", title: "Functions with Arrays", assessmentApplicable: true },
  { key: "final", title: "Final Lesson", assessmentApplicable: false },
]);

export const assessmentTargetValue = (target = {}) => (
  target.targetKind === "CLASSROOM_LESSON_PLACEMENT"
    ? Number.isSafeInteger(Number(target.placementId)) && Number(target.placementId) > 0
      ? `placement:${Number(target.placementId)}` : ""
    : typeof target.lessonKey === "string" && target.lessonKey
      ? `builtin:${target.lessonKey}` : ""
);

export const parseAssessmentTargetValue = (value) => {
  const builtIn = /^builtin:([a-z][a-z0-9-]*)$/.exec(String(value || ""));
  if (builtIn) return { targetKind: "BUILT_IN", lessonKey: builtIn[1] };
  const placement = /^placement:([1-9][0-9]*)$/.exec(String(value || ""));
  if (!placement || !Number.isSafeInteger(Number(placement[1]))) return null;
  return { targetKind: "CLASSROOM_LESSON_PLACEMENT", placementId: Number(placement[1]) };
};

export const assessmentClassroomLabel = (classroom = {}) => {
  const className = typeof classroom.className === "string" && classroom.className.trim()
    ? classroom.className.trim()
    : "Unnamed classroom";
  const section = typeof classroom.section === "string" ? classroom.section.trim() : "";
  return section ? `${className} — ${section}` : className;
};

const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const rounded = (value) => Math.round((value + Number.EPSILON) * 10) / 10;
const average = (values) => values.length ? rounded(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

const baselineStatus = (value) => ["VALID", "RETROACTIVE", "UNKNOWN", "SUPPLEMENTAL"].includes(value)
  ? value
  : "UNKNOWN";
export const baselineStatusLabel = (value, { customPlacement = false } = {}) => ({
  VALID: "Valid baseline",
  RETROACTIVE: customPlacement
    ? "Retroactive — lesson content was accessed before PRE"
    : "Retroactive — game activity preceded PRE",
  UNKNOWN: "Unknown — legacy baseline timing",
  SUPPLEMENTAL: "Supplemental diagnostic — not a baseline",
}[baselineStatus(value)]);

const numericOrNull = (value) => finite(value) ? Number(value) : null;
export const attemptPointsLabel = (attempt) => {
  if (!attempt) return "Not submitted";
  const earned = numericOrNull(attempt.pointsEarned);
  const possible = numericOrNull(attempt.maxPoints);
  if (earned !== null && possible !== null) return `${earned} / ${possible} points`;
  if (earned !== null) return `${earned} points earned · possible unavailable`;
  if (possible !== null) return `Earned unavailable · ${possible} points possible`;
  return "Points unavailable";
};

const safeAttempt = (row, type, passingRequirementApplicable = false, customPlacement = false) => ({
  attemptId: row.attemptId,
  attemptNumber: Number(row.attemptNumber),
  submittedAt: row.submittedAt,
  pointsEarned: numericOrNull(row.pointsEarned),
  maxPoints: numericOrNull(row.maxPoints),
  percentage: numericOrNull(row.percentage),
  passed: type === "POST" && typeof row.passed === "boolean" ? row.passed : null,
  passingRequirementApplicable: type === "POST" && passingRequirementApplicable === true,
  passingPercentageApplied: type === "POST" ? numericOrNull(row.passingPercentageApplied) : null,
  isOfficial: type === "POST" && row.isOfficial === true,
  isFirstSubmittedPost: type === "POST" && row.isFirstSubmittedPost === true,
  ...(type === "PRE" ? {
    preBaselineStatus: baselineStatus(row.preBaselineStatus),
    baselineLabel: baselineStatusLabel(row.preBaselineStatus, { customPlacement }),
  } : {}),
  type,
});

const studentIdentity = (source) => ({
  id: source.id,
  firstName: source.firstName ?? "",
  lastName: source.lastName ?? "",
  username: source.username ?? "",
});

const safeCodingQuestion = (source, assessmentType) => ({
  questionId: source.questionId,
  questionOrder: finite(source.questionOrder) ? Number(source.questionOrder) : 0,
  questionLabel: typeof source.questionLabel === "string" ? source.questionLabel : "Coding question",
  responseCount: finite(source.responseCount) ? Number(source.responseCount) : 0,
  fullyCorrectCount: finite(source.fullyCorrectCount) ? Number(source.fullyCorrectCount) : 0,
  fullyCorrectRate: finite(source.fullyCorrectRate) ? Number(source.fullyCorrectRate) : 0,
  averageAwardedPoints: finite(source.averageAwardedPoints) ? Number(source.averageAwardedPoints) : 0,
  maximumPoints: finite(source.maximumPoints) ? Number(source.maximumPoints) : 0,
  averagePercentageEarned: finite(source.averagePercentageEarned)
    ? Number(source.averagePercentageEarned)
    : 0,
  assessmentType,
});

const compareAttempts = (left, right) => (
  left.attemptNumber - right.attemptNumber
  || String(left.submittedAt).localeCompare(String(right.submittedAt))
  || String(left.attemptId).localeCompare(String(right.attemptId))
);

export const buildAssessmentAnalytics = ({ prePayload = null, postPayload = null } = {}) => {
  const postPassingApplies = postPayload?.assessment?.passingRequirementApplicable === true;
  const preTarget = prePayload?.assessment;
  const postTarget = postPayload?.assessment;
  const customPair = preTarget?.targetKind === "CLASSROOM_LESSON_PLACEMENT"
    || postTarget?.targetKind === "CLASSROOM_LESSON_PLACEMENT";
  const hasKnownRevision = (target) => target?.targetLessonVersion !== null
    && target?.targetLessonVersion !== undefined
    && target?.targetLessonVersion !== ""
    && Number.isSafeInteger(Number(target.targetLessonVersion))
    && Number(target.targetLessonVersion) > 0;
  const comparableTargets = !customPair || (
    preTarget?.targetKind === "CLASSROOM_LESSON_PLACEMENT"
    && postTarget?.targetKind === "CLASSROOM_LESSON_PLACEMENT"
    && Number(preTarget.classroomLessonPlacementId) === Number(postTarget.classroomLessonPlacementId)
    && hasKnownRevision(preTarget)
    && hasKnownRevision(postTarget)
    && Number(preTarget.targetLessonVersion) === Number(postTarget.targetLessonVersion)
  );
  const students = new Map();
  const ingest = (payload, type) => {
    for (const source of payload?.results ?? []) {
      if (!source?.student?.id) continue;
      const key = String(source.student.id);
      if (!students.has(key)) students.set(key, { student: studentIdentity(source.student), preAttempts: [], postAttempts: [] });
      students.get(key)[type === "PRE" ? "preAttempts" : "postAttempts"].push(safeAttempt(
        source,
        type,
        payload?.assessment?.passingRequirementApplicable,
      payload?.assessment?.targetKind === "CLASSROOM_LESSON_PLACEMENT",
      ));
    }
  };
  ingest(prePayload, "PRE");
  ingest(postPayload, "POST");

  const rows = [...students.values()].map((entry) => {
    entry.preAttempts.sort(compareAttempts);
    entry.postAttempts.sort(compareAttempts);
    const preAttempt = entry.preAttempts[0] ?? null;
    const firstPost = entry.postAttempts.find((attempt) => attempt.isFirstSubmittedPost) ?? null;
    const officialPost = entry.postAttempts.find((attempt) => attempt.isOfficial) ?? null;
    const learningGain = comparableTargets && preAttempt?.preBaselineStatus === "VALID"
      && finite(preAttempt?.percentage) && finite(firstPost?.percentage)
      ? rounded(firstPost.percentage - preAttempt.percentage)
      : null;
    let learningGainUnavailableReason = null;
    if (learningGain === null) {
      if (!preAttempt) learningGainUnavailableReason = "PRE not submitted";
      else if (preAttempt.preBaselineStatus === "RETROACTIVE") {
        learningGainUnavailableReason = "PRE baseline is retroactive";
      } else if (preAttempt.preBaselineStatus !== "VALID") {
        learningGainUnavailableReason = "PRE baseline timing is unknown";
      } else if (!firstPost) learningGainUnavailableReason = "First POST not submitted";
      else if (!comparableTargets) {
        learningGainUnavailableReason = "Assessment content revisions are not comparable";
      } else learningGainUnavailableReason = "Stored score unavailable";
    }
    const name = `${entry.student.firstName} ${entry.student.lastName}`.trim() || entry.student.username;
    return {
      student: entry.student,
      name,
      preAttempt,
      preStatus: preAttempt?.baselineLabel ?? "Not submitted",
      postAttempts: entry.postAttempts,
      firstPost,
      officialPost,
      postStatus: officialPost
        ? postPassingApplies && typeof officialPost.passed === "boolean" ? (officialPost.passed ? "Passed" : "Not passed") : "Submitted"
        : entry.postAttempts.length ? "Submitted — official result unavailable" : "Not submitted",
      learningGain,
      learningGainUnavailableReason,
      history: [...entry.preAttempts, ...entry.postAttempts].sort((left, right) => String(left.submittedAt).localeCompare(String(right.submittedAt)) || compareAttempts(left, right)),
    };
  }).sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) || String(left.student.id).localeCompare(String(right.student.id)));

  const preRows = rows.filter((row) => row.preAttempt);
  const validBaselineRows = preRows.filter((row) => row.preAttempt.preBaselineStatus === "VALID");
  const postRows = rows.filter((row) => row.postAttempts.length);
  const officialRows = rows.filter((row) => row.officialPost);
  const pairedRows = rows.filter((row) => row.learningGain !== null);
  const passedRows = officialRows.filter((row) => row.officialPost.passed === true);
  const codingQuestions = [
    ...(prePayload?.codingQuestions ?? []).map((question) => safeCodingQuestion(question, "PRE")),
    ...(postPayload?.codingQuestions ?? []).map((question) => safeCodingQuestion(question, "POST")),
  ];
  return {
    students: rows,
    codingQuestions,
    metrics: {
      preSubmittedStudents: preRows.length,
      postSubmittedStudents: postRows.length,
      averageAllPrePercentage: average(preRows.map((row) => row.preAttempt.percentage).filter(finite).map(Number)),
      averageValidBaselinePrePercentage: average(validBaselineRows.map((row) => row.preAttempt.percentage).filter(finite).map(Number)),
      averagePrePercentage: average(preRows.map((row) => row.preAttempt.percentage).filter(finite).map(Number)),
      validBaselineStudents: validBaselineRows.length,
      excludedBaselineStudents: preRows.length - validBaselineRows.length,
      averageOfficialPostPercentage: average(officialRows.map((row) => row.officialPost.percentage).filter(finite).map(Number)),
      postPassedStudents: postPassingApplies ? passedRows.length : null,
      postPassRate: postPassingApplies && officialRows.length === postRows.length && officialRows.length ? rounded((passedRows.length / officialRows.length) * 100) : null,
      averagePostAttempts: average(postRows.map((row) => row.postAttempts.length)),
      pairedStudents: pairedRows.length,
      averageLearningGain: average(pairedRows.map((row) => row.learningGain)),
    },
  };
};

export const filterAssessmentStudents = (students, { query = "", type = "ALL" } = {}) => {
  const needle = query.trim().toLocaleLowerCase();
  return students.filter((row) => {
    const hasType = type === "PRE" ? Boolean(row.preAttempt) : type === "POST" ? row.postAttempts.length > 0 : true;
    const matches = !needle || `${row.name} ${row.student.username}`.toLocaleLowerCase().includes(needle);
    return hasType && matches;
  });
};

export const summarizeAssessmentAvailability = (summary, payload) => {
  if (!summary?.exists) return "Not configured";
  if (!summary.published) return "Draft — results unavailable";
  return payload?.results?.length ? "Published — submissions available" : "Published — no submitted attempts";
};

export const getAssessmentAnalyticsView = ({
  classroomId,
  lessonKey,
  assessmentApplicable,
  loading,
  error,
  dataMatchesScope,
}) => {
  if (error) return "error";
  if (!classroomId || !lessonKey) return "select_scope";
  if (assessmentApplicable === false) return "not_applicable";
  if (loading || !dataMatchesScope) return "loading";
  return "ready";
};
