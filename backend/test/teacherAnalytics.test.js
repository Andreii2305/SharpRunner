const assert = require("node:assert/strict");
const { test } = require("node:test");
const Classroom = require("../src/models/Classroom");
const ClassroomMembership = require("../src/models/ClassroomMembership");
const ClassroomLesson = require("../src/models/ClassroomLesson");
const ClassroomLessonPlacement = require("../src/models/ClassroomLessonPlacement");
const ClassroomLessonProgress = require("../src/models/ClassroomLessonProgress");
const ClassroomLessonSubmission = require("../src/models/ClassroomLessonSubmission");
const LevelContentOverride = require("../src/models/LevelContentOverride");
const User = require("../src/models/User");
const UserProgress = require("../src/models/UserProgress");
const {
  buildAttentionReasons,
  calculateDifficulty,
  formatDuration,
  getTeacherAnalytics,
  parseAnalyticsFilters,
  scoreDistribution,
} = require("../src/services/teacherAnalyticsService");

const withStubs = async (stubs, callback) => {
  const originals = stubs.map(([target, property]) => [target, property, target[property]]);
  for (const [target, property, replacement] of stubs) target[property] = replacement;
  try { return await callback(); }
  finally { for (const [target, property, original] of originals) target[property] = original; }
};

const request = { userId: 10, userRole: "teacher" };

test("analytics difficulty requires evidence and uses the documented composite", () => {
  assert.deepEqual(calculateDifficulty({ studentsStarted: 2, studentsCompleted: 0, failedAttempts: 8, totalSolutionAttempts: 8, averageScore: null, studentsUsingHints: 2 }), {
    score: null, label: null, sufficientData: false,
  });
  const result = calculateDifficulty({ studentsStarted: 5, studentsCompleted: 1, failedAttempts: 12, totalSolutionAttempts: 13, averageScore: 76, studentsUsingHints: 4 });
  assert.equal(result.sufficientData, true);
  assert.equal(result.label, "High");
  assert.ok(result.score >= 67 && result.score <= 100);
  assert.equal(formatDuration(null), null);
});

test("analytics date filters validate custom ranges", () => {
  const recent = parseAnalyticsFilters({ datePreset: "7d" }, new Date("2026-09-18T00:00:00Z"));
  assert.equal(recent.startAt.toISOString(), "2026-09-11T00:00:00.000Z");
  assert.throws(() => parseAnalyticsFilters({ datePreset: "custom", startDate: "2026-09-18", endDate: "2026-09-01" }), /startDate/);
  assert.throws(() => parseAnalyticsFilters({ classroomId: "not-an-id" }), /Invalid classroom/);
});

test("score ranges are deterministic and preserve low-score buckets", () => {
  assert.deepEqual(scoreDistribution([100, 90, 89, 70, 69, 59]).map((row) => row.count), [2, 1, 1, 1, 1]);
});

test("attention rules provide neutral, explainable reasons", () => {
  const reasons = buildAttentionReasons({
    student: { id: 1 },
    states: [{
      started: true, completed: false, lessonTitle: "Arrays", failedAttempts: 5,
      totalAttempts: 5, progressPercent: 20, hintUsed: true,
      lastActivityAt: new Date("2026-08-01T00:00:00Z"), rows: [],
    }],
    dueAtByLevelKey: new Map(),
    now: new Date("2026-09-18T00:00:00Z"),
  });
  assert.ok(reasons.some((reason) => reason.includes("5 failed attempts")));
  assert.ok(reasons.some((reason) => reason.includes("Current progress")));
  assert.ok(reasons.some((reason) => reason.includes("No recorded learning activity")));
});

test("empty classrooms return null evidence metrics instead of misleading zeroes", async () => {
  await withStubs([[Classroom, "findAll", async () => []]], async () => {
    const payload = await getTeacherAnalytics({ req: request, query: {} });
    assert.equal(payload.overview.totalStudents, 0);
    assert.equal(payload.overview.averageScore, null);
    assert.equal(payload.overview.averageActiveTimeLabel, null);
    assert.deepEqual(payload.lessonPerformance, []);
  });
});

test("analytics reject a classroom owned by another teacher before reading student data", async () => {
  let membershipsRead = false;
  await withStubs([
    [Classroom, "findAll", async () => [{ id: 1, teacherId: 10, isActive: true, className: "Owned", section: "A" }]],
    [ClassroomMembership, "findAll", async () => { membershipsRead = true; return []; }],
  ], async () => {
    await assert.rejects(
      getTeacherAnalytics({ req: request, query: { classroomId: "999" } }),
      (error) => error.status === 403,
    );
    assert.equal(membershipsRead, false);
  });
});

