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

const analyticsFixture = async ({
  classrooms = [{ id: 1, teacherId: 10, isActive: true, className: "Alpha", section: "A" }],
  memberships = [{ classroomId: 1, studentId: 1 }],
  students = [{ id: 1, firstName: "Student", lastName: "One", username: "student-1", status: "active" }],
  progress = [],
  overrides = [],
  query = {},
  now = new Date("2026-09-18T00:00:00Z"),
} = {}) => withStubs([
  [Classroom, "findAll", async () => classrooms],
  [ClassroomMembership, "findAll", async () => memberships],
  [User, "findAll", async () => students],
  [UserProgress, "findAll", async () => progress],
  [LevelContentOverride, "findAll", async () => overrides],
  [ClassroomLessonPlacement, "findAll", async () => []],
  [ClassroomLesson, "findAll", async () => []],
  [ClassroomLessonProgress, "findAll", async () => []],
  [ClassroomLessonSubmission, "findAll", async () => []],
], () => getTeacherAnalytics({ req: request, query, now }));

const progressRow = ({
  studentId = 1,
  level = 1,
  progressPercent = 100,
  isCompleted = true,
  attemptCount = 0,
  timeSpentSeconds = 60,
  finalScore = 100,
  hintUsed = false,
  hintType = hintUsed ? "basic" : null,
  detailedHintUnlocked = false,
  startedAt,
  latestFailureCode = null,
  latestFailureCategory = null,
  latestFailureMetadata = {},
  latestFailureAt = null,
  latestFailureAttemptCount = null,
  at = new Date("2026-09-17T12:00:00Z"),
} = {}) => ({
  userId: studentId,
  levelKey: `tutorial-level-${level}`,
  progressPercent,
  isCompleted,
  completedAt: isCompleted ? at : null,
  attemptCount,
  timeSpentSeconds,
  finalScore: isCompleted ? finalScore : null,
  startedAt: startedAt === undefined ? at : startedAt,
  hintUsed,
  hintUsedAt: hintUsed ? at : null,
  hintType,
  attemptCountAtHintUnlock: hintUsed ? attemptCount : null,
  detailedHintUnlocked,
  detailedHintPurchasedAt: detailedHintUnlocked ? at : null,
  latestFailureCode,
  latestFailureCategory,
  latestFailureMetadata,
  latestFailureAt,
  latestFailureAttemptCount,
  updatedAt: at,
});

const tutorialLesson = (payload) => payload.lessonPerformance.find(
  (lesson) => lesson.id === "curriculum:tutorial",
);

