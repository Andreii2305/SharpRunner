const assert = require("node:assert/strict");
const { test } = require("node:test");
const sequelize = require("../src/config/database");
const LearningAnalyticsEvent = require("../src/models/LearningAnalyticsEvent");
const {
  heartbeatProgressSession,
  pauseProgressSession,
  startProgressSession,
} = require("../src/services/activeLevelTimerService");
const {
  evaluateStudentLevelAccess,
  getEffectiveDueAt,
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
