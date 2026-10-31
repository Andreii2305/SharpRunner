const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const { test } = require("node:test");

const {
  GameInterruptionEventError,
  createGameInterruptionEventService,
} = require("../src/services/gameInterruptionEventService");

const createRecord = (values) => ({
  ...values,
  get() { return { ...this }; },
  async save() { return this; },
});

const currentSession = (overrides = {}) => createRecord({
  id: 70,
  studentId: 11,
  classroomId: 25,
  levelKey: "tutorial-level-1",
  sessionKey: "session_key_1234",
  lifecycleStatus: "CURRENT",
  startedAt: new Date("2026-10-29T00:00:00.000Z"),
  supersededAt: null,
  completedAt: null,
  ...overrides,
});

const createHarness = ({
  access = { allowed: true, reason: null },
  actor = { id: 11, role: "student", status: "active" },
  classroom = { id: 25, isActive: true },
  membership = { id: 3, classroomId: 25, studentId: 11, status: "active" },
  progress = { id: 5, userId: 11, levelKey: "tutorial-level-1", isCompleted: false },
  sessions = [currentSession()],
  events = [],
  failCreate = null,
} = {}) => {
  const calls = [];
  const state = {
    progress: progress ? createRecord(progress) : null,
    sessions: sessions.map((row) => createRecord(row)),
    events: events.map((row) => createRecord(row)),
    failCreate,
    nextId: 100,
    transactionCount: 0,
  };
  let userLockTail = Promise.resolve();

  const database = {
    async transaction(optionsOrCallback, maybeCallback) {
      if (typeof optionsOrCallback !== "function") {
        try {
          return await maybeCallback(optionsOrCallback.transaction);
        } catch (error) {
          const afterRollback = state.afterRollback;
          state.afterRollback = null;
          afterRollback?.();
          throw error;
        }
      }
      state.transactionCount += 1;
      const tx = {
        id: state.transactionCount,
        LOCK: { UPDATE: "UPDATE" },
        releaseUserLock: null,
      };
      const originalEvents = [...state.events];
      try {
        return await optionsOrCallback(tx);
      } catch (error) {
        state.events.splice(0, state.events.length, ...originalEvents);
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
        calls.push(["session", options.where, options]);
        return state.sessions.find((row) => Object.entries(options.where).every(
          ([key, value]) => String(row[key]) === String(value),
        )) ?? null;
      },
    },
    GameInterruptionEvent: {
      async findAll(options) {
        calls.push(["events", options.where, options]);
        const keys = options.where.eventKey?.[Op.in] ?? [];
        return state.events.filter((row) => (
          Number(row.studentId) === Number(options.where.studentId)
          && keys.includes(row.eventKey)
        ));
      },
      async findOne(options) {
        calls.push(["event", options.where, options]);
        return state.events.find((row) => Object.entries(options.where).every(
          ([key, value]) => String(row[key]) === String(value),
        )) ?? null;
      },
      async create(values, options) {
        calls.push(["event-create", values, options]);
        if (state.failCreate) {
          throw typeof state.failCreate === "function"
            ? state.failCreate(state)
            : state.failCreate;
        }
        const duplicate = state.events.find((row) => (
          Number(row.studentId) === Number(values.studentId) && row.eventKey === values.eventKey
        ));
        if (duplicate) {
          throw Object.assign(new Error("duplicate event key"), {
            name: "SequelizeUniqueConstraintError",
            constraint: "game_interruption_events_student_key",
          });
        }
        const row = createRecord({
          id: state.nextId++,
          ...values,
          createdAt: new Date("2026-10-29T00:06:00.000Z"),
          updatedAt: new Date("2026-10-29T00:06:00.000Z"),
        });
        state.events.push(row);
        return row;
      },
    },
  };

  const service = createGameInterruptionEventService({
    database,
    models,
    levelAccessLoader: async (input) => {
      calls.push(["access", input]);
      return access;
    },
    levelSettingsLoader: async (classroomId, options) => {
      calls.push(["settings", classroomId, options]);
      return [{ levelKey: "tutorial-level-1" }];
    },
    now: () => new Date("2026-10-29T00:05:00.000Z"),
  });

  const useSharedLocks = (mutation) => database.transaction(async (transaction) => {
    const lock = transaction.LOCK.UPDATE;
    await models.Classroom.findByPk(25, { transaction, lock });
    await models.ClassroomMembership.findOne({
      where: { classroomId: 25, studentId: 11 }, transaction, lock,
    });
    await models.User.findByPk(11, { transaction, lock });
    const lockedProgress = await models.UserProgress.findOne({
      where: { userId: 11, levelKey: "tutorial-level-1" }, transaction, lock,
    });
    const lockedSession = await models.GameInterruptionSession.findOne({
      where: {
        id: 70, studentId: 11, classroomId: 25, levelKey: "tutorial-level-1",
      },
      transaction,
      lock,
    });
    await mutation({ lockedProgress, lockedSession });
  });

  return { calls, database, models, service, state, useSharedLocks };
};

