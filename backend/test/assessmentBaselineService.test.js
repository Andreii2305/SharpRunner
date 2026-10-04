const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Op } = require("sequelize");

const {
  createAssessmentBaselineService,
  effectivePreBaselineStatus,
  hasMeaningfulLessonGameActivity,
  lessonPlayableLevelKeys,
} = require("../src/services/assessmentBaselineService");
const { PRE_BASELINE_STATUSES } = require("../src/constants/assessmentConfig");

const pristineRow = () => ({
  startedAt: null,
  activeSessionId: null,
  activeSessionStartedAt: null,
  lastHeartbeatAt: null,
  progressPercent: 0,
  attemptCount: 0,
  timeSpentSeconds: 0,
  isCompleted: false,
  completedAt: null,
  finalScore: null,
  hintUsed: false,
  hintUsedAt: null,
  hintType: null,
  attemptCountAtHintUnlock: null,
  detailedHintUnlocked: false,
  detailedHintPurchasedAt: null,
  detailedHintUsedAt: null,
  detailedHintXpCost: null,
  detailedHintAttemptCount: null,
  latestFailureAt: null,
  latestFailureCode: null,
  latestFailureCategory: null,
  latestFailureMetadata: {},
  latestFailureAttemptCount: null,
  xpAwarded: 0,
  xpAwardedAt: null,
});

test("meaningful activity recognizes every authoritative persisted signal", async (t) => {
  const cases = [
    ["startedAt", new Date()],
    ["activeSessionId", "session"],
    ["activeSessionStartedAt", new Date()],
    ["lastHeartbeatAt", new Date()],
    ["progressPercent", 1],
    ["attemptCount", 1],
    ["timeSpentSeconds", 1],
    ["isCompleted", true],
    ["completedAt", new Date()],
    ["finalScore", 0],
    ["hintUsed", true],
    ["hintUsedAt", new Date()],
    ["hintType", "basic"],
    ["attemptCountAtHintUnlock", 0],
    ["detailedHintUnlocked", true],
    ["detailedHintPurchasedAt", new Date()],
    ["detailedHintUsedAt", new Date()],
    ["detailedHintXpCost", 0],
    ["detailedHintAttemptCount", 0],
    ["latestFailureAt", new Date()],
    ["latestFailureCode", "compile"],
    ["latestFailureCategory", "syntax"],
    ["latestFailureMetadata", { line: 3 }],
    ["latestFailureAttemptCount", 0],
    ["xpAwarded", 1],
    ["xpAwardedAt", new Date()],
  ];

  assert.equal(hasMeaningfulLessonGameActivity([pristineRow()]), false);
  assert.equal(hasMeaningfulLessonGameActivity([{ ...pristineRow(), lessonTitle: "Arrays", orderIndex: 6 }]), false);
  for (const [field, value] of cases) {
    await t.test(field, () => {
      assert.equal(hasMeaningfulLessonGameActivity([{ ...pristineRow(), [field]: value }]), true);
    });
  }
});

test("playable lesson keys use the canonical route set", () => {
  assert.deepEqual(lessonPlayableLevelKeys("tutorial"), [
    "tutorial-level-1", "tutorial-level-2", "tutorial-level-3",
    "tutorial-level-4", "tutorial-level-5",
  ]);
  assert.equal(lessonPlayableLevelKeys("arrays").length, 8);
  assert.deepEqual(lessonPlayableLevelKeys("functions"), Array.from(
    { length: 11 },
    (_, index) => `functions-level-${index + 1}`,
  ));
  assert.equal(lessonPlayableLevelKeys("functions").includes("functions-level-12"), false);
  assert.equal(lessonPlayableLevelKeys("functions-with-arrays").length, 4);
  assert.deepEqual(lessonPlayableLevelKeys("final"), ["final-level-1"]);
  assert.deepEqual(lessonPlayableLevelKeys("unknown"), []);
});

const createHarness = ({ rows = [pristineRow()] } = {}) => {
  const calls = { bulkCreate: [], findAll: [] };
  const models = {
    UserProgress: {
      bulkCreate: async (...args) => { calls.bulkCreate.push(args); },
      findAll: async (...args) => { calls.findAll.push(args); return rows; },
    },
  };
  return { calls, service: createAssessmentBaselineService({ models }) };
};

test("creation classification inserts defaults and locks target lesson rows canonically", async () => {
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const { calls, service } = createHarness();
  const status = await service.classifyAtCreation({
    assessment: { type: "PRE", lessonKey: "arrays" },
    studentId: 42,
    transaction,
  });

  assert.equal(status, PRE_BASELINE_STATUSES.VALID);
  assert.equal(calls.bulkCreate.length, 1);
  assert.equal(calls.bulkCreate[0][0].length, 8);
  assert.deepEqual(calls.bulkCreate[0][1], { ignoreDuplicates: true, transaction });
  assert.deepEqual(calls.findAll[0][0], {
    where: { userId: 42, levelKey: { [Op.in]: lessonPlayableLevelKeys("arrays") } },
    order: [["orderIndex", "ASC"]],
    transaction,
    lock: "UPDATE",
  });
});

test("creation classification is retroactive when any locked row has activity", async () => {
  const { service } = createHarness({ rows: [{ ...pristineRow(), finalScore: 0 }] });
  assert.equal(await service.classifyAtCreation({
    assessment: { type: "PRE", lessonKey: "arrays" },
    studentId: 7,
    transaction: { LOCK: { UPDATE: "UPDATE" } },
  }), PRE_BASELINE_STATUSES.RETROACTIVE);
});

