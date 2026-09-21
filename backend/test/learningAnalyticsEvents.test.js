const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { Op } = require("sequelize");

let LearningAnalyticsEvent = null;
let eventService = null;
let historyService = null;

try {
  LearningAnalyticsEvent = require("../src/models/LearningAnalyticsEvent");
  eventService = require("../src/services/learningAnalyticsEventService");
  historyService = require("../src/services/learningAnalyticsHistoryService");
} catch {
  // The first TDD run intentionally reaches these assertions before the
  // production model and service exist.
}

const withStub = async (target, property, replacement, callback) => {
  const original = target[property];
  target[property] = replacement;
  try {
    return await callback();
  } finally {
    target[property] = original;
  }
};

test("learning event schema is typed, append-only, and excludes sensitive payload fields", () => {
  assert.ok(LearningAnalyticsEvent, "LearningAnalyticsEvent model must exist");
  const fields = LearningAnalyticsEvent.rawAttributes;
  for (const required of [
    "studentId", "classroomId", "levelKey", "lessonKey", "eventType",
    "occurredAt", "attemptNumber", "score", "failureCategory", "failureCode",
    "activeSeconds", "hintType", "hintPurchased", "dedupeKey", "createdAt",
  ]) {
    assert.ok(fields[required], `${required} must be modeled`);
  }
  assert.equal(fields.updatedAt, undefined);
  for (const forbidden of [
    "sourceCode", "stdout", "stderr", "metadata", "requestPayload",
    "authentication", "token", "ipAddress", "latestFailureMetadata",
  ]) {
    assert.equal(fields[forbidden], undefined, `${forbidden} must not be modeled`);
  }
});

test("typed failed-attempt writer stores only normalized analytics facts", async () => {
  assert.ok(eventService, "learningAnalyticsEventService must exist");
  let created = null;
  const occurredAt = new Date("2026-09-21T02:03:04.000Z");

  await withStub(LearningAnalyticsEvent, "create", async (values) => {
    created = values;
    return values;
  }, () => eventService.recordFailedAttempt({
    studentId: 1,
    classroomId: 2,
    levelKey: "arrays-level-8",
    attemptNumber: 3,
    failureCategory: "incorrect_output",
    failureCode: "OUTPUT_MISMATCH",
    activityId: "attempt_action_123",
    occurredAt,
    sourceCode: "secret source",
    stderr: "compiler dump",
    latestFailureMetadata: { actual: "private" },
  }));

  assert.deepEqual({
    studentId: created.studentId,
    classroomId: created.classroomId,
    lessonKey: created.lessonKey,
    levelKey: created.levelKey,
    eventType: created.eventType,
    attemptNumber: created.attemptNumber,
    failureCategory: created.failureCategory,
    failureCode: created.failureCode,
    occurredAt: created.occurredAt,
  }, {
    studentId: 1,
    classroomId: 2,
    lessonKey: "arrays",
    levelKey: "arrays-level-8",
    eventType: "solution_attempt_failed",
    attemptNumber: 3,
    failureCategory: "incorrect_output",
    failureCode: "OUTPUT_MISMATCH",
    occurredAt,
  });
  assert.match(created.dedupeKey, /^failed-attempt:[a-f0-9]{64}$/);
  assert.equal(created.sourceCode, undefined);
  assert.equal(created.stderr, undefined);
  assert.equal(created.latestFailureMetadata, undefined);
  assert.equal(created.metadata, undefined);
});

test("first-completion identity is stable across request retries", async () => {
  const created = [];
  await withStub(LearningAnalyticsEvent, "create", async (values) => {
    created.push(values);
    return values;
  }, async () => {
    await eventService.recordLevelCompleted({
      studentId: 1,
      classroomId: 2,
      levelKey: "arrays-level-8",
      attemptNumber: 2,
      score: 95,
      activityId: "completion_action_123",
    });
    await eventService.recordLevelCompleted({
      studentId: 1,
      classroomId: 2,
      levelKey: "arrays-level-8",
      attemptNumber: 2,
      score: 95,
      activityId: "completion_action_456",
    });
  });

  assert.equal(created[0].dedupeKey, created[1].dedupeKey);
  assert.match(created[0].dedupeKey, /^level-completed:[a-f0-9]{64}$/);
});