const eventInput = (overrides = {}) => ({
  actorId: 11,
  actorRole: "student",
  classroomId: 25,
  levelKey: "tutorial-level-1",
  sessionId: 70,
  eventKey: "event_key_12345",
  eventType: "hidden",
  ...overrides,
});

const rejectsWith = async (promise, status, code, message) => assert.rejects(
  promise,
  (error) => error instanceof GameInterruptionEventError
    && error.status === status
    && error.code === code
    && (!message || error.message === message),
);

test("records both allowed event types with server-owned receipt and unapplied fields", async () => {
  const harness = createHarness();
  const hidden = await harness.service.recordInterruptionEvent(eventInput({
    studentId: 999,
    receivedAt: new Date("2000-01-01T00:00:00.000Z"),
    appliedScoreDeduction: 100,
    appliedXpDeduction: 100,
  }));
  const fullscreen = await harness.service.recordInterruptionEvent(eventInput({
    eventKey: "event_key_67890",
    eventType: "fullscreen_exit",
  }));

  assert.deepEqual(hidden, {
    changed: true,
    event: {
      id: 100,
      sessionId: 70,
      classroomId: 25,
      levelKey: "tutorial-level-1",
      eventType: "hidden",
      receivedAt: new Date("2026-10-29T00:05:00.000Z"),
    },
  });
  assert.equal(fullscreen.event.eventType, "fullscreen_exit");
  assert.equal(harness.state.events.length, 2);
  assert.equal(harness.state.events[0].appliedAt, null);
  assert.equal(harness.state.events[0].appliedScoreDeduction, null);
  assert.equal(harness.state.events[0].appliedXpDeduction, null);
  assert.equal("eventKey" in hidden.event, false);
  assert.equal("studentId" in hidden.event, false);
});

test("validates exact identity, event type, keys, active scope, and authoritative access", async () => {
  for (const [input, code] of [
    [{ actorId: 0 }, "INVALID_REQUEST"],
    [{ classroomId: Number.MAX_SAFE_INTEGER + 1 }, "INVALID_REQUEST"],
    [{ sessionId: "1e2" }, "INVALID_REQUEST"],
    [{ levelKey: "not-a-level" }, "INVALID_LEVEL_KEY"],
    [{ eventKey: "short" }, "INVALID_EVENT_KEY"],
    [{ eventType: "blur" }, "INVALID_EVENT_TYPE"],
  ]) {
    const harness = createHarness();
    await rejectsWith(harness.service.recordInterruptionEvent(eventInput(input)), 400, code);
    assert.equal(harness.state.events.length, 0);
  }

  await rejectsWith(
    createHarness().service.recordInterruptionEvent(eventInput({ actorRole: "teacher" })),
    403,
    "FORBIDDEN",
  );
  await rejectsWith(
    createHarness({ classroom: { id: 25, isActive: false } })
      .service.recordInterruptionEvent(eventInput()),
    409,
    "CLASSROOM_INACTIVE",
  );
  await rejectsWith(
    createHarness({ membership: { id: 3, classroomId: 25, studentId: 11, status: "removed" } })
      .service.recordInterruptionEvent(eventInput()),
    403,
    "FORBIDDEN",
  );
  await rejectsWith(
    createHarness({ actor: { id: 11, role: "student", status: "inactive" } })
      .service.recordInterruptionEvent(eventInput()),
    403,
    "FORBIDDEN",
  );
  await rejectsWith(
    createHarness({ access: { allowed: false, reason: "LEVEL_DISABLED" } })
      .service.recordInterruptionEvent(eventInput()),
    403,
    "LEVEL_DISABLED",
  );
  await rejectsWith(
    createHarness().service.recordInterruptionEvent(eventInput({ sessionId: 71 })),
    404,
    "SESSION_NOT_FOUND",
  );
});

