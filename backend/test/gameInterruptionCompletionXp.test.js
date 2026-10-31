const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const { test } = require("node:test");

const {
  GamificationError,
  createEvidenceAwareCompletionXpAwarder,
} = require("../src/services/gamificationService");

const LEVEL_KEY = "tutorial-level-1";
const PROCESSED_AT = new Date("2026-10-29T00:10:00.000Z");

const record = (values, onSave = null) => ({
  ...values,
  async save(options) {
    onSave?.(this, options);
    return this;
  },
  get() { return { ...this }; },
});

const evidence = (overrides = {}) => record({
  id: 40,
  studentId: 11,
  classroomId: 25,
  levelKey: LEVEL_KEY,
  policyVersion: "game-interruption-deduction/v1",
  appliedEventCount: 1,
  baseScore: "95.00",
  scoreDeduction: "1.00",
  finalScore: "94.00",
  grossCompletionXp: 25,
  xpDeduction: 10,
  netCompletionXp: 15,
  completedAt: new Date("2026-10-29T00:09:00.000Z"),
  createdAt: new Date("2026-10-29T00:09:00.000Z"),
  ...overrides,
});

const ledger = (overrides = {}) => record({
  id: 90,
  userId: 11,
  amount: 15,
  kind: "level_completion",
  referenceType: "level",
  referenceId: LEVEL_KEY,
  completionEvidenceId: 40,
  metadata: {},
  createdAt: PROCESSED_AT,
  ...overrides,
});

const createHarness = ({
  evidenceRow = evidence(),
  ledgers = [],
  userValues = {},
  progressValues = {},
  uniqueWinner = null,
} = {}) => {
  const state = {
    ledgers: ledgers.map((item) => record(item)),
    nextLedgerId: 100,
    outerTransactions: 0,
    savepoints: 0,
    userSaves: 0,
    progressSaves: 0,
    evidenceQueries: 0,
    ledgerQueries: 0,
    ledgerCreates: 0,
    uniqueWinner,
  };
  const user = record({
    id: 11,
    role: "student",
    status: "active",
    xpTotal: 100,
    ...userValues,
  }, () => { state.userSaves += 1; });
  const progress = record({
    id: 5,
    userId: 11,
    levelKey: LEVEL_KEY,
    isCompleted: true,
    xpAwarded: 0,
    xpAwardedAt: null,
    ...progressValues,
  }, () => { state.progressSaves += 1; });
  const makeTransaction = (id, parent = null) => ({
    id,
    parent,
    LOCK: { UPDATE: "UPDATE" },
    finished: false,
  });
  const callerTransaction = makeTransaction("caller");
  const snapshot = () => ({
    xpTotal: user.xpTotal,
    xpAwarded: progress.xpAwarded,
    xpAwardedAt: progress.xpAwardedAt,
    ledgers: [...state.ledgers],
  });
  const restore = (before) => {
    user.xpTotal = before.xpTotal;
    progress.xpAwarded = before.xpAwarded;
    progress.xpAwardedAt = before.xpAwardedAt;
    state.ledgers.splice(0, state.ledgers.length, ...before.ledgers);
  };
  const database = {
    async transaction(optionsOrCallback, maybeCallback) {
      if (typeof optionsOrCallback === "function") {
        state.outerTransactions += 1;
        const transaction = makeTransaction(`outer-${state.outerTransactions}`);
        const before = snapshot();
        try {
          return await optionsOrCallback(transaction);
        } catch (error) {
          restore(before);
          throw error;
        } finally {
          transaction.finished = true;
        }
      }
      state.savepoints += 1;
      const savepoint = makeTransaction(
        `savepoint-${state.savepoints}`,
        optionsOrCallback.transaction,
      );
      const before = snapshot();
      try {
        return await maybeCallback(savepoint);
      } catch (error) {
        restore(before);
        const afterRollback = state.afterRollback;
        state.afterRollback = null;
        afterRollback?.();
        throw error;
      } finally {
        savepoint.finished = true;
      }
    },
  };
  const models = {
    GameInterruptionCompletionEvidence: {
      async findOne(options) {
        state.evidenceQueries += 1;
        const row = evidenceRow;
        return row
          && Number(row.id) === Number(options.where.id)
          && Number(row.studentId) === Number(options.where.studentId)
          && row.levelKey === options.where.levelKey
          ? row
          : null;
      },
    },
    XpTransaction: {
      async findAll(options) {
        state.ledgerQueries += 1;
        const alternatives = options.where[Op.or];
        return state.ledgers.filter((item) => alternatives.some((where) => (
          Object.entries(where).every(([key, value]) => String(item[key]) === String(value))
        )));
      },
      async create(values, options) {
        state.ledgerCreates += 1;
        assert.ok(options.transaction.parent, "ledger creation must use a savepoint");
        if (state.uniqueWinner) {
          const winner = state.uniqueWinner;
          state.uniqueWinner = null;
          state.afterRollback = () => {
            state.ledgers.push(record({ id: 90, ...values, ...winner.ledger }));
            user.xpTotal = winner.userXpTotal;
            progress.xpAwarded = winner.progressXpAwarded;
            progress.xpAwardedAt = winner.progressXpAwardedAt;
          };
          throw Object.assign(new Error("duplicate XP reward"), {
            name: "SequelizeUniqueConstraintError",
            constraint: winner.constraint ?? "xp_transactions_reward_once",
          });
        }
        const created = record({ id: state.nextLedgerId++, ...values });
        state.ledgers.push(created);
        return created;
      },
    },
  };
  const awardCompletionXpFromEvidence = createEvidenceAwareCompletionXpAwarder({
    database,
    models,
    now: () => PROCESSED_AT,
  });
  const input = (overrides = {}) => ({
    userId: 11,
    levelKey: LEVEL_KEY,
    completionEvidenceId: 40,
    user,
    progress,
    ...overrides,
  });
  return {
    awardCompletionXpFromEvidence,
    callerTransaction,
    database,
    input,
    progress,
    state,
    user,
  };
};

