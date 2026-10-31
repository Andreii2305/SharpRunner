const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  calculateInterruptionDeductions,
} = require("../src/services/gameInterruptionDeductionCalculator");

const event = (id, overrides = {}) => ({
  id,
  receivedAt: new Date(`2026-10-29T00:00:${String(id).padStart(2, "0")}.000Z`),
  scoreDeductionSnapshot: "1.00",
  xpDeductionSnapshot: 10,
  ...overrides,
});

test("no interruption events preserve the base score and gross completion XP", () => {
  const result = calculateInterruptionDeductions({
    baseScore: 95,
    grossCompletionXp: 25,
    events: [],
  });

  assert.deepEqual(result, {
    eventCount: 0,
    eventApplications: [],
    score: {
      base: "95.00",
      baseHundredths: 9500,
      deducted: "0.00",
      deductedHundredths: 0,
      final: "95.00",
      finalHundredths: 9500,
    },
    xp: { gross: 25, deducted: 0, net: 25 },
  });
});

test("default rates allocate independently and include zero allocations after floors", () => {
  const result = calculateInterruptionDeductions({
    baseScore: 77,
    grossCompletionXp: 15,
    events: [event(1), event(2), event(3)],
  });

  assert.deepEqual(result.eventApplications, [
    { eventId: 1, appliedScoreDeduction: "1.00", appliedScoreDeductionHundredths: 100, appliedXpDeduction: 10 },
    { eventId: 2, appliedScoreDeduction: "1.00", appliedScoreDeductionHundredths: 100, appliedXpDeduction: 5 },
    { eventId: 3, appliedScoreDeduction: "0.00", appliedScoreDeductionHundredths: 0, appliedXpDeduction: 0 },
  ]);
  assert.deepEqual(result.score, {
    base: "77.00",
    baseHundredths: 7700,
    deducted: "2.00",
    deductedHundredths: 200,
    final: "75.00",
    finalHundredths: 7500,
  });
  assert.deepEqual(result.xp, { gross: 15, deducted: 15, net: 0 });
});

test("independent zero rates and mixed session snapshots retain each event rate", () => {
  const result = calculateInterruptionDeductions({
    baseScore: "80.00",
    grossCompletionXp: 30,
    events: [
      event(1, { scoreDeductionSnapshot: "0.00", xpDeductionSnapshot: 7 }),
      event(2, { scoreDeductionSnapshot: "2.25", xpDeductionSnapshot: 0 }),
      event(3, { scoreDeductionSnapshot: "0.50", xpDeductionSnapshot: 20 }),
    ],
  });

  assert.deepEqual(result.eventApplications, [
    { eventId: 1, appliedScoreDeduction: "0.00", appliedScoreDeductionHundredths: 0, appliedXpDeduction: 7 },
    { eventId: 2, appliedScoreDeduction: "2.25", appliedScoreDeductionHundredths: 225, appliedXpDeduction: 0 },
    { eventId: 3, appliedScoreDeduction: "0.50", appliedScoreDeductionHundredths: 50, appliedXpDeduction: 20 },
  ]);
  assert.equal(result.score.final, "77.25");
  assert.deepEqual(result.xp, { gross: 30, deducted: 27, net: 3 });
});

test("score allocation stops partially at 75 while XP continues independently", () => {
  const result = calculateInterruptionDeductions({
    baseScore: "76.00",
    grossCompletionXp: 50,
    events: [
      event(1, { scoreDeductionSnapshot: "0.75", xpDeductionSnapshot: 4 }),
      event(2, { scoreDeductionSnapshot: "0.50", xpDeductionSnapshot: 6 }),
    ],
  });

  assert.equal(result.eventApplications[0].appliedScoreDeduction, "0.75");
  assert.equal(result.eventApplications[1].appliedScoreDeduction, "0.25");
  assert.equal(result.eventApplications[1].appliedXpDeduction, 6);
  assert.equal(result.score.final, "75.00");
  assert.equal(result.score.deducted, "1.00");
});

