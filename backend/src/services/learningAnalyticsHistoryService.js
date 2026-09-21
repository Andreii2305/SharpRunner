const { Op, literal } = require("sequelize");
const LearningAnalyticsEvent = require("../models/LearningAnalyticsEvent");
const { EVENT_TYPES } = require("./learningAnalyticsEventService");

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_EVENT_TYPES = Object.freeze([
  EVENT_TYPES.LEVEL_STARTED,
  EVENT_TYPES.ATTEMPT_FAILED,
  EVENT_TYPES.LEVEL_COMPLETED,
  EVENT_TYPES.ACTIVE_TIME,
  EVENT_TYPES.HINT_USED,
]);

const emptyHistoricalAnalytics = () => ({
  trackingSince: null,
  hasData: false,
  bucket: null,
  series: [],
  failures: [],
  semantics: {
    attempts: "Successful and failed solution submissions recorded after event tracking began.",
    activeTime: "Accepted foreground timer deltas; stale, closed-browser, and duplicate time is excluded.",
    failures: "Actual recorded failed solution events, separate from current latest-failure signals.",
  },
});

const selectHistoryBucket = (filters = {}) => {
  if (["7d", "30d"].includes(filters.datePreset)) return "day";
  if (filters.datePreset === "custom" && filters.startAt && filters.endAt) {
    const durationDays = (
      new Date(filters.endAt).getTime() - new Date(filters.startAt).getTime()
    ) / DAY_MS;
    return durationDays <= 93 ? "day" : "month";
  }
  return "month";
};

const buildHistoricalEventWhere = ({
  classroomIds,
  studentIdsByLevel,
  filters = {},
  lessonKey = null,
  eventTypes = HISTORY_EVENT_TYPES,
  includeDateWindow = true,
}) => {
  const levelClauses = [...studentIdsByLevel.entries()]
    .map(([levelKeyValue, studentIds]) => ({
      levelKey: levelKeyValue,
      studentId: { [Op.in]: [...new Set(studentIds.map(Number))].sort((a, b) => a - b) },
    }))
    .filter((clause) => clause.studentId[Op.in].length)
    .sort((left, right) => left.levelKey.localeCompare(right.levelKey));

  const where = {
    classroomId: { [Op.in]: [...new Set(classroomIds.map(Number))].sort((a, b) => a - b) },
    eventType: { [Op.in]: eventTypes },
    [Op.or]: levelClauses,
  };
  if (!levelClauses.length) where.id = { [Op.lt]: 0 };
  if (lessonKey) where.lessonKey = lessonKey;
  if (includeDateWindow && filters.startAt && filters.endAt) {
    where.occurredAt = {
      [Op.gte]: filters.startAt,
      [Op.lte]: filters.endAt,
    };
  }
  return where;
};

const studentIdsByLevelFromEligibility = (studentIds, enabledLevelKeysByStudent) => {
  const result = new Map();
  for (const studentId of studentIds) {
    for (const levelKey of enabledLevelKeysByStudent.get(Number(studentId)) || []) {
      if (!result.has(levelKey)) result.set(levelKey, []);
      result.get(levelKey).push(Number(studentId));
    }
  }
  return result;
};

const integer = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const isoTimestamp = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const categoryLabel = (value) => String(value || "unknown")
  .replace(/_/g, " ")
  .replace(/\b\w/g, (character) => character.toUpperCase());

