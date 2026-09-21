const { serializeCsv } = require("./csvService");

const unavailable = (value) => (
  value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value))
    ? "N/A"
    : value
);

const studentPerformanceCsvData = (payload) => ({
  headers: [
    "Student Name",
    "Username",
    "Progress %",
    "Completed Lessons",
    "Started Lessons",
    "Average Score",
    "Failed Attempts",
    "Average Attempts",
    "Active Time",
    "Hint Usage",
    "Last Activity",
    "Needs Attention",
    "Attention Reasons",
  ],
  rows: (payload.studentPerformance || []).map((student) => [
    student.name,
    student.username,
    unavailable(student.progress),
    unavailable(student.completedLessons),
    unavailable(student.startedLessons),
    unavailable(student.averageScore),
    unavailable(student.failedAttempts),
    unavailable(student.averageAttempts),
    unavailable(student.activeTimeLabel),
    unavailable(student.hintUsageCount),
    unavailable(student.lastActivityAt),
    student.attentionReasons?.length ? "Yes" : "No",
    student.attentionReasons?.length ? student.attentionReasons.join(" ") : "N/A",
  ]),
});

const lessonType = (lesson) => {
  if (lesson.source === "curriculum") return "Curriculum";
  if (lesson.type === "assignment") return "Assignment";
  return "Classroom Lesson";
};

const lessonDifficulty = (lesson) => (
  lesson.difficulty?.sufficientData
    ? `${lesson.difficulty.label} (${lesson.difficulty.score}/100)`
    : "N/A"
);

const lessonPerformanceCsvData = (payload) => ({
  headers: [
    "Lesson",
    "Type",
    "Applicable Students",
    "Started Students",
    "Completed Students",
    "Completion Rate",
    "Average Progress",
    "Average Score",
    "Average Attempts",
    "Failed Attempts",
    "Average Active Time",
    "Hint Usage Rate",
    "First Attempt Success",
    "Difficulty",
  ],
  rows: (payload.lessonPerformance || []).map((lesson) => [
    lesson.title,
    lessonType(lesson),
    unavailable(lesson.applicableStudents ?? lesson.eligibleStudents),
    unavailable(lesson.studentsStarted),
    unavailable(lesson.studentsCompleted),
    unavailable(lesson.completionRate),
    unavailable(lesson.averageProgress),
    unavailable(lesson.averageScore),
    unavailable(lesson.averageAttempts),
    unavailable(lesson.failedAttempts),
    unavailable(lesson.averageActiveTimeLabel),
    unavailable(lesson.hintUsageRate),
    unavailable(lesson.firstAttemptSuccessRate),
    lessonDifficulty(lesson),
  ]),
});

const buildStudentPerformanceCsv = (payload) => serializeCsv(studentPerformanceCsvData(payload));
const buildLessonPerformanceCsv = (payload) => serializeCsv(lessonPerformanceCsvData(payload));

module.exports = {
  buildLessonPerformanceCsv,
  buildStudentPerformanceCsv,
  lessonPerformanceCsvData,
  studentPerformanceCsvData,
  unavailable,
};