test("analytics aggregate attempts, time, scores and hints in bounded queries and isolate reusable lesson placements", async () => {
  const at = new Date("2026-09-16T12:00:00Z");
  const classrooms = [
    { id: 1, teacherId: 10, isActive: true, className: "Alpha", section: "A" },
    { id: 2, teacherId: 10, isActive: true, className: "Beta", section: "B" },
  ];
  const memberships = [
    { classroomId: 1, studentId: 1 }, { classroomId: 2, studentId: 1 },
    { classroomId: 1, studentId: 2 }, { classroomId: 1, studentId: 3 },
  ];
  const students = [1, 2, 3].map((id) => ({ id, firstName: `Student`, lastName: String(id), username: `student-${id}`, status: "active" }));
  const progress = [];
  for (const studentId of [1, 2, 3]) {
    for (let level = 1; level <= 5; level += 1) {
      const completed = studentId !== 3;
      progress.push({
        userId: studentId, levelKey: `tutorial-level-${level}`, progressPercent: completed ? 100 : level === 1 ? 20 : 0,
        isCompleted: completed, completedAt: completed ? at : null,
        attemptCount: studentId === 1 ? 0 : studentId === 2 ? 2 : level === 1 ? 5 : 0,
        timeSpentSeconds: studentId === 1 ? 120 : studentId === 2 ? null : level === 1 ? 300 : 0,
        finalScore: completed ? (studentId === 1 ? 100 : 90) : null,
        startedAt: completed || level === 1 ? at : null,
        hintUsed: studentId !== 1 && (completed || level === 1),
        hintType: studentId === 2 ? "detailed" : studentId === 3 ? "basic" : null,
        detailedHintUnlocked: studentId === 2,
        attemptCountAtHintUnlock: studentId === 1 ? null : 2,
        updatedAt: at,
      });
    }
  }
  const reusableLesson = { id: 99, classroomId: null, title: "Reusable lesson", contentType: "lesson", maxScore: 100, assignedStudentIds: [] };
  let lessonFindCalls = 0;
  let progressFindCalls = 0;
  await withStubs([
    [Classroom, "findAll", async () => classrooms],
    [ClassroomMembership, "findAll", async (options) => { assert.equal(options.where.status, "active"); return memberships; }],
    [User, "findAll", async () => students],
    [UserProgress, "findAll", async () => { progressFindCalls += 1; return progress; }],
    [LevelContentOverride, "findAll", async () => []],
    [ClassroomLessonPlacement, "findAll", async () => [{ classroomId: 1, lessonId: 99 }, { classroomId: 2, lessonId: 99 }]],
    [ClassroomLesson, "findAll", async (options) => { lessonFindCalls += 1; return options.where.id ? [reusableLesson] : []; }],
    [ClassroomLessonProgress, "findAll", async () => [
      { classroomId: 1, lessonId: 99, studentId: 1, viewedAt: at, completedAt: at },
      { classroomId: 2, lessonId: 99, studentId: 1, viewedAt: at, completedAt: null },
    ]],
    [ClassroomLessonSubmission, "findAll", async () => []],
  ], async () => {
    const payload = await getTeacherAnalytics({ req: request, query: { datePreset: "7d" }, now: new Date("2026-09-18T00:00:00Z") });
    assert.equal(payload.overview.totalStudents, 3);
    assert.equal(payload.overview.averageScore, 95);
    assert.ok(payload.overview.averageAttempts > 0);
    assert.equal(payload.overview.averageActiveTimeLabel, "8m");
    assert.ok(payload.overview.hintUsageRate > 0);
    assert.equal(payload.highlights.mostDifficultLesson.title, "Tutorial: First Compile Trial");
    assert.equal(payload.attention.some((student) => student.studentId === 3), true);
    const classOne = payload.lessonPerformance.find((lesson) => lesson.id === "custom:1:99");
    const classTwo = payload.lessonPerformance.find((lesson) => lesson.id === "custom:2:99");
    assert.equal(classOne.completionRate, 100);
    assert.equal(classTwo.completionRate, 0);
    assert.equal(progressFindCalls, 1, "progress is fetched once, not once per student or lesson");
    assert.equal(lessonFindCalls, 2, "direct and placed lessons use two bounded reads");
    assert.equal(JSON.stringify(payload).includes("NaN"), false);
  });
});

test("date filtering excludes old cumulative activity without fabricating history", async () => {
  const old = new Date("2025-01-01T00:00:00Z");
  await withStubs([
    [Classroom, "findAll", async () => [{ id: 1, teacherId: 10, isActive: true, className: "Alpha", section: "A" }]],
    [ClassroomMembership, "findAll", async () => [{ classroomId: 1, studentId: 1 }]],
    [User, "findAll", async () => [{ id: 1, firstName: "Old", lastName: "Activity", username: "old", status: "active" }]],
    [UserProgress, "findAll", async () => [{ userId: 1, levelKey: "tutorial-level-1", progressPercent: 100, isCompleted: true, completedAt: old, startedAt: old, updatedAt: old, attemptCount: 0, timeSpentSeconds: 30, finalScore: 100, hintUsed: false }]],
    [LevelContentOverride, "findAll", async () => []],
    [ClassroomLessonPlacement, "findAll", async () => []],
    [ClassroomLesson, "findAll", async () => []],
  ], async () => {
    const payload = await getTeacherAnalytics({ req: request, query: { datePreset: "7d" }, now: new Date("2026-09-18T00:00:00Z") });
    assert.equal(payload.overview.totalStudents, 1);
    assert.equal(payload.overview.averageProgress, null);
    assert.equal(payload.overview.completionRate, null);
    assert.equal(payload.activity.byDay.length, 0);
  });
});
