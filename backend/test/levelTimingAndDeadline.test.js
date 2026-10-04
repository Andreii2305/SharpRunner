const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Op } = require("sequelize");
const sequelize = require("../src/config/database");
const LearningAnalyticsEvent = require("../src/models/LearningAnalyticsEvent");
const UserProgress = require("../src/models/UserProgress");
const LessonAssessment = require("../src/models/LessonAssessment");
const AssessmentAttempt = require("../src/models/AssessmentAttempt");
const {
  heartbeatProgressSession,
  pauseProgressSession,
  startProgressSession,
} = require("../src/services/activeLevelTimerService");
const {
  evaluateStudentLevelAccess,
  getEffectiveDueAt,
  getStudentLevelAccess,
  restrictionPayload,
} = require("../src/services/levelAccessService");

const progressRow = (overrides = {}) => ({
  userId: 1,
  levelKey: "tutorial-level-1",
  isCompleted: false,
  timeSpentSeconds: 0,
  activeSessionId: null,
  activeSessionStartedAt: null,
  lastHeartbeatAt: null,
  startedAt: null,
  save: async () => undefined,
  ...overrides,
});

const withStubs = async (stubs, callback) => {
  const originals = stubs.map(([target, property]) => [target, property, target[property]]);
  for (const [target, property, replacement] of stubs) target[property] = replacement;
  try {
    return await callback();
  } finally {
    for (const [target, property, original] of originals) target[property] = original;
  }
};

test("timer history stores one first start and accepted deltas rather than cumulative totals", async () => {
  const row = progressRow();
  const events = [];
  const context = { studentId: 1, classroomId: 9 };
  const began = new Date("2026-09-21T00:00:00Z");

  await withStubs([
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
    [LearningAnalyticsEvent, "findOne", async ({ where }) => (
      events.find((event) => event.dedupeKey === where.dedupeKey) ?? null
    )],
    [LearningAnalyticsEvent, "create", async (values) => {
      events.push({ ...values });
      return values;
    }],
  ], async () => {
    await startProgressSession(row, "session_one", began, {
      ...context,
      syncId: "start_sync_123",
    });
    await heartbeatProgressSession(
      row,
      "session_one",
      new Date("2026-09-21T00:00:30Z"),
      { ...context, syncId: "timer_sync_123" },
    );
    await startProgressSession(row, "session_two", new Date("2026-09-21T04:00:00Z"), {
      ...context,
      syncId: "start_sync_456",
    });
  });

  assert.deepEqual(events.map((event) => [event.eventType, event.activeSeconds]), [
    ["level_started", null],
    ["active_time_recorded", 30],
  ]);
  assert.equal(events[0].classroomId, 9);
  assert.equal(row.timeSpentSeconds, 30);
});

test("retried, stale, zero, and negative timer synchronizations add no duplicate history", async () => {
  const row = progressRow({
    startedAt: new Date("2026-09-21T00:00:00Z"),
    activeSessionId: "session_one",
    activeSessionStartedAt: new Date("2026-09-21T00:00:00Z"),
    lastHeartbeatAt: new Date("2026-09-21T00:00:00Z"),
  });
  const events = [];
  const context = { studentId: 1, classroomId: 9 };

  await withStubs([
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
    [LearningAnalyticsEvent, "findOne", async ({ where }) => (
      events.find((event) => event.dedupeKey === where.dedupeKey) ?? null
    )],
    [LearningAnalyticsEvent, "create", async (values) => {
      events.push({ ...values });
      return values;
    }],
  ], async () => {
    const acceptedAt = new Date("2026-09-21T00:00:30Z");
    await heartbeatProgressSession(row, "session_one", acceptedAt, {
      ...context,
      syncId: "timer_retry_123",
    });
    await heartbeatProgressSession(row, "session_one", acceptedAt, {
      ...context,
      syncId: "timer_retry_123",
    });
    await heartbeatProgressSession(row, "session_one", new Date("2026-09-21T00:01:30Z"), {
      ...context,
      syncId: "timer_stale_123",
    });
    await heartbeatProgressSession(row, "session_one", new Date("2026-09-21T00:01:30Z"), {
      ...context,
      syncId: "timer_zero_123",
    });
    await heartbeatProgressSession(row, "session_one", new Date("2026-09-21T00:01:00Z"), {
      ...context,
      syncId: "timer_negative_123",
    });
  });

  assert.equal(row.timeSpentSeconds, 30);
  assert.deepEqual(events.map((event) => event.activeSeconds), [30]);
});

