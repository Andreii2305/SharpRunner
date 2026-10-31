const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  GameInterruptionSessionError,
  createGameInterruptionSessionService,
} = require("../src/services/gameInterruptionSessionService");

const createRecord = (values) => ({
  ...values,
  get() { return { ...this }; },
  async save() { return this; },
});

const createHarness = ({
  access = { allowed: true, reason: null },
  actor = { id: 11, role: "student", status: "active" },
  classroom = { id: 25, isActive: true },
  membership = { id: 3, classroomId: 25, studentId: 11, status: "active" },
  progress = { id: 5, userId: 11, levelKey: "tutorial-level-1", isCompleted: false },
  settings = { interruptionScoreDeduction: 1, interruptionXpDeduction: 10 },
  sessions = [],
  failCreate = null,
} = {}) => {
  const calls = [];
  const state = {
    sessions: sessions.map((row) => createRecord(row)),
    settings: { ...settings },
    progress: progress ? createRecord(progress) : null,
    failCreate,
    nextId: 100,
  };
  let transactionId = 0;
  let userLockTail = Promise.resolve();

  const database = {
    async transaction(optionsOrCallback, maybeCallback) {
      if (typeof optionsOrCallback !== "function") {
        return maybeCallback(optionsOrCallback.transaction);
      }
      const callback = optionsOrCallback;
      const tx = {
        id: ++transactionId,
        LOCK: { UPDATE: "UPDATE" },
        releaseUserLock: null,
      };
      const originalRows = [...state.sessions];
      const snapshots = new Map(originalRows.map((row) => [row, { ...row }]));
      try {
        return await callback(tx);
      } catch (error) {
        state.sessions.splice(0, state.sessions.length, ...originalRows);
        for (const [row, snapshot] of snapshots) Object.assign(row, snapshot);
        const afterRollback = state.afterRollback;
        state.afterRollback = null;
        afterRollback?.();
        throw error;
      } finally {
        tx.releaseUserLock?.();
      }
    },
  };

  const models = {
    Classroom: {
      async findByPk(id, options) {
        calls.push(["classroom", id, options]);
        return Number(id) === Number(classroom?.id) ? createRecord(classroom) : null;
      },
    },
    ClassroomMembership: {
      async findOne(options) {
        calls.push(["membership", options.where, options]);
        return Number(options.where.classroomId) === Number(membership?.classroomId)
          && Number(options.where.studentId) === Number(membership?.studentId)
          ? createRecord(membership)
          : null;
      },
    },
    User: {
      async findByPk(id, options) {
        calls.push(["user", id, options]);
        if (options?.lock && options.transaction && !options.transaction.releaseUserLock) {
          let release;
          const previous = userLockTail;
          userLockTail = new Promise((resolve) => { release = resolve; });
          await previous;
          options.transaction.releaseUserLock = release;
        }
        return Number(id) === Number(actor?.id) ? createRecord(actor) : null;
      },
    },
    UserProgress: {
      async findOne(options) {
        calls.push(["progress", options.where, options]);
        return Number(options.where.userId) === Number(state.progress?.userId)
          && options.where.levelKey === state.progress?.levelKey
          ? state.progress
          : null;
      },
      async findAll(options) {
        calls.push(["progress-list", options.where, options]);
        return state.progress ? [state.progress] : [];
      },
    },
    GameInterruptionSession: {
      async findOne(options) {
        calls.push(["session-find", options.where, options]);
        return state.sessions.find((row) => Object.entries(options.where).every(
          ([key, value]) => String(row[key]) === String(value),
        )) ?? null;
      },
      async create(values, options) {
        calls.push(["session-create", values, options]);
        if (state.failCreate) {
          throw typeof state.failCreate === "function"
            ? state.failCreate(state)
            : state.failCreate;
        }
        const row = createRecord({
          id: state.nextId++,
          ...values,
          supersededAt: null,
          completedAt: null,
          createdAt: new Date("2026-10-29T00:00:00.000Z"),
        });
        state.sessions.push(row);
        return row;
      },
    },
  };

  const service = createGameInterruptionSessionService({
    database,
    models,
    levelAccessLoader: async (input) => {
      calls.push(["access", input]);
      return access;
    },
    levelSettingsLoader: async (classroomId, options) => {
      calls.push(["settings", classroomId, options]);
      return [{ levelKey: "tutorial-level-1", ...state.settings }];
    },
    now: () => new Date("2026-10-29T00:05:00.000Z"),
  });

  const runCompletion = () => database.transaction(async (transaction) => {
    await models.User.findByPk(11, { transaction, lock: transaction.LOCK.UPDATE });
    const row = await models.UserProgress.findOne({
      where: { userId: 11, levelKey: "tutorial-level-1" },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    row.isCompleted = true;
    await row.save({ transaction });
  });

  return { calls, runCompletion, service, state };
};

const startInput = (extra = {}) => ({
  actorId: 11,
  actorRole: "student",
  classroomId: 25,
  levelKey: "tutorial-level-1",
  sessionKey: "session_key_1234",
  ...extra,
});

test("starts a session with server-resolved default or independent zero snapshots", async () => {
  const defaults = createHarness();
  const first = await defaults.service.startInterruptionSession(startInput());
  assert.equal(first.changed, true);
  assert.deepEqual(first.session, {
    id: 100,
    classroomId: 25,
    levelKey: "tutorial-level-1",
    lifecycleStatus: "CURRENT",
    startedAt: new Date("2026-10-29T00:05:00.000Z"),
    supersededAt: null,
    completedAt: null,
    scoreDeductionSnapshot: 1,
    xpDeductionSnapshot: 10,
    createdAt: new Date("2026-10-29T00:00:00.000Z"),
  });

  const zero = createHarness({
    settings: { interruptionScoreDeduction: 0, interruptionXpDeduction: 0 },
  });
  const second = await zero.service.startInterruptionSession(startInput());
  assert.equal(second.session.scoreDeductionSnapshot, 0);
  assert.equal(second.session.xpDeductionSnapshot, 0);
  assert.equal("studentId" in second.session, false);
  assert.equal("sessionKey" in second.session, false);
});

test("matching retry preserves snapshots and timestamps while new settings affect only a new session", async () => {
  const harness = createHarness();
  const first = await harness.service.startInterruptionSession(startInput());
  harness.state.settings = { interruptionScoreDeduction: 2.5, interruptionXpDeduction: 25 };
  const retry = await harness.service.startInterruptionSession(startInput());
  assert.equal(retry.changed, false);
  assert.deepEqual(retry.session, first.session);

  const next = await harness.service.startInterruptionSession(startInput({
    sessionKey: "session_key_5678",
  }));
  assert.equal(next.changed, true);
  assert.equal(next.session.scoreDeductionSnapshot, 2.5);
  assert.equal(next.session.xpDeductionSnapshot, 25);
  assert.equal(harness.state.sessions[0].lifecycleStatus, "SUPERSEDED");
  assert.equal(harness.state.sessions.filter((row) => row.lifecycleStatus === "CURRENT").length, 1);
});

test("superseded matching retry remains idempotent and does not disturb the current session", async () => {
  const harness = createHarness({ sessions: [
    {
      id: 70, studentId: 11, classroomId: 25, levelKey: "tutorial-level-1",
      sessionKey: "session_key_old1", lifecycleStatus: "SUPERSEDED",
      scoreDeductionSnapshot: "1.00", xpDeductionSnapshot: 10,
      startedAt: new Date("2026-10-28T00:00:00.000Z"),
      supersededAt: new Date("2026-10-28T01:00:00.000Z"), completedAt: null,
      createdAt: new Date("2026-10-28T00:00:00.000Z"),
    },
    {
      id: 71, studentId: 11, classroomId: 25, levelKey: "tutorial-level-1",
      sessionKey: "session_key_current", lifecycleStatus: "CURRENT",
      scoreDeductionSnapshot: "2.00", xpDeductionSnapshot: 20,
      startedAt: new Date("2026-10-29T00:00:00.000Z"),
      supersededAt: null, completedAt: null,
      createdAt: new Date("2026-10-29T00:00:00.000Z"),
    },
  ] });
  const result = await harness.service.startInterruptionSession(startInput({
    sessionKey: "session_key_old1",
  }));
  assert.equal(result.changed, false);
  assert.equal(result.session.id, 70);
  assert.equal(harness.state.sessions[1].lifecycleStatus, "CURRENT");
  assert.equal(harness.state.sessions.filter((row) => row.lifecycleStatus === "CURRENT").length, 1);
});

test("conflicting key reuse is generic and does not expose the existing scope", async () => {
  const harness = createHarness({ sessions: [{
    id: 70, studentId: 11, classroomId: 26, levelKey: "arrays-level-1",
    sessionKey: "session_key_1234", lifecycleStatus: "SUPERSEDED",
    scoreDeductionSnapshot: "1.00", xpDeductionSnapshot: 10,
    startedAt: new Date(), supersededAt: new Date(), completedAt: null, createdAt: new Date(),
  }] });
  await assert.rejects(
    harness.service.startInterruptionSession(startInput()),
    (error) => error instanceof GameInterruptionSessionError
      && error.status === 409
      && error.code === "SESSION_KEY_CONFLICT"
      && error.message === "Session key conflict",
  );
});

test("intended key-uniqueness recovery reauthorizes outside the rolled-back transaction", async () => {
  const uniqueError = Object.assign(new Error("duplicate"), {
    name: "SequelizeUniqueConstraintError",
    constraint: "game_interruption_sessions_student_key",
  });
  const harness = createHarness({
    failCreate: (state) => {
      state.afterRollback = () => {
        state.failCreate = null;
        state.sessions.push(createRecord({
          id: 88,
          studentId: 11,
          classroomId: 25,
          levelKey: "tutorial-level-1",
          sessionKey: "session_key_1234",
          lifecycleStatus: "CURRENT",
          scoreDeductionSnapshot: "1.00",
          xpDeductionSnapshot: 10,
          startedAt: new Date("2026-10-29T00:05:00.000Z"),
          supersededAt: null,
          completedAt: null,
          createdAt: new Date("2026-10-29T00:05:00.000Z"),
        }));
      };
      return uniqueError;
    },
  });
  const result = await harness.service.startInterruptionSession(startInput());
  assert.equal(result.changed, false);
  assert.equal(result.session.id, 88);
  const classroomReads = harness.calls.filter((entry) => entry[0] === "classroom");
  assert.equal(classroomReads.length, 2, "authorization must be repeated after rollback");
});

test("matching retry is denied when current authoritative access no longer permits the level", async () => {
  const harness = createHarness({
    access: { allowed: false, reason: "LEVEL_DISABLED" },
    sessions: [{
      id: 70, studentId: 11, classroomId: 25, levelKey: "tutorial-level-1",
      sessionKey: "session_key_1234", lifecycleStatus: "CURRENT",
      scoreDeductionSnapshot: "1.00", xpDeductionSnapshot: 10,
      startedAt: new Date(), supersededAt: null, completedAt: null, createdAt: new Date(),
    }],
  });
  await assert.rejects(
    harness.service.startInterruptionSession(startInput()),
    (error) => error.code === "LEVEL_DISABLED",
  );
  assert.equal(harness.state.sessions[0].lifecycleStatus, "CURRENT");
});

test("validates active student, exact active scope, canonical level, and authoritative access", async () => {
  for (const [options, input, code] of [
    [{ actor: { id: 11, role: "teacher", status: "active" } }, {}, "FORBIDDEN"],
    [{ actor: { id: 11, role: "student", status: "inactive" } }, {}, "FORBIDDEN"],
    [{ classroom: { id: 25, isActive: false } }, {}, "CLASSROOM_INACTIVE"],
    [{ membership: { id: 3, classroomId: 25, studentId: 11, status: "removed" } }, {}, "FORBIDDEN"],
    [{ access: { allowed: false, reason: "LEVEL_LOCKED" } }, {}, "LEVEL_LOCKED"],
    [{}, { levelKey: "not-a-level" }, "INVALID_LEVEL_KEY"],
  ]) {
    const harness = createHarness(options);
    await assert.rejects(
      harness.service.startInterruptionSession(startInput(input)),
      (error) => error instanceof GameInterruptionSessionError && error.code === code,
    );
    assert.equal(harness.state.sessions.length, 0);
  }
});

test("rejects a new globally completed level but permits an authorized matching retry", async () => {
  const completed = { id: 5, userId: 11, levelKey: "tutorial-level-1", isCompleted: true };
  const fresh = createHarness({ progress: completed });
  await assert.rejects(
    fresh.service.startInterruptionSession(startInput()),
    (error) => error.code === "LEVEL_ALREADY_COMPLETED",
  );

  const retry = createHarness({
    progress: completed,
    sessions: [{
      id: 70, studentId: 11, classroomId: 25, levelKey: "tutorial-level-1",
      sessionKey: "session_key_1234", lifecycleStatus: "COMPLETED",
      scoreDeductionSnapshot: "1.00", xpDeductionSnapshot: 10,
      startedAt: new Date("2026-10-28T00:00:00.000Z"), supersededAt: null,
      completedAt: new Date("2026-10-28T01:00:00.000Z"),
      createdAt: new Date("2026-10-28T00:00:00.000Z"),
    }],
  });
  const result = await retry.service.startInterruptionSession(startInput());
  assert.equal(result.changed, false);
  assert.equal(result.session.lifecycleStatus, "COMPLETED");
});

test("concurrent starts serialize through user then progress and leave one current session", async () => {
  const harness = createHarness();
  const [left, right] = await Promise.all([
    harness.service.startInterruptionSession(startInput({ sessionKey: "session_key_left1" })),
    harness.service.startInterruptionSession(startInput({ sessionKey: "session_key_right" })),
  ]);
  assert.equal(left.changed, true);
  assert.equal(right.changed, true);
  assert.equal(harness.state.sessions.length, 2);
  assert.equal(harness.state.sessions.filter((row) => row.lifecycleStatus === "CURRENT").length, 1);
  const lockNamesByTransaction = new Map();
  for (const entry of harness.calls.filter((item) => item[2]?.lock)) {
    const transactionId = entry[2].transaction.id;
    if (!lockNamesByTransaction.has(transactionId)) lockNamesByTransaction.set(transactionId, []);
    lockNamesByTransaction.get(transactionId).push(entry[0]);
  }
  for (const names of lockNamesByTransaction.values()) {
    assert.deepEqual(names.slice(0, 4), ["classroom", "membership", "user", "progress"]);
  }
});

test("completion and session start share user-before-progress locking", async () => {
  const harness = createHarness();
  const [completion, session] = await Promise.allSettled([
    harness.runCompletion(),
    harness.service.startInterruptionSession(startInput()),
  ]);
  assert.equal(completion.status, "fulfilled");
  if (session.status === "fulfilled") {
    assert.equal(session.value.changed, true);
  } else {
    assert.equal(session.reason.code, "LEVEL_ALREADY_COMPLETED");
  }
  const userLocks = harness.calls.filter((entry) => entry[0] === "user" && entry[2]?.lock);
  const progressLocks = harness.calls.filter((entry) => entry[0] === "progress" && entry[2]?.lock);
  assert.equal(userLocks.length, 2);
  assert.equal(progressLocks.length, 2);
  for (const userLock of userLocks) {
    const transactionId = userLock[2].transaction.id;
    const userIndex = harness.calls.indexOf(userLock);
    const progressIndex = harness.calls.findIndex((entry) => (
      entry[0] === "progress" && entry[2]?.transaction?.id === transactionId
    ));
    assert.ok(userIndex < progressIndex);
  }
});

test("creation failure rolls back supersession and starts no replacement", async () => {
  const current = {
    id: 70, studentId: 11, classroomId: 25, levelKey: "tutorial-level-1",
    sessionKey: "session_key_old1", lifecycleStatus: "CURRENT",
    scoreDeductionSnapshot: "1.00", xpDeductionSnapshot: 10,
    startedAt: new Date(), supersededAt: null, completedAt: null, createdAt: new Date(),
  };
  const harness = createHarness({ sessions: [current], failCreate: new Error("write failed") });
  await assert.rejects(
    harness.service.startInterruptionSession(startInput({ sessionKey: "session_key_new1" })),
    /write failed/,
  );
  assert.equal(harness.state.sessions.length, 1);
  assert.equal(harness.state.sessions[0].lifecycleStatus, "CURRENT");
  assert.equal(harness.state.sessions[0].supersededAt, null);
});