test("event writers reject unsupported or unsafe event values", async () => {
  assert.ok(eventService, "learningAnalyticsEventService must exist");
  await assert.rejects(
    eventService.recordActiveTime({
      studentId: 1,
      classroomId: 2,
      levelKey: "arrays-level-8",
      activeSeconds: -4,
      syncId: "timer_sync_123",
    }),
    /activeSeconds must be a positive integer/,
  );
  await assert.rejects(
    eventService.recordHintUsed({
      studentId: 1,
      classroomId: 2,
      levelKey: "arrays-level-8",
      hintType: "raw_compiler_hint",
      hintPurchased: false,
    }),
    /hintType must be basic or detailed/,
  );
  await assert.rejects(
    eventService.recordLevelCompleted({
      studentId: 1,
      classroomId: 2,
      levelKey: "arrays-level-8",
      attemptNumber: 1,
      score: 101,
      activityId: "completion_action_123",
    }),
    /score must be between 0 and 100/,
  );
  assert.throws(() => eventService.normalizeActionId("short"), /action identifier/);
});

test("event migration creates protected indexed history without backfilling progress", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../supabase/migrations/20260921000000_learning_analytics_events.sql",
  );
  assert.equal(fs.existsSync(migrationPath), true, "Phase 3 migration must exist");
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS "LearningAnalyticsEvents"/);
  assert.match(sql, /CHECK \("eventType" IN/);
  for (const constraint of [
    "learning_analytics_event_type_valid",
    "learning_analytics_attempt_positive",
    "learning_analytics_score_valid",
    "learning_analytics_active_time_positive",
    "learning_analytics_hint_type_valid",
  ]) {
    assert.match(
      sql,
      new RegExp(`ADD CONSTRAINT "${constraint}"`),
      `${constraint} must also be added when sequelize.sync created the table first`,
    );
  }
  assert.match(sql, /CREATE UNIQUE INDEX[^;]+"dedupeKey"/s);
  assert.match(sql, /ALTER TABLE "LearningAnalyticsEvents" ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+"LearningAnalyticsEvents"\s+SELECT/i);
  assert.doesNotMatch(sql, /UPDATE\s+"UserProgresses"/i);
});

test("historical predicates pair current eligible students with levels and trusted filters", () => {
  assert.ok(historyService, "learningAnalyticsHistoryService must exist");
  const filters = {
    datePreset: "custom",
    startAt: new Date("2026-09-01T00:00:00Z"),
    endAt: new Date("2026-09-21T23:59:59Z"),
  };
  const where = historyService.buildHistoricalEventWhere({
    classroomIds: [3, 4],
    studentIdsByLevel: new Map([
      ["tutorial-level-1", [11, 12]],
      ["tutorial-level-2", [12]],
    ]),
    filters,
    lessonKey: "tutorial",
  });

  assert.deepEqual(where.classroomId[Op.in], [3, 4]);
  assert.equal(where.lessonKey, "tutorial");
  assert.equal(where.occurredAt[Op.gte], filters.startAt);
  assert.equal(where.occurredAt[Op.lte], filters.endAt);
  assert.deepEqual(where[Op.or].map((clause) => [
    clause.levelKey,
    clause.studentId[Op.in],
  ]), [
    ["tutorial-level-1", [11, 12]],
    ["tutorial-level-2", [12]],
  ]);
  assert.equal(historyService.selectHistoryBucket({ datePreset: "30d" }), "day");
  assert.equal(historyService.selectHistoryBucket({
    datePreset: "custom",
    startAt: new Date("2026-01-01T00:00:00Z"),
    endAt: new Date("2026-09-21T23:59:59Z"),
  }), "month");
  assert.equal(historyService.selectHistoryBucket({ datePreset: "all" }), "month");
});
