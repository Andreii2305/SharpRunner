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
  FAILURE_GUIDANCE,
  GLOBAL_FAILURE_GUIDANCE,
  LEVEL_HINT_PROFILES,
} = require("../src/constants/levelSituationalHintCatalog");
const {
  classifyCompilerDiagnostic,
  classifySyntax,
} = require("../src/services/failureClassificationService");
const {
  getProgressiveHintStage,
  resolvePersonalizedHint,
} = require("../src/services/hintResolverService");
const { validateLevelCode } = require("../src/services/levelCodeValidationService");
const HintFeedback = require("../src/models/HintFeedback");
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

test("every playable challenge has basic guidance and a situational hint profile", () => {
  assert.deepEqual(Object.keys(LEVEL_HINTS).sort(), [...PLAYABLE_LEVEL_KEYS].sort());
  assert.deepEqual(Object.keys(LEVEL_HINT_PROFILES).sort(), [...PLAYABLE_LEVEL_KEYS].sort());

  const basicHints = new Set();
  for (const levelKey of PLAYABLE_LEVEL_KEYS) {
    const hint = LEVEL_HINTS[levelKey];
    const profile = LEVEL_HINT_PROFILES[levelKey];
    assert.ok(hint.learningObjective.length >= 20, `${levelKey} objective is too short`);
    assert.ok(hint.basicHint.length >= 45, `${levelKey} basic hint is too generic`);
    assert.ok(profile.location.length >= 20, `${levelKey} needs a specific place to inspect`);
    assert.ok(profile.supportedFailureCodes.length >= 3, `${levelKey} needs multiple failure cases`);
    for (const failureCode of profile.supportedFailureCodes) {
      assert.ok(
        FAILURE_GUIDANCE[failureCode] || GLOBAL_FAILURE_GUIDANCE[failureCode],
        `${levelKey} has no guidance for ${failureCode}`,
      );
    }
    basicHints.add(hint.basicHint);
  }
  assert.equal(basicHints.size, PLAYABLE_LEVEL_KEYS.length);
});

test("compiler failures are classified before challenge logic", () => {
  assert.equal(
    classifySyntax("class Program {\nstatic void Main() {\nint value = 1\n}\n}")?.failureCode,
    "COMPILER_MISSING_SEMICOLON",
  );
  assert.equal(
    classifySyntax("class Program { static void Main() {")?.failureCode,
    "COMPILER_UNMATCHED_DELIMITER",
  );
  assert.equal(
    classifyCompilerDiagnostic({ errorType: "compiler", stderr: "error CS0103: The name 'total' does not exist in the current context" })?.failureCode,
    "COMPILER_UNKNOWN_NAME",
  );
});

test("different mistakes on the same level resolve to different personalized hints", async () => {
  const source = (assignment) => `
    using System;
    class Program {
      static void Main(string[] args) {
        string[] flames = { "normal", "normal", "boss", "normal" };
        ${assignment}
      }
    }
  `;
  const wrongIndex = await validateLevelCode({
    levelKey: "arrays-level-3",
    sourceCode: source("string attack = flames[3];"),
  });
  const hardcoded = await validateLevelCode({
    levelKey: "arrays-level-3",
    sourceCode: source('string attack = "boss";'),
  });
  const correct = await validateLevelCode({
    levelKey: "arrays-level-3",
    sourceCode: source("string attack = flames[2];"),
  });

  assert.equal(wrongIndex.failureCode, "WRONG_ARRAY_INDEX");
  assert.equal(hardcoded.failureCode, "HARDCODED_RESULT");
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.failureCode, undefined);

  const indexHint = resolvePersonalizedHint({
    levelKey: "arrays-level-3",
    failureCode: wrongIndex.failureCode,
    category: wrongIndex.category,
  });
  const hardcodedHint = resolvePersonalizedHint({
    levelKey: "arrays-level-3",
    failureCode: hardcoded.failureCode,
    category: hardcoded.category,
  });
  assert.notEqual(indexHint.text, hardcodedHint.text);
  assert.match(indexHint.text, /index/i);
  assert.match(hardcodedHint.text, /bypasses|literal/i);
});

test("unknown failures use a level-specific fallback and continued failure strengthens guidance", () => {
  const fallback = resolvePersonalizedHint({
    levelKey: "functions-level-10",
    failureCode: "UNRECOGNIZED_CASE",
    category: "unknown",
  });
  const initial = resolvePersonalizedHint({
    levelKey: "arrays-level-7",
    failureCode: "WRONG_LOOP_BOUNDS",
    category: "wrong_logic",
    stage: "personalized",
  });
  const stronger = resolvePersonalizedHint({
    levelKey: "arrays-level-7",
    failureCode: "WRONG_LOOP_BOUNDS",
    category: "wrong_logic",
    stage: "stronger",
  });
  assert.equal(fallback.fallbackUsed, true);
  assert.match(fallback.text, /Heal|healing|operator/i);
  assert.notEqual(initial.text, stronger.text);
  assert.equal(stronger.stage, "stronger");
  assert.equal(getProgressiveHintStage({ unlocked: true, attemptCount: 3, purchaseAttemptCount: 3 }), "personalized");
  assert.equal(getProgressiveHintStage({ unlocked: true, attemptCount: 4, purchaseAttemptCount: 3 }), "stronger");
});

test("hint feedback stores no source code and is isolated by user and hint context", () => {
  const attributes = HintFeedback.rawAttributes;
  assert.ok(attributes.userId && attributes.levelKey && attributes.failureCode);
  assert.ok(attributes.hintStage && attributes.helpful && attributes.fallbackUsed && attributes.createdAt);
  assert.equal(attributes.sourceCode, undefined);
  const uniqueIndex = HintFeedback.options.indexes.find((index) => index.unique);
  assert.deepEqual(uniqueIndex.fields, ["userId", "levelKey", "failureCode", "hintStage"]);
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