test("out-of-order heartbeats keep the locked watermark monotonic", async () => {
  const row = progressRow({
    startedAt: new Date("2026-09-21T00:00:00Z"),
    activeSessionId: "session_one",
    activeSessionStartedAt: new Date("2026-09-21T00:00:00Z"),
    lastHeartbeatAt: new Date("2026-09-21T00:00:00Z"),
  });
  const events = [];
  const context = { studentId: 1, classroomId: 9 };

  await withStubs([
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
    [LearningAnalyticsEvent, "findOne", async ({ where }) => (
      events.find((event) => event.dedupeKey === where.dedupeKey) ?? null
    )],
    [LearningAnalyticsEvent, "create", async (values) => {
      events.push({ ...values });
      return values;
    }],
  ], async () => {
    await heartbeatProgressSession(row, "session_one", new Date("2026-09-21T00:00:30Z"), {
      ...context, syncId: "timer_order_030",
    });
    await heartbeatProgressSession(row, "session_one", new Date("2026-09-21T00:00:20Z"), {
      ...context, syncId: "timer_order_020",
    });
    await heartbeatProgressSession(row, "session_one", new Date("2026-09-21T00:00:40Z"), {
      ...context, syncId: "timer_order_040",
    });
  });

  assert.equal(row.timeSpentSeconds, 40);
  assert.equal(row.lastHeartbeatAt.toISOString(), "2026-09-21T00:00:40.000Z");
  assert.deepEqual(events.map((event) => event.activeSeconds), [30, 10]);
});

test("a delayed replacement start cannot move the timer watermark backward", async () => {
  const row = progressRow({
    startedAt: new Date("2026-09-21T00:00:00Z"),
    activeSessionId: "session_one",
    activeSessionStartedAt: new Date("2026-09-21T00:00:00Z"),
    lastHeartbeatAt: new Date("2026-09-21T00:00:00Z"),
  });
  const events = [];
  const context = { studentId: 1, classroomId: 9 };

  await withStubs([
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
    [LearningAnalyticsEvent, "findOne", async ({ where }) => (
      events.find((event) => event.dedupeKey === where.dedupeKey) ?? null
    )],
    [LearningAnalyticsEvent, "create", async (values) => {
      events.push({ ...values });
      return values;
    }],
  ], async () => {
    await heartbeatProgressSession(row, "session_one", new Date("2026-09-21T00:00:30Z"), {
      ...context, syncId: "timer_replace_030",
    });
    await startProgressSession(row, "session_two", new Date("2026-09-21T00:00:20Z"), {
      ...context, syncId: "timer_replace_020",
    });
    await heartbeatProgressSession(row, "session_two", new Date("2026-09-21T00:00:40Z"), {
      ...context, syncId: "timer_replace_040",
    });
  });

  assert.equal(row.activeSessionId, "session_two");
  assert.equal(row.timeSpentSeconds, 40);
  assert.equal(row.lastHeartbeatAt.toISOString(), "2026-09-21T00:00:40.000Z");
  assert.deepEqual(events.map((event) => event.activeSeconds), [30, 10]);
});