const getHistoricalLearningAnalytics = async ({
  classroomIds,
  studentIds,
  enabledLevelKeysByStudent,
  filters,
  lessonKey = null,
  includeCurriculumEvents = true,
}) => {
  const studentIdsByLevel = includeCurriculumEvents
    ? studentIdsByLevelFromEligibility(studentIds, enabledLevelKeysByStudent)
    : new Map();
  const bucket = selectHistoryBucket(filters);
  const periodExpression = literal(
    `date_trunc('${bucket}', "occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
  );
  const baseWhere = buildHistoricalEventWhere({
    classroomIds,
    studentIdsByLevel,
    filters,
    lessonKey,
  });
  const failureWhere = buildHistoricalEventWhere({
    classroomIds,
    studentIdsByLevel,
    filters,
    lessonKey,
    eventTypes: [EVENT_TYPES.ATTEMPT_FAILED],
  });
  const trackingWhere = buildHistoricalEventWhere({
    classroomIds,
    studentIdsByLevel,
    filters,
    lessonKey,
    includeDateWindow: false,
  });

  const [seriesRows, failureRows, trackingSinceValue] = await Promise.all([
    LearningAnalyticsEvent.findAll({
      where: baseWhere,
      attributes: [
        [periodExpression, "periodStart"],
        [literal(`SUM(CASE WHEN "eventType" IN ('${EVENT_TYPES.ATTEMPT_FAILED}', '${EVENT_TYPES.LEVEL_COMPLETED}') THEN 1 ELSE 0 END)`), "attempts"],
        [literal(`SUM(CASE WHEN "eventType" = '${EVENT_TYPES.LEVEL_COMPLETED}' THEN 1 ELSE 0 END)`), "successfulAttempts"],
        [literal(`SUM(CASE WHEN "eventType" = '${EVENT_TYPES.ATTEMPT_FAILED}' THEN 1 ELSE 0 END)`), "failedAttempts"],
        [literal(`SUM(CASE WHEN "eventType" = '${EVENT_TYPES.LEVEL_COMPLETED}' THEN 1 ELSE 0 END)`), "completions"],
        [literal(`SUM(CASE WHEN "eventType" = '${EVENT_TYPES.ACTIVE_TIME}' THEN COALESCE("activeSeconds", 0) ELSE 0 END)`), "activeSeconds"],
        [literal(`SUM(CASE WHEN "eventType" = '${EVENT_TYPES.HINT_USED}' THEN 1 ELSE 0 END)`), "hintUses"],
        [literal(`SUM(CASE WHEN "eventType" = '${EVENT_TYPES.LEVEL_COMPLETED}' AND "attemptNumber" = 1 THEN 1 ELSE 0 END)`), "firstAttemptSuccesses"],
      ],
      group: [periodExpression],
      order: [[periodExpression, "ASC"]],
      raw: true,
    }),
    LearningAnalyticsEvent.findAll({
      where: failureWhere,
      attributes: [
        "failureCategory",
        [literal("COUNT(*)"), "count"],
        [literal('COUNT(DISTINCT "studentId")'), "affectedStudents"],
        [literal('MAX("occurredAt")'), "latestOccurrence"],
      ],
      group: ["failureCategory"],
      order: [[literal("COUNT(*)"), "DESC"], ["failureCategory", "ASC"]],
      raw: true,
    }),
    LearningAnalyticsEvent.min("occurredAt", { where: trackingWhere }),
  ]);

  const series = seriesRows.map((row) => ({
    periodStart: isoTimestamp(row.periodStart),
    attempts: integer(row.attempts),
    successfulAttempts: integer(row.successfulAttempts),
    failedAttempts: integer(row.failedAttempts),
    completions: integer(row.completions),
    activeSeconds: integer(row.activeSeconds),
    hintUses: integer(row.hintUses),
    firstAttemptSuccesses: integer(row.firstAttemptSuccesses),
  })).filter((row) => row.periodStart);
  const failures = failureRows.map((row) => ({
    category: row.failureCategory || "unknown",
    label: categoryLabel(row.failureCategory),
    count: integer(row.count),
    affectedStudents: integer(row.affectedStudents),
    latestOccurrence: isoTimestamp(row.latestOccurrence),
  }));
  const historical = emptyHistoricalAnalytics();
  return {
    ...historical,
    trackingSince: isoTimestamp(trackingSinceValue),
    hasData: series.length > 0,
    bucket,
    series,
    failures,
  };
};

module.exports = {
  buildHistoricalEventWhere,
  emptyHistoricalAnalytics,
  getHistoricalLearningAnalytics,
  selectHistoryBucket,
  studentIdsByLevelFromEligibility,
};
