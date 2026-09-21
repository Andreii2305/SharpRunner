const crypto = require("crypto");
const LearningAnalyticsEvent = require("../models/LearningAnalyticsEvent");
const { PLAYABLE_LEVEL_KEYS } = require("../constants/progressDefaults");

const EVENT_TYPES = Object.freeze({
  LEVEL_STARTED: "level_started",
  ATTEMPT_FAILED: "solution_attempt_failed",
  LEVEL_COMPLETED: "level_completed",
  ACTIVE_TIME: "active_time_recorded",
  HINT_USED: "hint_used",
});

const PLAYABLE_LEVEL_KEY_SET = new Set(PLAYABLE_LEVEL_KEYS);
const ACTION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

const parseLessonKey = (levelKey) => {
  const match = /^(.*)-level-\d+$/.exec(levelKey);
  return match?.[1] ?? null;
};

const positiveInteger = (value, field) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new TypeError(`${field} must be a positive integer`);
  }
  return parsed;
};

const nullablePositiveInteger = (value, field) => (
  value == null ? null : positiveInteger(value, field)
);

const boundedString = (value, field, maximumLength) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximumLength) {
    throw new TypeError(`${field} must be a non-empty string up to ${maximumLength} characters`);
  }
  return value.trim();
};

const normalizeActionId = (value) => {
  if (typeof value !== "string" || !ACTION_ID_PATTERN.test(value)) {
    throw new TypeError("action identifier must contain 8-64 letters, numbers, underscores, or hyphens");
  }
  return value;
};

const buildEventDedupeKey = (namespace, parts) => {
  const normalizedNamespace = boundedString(namespace, "dedupe namespace", 24);
  if (!/^[a-z][a-z0-9-]*$/.test(normalizedNamespace)) {
    throw new TypeError("dedupe namespace must use lowercase letters, numbers, or hyphens");
  }
  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex");
  return `${normalizedNamespace}:${digest}`;
};

const normalizeOccurredAt = (value) => {
  const date = value == null ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("occurredAt must be a valid date");
  return date;
};

const createValidatedEvent = async (input, { transaction } = {}) => {
  const studentId = positiveInteger(input.studentId, "studentId");
  const classroomId = nullablePositiveInteger(input.classroomId, "classroomId");
  const levelKey = boundedString(input.levelKey, "levelKey", 255);
  if (!PLAYABLE_LEVEL_KEY_SET.has(levelKey)) throw new TypeError("levelKey must be a supported curriculum level");
  const lessonKey = parseLessonKey(levelKey);
  const eventType = boundedString(input.eventType, "eventType", 40);
  if (!Object.values(EVENT_TYPES).includes(eventType)) throw new TypeError("eventType is not supported");

  const values = {
    studentId,
    classroomId,
    levelKey,
    lessonKey,
    eventType,
    occurredAt: normalizeOccurredAt(input.occurredAt),
    attemptNumber: nullablePositiveInteger(input.attemptNumber, "attemptNumber"),
    score: input.score == null ? null : Number(input.score),
    failureCategory: input.failureCategory == null
      ? null
      : boundedString(input.failureCategory, "failureCategory", 40),
    failureCode: input.failureCode == null
      ? null
      : boundedString(input.failureCode, "failureCode", 64),
    activeSeconds: nullablePositiveInteger(input.activeSeconds, "activeSeconds"),
    hintType: input.hintType ?? null,
    hintPurchased: input.hintPurchased == null ? null : Boolean(input.hintPurchased),
    dedupeKey: boundedString(input.dedupeKey, "dedupeKey", 96),
  };

  if (values.score != null && (!Number.isFinite(values.score) || values.score < 0 || values.score > 100)) {
    throw new TypeError("score must be between 0 and 100");
  }
  if (values.hintType != null && !["basic", "detailed"].includes(values.hintType)) {
    throw new TypeError("hintType must be basic or detailed");
  }

  return LearningAnalyticsEvent.create(values, { transaction });
};

const findRecordedEvent = (dedupeKey, { transaction } = {}) =>
  LearningAnalyticsEvent.findOne({
    where: { dedupeKey: boundedString(dedupeKey, "dedupeKey", 96) },
    transaction,
  });

const recordLevelStarted = (input, options = {}) => createValidatedEvent({
  studentId: input.studentId,
  classroomId: input.classroomId,
  levelKey: input.levelKey,
  eventType: EVENT_TYPES.LEVEL_STARTED,
  occurredAt: input.occurredAt,
  dedupeKey: buildEventDedupeKey("level-started", [input.studentId, input.levelKey]),
}, options);

const recordFailedAttempt = (input, options = {}) => createValidatedEvent({
  studentId: input.studentId,
  classroomId: input.classroomId,
  levelKey: input.levelKey,
  eventType: EVENT_TYPES.ATTEMPT_FAILED,
  occurredAt: input.occurredAt,
  attemptNumber: input.attemptNumber,
  failureCategory: input.failureCategory,
  failureCode: input.failureCode,
  dedupeKey: buildEventDedupeKey("failed-attempt", [
    input.studentId,
    input.levelKey,
    normalizeActionId(input.activityId),
  ]),
}, options);

const recordLevelCompleted = (input, options = {}) => createValidatedEvent({
  studentId: input.studentId,
  classroomId: input.classroomId,
  levelKey: input.levelKey,
  eventType: EVENT_TYPES.LEVEL_COMPLETED,
  occurredAt: input.occurredAt,
  attemptNumber: input.attemptNumber,
  score: input.score,
  dedupeKey: buildEventDedupeKey("level-completed", [
    input.studentId,
    input.levelKey,
  ]),
}, options);

const recordActiveTime = (input, options = {}) => createValidatedEvent({
  studentId: input.studentId,
  classroomId: input.classroomId,
  levelKey: input.levelKey,
  eventType: EVENT_TYPES.ACTIVE_TIME,
  occurredAt: input.occurredAt,
  activeSeconds: input.activeSeconds,
  dedupeKey: buildEventDedupeKey("active-time", [
    input.studentId,
    input.levelKey,
    normalizeActionId(input.syncId),
  ]),
}, options);

const recordHintUsed = (input, options = {}) => {
  if (!["basic", "detailed"].includes(input.hintType)) {
    return Promise.reject(new TypeError("hintType must be basic or detailed"));
  }
  return createValidatedEvent({
    studentId: input.studentId,
    classroomId: input.classroomId,
    levelKey: input.levelKey,
    eventType: EVENT_TYPES.HINT_USED,
    occurredAt: input.occurredAt,
    hintType: input.hintType,
    hintPurchased: Boolean(input.hintPurchased),
    dedupeKey: buildEventDedupeKey(`hint-${input.hintType}`, [input.studentId, input.levelKey]),
  }, options);
};

module.exports = {
  EVENT_TYPES,
  buildEventDedupeKey,
  findRecordedEvent,
  normalizeActionId,
  recordActiveTime,
  recordFailedAttempt,
  recordHintUsed,
  recordLevelCompleted,
  recordLevelStarted,
};