test("timer mutations recheck completed and replacement state after locking", async () => {
  const events = [];
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const context = { studentId: 1, classroomId: 9, syncId: "timer_lock_123" };

  await withStubs([
    [sequelize, "transaction", async (callback) => callback(transaction)],
    [LearningAnalyticsEvent, "findOne", async () => null],
    [LearningAnalyticsEvent, "create", async (values) => {
      events.push({ ...values });
      return values;
    }],
  ], async () => {
    const replaced = progressRow({
      activeSessionId: "session_one",
      lastHeartbeatAt: new Date("2026-09-21T00:00:00Z"),
      reload: async function reload() {
        this.activeSessionId = "session_two";
        this.lastHeartbeatAt = new Date("2026-09-21T00:00:20Z");
      },
    });
    const heartbeat = await heartbeatProgressSession(
      replaced,
      "session_one",
      new Date("2026-09-21T00:00:40Z"),
      context,
    );
    assert.equal(heartbeat.replaced, true);
    assert.equal(replaced.timeSpentSeconds, 0);
    assert.equal(replaced.activeSessionId, "session_two");

    const staleEnd = progressRow({
      activeSessionId: "session_one",
      lastHeartbeatAt: new Date("2026-09-21T00:00:00Z"),
      reload: async function reload() {
        this.activeSessionId = "session_two";
        this.lastHeartbeatAt = new Date("2026-09-21T00:00:20Z");
      },
    });
    const end = await pauseProgressSession(staleEnd, {
      now: new Date("2026-09-21T00:00:40Z"),
      expectedSessionId: "session_one",
      analyticsContext: { ...context, syncId: "timer_lock_end_123" },
    });
    assert.equal(end.ended, false);
    assert.equal(staleEnd.activeSessionId, "session_two");
    assert.equal(staleEnd.timeSpentSeconds, 0);

    const completed = progressRow({
      reload: async function reload() {
        this.isCompleted = true;
      },
    });
    const start = await startProgressSession(
      completed,
      "session_three",
      new Date("2026-09-21T00:00:40Z"),
      { ...context, syncId: "timer_lock_start_123" },
    );
    assert.equal(start.completed, true);
    assert.equal(completed.activeSessionId, null);
  });

  assert.deepEqual(events, []);
});

test("active timer accumulates confirmed visible segments and not closed time", async () => {
  const row = progressRow();
  const began = new Date("2026-09-05T00:00:00Z");
  await startProgressSession(row, "session_one", began);
  await heartbeatProgressSession(row, "session_one", new Date("2026-09-05T00:00:30Z"));
  await pauseProgressSession(row, { now: new Date("2026-09-05T00:00:40Z") });
  assert.equal(row.timeSpentSeconds, 40);

  await startProgressSession(row, "session_two", new Date("2026-09-05T04:00:00Z"));
  assert.equal(row.timeSpentSeconds, 40, "four closed hours are not accumulated");
  await heartbeatProgressSession(row, "session_two", new Date("2026-09-05T04:00:30Z"));
  assert.equal(row.timeSpentSeconds, 70);
});

test("stale sessions cap unconfirmed time and replaced tabs cannot heartbeat", async () => {
  const row = progressRow();
  await startProgressSession(row, "first_tab", new Date("2026-09-05T00:00:00Z"));
  await startProgressSession(row, "second_tab", new Date("2026-09-05T01:00:00Z"));
  assert.equal(row.timeSpentSeconds, 0);
  const oldTab = await heartbeatProgressSession(row, "first_tab", new Date("2026-09-05T01:00:30Z"));
  assert.equal(oldTab.replaced, true);
  assert.equal(row.timeSpentSeconds, 0);
});

test("effective deadlines use the later class or individual date", () => {
  assert.equal(getEffectiveDueAt(null, "2026-09-20T00:00:00Z"), null);
  assert.equal(
    getEffectiveDueAt("2026-09-12T00:00:00Z", "2026-09-16T00:00:00Z").toISOString(),
    "2026-09-16T00:00:00.000Z",
  );
  assert.equal(
    getEffectiveDueAt("2026-09-18T00:00:00Z", "2026-09-16T00:00:00Z").toISOString(),
    "2026-09-18T00:00:00.000Z",
  );
});

test("unfinished work expires while completed work remains accessible", () => {
  const settings = [{
    levelKey: "tutorial-level-1",
    isEnabled: true,
    unlockAt: null,
    dueAt: new Date("2026-09-12T00:00:00Z"),
  }];
  const unfinished = new Map([["tutorial-level-1", progressRow()]]);
  const expired = evaluateStudentLevelAccess({
    levelKey: "tutorial-level-1",
    settings,
    progressByKey: unfinished,
    now: new Date("2026-09-13T00:00:00Z"),
  });
  assert.equal(expired.allowed, false);
  assert.equal(expired.reason, "DEADLINE_PASSED");

  unfinished.get("tutorial-level-1").isCompleted = true;
  const completed = evaluateStudentLevelAccess({
    levelKey: "tutorial-level-1",
    settings,
    progressByKey: unfinished,
    now: new Date("2026-09-13T00:00:00Z"),
  });
  assert.equal(completed.allowed, true);
  assert.equal(completed.reason, "COMPLETED");
});