test("submission classification is monotonic and conservative", async () => {
  const cases = [
    [PRE_BASELINE_STATUSES.RETROACTIVE, false, PRE_BASELINE_STATUSES.RETROACTIVE],
    [PRE_BASELINE_STATUSES.RETROACTIVE, true, PRE_BASELINE_STATUSES.RETROACTIVE],
    [PRE_BASELINE_STATUSES.VALID, false, PRE_BASELINE_STATUSES.VALID],
    [PRE_BASELINE_STATUSES.VALID, true, PRE_BASELINE_STATUSES.RETROACTIVE],
    [null, false, PRE_BASELINE_STATUSES.UNKNOWN],
    [null, true, PRE_BASELINE_STATUSES.RETROACTIVE],
    [PRE_BASELINE_STATUSES.UNKNOWN, false, PRE_BASELINE_STATUSES.UNKNOWN],
    [PRE_BASELINE_STATUSES.UNKNOWN, true, PRE_BASELINE_STATUSES.RETROACTIVE],
  ];

  for (const [existing, activity, expected] of cases) {
    const rows = [{ ...pristineRow(), attemptCount: activity ? 1 : 0 }];
    const { service } = createHarness({ rows });
    assert.equal(await service.classifyAtSubmission({
      assessment: { type: "PRE", lessonKey: "arrays" },
      attempt: { preBaselineStatus: existing },
      studentId: 8,
      transaction: { LOCK: { UPDATE: "UPDATE" } },
    }), expected, `${existing ?? "NULL"}/${activity}`);
  }
});

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

const createLockAwareRaceHarness = () => {
  const row = pristineRow();
  const waiterQueued = deferred();
  const waiters = [];
  let locked = false;

  const acquire = async () => {
    if (locked) {
      waiterQueued.resolve();
      return new Promise((resolve) => waiters.push(resolve));
    }
    locked = true;
    return () => {
      const next = waiters.shift();
      if (next) next(acquireRelease());
      else locked = false;
    };
  };
  const acquireRelease = () => () => {
    const next = waiters.shift();
    if (next) next(acquireRelease());
    else locked = false;
  };

  const runTransaction = async (work) => {
    const releases = [];
    const transaction = { LOCK: { UPDATE: "UPDATE" }, releases };
    try {
      return await work(transaction);
    } finally {
      for (const release of releases.reverse()) release();
    }
  };

  const service = createAssessmentBaselineService({
    models: {
      UserProgress: {
        bulkCreate: async () => {},
        findAll: async ({ transaction, lock }) => {
          assert.equal(lock, "UPDATE");
          transaction.releases.push(await acquire());
          return [row];
        },
      },
    },
  });

  const recordGameplayActivity = ({ lockedSignal, continueSignal }) => runTransaction(
    async (transaction) => {
      transaction.releases.push(await acquire());
      lockedSignal?.resolve();
      if (continueSignal) await continueSignal.promise;
      row.attemptCount += 1;
    },
  );

  const classifySubmission = (hold = null) => runTransaction(async (transaction) => {
    const status = await service.classifyAtSubmission({
      assessment: { type: "PRE", lessonKey: "arrays" },
      attempt: { preBaselineStatus: PRE_BASELINE_STATUSES.VALID },
      studentId: 8,
      transaction,
    });
    hold?.lockedSignal.resolve();
    if (hold?.continueSignal) await hold.continueSignal.promise;
    return status;
  });

  return {
    classifySubmission,
    recordGameplayActivity,
    row,
    waiterQueued: waiterQueued.promise,
  };
};

test("PRE submission and gameplay activity serialize on the same progress-row lock", async (t) => {
  await t.test("gameplay commit first forces RETROACTIVE", async () => {
    const harness = createLockAwareRaceHarness();
    const gameplayLocked = deferred();
    const allowGameplayCommit = deferred();
    const gameplay = harness.recordGameplayActivity({
      lockedSignal: gameplayLocked,
      continueSignal: allowGameplayCommit,
    });
    await gameplayLocked.promise;

    const classification = harness.classifySubmission();
    await harness.waiterQueued;
    allowGameplayCommit.resolve();

    await gameplay;
    assert.equal(await classification, PRE_BASELINE_STATUSES.RETROACTIVE);
  });

  await t.test("PRE finalization commit first remains VALID", async () => {
    const harness = createLockAwareRaceHarness();
    const baselineLocked = deferred();
    const allowBaselineCommit = deferred();
    const classification = harness.classifySubmission({
      lockedSignal: baselineLocked,
      continueSignal: allowBaselineCommit,
    });
    await baselineLocked.promise;

    const gameplay = harness.recordGameplayActivity({});
    await harness.waiterQueued;
    allowBaselineCommit.resolve();

    assert.equal(await classification, PRE_BASELINE_STATUSES.VALID);
    await gameplay;
    assert.equal(harness.row.attemptCount, 1);
  });
});

test("POST classification returns null without touching progress", async () => {
  const { calls, service } = createHarness();
  assert.equal(await service.classifyAtCreation({
    assessment: { type: "POST", lessonKey: "arrays" },
    studentId: 1,
    transaction: {},
  }), null);
  assert.equal(await service.classifyAtSubmission({
    assessment: { type: "POST", lessonKey: "arrays" },
    attempt: {},
    studentId: 1,
    transaction: {},
  }), null);
  assert.equal(calls.bulkCreate.length, 0);
  assert.equal(calls.findAll.length, 0);
});

test("legacy null resolves UNKNOWN without persistence", () => {
  let saves = 0;
  const attempt = { preBaselineStatus: null, save: () => { saves += 1; } };
  assert.equal(effectivePreBaselineStatus(attempt), PRE_BASELINE_STATUSES.UNKNOWN);
  assert.equal(saves, 0);
});