const tutorialCell = (payload, studentId = 1) => payload.heatmap.students
  .find((student) => student.studentId === studentId)?.cells
  .find((cell) => cell.lessonId === "curriculum:tutorial");

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
  let overrideFindCalls = 0;
  await withStubs([
    [Classroom, "findAll", async () => classrooms],
    [ClassroomMembership, "findAll", async (options) => { assert.equal(options.where.status, "active"); return memberships; }],
    [User, "findAll", async () => students],
    [UserProgress, "findAll", async () => { progressFindCalls += 1; return progress; }],
    [LevelContentOverride, "findAll", async () => { overrideFindCalls += 1; return []; }],
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
    assert.equal(overrideFindCalls, 1, "level overrides are fetched once for the selected classroom scope");
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

test("curriculum analytics preserve default enabled behavior when there are no overrides", async () => {
  const payload = await analyticsFixture({
    progress: [1, 2, 3, 4, 5].map((level) => progressRow({ level })),
  });
  const lesson = tutorialLesson(payload);
  assert.equal(lesson.available, true);
  assert.equal(lesson.applicableStudents, 1);
  assert.equal(lesson.averageProgress, 100);
  assert.equal(lesson.completionRate, 100);
  assert.equal(lesson.studentsCompleted, 1);
  assert.equal(tutorialCell(payload).expectedLevels, 5);
  assert.equal(tutorialCell(payload).key, "completed");
});

test("a student completing every enabled level completes the lesson", async () => {
  const payload = await analyticsFixture({
    progress: [1, 2, 3, 4].map((level) => progressRow({ level })),
    overrides: [{ classroomId: 1, levelKey: "tutorial-level-5", isEnabled: false, dueAt: null }],
    query: { classroomId: "1" },
  });
  const lesson = tutorialLesson(payload);
  assert.equal(lesson.averageProgress, 100);
  assert.equal(lesson.completionRate, 100);
  assert.equal(lesson.studentsCompleted, 1);
  assert.equal(tutorialCell(payload).expectedLevels, 4);
  assert.equal(tutorialCell(payload).completedLevels, 4);
  assert.equal(tutorialCell(payload).key, "completed");
});

test("historical progress on a now-disabled level contributes to no current analytics", async () => {
  const disabledHistory = progressRow({
    level: 5,
    attemptCount: 10,
    timeSpentSeconds: 600,
    finalScore: 0,
    hintUsed: true,
  });
  const payload = await analyticsFixture({
    progress: [
      ...[1, 2, 3, 4].map((level) => progressRow({ level })),
      disabledHistory,
    ],
    overrides: [{ classroomId: 1, levelKey: "tutorial-level-5", isEnabled: false, dueAt: null }],
    query: { classroomId: "1" },
  });
  const lesson = tutorialLesson(payload);
  assert.equal(lesson.averageProgress, 100);
  assert.equal(lesson.completionRate, 100);
  assert.equal(lesson.studentsCompleted, 1);
  assert.equal(lesson.averageScore, 100);
  assert.equal(lesson.averageAttempts, 1);
  assert.equal(lesson.averageFailedAttempts, 0);
  assert.equal(lesson.failedAttempts, 0);
  assert.equal(lesson.averageActiveSeconds, 240);
  assert.equal(lesson.hintUsageRate, 0);
  assert.equal(payload.activity.recent.some((item) => item.levelKey === "tutorial-level-5"), false);
  assert.equal(payload.scoresAndAttempts.scoreDistribution.find((row) => row.key === "below-60").count, 0);
  assert.deepEqual(payload.attention, []);
});

test("a lesson with no enabled levels is unavailable and excluded from outcomes", async () => {
  const dueAt = new Date("2026-09-01T00:00:00Z");
  const payload = await analyticsFixture({
    progress: [progressRow({ level: 1, isCompleted: false, progressPercent: 10, attemptCount: 8, hintUsed: true })],
    overrides: [1, 2, 3, 4, 5].map((level) => ({
      classroomId: 1,
      levelKey: `tutorial-level-${level}`,
      isEnabled: false,
      dueAt,
    })),
    query: { classroomId: "1" },
  });
  const lesson = tutorialLesson(payload);
  assert.equal(lesson.available, false);
  assert.equal(lesson.applicableStudents, 0);
  assert.equal(lesson.studentsStarted, 0);
  assert.equal(lesson.studentsCompleted, 0);
  assert.equal(lesson.completionRate, null);
  assert.equal(lesson.averageProgress, null);
  assert.equal(lesson.difficulty.sufficientData, false);
  assert.equal(payload.overview.averageProgress, null);
  assert.equal(payload.overview.completionRate, null);
  assert.deepEqual(payload.attention, []);
  assert.equal(payload.activity.recent.length, 0);
  assert.deepEqual(tutorialCell(payload), {
    lessonId: "curriculum:tutorial",
    key: "unavailable",
    label: "Unavailable",
    progress: null,
    failedAttempts: 0,
    expectedLevels: 0,
    completedLevels: 0,
  });
});

test("enabled-level expectations aggregate correctly for two students", async () => {
  const payload = await analyticsFixture({
    memberships: [{ classroomId: 1, studentId: 1 }, { classroomId: 1, studentId: 2 }],
    students: [1, 2].map((id) => ({ id, firstName: "Student", lastName: String(id), username: `student-${id}`, status: "active" })),
    progress: [
      ...[1, 2, 3, 4].map((level) => progressRow({ studentId: 1, level })),
      ...[1, 2].map((level) => progressRow({ studentId: 2, level })),
    ],
    overrides: [{ classroomId: 1, levelKey: "tutorial-level-5", isEnabled: false, dueAt: null }],
    query: { classroomId: "1" },
  });
  const lesson = tutorialLesson(payload);
  assert.equal(lesson.applicableStudents, 2);
  assert.equal(lesson.studentsStarted, 2);
  assert.equal(lesson.studentsCompleted, 1);
  assert.equal(lesson.completionRate, 50);
  assert.equal(lesson.averageProgress, 75);
});

test("multi-classroom curriculum scope uses one student and the union of enabled levels", async () => {
  const fixture = {
    classrooms: [
      { id: 1, teacherId: 10, isActive: true, className: "Alpha", section: "A" },
      { id: 2, teacherId: 10, isActive: true, className: "Beta", section: "B" },
    ],
    memberships: [{ classroomId: 1, studentId: 1 }, { classroomId: 2, studentId: 1 }],
    progress: [1, 2, 3, 4].map((level) => progressRow({ level })),
    overrides: [
      { classroomId: 1, levelKey: "tutorial-level-5", isEnabled: false, dueAt: null },
      ...[1, 2, 3, 4].map((level) => ({ classroomId: 2, levelKey: `tutorial-level-${level}`, isEnabled: false, dueAt: null })),
    ],
  };
  const classroomPayload = await analyticsFixture({ ...fixture, query: { classroomId: "1" } });
  assert.equal(tutorialLesson(classroomPayload).completionRate, 100);
  assert.equal(tutorialCell(classroomPayload).expectedLevels, 4);

  const allPayload = await analyticsFixture(fixture);
  const allLesson = tutorialLesson(allPayload);
  assert.equal(allPayload.overview.totalStudents, 1);
  assert.equal(allLesson.eligibleStudents, 1);
  assert.equal(allLesson.studentsStarted, 1);
  assert.equal(allLesson.completionRate, 0);
  assert.equal(allLesson.averageProgress, 80);
  assert.equal(tutorialCell(allPayload).expectedLevels, 5);
});

test("a disabled level with a past due date does not create an overdue reason", async () => {
  const payload = await analyticsFixture({
    classrooms: [
      { id: 1, teacherId: 10, isActive: true, className: "Alpha", section: "A" },
      { id: 2, teacherId: 10, isActive: true, className: "Beta", section: "B" },
    ],
    memberships: [{ classroomId: 1, studentId: 1 }, { classroomId: 2, studentId: 1 }],
    progress: [progressRow({ level: 5, isCompleted: false, progressPercent: 50 })],
    overrides: [{
      classroomId: 2,
      levelKey: "tutorial-level-5",
      isEnabled: false,
      dueAt: new Date("2026-09-01T00:00:00Z"),
    }],
  });
  const reasons = payload.studentPerformance[0].attentionReasons;
  assert.equal(reasons.some((reason) => reason.includes("past its class due date")), false);
});

test("an enabled unfinished level with a past due date keeps the overdue attention rule", async () => {
  const payload = await analyticsFixture({
    progress: [progressRow({ level: 1, isCompleted: false, progressPercent: 50 })],
    overrides: [{
      classroomId: 1,
      levelKey: "tutorial-level-1",
      isEnabled: true,
      dueAt: new Date("2026-09-01T00:00:00Z"),
    }],
    query: { classroomId: "1" },
  });
  const reasons = payload.studentPerformance[0].attentionReasons;
  assert.equal(reasons.some((reason) => reason.includes("past its class due date")), true);
});

test("level analytics expose all supported metrics with the documented denominators", async () => {
  const memberships = [1, 2, 3].map((studentId) => ({ classroomId: 1, studentId }));
  const students = [1, 2, 3].map((id) => ({
    id, firstName: "Student", lastName: String(id), username: `student-${id}`, status: "active",
  }));
  const payload = await analyticsFixture({
    memberships,
    students,
    progress: [
      progressRow({ studentId: 1, level: 1, attemptCount: 0, finalScore: 100, timeSpentSeconds: 60 }),
      progressRow({ studentId: 2, level: 1, attemptCount: 2, finalScore: 80, timeSpentSeconds: 120, hintUsed: true }),
      progressRow({
        studentId: 3, level: 1, isCompleted: false, progressPercent: 40, attemptCount: 1,
        timeSpentSeconds: 180, hintUsed: true, hintType: "detailed", detailedHintUnlocked: true,
      }),
    ],
  });
  const level = tutorialLesson(payload).levels.find((item) => item.levelKey === "tutorial-level-1");

  assert.equal(level.levelNumber, 1);
  assert.equal(level.title, "Level 1");
  assert.equal(level.applicableStudents, 3);
  assert.equal(level.studentsStarted, 3);
  assert.equal(level.studentsAttempted, 3);
  assert.equal(level.studentsCompleted, 2);
  assert.equal(level.startRate, 100);
  assert.equal(level.attemptRate, 100);
  assert.equal(level.completionRate, 66.7);
  assert.equal(level.averageScore, 90);
  assert.equal(level.averageAttempts, 1.7);
  assert.equal(level.averageFailedAttempts, 1);
  assert.equal(level.totalFailedAttempts, 3);
  assert.equal(level.averageActiveSeconds, 120);
  assert.equal(level.averageActiveTimeLabel, "2m");
  assert.equal(level.hintUsageRate, 66.7);
  assert.equal(level.basicHintUsers, 1);
  assert.equal(level.purchasedHintUsers, 1);
  assert.equal(level.firstAttemptSuccessRate, 50);
  assert.equal(level.difficulty.sufficientData, true);
});

test("level difficulty remains insufficient below three starters", async () => {
  const payload = await analyticsFixture({
    memberships: [1, 2].map((studentId) => ({ classroomId: 1, studentId })),
    students: [1, 2].map((id) => ({ id, firstName: "Student", lastName: String(id), username: `student-${id}`, status: "active" })),
    progress: [
      progressRow({ studentId: 1, level: 1, attemptCount: 4, isCompleted: false }),
      progressRow({ studentId: 2, level: 1, attemptCount: 3, isCompleted: false }),
    ],
  });
  const level = tutorialLesson(payload).levels.find((item) => item.levelKey === "tutorial-level-1");
  assert.deepEqual(level.difficulty, { score: null, label: null, sufficientData: false });
});

test("lesson funnel distinguishes started, attempted, first-attempt success, and lesson completion", async () => {
  const memberships = [1, 2, 3, 4].map((studentId) => ({ classroomId: 1, studentId }));
  const students = [1, 2, 3, 4].map((id) => ({
    id, firstName: "Student", lastName: String(id), username: `student-${id}`, status: "active",
  }));
  const payload = await analyticsFixture({
    memberships,
    students,
    progress: [
      progressRow({ studentId: 1, level: 1, isCompleted: false, progressPercent: 0, attemptCount: 0 }),
      progressRow({ studentId: 2, level: 1, isCompleted: false, progressPercent: 0, attemptCount: 1 }),
      progressRow({ studentId: 3, level: 1, isCompleted: true, attemptCount: 0 }),
      ...[1, 2, 3, 4, 5].map((level) => progressRow({ studentId: 4, level, isCompleted: true, attemptCount: 0 })),
    ],
  });
  assert.deepEqual(tutorialLesson(payload).funnel, {
    applicable: 4,
    started: 4,
    startedRate: 100,
    attempted: 3,
    attemptedRate: 75,
    completed: 1,
    completionRate: 25,
    startedFromApplicable: 100,
    attemptedFromStarted: 75,
    completedFromAttempted: 33.3,
  });
});

test("disabled historical rows are omitted from level, funnel, and failure analytics", async () => {
  const payload = await analyticsFixture({
    progress: [
      ...[1, 2, 3, 4].map((level) => progressRow({ level })),
      progressRow({
        level: 5, isCompleted: false, attemptCount: 9,
        latestFailureCode: "COMPILER_ERROR", latestFailureCategory: "compilation",
        latestFailureAt: new Date("2026-09-17T12:00:00Z"), latestFailureAttemptCount: 9,
      }),
    ],
    overrides: [{ classroomId: 1, levelKey: "tutorial-level-5", isEnabled: false, dueAt: null }],
    query: { classroomId: "1" },
  });
  const lesson = tutorialLesson(payload);
  assert.equal(lesson.levels.some((level) => level.levelKey === "tutorial-level-5"), false);
  assert.equal(lesson.funnel.applicable, 1);
  assert.equal(lesson.funnel.attempted, 1);
  assert.equal(lesson.funnel.completed, 1);
  assert.equal(payload.failurePatterns.unresolved.signalCount, 0);
});

test("a zero-enabled lesson has no level rows and null funnel rates", async () => {
  const payload = await analyticsFixture({
    overrides: [1, 2, 3, 4, 5].map((level) => ({
      classroomId: 1, levelKey: `tutorial-level-${level}`, isEnabled: false, dueAt: null,
    })),
    query: { classroomId: "1" },
  });
  const lesson = tutorialLesson(payload);
  assert.deepEqual(lesson.levels, []);
  assert.deepEqual(lesson.funnel, {
    applicable: 0,
    started: 0,
    startedRate: null,
    attempted: 0,
    attemptedRate: null,
    completed: 0,
    completionRate: null,
    startedFromApplicable: null,
    attemptedFromStarted: null,
    completedFromAttempted: null,
  });
});

test("multi-classroom union keeps one student per applicable level and funnel", async () => {
  const payload = await analyticsFixture({
    classrooms: [
      { id: 1, teacherId: 10, isActive: true, className: "Alpha", section: "A" },
      { id: 2, teacherId: 10, isActive: true, className: "Beta", section: "B" },
    ],
    memberships: [{ classroomId: 1, studentId: 1 }, { classroomId: 2, studentId: 1 }],
    progress: [1, 2, 3, 4, 5].map((level) => progressRow({ level })),
    overrides: [
      { classroomId: 1, levelKey: "tutorial-level-5", isEnabled: false, dueAt: null },
      ...[1, 2, 3, 4].map((level) => ({ classroomId: 2, levelKey: `tutorial-level-${level}`, isEnabled: false, dueAt: null })),
    ],
  });
  const lesson = tutorialLesson(payload);
  assert.equal(lesson.levels.every((level) => level.applicableStudents === 1), true);
  assert.equal(lesson.funnel.applicable, 1);
  assert.equal(lesson.funnel.started, 1);
  assert.equal(lesson.funnel.attempted, 1);
  assert.equal(lesson.funnel.completed, 1);
});

test("level titles use a classroom override only when it is unambiguous in scope", async () => {
  const classrooms = [
    { id: 1, teacherId: 10, isActive: true, className: "Alpha", section: "A" },
    { id: 2, teacherId: 10, isActive: true, className: "Beta", section: "B" },
  ];
  const memberships = [{ classroomId: 1, studentId: 1 }, { classroomId: 2, studentId: 1 }];
  const overrides = [{
    classroomId: 1,
    levelKey: "tutorial-level-1",
    lessonCardTitle: "Variables at the Village Gate",
    isEnabled: true,
    dueAt: null,
  }];
  const single = await analyticsFixture({
    classrooms,
    memberships,
    overrides,
    query: { classroomId: "1" },
  });
  assert.equal(tutorialLesson(single).levels[0].title, "Variables at the Village Gate");

  const all = await analyticsFixture({ classrooms, memberships, overrides });
  assert.equal(tutorialLesson(all).levels[0].title, "Level 1");
});

test("failure patterns aggregate latest signals and separate completed outcomes", async () => {
  const at = new Date("2026-09-17T12:00:00Z");
  const payload = await analyticsFixture({
    memberships: [1, 2, 3].map((studentId) => ({ classroomId: 1, studentId })),
    students: [1, 2, 3].map((id) => ({ id, firstName: "Student", lastName: String(id), username: `student-${id}`, status: "active" })),
    progress: [
      progressRow({ studentId: 1, level: 1, isCompleted: false, attemptCount: 7, latestFailureCode: "COMPILER_MISSING_SEMICOLON", latestFailureCategory: "syntax", latestFailureAt: at, latestFailureAttemptCount: 7 }),
      progressRow({ studentId: 1, level: 2, isCompleted: false, attemptCount: 2, latestFailureCode: "COMPILER_UNMATCHED_DELIMITER", latestFailureCategory: "syntax", latestFailureAt: at, latestFailureAttemptCount: 2 }),
      progressRow({ studentId: 2, level: 1, isCompleted: false, attemptCount: 3, latestFailureCode: "WRONG_VALUE", latestFailureCategory: "wrong_logic", latestFailureAt: at, latestFailureAttemptCount: 3 }),
      progressRow({ studentId: 3, level: 1, isCompleted: true, attemptCount: 1, latestFailureCode: "COMPILER_ERROR", latestFailureCategory: "compilation", latestFailureAt: at, latestFailureAttemptCount: 1 }),
    ],
  });
  const unresolved = payload.failurePatterns.unresolved;
  const completed = payload.failurePatterns.completedAfterFailure;
  const syntax = unresolved.categories.find((category) => category.category === "syntax");

  assert.equal(unresolved.signalCount, 3, "one current signal per unfinished student-level, not cumulative attempts");
  assert.equal(unresolved.affectedStudents, 2);
  assert.equal(syntax.label, "Syntax");
  assert.equal(syntax.affectedStudents, 1);
  assert.equal(syntax.affectedLevels, 2);
  assert.equal(syntax.codes.find((code) => code.code === "COMPILER_MISSING_SEMICOLON").affectedStudents, 1);
  assert.equal(syntax.levels.find((level) => level.levelKey === "tutorial-level-1").affectedStudents, 1);
  assert.equal(completed.signalCount, 1);
  assert.equal(completed.affectedStudents, 1);
  assert.equal(completed.categories[0].category, "compilation");
  assert.equal(tutorialLesson(payload).levels.find((level) => level.levelNumber === 1).failurePatterns.completedAfterFailureStudents, 1);
});

test("failure patterns use latestFailureAt for date filters", async () => {
  const payload = await analyticsFixture({
    progress: [progressRow({
      isCompleted: false,
      attemptCount: 1,
      latestFailureCode: "WRONG_VALUE",
      latestFailureCategory: "wrong_logic",
      latestFailureAt: new Date("2026-08-01T12:00:00Z"),
      latestFailureAttemptCount: 1,
      at: new Date("2026-09-17T12:00:00Z"),
    })],
    query: { datePreset: "7d" },
  });
  assert.equal(payload.failurePatterns.unresolved.signalCount, 0);
});

test("analytics reject lesson filters outside the authorized scope", async () => {
  await assert.rejects(
    analyticsFixture({ query: { lessonId: "custom:999:123" } }),
    (error) => error.status === 403,
  );
});

test("analytics reject students outside the authorized classroom scope", async () => {
  await assert.rejects(
    analyticsFixture({ query: { studentId: "999" } }),
    (error) => error.status === 403,
  );
});