const levelSetting = (levelKey, displayOrder, overrides = {}) => ({
  levelKey,
  displayOrder,
  isEnabled: true,
  unlockAt: null,
  dueAt: null,
  ...overrides,
});

const lessonState = (lessonKey, overrides = {}) => ({
  lessonKey,
  prerequisiteLessonKey: lessonKey === "tutorial" ? null : "tutorial",
  curriculumPrerequisiteSatisfied: true,
  preRequired: false,
  preAttemptInProgress: false,
  preCompleted: false,
  preAssessmentId: null,
  gameCompleted: false,
  postRequired: false,
  postAssessmentId: null,
  postAttemptInProgress: false,
  postCompleted: false,
  postPassingRequired: false,
  postPassed: false,
  postAttemptsRemaining: 0,
  nextAction: "PLAY_GAME",
  ...overrides,
});

test("required PRE blocks both first and later incomplete lesson levels before sequencing", () => {
  const settings = [
    levelSetting("arrays-level-1", 1),
    levelSetting("arrays-level-2", 2),
  ];
  const progressByKey = new Map([
    ["arrays-level-1", progressRow({ levelKey: "arrays-level-1" })],
    ["arrays-level-2", progressRow({ levelKey: "arrays-level-2" })],
  ]);
  const state = lessonState("arrays", {
    preRequired: true,
    preAssessmentId: 81,
    nextAction: "TAKE_PRE",
  });

  for (const levelKey of ["arrays-level-1", "arrays-level-2"]) {
    const access = evaluateStudentLevelAccess({
      levelKey,
      settings,
      progressByKey,
      lessonProgressionState: state,
    });
    assert.equal(access.allowed, false);
    assert.equal(access.reason, "PRE_ASSESSMENT_REQUIRED");
    assert.equal(access.lessonKey, "arrays");
    assert.equal(access.assessmentRequired, true);
    assert.equal(access.assessmentType, "PRE");
    assert.equal(access.assessmentId, 81);
    assert.equal(access.assessmentAction, "TAKE_PRE");
  }
});

test("submitted PRE permits existing same-lesson sequencing to decide access", () => {
  const access = evaluateStudentLevelAccess({
    levelKey: "arrays-level-2",
    settings: [
      levelSetting("arrays-level-1", 1),
      levelSetting("arrays-level-2", 2),
    ],
    progressByKey: new Map([
      ["arrays-level-1", progressRow({ levelKey: "arrays-level-1" })],
      ["arrays-level-2", progressRow({ levelKey: "arrays-level-2" })],
    ]),
    lessonProgressionState: lessonState("arrays", {
      preRequired: true,
      preCompleted: true,
      preAssessmentId: 81,
    }),
  });

  assert.equal(access.allowed, false);
  assert.equal(access.reason, "LEVEL_LOCKED");
  assert.equal(access.prerequisiteLevelKey, "arrays-level-1");
});

test("an incomplete prior canonical lesson blocks entry before PRE and level sequencing", () => {
  const access = evaluateStudentLevelAccess({
    levelKey: "functions-level-1",
    settings: [levelSetting("functions-level-1", 1)],
    progressByKey: new Map([
      ["functions-level-1", progressRow({ levelKey: "functions-level-1" })],
    ]),
    lessonProgressionState: lessonState("functions", {
      prerequisiteLessonKey: "arrays",
      curriculumPrerequisiteSatisfied: false,
      preRequired: true,
      preAssessmentId: 91,
      nextAction: "COMPLETE_PREREQUISITE_LESSON",
    }),
  });

  assert.equal(access.allowed, false);
  assert.equal(access.reason, "LESSON_PREREQUISITE_REQUIRED");
  assert.equal(access.lessonKey, "functions");
  assert.equal(access.prerequisiteLessonKey, "arrays");
  assert.equal(access.nextAction, "COMPLETE_PREREQUISITE_LESSON");
  assert.equal(access.assessmentId, undefined);
});