test("matching retries preserve receipt and application data after supersession or completion", async () => {
  const existing = createRecord({
    id: 90,
    sessionId: 70,
    studentId: 11,
    eventKey: "event_key_12345",
    eventType: "hidden",
    receivedAt: new Date("2026-10-28T10:00:00.000Z"),
    appliedAt: new Date("2026-10-28T11:00:00.000Z"),
    appliedScoreDeduction: "1.00",
    appliedXpDeduction: 10,
  });
  const harness = createHarness({
    progress: { id: 5, userId: 11, levelKey: "tutorial-level-1", isCompleted: true },
    sessions: [currentSession({
      lifecycleStatus: "SUPERSEDED",
      supersededAt: new Date("2026-10-28T12:00:00.000Z"),
    })],
    events: [existing],
  });

  const result = await harness.service.recordInterruptionEvent(eventInput());
  assert.equal(result.changed, false);
  assert.equal(result.event.id, 90);
  assert.equal(result.event.receivedAt.toISOString(), "2026-10-28T10:00:00.000Z");
  assert.equal(harness.state.events[0].appliedScoreDeduction, "1.00");
  assert.equal(harness.state.events.length, 1);
});

test("matching terminal retries still require current classroom and level authorization", async () => {
  const existing = {
    id: 90,
    sessionId: 70,
    studentId: 11,
    eventKey: "event_key_12345",
    eventType: "hidden",
    receivedAt: new Date("2026-10-28T10:00:00.000Z"),
    appliedAt: null,
    appliedScoreDeduction: null,
    appliedXpDeduction: null,
  };
  const denied = createHarness({
    access: { allowed: false, reason: "LEVEL_DISABLED" },
    sessions: [currentSession({
      lifecycleStatus: "SUPERSEDED",
      supersededAt: new Date("2026-10-28T12:00:00.000Z"),
    })],
    events: [existing],
  });
  await rejectsWith(
    denied.service.recordInterruptionEvent(eventInput()),
    403,
    "LEVEL_DISABLED",
  );
  assert.equal(denied.state.events.length, 1);

  const removed = createHarness({
    membership: { id: 3, classroomId: 25, studentId: 11, status: "removed" },
    sessions: [currentSession({
      lifecycleStatus: "SUPERSEDED",
      supersededAt: new Date("2026-10-28T12:00:00.000Z"),
    })],
    events: [existing],
  });
  await rejectsWith(
    removed.service.recordInterruptionEvent(eventInput()),
    403,
    "FORBIDDEN",
  );
});

test("new events reject terminal sessions and completed progress", async () => {
  await rejectsWith(
    createHarness({ sessions: [currentSession({
      lifecycleStatus: "SUPERSEDED", supersededAt: new Date(),
    })] }).service.recordInterruptionEvent(eventInput()),
    409,
    "SESSION_NOT_CURRENT",
  );
  await rejectsWith(
    createHarness({
      progress: { id: 5, userId: 11, levelKey: "tutorial-level-1", isCompleted: true },
    }).service.recordInterruptionEvent(eventInput()),
    409,
    "LEVEL_ALREADY_COMPLETED",
  );
});

test("student-wide key reuse conflicts generically across type or session", async () => {
  const existing = {
    id: 90, sessionId: 71, studentId: 11, eventKey: "event_key_12345",
    eventType: "fullscreen_exit", receivedAt: new Date(), appliedAt: null,
    appliedScoreDeduction: null, appliedXpDeduction: null,
  };
  const harness = createHarness({ events: [existing] });
  await rejectsWith(
    harness.service.recordInterruptionEvent(eventInput()),
    409,
    "EVENT_KEY_CONFLICT",
    "Event key conflict",
  );
  assert.equal(harness.state.events.length, 1);

  const typeConflict = createHarness({ events: [{
    ...existing,
    sessionId: 70,
    eventType: "fullscreen_exit",
  }] });
  await rejectsWith(
    typeConflict.service.recordInterruptionEvent(eventInput()),
    409,
    "EVENT_KEY_CONFLICT",
    "Event key conflict",
  );
});

