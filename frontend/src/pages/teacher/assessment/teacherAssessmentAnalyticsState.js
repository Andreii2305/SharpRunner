export const ACADEMIC_LESSONS = Object.freeze([
  { key: "arrays", title: "Arrays", assessmentApplicable: true },
  { key: "functions", title: "Functions", assessmentApplicable: true },
  { key: "functions-with-arrays", title: "Functions with Arrays", assessmentApplicable: true },
  { key: "final", title: "Final Lesson", assessmentApplicable: false },
]);

const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const rounded = (value) => Math.round((value + Number.EPSILON) * 10) / 10;
const average = (values) => values.length ? rounded(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

const baselineStatus = (value) => ["VALID", "RETROACTIVE", "UNKNOWN"].includes(value)
  ? value
  : "UNKNOWN";
export const baselineStatusLabel = (value) => ({
  VALID: "Valid baseline",
  RETROACTIVE: "Retroactive — game activity preceded PRE",
  UNKNOWN: "Unknown — legacy baseline timing",
}[baselineStatus(value)]);

const safeAttempt = (row, type) => ({
  attemptId: row.attemptId,
  attemptNumber: Number(row.attemptNumber),
  submittedAt: row.submittedAt,
  percentage: finite(row.percentage) ? Number(row.percentage) : null,
  passed: type === "POST" && typeof row.passed === "boolean" ? row.passed : null,
  isOfficial: type === "POST" && row.isOfficial === true,
  isFirstSubmittedPost: type === "POST" && row.isFirstSubmittedPost === true,
  ...(type === "PRE" ? {
    preBaselineStatus: baselineStatus(row.preBaselineStatus),
    baselineLabel: baselineStatusLabel(row.preBaselineStatus),
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
  const postPassingApplies = finite(postPayload?.assessment?.passingPercentage);
  const students = new Map();
  const ingest = (payload, type) => {
    for (const source of payload?.results ?? []) {
      if (!source?.student?.id) continue;
      const key = String(source.student.id);
      if (!students.has(key)) students.set(key, { student: studentIdentity(source.student), preAttempts: [], postAttempts: [] });
      students.get(key)[type === "PRE" ? "preAttempts" : "postAttempts"].push(safeAttempt(source, type));
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
    const learningGain = preAttempt?.preBaselineStatus === "VALID"
      && finite(preAttempt?.percentage) && finite(firstPost?.percentage)
      ? rounded(firstPost.percentage - preAttempt.percentage)
      : null;
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