test("teacher displayOrder selects the previous enabled playable level only within the target lesson", () => {
  const access = evaluateStudentLevelAccess({
    levelKey: "arrays-level-2",
    settings: [
      levelSetting("tutorial-level-5", 10),
      levelSetting("arrays-level-1", 20),
      levelSetting("tutorial-level-1", 25),
      levelSetting("arrays-level-2", 30),
    ],
    progressByKey: new Map([
      ["tutorial-level-1", progressRow({ levelKey: "tutorial-level-1", isCompleted: true })],
      ["arrays-level-1", progressRow({ levelKey: "arrays-level-1" })],
      ["arrays-level-2", progressRow({ levelKey: "arrays-level-2" })],
    ]),
    lessonProgressionState: lessonState("arrays"),
  });

  assert.equal(access.allowed, false);
  assert.equal(access.reason, "LEVEL_LOCKED");
  assert.equal(access.prerequisiteLevelKey, "arrays-level-1");
});

test("cross-lesson displayOrder interleaving cannot create a prerequisite cycle", () => {
  const access = evaluateStudentLevelAccess({
    levelKey: "tutorial-level-5",
    settings: [
      levelSetting("tutorial-level-4", 10),
      levelSetting("arrays-level-1", 20),
      levelSetting("tutorial-level-5", 30),
    ],
    progressByKey: new Map([
      ["tutorial-level-4", progressRow({ levelKey: "tutorial-level-4", isCompleted: true })],
      ["arrays-level-1", progressRow({ levelKey: "arrays-level-1" })],
      ["tutorial-level-5", progressRow({ levelKey: "tutorial-level-5" })],
    ]),
    lessonProgressionState: lessonState("tutorial"),
  });

  assert.equal(access.allowed, true);
  assert.equal(access.reason, null);
});

test("access without preloaded state still ignores cross-lesson displayOrder predecessors", () => {
  const access = evaluateStudentLevelAccess({
    levelKey: "tutorial-level-5",
    settings: [
      levelSetting("tutorial-level-4", 10),
      levelSetting("arrays-level-1", 20),
      levelSetting("tutorial-level-5", 30),
    ],
    progressByKey: new Map([
      ["tutorial-level-4", progressRow({ levelKey: "tutorial-level-4", isCompleted: true })],
      ["arrays-level-1", progressRow({ levelKey: "arrays-level-1" })],
      ["tutorial-level-5", progressRow({ levelKey: "tutorial-level-5" })],
    ]),
  });

  assert.equal(access.allowed, true);
  assert.equal(access.reason, null);
});

test("no-preload access reads only the target canonical-prefix progress rows", async () => {
  const expectedPrefixLevelKeys = [
    "tutorial-level-1",
    "tutorial-level-2",
    "tutorial-level-3",
    "tutorial-level-4",
    "tutorial-level-5",
    "arrays-level-1",
    "arrays-level-2",
    "arrays-level-3",
    "arrays-level-4",
    "arrays-level-5",
    "arrays-level-6",
    "arrays-level-7",
    "arrays-level-8",
  ];
  const progressQueries = [];
  const progressRows = expectedPrefixLevelKeys.map((levelKey) => ({
    levelKey,
    isCompleted: levelKey.startsWith("tutorial-") || levelKey === "arrays-level-1",
  }));

  await withStubs([
    [UserProgress, "findAll", async (options) => {
      progressQueries.push(options);
      return progressRows;
    }],
    [LessonAssessment, "findAll", async () => []],
  ], async () => {
    const access = await getStudentLevelAccess({
      userId: 1,
      levelKey: "arrays-level-2",
      membership: { classroomId: 9, studentId: 1, status: "active" },
      levelSettings: [
        levelSetting("arrays-level-1", 1),
        levelSetting("arrays-level-2", 2),
      ],
    });
    assert.equal(access.allowed, true);
  });

  assert.equal(progressQueries.length, 1);
  assert.deepEqual(progressQueries[0].where, {
    userId: 1,
    levelKey: { [Op.in]: expectedPrefixLevelKeys },
  });
});

