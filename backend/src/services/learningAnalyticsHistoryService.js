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
  totals: {
    attempts: 0,
    successfulAttempts: 0,
    failedAttempts: 0,
    completions: 0,
    activeSeconds: 0,
    hintUses: 0,
    purchasedHints: 0,
    knownHintXpSpent: 0,
    unpricedHintPurchases: 0,
    firstAttemptSuccesses: 0,
    firstAttemptSuccessDenominator: 0,
    firstAttemptSuccessRate: null,
  },
  comparison: null,
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

const roundedPercent = (numerator, denominator) => (
  denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null
);

const normalizeAggregateRow = (row = {}) => {
  const completions = integer(row.completions);
  const firstAttemptSuccesses = integer(row.firstAttemptSuccesses);
  return {
    attempts: integer(row.attempts),
    successfulAttempts: integer(row.successfulAttempts),
    failedAttempts: integer(row.failedAttempts),
    completions,
    activeSeconds: integer(row.activeSeconds),
    hintUses: integer(row.hintUses),
    purchasedHints: integer(row.purchasedHints),
    knownHintXpSpent: integer(row.knownHintXpSpent),
    unpricedHintPurchases: integer(row.unpricedHintPurchases),
    firstAttemptSuccesses,
    firstAttemptSuccessDenominator: completions,
    firstAttemptSuccessRate: roundedPercent(firstAttemptSuccesses, completions),
  };
};

const summarizeHistoricalRows = (rows = []) => normalizeAggregateRow(rows.reduce((totals, row) => ({
  attempts: integer(totals.attempts) + integer(row.attempts),
  successfulAttempts: integer(totals.successfulAttempts) + integer(row.successfulAttempts),
  failedAttempts: integer(totals.failedAttempts) + integer(row.failedAttempts),
  completions: integer(totals.completions) + integer(row.completions),
  activeSeconds: integer(totals.activeSeconds) + integer(row.activeSeconds),
  hintUses: integer(totals.hintUses) + integer(row.hintUses),
  purchasedHints: integer(totals.purchasedHints) + integer(row.purchasedHints),
  knownHintXpSpent: integer(totals.knownHintXpSpent) + integer(row.knownHintXpSpent),
  unpricedHintPurchases: integer(totals.unpricedHintPurchases) + integer(row.unpricedHintPurchases),
  firstAttemptSuccesses: integer(totals.firstAttemptSuccesses) + integer(row.firstAttemptSuccesses),
}), {}));