test("concurrent duplicate submissions create one event", async () => {
  const harness = createHarness();
  const results = await Promise.all([
    harness.service.recordInterruptionEvent(eventInput()),
    harness.service.recordInterruptionEvent(eventInput()),
  ]);
  assert.deepEqual(results.map((result) => result.changed).sort(), [false, true]);
  assert.equal(harness.state.events.length, 1);
});

test("shared lock order serializes events against replacement and completion", async () => {
  const replacement = createHarness();
  let releaseReplacement;
  let replacementLocked;
  const replacementHasLocks = new Promise((resolve) => { replacementLocked = resolve; });
  const allowReplacement = new Promise((resolve) => { releaseReplacement = resolve; });
  const replacing = replacement.useSharedLocks(async ({ lockedSession }) => {
    replacementLocked();
    await allowReplacement;
    lockedSession.lifecycleStatus = "SUPERSEDED";
    lockedSession.supersededAt = new Date();
  });
  await replacementHasLocks;
  const eventAfterReplacement = replacement.service.recordInterruptionEvent(eventInput());
  releaseReplacement();
  await replacing;
  await rejectsWith(
    eventAfterReplacement,
    409,
    "SESSION_NOT_CURRENT",
  );

  const completion = createHarness();
  let releaseCompletion;
  let completionLocked;
  const completionHasLocks = new Promise((resolve) => { completionLocked = resolve; });
  const allowCompletion = new Promise((resolve) => { releaseCompletion = resolve; });
  const completing = completion.useSharedLocks(async ({ lockedProgress }) => {
    completionLocked();
    await allowCompletion;
    lockedProgress.isCompleted = true;
  });
  await completionHasLocks;
  completion.calls.length = 0;
  const eventAfterCompletion = completion.service.recordInterruptionEvent(eventInput());
  releaseCompletion();
  await completing;
  await rejectsWith(
    eventAfterCompletion,
    409,
    "LEVEL_ALREADY_COMPLETED",
  );

  assert.deepEqual(
    completion.calls.slice(0, 5).map((call) => call[0]),
    ["classroom", "membership", "user", "progress", "session"],
  );

  const eventWins = createHarness();
  await eventWins.service.recordInterruptionEvent(eventInput());
  await eventWins.useSharedLocks(async ({ lockedSession }) => {
    lockedSession.lifecycleStatus = "SUPERSEDED";
    lockedSession.supersededAt = new Date();
  });
  assert.equal(eventWins.state.events.length, 1);
});

test("creation failure rolls back and optional outer transactions do not independently commit", async () => {
  const failure = createHarness({ failCreate: new Error("database unavailable") });
  await assert.rejects(
    failure.service.recordInterruptionEvent(eventInput()),
    /database unavailable/,
  );
  assert.equal(failure.state.events.length, 0);

  const shared = createHarness();
  await shared.database.transaction((transaction) => (
    shared.service.recordInterruptionEvent(eventInput(), { transaction })
  ));
  assert.equal(shared.state.transactionCount, 1);
  assert.equal(shared.state.events.length, 1);
});

test("intended unique-key recovery uses the parent transaction and returns the committed match", async () => {
  const uniqueError = Object.assign(new Error("duplicate"), {
    name: "SequelizeUniqueConstraintError",
    constraint: "game_interruption_events_student_key",
  });
  const harness = createHarness({ failCreate: () => {
    harness.state.afterRollback = () => {
      harness.state.failCreate = null;
      harness.state.events.push(createRecord({
        id: 90,
        sessionId: 70,
        studentId: 11,
        eventKey: "event_key_12345",
        eventType: "hidden",
        receivedAt: new Date("2026-10-29T00:05:00.000Z"),
        appliedAt: null,
        appliedScoreDeduction: null,
        appliedXpDeduction: null,
      }));
    };
    return uniqueError;
  } });

  const result = await harness.service.recordInterruptionEvent(eventInput());
  assert.equal(result.changed, false);
  assert.equal(result.event.id, 90);
  assert.equal(harness.state.events.length, 1);
});
