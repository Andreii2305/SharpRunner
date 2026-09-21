const assert = require("node:assert/strict");
const { test } = require("node:test");
const { safeCsvFilename, serializeCsv } = require("../src/services/csvService");
const {
  buildLessonPerformanceCsv,
  buildStudentPerformanceCsv,
} = require("../src/services/teacherAnalyticsExportService");

test("CSV serialization preserves structured text and neutralizes spreadsheet formulas", () => {
  const csv = serializeCsv({
    headers: ["Name", "Value"],
    rows: [
      ["José 李", "comma,value"],
      ["Quote", 'He said "hello"'],
      ["Lines", "first\nsecond"],
      ["Formula", "=SUM(1,2)"],
      ["Spaced formula", "  +cmd"],
      ["Tabbed formula", "\t@cmd"],
      ["CRLF formula", "\r\n=cmd"],
      ["Control formula", "\u0001@cmd"],
      ["Unicode-space formula", "\u00A0+cmd"],
      ["Missing", null],
    ],
  });

  assert.equal(csv.startsWith("\uFEFF"), true);
  assert.match(csv, /"José 李","comma,value"/);
  assert.match(csv, /"Quote","He said ""hello"""/);
  assert.match(csv, /"Lines","first\nsecond"/);
  assert.match(csv, /"Formula","'=SUM\(1,2\)"/);
  assert.match(csv, /"Spaced formula","'  \+cmd"/);
  assert.match(csv, /"Tabbed formula","'\t@cmd"/);
  assert.match(csv, /"CRLF formula","'\r\n=cmd"/);
  assert.match(csv, /"Control formula","'\u0001@cmd"/);
  assert.match(csv, /"Unicode-space formula","'\u00A0\+cmd"/);
  assert.match(csv, /"Missing",""/);
  assert.equal(csv.includes("\r\n"), true);
  assert.equal(safeCsvFilename('report.csv"\r\nX-Injected: yes'), "report.csv-X-Injected-yes.csv");
});

test("student performance CSV contains authorized aggregates and no sensitive fields", () => {
  const csv = buildStudentPerformanceCsv({
    studentPerformance: [{
      studentId: 17,
      name: "=Malicious, Name",
      username: "student-17",
      progress: null,
      completedLessons: 2,
      startedLessons: 3,
      averageScore: 88.5,
      failedAttempts: 0,
      averageAttempts: 1.5,
      activeTimeLabel: "1h 2m",
      hintUsageCount: 1,
      lastActivityAt: "2026-09-20T10:00:00.000Z",
      attentionReasons: ["Five or more failed attempts.", "No activity for 14 days."],
      email: "must-not-export@example.com",
      dedupeKey: "must-not-export",
    }],
  });

  assert.match(csv, /"Student Name","Username","Progress %","Completed Lessons"/);
  assert.match(csv, /"'=Malicious, Name"/);
  assert.match(csv, /"N\/A","2","3","88.5","0","1.5","1h 2m","1"/);
  assert.match(csv, /"Yes","Five or more failed attempts\. No activity for 14 days\."/);
  assert.equal(csv.includes("must-not-export@example.com"), false);
  assert.equal(csv.includes("dedupeKey"), false);
  assert.equal(csv.includes("studentId"), false);
});

test("lesson performance CSV uses N/A for unavailable evidence and keeps legitimate zeroes", () => {
  const csv = buildLessonPerformanceCsv({
    lessonPerformance: [{
      title: "Arrays \"Basics\"",
      source: "curriculum",
      applicableStudents: 4,
      studentsStarted: 3,
      studentsCompleted: 0,
      completionRate: 0,
      averageProgress: 25,
      averageScore: null,
      averageAttempts: 2,
      failedAttempts: 5,
      averageActiveTimeLabel: null,
      hintUsageRate: 50,
      firstAttemptSuccessRate: null,
      difficulty: { label: null, score: null, sufficientData: false },
    }],
  });

  assert.match(csv, /"Lesson","Type","Applicable Students","Started Students"/);
  assert.match(csv, /"Arrays ""Basics""","Curriculum","4","3","0","0","25","N\/A","2","5","N\/A","50","N\/A","N\/A"/);
});