test("decimal snapshots use exact hundredths without floating-point accumulation", () => {
  const result = calculateInterruptionDeductions({
    baseScore: "76.00",
    grossCompletionXp: 10,
    events: [
      event(1, { scoreDeductionSnapshot: "0.10", xpDeductionSnapshot: 0 }),
      event(2, { scoreDeductionSnapshot: "0.10", xpDeductionSnapshot: 0 }),
      event(3, { scoreDeductionSnapshot: "0.10", xpDeductionSnapshot: 0 }),
      event(4, { scoreDeductionSnapshot: "0.25", xpDeductionSnapshot: 0 }),
    ],
  });

  assert.equal(result.score.deductedHundredths, 55);
  assert.equal(result.score.deducted, "0.55");
  assert.equal(result.score.final, "75.45");
});

test("events sort by receipt time then numeric ID without mutating inputs", () => {
  const receivedAt = new Date("2026-10-29T00:00:00.000Z");
  const inputEvents = Object.freeze([
    Object.freeze(event(10, { receivedAt, scoreDeductionSnapshot: "0.25" })),
    Object.freeze(event(3, { receivedAt: new Date("2026-10-28T23:59:59.000Z"), scoreDeductionSnapshot: "0.25" })),
    Object.freeze(event(2, { receivedAt, scoreDeductionSnapshot: "0.25" })),
  ]);
  const originalOrder = inputEvents.map((item) => item.id);

  const result = calculateInterruptionDeductions({
    baseScore: 100,
    grossCompletionXp: 100,
    events: inputEvents,
  });

  assert.deepEqual(result.eventApplications.map((item) => item.eventId), [3, 2, 10]);
  assert.deepEqual(inputEvents.map((item) => item.id), originalOrder);
  assert.equal(inputEvents[0].scoreDeductionSnapshot, "0.25");
});

test("totals equal the sum of every per-event allocation", () => {
  const result = calculateInterruptionDeductions({
    baseScore: "76.20",
    grossCompletionXp: 8,
    events: [
      event(1, { scoreDeductionSnapshot: "0.25", xpDeductionSnapshot: 3 }),
      event(2, { scoreDeductionSnapshot: "0.50", xpDeductionSnapshot: 3 }),
      event(3, { scoreDeductionSnapshot: "0.75", xpDeductionSnapshot: 3 }),
    ],
  });

  assert.equal(
    result.eventApplications.reduce(
      (sum, item) => sum + item.appliedScoreDeductionHundredths,
      0,
    ),
    result.score.deductedHundredths,
  );
  assert.equal(
    result.eventApplications.reduce((sum, item) => sum + item.appliedXpDeduction, 0),
    result.xp.deducted,
  );
});

test("invalid base score, XP, event identities, timestamps, and snapshots are rejected", () => {
  const valid = { baseScore: 95, grossCompletionXp: 25, events: [event(1)] };
  const invalidInputs = [
    { ...valid, baseScore: 74.99 },
    { ...valid, baseScore: "95.001" },
    { ...valid, baseScore: "1e2" },
    { ...valid, baseScore: Number.NaN },
    { ...valid, grossCompletionXp: -1 },
    { ...valid, grossCompletionXp: 1.5 },
    { ...valid, grossCompletionXp: "25" },
    { ...valid, grossCompletionXp: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, events: [event(0)] },
    { ...valid, events: [event(Number.MAX_SAFE_INTEGER + 1)] },
    { ...valid, events: [event(1), event(1)] },
    { ...valid, events: [event(1, { receivedAt: "not-a-date" })] },
    { ...valid, events: [event(1, { scoreDeductionSnapshot: "0.001" })] },
    { ...valid, events: [event(1, { scoreDeductionSnapshot: "1e1" })] },
    { ...valid, events: [event(1, { scoreDeductionSnapshot: -1 })] },
    { ...valid, events: [event(1, { scoreDeductionSnapshot: 101 })] },
    { ...valid, events: [event(1, { xpDeductionSnapshot: 0.25 })] },
    { ...valid, events: [event(1, { xpDeductionSnapshot: "10" })] },
    { ...valid, events: [event(1, { xpDeductionSnapshot: -1 })] },
    { ...valid, events: [event(1, { xpDeductionSnapshot: Number.MAX_SAFE_INTEGER + 1 })] },
  ];

  for (const input of invalidInputs) {
    assert.throws(() => calculateInterruptionDeductions(input), TypeError);
  }
});
