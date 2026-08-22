const assert = require("node:assert/strict");
const { test } = require("node:test");
const sequelize = require("../src/config/database");
const User = require("../src/models/User");
const UserProgress = require("../src/models/UserProgress");
const XpTransaction = require("../src/models/XpTransaction");
const { PLAYABLE_LEVEL_KEYS } = require("../src/constants/progressDefaults");
const { DETAILED_HINT_XP_COST } = require("../src/constants/gamificationConfig");
const { LEVEL_HINTS } = require("../src/constants/levelHintCatalog");
const {
  GamificationError,
  purchaseDetailedHint,
} = require("../src/services/gamificationService");

const withStubs = async (stubs, callback) => {
  const originals = stubs.map(([target, property]) => [target, property, target[property]]);
  for (const [target, property, replacement] of stubs) target[property] = replacement;
  try {
    return await callback();
  } finally {
    for (const [target, property, original] of originals) target[property] = original;
  }
};

test("every playable challenge has unique level-specific basic and detailed hints", () => {
  assert.deepEqual(Object.keys(LEVEL_HINTS).sort(), [...PLAYABLE_LEVEL_KEYS].sort());

  const basicHints = new Set();
  const detailedHints = new Set();
  for (const levelKey of PLAYABLE_LEVEL_KEYS) {
    const hint = LEVEL_HINTS[levelKey];
    assert.ok(hint.learningObjective.length >= 20, `${levelKey} objective is too short`);
    assert.ok(hint.basicHint.length >= 45, `${levelKey} basic hint is too generic`);
    assert.ok(hint.detailedHint.length >= 100, `${levelKey} detailed hint lacks depth`);
    assert.ok(!/[{}]|```/.test(hint.detailedHint), `${levelKey} detailed hint contains copy-ready code`);
    basicHints.add(hint.basicHint);
    detailedHints.add(hint.detailedHint);
  }
  assert.equal(basicHints.size, PLAYABLE_LEVEL_KEYS.length);
  assert.equal(detailedHints.size, PLAYABLE_LEVEL_KEYS.length);
});

test("detailed hint purchase deducts the centralized cost and is idempotent", async () => {
  const user = {
    id: 1,
    role: "student",
    xpTotal: 40,
    saveCalls: 0,
    async save() { this.saveCalls += 1; },
  };
  const progress = {
    userId: 1,
    levelKey: "arrays-level-3",
    attemptCount: 3,
    detailedHintUnlocked: false,
    hintUsed: false,
    saveCalls: 0,
    async save() { this.saveCalls += 1; },
  };
  const transactions = [];

  await withStubs([
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
    [User, "findByPk", async () => user],
    [UserProgress, "findOne", async () => progress],
    [XpTransaction, "create", async (values) => { transactions.push(values); return values; }],
  ], async () => {
    const first = await purchaseDetailedHint({
      userId: 1,
      levelKey: progress.levelKey,
      hintsEnabled: true,
      hintUnlockThreshold: 3,
    });
    const retry = await purchaseDetailedHint({
      userId: 1,
      levelKey: progress.levelKey,
      hintsEnabled: true,
      hintUnlockThreshold: 3,
    });

    assert.equal(first.purchased, true);
    assert.equal(retry.alreadyUnlocked, true);
    assert.equal(user.xpTotal, 40 - DETAILED_HINT_XP_COST);
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].amount, -DETAILED_HINT_XP_COST);
    assert.equal(transactions[0].kind, "detailed_hint_purchase");
    assert.equal(progress.hintType, "detailed");
    assert.equal(progress.detailedHintXpCost, DETAILED_HINT_XP_COST);
  });
});

test("purchase rejects locked, teacher-disabled, and insufficient-XP hints", async () => {
  const user = { id: 1, role: "student", xpTotal: 10, save: async () => undefined };
  const progress = {
    userId: 1,
    levelKey: "functions-level-11",
    attemptCount: 2,
    detailedHintUnlocked: false,
    save: async () => undefined,
  };

  await withStubs([
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
    [User, "findByPk", async () => user],
    [UserProgress, "findOne", async () => progress],
  ], async () => {
    await assert.rejects(
      purchaseDetailedHint({ userId: 1, levelKey: progress.levelKey, hintsEnabled: true, hintUnlockThreshold: 3 }),
      (error) => error instanceof GamificationError && error.code === "HINT_LOCKED",
    );

    progress.attemptCount = 3;
    await assert.rejects(
      purchaseDetailedHint({ userId: 1, levelKey: progress.levelKey, hintsEnabled: false, hintUnlockThreshold: 3 }),
      (error) => error instanceof GamificationError && error.code === "HINTS_DISABLED",
    );

    await assert.rejects(
      purchaseDetailedHint({ userId: 1, levelKey: progress.levelKey, hintsEnabled: true, hintUnlockThreshold: 3 }),
      (error) => error instanceof GamificationError
        && error.code === "INSUFFICIENT_XP"
        && error.details.requiredXp === DETAILED_HINT_XP_COST,
    );
  });
});