const award = (harness, overrides = {}) => harness.awardCompletionXpFromEvidence(
  harness.input(overrides),
  { transaction: harness.callerTransaction },
);

const rejectsIntegrity = (promise) => assert.rejects(
  promise,
  (error) => error instanceof GamificationError
    && error.code === "XP_AWARD_INTEGRITY_ERROR"
    && error.message === "Completion XP could not be processed",
);

test("evidence-aware XP awards positive and partial net amounts with exact breakdowns", async () => {
  const full = createHarness({ evidenceRow: evidence({ xpDeduction: 0, netCompletionXp: 25 }) });
  const fullResult = await award(full);
  assert.equal(fullResult.changed, true);
  assert.equal(fullResult.xpGrantedNow, 25);
  assert.equal(fullResult.completionAward.netAmount, 25);
  assert.equal(full.user.xpTotal, 125);

  const partial = createHarness();
  const result = await award(partial);
  assert.deepEqual(result, {
    changed: true,
    xpGrantedNow: 15,
    totalXp: 115,
    processedAt: PROCESSED_AT,
    completionAward: {
      evidenceId: 40,
      grossAmount: 25,
      deductionAmount: 10,
      netAmount: 15,
      breakdown: [
        { key: "grossCompletionXp", label: "Gross completion XP", amount: 25 },
        { key: "interruptionDeduction", label: "Interruption deduction", amount: -10 },
      ],
    },
  });
  assert.equal(result.completionAward.breakdown.reduce((sum, item) => sum + item.amount, 0), 15);
  assert.equal(partial.state.ledgers.length, 1);
  assert.equal(partial.state.ledgers[0].amount, 15);
  assert.equal(partial.state.ledgers[0].completionEvidenceId, 40);
  assert.equal(partial.state.ledgers[0].metadata.grossCompletionXp, 25);
  assert.equal(partial.state.ledgers[0].metadata.interruptionXpDeduction, 10);
  assert.equal(partial.user.xpTotal, 115);
  assert.equal(partial.progress.xpAwarded, 15);
  assert.equal(partial.progress.xpAwardedAt, PROCESSED_AT);
  assert.equal(partial.state.outerTransactions, 0);
});

