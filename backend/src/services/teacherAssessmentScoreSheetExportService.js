const numericAttemptValue = (attempt, key) => {
  if (!attempt) return "Not submitted";
  const value = attempt[key];
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) {
    return "Unavailable";
  }
  return Number(value);
};

const baselineLabel = (attempt) => {
  if (!attempt) return "Not submitted";
  return ({
    VALID: "Valid baseline",
    RETROACTIVE: "Retroactive — game activity preceded PRE",
    UNKNOWN: "Unknown — legacy baseline timing",
  })[attempt.preBaselineStatus] || "Unknown — legacy baseline timing";
};

const studentName = (student = {}) => (
  `${student.firstName || ""} ${student.lastName || ""}`.trim() || student.username || "Unavailable"
);

const buildAssessmentScoreSheetCsvData = ({ classroom = {}, lesson = {}, students = [] } = {}) => ({
  headers: [
    "Class name", "Section", "Classroom ID", "Lesson", "Lesson Key", "Student Name", "Username",
    "PRE Points Earned", "PRE Points Possible", "PRE Percentage", "PRE Baseline Status",
    "First POST Points Earned", "First POST Points Possible", "First POST Percentage",
    "Official POST Points Earned", "Official POST Points Possible", "Official POST Percentage",
    "Official POST Outcome", "Submitted POST Attempts", "Learning Gain (percentage points)",
    "Learning Gain Unavailable Reason",
  ],
  rows: students.map((row) => [
    classroom.className ?? "Unavailable",
    classroom.section ?? "",
    classroom.id ?? "Unavailable",
    lesson.lessonTitle ?? "Unavailable",
    lesson.lessonKey ?? "Unavailable",
    studentName(row.student),
    row.student?.username ?? "Unavailable",
    numericAttemptValue(row.preAttempt, "pointsEarned"),
    numericAttemptValue(row.preAttempt, "maxPoints"),
    numericAttemptValue(row.preAttempt, "percentage"),
    baselineLabel(row.preAttempt),
    numericAttemptValue(row.firstPost, "pointsEarned"),
    numericAttemptValue(row.firstPost, "maxPoints"),
    numericAttemptValue(row.firstPost, "percentage"),
    numericAttemptValue(row.officialPost, "pointsEarned"),
    numericAttemptValue(row.officialPost, "maxPoints"),
    numericAttemptValue(row.officialPost, "percentage"),
    row.officialPostOutcome || (row.officialPost ? "Unavailable" : "Not submitted"),
    Number(row.postAttemptCount) || 0,
    row.learningGain?.value == null ? "" : Number(row.learningGain.value),
    row.learningGain?.value == null ? (row.learningGainUnavailableReason || "Unavailable") : "",
  ]),
});

module.exports = { buildAssessmentScoreSheetCsvData };
