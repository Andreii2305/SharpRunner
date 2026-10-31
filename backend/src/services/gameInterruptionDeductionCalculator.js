const {
  GAME_INTERRUPTION_HISTORY_LIMITS,
} = require("../constants/gameInterruptionHistoryConfig");

const SCORE_FLOOR_HUNDREDTHS = 7500;
const SCORE_MAXIMUM_HUNDREDTHS = 10000;

const fail = (field) => {
  throw new TypeError(`${field} is invalid`);
};

const parseHundredths = (value, field, { minimum = 0, maximum = 10000 } = {}) => {
  if (typeof value !== "string" && typeof value !== "number") fail(field);
  if (typeof value === "number" && !Number.isFinite(value)) fail(field);
  const text = String(value);
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) fail(field);

  const fraction = (match[2] || "").padEnd(2, "0");
  const hundredths = (BigInt(match[1]) * 100n) + BigInt(fraction || "0");
  if (hundredths < BigInt(minimum) || hundredths > BigInt(maximum)) fail(field);
  return Number(hundredths);
};

const parseNonNegativeInteger = (value, field, maximum = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail(field);
  return value;
};

const parseEventId = (value) => {
  if (!Number.isSafeInteger(value) || value <= 0) fail("event.id");
  return value;
};

const parseReceivedAt = (value) => {
  if (!(value instanceof Date) && typeof value !== "string") fail("event.receivedAt");
  if (typeof value === "string" && value.length === 0) fail("event.receivedAt");
  const milliseconds = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) fail("event.receivedAt");
  return milliseconds;
};

const formatHundredths = (value) => {
  const whole = Math.floor(value / 100);
  return `${whole}.${String(value % 100).padStart(2, "0")}`;
};

const calculateInterruptionDeductions = ({
  baseScore,
  grossCompletionXp,
  events,
} = {}) => {
  const baseHundredths = parseHundredths(baseScore, "baseScore", {
    minimum: SCORE_FLOOR_HUNDREDTHS,
    maximum: SCORE_MAXIMUM_HUNDREDTHS,
  });
  const grossXp = parseNonNegativeInteger(grossCompletionXp, "grossCompletionXp");
  if (!Array.isArray(events)) fail("events");

  const seenEventIds = new Set();
  const orderedEvents = events.map((input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) fail("event");
    const id = parseEventId(input.id);
    if (seenEventIds.has(id)) fail("event.id");
    seenEventIds.add(id);
    return {
      id,
      receivedAtMilliseconds: parseReceivedAt(input.receivedAt),
      scoreDeductionHundredths: parseHundredths(
        input.scoreDeductionSnapshot,
        "event.scoreDeductionSnapshot",
        { maximum: GAME_INTERRUPTION_HISTORY_LIMITS.maximumDeduction * 100 },
      ),
      xpDeduction: parseNonNegativeInteger(
        input.xpDeductionSnapshot,
        "event.xpDeductionSnapshot",
        GAME_INTERRUPTION_HISTORY_LIMITS.maximumDeduction,
      ),
    };
  }).sort((left, right) => (
    left.receivedAtMilliseconds - right.receivedAtMilliseconds || left.id - right.id
  ));

  let remainingScoreHundredths = baseHundredths - SCORE_FLOOR_HUNDREDTHS;
  let remainingXp = grossXp;
  let deductedScoreHundredths = 0;
  let deductedXp = 0;

  const eventApplications = orderedEvents.map((event) => {
    const appliedScoreDeductionHundredths = Math.min(
      event.scoreDeductionHundredths,
      remainingScoreHundredths,
    );
    const appliedXpDeduction = Math.min(event.xpDeduction, remainingXp);
    remainingScoreHundredths -= appliedScoreDeductionHundredths;
    remainingXp -= appliedXpDeduction;
    deductedScoreHundredths += appliedScoreDeductionHundredths;
    deductedXp += appliedXpDeduction;
    return {
      eventId: event.id,
      appliedScoreDeduction: formatHundredths(appliedScoreDeductionHundredths),
      appliedScoreDeductionHundredths,
      appliedXpDeduction,
    };
  });

  const finalScoreHundredths = baseHundredths - deductedScoreHundredths;
  return {
    eventCount: eventApplications.length,
    eventApplications,
    score: {
      base: formatHundredths(baseHundredths),
      baseHundredths,
      deducted: formatHundredths(deductedScoreHundredths),
      deductedHundredths: deductedScoreHundredths,
      final: formatHundredths(finalScoreHundredths),
      finalHundredths: finalScoreHundredths,
    },
    xp: {
      gross: grossXp,
      deducted: deductedXp,
      net: remainingXp,
    },
  };
};

module.exports = { calculateInterruptionDeductions };