const previousWindowFor = (filters = {}) => {
  if (!filters.startAt || !filters.endAt) return null;
  const start = new Date(filters.startAt).getTime();
  const end = new Date(filters.endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;
  const duration = end - start + 1;
  return {
    startAt: new Date(start - duration),
    endAt: new Date(start - 1),
  };
};

const changeMetric = (current, previous, unit = "count") => {
  const absoluteChange = Math.round((current - previous) * 10) / 10;
  return {
    current,
    previous,
    absoluteChange,
    percentageChange: previous > 0
      ? Math.round(((current - previous) / previous) * 1000) / 10
      : null,
    unit,
    message: previous === 0
      ? current > 0
        ? "No percentage comparison available because the previous period was zero."
        : "No percentage comparison available because both periods were zero."
      : null,
  };
};

const buildHistoricalComparison = ({ filters, current, previous }) => {
  const previousWindow = previousWindowFor(filters);
  if (!previousWindow) return null;
  const metrics = {};
  for (const [key, unit] of [
    ["attempts", "count"],
    ["successfulAttempts", "count"],
    ["failedAttempts", "count"],
    ["completions", "count"],
    ["activeSeconds", "seconds"],
    ["hintUses", "count"],
    ["purchasedHints", "count"],
  ]) metrics[key] = changeMetric(current[key], previous[key], unit);

  const currentRate = current.firstAttemptSuccessRate;
  const previousRate = previous.firstAttemptSuccessRate;
  metrics.firstAttemptSuccess = {
    current: currentRate,
    previous: previousRate,
    absoluteChange: currentRate == null || previousRate == null
      ? null
      : Math.round((currentRate - previousRate) * 10) / 10,
    percentageChange: null,
    unit: "percentage_points",
    message: currentRate == null || previousRate == null
      ? "No rate comparison available because one or both periods had no successful completions."
      : null,
    currentNumerator: current.firstAttemptSuccesses,
    currentDenominator: current.firstAttemptSuccessDenominator,
    previousNumerator: previous.firstAttemptSuccesses,
    previousDenominator: previous.firstAttemptSuccessDenominator,
  };
  return {
    currentWindow: {
      startAt: new Date(filters.startAt).toISOString(),
      endAt: new Date(filters.endAt).toISOString(),
    },
    previousWindow: {
      startAt: previousWindow.startAt.toISOString(),
      endAt: previousWindow.endAt.toISOString(),
    },
    metrics,
  };
};

const aggregateAttributes = () => [
  [literal(`SUM(CASE WHEN "eventType" IN ('${EVENT_TYPES.ATTEMPT_FAILED}', '${EVENT_TYPES.LEVEL_COMPLETED}') THEN 1 ELSE 0 END)`), "attempts"],
  [literal(`SUM(CASE WHEN "eventType" = '${EVENT_TYPES.LEVEL_COMPLETED}' THEN 1 ELSE 0 END)`), "successfulAttempts"],
  [literal(`SUM(CASE WHEN "eventType" = '${EVENT_TYPES.ATTEMPT_FAILED}' THEN 1 ELSE 0 END)`), "failedAttempts"],
  [literal(`SUM(CASE WHEN "eventType" = '${EVENT_TYPES.LEVEL_COMPLETED}' THEN 1 ELSE 0 END)`), "completions"],
  [literal(`SUM(CASE WHEN "eventType" = '${EVENT_TYPES.ACTIVE_TIME}' THEN COALESCE("activeSeconds", 0) ELSE 0 END)`), "activeSeconds"],
  [literal(`SUM(CASE WHEN "eventType" = '${EVENT_TYPES.HINT_USED}' THEN 1 ELSE 0 END)`), "hintUses"],
  [literal(`SUM(CASE WHEN "eventType" = '${EVENT_TYPES.HINT_USED}' AND "hintPurchased" IS TRUE THEN 1 ELSE 0 END)`), "purchasedHints"],
  [literal(`SUM(CASE WHEN "eventType" = '${EVENT_TYPES.HINT_USED}' AND "hintPurchased" IS TRUE THEN COALESCE("hintXpCost", 0) ELSE 0 END)`), "knownHintXpSpent"],
  [literal(`SUM(CASE WHEN "eventType" = '${EVENT_TYPES.HINT_USED}' AND "hintPurchased" IS TRUE AND "hintXpCost" IS NULL THEN 1 ELSE 0 END)`), "unpricedHintPurchases"],
  [literal(`SUM(CASE WHEN "eventType" = '${EVENT_TYPES.LEVEL_COMPLETED}' AND "attemptNumber" = 1 THEN 1 ELSE 0 END)`), "firstAttemptSuccesses"],
];

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
  const previousWindow = previousWindowFor(filters);
  const previousWhere = previousWindow ? buildHistoricalEventWhere({
    classroomIds,
    studentIdsByLevel,
    filters: { ...filters, ...previousWindow },
    lessonKey,
  }) : null;

  const [seriesRows, failureRows, previousRows, trackingSinceValue] = await Promise.all([
    LearningAnalyticsEvent.findAll({
      where: baseWhere,
      attributes: [
        [periodExpression, "periodStart"],
        ...aggregateAttributes(),
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
    previousWhere ? LearningAnalyticsEvent.findAll({
      where: previousWhere,
      attributes: aggregateAttributes(),
      raw: true,
    }) : Promise.resolve([]),
    LearningAnalyticsEvent.min("occurredAt", { where: trackingWhere }),
  ]);

  const series = seriesRows.map((row) => ({
    periodStart: isoTimestamp(row.periodStart),
    ...normalizeAggregateRow(row),
  })).filter((row) => row.periodStart);
  const failures = failureRows.map((row) => ({
    category: row.failureCategory || "unknown",
    label: categoryLabel(row.failureCategory),
    count: integer(row.count),
    affectedStudents: integer(row.affectedStudents),
    latestOccurrence: isoTimestamp(row.latestOccurrence),
  }));
  const historical = emptyHistoricalAnalytics();
  const totals = summarizeHistoricalRows(series);
  const previousTotals = summarizeHistoricalRows(previousRows);
  return {
    ...historical,
    trackingSince: isoTimestamp(trackingSinceValue),
    hasData: series.length > 0,
    bucket,
    series,
    failures,
    totals,
    comparison: buildHistoricalComparison({ filters, current: totals, previous: previousTotals }),
  };
};

module.exports = {
  buildHistoricalEventWhere,
  buildHistoricalComparison,
  emptyHistoricalAnalytics,
  getHistoricalLearningAnalytics,
  selectHistoryBucket,
  summarizeHistoricalRows,
  studentIdsByLevelFromEligibility,
};