test("zero-net evidence records processing without a ledger or balance change", async () => {
  const harness = createHarness({
    evidenceRow: evidence({ xpDeduction: 25, netCompletionXp: 0 }),
  });
  const first = await award(harness);
  assert.equal(first.changed, true);
  assert.equal(first.xpGrantedNow, 0);
  assert.equal(first.completionAward.netAmount, 0);
  assert.equal(first.completionAward.breakdown.reduce((sum, item) => sum + item.amount, 0), 0);
  assert.equal(harness.user.xpTotal, 100);
  assert.equal(harness.state.userSaves, 0);
  assert.equal(harness.state.ledgers.length, 0);
  assert.equal(harness.progress.xpAwarded, 0);
  assert.equal(harness.progress.xpAwardedAt, PROCESSED_AT);

  const retry = await award(harness);
  assert.equal(retry.changed, false);
  assert.equal(retry.xpGrantedNow, 0);
  assert.equal(retry.completionAward.grossAmount, 25);
  assert.equal(harness.state.progressSaves, 1);
  assert.equal(harness.state.ledgers.length, 0);
});

test("matching positive retries do not increment twice and uniqueness anomalies fail closed", async () => {
  const matching = createHarness({
    ledgers: [ledger()],
    userValues: { xpTotal: 115 },
    progressValues: { xpAwarded: 15, xpAwardedAt: PROCESSED_AT },
  });
  const retry = await award(matching);
  assert.equal(retry.changed, false);
  assert.equal(retry.xpGrantedNow, 0);
  assert.equal(retry.completionAward.netAmount, 15);
  assert.equal(matching.user.xpTotal, 115);
  assert.equal(matching.state.userSaves, 0);
  assert.equal(matching.state.progressSaves, 0);

  const raced = createHarness({
    uniqueWinner: {
      ledger: {},
      userXpTotal: 115,
      progressXpAwarded: 15,
      progressXpAwardedAt: PROCESSED_AT,
    },
  });
  await rejectsIntegrity(award(raced));
  assert.equal(raced.user.xpTotal, 115);
  assert.equal(raced.state.ledgers.length, 1);
  assert.equal(raced.state.savepoints, 1);
  assert.equal(raced.state.ledgerQueries, 2);
});

test("wrong evidence identity and inconsistent ledgers fail neutrally without writes", async () => {
  for (const evidenceRow of [
    null,
    evidence({ studentId: 12 }),
    evidence({ levelKey: "tutorial-level-2" }),
    evidence({ grossCompletionXp: 25, xpDeduction: 9, netCompletionXp: 15 }),
  ]) {
    const harness = createHarness({ evidenceRow });
    await rejectsIntegrity(award(harness));
    assert.equal(harness.state.ledgers.length, 0);
    assert.equal(harness.state.userSaves, 0);
    assert.equal(harness.state.progressSaves, 0);
  }

  for (const inconsistent of [
    ledger({ amount: 14 }),
    ledger({ userId: 12 }),
    ledger({ referenceId: "tutorial-level-2" }),
    ledger({ kind: "other" }),
    ledger({ completionEvidenceId: null }),
  ]) {
    const harness = createHarness({ ledgers: [inconsistent] });
    await rejectsIntegrity(award(harness));
    assert.equal(harness.user.xpTotal, 100);
    assert.equal(harness.state.userSaves, 0);
    assert.equal(harness.state.progressSaves, 0);
  }
});

test("locked context is required and caller rollback restores XP, progress, and ledger", async () => {
  const missingTransaction = createHarness();
  await assert.rejects(
    missingTransaction.awardCompletionXpFromEvidence(missingTransaction.input()),
    /caller-owned transaction/i,
  );

  const wrongProgress = createHarness();
  await assert.rejects(
    award(wrongProgress, {
      progress: record({
        id: 5,
        userId: 11,
        levelKey: "tutorial-level-2",
        isCompleted: true,
        xpAwarded: 0,
        xpAwardedAt: null,
      }),
    }),
    /locked XP context/i,
  );

  const rollback = createHarness();
  await assert.rejects(
    rollback.database.transaction(async (transaction) => {
      await rollback.awardCompletionXpFromEvidence(
        rollback.input(),
        { transaction },
      );
      throw new Error("caller rollback");
    }),
    /caller rollback/,
  );
  assert.equal(rollback.user.xpTotal, 100);
  assert.equal(rollback.progress.xpAwarded, 0);
  assert.equal(rollback.progress.xpAwardedAt, null);
  assert.equal(rollback.state.ledgers.length, 0);
});
