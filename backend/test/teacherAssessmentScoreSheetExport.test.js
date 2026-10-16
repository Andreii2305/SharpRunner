const assert = require("node:assert/strict");
const test = require("node:test");

const { buildAssessmentScoreSheetCsvData } = require("../src/services/teacherAssessmentScoreSheetExportService");
const { serializeCsv } = require("../src/services/csvService");

test("score sheet preserves zero, decimals, partial legacy scores, and explicit missing states", () => {
  const data = buildAssessmentScoreSheetCsvData({
    classroom: { id: 7, className: "Section =A", section: "A" },
    lesson: { lessonKey: "arrays", lessonTitle: "Arrays" },
    students: [{
      student: { id: 42, firstName: "Ada", lastName: "Learner", username: "+ada" },
      preAttempt: {
        pointsEarned: 0, maxPoints: 10.5, percentage: 0, preBaselineStatus: "VALID",
      },
      firstPost: { pointsEarned: null, maxPoints: null, percentage: 72.5 },
      officialPost: null,
      postAttemptCount: 1,
      learningGain: { value: 72.5 },
      learningGainUnavailableReason: null,
      officialPostOutcome: "Not submitted",
    }],
  });

  assert.deepEqual(data.headers, [
    "Class name", "Section", "Classroom ID", "Lesson", "Lesson Key", "Student Name", "Username",
    "PRE Points Earned", "PRE Points Possible", "PRE Percentage", "PRE Baseline Status",
    "First POST Points Earned", "First POST Points Possible", "First POST Percentage",
    "Official POST Points Earned", "Official POST Points Possible", "Official POST Percentage",
    "Official POST Outcome", "Submitted POST Attempts", "Learning Gain (percentage points)",
    "Learning Gain Unavailable Reason",
  ]);
  assert.deepEqual(data.rows[0], [
    "Section =A", "A", 7, "Arrays", "arrays", "Ada Learner", "+ada",
    0, 10.5, 0, "Valid baseline",
    "Unavailable", "Unavailable", 72.5,
    "Not submitted", "Not submitted", "Not submitted",
    "Not submitted", 1, 72.5, "",
  ]);
  const csv = serializeCsv(data);
  assert.match(csv, /"'\+ada"/);
  assert.match(csv, /"0","10\.5","0"/);
});

test("score sheet keeps an absent authoritative classroom section blank", () => {
  const data = buildAssessmentScoreSheetCsvData({
    classroom: { id: 8, className: "DSA" },
    lesson: { lessonKey: "arrays", lessonTitle: "Arrays" },
    students: [{ student: { username: "student" }, postAttemptCount: 0 }],
  });
  assert.deepEqual(data.headers.slice(0, 3), ["Class name", "Section", "Classroom ID"]);
  assert.deepEqual(data.rows[0].slice(0, 3), ["DSA", "", 8]);
});

test("score sheet keeps unavailable gain blank with a separate reason", () => {
  const data = buildAssessmentScoreSheetCsvData({
    classroom: { id: 7, className: "Algorithms", section: "B" },
    lesson: { lessonKey: "arrays", lessonTitle: "Arrays" },
    students: [{
      student: { id: 43, firstName: "Grace", lastName: "Hopper", username: "grace" },
      preAttempt: null,
      firstPost: { pointsEarned: 8, maxPoints: 10, percentage: 80 },
      officialPost: { pointsEarned: 8, maxPoints: 10, percentage: 80 },
      postAttemptCount: 1,
      learningGain: null,
      learningGainUnavailableReason: "PRE not submitted",
      officialPostOutcome: "Submitted",
    }],
  });
  assert.equal(data.rows[0][19], "");
  assert.equal(data.rows[0][20], "PRE not submitted");
  assert.equal(data.rows[0][7], "Not submitted");
});

test("score sheet emits authoritative gain reasons for invalid and missing baselines", () => {
  const base = {
    student: { firstName: "Student", lastName: "One", username: "student" },
    firstPost: { pointsEarned: 8, maxPoints: 10, percentage: 80 },
    officialPost: { pointsEarned: 8, maxPoints: 10, percentage: 80 },
    officialPostOutcome: "Passed",
    postAttemptCount: 1,
    learningGain: null,
  };
  const data = buildAssessmentScoreSheetCsvData({
    classroom: { id: 7, className: "Algorithms" },
    lesson: { lessonKey: "arrays", lessonTitle: "Arrays" },
    students: [
      { ...base, learningGainUnavailableReason: "PRE baseline is retroactive" },
      { ...base, student: { ...base.student, username: "legacy" }, learningGainUnavailableReason: "PRE baseline timing is unknown" },
      { ...base, student: { ...base.student, username: "missing" }, firstPost: null, learningGainUnavailableReason: "First POST not submitted" },
    ],
  });
  assert.deepEqual(data.rows.map((row) => row[20]), [
    "PRE baseline is retroactive",
    "PRE baseline timing is unknown",
    "First POST not submitted",
  ]);
});