test("completed non-playable target replay is included beside the playable canonical prefix", async () => {
  const targetLevelKey = "functions-level-12";
  const canonicalPlayablePrefix = [
    ...Array.from({ length: 5 }, (_, index) => `tutorial-level-${index + 1}`),
    ...Array.from({ length: 8 }, (_, index) => `arrays-level-${index + 1}`),
    ...Array.from({ length: 11 }, (_, index) => `functions-level-${index + 1}`),
  ];
  const progressQueries = [];
  const rowsByLevelKey = new Map([
    ...canonicalPlayablePrefix.map((levelKey) => [levelKey, {
      levelKey,
      isCompleted: true,
    }]),
    [targetLevelKey, { levelKey: targetLevelKey, isCompleted: true }],
  ]);

  await withStubs([
    [UserProgress, "findAll", async (options) => {
      progressQueries.push(options);
      const requestedLevelKeys = options.where.levelKey[Op.in];
      return requestedLevelKeys.map((levelKey) => rowsByLevelKey.get(levelKey)).filter(Boolean);
    }],
    [LessonAssessment, "findAll", async () => [{
      id: 82,
      classroomId: 9,
      lessonKey: "functions",
      type: "PRE",
      isPublished: true,
      isRequired: true,
      maxAttempts: 1,
      requirePassingForCompletion: false,
    }]],
    [AssessmentAttempt, "findAll", async () => []],
  ], async () => {
    const access = await getStudentLevelAccess({
      userId: 1,
      levelKey: targetLevelKey,
      membership: { classroomId: 9, studentId: 1, status: "active" },
      levelSettings: [levelSetting(targetLevelKey, 1, { isEnabled: false })],
    });
    assert.equal(access.allowed, true);
    assert.equal(access.reason, "COMPLETED");
  });

  assert.deepEqual(progressQueries[0].where.levelKey[Op.in], [
    ...canonicalPlayablePrefix,
    targetLevelKey,
  ]);
});

test("same-lesson PRE debt wins before completed replay", () => {
  const access = evaluateStudentLevelAccess({
    levelKey: "arrays-level-1",
    settings: [levelSetting("arrays-level-1", 1)],
    progressByKey: new Map([
      ["arrays-level-1", progressRow({ levelKey: "arrays-level-1", isCompleted: true })],
    ]),
    lessonProgressionState: lessonState("arrays", {
      preRequired: true,
      preAssessmentId: 81,
      preAttemptInProgress: false,
      preCompleted: false,
      gameCompleted: true,
      nextAction: "TAKE_PRE",
    }),
  });

  assert.equal(access.allowed, false);
  assert.equal(access.reason, "PRE_ASSESSMENT_REQUIRED");
  assert.equal(access.completed, true);
  assert.equal(access.assessmentAction, "TAKE_PRE");
});

test("same-lesson POST actions including recovery win before completed replay", () => {
  for (const action of ["TAKE_POST", "RESUME_POST", "RETRY_POST", "POST_RECOVERY_REQUIRED"]) {
    const access = evaluateStudentLevelAccess({
      levelKey: "arrays-level-1",
      settings: [levelSetting("arrays-level-1", 1)],
      progressByKey: new Map([
        ["arrays-level-1", progressRow({ levelKey: "arrays-level-1", isCompleted: true })],
      ]),
      lessonProgressionState: lessonState("arrays", {
        preCompleted: true,
        gameCompleted: true,
        postRequired: true,
        postAssessmentId: 92,
        postAttemptInProgress: action === "RESUME_POST",
        postCompleted: ["RETRY_POST", "POST_RECOVERY_REQUIRED"].includes(action),
        postPassingRequired: true,
        postPassed: false,
        postAttemptsRemaining: action === "POST_RECOVERY_REQUIRED" ? 0 : 2,
        nextAction: action,
      }),
    });
    assert.equal(access.allowed, false, action);
    assert.equal(access.reason, "POST_ASSESSMENT_REQUIRED", action);
    assert.equal(access.completed, true, action);
    assert.equal(access.assessmentType, "POST", action);
    assert.equal(access.assessmentAction, action, action);
    assert.equal(access.routable, action !== "POST_RECOVERY_REQUIRED", action);
  }
});

test("unrelated earlier debt preserves completed later replay but blocks unfinished progression", () => {
  const state = lessonState("functions", {
    prerequisiteLessonKey: "arrays",
    curriculumPrerequisiteSatisfied: false,
    nextAction: "COMPLETE_PREREQUISITE_LESSON",
  });
  const input = {
    levelKey: "functions-level-1",
    settings: [levelSetting("functions-level-1", 1)],
    progressByKey: new Map([
      ["functions-level-1", progressRow({ levelKey: "functions-level-1", isCompleted: true })],
    ]),
    lessonProgressionState: state,
  };
  assert.equal(evaluateStudentLevelAccess(input).reason, "COMPLETED");
  input.progressByKey.get("functions-level-1").isCompleted = false;
  assert.equal(evaluateStudentLevelAccess(input).reason, "LESSON_PREREQUISITE_REQUIRED");

  state.curriculumPrerequisiteSatisfied = true;
  Object.assign(state, {
    preRequired: true,
    preAssessmentId: 93,
    preCompleted: false,
    nextAction: "TAKE_PRE",
  });
  input.progressByKey.get("functions-level-1").isCompleted = true;
  assert.equal(evaluateStudentLevelAccess(input).reason, "PRE_ASSESSMENT_REQUIRED");
});

test("invalid assessment state fails closed without routable metadata", () => {
  const access = evaluateStudentLevelAccess({
    levelKey: "arrays-level-1",
    settings: [levelSetting("arrays-level-1", 1)],
    progressByKey: new Map([
      ["arrays-level-1", progressRow({ levelKey: "arrays-level-1", isCompleted: true })],
    ]),
    lessonProgressionState: lessonState("arrays", {
      preRequired: true,
      preAssessmentId: null,
      nextAction: "TAKE_PRE",
    }),
  });
  assert.equal(access.reason, "ASSESSMENT_STATE_INVALID");
  assert.equal(access.assessmentId, undefined);
  assert.equal(access.assessmentAction, undefined);
  assert.deepEqual(restrictionPayload(access), {
    code: "ASSESSMENT_STATE_INVALID",
    effectiveDueAt: null,
    message: "Level access changed. Return to the lesson map and try again.",
    assessmentRequired: false,
    assessmentType: null,
    assessmentId: null,
    assessmentAction: null,
  });
});

test("disabled, scheduled, deadline, extension, and completion precedence remains unchanged", () => {
  const now = new Date("2026-09-15T00:00:00Z");
  const state = lessonState("arrays");
  const progressByKey = new Map([
    ["arrays-level-1", progressRow({ levelKey: "arrays-level-1" })],
  ]);
  const decide = (overrides, extensionDueAt = null) => evaluateStudentLevelAccess({
    levelKey: "arrays-level-1",
    settings: [levelSetting("arrays-level-1", 1, overrides)],
    progressByKey,
    lessonProgressionState: state,
    extensionDueAt,
    now,
  });

  assert.equal(decide({ isEnabled: false }).reason, "LEVEL_DISABLED");
  assert.equal(decide({
    unlockAt: new Date("2026-09-20T00:00:00Z"),
    dueAt: new Date("2026-09-10T00:00:00Z"),
  }).reason, "LEVEL_SCHEDULED");
  assert.equal(decide({ dueAt: new Date("2026-09-10T00:00:00Z") }).reason, "DEADLINE_PASSED");
  assert.equal(decide(
    { dueAt: new Date("2026-09-10T00:00:00Z") },
    new Date("2026-09-20T00:00:00Z"),
  ).allowed, true);

  progressByKey.get("arrays-level-1").isCompleted = true;
  assert.equal(decide({ isEnabled: false }).reason, "COMPLETED");
});

test("tutorial has no assessment gate and final has only the prior-lesson gate", () => {
  const tutorial = evaluateStudentLevelAccess({
    levelKey: "tutorial-level-1",
    settings: [levelSetting("tutorial-level-1", 1)],
    progressByKey: new Map([
      ["tutorial-level-1", progressRow({ levelKey: "tutorial-level-1" })],
    ]),
    lessonProgressionState: lessonState("tutorial"),
  });
  assert.equal(tutorial.allowed, true);

  const finalState = lessonState("final", {
    prerequisiteLessonKey: "functions-with-arrays",
    curriculumPrerequisiteSatisfied: false,
  });
  const finalInput = {
    levelKey: "final-level-1",
    settings: [levelSetting("final-level-1", 1)],
    progressByKey: new Map([
      ["final-level-1", progressRow({ levelKey: "final-level-1" })],
    ]),
    lessonProgressionState: finalState,
  };
  assert.equal(
    evaluateStudentLevelAccess(finalInput).reason,
    "LESSON_PREREQUISITE_REQUIRED",
  );
  finalState.curriculumPrerequisiteSatisfied = true;
  const unlockedFinal = evaluateStudentLevelAccess(finalInput);
  assert.equal(unlockedFinal.allowed, true);
  assert.equal(unlockedFinal.reason, null);
});
